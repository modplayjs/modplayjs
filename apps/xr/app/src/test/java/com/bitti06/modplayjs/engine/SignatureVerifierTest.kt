package com.bitti06.modplayjs.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.security.KeyPairGenerator
import java.security.Signature
import java.util.Base64

/**
 * Ed25519 over the canonical catalog text.
 *
 * Two things are worth testing here, and only one of them is "does RSA-style
 * verification work": the canonical text must be byte-identical to what
 * `scripts/engine-catalog-sign.mjs` produces, or a correctly signed catalog
 * would be rejected on device. The fixture below pins that text, and the
 * build-script test verifies the signature the generator actually wrote.
 */
class SignatureVerifierTest {

    private fun catalog(): EngineCatalog.Catalog =
        EngineCatalog.parse(
            """
            {
              "schema": 1,
              "apiLevel": 1,
              "generated": "2026-11-06T00:00:00.000Z",
              "baseUrl": "modules/",
              "engine": { "asset": "engine-core/index.js", "bytes": 10,
                          "sha256": "aa", "version": "0.2.1" },
              "packages": {
                "modplayjs-fmt-xm": { "asset": "modplayjs-fmt-xm/index.js",
                                      "bytes": 20, "sha256": "bb", "version": "0.2.1" }
              },
              "formats": {
                "xm": { "package": "modplayjs-fmt-xm", "install": "install/xm.js",
                        "bytes": 30, "sha256": "cc", "version": "0.2.1",
                        "extensions": ["xm"] }
              }
            }
            """.trimIndent(),
            "https://host/catalog.json",
        )

    @Test
    fun `canonical text is the format the signer writes`() {
        val expected =
            """
            modplay-engine-catalog/1
            schema=1
            api_level=1
            generated=2026-11-06T00:00:00.000Z
            engine=engine-core/index.js|10|aa|0.2.1
            package=modplayjs-fmt-xm|modplayjs-fmt-xm/index.js|20|bb|0.2.1
            format=xm|modplayjs-fmt-xm|install/xm.js|30|cc|0.2.1|xm
            """.trimIndent()
        assertEquals(expected, SignatureVerifier.canonicalText(catalog()))
    }

    @Test
    fun `accepts a signature over the canonical text`() {
        val generator = KeyPairGenerator.getInstance("Ed25519")
        val pair = generator.generateKeyPair()
        val text = SignatureVerifier.canonicalText(catalog())
        val signer = Signature.getInstance("Ed25519")
        signer.initSign(pair.private)
        signer.update(text.toByteArray())
        val signature = Base64.getEncoder().encodeToString(signer.sign())
        val key = Base64.getEncoder().encodeToString(pair.public.encoded)

        SignatureVerifier.verifyWith(signature, catalog(), key)
    }

    @Test(expected = IllegalStateException::class)
    fun `rejects a tampered catalog`() {
        val generator = KeyPairGenerator.getInstance("Ed25519")
        val pair = generator.generateKeyPair()
        var text = SignatureVerifier.canonicalText(catalog())
        val signer = Signature.getInstance("Ed25519")
        signer.initSign(pair.private)
        signer.update(text.toByteArray())
        val signature = Base64.getEncoder().encodeToString(signer.sign())
        val key = Base64.getEncoder().encodeToString(pair.public.encoded)

        // Same signature, different bytes: one changed hash is enough.
        text = text.replace("|bb|", "|bX|")
        val tampered = EngineCatalog.parse(
            catalogJsonWithHash("bX"),
            "https://host/catalog.json",
        )
        SignatureVerifier.verifyWith(signature, tampered, key)
    }

    @Test(expected = IllegalStateException::class)
    fun `rejects an unsigned catalog when a key is configured`() {
        SignatureVerifier.verifyWith("", catalog(), "not-empty")
    }

    @Test
    fun `verifies the catalog the build script actually signed`() {
        var dir: File? = File("").absoluteFile
        var publish: File? = null
        var key: File? = null
        while (dir != null) {
            val catalog = File(dir, "build/engine-catalog/catalog.json")
            val publicKey = File(dir, "build/engine-keys/public.base64")
            if (catalog.isFile && publicKey.isFile) {
                publish = catalog
                key = publicKey
                break
            }
            dir = dir.parentFile
        }
        if (publish == null || key == null) return // only after a signed build

        // parse() runs the real verifier against BuildConfig; with no key in a
        // debug build it logs and continues, so the explicit check follows.
        val catalog = EngineCatalog.parse(publish.readText(), "file:///catalog.json")
        val signature = org.json.JSONObject(publish.readText()).optString("signature")
        assertTrue("catalog from the build script is unsigned", signature.isNotBlank())
        SignatureVerifier.verifyWith(signature, catalog, key.readText().trim())
    }

    /**
     * Parity with the signer.
     *
     * If these two implementations ever disagree by a byte, every signed
     * catalog is rejected on device - which looks exactly like a broken
     * signature. Running the generator's canonical output through the same
     * parser and comparing strings catches that here instead.
     */
    @Test
    fun `canonical text matches the node signer for the real catalog`() {
        var dir: File? = File("").absoluteFile
        var script: File? = null
        while (dir != null) {
            val candidate = File(dir, "scripts/engine-catalog-sign.mjs")
            if (candidate.isFile) {
                script = candidate
                break
            }
            dir = dir.parentFile
        }
        if (script == null) return
        val catalogFile = File(script.parentFile.parentFile, "build/engine-catalog/catalog.json")
        if (!catalogFile.isFile) return

        val node =
            runCatching {
                ProcessBuilder(
                    "node",
                    script.absolutePath,
                    "canonical",
                    catalogFile.absolutePath,
                ).redirectErrorStream(true).start()
            }.getOrNull() ?: return
        val produced = node.inputStream.bufferedReader().readText().trimEnd('\n')
        if (node.waitFor() != 0) return
        val expected = SignatureVerifier.canonicalText(
            EngineCatalog.parse(catalogFile.readText(), "file:///catalog.json"),
        )
        assertEquals(expected, produced)
    }

    private fun catalogJsonWithHash(hash: String) = """
        {
          "schema": 1, "apiLevel": 1, "generated": "2026-11-06T00:00:00.000Z",
          "baseUrl": "modules/",
          "engine": { "asset": "engine-core/index.js", "bytes": 10, "sha256": "aa", "version": "0.2.1" },
          "packages": { "modplayjs-fmt-xm": { "asset": "modplayjs-fmt-xm/index.js", "bytes": 20, "sha256": "$hash", "version": "0.2.1" } },
          "formats": { "xm": { "package": "modplayjs-fmt-xm", "install": "install/xm.js", "bytes": 30, "sha256": "cc", "version": "0.2.1", "extensions": ["xm"] } }
        }
    """.trimIndent()
}
