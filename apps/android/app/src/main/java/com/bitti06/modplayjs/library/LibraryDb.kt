package com.bitti06.modplayjs.library

import android.content.Context
import androidx.room3.Database
import androidx.room3.Room
import androidx.room3.RoomDatabase
import androidx.sqlite.driver.AndroidSQLiteDriver
import kotlinx.coroutines.Dispatchers

@Database(
    entities = [FolderEntity::class, TrackEntity::class],
    version = 3,
    exportSchema = false,
)
abstract class LibraryDb : RoomDatabase() {
    abstract fun dao(): LibraryDao

    companion object {
        fun open(context: Context): LibraryDb =
            Room
                .databaseBuilder<LibraryDb>(context, "modplayjs.db")
                .setDriver(AndroidSQLiteDriver())
                .setQueryCoroutineContext(Dispatchers.IO)
                // No migrations while this is unreleased: a schema change bumps
                // the version and the old library is dropped and rescanned.
                .fallbackToDestructiveMigration(dropAllTables = true)
                .build()
    }
}
