package com.bitti06.modplayjs.engine

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import com.bitti06.modplayjs.xr.BuildConfig
import java.net.URL

/**
 * Remote engine catalog.
 *
 * One JSON document lists every engine module - the engine core itself, the
 * mixer, and one package per tracker format - with a version, a size and a
 * SHA-256. The app fetches it, downloads only the files whose hash differs from
 * what is installed, verifies each one and swaps the whole set in at once.
 *
 * This is not about songs. It exists so a new format, a decoder fix or a mixer
 * change can ship without a store update, and so the app can carry fewer
 * decoders than it can play.
 *
 * Schema (all paths relative to the catalog's `baseUrl`):
 *
 * {
 *   "schema": 1,
 *   "apiLevel": 1,
 *   "generated": "2026-11-06T12:00:00.000Z",
 *   "baseUrl": "https://example.org/modplay/engine/",
 *   "engine": { "asset": "engine-core/index.js", "bytes": 23166, "sha256": "…",
 *               "version": "0.2.1" },
 *   "packages": {
 *     "modplayjs-fmt-mo3": { "asset": "modplayjs-fmt-mo3/index.js",
 *                            "bytes": 103916, "sha256": "…", "version": "0.2.1" }
 *   },
 *   "formats": {
 *     "mo3": { "package": "modplayjs-fmt-mo3", "install": "install/mo3.js",
 *              "extensions": ["mo3"] }
 *   }
 * }
 */
object EngineCatalog {

    private const val TAG = "modplay-xr"

    /** A catalog newer than the app's engine API cannot be installed safely. */
    private const val SUPPORTED_SCHEMA = 1

    /** One downloadable file in the catalog. "File" would shadow java.io.File. */
    data class Entry(
        val asset: String,
        val bytes: Long,
        val sha256: String,
        val version: String,
    )

    /** A format bridge: its package, install script and extensions. */
    data class FormatEntry(
        val name: String,
        val packageName: String,
        val install: String,
        val bytes: Long,
        val sha256: String,
        val version: String,
        val extensions: List<String>,
    )

    data class Catalog(
        val schema: Int,
        val apiLevel: Int,
        val generated: String,
        val baseUrl: String,
        val engine: Entry,
        val packages: Map<String, Entry>,
        val formats: Map<String, FormatEntry>,
    ) {
        /**
         * Every file that has to exist on device: the engine, each package and
         * each install bridge.
         */
        val files: Map<String, Entry>
            get() = buildMap {
                put(engine.asset, engine)
                for (entry in packages.values) put(entry.asset, entry)
                for (format in formats.values) {
                    put(
                        format.install,
                        Entry(
                            asset = format.install,
                            bytes = format.bytes,
                            sha256 = format.sha256,
                            version = format.version,
                        ),
                    )
                }
            }
    }

    data class Plan(
        val catalog: Catalog,
        /** Asset path -> download URL, only files that differ from installed. */
        val downloads: Map<String, String>,
        /** Files the current overlay already holds, for the status line. */
        val installedFiles: Int,
    ) {
        val isEmpty: Boolean get() = downloads.isEmpty()
    }

    /** Fetch and parse the catalog. Throws with a readable message on failure. */
    fun fetch(url: String, timeoutMs: Int = 15_000): Catalog {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = timeoutMs
            readTimeout = timeoutMs
            requestMethod = "GET"
            setRequestProperty("Accept", "application/json")
            instanceFollowRedirects = true
        }
        try {
            val code = connection.responseCode
            if (code !in 200..299) error("catalog HTTP $code")
            val text = connection.inputStream.bufferedReader().use { it.readText() }
            return parse(text, url)
        } finally {
            connection.disconnect()
        }
    }

    fun parse(text: String, catalogUrl: String): Catalog {
        val root = JSONObject(text)
        val schema = root.optInt("schema", 0)
        if (schema != SUPPORTED_SCHEMA) error("catalog schema $schema, expected $SUPPORTED_SCHEMA")
        val apiLevel = root.optInt("apiLevel", 0)
        if (apiLevel > EngineModules.API_LEVEL) {
            error("catalog needs engine API $apiLevel, app has ${EngineModules.API_LEVEL}")
        }

        val generated = root.optString("generated")
        // Relative base URLs resolve against the catalog location, so the same
        // document works on a CDN, a GitHub release and a local test server.
        // Assets are relative to the modules root: the default catalog sits in
        // the same directory as `modules/`, so a relative default is enough for
        // a plain static upload, and an absolute baseUrl works for a CDN.
        val base = root.optString("baseUrl").ifBlank { "modules/" }
        val resolvedBase =
            if (base.startsWith("http")) base else URL(URL(catalogUrl), base).toString()
        val baseWithSlash = if (resolvedBase.endsWith('/')) resolvedBase else "$resolvedBase/"

        fun entryOf(obj: JSONObject?): Entry? {
            if (obj == null) return null
            val asset = obj.optString("asset")
            if (asset.isBlank()) return null
            return Entry(
                asset = asset,
                bytes = obj.optLong("bytes", 0),
                sha256 = obj.optString("sha256"),
                version = obj.optString("version"),
            )
        }

        val engine = entryOf(root.optJSONObject("engine"))
            ?: error("catalog has no engine entry")

        val packagesJson = root.optJSONObject("packages") ?: JSONObject()
        val packages = LinkedHashMap<String, Entry>()
        for (name in packagesJson.keys()) {
            entryOf(packagesJson.optJSONObject(name))?.let { packages[name] = it }
        }

        val formatsJson = root.optJSONObject("formats") ?: JSONObject()
        val formats = LinkedHashMap<String, FormatEntry>()
        for (name in formatsJson.keys()) {
            val obj = formatsJson.optJSONObject(name) ?: continue
            val extensions = ArrayList<String>()
            obj.optJSONArray("extensions")?.let { array ->
                for (i in 0 until array.length()) {
                    extensions += array.optString(i).lowercase()
                }
            }
            formats[name] =
                FormatEntry(
                    name = name,
                    packageName = obj.optString("package"),
                    install = obj.optString("install"),
                    bytes = obj.optLong("bytes", 0),
                    sha256 = obj.optString("sha256"),
                    version = obj.optString("version"),
                    extensions = extensions,
                )
        }

        val catalog = Catalog(
            schema = schema,
            apiLevel = apiLevel,
            generated = generated,
            baseUrl = baseWithSlash,
            engine = engine,
            packages = packages,
            formats = formats,
        )
        if (catalog.files.isEmpty()) error("catalog lists no modules")

        // Signature last: everything above decides whether the document is
        // usable, this decides whether it is ours. Both matter, and a failure
        // here must not be recoverable by ignoring a flag.
        SignatureVerifier.verify(root.optString("signature"), catalog)
        return catalog
    }

    /**
     * Which files differ from what is on disk.
     *
     * The installed overlay wins when it has the file; otherwise the APK asset
     * is the reference. A file that is already byte-identical is never
     * downloaded, which is what makes a catalog with one changed format a
     * 30 KB update instead of a 1.3 MB one.
     */
    fun plan(context: Context, catalog: Catalog): Plan {
        // Refuse a downgrade: a catalog older than the APK's own manifest would
        // pin decoders behind the code that ships with the app. The timestamps
        // are ISO-8601 UTC, so a string comparison is a date comparison.
        bundledGenerated(context)?.let { bundled ->
            if (catalog.generated.isNotBlank() && bundled.isNotBlank() &&
                catalog.generated < bundled
            ) {
                error("catalog ${catalog.generated} is older than the app's $bundled")
            }
        }
        val overlay = EngineModules.currentDir(context)
        val downloads = LinkedHashMap<String, String>()
        for ((asset, entry) in catalog.files) {
            val installed = File(overlay, "modules/$asset")
            val upToDate =
                when {
                    installed.isFile ->
                        EngineModules.verify(installed, entry.sha256, entry.bytes)
                    else ->
                        bundledMatches(context, asset, entry)
                }
            if (!upToDate) downloads[asset] = catalog.baseUrl + asset
        }
        return Plan(catalog, downloads, installedFiles(context))
    }

    /** `generated` of the manifest inside the APK, if it has one. */
    private fun bundledGenerated(context: Context): String? =
        runCatching {
            val text =
                context.assets.open("modules/manifest.json").bufferedReader().use { it.readText() }
            JSONObject(text).optString("generated").takeIf { it.isNotBlank() }
        }.getOrNull()

    private fun bundledMatches(context: Context, asset: String, entry: Entry): Boolean {
        if (entry.sha256.isBlank()) return false
        val bytes =
            runCatching {
                context.assets.open("modules/$asset").use { it.readBytes() }
            }.getOrNull() ?: return false
        if (entry.bytes > 0 && bytes.size.toLong() != entry.bytes) return false
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        val actual = digest.digest(bytes).joinToString("") { "%02x".format(it.toInt() and 0xFF) }
        return actual.equals(entry.sha256, ignoreCase = true)
    }

    private fun installedFiles(context: Context): Int =
        EngineModules.currentDir(context).walkTopDown().count { it.isFile }

    /**
     * Download and install the plan.
     *
     * Everything lands in `staging` first and is verified there; only when every
     * file matches its hash is the tree promoted. A dropped connection halfway
     * through leaves the current engine untouched.
     */
    fun install(context: Context, plan: Plan, timeoutMs: Int = 30_000): Boolean {
        if (plan.isEmpty) {
            Log.i(TAG, "engine catalog: nothing to download")
            return true
        }
        val staging = EngineModules.stagingDir(context)
        staging.deleteRecursively()
        val modules = File(staging, "modules")
        if (!modules.mkdirs()) {
            Log.e(TAG, "cannot create $modules")
            return false
        }

        // Seed staging with the files that are not being downloaded, so the
        // promoted tree is complete rather than an overlay of two sources.
        for ((asset, _) in plan.catalog.files) {
            val target = File(modules, asset)
            if (plan.downloads.containsKey(asset)) continue
            target.parentFile?.mkdirs()
            val fromOverlay = File(EngineModules.currentDir(context), "modules/$asset")
            if (fromOverlay.isFile) {
                fromOverlay.copyTo(target, overwrite = true)
            } else {
                runCatching {
                    context.assets.open("modules/$asset").use { input ->
                        target.outputStream().use { input.copyTo(it) }
                    }
                }.onFailure {
                    Log.e(TAG, "missing base file $asset", it)
                    return false
                }
            }
        }

        for ((asset, url) in plan.downloads) {
            val target = File(modules, asset)
            target.parentFile?.mkdirs()
            if (!download(url, target, timeoutMs)) {
                Log.e(TAG, "download failed: $url")
                staging.deleteRecursively()
                return false
            }
            val expected = plan.catalog.files.getValue(asset)
            if (!EngineModules.verify(target, expected.sha256, expected.bytes)) {
                Log.e(TAG, "verification failed: $asset")
                staging.deleteRecursively()
                return false
            }
        }

        // Which app build installed this tree; see EngineModules.overlayRoot.
        File(staging, "owner").writeText(BuildConfig.VERSION_CODE.toString())
        writeManifest(staging, plan.catalog)
        if (!EngineModules.promote(context)) {
            staging.deleteRecursively()
            return false
        }
        Log.i(
            TAG,
            "engine catalog installed: ${plan.downloads.size} files, " +
                "version ${plan.catalog.generated.ifBlank { "unknown" }}",
        )
        return true
    }

    private fun download(url: String, target: File, timeoutMs: Int): Boolean {
        val connection =
            runCatching { URL(url).openConnection() as HttpURLConnection }.getOrNull() ?: return false
        return try {
            connection.connectTimeout = timeoutMs
            connection.readTimeout = timeoutMs
            connection.instanceFollowRedirects = true
            if (connection.responseCode !in 200..299) return false
            connection.inputStream.use { input ->
                target.outputStream().use { output -> input.copyTo(output) }
            }
            true
        } catch (t: Throwable) {
            Log.w(TAG, "download $url: ${t.javaClass.simpleName}: ${t.message}")
            false
        } finally {
            connection.disconnect()
        }
    }

    /**
     * The manifest the loader and [ModuleCatalog] read, in the same shape the
     * build script writes into the APK.
     */
    private fun writeManifest(staging: File, catalog: Catalog) {
        val root = JSONObject()
        root.put("schema", catalog.schema)
        root.put("apiLevel", catalog.apiLevel)
        root.put("generated", catalog.generated)
        root.put("layout", "modules/<name>/index.js")

        val packages = JSONObject()
        val formats = JSONObject()
        for ((asset, entry) in catalog.files) {
            if (!asset.endsWith("/index.js")) continue
            val id = asset.removeSuffix("/index.js")
            packages.put(
                id,
                JSONObject()
                    .put("asset", asset)
                    .put("bytes", entry.bytes)
                    .put("sha256", entry.sha256)
                    .put("version", entry.version),
            )
        }
        for ((name, format) in catalog.formats) {
            val extensions = org.json.JSONArray()
            format.extensions.forEach(extensions::put)
            formats.put(
                name,
                JSONObject()
                    .put("package", format.packageName)
                    .put("install", format.install)
                    .put("bytes", format.bytes)
                    .put("sha256", format.sha256)
                    .put("version", format.version)
                    .put("extensions", extensions),
            )
        }
        root.put("packages", packages)
        root.put("formats", formats)

        val manifest = File(staging, "modules/manifest.json")
        manifest.parentFile?.mkdirs()
        manifest.writeText(root.toString(2))
    }
}
