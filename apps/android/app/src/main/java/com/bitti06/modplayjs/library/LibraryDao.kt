package com.bitti06.modplayjs.library

import androidx.room3.Dao
import androidx.room3.Query
import androidx.room3.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface LibraryDao {
    @Query("SELECT * FROM folders ORDER BY name COLLATE NOCASE")
    fun folders(): Flow<List<FolderEntity>>

    @Query("SELECT * FROM folders")
    suspend fun folderList(): List<FolderEntity>

    @Query("SELECT * FROM folders WHERE id = :id")
    suspend fun folder(id: String): FolderEntity?

    @Upsert suspend fun upsertFolder(folder: FolderEntity)

    @Query("DELETE FROM folders WHERE id = :id")
    suspend fun deleteFolder(id: String)

    @Query("SELECT * FROM tracks WHERE ignoredAt IS NULL ORDER BY addedAt DESC")
    fun visibleTracks(): Flow<List<TrackEntity>>

    @Query("SELECT * FROM tracks WHERE ignoredAt IS NOT NULL ORDER BY ignoredAt DESC")
    fun ignoredTracks(): Flow<List<TrackEntity>>

    /**
     * Actually played, newest first.
     *
     * `visibleTracks()` is ordered by `addedAt`, which is when a file was
     * indexed - a rescan of the same folder would reorder the "recent" list
     * without a single track being played. `lastPlayed` is written on every
     * start; this is the query that reads it.
     */
    @Query(
        "SELECT * FROM tracks WHERE lastPlayed IS NOT NULL AND ignoredAt IS NULL " +
            "ORDER BY lastPlayed DESC",
    )
    fun recentTracks(): Flow<List<TrackEntity>>

    @Query("SELECT * FROM tracks WHERE folderId = :folderId")
    suspend fun tracksInFolder(folderId: String): List<TrackEntity>

    @Upsert suspend fun upsertTracks(tracks: List<TrackEntity>)

    @Query("UPDATE tracks SET availability = 'missing' WHERE id IN (:ids)")
    suspend fun markMissing(ids: List<String>)

    @Query("UPDATE tracks SET ignoredAt = :at WHERE id = :id")
    suspend fun ignore(
        id: String,
        at: Long,
    )

    @Query("UPDATE tracks SET ignoredAt = NULL WHERE id IN (:ids)")
    suspend fun restore(ids: List<String>)

    @Query("UPDATE tracks SET lastPlayed = :at WHERE id = :id")
    suspend fun markPlayed(
        id: String,
        at: Long,
    )

    @Query("UPDATE tracks SET favoriteAt = :at WHERE id = :id")
    suspend fun setFavorite(
        id: String,
        at: Long?,
    )

    @Query("DELETE FROM tracks WHERE id IN (:ids)")
    suspend fun deleteTracks(ids: List<String>)

    @Query("DELETE FROM tracks WHERE folderId = :folderId")
    suspend fun deleteTracksInFolder(folderId: String)

}
