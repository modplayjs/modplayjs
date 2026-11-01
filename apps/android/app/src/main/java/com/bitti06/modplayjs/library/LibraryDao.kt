package com.bitti06.modplayjs.library

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
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

    @Query("SELECT * FROM tracks WHERE folderId = :folderId")
    suspend fun tracksInFolder(folderId: String): List<TrackEntity>

    @Query("SELECT * FROM tracks WHERE id = :id")
    suspend fun track(id: String): TrackEntity?

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

    @Query("DELETE FROM tracks WHERE id IN (:ids)")
    suspend fun deleteTracks(ids: List<String>)

    @Query("DELETE FROM tracks WHERE folderId = :folderId")
    suspend fun deleteTracksInFolder(folderId: String)

    @Query("DELETE FROM playlist_tracks WHERE trackId IN (:ids)")
    suspend fun removeFromPlaylists(ids: List<String>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun addToPlaylist(row: PlaylistTrackEntity)

    @Query("SELECT * FROM playlists ORDER BY name COLLATE NOCASE")
    fun playlists(): Flow<List<PlaylistEntity>>

    @Insert suspend fun createPlaylist(playlist: PlaylistEntity): Long

    @Query("DELETE FROM playlists WHERE id = :id")
    suspend fun deletePlaylist(id: Long)

    @Query("DELETE FROM playlist_tracks WHERE playlistId = :id")
    suspend fun clearPlaylist(id: Long)

    @Query("SELECT t.* FROM tracks t INNER JOIN playlist_tracks p ON p.trackId = t.id WHERE p.playlistId = :id ORDER BY p.position")
    suspend fun playlistTracks(id: Long): List<TrackEntity>
}
