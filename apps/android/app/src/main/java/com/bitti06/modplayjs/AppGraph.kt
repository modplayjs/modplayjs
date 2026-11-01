package com.bitti06.modplayjs

import android.content.Context
import android.util.Log
import com.bitti06.modplayjs.engine.PlaybackSession
import com.bitti06.modplayjs.engine.SettingsStore
import com.bitti06.modplayjs.library.LibraryDb
import com.bitti06.modplayjs.library.LibraryRepository

object AppGraph {
    private lateinit var appContext: Context
    private val db by lazy { LibraryDb.open(appContext) }
    val library by lazy { LibraryRepository(appContext, db.dao()) }
    val settings by lazy { SettingsStore(appContext) }
    val session by lazy { PlaybackSession(appContext) }

    fun init(context: Context) {
        appContext = context.applicationContext
        // Building the player costs a V8 dlopen, a 1.4 MB engine.js compile and
        // an AudioTrack. Do that on a background thread so the first frame is
        // not blocked by it; later accesses wait for this initialisation
        // instead of performing it.
        Thread(
            {
                runCatching { session.setSettings(settings.load()) }
                    .onFailure { Log.e("AppGraph", "player warm-up failed", it) }
            },
            "app-warmup",
        ).start()
    }
}
