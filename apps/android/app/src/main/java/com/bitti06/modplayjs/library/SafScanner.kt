package com.bitti06.modplayjs.library

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class DocumentEntry(
    val documentId: String,
    val documentUri: String,
    val name: String,
    val mime: String,
    val size: Long,
    val lastModified: Long,
    val relativePath: String,
)

/** Metadata-only SAF scan. One bulk query per directory; no DocumentFile. */
class SafScanner(
    private val context: Context,
) {
    private val resolver: ContentResolver get() = context.contentResolver

    suspend fun scan(
        treeUri: Uri,
        onProgress: (Int) -> Unit = {},
    ): List<DocumentEntry> =
        withContext(Dispatchers.IO) {
            val out = ArrayList<DocumentEntry>()
            val rootId = DocumentsContract.getTreeDocumentId(treeUri)
            walk(treeUri, rootId, "", out, onProgress)
            out
        }

    private fun walk(
        treeUri: Uri,
        documentId: String,
        path: String,
        out: MutableList<DocumentEntry>,
        onProgress: (Int) -> Unit,
    ) {
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, documentId)
        val projection =
            arrayOf(
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE,
                DocumentsContract.Document.COLUMN_SIZE,
                DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            )
        resolver.query(childrenUri, projection, null, null, null)?.use { cursor ->
            val idCol = cursor.getColumnIndexOrThrow(projection[0])
            val nameCol = cursor.getColumnIndexOrThrow(projection[1])
            val mimeCol = cursor.getColumnIndexOrThrow(projection[2])
            val sizeCol = cursor.getColumnIndexOrThrow(projection[3])
            val modCol = cursor.getColumnIndexOrThrow(projection[4])
            while (cursor.moveToNext()) {
                val id = cursor.getString(idCol) ?: continue
                val name = cursor.getString(nameCol) ?: continue
                val mime = cursor.getString(mimeCol) ?: "application/octet-stream"
                val childPath = if (path.isEmpty()) name else "$path/$name"
                if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                    walk(treeUri, id, childPath, out, onProgress)
                } else if (isSupported(name)) {
                    val uri = DocumentsContract.buildDocumentUriUsingTree(treeUri, id)
                    out.add(
                        DocumentEntry(
                            documentId = id,
                            documentUri = uri.toString(),
                            name = name,
                            mime = mime,
                            size = cursor.getLong(sizeCol),
                            lastModified = cursor.getLong(modCol),
                            relativePath = childPath,
                        ),
                    )
                    if (out.size % 200 == 0) onProgress(out.size)
                }
            }
        }
    }

    fun canWrite(uri: Uri): Boolean = resolver.persistedUriPermissions.any { it.uri == uri && it.isWritePermission }

    fun delete(documentUri: Uri): Boolean = runCatching { DocumentsContract.deleteDocument(resolver, documentUri) }.getOrDefault(false)

    companion object {
        /**
         * Every extension the Android engine bundle can play: the format
         * plugins registered in `engine/src/engine-entry.ts` plus the streamed
         * audio decoder (wav/mp3/ogg). Files with any other extension are not
         * indexed at all.
         *
         * `.mo3` is deliberately absent: the Un4seen container is not
         * registered in the Android bundle until its decoder is finished, so
         * those files stay out of the library (a rescan drops rows for them)
         * instead of appearing and failing to play. mp3 streaming is separate
         * and unaffected: it uses the minimp3 decoder from the same package.
         */
        private val formats =
            mapOf(
                "mod" to "mod",
                "flt" to "mod",
                "hmn" to "mod",
                "mmd" to "mod",
                "mmd0" to "mod",
                "mmd1" to "mod",
                "mmd2" to "mod",
                "mmd3" to "mod",
                "mmdc" to "mod",
                "s3m" to "s3m",
                "xm" to "xm",
                "it" to "it",
                "mtm" to "mtm",
                "stm" to "stm",
                "st" to "st",
                "669" to "669",
                "sfx" to "sfx",
                "digi" to "digi",
                "asylum" to "asylum",
                "ice" to "ice",
                "med" to "med",
                "med2" to "med",
                "med3" to "med",
                "med4" to "med",
                "fc13" to "fc",
                "fc14" to "fc",
                "sid" to "sid",
                "pow" to "packed",
                "pp" to "packed",
                "xpk" to "packed",
                "pack" to "packed",
                "p61" to "packed",
                "utz" to "packed",
                "wav" to "wav",
                "mp3" to "mp3",
                "ogg" to "ogg",
            )

        fun isSupported(name: String): Boolean = formats.containsKey(extensionOf(name))

        fun formatOf(name: String): Pair<String, String> {
            val format = formats[extensionOf(name)] ?: "unknown"
            val family =
                when (format) {
                    "sid" -> "sid"
                    "wav", "mp3", "ogg" -> "audio"
                    // Packed modules are still tracker modules once unpacked.
                    "packed" -> "tracker"
                    "unknown" -> "other"
                    else -> "tracker"
                }
            return format to family
        }

        private fun extensionOf(name: String): String = name.substringAfterLast('.', "").lowercase()
    }
}
