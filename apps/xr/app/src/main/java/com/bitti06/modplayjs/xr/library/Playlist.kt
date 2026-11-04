package com.bitti06.modplayjs.xr.library

import com.bitti06.modplayjs.xr.XrApp
import kotlin.random.Random

/**
 * Queue and transport order, mirroring the phone app: repeat off/all/one,
 * shuffle, auto-advance and jam mode. The player reports end-of-module, this
 * class decides what plays next.
 */
class Playlist(private val library: Library) {

    var tracks: List<TrackFile> = emptyList()
        private set

    var index: Int = -1
        private set

    var repeat: String = "off"
    var shuffle: Boolean = false
    var autoAdvance: Boolean = true
    var jamMode: Boolean = false

    fun playAt(list: List<TrackFile>, position: Int) {
        tracks = list
        index = position.coerceIn(0, (list.size - 1).coerceAtLeast(0))
        load()
    }

    /** Called by the player when the module ends. */
    fun onEnded() {
        XrApp.player?.settingsSnapshot()?.playback?.let {
            repeat = it.repeat
            shuffle = it.shuffle
            autoAdvance = it.autoAdvance
            jamMode = it.jamMode
        }
        when (repeat) {
            "one" -> load()
            "all" -> next()
            else -> if (autoAdvance && index < tracks.size - 1) next() else XrApp.player?.stopPlayback()
        }
    }

    fun next() {
        if (tracks.isEmpty()) return
        index =
            if (shuffle && tracks.size > 1) {
                var next = index
                while (next == index) next = Random.nextInt(tracks.size)
                next
            } else {
                (index + 1) % tracks.size
            }
        load()
    }

    fun previous() {
        if (tracks.isEmpty()) return
        index = if (index <= 0) tracks.size - 1 else index - 1
        load()
    }

    private fun load() {
        val track = tracks.getOrNull(index) ?: return
        val player = XrApp.player ?: return
        try {
            val bytes = library.read(track)
            player.load(bytes, track.filename, track.format, autoPlay = true)
            player.setJamMode(jamMode)
            library.recordPlay(track.uri)
            XrApp.libraryChanged()
        } catch (e: Exception) {
            android.util.Log.e("modplay-xr", "Failed to load track '${track.title}' (${track.uri})", e)
        }
    }
}
