package com.bitti06.modplayjs.xr.library

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.documentfile.provider.DocumentFile
import java.io.File

data class TrackFile(
    val uri: Uri,
    val title: String,
    val format: String,
    val size: Long,
    val folder: String,
)

data class FolderEntry(
    val uri: Uri,
    val name: String,
    val files: Int,
)

data class ScanResult(
    val tracks: List<TrackFile>,
    val folders: List<FolderEntry>,
    val ignored: Int,
)

/**
 * Module index with parity to the phone app's library sources:
 *
 *  - the app's own directories (`adb push`),
 *  - single documents picked with `ACTION_OPEN_DOCUMENT`,
 *  - whole trees picked with `ACTION_OPEN_DOCUMENT_TREE`.
 *
 * Tree and document grants are persisted, so the library survives restarts.
 * Ignored files are remembered per URI and filtered from every scan.
 */
class Library(private val context: Context) {

    private val prefs = context.getSharedPreferences("library", Context.MODE_PRIVATE)

    fun roots(): List<File> =
        listOfNotNull(
            File(context.getExternalFilesDir(null), "modules"),
            File(context.filesDir, "modules"),
        )

    // ------------------------------------------------------------- grants

    fun addUris(uris: List<Uri>) {
        val current = prefs.getStringSet(KEY_PICKED, emptySet()).orEmpty().toMutableSet()
        for (uri in uris) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            }
            current += uri.toString()
        }
        prefs.edit().putStringSet(KEY_PICKED, current).apply()
    }

    fun addTree(uri: Uri) {
        runCatching {
            context.contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        }
        val current = prefs.getStringSet(KEY_TREES, emptySet()).orEmpty().toMutableSet()
        current += uri.toString()
        prefs.edit().putStringSet(KEY_TREES, current).apply()
    }

    fun removeTree(uri: Uri) {
        val current = prefs.getStringSet(KEY_TREES, emptySet()).orEmpty().toMutableSet()
        current -= uri.toString()
        prefs.edit().putStringSet(KEY_TREES, current).apply()
        runCatching {
            context.contentResolver.releasePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        }
    }

    fun treeUris(): List<Uri> =
        prefs.getStringSet(KEY_TREES, emptySet()).orEmpty().mapNotNull {
            runCatching { Uri.parse(it) }.getOrNull()
        }

    fun pickedCount(): Int = prefs.getStringSet(KEY_PICKED, emptySet()).orEmpty().size

    // ------------------------------------------------------------- ignore

    fun ignoredUris(): Set<String> = prefs.getStringSet(KEY_IGNORED, emptySet()).orEmpty()

    fun ignore(uri: Uri) {
        val current = ignoredUris().toMutableSet()
        current += uri.toString()
        prefs.edit().putStringSet(KEY_IGNORED, current).apply()
    }

    fun favorites(): Set<String> = prefs.getStringSet(KEY_FAVORITES, emptySet()).orEmpty()

    fun isFavorite(uri: Uri): Boolean = uri.toString() in favorites()

    fun toggleFavorite(uri: Uri): Boolean {
        val current = favorites().toMutableSet()
        val now = if (!current.add(uri.toString())) {
            current.remove(uri.toString())
            false
        } else {
            true
        }
        prefs.edit().putStringSet(KEY_FAVORITES, current).apply()
        return now
    }

    /** Most recent first. */
    fun recents(): List<String> =
        prefs.getString(KEY_RECENTS, "").orEmpty().split('\n').filter { it.isNotBlank() }

    fun recordPlay(uri: Uri) {
        val list = recents().toMutableList()
        list.remove(uri.toString())
        list.add(0, uri.toString())
        while (list.size > MAX_RECENTS) list.removeAt(list.size - 1)
        prefs.edit().putString(KEY_RECENTS, list.joinToString("\n")).apply()
    }

    fun clearIgnored() {
        prefs.edit().remove(KEY_IGNORED).apply()
    }

    // --------------------------------------------------------------- scan

    fun scan(): ScanResult {
        val ignored = ignoredUris()
        val out = LinkedHashMap<String, TrackFile>()
        var skipped = 0

        fun add(uri: Uri, name: String, size: Long, folder: String) {
            if (uri.toString() in ignored) {
                skipped++
                return
            }
            val format = formatOf(name) ?: return
            out[uri.toString()] = TrackFile(
                uri = uri,
                title = name.substringBeforeLast('.'),
                format = format,
                size = size,
                folder = folder,
            )
        }

        for (root in roots()) {
            if (!root.isDirectory) continue
            root.walkTopDown()
                .filter { it.isFile }
                .forEach { file ->
                    add(Uri.fromFile(file), file.name, file.length(), "adb")
                }
        }

        for (raw in prefs.getStringSet(KEY_PICKED, emptySet()).orEmpty()) {
            val uri = runCatching { Uri.parse(raw) }.getOrNull() ?: continue
            val name = displayName(uri) ?: continue
            add(uri, name, sizeOf(uri), "picked")
        }

        val folders = ArrayList<FolderEntry>()
        for (treeUri in treeUris()) {
            val root = runCatching { DocumentFile.fromTreeUri(context, treeUri) }.getOrNull()
            if (root == null || !root.isDirectory) {
                folders += FolderEntry(treeUri, "nicht verfügbar", 0)
                continue
            }
            val before = out.size
            walk(root, root.name ?: "Ordner", 0, ::add)
            folders += FolderEntry(treeUri, root.name ?: "Ordner", out.size - before)
        }

        return ScanResult(
            tracks = out.values.sortedWith(compareBy({ it.format }, { it.title.lowercase() })),
            folders = folders,
            ignored = skipped,
        )
    }

    private fun walk(
        dir: DocumentFile,
        folderName: String,
        depth: Int,
        add: (Uri, String, Long, String) -> Unit,
    ) {
        if (depth > MAX_DEPTH) return
        for (child in dir.listFiles()) {
            if (child.isDirectory) {
                walk(child, folderName, depth + 1, add)
            } else {
                child.name?.let { add(child.uri, it, child.length(), folderName) }
            }
        }
    }

    fun read(track: TrackFile): ByteArray =
        context.contentResolver.openInputStream(track.uri)?.use { it.readBytes() }
            ?: error("cannot open ${track.title}")

    private fun displayName(uri: Uri): String? {
        val queried =
            runCatching {
                context.contentResolver
                    .query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                    ?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                            if (index >= 0) cursor.getString(index) else null
                        } else {
                            null
                        }
                    }
            }.getOrNull()
        return queried ?: uri.lastPathSegment?.substringAfterLast('/')
    }

    private fun sizeOf(uri: Uri): Long =
        runCatching {
            context.contentResolver
                .query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)
                ?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val index = cursor.getColumnIndex(OpenableColumns.SIZE)
                        if (index >= 0 && !cursor.isNull(index)) cursor.getLong(index) else 0L
                    } else {
                        0L
                    }
                } ?: 0L
        }.getOrDefault(0L)

    private fun formatOf(name: String): String? {
        val ext = name.substringAfterLast('.', "").lowercase()
        return if (ext in FORMATS) ext.uppercase() else null
    }

    companion object {
        private const val KEY_PICKED = "picked"
        private const val KEY_TREES = "trees"
        private const val KEY_IGNORED = "ignored"
        private const val KEY_FAVORITES = "favorites"
        private const val KEY_RECENTS = "recents"
        private const val MAX_RECENTS = 24
        private const val MAX_DEPTH = 12

        val FORMATS = setOf(
            "mod", "xm", "it", "s3m", "mtm", "stm", "669", "med", "mo3", "sid",
            "fc", "sfx", "digi", "ice", "asylum", "hmn", "flt", "st",
        )
    }
}
