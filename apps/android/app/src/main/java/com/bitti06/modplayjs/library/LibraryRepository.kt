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

    /** Played tracks, newest first. Empty until something has been played. */
    val recent: Flow<List<TrackEntity>> = dao.recentTracks()

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

    /**
     * Files picked one at a time with ACTION_OPEN_DOCUMENT.
     *
     * Each file gets its own row and its own single-track "folder", keyed by the
     * document URI. That keeps `folderId` a real foreign key - the alternative,
     * one shared pseudo-folder, would have to special-case itself everywhere a
     * folder is listed, removed or rescanned, and a removed folder would take
     * unrelated picked files with it.
     *
     * A picked file's folder has a blank `treeUri`, so [rescan] knows to read
     * one document instead of walking a tree.
     */
    suspend fun addFiles(uris: List<Uri>): Int =
        withContext(Dispatchers.IO) {
            var added = 0
            for (uri in uris) {
                runCatching {
                    context.contentResolver.takePersistableUriPermission(
                        uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION,
                    )
                }
                val entry = scanner.documentInfo(uri) ?: continue
                val folderId = "picked:$uri"
                val folder =
                    FolderEntity(
                        id = folderId,
                        treeUri = "",
                        name = entry.name,
                        canWrite = false,
                        lastScanAt = System.currentTimeMillis(),
                        fileCount = 1,
                    )
                dao.upsertFolder(folder)
                val (format, family) = SafScanner.formatOf(entry.name)
                dao.upsertTracks(
                    listOf(
                        TrackEntity(
                            id = "$folderId:${entry.documentId}",
                            folderId = folderId,
                            documentUri = entry.documentUri,
                            documentId = entry.documentId,
                            relativePath = entry.relativePath,
                            name = entry.name,
                            mime = entry.mime,
                            size = entry.size,
                            lastModified = entry.lastModified,
                            format = format,
                            family = family,
                            availability = "available",
                            addedAt = System.currentTimeMillis(),
                        ),
                    ),
                )
                added++
            }
            added
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
                    // A picked single file has no tree to walk: re-read its one
                    // document, so a deleted or moved file turns into a "missing"
                    // row instead of staying in the list forever.
                    if (folder.treeUri.isBlank()) {
                        rescanPicked(folder)
                        scanned += 1
                        total += 1
                        publish(0)
                        return@forEachIndexed
                    }
                    val uri = Uri.parse(folder.treeUri)
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

    /**
     * Re-read the single document behind a picked-file row.
     *
     * A lost grant and a deleted file both look the same from here: the query
     * returns nothing, and the row is marked missing rather than removed, so the
     * user still sees what disappeared and can drop the entry themselves.
     */
    private suspend fun rescanPicked(folder: FolderEntity) {
        val uri = Uri.parse(folder.id.removePrefix("picked:"))
        val entry = scanner.documentInfo(uri)
        if (entry == null) {
            dao.upsertFolder(
                folder.copy(status = "revoked", error = "file is gone or the grant was revoked"),
            )
            val ids = dao.tracksInFolder(folder.id).map { it.id }
            if (ids.isNotEmpty()) dao.markMissing(ids)
            return
        }
        val old = dao.tracksInFolder(folder.id).firstOrNull()
        val (format, family) = SafScanner.formatOf(entry.name)
        dao.upsertTracks(
            listOf(
                TrackEntity(
                    id = "${folder.id}:${entry.documentId}",
                    folderId = folder.id,
                    documentUri = entry.documentUri,
                    documentId = entry.documentId,
                    relativePath = entry.relativePath,
                    name = entry.name,
                    mime = entry.mime,
                    size = entry.size,
                    lastModified = entry.lastModified,
                    format = format,
                    family = family,
                    availability = "available",
                    ignoredAt = old?.ignoredAt,
                    addedAt = old?.addedAt ?: System.currentTimeMillis(),
                    lastPlayed = old?.lastPlayed,
                    favoriteAt = old?.favoriteAt,
                ),
            ),
        )
        dao.upsertFolder(
            folder.copy(
                name = entry.name,
                status = "ok",
                error = null,
                fileCount = 1,
                lastScanAt = System.currentTimeMillis(),
            ),
        )
    }

    suspend fun removeFolder(folder: FolderEntity) =
        withContext(Dispatchers.IO) {
            dao.deleteTracksInFolder(folder.id)
            dao.deleteFolder(folder.id)
            // A picked file is its own folder, and its grant belongs to the
            // document, not to a tree.
            val grant =
                if (folder.treeUri.isBlank()) {
                    Uri.parse(folder.id.removePrefix("picked:"))
                } else {
                    Uri.parse(folder.treeUri)
                }
            runCatching {
                context.contentResolver.releasePersistableUriPermission(
                    grant,
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

    /** Record a play. The queue item only carries an id, which is all this needs. */
    suspend fun markPlayed(id: String) =
        withContext(Dispatchers.IO) {
            dao.markPlayed(id, System.currentTimeMillis())
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
    ): List<TrackEntity> = filterTracks(all, search, status, family, format, sort, descending)
}

/**
 * The pure half of [LibraryRepository.filter].
 *
 * Extracted so the sort and filter rules can be tested without Room, a Context
 * or an IO dispatcher - the folder ordering in particular is the kind of rule
 * that reads fine and is wrong in one direction.
 */
internal fun filterTracks(
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
            // The whole relative path, not the folder name: two folders called
            // "Music" under different trees are still two folders, and sorting
            // must not interleave them.
            "folder" ->
                compareBy(String.CASE_INSENSITIVE_ORDER) { t: TrackEntity -> t.relativePath }
                    .thenBy(String.CASE_INSENSITIVE_ORDER) { t: TrackEntity -> t.name }
            else -> compareBy(String.CASE_INSENSITIVE_ORDER) { it.name }
        }
    return filtered.sortedWith(if (descending) comparator.reversed() else comparator).toList()
}
