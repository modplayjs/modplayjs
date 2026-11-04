package com.bitti06.modplayjs.xr.state

import android.net.Uri
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.xr.library.Library
import com.bitti06.modplayjs.xr.library.Playlist
import com.bitti06.modplayjs.xr.library.ScanResult
import com.bitti06.modplayjs.xr.library.TrackFile
import com.bitti06.modplayjs.xr.play.XrPlayer
import kotlinx.coroutines.CoroutineScope
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

    /** Bumped when the library changes from outside a panel (SAF picker). */
    private val _libraryVersion = MutableStateFlow(0)
    val libraryVersion: StateFlow<Int> = _libraryVersion.asStateFlow()

    private var player: XrPlayer? = null
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
        scope.launch { playlist.version.collect { refresh(freeLayout.value, passthrough.value) } }
        scope.launch { _libraryVersion.collect { refresh(freeLayout.value, passthrough.value) } }
        scope.launch { overlays.collect { refresh(freeLayout.value, passthrough.value) } }
        scope.launch { freeLayout.collect { refresh(it, passthrough.value) } }
        scope.launch { passthrough.collect { refresh(freeLayout.value, it) } }
    }

    private fun refresh(free: Boolean, passthrough: Boolean) {
        val p = player
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
    }

    fun resetRadiusAuto() {
        player?.resetRadiusAuto()
    }

    fun setDebugSources(on: Boolean) {
        player?.setDebugSources(on)
    }

    fun setJamMode(on: Boolean) {
        player?.setJamMode(on)
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

    /** Back to the library: close the three panels that open on demand. */
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

    fun scan(): ScanResult? = library?.scan()

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
