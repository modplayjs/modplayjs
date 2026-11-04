package com.bitti06.modplayjs.xr

import com.bitti06.modplayjs.xr.library.Playlist
import com.bitti06.modplayjs.xr.play.XrPlayer
import kotlinx.coroutines.flow.MutableStateFlow

/** Process-wide handle the panels talk to; set by [XrActivity] before a panel draws. */
object XrApp {
    @Volatile
    var player: XrPlayer? = null

    /** Queue and repeat/shuffle behaviour, mirrors the phone app's queue. */
    @Volatile
    var playlist: Playlist? = null

    /** Passthrough state, shared by the settings panel and the activity. */
    val passthrough = MutableStateFlow(false)

    /** Opens the system document picker; set by the activity. */
    @Volatile
    var pickFiles: (() -> Unit)? = null

    /** Opens the system folder picker (SAF tree); set by the activity. */
    @Volatile
    var pickFolder: (() -> Unit)? = null

    /** Bumped whenever the library changed from outside a panel (SAF picker). */
    val libraryVersion = MutableStateFlow(0)

    /** Panel layout: false = fixed arc, true = free-floating/grabbable. */
    val freeLayout = MutableStateFlow(false)

    /** Settings panel visibility state toggled via gear icon (hidden on start). */
    val settingsOpen = MutableStateFlow(false)

    /** Queue panel visibility, opened from the settings panel. */
    val queueOpen = MutableStateFlow(false)

    /** Ignored-files panel visibility, opened from the settings panel. */
    val ignoredOpen = MutableStateFlow(false)

    @Volatile
    var setFreeLayout: ((Boolean) -> Unit)? = null

    @Volatile
    var resetLayout: (() -> Unit)? = null

    fun toggleSettings() {
        settingsOpen.value = !settingsOpen.value
    }

    fun toggleQueue() {
        queueOpen.value = !queueOpen.value
    }

    fun toggleIgnored() {
        ignoredOpen.value = !ignoredOpen.value
    }

    fun setPassthrough(on: Boolean) {
        passthrough.value = on
        Skybox.setPassthrough(on)
    }

    fun requestFiles() {
        pickFiles?.invoke()
    }

    fun requestFolder() {
        pickFolder?.invoke()
    }

    fun libraryChanged() {
        libraryVersion.value += 1
    }

    fun requestFreeLayout(on: Boolean) {
        freeLayout.value = on
        setFreeLayout?.invoke(on)
    }

    fun requestLayoutReset() {
        resetLayout?.invoke()
    }
}
