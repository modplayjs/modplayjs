package com.bitti06.modplayjs.engine

import android.content.Context
import android.util.Log
import com.bitti06.modplayjs.xr.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Fetches the engine catalog and installs what changed.
 *
 * Deliberately manual: the app never downloads engine code behind the user's
 * back. Settings shows the installed version and offers "check for updates";
 * everything after the tap runs off the main thread, verifies every file and
 * swaps the set in atomically.
 */
object EngineUpdater {

    private const val TAG = "modplay-xr"

    sealed interface Status {
        data object Idle : Status

        data object Checking : Status

        data class Downloading(val done: Int, val total: Int) : Status

        data class UpToDate(val version: String) : Status

        data class Installed(val files: Int, val version: String) : Status

        data class Failed(val message: String) : Status
    }

    private val _status = MutableStateFlow<Status>(Status.Idle)
    val status: StateFlow<Status> = _status.asStateFlow()

    private var job: Job? = null

    /**
     * Own scope: an update must survive the settings panel being closed, which
     * is exactly when a Compose `rememberCoroutineScope` would cancel it.
     */
    private val scope = CoroutineScope(Dispatchers.IO + Job())

    /** True when a catalog URL is configured at build time or in prefs. */
    fun configured(context: Context): Boolean = catalogUrl(context) != null

    /**
     * Catalog location, in order: the stored override, a pushed text file, the
     * build-time default.
     *
     * The text file exists so a catalog can be pointed at without a rebuild.
     * Two locations are checked because only one of them is reachable from a
     * development machine on current Android:
     *
     * - `filesDir/catalog-url.txt` (internal). `adb shell run-as <pkg> cp` can
     *   write it on a debuggable build, on every Android version.
     * - `<externalFilesDir>/catalog-url.txt`. `adb push` reaches it only once
     *   the app has created the directory itself, and only where adbd is
     *   allowed to write into `Android/data`; a push into a directory that
     *   does not exist yet fails with `secure_mkdirs failed: Permission
     *   denied`, and scoped storage has made that the normal case.
     *
     * Internal first: it is the location that works without assumptions.
     */
    fun catalogUrl(context: Context): String? {
        val stored =
            context.getSharedPreferences("xr", Context.MODE_PRIVATE)
                .getString("engineCatalogUrl", null)
        val pushed =
            pushedText(java.io.File(context.filesDir, "catalog-url.txt"))
                ?: context.getExternalFilesDir(null)?.let {
                    pushedText(java.io.File(it, "catalog-url.txt"))
                }
        val url =
            stored?.takeIf { it.isNotBlank() }
                ?: pushed?.takeIf { it.isNotBlank() }
                ?: BuildConfig.ENGINE_CATALOG_URL
        return url.takeIf { it.isNotBlank() }
    }

    /** Content of a pushed text file, trimmed, or null when absent/blank. */
    private fun pushedText(file: java.io.File): String? =
        runCatching {
            file.takeIf { it.isFile }?.readText()?.trim()?.takeIf { it.isNotBlank() }
        }.getOrNull()

    fun storeCatalogUrl(context: Context, url: String?) {
        context.getSharedPreferences("xr", Context.MODE_PRIVATE)
            .edit()
            .putString("engineCatalogUrl", url?.trim()?.takeIf { it.isNotBlank() })
            .apply()
    }

    /** Installed overlay version, or null when the APK assets are in use. */
    fun installedVersion(context: Context): String? = EngineModules.installedVersion(context)

    fun check(context: Context) {
        val url = catalogUrl(context) ?: run {
            _status.value = Status.Failed("no catalog URL configured")
            return
        }
        job?.cancel()
        job =
            scope.launch {
                _status.value = Status.Checking
                try {
                    val catalog = EngineCatalog.fetch(url)
                    val plan = EngineCatalog.plan(context, catalog)
                    if (plan.isEmpty) {
                        _status.value = Status.UpToDate(catalog.generated)
                        return@launch
                    }
                    _status.value = Status.Downloading(0, plan.downloads.size)
                    if (!EngineCatalog.install(context, plan)) {
                        _status.value = Status.Failed("install failed, see log")
                        return@launch
                    }
                    // Deliberately no ModuleCatalog.reload(): the running V8
                    // isolate still holds the old modules and its cache. Mixing
                    // an overlay engine-core with compiled modules from the APK
                    // is exactly the kind of half state the atomic swap exists
                    // to avoid, so the new set becomes visible on the next
                    // start.
                    _status.value = Status.Installed(plan.downloads.size, catalog.generated)
                    Log.i(TAG, "engine modules updated: ${plan.downloads.size} files")
                } catch (t: Throwable) {
                    Log.w(TAG, "engine catalog: ${t.javaClass.simpleName}: ${t.message}")
                    _status.value = Status.Failed(t.message ?: t.javaClass.simpleName)
                }
            }
    }
}
