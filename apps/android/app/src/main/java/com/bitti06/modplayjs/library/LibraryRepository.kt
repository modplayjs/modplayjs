package com.bitti06.modplayjs.library

import android.content.Context
import android.content.Intent
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext

/**
 * A rescan in flight. [expected] is the sum of the folders' previous counts, 0
 * when any folder has never been scanned and the percentage is unknown.
 */
data class ScanProgress(
    val folderName: String,
    val folderIndex: Int,
    val folderCount: Int,
    val files: Int,
    val expected: Int,
)

class LibraryRepository(
    private val context: Context,
    private val dao: LibraryDao,
) {
    private val scanner = SafScanner(context)

    val folders: Flow<List<FolderEntity>> = dao.folders()
    val tracks: Flow<List<TrackEntity>> = dao.visibleTracks()
    val ignored: Flow<List<TrackEntity>> = dao.ignoredTracks()

    suspend fun addFolder(uri: Uri): FolderEntity =
        withContext(Dispatchers.IO) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                )
            }
            val id = uri.toString()
            val name = uri.lastPathSegment?.substringAfterLast('/') ?: "Folder"
            val folder = FolderEntity(id, id, name, scanner.canWrite(uri))
            dao.upsertFolder(folder)
            rescan(folder.id)
            dao.folder(folder.id) ?: folder
        }

    suspend fun rescan(folderId: String? = null): Int =
        withContext(Dispatchers.IO) {
            val targets = if (folderId != null) listOfNotNull(dao.folder(folderId)) else dao.folderList()
            // The previous count of every folder is the only estimate of the
            // work ahead: a SAF walk cannot know how many files follow.
            val expectedTotal = if (targets.all { it.fileCount > 0 }) targets.sumOf { it.fileCount } else 0
            var total = 0
            var scanned = 0
            try {
                targets.forEachIndexed { index, folder ->
                    val uri = Uri.parse(folder.treeUri)
                    fun publish(files: Int) {
                        _progress.value =
                            ScanProgress(
                                folderName = folder.name,
                                folderIndex = index + 1,
                                folderCount = targets.size,
                                files = scanned + files,
                                expected = expectedTotal,
                            )
                    }
                    publish(0)
                    val entries =
                        runCatching { scanner.scan(uri) { publish(it) } }.getOrElse {
                            dao.upsertFolder(folder.copy(status = "revoked", error = it.message))
                            return@withContext total
                        }
                    val allExisting = dao.tracksInFolder(folder.id).associateBy { it.documentId }
                    // Rows for types the app no longer indexes (older builds stored
                    // every file) are removed instead of being kept as "missing".
                    val dropped = allExisting.values.filterNot { SafScanner.isSupported(it.name) }.map { it.id }
                    if (dropped.isNotEmpty()) dao.deleteTracks(dropped)
                    val existing = allExisting.filterValues { SafScanner.isSupported(it.name) }
                    val seen = HashSet<String>(entries.size)
                    val rows = ArrayList<TrackEntity>(entries.size)
                    val now = System.currentTimeMillis()
                    for (e in entries) {
                        seen.add(e.documentId)
                        val old = existing[e.documentId]
                        val (format, family) = SafScanner.formatOf(e.name)
                        rows.add(
                            TrackEntity(
                                id = "${folder.id}:${e.documentId}",
                                folderId = folder.id,
                                documentUri = e.documentUri,
                                documentId = e.documentId,
                                relativePath = e.relativePath,
                                name = e.name,
                                mime = e.mime,
                                size = e.size,
                                lastModified = e.lastModified,
                                format = format,
                                family = family,
                                availability = "available",
                                ignoredAt = old?.ignoredAt,
                                addedAt = old?.addedAt ?: now,
                                lastPlayed = old?.lastPlayed,
                                favoriteAt = old?.favoriteAt,
                            ),
                        )
                    }
                    rows.chunked(500).forEach { dao.upsertTracks(it) }
                    val missing = existing.keys.filterNot { it in seen }.map { "${folder.id}:$it" }
                    if (missing.isNotEmpty()) dao.markMissing(missing)
                    dao.upsertFolder(
                        folder.copy(
                            lastScanAt = now,
                            status = "ok",
                            error = null,
                            fileCount = entries.size,
                            canWrite = scanner.canWrite(uri),
                        ),
                    )
                    scanned += entries.size
                    total += entries.size
                    publish(0)
                }
                total
            } finally {
                _progress.value = null
            }
        }

    private val _progress = MutableStateFlow<ScanProgress?>(null)

    /** Live rescan state, null when nothing is scanning. */
    val progress: StateFlow<ScanProgress?> = _progress.asStateFlow()

    suspend fun removeFolder(folder: FolderEntity) =
        withContext(Dispatchers.IO) {
            dao.deleteTracksInFolder(folder.id)
            dao.deleteFolder(folder.id)
            runCatching {
                context.contentResolver.releasePersistableUriPermission(
                    Uri.parse(folder.treeUri),
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                )
            }
        }

    suspend fun ignore(track: TrackEntity) =
        withContext(Dispatchers.IO) {
            dao.ignore(track.id, System.currentTimeMillis())
        }

    suspend fun restore(tracks: List<TrackEntity>) =
        withContext(Dispatchers.IO) {
            dao.restore(tracks.map { it.id })
        }

    suspend fun deletePermanently(track: TrackEntity): Boolean =
        withContext(Dispatchers.IO) {
            if (track.availability != "available") return@withContext false
            if (!scanner.canWrite(Uri.parse(track.documentUri))) return@withContext false
            val deleted = scanner.delete(Uri.parse(track.documentUri))
            if (deleted) {
                dao.deleteTracks(listOf(track.id))
            }
            deleted
        }

    suspend fun markPlayed(track: TrackEntity) =
        withContext(Dispatchers.IO) {
            dao.markPlayed(track.id, System.currentTimeMillis())
        }

    suspend fun setFavorite(
        id: String,
        favorite: Boolean,
    ) =
        withContext(Dispatchers.IO) {
            dao.setFavorite(id, if (favorite) System.currentTimeMillis() else null)
        }

    fun filter(
        all: List<TrackEntity>,
        search: String,
        status: String,
        family: String?,
        format: String?,
        sort: String,
        descending: Boolean,
    ): List<TrackEntity> {
        val q = search.trim().lowercase()
        val filtered =
            all
                .asSequence()
                .filter { status == "all" || it.availability == status }
                .filter { family == null || it.family == family }
                .filter { format == null || it.format == format }
                .filter { q.isEmpty() || it.name.lowercase().contains(q) || it.relativePath.lowercase().contains(q) }
        val comparator: Comparator<TrackEntity> =
            when (sort) {
                "format" -> compareBy(String.CASE_INSENSITIVE_ORDER) { it.format }
                "family" -> compareBy(String.CASE_INSENSITIVE_ORDER) { it.family }
                "size" -> compareBy { it.size }
                "modified" -> compareBy { it.lastModified }
                "added" -> compareBy { it.addedAt }
                else -> compareBy(String.CASE_INSENSITIVE_ORDER) { it.name }
            }
        return filtered.sortedWith(if (descending) comparator.reversed() else comparator).toList()
    }
}
