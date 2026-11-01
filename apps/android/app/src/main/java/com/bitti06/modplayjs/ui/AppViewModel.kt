package com.bitti06.modplayjs.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.viewModelScope
import com.bitti06.modplayjs.AppGraph
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.engine.AndroidSnapshot
import com.bitti06.modplayjs.engine.AudioOutputInfo
import com.bitti06.modplayjs.engine.PlayError
import com.bitti06.modplayjs.engine.PlaybackSession
import com.bitti06.modplayjs.engine.QueueItem
import com.bitti06.modplayjs.engine.SettingsStore
import com.bitti06.modplayjs.library.FolderEntity
import com.bitti06.modplayjs.library.LibraryRepository
import com.bitti06.modplayjs.library.TrackEntity
import com.bitti06.modplayjs.media.PlaybackService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.put

data class Filters(
    val search: String = "",
    val status: String = "all",
    val family: String? = null,
    val format: String? = null,
    val sort: String = "name",
    val descending: Boolean = false,
)

class AppViewModel(
    // An Application, not the Activity: a view model outlives it, and a Context
    // field makes lint (rightly) report a leak.
    private val context: Application,
    private val repo: LibraryRepository,
    private val session: PlaybackSession,
    private val store: SettingsStore,
) : ViewModel(),
    UiActions {
    private val filtersState = MutableStateFlow(Filters())
    val filters: StateFlow<Filters> = filtersState
    private val _settings = MutableStateFlow(store.load())
    val settings: StateFlow<AndroidSettings> = _settings
    val snapshot: StateFlow<AndroidSnapshot?> = session.snapshot
    val queue: StateFlow<List<QueueItem>> = session.queue
    val queueIndex: StateFlow<Int> = session.queueIndex
    val loading: StateFlow<String?> = session.loading
    val error: StateFlow<PlayError?> = session.error

    /** Bumped when a loaded track is waiting for the player screen to draw. */
    val awaitingStart: StateFlow<Int> = session.awaitingStart
    val folders: StateFlow<List<FolderEntity>> = repo.folders.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val ignored: StateFlow<List<TrackEntity>> = repo.ignored.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    override val v8Available: Boolean get() = session.v8Available
    override val v8Error: String? get() = session.v8Error
    override val underruns: Int get() = session.underruns
    override val sampleRate: Int get() = session.sampleRate
    override val audioSessionId: Int get() = session.audioSessionId
    override val audioInfo: AudioOutputInfo get() = session.audioInfo

    private val allTracks = repo.tracks.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /** Unfiltered library, used for counts and filter option lists. */
    val libraryTracks: StateFlow<List<TrackEntity>> = allTracks

    /**
     * stateIn collects on [viewModelScope], its upstream included, which is the
     * main dispatcher. Filtering and sorting the whole library is O(n log n)
     * and Room re-emits on every scan write, so without flowOn the work ran on
     * the main thread.
     */
    val tracks: StateFlow<List<TrackEntity>> =
        combine(allTracks, filtersState) { all, f ->
            repo.filter(all, f.search, f.status, f.family, f.format, f.sort, f.descending)
        }.flowOn(Dispatchers.Default)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val recent: StateFlow<List<TrackEntity>> =
        allTracks
            .map { list -> list.sortedByDescending { it.addedAt }.take(12) }
            .flowOn(Dispatchers.Default)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /**
     * The library row for whatever the queue says is current, so screens can
     * show its favorite state without guessing by file name.
     */
    val nowPlaying: StateFlow<TrackEntity?> =
        combine(allTracks, queue, queueIndex) { all, items, index ->
            items.getOrNull(index)?.id?.let { id -> all.firstOrNull { it.id == id } }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    /** Tracks marked as favorite, newest first. Ignored tracks are excluded. */
    val favorites: StateFlow<List<TrackEntity>> =
        allTracks
            .map { list -> list.filter { it.favoriteAt != null }.sortedByDescending { it.favoriteAt } }
            .flowOn(Dispatchers.Default)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        session.setSettings(_settings.value)
    }

    override fun updateFilters(block: (Filters) -> Filters) {
        filtersState.value = block(filtersState.value)
    }

    override fun resetFilters() {
        filtersState.value = Filters()
    }

    override fun updateSettings(block: (AndroidSettings) -> AndroidSettings) {
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

    override fun rescan(folderId: String?) {
        viewModelScope.launch { runCatching { repo.rescan(folderId) } }
    }

    override fun removeFolder(folder: FolderEntity) {
        viewModelScope.launch { repo.removeFolder(folder) }
    }

    fun play(track: TrackEntity) {
        val list = tracks.value.ifEmpty { listOf(track) }
        val index = list.indexOfFirst { it.id == track.id }.coerceAtLeast(0)
        playList(list, index)
    }

    /** Replaces the queue with [items] and starts at [index]. */
    fun playList(
        items: List<TrackEntity>,
        index: Int,
    ) {
        if (items.isEmpty()) return
        val start = index.coerceIn(0, items.lastIndex)
        session.setQueue(items.map { QueueItem(it.id, it.name, it.documentUri, it.format) }, start)
        PlaybackService.start(context)
        session.playIndex(start)
        viewModelScope.launch { repo.markPlayed(items[start]) }
    }

    /** Releases the audio output once the now-playing screen has been drawn. */
    fun startOutputAfterUi() = session.startOutputAfterUi()

    fun playQueue(index: Int) {
        PlaybackService.start(context)
        session.playIndex(index)
    }

    override fun togglePlay() {
        val playing = snapshot.value?.state?.playing == true
        if (playing) {
            session.pause()
        } else {
            PlaybackService.start(context)
            session.play()
        }
    }

    override fun next() = session.next()

    override fun previous() = session.previous()

    override fun stop() = session.stop()

    override fun seek(ms: Long) = session.seek(ms)

    override fun toggleChannel(index: Int) = session.toggleChannelMute(index)

    override fun soloChannel(index: Int) = session.soloChannel(index)

    override fun muteAll() = session.muteAllChannels()

    override fun unmuteAll() = session.unmuteAllChannels()

    override fun resetChannels() = session.resetChannels()

    override fun ignore(track: TrackEntity) {
        viewModelScope.launch { repo.ignore(track) }
    }

    /** Flips the favorite flag; the stored track may be a stale snapshot, so the id is what counts. */
    override fun toggleFavorite(track: TrackEntity) {
        viewModelScope.launch {
            val current = allTracks.value.firstOrNull { it.id == track.id }
            repo.setFavorite(track.id, (current ?: track).favoriteAt == null)
        }
    }

    override fun restore(tracks: List<TrackEntity>) {
        viewModelScope.launch { repo.restore(tracks) }
    }

    override fun deletePermanently(track: TrackEntity) {
        viewModelScope.launch { repo.deletePermanently(track) }
    }

    companion object {
        fun factory(application: Application): ViewModelProvider.Factory =
            viewModelFactory {
                initializer {
                    AppViewModel(
                        application,
                        AppGraph.library,
                        AppGraph.session,
                        AppGraph.settings,
                    )
                }
            }
    }
}
