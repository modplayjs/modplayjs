package com.bitti06.modplayjs.xr.state

import android.net.Uri
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.xr.library.Library
import com.bitti06.modplayjs.xr.library.Playlist
import com.bitti06.modplayjs.xr.library.ScanResult
import com.bitti06.modplayjs.xr.library.TrackFile
import com.bitti06.modplayjs.xr.play.XrPlayer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Things only the activity can do: open system pickers and move the panels.
 * The store calls these; the activity implements them.
 */
interface XrHost {
    fun pickFiles()
    fun pickFolder()
    fun setFreeLayout(on: Boolean)
    fun resetLayout()
    fun setPassthrough(on: Boolean)
}

/**
 * The single place the panels talk to.
 *
 * [state] is the one value the UI reads. Commands are the only way in, so a
 * panel never reaches into the player, the playlist or the library. The store
 * folds every source into [XrState] and republishes when any of them moves.
 *
 * Nothing here owns a thread: `attach` runs on the activity's main scope, which
 * is also where the flows emit.
 */
object XrStore {

    private val _state = MutableStateFlow(XrState())
    val state: StateFlow<XrState> = _state.asStateFlow()

    /** The playhead alone; only the pattern panel reads it. */
    private val _playhead = MutableStateFlow(Playhead())
    val playhead: StateFlow<Playhead> = _playhead.asStateFlow()

    /** Bumped when the library changes from outside a panel (SAF picker). */
    private val _libraryVersion = MutableStateFlow(0)
    val libraryVersion: StateFlow<Int> = _libraryVersion.asStateFlow()

    /**
     * Bumped when a track is played, which is what the "Recent" filter sorts
     * by. It is separate from [libraryVersion] on purpose: playing a module
     * must not trigger a library rescan.
     */
    private val _recentsVersion = MutableStateFlow(0)
    val recentsVersion: StateFlow<Int> = _recentsVersion.asStateFlow()

    /**
     * The last library scan.
     *
     * It lives here rather than in the panel because only visible panels are
     * composed: a scan result held in `LibraryPanel` was dropped whenever the
     * panel hid, and coming back started a full SAF walk of every picked tree
     * again. The result and the progress are ordinary flows, so the panel can
     * come and go without owning the scan.
     */
    private val _libraryTracks = MutableStateFlow(ScanResult(emptyList(), emptyList(), 0))
    val libraryTracks: StateFlow<ScanResult> = _libraryTracks.asStateFlow()

    private val _scanning = MutableStateFlow(false)
    val scanning: StateFlow<Boolean> = _scanning.asStateFlow()

    private val _scanCount = MutableStateFlow(0)
    val scanCount: StateFlow<Int> = _scanCount.asStateFlow()

    private val _scanItem = MutableStateFlow("")
    val scanItem: StateFlow<String> = _scanItem.asStateFlow()

    /**
     * Scan requests. Conflated, so a burst of changes runs one walk with the
     * latest grants instead of one walk per change: a picker return, a restore
     * and an ignore landing in the same frame are one scan.
     */
    private var scanRequests: Channel<Unit>? = null

    private var player: XrPlayer? = null
    /** Last playback state, so the library only moves on a transition. */
    private var wasPlaying = false
    /** Last load state, so a dismissed details shelf returns with the next module. */
    private var wasLoaded = false
    private var playlist: Playlist? = null
    private var library: Library? = null
    private val overlays = MutableStateFlow(Overlays())

    var host: XrHost? = null

    fun attach(
        scope: CoroutineScope,
        player: XrPlayer,
        playlist: Playlist,
        library: Library,
        freeLayout: StateFlow<Boolean>,
        passthrough: StateFlow<Boolean>,
    ) {
        this.player = player
        this.playlist = playlist
        this.library = library
        refresh(freeLayout.value, passthrough.value)

        scope.launch { player.state.collect { refresh(freeLayout.value, passthrough.value) } }
        scope.launch { player.playhead.collect { _playhead.value = it } }
        scope.launch { playlist.version.collect { refresh(freeLayout.value, passthrough.value) } }
        scope.launch { _libraryVersion.collect { refresh(freeLayout.value, passthrough.value) } }
        scope.launch { overlays.collect { refresh(freeLayout.value, passthrough.value) } }
        scope.launch { freeLayout.collect { refresh(it, passthrough.value) } }
        scope.launch { passthrough.collect { refresh(freeLayout.value, it) } }

        // One scan at a time, off the main thread. Every library change posts
        // here; the conflated channel folds a burst into a single walk.
        val requests = Channel<Unit>(Channel.CONFLATED)
        scanRequests = requests
        scope.launch(Dispatchers.IO) {
            for (unused in requests) {
                val lib = library ?: continue
                _scanning.value = true
                _scanCount.value = 0
                _scanItem.value = ""
                val scanned =
                    runCatching {
                        lib.scan { count, item ->
                            _scanCount.value = count
                            _scanItem.value = item
                        }
                    }.getOrNull()
                if (scanned != null) _libraryTracks.value = scanned
                _scanning.value = false
                _scanItem.value = ""
            }
        }
        scope.launch { _libraryVersion.collect { requests.trySend(Unit) } }
    }

    /** Re-read every source with the values the state already carries. */
    private fun refresh() {
        val current = _state.value
        refresh(current.freeLayout, current.passthrough)
    }

    private fun refresh(free: Boolean, passthrough: Boolean) {
        val p = player
        // Playback owns the view: the library steps aside for the pattern and
        // comes back when the transport stops. Home reopens it at any time.
        val playing = p?.state?.value?.playing == true
        if (playing != wasPlaying) {
            wasPlaying = playing
            overlays.value = overlays.value.copy(library = !playing)
        }
        val loaded = p?.state?.value?.loaded == true
        if (loaded && !wasLoaded) {
            overlays.value = overlays.value.copy(details = true)
        }
        wasLoaded = loaded
        _state.value =
            XrState(
                player = p?.state?.value ?: XrState().player,
                settings = p?.settingsSnapshot() ?: AndroidSettings(),
                overlays = overlays.value,
                queue = QueueState(playlist?.tracks.orEmpty(), playlist?.index ?: -1),
                freeLayout = free,
                passthrough = passthrough,
                radius = p?.ringRadius() ?: 1f,
                radiusManual = p?.isRadiusManual() ?: false,
                engineAvailable = p?.engineAvailable() == true,
                sessionId = p?.sessionId() ?: 0,
            )
    }

    // ---- Transport -------------------------------------------------------

    fun playPause() {
        player?.togglePlay()
    }

    fun stop() {
        player?.stopPlayback()
    }

    fun next() {
        playlist?.next()
    }

    fun previous() {
        playlist?.previous()
    }

    fun seek(ms: Long) {
        player?.seek(ms.coerceAtLeast(0L))
    }

    fun setVolume(percent: Int) {
        player?.setVolume(percent)
    }

    fun toggleMute(channel: Int) {
        player?.toggleMute(channel)
    }

    fun toggleSolo(channel: Int) {
        player?.toggleSolo(channel)
    }

    fun playAt(tracks: List<TrackFile>, index: Int) {
        playlist?.playAt(tracks, index)
    }

    fun playQueueIndex(index: Int) {
        playlist?.playIndex(index)
    }

    // ---- Audio and scene -------------------------------------------------

    fun setSpatialEnabled(on: Boolean) {
        player?.setSpatialEnabled(on)
    }

    fun setLayout(layout: String) {
        player?.setLayout(layout)
    }

    fun setRadius(radius: Float) {
        player?.setRadius(radius)
        refresh()
    }

    fun resetRadiusAuto() {
        player?.resetRadiusAuto()
        refresh()
    }

    fun setDebugSources(on: Boolean) {
        player?.setDebugSources(on)
    }

    fun setJamMode(on: Boolean) {
        player?.setJamMode(on)
        // setJamMode stores the setting without publishing engine state.
        refresh()
    }

    fun updateSettings(transform: (AndroidSettings) -> AndroidSettings) {
        player?.update(transform)
    }

    fun setFreeLayout(on: Boolean) {
        host?.setFreeLayout(on)
    }

    fun resetLayout() {
        host?.resetLayout()
    }

    fun setPassthrough(on: Boolean) {
        host?.setPassthrough(on)
    }

    // ---- Overlays --------------------------------------------------------

    fun toggleSettings() {
        toggle(overlays.value.copy(settings = !overlays.value.settings))
    }

    fun toggleQueue() {
        toggle(overlays.value.copy(queue = !overlays.value.queue))
    }

    fun toggleIgnored() {
        toggle(overlays.value.copy(ignored = !overlays.value.ignored))
    }

    fun toggleDetails() {
        toggle(overlays.value.copy(details = !overlays.value.details))
    }

    /** Back to the library: close every panel that opens on demand. */
    fun goHome() {
        toggle(Overlays())
    }

    private fun toggle(next: Overlays) {
        overlays.value = next
    }

    // ---- Library ---------------------------------------------------------

    fun pickFiles() {
        host?.pickFiles()
    }

    fun pickFolder() {
        host?.pickFolder()
    }

    fun libraryChanged() {
        _libraryVersion.value += 1
    }

    /** A track was played: the recents order changed, the library did not. */
    fun recentsChanged() {
        _recentsVersion.value += 1
        refresh()
    }

    /** Manual rescan from the library panel. */
    fun rescan() {
        scanRequests?.trySend(Unit)
    }

    fun favorites(): Set<String> = library?.favorites().orEmpty()

    fun recents(): List<String> = library?.recents().orEmpty()

    fun ignoredUris(): Set<String> = library?.ignoredUris().orEmpty()

    fun treeUris(): List<Uri> = library?.treeUris().orEmpty()

    fun pickedCount(): Int = library?.pickedCount() ?: 0

    fun nameOf(uri: Uri): String = library?.nameOf(uri) ?: uri.toString()

    fun toggleFavorite(uri: Uri) {
        library?.toggleFavorite(uri)
    }

    fun ignore(uri: Uri) {
        library?.ignore(uri)
        libraryChanged()
    }

    fun restore(uri: Uri) {
        library?.restore(uri)
        libraryChanged()
    }

    fun removeTree(uri: Uri) {
        library?.removeTree(uri)
        libraryChanged()
    }

    fun clearIgnored() {
        library?.clearIgnored()
        libraryChanged()
    }

    fun addTree(uri: Uri) {
        library?.addTree(uri)
        libraryChanged()
    }

    fun addUris(uris: List<Uri>) {
        library?.addUris(uris)
        libraryChanged()
    }
}
