package com.bitti06.modplayjs.engine

import android.content.Context
import android.util.Log
import java.io.File
import com.bitti06.modplayjs.xr.BuildConfig
import java.security.MessageDigest

/**
 * Installed engine modules: the app-private tree that wins over the APK assets.
 *
 * Layout under `filesDir/engine-modules`:
 *
 *   current/manifest.json                 what is installed
 *   current/modules/<id>/index.js         module files, same paths as the APK
 *   current/modules/install/<format>.js
 *   previous/...                          last good set, for rollback
 *
 * A published catalog installs into a staging directory, is verified file by
 * file, and only then swaps into `current`. A half-downloaded update never
 * becomes visible to the loader.
 */
object EngineModules {

    private const val TAG = "modplay-xr"

    /** Bumped when the overlay layout or the catalog schema changes. */
    const val API_LEVEL = 1

    private fun root(context: Context) = File(context.filesDir, "engine-modules")

    fun currentDir(context: Context): File = File(root(context), "current")

    fun stagingDir(context: Context): File = File(root(context), "staging")

    fun previousDir(context: Context): File = File(root(context), "previous")

    /**
     * The overlay the V8 loader should search first, or null when nothing is
     * installed. Requires a manifest, so a directory left behind by a failed
     * install is ignored rather than half-used.
     */
    fun overlayRoot(context: Context): String? {
        val current = currentDir(context)
        val manifest = File(current, "modules/manifest.json")
        if (!manifest.isFile) return null
        // After a store update the APK carries a newer engine than the overlay
        // that was downloaded for the previous build. Keeping the overlay would
        // silently pin the old engine, so an overlay installed by another
        // versionCode is dropped once.
        val owner = File(current, "owner")
        val installedBy = runCatching { owner.readText().trim().toInt() }.getOrNull()
        if (installedBy != null && installedBy != BuildConfig.VERSION_CODE) {
            Log.i(TAG, "engine overlay from versionCode $installedBy, app is ${BuildConfig.VERSION_CODE}: dropping")
            discard(context)
            return null
        }
        return current.absolutePath
    }

    /** The overlay's manifest, when an update is installed. */
    fun installedManifest(context: Context): String? {
        val manifest = File(currentDir(context), "modules/manifest.json")
        return runCatching { manifest.takeIf { it.isFile }?.readText() }.getOrNull()
    }

    fun installedVersion(context: Context): String? =
        installedManifest(context)?.let { runCatching { org.json.JSONObject(it).optString("generated") }.getOrNull() }

    /** Remove a broken overlay: the next start falls back to the APK assets. */
    fun discard(context: Context) {
        val current = currentDir(context)
        if (!current.exists()) return
        Log.w(TAG, "discarding engine overlay at ${current.absolutePath}")
        current.deleteRecursively()
    }

    /** Swap staging into current, keeping the old set for one generation. */
    fun promote(context: Context): Boolean {
        val staging = stagingDir(context)
        if (!File(staging, "modules/manifest.json").isFile) {
            Log.e(TAG, "staging has no manifest, not promoting")
            return false
        }
        val current = currentDir(context)
        val previous = previousDir(context)
        previous.deleteRecursively()
        if (current.exists() && !current.renameTo(previous)) {
            Log.e(TAG, "could not move current aside")
            return false
        }
        if (!staging.renameTo(current)) {
            Log.e(TAG, "could not promote staging")
            // Put the old one back so the app keeps working.
            previous.renameTo(current)
            return false
        }
        return true
    }

    /**
     * After a failed start with an overlay: go back one generation if there is
     * one, otherwise drop the overlay entirely.
     *
     * A new engine that cannot start must not brick the app, and going back to
     * the previous version is better than falling all the way to the APK when
     * that version was known to work.
     */
    fun recover(context: Context): Boolean {
        if (rollback(context)) {
            Log.w(TAG, "engine overlay rolled back to the previous generation")
            return true
        }
        discard(context)
        return false
    }

    /** Roll back to the previous generation after a failed start. */
    fun rollback(context: Context): Boolean {
        val current = currentDir(context)
        val previous = previousDir(context)
        if (!previous.exists()) return false
        current.deleteRecursively()
        return previous.renameTo(current)
    }

    /** True when [file] matches [sha256Hex]; false on any read error. */
    fun verify(file: File, sha256Hex: String, expectedBytes: Long): Boolean {
        if (!file.isFile) return false
        if (expectedBytes > 0 && file.length() != expectedBytes) {
            Log.w(TAG, "size mismatch for ${file.name}: ${file.length()} != $expectedBytes")
            return false
        }
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        // Byte.toInt() sign-extends; "%02x".format(byte) would print ffffff…
        // for every value above 0x7f, so mask to the low byte first.
        val actual = digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xFF) }
        if (!actual.equals(sha256Hex, ignoreCase = true)) {
            Log.w(TAG, "sha256 mismatch for ${file.name}")
            return false
        }
        return true
    }
}
