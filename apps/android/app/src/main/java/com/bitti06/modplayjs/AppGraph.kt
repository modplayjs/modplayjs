package com.bitti06.modplayjs

import android.content.Context
import com.bitti06.modplayjs.engine.PlaybackSession
import com.bitti06.modplayjs.engine.SettingsStore
import com.bitti06.modplayjs.library.LibraryDb
import com.bitti06.modplayjs.library.LibraryRepository

object AppGraph {
    private lateinit var appContext: Context
    val db by lazy { LibraryDb.open(appContext) }
    val library by lazy { LibraryRepository(appContext, db.dao()) }
    val settings by lazy { SettingsStore(appContext) }
    val session by lazy { PlaybackSession(appContext) }

    fun init(context: Context) {
        appContext = context.applicationContext
        session.setSettings(settings.load())
    }
}
