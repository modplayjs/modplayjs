package com.bitti06.modplayjs

import android.content.Context
import android.util.Log
import com.bitti06.modplayjs.engine.PlaybackSession
import com.bitti06.modplayjs.engine.PlaybackStore
import com.bitti06.modplayjs.engine.SettingsStore
import com.bitti06.modplayjs.library.LibraryDb
import com.bitti06.modplayjs.library.LibraryRepository

object AppGraph {
    private lateinit var appContext: Context
    private val db by lazy { LibraryDb.open(appContext) }
    val library by lazy { LibraryRepository(appContext, db.dao()) }
    val settings by lazy { SettingsStore(appContext) }
    val playback by lazy { PlaybackStore(appContext) }
    val session by lazy { PlaybackSession(appContext) }

    fun init(context: Context) {
        appContext = context.applicationContext
        // The player still opens an AudioTrack and starts its render thread in
        // the constructor; the V8 dlopen and 1.4 MB engine.js compile are
        // queued on their own executor, so neither has to happen on the thread
        // that builds the first frame.
        Thread(
            {
                runCatching { session.setSettings(settings.load()) }
                    .onFailure { Log.e("AppGraph", "player warm-up failed", it) }
            },
            "app-warmup",
        ).start()
    }
}
