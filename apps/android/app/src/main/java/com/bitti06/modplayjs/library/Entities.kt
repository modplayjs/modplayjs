package com.bitti06.modplayjs.library

import androidx.room3.Entity
import androidx.room3.Index
import androidx.room3.PrimaryKey

@Entity(tableName = "folders")
data class FolderEntity(
    @PrimaryKey val id: String,
    val treeUri: String,
    val name: String,
    val canWrite: Boolean,
    val lastScanAt: Long? = null,
    val status: String = "ok",
    val error: String? = null,
    val fileCount: Int = 0,
)

@Entity(
    tableName = "tracks",
    indices = [
        Index(value = ["folderId", "documentId"], unique = true),
        Index("ignoredAt"), Index("availability"), Index("format"), Index("name"),
    ],
)
data class TrackEntity(
    @PrimaryKey val id: String,
    val folderId: String,
    val documentUri: String,
    val documentId: String,
    val relativePath: String,
    val name: String,
    val mime: String,
    val size: Long,
    val lastModified: Long,
    val format: String,
    val family: String,
    val availability: String = "available",
    val ignoredAt: Long? = null,
    val addedAt: Long = System.currentTimeMillis(),
    val lastPlayed: Long? = null,
    /** When the track was favorited, or null. Also the newest-first sort key. */
    val favoriteAt: Long? = null,
)

@Entity(tableName = "playlists")
data class PlaylistEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val createdAt: Long = System.currentTimeMillis(),
)

@Entity(tableName = "playlist_tracks", primaryKeys = ["playlistId", "trackId"])
data class PlaylistTrackEntity(
    val playlistId: Long,
    val trackId: String,
    val position: Int,
)
