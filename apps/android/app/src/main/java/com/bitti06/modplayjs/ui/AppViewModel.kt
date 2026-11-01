package com.bitti06.modplayjs.ui

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.bitti06.modplayjs.AppGraph
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.engine.AndroidSnapshot
import com.bitti06.modplayjs.engine.PlaybackSession
import com.bitti06.modplayjs.engine.QueueItem
import com.bitti06.modplayjs.engine.SettingsStore
import com.bitti06.modplayjs.library.FolderEntity
import com.bitti06.modplayjs.library.LibraryRepository
import com.bitti06.modplayjs.library.TrackEntity
import com.bitti06.modplayjs.media.PlaybackService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.put

data class Filters(
    val search: String = "",
    val status: String = "all",
    val family: String? = null,
    val format: String? = null,
    val folderId: String? = null,
    val sort: String = "name",
    val descending: Boolean = false,
)

class AppViewModel(
    private val context: Context,
    private val repo: LibraryRepository,
    private val session: PlaybackSession,
    private val store: SettingsStore,
) : ViewModel() {
    private val filtersState = MutableStateFlow(Filters())
    val filters: StateFlow<Filters> = filtersState
    private val _settings = MutableStateFlow(store.load())
    val settings: StateFlow<AndroidSettings> = _settings
    val snapshot: StateFlow<AndroidSnapshot?> = session.snapshot
    val queue: StateFlow<List<QueueItem>> = session.queue
    val queueIndex: StateFlow<Int> = session.queueIndex
    val loading: StateFlow<String?> = session.loading
    val error: StateFlow<String?> = session.error
    val folders: StateFlow<List<FolderEntity>> = repo.folders.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val ignored: StateFlow<List<TrackEntity>> = repo.ignored.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val v8Available: Boolean get() = session.v8Available
    val v8Error: String? get() = session.v8Error
    val underruns: Int get() = session.underruns
    val sampleRate: Int get() = session.sampleRate

    private val allTracks = repo.tracks.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val tracks: StateFlow<List<TrackEntity>> =
        combine(allTracks, filtersState) { all, f ->
            repo.filter(all, f.search, f.status, f.family, f.format, f.folderId, f.sort, f.descending)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        session.setSettings(_settings.value)
    }

    fun updateFilters(block: (Filters) -> Filters) {
        filtersState.value = block(filtersState.value)
    }

    fun updateSettings(block: (AndroidSettings) -> AndroidSettings) {
        val old = _settings.value
        val next = block(old)
        _settings.value = next
        store.save(next)
        session.setSettings(next)
        if (next.playback.jamMode != old.playback.jamMode) {
            session.command("setJamMode") { put("enabled", next.playback.jamMode) }
        }
    }

    fun addFolder(uri: Uri) = viewModelScope.launch { runCatching { repo.addFolder(uri) } }

    fun rescan(folderId: String? = null) = viewModelScope.launch { runCatching { repo.rescan(folderId) } }

    fun removeFolder(folder: FolderEntity) = viewModelScope.launch { repo.removeFolder(folder) }

    fun play(track: TrackEntity) {
        val list = tracks.value.ifEmpty { listOf(track) }
        val index = list.indexOfFirst { it.id == track.id }.coerceAtLeast(0)
        val items = list.map { QueueItem(it.id, it.name, it.documentUri, it.format) }
        session.setQueue(items, index)
        PlaybackService.start(context)
        session.playIndex(index)
        viewModelScope.launch { repo.markPlayed(track) }
    }

    fun playQueue(index: Int) {
        PlaybackService.start(context)
        session.playIndex(index)
    }

    fun togglePlay() {
        val playing = snapshot.value?.state?.playing == true
        if (playing) {
            session.pause()
        } else {
            PlaybackService.start(context)
            session.play()
        }
    }

    fun next() = session.next()

    fun previous() = session.previous()

    fun stop() = session.stop()

    fun seek(ms: Long) = session.seek(ms)

    fun auditionInstrument(index: Int) = session.auditionInstrument(index)

    fun auditionSample(index: Int) = session.auditionSample(index)

    fun toggleChannel(index: Int) = session.toggleChannelMute(index)

    fun soloChannel(index: Int) = session.soloChannel(index)

    fun muteAll() = session.muteAllChannels()

    fun unmuteAll() = session.unmuteAllChannels()

    fun resetChannels() = session.resetChannels()

    fun ignore(track: TrackEntity) = viewModelScope.launch { repo.ignore(track) }

    fun restore(tracks: List<TrackEntity>) = viewModelScope.launch { repo.restore(tracks) }

    fun deletePermanently(track: TrackEntity) = viewModelScope.launch { repo.deletePermanently(track) }

    companion object {
        fun factory(context: Context): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    AppViewModel(context.applicationContext, AppGraph.library, AppGraph.session, AppGraph.settings) as T
            }
    }
}
