package com.bitti06.modplayjs.ui

import android.net.Uri
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.engine.AudioOutputInfo
import com.bitti06.modplayjs.library.FolderEntity
import com.bitti06.modplayjs.library.TrackEntity

/**
 * Everything the screens can ask of the app, with no-op defaults.
 *
 * [AppViewModel] implements it, which keeps the screens free of the view model
 * type; previews pass an empty implementation and render without Room, V8 or an
 * AudioTrack. Read-only engine values live here as getters so a preview can
 * report plausible numbers instead of touching the real session.
 */
interface UiActions {
    fun updateFilters(block: (Filters) -> Filters) {}

    fun resetFilters() {}

    fun updateSettings(block: (AndroidSettings) -> AndroidSettings) {}

    fun rescan(folderId: String? = null) {}

    fun removeFolder(folder: FolderEntity) {}

    fun addFiles(uris: List<Uri>) {}

    fun togglePlay() {}

    fun next() {}

    fun previous() {}

    fun stop() {}

    fun seek(ms: Long) {}

    fun toggleChannel(index: Int) {}

    fun soloChannel(index: Int) {}

    fun muteAll() {}

    fun unmuteAll() {}

    fun resetChannels() {}

    fun toggleFavorite(track: TrackEntity) {}

    fun ignore(track: TrackEntity) {}

    fun restore(tracks: List<TrackEntity>) {}

    fun deletePermanently(track: TrackEntity) {}

    val v8Available: Boolean get() = true

    val v8Error: String? get() = null

    val underruns: Int get() = 0

    val sampleRate: Int get() = 48_000

    val audioSessionId: Int get() = 0

    val audioInfo: AudioOutputInfo get() = AudioOutputInfo()
}
