package com.bitti06.modplayjs.engine

import android.util.Log
import com.bitti06.modplayjs.xr.BuildConfig
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

/**
 * Ed25519 signature over the published engine catalog.
 *
 * TLS protects the transport; it does not protect against a compromised CDN, a
 * hijacked release account or a mirror with a valid certificate. The catalog
 * decides which JavaScript ends up in the V8 isolate, so it has to be signed by
 * a key that only the build machine holds.
 *
 * The signature covers a canonical text form, not the raw JSON: key order and
 * whitespace are not stable across JSON writers, and a signature that depends
 * on formatting breaks the moment a tool reformats the file. The generator
 * builds the same text in `scripts/engine-catalog-sign.mjs`:
 *
 * ```
 * modplay-engine-catalog/1
 * schema=1
 * api_level=1
 * generated=2026-11-06T12:00:00.000Z
 * engine=engine-core/index.js|23166|<sha256>|0.2.1
 * package=modplayjs-core|modplayjs-core/index.js|250222|<sha256>|0.2.1
 * format=xm|modplayjs-fmt-xm|install/xm.js|141|<sha256>|0.2.1|xm
 * ```
 *
 * Packages and formats sorted by name, lines joined with "\n", no trailing
 * newline, numbers as plain decimals.
 *
 * `baseUrl` is excluded on purpose: it only says where the bytes come from. A
 * mirror may repoint it, but every file it serves must still match the signed
 * SHA-256, so a redirect can cause a failed update at worst, never a different
 * engine.
 */
object SignatureVerifier {

    private const val TAG = "modplay-xr"
    private const val ALGORITHM = "Ed25519"

    /** Release builds without a public key refuse every catalog. */
    private val publicKeyBase64: String
        get() = BuildConfig.ENGINE_CATALOG_PUBKEY

    val configured: Boolean
        get() = publicKeyBase64.isNotBlank()

    /**
     * Verify, or throw. Called from [EngineCatalog.parse], so an unsigned or
     * tampered catalog never reaches the downloader.
     */
    fun verify(signatureBase64: String, catalog: EngineCatalog.Catalog) =
        verifyWith(signatureBase64, catalog, publicKeyBase64)

    /**
     * The actual check, with the key passed in.
     *
     * Split out so the JVM test can verify a real signature from the build
     * script against the matching public key without baking a test key into
     * BuildConfig.
     */
    fun verifyWith(signatureBase64: String, catalog: EngineCatalog.Catalog, key: String) {
        if (key.isBlank()) {
            if (BuildConfig.DEBUG) {
                // Debug builds without a key can still use a local test server.
                // Release builds are covered by the check below, and the
                // gradle build fails when a release is assembled unsigned.
                Log.w(TAG, "catalog signature NOT verified: no public key in this build")
                return
            }
            error("this build has no catalog public key; refusing an unverified engine")
        }
        if (signatureBase64.isBlank()) {
            error("catalog is not signed")
        }

        val signature = runCatching { Base64.getDecoder().decode(signatureBase64) }
            .getOrElse { error("catalog signature is not valid base64") }

        val publicKey =
            runCatching {
                val der = Base64.getDecoder().decode(key)
                KeyFactory.getInstance(ALGORITHM).generatePublic(X509EncodedKeySpec(der))
            }.getOrElse { error("catalog public key is unusable: ${it.message}") }

        val verifier = Signature.getInstance(ALGORITHM)
        verifier.initVerify(publicKey)
        verifier.update(canonicalText(catalog).toByteArray(Charsets.UTF_8))
        if (!verifier.verify(signature)) {
            error("catalog signature does not match")
        }
        Log.i(TAG, "catalog signature verified (${catalog.packages.size} packages)")
    }

    /** The exact bytes the generator signs. Must stay byte-identical to it. */
    fun canonicalText(catalog: EngineCatalog.Catalog): String {
        val lines = ArrayList<String>(4 + catalog.packages.size + catalog.formats.size)
        lines += "modplay-engine-catalog/1"
        lines += "schema=${catalog.schema}"
        lines += "api_level=${catalog.apiLevel}"
        lines += "generated=${catalog.generated}"
        lines +=
            "engine=" +
            listOf(
                catalog.engine.asset,
                catalog.engine.bytes,
                catalog.engine.sha256,
                catalog.engine.version,
            ).joinToString("|")
        for (name in catalog.packages.keys.sorted()) {
            val p = catalog.packages.getValue(name)
            lines += "package=$name|${p.asset}|${p.bytes}|${p.sha256}|${p.version}"
        }
        for (name in catalog.formats.keys.sorted()) {
            val f = catalog.formats.getValue(name)
            lines +=
                "format=$name|${f.packageName}|${f.install}|${f.bytes}|${f.sha256}|" +
                "${f.version}|${f.extensions.joinToString(",")}"
        }
        return lines.joinToString("\n")
    }
}
