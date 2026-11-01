package com.bitti06.modplayjs.library

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [FolderEntity::class, TrackEntity::class, PlaylistEntity::class, PlaylistTrackEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class LibraryDb : RoomDatabase() {
    abstract fun dao(): LibraryDao

    companion object {
        fun open(context: Context): LibraryDb =
            Room
                .databaseBuilder(context, LibraryDb::class.java, "modplayjs.db")
                .fallbackToDestructiveMigration(dropAllTables = true)
                .build()
    }
}
