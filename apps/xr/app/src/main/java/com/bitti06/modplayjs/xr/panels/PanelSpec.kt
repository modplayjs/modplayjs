package com.bitti06.modplayjs.xr.panels

import androidx.compose.runtime.Composable
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.state.XrState
import com.bitti06.modplayjs.xr.ui.panels.DebugPanel
import com.bitti06.modplayjs.xr.ui.panels.DetailsPanel
import com.bitti06.modplayjs.xr.ui.panels.IgnoredPanel
import com.bitti06.modplayjs.xr.ui.panels.LibraryPanel
import com.bitti06.modplayjs.xr.ui.panels.NowPlayingPanel
import com.bitti06.modplayjs.xr.ui.panels.PatternPanel
import com.bitti06.modplayjs.xr.ui.panels.QueuePanel
import com.bitti06.modplayjs.xr.ui.panels.SettingsPanel
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Vector3

/** Stable identity of a panel, independent of the Android view id. */
enum class PanelId {
    MAIN,
    LIBRARY,
    SETTINGS,
    DEBUG,
    PATTERN,
    DETAILS,
    QUEUE,
    IGNORED,
}

val CHANNEL_LABEL_IDS: List<Int> = listOf(
    R.id.panel_channel_label_0, R.id.panel_channel_label_1, R.id.panel_channel_label_2, R.id.panel_channel_label_3,
    R.id.panel_channel_label_4, R.id.panel_channel_label_5, R.id.panel_channel_label_6, R.id.panel_channel_label_7,
    R.id.panel_channel_label_8, R.id.panel_channel_label_9, R.id.panel_channel_label_10, R.id.panel_channel_label_11,
    R.id.panel_channel_label_12, R.id.panel_channel_label_13, R.id.panel_channel_label_14, R.id.panel_channel_label_15,
    R.id.panel_channel_label_16, R.id.panel_channel_label_17, R.id.panel_channel_label_18, R.id.panel_channel_label_19,
    R.id.panel_channel_label_20, R.id.panel_channel_label_21, R.id.panel_channel_label_22, R.id.panel_channel_label_23,
    R.id.panel_channel_label_24, R.id.panel_channel_label_25, R.id.panel_channel_label_26, R.id.panel_channel_label_27,
    R.id.panel_channel_label_28, R.id.panel_channel_label_29, R.id.panel_channel_label_30, R.id.panel_channel_label_31,
)

/**
 * Everything the activity needs to create one panel: where it stands, how big
 * it is and what draws inside it. Sizes used to live in the activity and poses
 * in the layout, which could drift apart; both come from here now.
 */
data class PanelSpec(
    val id: PanelId,
    val androidId: Int,
    val width: Float,
    val height: Float,
    val dpPerMeter: Float = 500f,
    /**
     * Pixels per dp: the panel texture is `dp * 288 * resolutionScale / 160`
     * wide. 0.8 gives 720 px/m, which is still above the Quest 3 eye buffer's
     * ~630 px/m at the arc distance, and cuts panel texture memory to 44% of
     * the old 1.2 (memory scales with the square of the scale).
     */
    val resolutionScale: Float = 0.8f,
    val transparent: Boolean = false,
    val pose: Pose,
    val content: @Composable () -> Unit,
)

/**
 * Put a panel at [x], [y], [z] and turn it towards the user standing at the
 * origin, so the arc reads as a semicircle instead of a row of parallel panels.
 *
 * The yaw follows from the geometry, not from a guess. A panel's front is its
 * local -Z; the Euler constructor builds
 * `W = cp·cy·cr + sp·sy·sr`, `X = sp·cy·cr - cp·sy·sr`,
 * `Y = cp·sy·cr + sp·cy·sr`, `Z = cp·cy·sr - sp·sy·cr` (verified in the
 * 0.15.0 jar), so yaw alone gives `q = (cos θ/2, 0, sin θ/2, 0)`. Rotating the
 * front `(0, 0, -1)` by that leaves `(-sin θ, 0, -cos θ)`, and pointing that at
 * the origin needs `sin θ = x/r`, `cos θ = z/r`, i.e. `θ = atan2(x, z)`.
 */
private fun at(x: Float, y: Float, z: Float): Pose {
    val yaw = Math.toDegrees(kotlin.math.atan2(x.toDouble(), z.toDouble())).toFloat()
    return Pose(Vector3(x, y, z), Quaternion(0f, yaw, 0f))
}

/**
 * The arc, and the one place a panel's size is written.
 *
 * Notes kept from the layout work: the main panel sits at 1.70 m because it is
 * the one looked at most; the pattern panel is raised in resolution because it
 * is a dense monospace grid; details is wider than the rest because three text
 * blocks stand side by side in it, and that width is why it cannot also be
 * scaled up (2.2 m at 1.2 would exceed the 2064 px eye buffer).
 */
val PANELS: List<PanelSpec> =
    listOf(
        PanelSpec(
            id = PanelId.MAIN,
            androidId = R.id.panel_main,
            width = 1.8f,
            height = 1.05f,
            pose = at(0f, 1.60f, 1.70f),
        ) { NowPlayingPanel() },
        PanelSpec(
            id = PanelId.LIBRARY,
            androidId = R.id.panel_library,
            width = 1.4f,
            height = 0.95f,
            pose = at(-1.75f, 1.60f, 1.75f),
        ) { LibraryPanel() },
        PanelSpec(
            id = PanelId.SETTINGS,
            androidId = R.id.panel_settings,
            width = 1.4f,
            height = 0.95f,
            pose = at(1.75f, 1.60f, 1.75f),
        ) { SettingsPanel() },
        PanelSpec(
            id = PanelId.PATTERN,
            androidId = R.id.panel_pattern,
            width = 1.6f,
            height = 0.9f,
            resolutionScale = 0.9f,
            pose = at(-2.0f, 0.65f, 1.70f),
        ) { PatternPanel() },
        PanelSpec(
            id = PanelId.DETAILS,
            androidId = R.id.panel_details,
            width = 2.2f,
            height = 0.75f,
            transparent = true,
            // 0.75 m tall so its top edge stays below the transport's bottom
            // edge in the view. The arc is anchored to the head, so the eye is
            // at 1.60 m in its own space; the transport's bottom rim (1.075 m
            // at 1.70 m) cuts this shelf's plane (1.95 m) at y = 0.998 m. The
            // shelf top here is 0.925 m, so header and all stay clear instead
            // of sliding behind now playing.
            pose = at(0f, 0.55f, 1.95f),
        ) { DetailsPanel() },
        PanelSpec(
            id = PanelId.DEBUG,
            androidId = R.id.panel_debug,
            width = 1.4f,
            height = 0.85f,
            pose = at(1.75f, 0.60f, 1.75f),
        ) { DebugPanel() },
        PanelSpec(
            id = PanelId.QUEUE,
            androidId = R.id.panel_queue,
            width = 1.2f,
            height = 0.85f,
            pose = at(-0.95f, 1.60f, 2.4f),
        ) { QueuePanel() },
        PanelSpec(
            id = PanelId.IGNORED,
            androidId = R.id.panel_ignored,
            width = 1.2f,
            height = 0.85f,
            pose = at(0.95f, 1.60f, 2.4f),
        ) { IgnoredPanel() },
    )

/**
 * The visibility rules, as one pure function.
 *
 * Now playing never hides. The pattern appears only when the module has a grid
 * (SID and streamed modules have none, and an empty grid reads as broken), and
 * it replaces the library while the transport runs: two panels in view is the
 * playback view, four is a wall. Details, settings, queue, ignored and debug
 * are demand-only.
 */
fun visiblePanels(state: XrState): Set<PanelId> {
    val playing = state.player
    return buildSet {
        add(PanelId.MAIN)
        if (state.overlays.library) add(PanelId.LIBRARY)
        if (playing.loaded && playing.canPattern && state.settings.view.patternView) add(PanelId.PATTERN)
        if (playing.loaded && state.overlays.details) add(PanelId.DETAILS)
        if (state.overlays.settings) add(PanelId.SETTINGS)
        if (state.overlays.queue) add(PanelId.QUEUE)
        if (state.overlays.ignored) add(PanelId.IGNORED)
        if (playing.debugSources) add(PanelId.DEBUG)
    }
}
