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
    val resolutionScale: Float = 1.2f,
    val transparent: Boolean = false,
    val pose: Pose,
    val content: @Composable () -> Unit,
)

/**
 * Panel front faces local -Z, so a panel at +Z turns 180 degrees of yaw to look
 * at the user. `Pose.forward()` rotates (0, 0, 1), which is the +Z the arc is
 * authored in.
 */
private val FACING_USER = Quaternion(0f, 180f, 0f)

private fun at(x: Float, y: Float, z: Float) = Pose(Vector3(x, y, z), FACING_USER)

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
            pose = at(0f, 1.45f, 1.70f),
        ) { NowPlayingPanel() },
        PanelSpec(
            id = PanelId.LIBRARY,
            androidId = R.id.panel_library,
            width = 1.4f,
            height = 0.95f,
            pose = at(-1.75f, 1.45f, 1.75f),
        ) { LibraryPanel() },
        PanelSpec(
            id = PanelId.SETTINGS,
            androidId = R.id.panel_settings,
            width = 1.4f,
            height = 0.95f,
            pose = at(1.75f, 1.45f, 1.75f),
        ) { SettingsPanel() },
        PanelSpec(
            id = PanelId.PATTERN,
            androidId = R.id.panel_pattern,
            width = 1.6f,
            height = 0.9f,
            resolutionScale = 1.3f,
            pose = at(-1.75f, 0.45f, 1.75f),
        ) { PatternPanel() },
        PanelSpec(
            id = PanelId.DETAILS,
            androidId = R.id.panel_details,
            width = 2.2f,
            height = 0.95f,
            resolutionScale = 1.0f,
            transparent = true,
            pose = at(0f, 1.05f, 2.15f),
        ) { DetailsPanel() },
        PanelSpec(
            id = PanelId.DEBUG,
            androidId = R.id.panel_debug,
            width = 1.4f,
            height = 0.85f,
            pose = at(1.75f, 0.45f, 1.75f),
        ) { DebugPanel() },
        PanelSpec(
            id = PanelId.QUEUE,
            androidId = R.id.panel_queue,
            width = 1.2f,
            height = 0.85f,
            pose = at(-0.95f, 1.45f, 2.4f),
        ) { QueuePanel() },
        PanelSpec(
            id = PanelId.IGNORED,
            androidId = R.id.panel_ignored,
            width = 1.2f,
            height = 0.85f,
            pose = at(0.95f, 1.45f, 2.4f),
        ) { IgnoredPanel() },
    )

/**
 * The visibility rules, as one pure function.
 *
 * The library and now playing are the app's face and never hide. Pattern and
 * details appear only when the module actually has that data (SID and streamed
 * modules have no grid, and an empty grid reads as broken). Settings, queue,
 * ignored and debug are demand-only.
 */
fun visiblePanels(state: XrState): Set<PanelId> {
    val playing = state.player
    return buildSet {
        add(PanelId.LIBRARY)
        add(PanelId.MAIN)
        if (playing.loaded && playing.canPattern) add(PanelId.PATTERN)
        if (playing.loaded && playing.details.isNotEmpty()) add(PanelId.DETAILS)
        if (state.overlays.settings) add(PanelId.SETTINGS)
        if (state.overlays.queue) add(PanelId.QUEUE)
        if (state.overlays.ignored) add(PanelId.IGNORED)
        if (playing.debugSources) add(PanelId.DEBUG)
    }
}
