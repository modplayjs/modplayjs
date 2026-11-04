package com.bitti06.modplayjs.xr

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.compose.ui.platform.ComposeView
import com.meta.spatial.compose.ComposeFeature
import com.meta.spatial.compose.ComposeViewPanelRegistration
import com.meta.spatial.core.Entity
import com.meta.spatial.core.SpatialFeature
import com.meta.spatial.mruk.MRUKFeature
import com.meta.spatial.runtime.ButtonBits
import com.meta.spatial.runtime.PanelShapeLayerBlendType
import com.meta.spatial.runtime.ReferenceSpace
import com.meta.spatial.spatialaudio.SpatialAudioFeature
import com.meta.spatial.toolkit.AppSystemActivity
import com.meta.spatial.toolkit.DpPerMeterDisplayOptions
import com.meta.spatial.toolkit.GrabbableSystem
import com.meta.spatial.toolkit.MeshCollision
import com.meta.spatial.toolkit.Panel
import com.meta.spatial.toolkit.PanelRegistration
import com.meta.spatial.toolkit.PanelRenderMode
import com.meta.spatial.toolkit.PanelStyleOptions
import com.meta.spatial.toolkit.QuadShapeOptions
import com.meta.spatial.toolkit.Transform
import com.meta.spatial.toolkit.UIPanelRenderOptions
import com.meta.spatial.toolkit.UIPanelSettings
import com.meta.spatial.toolkit.Visible
import com.meta.spatial.vr.VRFeature
import com.meta.spatial.vr.VrInputSystemType
import com.bitti06.modplayjs.xr.library.Library
import com.bitti06.modplayjs.xr.layout.PanelLayout
import com.bitti06.modplayjs.xr.library.Playlist
import com.bitti06.modplayjs.xr.play.XrPlayer
import com.bitti06.modplayjs.xr.ui.XrTheme
import com.bitti06.modplayjs.xr.ui.panels.LibraryPanel
import com.bitti06.modplayjs.xr.ui.panels.NowPlayingPanel
import com.bitti06.modplayjs.xr.ui.panels.DebugPanel
import com.bitti06.modplayjs.xr.ui.panels.DetailsPanel
import com.bitti06.modplayjs.xr.ui.panels.PatternPanel
import com.bitti06.modplayjs.xr.ui.panels.SettingsPanel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class XrActivity : AppSystemActivity() {

    private lateinit var spatialAudio: SpatialAudioFeature
    private lateinit var player: XrPlayer
    private lateinit var mrukFeature: MRUKFeature
    private lateinit var layout: PanelLayout
    private val panels = LinkedHashMap<Int, Entity>()
    private var lastTrackLoaded: Boolean? = null
    private var lastSettingsOpen: Boolean? = null
    private var lastDebugSources: Boolean? = null
    private var lastDetailsCount = -1
    private var resumeOnMount = false
    private val activityScope = CoroutineScope(Dispatchers.Main + Job())

    override fun registerFeatures(): List<SpatialFeature> {
        spatialAudio = SpatialAudioFeature()
        mrukFeature = MRUKFeature(this, systemManager)
        return listOf(
            VRFeature(this, inputSystemType = VrInputSystemType.SIMPLE_CONTROLLER),
            ComposeFeature(),
            spatialAudio,
            mrukFeature,
        )
    }

    override fun registerPanels(): List<PanelRegistration> =
        listOf(
            panel(R.id.panel_main, 1.8f, 1.05f) { NowPlayingPanel() },
            panel(R.id.panel_library, 1.4f, 0.95f) { LibraryPanel() },
            panel(R.id.panel_settings, 1.4f, 0.95f) { SettingsPanel() },
            panel(R.id.panel_debug, 1.4f, 0.85f) { DebugPanel() },
            panel(R.id.panel_pattern, 1.4f, 0.85f) { PatternPanel() },
            panel(R.id.panel_details, 1.4f, 0.70f) { DetailsPanel() },
        )

    private fun panel(
        id: Int,
        width: Float,
        height: Float,
        content: @androidx.compose.runtime.Composable () -> Unit,
    ): PanelRegistration =
        ComposeViewPanelRegistration(
            id,
            composeViewCreator = { _, ctx ->
                ComposeView(ctx).apply {
                    setBackgroundColor(android.graphics.Color.TRANSPARENT)
                    setContent { XrTheme { content() } }
                }
            },
            settingsCreator = {
                UIPanelSettings(
                    shape = QuadShapeOptions(width = width, height = height),
                    style = PanelStyleOptions(themeResourceId = R.style.PanelAppThemeTransparent),
                    display = DpPerMeterDisplayOptions(dpPerMeter = 500f, resolutionScale = 1.2f),
                    rendering = UIPanelRenderOptions(
                        renderMode = PanelRenderMode.Layer(
                            layerBlendType = PanelShapeLayerBlendType.ALPHA_BLEND,
                            enableLayerFeatheredEdge = true,
                        ),
                    ),
                )
            },
        )

    /** Called once the user grants the runtime USE_SCENE permission. */
    fun onScenePermissionGranted() {
        // Scene model: room bounds place the emitter ring in the real room.
        mrukFeature.loadSceneFromDevice().whenComplete { _, _ ->
            runOnUiThread {
                val bounds = mrukFeature.getCurrentRoom()?.roomBounds
                if (bounds != null) {
                    val centre = bounds.center()
                    val size = bounds.size()
                    val radius = XrPlayer.autoRadius(size.x, size.z)
                    player.setRingAuto(radius, centre.x, centre.z)
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        layout = PanelLayout(this)
        XrApp.freeLayout.value = layout.free
        XrApp.setFreeLayout = { on ->
            val hasTrack = XrApp.player?.state?.value?.loaded ?: false
            layout.setFree(on, panels, hasTrack)
            XrApp.freeLayout.value = layout.free
        }
        XrApp.resetLayout = {
            val hasTrack = XrApp.player?.state?.value?.loaded ?: false
            layout.reset(panels, hasTrack)
        }
        player = XrPlayer(this)
        XrApp.player = player
        XrApp.playlist = Playlist(Library(this)).also { playlist ->
            player.onEnded = { playlist.onEnded() }
        }
        XrApp.pickFiles = { openModulePicker() }
        XrApp.pickFolder = { openFolderPicker() }
        player.start()
        requestScenePermission()
    }

    private fun openModulePicker() {
        val intent =
            Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                addFlags(
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
                )
            }
        val options = android.app.ActivityOptions.makeBasic().apply {
            setLaunchBounds(android.graphics.Rect(0, 0, 1280, 800))
        }
        startActivityForResult(intent, REQUEST_PICK_MODULES, options.toBundle())
    }

    private fun openFolderPicker() {
        val intent =
            Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                addFlags(
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
                )
            }
        val options = android.app.ActivityOptions.makeBasic().apply {
            setLaunchBounds(android.graphics.Rect(0, 0, 1280, 800))
        }
        startActivityForResult(intent, REQUEST_PICK_TREE, options.toBundle())
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != Activity.RESULT_OK) return

        if (requestCode == REQUEST_PICK_TREE) {
            val tree = data?.data ?: return
            Library(this).addTree(tree)
            XrApp.libraryChanged()
            return
        }

        if (requestCode != REQUEST_PICK_MODULES) return
        val uris = ArrayList<Uri>()
        data?.clipData?.let { clip ->
            for (i in 0 until clip.itemCount) uris += clip.getItemAt(i).uri
        }
        data?.data?.let { if (uris.isEmpty()) uris += it }
        if (uris.isEmpty()) return
        Library(this).addUris(uris)
        XrApp.libraryChanged()
    }

    override fun onDestroy() {
        activityScope.cancel()
        player.stop()
        XrApp.player = null
        super.onDestroy()
    }

    override fun onSceneReady() {
        super.onSceneReady()
        player.attachScene(scene, spatialAudio)
        scene.setReferenceSpace(ReferenceSpace.LOCAL_FLOOR)
        scene.setViewOrigin(0f, 0f, 0f, 0f)
        Skybox.install(scene, this, launchedInPassthrough = scene.isSystemPassthroughEnabled())

        // Configure controller grab buttons to allow gripping or triggering panels
        val grabbableSystem = systemManager.findSystem<GrabbableSystem>()
        grabbableSystem.active = true
        grabbableSystem.grabButtons =
            ButtonBits.ButtonSqueezeR or
                ButtonBits.ButtonSqueezeL or
                ButtonBits.ButtonTriggerR or
                ButtonBits.ButtonTriggerL

        val ids = listOf(
            R.id.panel_main to PanelLayout.PANEL_MAIN,
            R.id.panel_library to PanelLayout.PANEL_LIBRARY,
            R.id.panel_settings to PanelLayout.PANEL_SETTINGS,
            R.id.panel_debug to PanelLayout.PANEL_DEBUG,
            R.id.panel_pattern to PanelLayout.PANEL_PATTERN,
            R.id.panel_details to PanelLayout.PANEL_DETAILS,
        )
        for ((panelId, layoutId) in ids) {
            val entity = Entity.create(
                Panel(panelId, MeshCollision.LineTest),
                Visible(true),
            )
            panels[layoutId] = entity
        }

        layout.apply(panels, hasTrack = false)

        // Dynamically adjust panel visibility and positions as tracks are loaded/unloaded or settings is toggled
        activityScope.launch {
            kotlinx.coroutines.flow.combine(player.state, XrApp.settingsOpen) { state, isSettingsOpen ->
                Pair(state, isSettingsOpen)
            }.collect { (state, isSettingsOpen) ->
                updatePanelVisibilityAndLayout(state, isSettingsOpen)
            }
        }

        Log.i(TAG, "panels placed: ${panels.size}, free=${layout.free}")
        for ((id, entity) in panels) {
            val pose = runCatching { entity.getComponent<Transform>().transform }.getOrNull()
            Log.i(TAG, "  panel $id at ${pose?.t} rot ${pose?.q}")
        }
    }

    private fun updatePanelVisibilityAndLayout(state: XrPlayer.State, isSettingsOpen: Boolean) {
        val hasTrack = state.loaded
        val isDebug = state.debugSources

        val trackChanged = (lastTrackLoaded != hasTrack)
        val settingsChanged = (lastSettingsOpen != isSettingsOpen)
        val debugChanged = (lastDebugSources != isDebug)
        val detailsChanged = (lastDetailsCount != state.details.size)

        // The flow emits a new state on every snapshot (2 Hz while playing).
        // Six setComponent calls plus a layout pass per tick were pure waste,
        // so bail out unless something the panels care about actually changed.
        if (!trackChanged && !settingsChanged && !debugChanged && !detailsChanged) return

        lastTrackLoaded = hasTrack
        lastSettingsOpen = isSettingsOpen
        lastDebugSources = isDebug
        lastDetailsCount = state.details.size

        if (trackChanged) {
            layout.apply(panels, hasTrack = hasTrack)
        }

        for ((layoutId, entity) in panels) {
            val shouldBeVisible = when (layoutId) {
                PanelLayout.PANEL_MAIN -> hasTrack
                PanelLayout.PANEL_LIBRARY -> true
                PanelLayout.PANEL_SETTINGS -> isSettingsOpen
                PanelLayout.PANEL_PATTERN -> hasTrack
                PanelLayout.PANEL_DETAILS -> hasTrack && state.details.isNotEmpty()
                PanelLayout.PANEL_DEBUG -> isDebug
                else -> true
            }
            entity.setComponent(Visible(shouldBeVisible))
        }
    }

    /**
     * VRC.Quest.Functional.9: with a Local tracking space the user must be able
     * to reset their forward direction. A recenter moves the LOCAL_FLOOR
     * origin, so the fixed arc is re-authored in front of the new forward
     * direction. Free-layout poses are left alone on purpose: the user placed
     * those in the world.
     */
    override fun onRecenter(isUserInitiated: Boolean) {
        super.onRecenter(isUserInitiated)
        if (::layout.isInitialized && !layout.free) {
            layout.apply(panels, hasTrack = lastTrackLoaded == true)
        }
        Skybox.reapply()
        Log.i(TAG, "recenter: userInitiated=$isUserInitiated free=${::layout.isInitialized && layout.free}")
    }

    /**
     * VRC.Quest.Functional.2: the OS asks the app to pause when the headset is
     * taken off. Music is the point of the app, so playback pauses with the
     * headset and comes back when it is worn again.
     */
    override fun onHMDUnmounted() {
        super.onHMDUnmounted()
        resumeOnMount = XrApp.player?.state?.value?.playing == true
        if (resumeOnMount) player.pause()
    }

    override fun onHMDMounted() {
        super.onHMDMounted()
        if (resumeOnMount) {
            resumeOnMount = false
            player.resume()
        }
    }

    override fun onPause() {
        if (::layout.isInitialized && layout.free) layout.save(panels)
        super.onPause()
    }

    /**
     * VRC.Quest.Input.4: the app keeps rendering when focus is lost, but any
     * drag in progress must not continue from stale controller input.
     */
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (!hasFocus && ::layout.isInitialized && layout.free) layout.save(panels)
    }

    override fun onResume() {
        super.onResume()
        Skybox.reapply()
    }

    private fun requestScenePermission() {
        val permission = "com.oculus.permission.USE_SCENE"
        if (checkSelfPermission(permission) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(permission), REQUEST_USE_SCENE)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_USE_SCENE) {
            val granted =
                grantResults.isNotEmpty() &&
                    grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED
            SceneBridge.onPermissionResult(granted, this)
        }
    }

    companion object {
        private const val TAG = "modplay-xr"
        const val REQUEST_USE_SCENE = 1
        const val REQUEST_PICK_MODULES = 2
        const val REQUEST_PICK_TREE = 3
    }
}
