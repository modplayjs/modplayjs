package com.bitti06.modplayjs.xr.state

import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.xr.library.TrackFile
import com.bitti06.modplayjs.xr.play.XrPlayer

/**
 * Which on-demand panels are open.
 *
 * Now playing is always on. The library counts as on demand because playback
 * hides it: three panels plus the pattern was more than a playback view needs,
 * and the pattern is the one that belongs next to the transport. Home brings
 * the library back, playback only closes it.
 */
data class Overlays(
    val library: Boolean = true,
    val settings: Boolean = false,
    val queue: Boolean = false,
    val ignored: Boolean = false,
    val details: Boolean = true,
)

/**
 * Where the music is right now: one row in one pattern.
 *
 * Deliberately not part of [XrState]. The row advances about twelve times a
 * second, and every panel reads [XrState], so carrying the row there
 * recomposed all of them at that rate. Only the pattern panel reads this.
 */
data class Playhead(
    val row: Int = 0,
    val pattern: Int = 0,
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
    val radius: Float = 1.8f,
    val radiusManual: Boolean = false,
    val engineAvailable: Boolean = false,
    val sessionId: Int = 0,
    /** Room reverb wet level, percent. */
    val reverbWet: Int = 25,
    /** Point width of every source, degrees; 0 is a point source. */
    val sourceSpread: Float = 0f,
    /** The bus ring follows the listener instead of staying in the room. */
    val ringFollowsHead: Boolean = false,
    /** WORLD, STICKY (experimental, position only) or LOCKED (position + yaw). */
    val ringFollowMode: String = "WORLD",
    /** The ring plane follows the head pitch, for reclined listening. */
    val ringTilts: Boolean = false,
)
