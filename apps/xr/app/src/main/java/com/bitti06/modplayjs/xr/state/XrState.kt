package com.bitti06.modplayjs.xr.state

import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.xr.library.TrackFile
import com.bitti06.modplayjs.xr.play.XrPlayer

/** Which on-demand panels are open. The library and now playing are always on. */
data class Overlays(
    val settings: Boolean = false,
    val queue: Boolean = false,
    val ignored: Boolean = false,
)

/** The queue as the queue panel draws it. Owned by `Playlist`, copied here. */
data class QueueState(
    val tracks: List<TrackFile> = emptyList(),
    val index: Int = -1,
)

/**
 * Everything the panels draw, in one immutable value published by [XrStore].
 *
 * Only the store mutates it; panels read it in a single `collectAsState` and
 * send commands back. There is no second source of truth: the player's own
 * state, the settings the engine reports, the playlist, the layout and the
 * display mode are folded in here.
 */
data class XrState(
    val player: XrPlayer.State = XrPlayer.State(),
    val settings: AndroidSettings = AndroidSettings(),
    val overlays: Overlays = Overlays(),
    val queue: QueueState = QueueState(),
    val freeLayout: Boolean = true,
    val passthrough: Boolean = false,
    val radius: Float = 1.0f,
    val radiusManual: Boolean = false,
    val engineAvailable: Boolean = false,
    val sessionId: Int = 0,
)
