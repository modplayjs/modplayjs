package com.bitti06.modplayjs.xr

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.compose.ui.platform.ComposeView
import com.bitti06.modplayjs.xr.input.ControllerInputSystem
import com.bitti06.modplayjs.xr.library.Library
import com.bitti06.modplayjs.xr.library.Playlist
import com.bitti06.modplayjs.xr.layout.PanelAnimator
import com.bitti06.modplayjs.xr.layout.PanelPlacement
import com.bitti06.modplayjs.xr.panels.PANELS
import com.bitti06.modplayjs.xr.panels.PanelId
import com.bitti06.modplayjs.xr.panels.PanelSpec
import com.bitti06.modplayjs.xr.panels.visiblePanels
import com.bitti06.modplayjs.xr.play.XrPlayer
import com.bitti06.modplayjs.xr.state.XrHost
import com.bitti06.modplayjs.xr.state.XrState
import com.bitti06.modplayjs.xr.state.XrStore
import com.bitti06.modplayjs.xr.ui.XrTheme
import com.meta.spatial.compose.ComposeFeature
import com.meta.spatial.compose.ComposeViewPanelRegistration
import com.meta.spatial.core.Entity
import com.meta.spatial.core.SpatialFeature
import com.meta.spatial.isdk.IsdkDefaultCursorSystem
import com.meta.spatial.isdk.IsdkSystem
import com.meta.spatial.mruk.MRUKFeature
import com.meta.spatial.runtime.PanelShapeLayerBlendType
import com.meta.spatial.runtime.ReferenceSpace
import com.meta.spatial.spatialaudio.SpatialAudioFeature
import com.meta.spatial.toolkit.AppSystemActivity
import com.meta.spatial.toolkit.AvatarSystem
import com.meta.spatial.toolkit.DpPerMeterDisplayOptions
import com.meta.spatial.toolkit.MeshCollision
import com.meta.spatial.toolkit.Panel
import com.meta.spatial.toolkit.PanelRegistration
import com.meta.spatial.toolkit.PanelSettings
import com.meta.spatial.toolkit.PanelRenderMode
import com.meta.spatial.toolkit.PanelStyleOptions
import com.meta.spatial.toolkit.QuadShapeOptions
import com.meta.spatial.toolkit.UIPanelRenderOptions
import com.meta.spatial.toolkit.UIPanelSettings
import com.meta.spatial.toolkit.Visible
import com.meta.spatial.vr.VRFeature
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * The immersive host. It owns features, lifecycle and the panel entities, and
 * nothing else: what a panel shows lives in the panels, what it does lives in
 * [XrStore], and where it stands lives in [PanelPlacement].
 */
class XrActivity : AppSystemActivity(), XrHost {

    private lateinit var spatialAudio: SpatialAudioFeature
    private lateinit var player: XrPlayer
    private lateinit var playlist: Playlist
    private lateinit var library: Library
    private lateinit var mrukFeature: MRUKFeature
    private lateinit var placement: PanelPlacement

    private val panelAnimator = PanelAnimator()
    private val panels = LinkedHashMap<PanelId, Entity>()

    private var visible: Set<PanelId> = emptySet()
    private var lastLoaded = false
    private var resumeOnMount = false
    private var resumeAfterPause = false
    private var avatarSystem: AvatarSystem? = null
    private var isdkSystem: IsdkSystem? = null
    private var cursorSystem: IsdkDefaultCursorSystem? = null
    private var lastRecenterNs = 0L
    private val activityScope = CoroutineScope(Dispatchers.Main + Job())

    override fun registerFeatures(): List<SpatialFeature> {
        spatialAudio = SpatialAudioFeature()
        mrukFeature = MRUKFeature(this, systemManager)
        // Interaction SDK, the SDK default and the only system that turns hand
        // input into the same pointer events as controllers: ray, pinch, direct
        // touch and grabbing with either modality.
        return listOf(
            VRFeature(this),
            ComposeFeature(),
            spatialAudio,
            mrukFeature,
        )
    }

    override fun registerPanels(): List<PanelRegistration> =
        PANELS.map { spec ->
            ComposeViewPanelRegistration(
                spec.androidId,
                composeViewCreator = { _, ctx ->
                    ComposeView(ctx).apply {
                        setBackgroundColor(android.graphics.Color.TRANSPARENT)
                        setContent { XrTheme { spec.content() } }
                    }
                },
                settingsCreator = { panelSettings(spec) },
            )
        }

    private fun panelSettings(spec: PanelSpec): PanelSettings {
        val base =
            UIPanelSettings(
                shape = QuadShapeOptions(width = spec.width, height = spec.height),
                style = PanelStyleOptions(themeResourceId = R.style.PanelAppThemeTransparent),
                display =
                    DpPerMeterDisplayOptions(
                        dpPerMeter = spec.dpPerMeter,
                        resolutionScale = spec.resolutionScale,
                    ),
                // ALPHA_BLEND does not write depth, so overlapping panels can
                // sort wrongly; the arc keeps them apart, and the blend is what
                // keeps the rounded corners clean.
                rendering =
                    UIPanelRenderOptions(
                        renderMode =
                            PanelRenderMode.Layer(
                                layerBlendType = PanelShapeLayerBlendType.ALPHA_BLEND,
                                enableLayerFeatheredEdge = true,
                            ),
                    ),
            )
        return if (spec.transparent) TransparentPanelSettings(base) else base
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Panel slides run as a system: the SystemManager calls execute() once
        // per frame, the documented place for per-frame work.
        systemManager.registerSystem(panelAnimator)

        placement = PanelPlacement(this, panelAnimator)
        player = XrPlayer(this)
        library = Library(this)
        playlist = Playlist(library, player) { XrStore.libraryChanged() }
        player.onEnded = { playlist.onEnded() }

        XrStore.host = this
        // The store is the panels' only source of state; it folds in the
        // player, the playlist, the layout and the display mode.
        XrStore.attach(
            scope = activityScope,
            player = player,
            playlist = playlist,
            library = library,
            freeLayout = placement.freeLayout,
            passthrough = XrScene.passthrough,
        )

        player.start()
        requestScenePermission()
    }

    override fun onSceneReady() {
        super.onSceneReady()
        player.attachScene(scene, spatialAudio)
        scene.setReferenceSpace(ReferenceSpace.LOCAL_FLOOR)
        scene.setViewOrigin(0f, 0f, 0f, 0f)
        // Documented knob: multiplies thumbstick scroll speed on panels. 1.6
        // lets a 32-channel pattern be crossed in a reasonable time.
        scene.setPanelControllerScrollFactor(1.6f)
        // VRC.Quest.Performance.1: interactive apps must hold an allowed refresh
        // rate. 72 Hz is the lowest one every Quest supports.
        Log.i(TAG, "display rate 72 Hz accepted=${scene.setPreferredDisplayRate(72f)}")
        XrScene.install(scene, this, launchedInPassthrough = scene.isSystemPassthroughEnabled())

        avatarSystem = runCatching { systemManager.findSystem<AvatarSystem>() }.getOrNull()
        isdkSystem = runCatching { systemManager.findSystem<IsdkSystem>() }.getOrNull()
        cursorSystem = runCatching { systemManager.findSystem<IsdkDefaultCursorSystem>() }.getOrNull()
        updateAvatarVisibility(hasFocus = true)

        // VRC.Quest.Input.1 (menu button) and the visible laser: both are the
        // app's job under the Interaction SDK.
        systemManager.registerSystem(ControllerInputSystem { XrStore.toggleSettings() })

        for (spec in PANELS) {
            panels[spec.id] =
                Entity.create(
                    Panel(spec.androidId, MeshCollision.LineTest),
                    Visible(true),
                )
        }
        placement.apply(panels)

        activityScope.launch { XrStore.state.collect { applyState(it) } }

        Log.i(TAG, "panels placed: ${panels.size}, free=${placement.free}")
    }

    /**
     * Apply one state: place the arc when the loaded track changed, then show
     * exactly the panels [visiblePanels] names.
     */
    private fun applyState(state: XrState) {
        if (state.player.loaded != lastLoaded) {
            lastLoaded = state.player.loaded
            placement.apply(panels)
        }
        val next = visiblePanels(state)
        if (next == visible) return
        visible = next
        for ((id, entity) in panels) {
            entity.setComponent(Visible(id in next))
        }
    }

    /** Called once the user grants the runtime USE_SCENE permission. */
    fun onScenePermissionGranted() {
        mrukFeature.loadSceneFromDevice().whenComplete { _, _ ->
            runOnUiThread {
                val bounds = mrukFeature.getCurrentRoom()?.roomBounds ?: return@runOnUiThread
                val centre = bounds.center()
                val size = bounds.size()
                player.setRingAuto(XrPlayer.autoRadius(size.x, size.z), centre.x, centre.z)
            }
        }
    }

    // ---- XrHost ----------------------------------------------------------

    override fun pickFiles() {
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
        val options =
            android.app.ActivityOptions.makeBasic().apply {
                setLaunchBounds(android.graphics.Rect(0, 0, 1280, 800))
            }
        startActivityForResult(intent, REQUEST_PICK_MODULES, options.toBundle())
    }

    override fun pickFolder() {
        val intent =
            Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                addFlags(
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
                )
            }
        val options =
            android.app.ActivityOptions.makeBasic().apply {
                setLaunchBounds(android.graphics.Rect(0, 0, 1280, 800))
            }
        startActivityForResult(intent, REQUEST_PICK_TREE, options.toBundle())
    }

    override fun setFreeLayout(on: Boolean) {
        // The toggle lives in the settings panel: moving that panel out from
        // under the user's hand mid-tap is the one change they cannot follow,
        // so it stays where it is and only gets the new grab state.
        placement.setFree(on, panels, skip = setOf(PanelId.SETTINGS))
    }

    override fun resetLayout() {
        placement.reset(panels)
    }

    override fun setPassthrough(on: Boolean) {
        XrScene.setPassthrough(on)
    }

    // ---- Lifecycle -------------------------------------------------------

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != Activity.RESULT_OK) return

        if (requestCode == REQUEST_PICK_TREE) {
            data?.data?.let { XrStore.addTree(it) }
            return
        }
        if (requestCode != REQUEST_PICK_MODULES) return

        val uris = ArrayList<Uri>()
        data?.clipData?.let { clip ->
            for (i in 0 until clip.itemCount) uris += clip.getItemAt(i).uri
        }
        data?.data?.let { if (uris.isEmpty()) uris += it }
        if (uris.isNotEmpty()) XrStore.addUris(uris)
    }

    override fun onSpatialShutdown() {
        // Guaranteed to run before the activity dies, unlike onStop/onDestroy,
        // so a grabbed arrangement survives a kill from the OS.
        saveFreeLayout()
        super.onSpatialShutdown()
    }

    override fun onDestroy() {
        activityScope.cancel()
        player.stop()
        XrStore.host = null
        super.onDestroy()
    }

    /**
     * VRC.Quest.Functional.9: a recenter moves the LOCAL_FLOOR origin, so the
     * fixed arc is re-authored in front of the new forward direction. Free
     * layouts are left alone on purpose: the user placed those in the world.
     */
    override fun onRecenter(isUserInitiated: Boolean) {
        super.onRecenter(isUserInitiated)
        // onRecenter fires more than once with a stale head pose; collapsing
        // repeats avoids double-writing every Transform in one frame.
        val now = System.nanoTime()
        if (now - lastRecenterNs < RECENTER_DEBOUNCE_NS) return
        lastRecenterNs = now
        if (::placement.isInitialized && !placement.free) placement.apply(panels)
        XrScene.reapply()
        Log.i(TAG, "recenter: userInitiated=$isUserInitiated free=${::placement.isInitialized && placement.free}")
    }

    /**
     * VRC.Quest.Functional.2: the OS asks the app to pause when the headset is
     * taken off. Music is the point of the app, so playback pauses with the
     * headset and comes back when it is worn again.
     */
    override fun onHMDUnmounted() {
        super.onHMDUnmounted()
        resumeOnMount = player.state.value.playing
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
        // VRC.Quest.Functional.2: pausing the app pauses playback. Focus loss
        // (Universal Menu) is a different event and deliberately keeps playing.
        saveFreeLayout()
        resumeAfterPause = player.state.value.playing
        if (resumeAfterPause) player.pause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        XrScene.reapply()
        if (resumeAfterPause) {
            resumeAfterPause = false
            player.resume()
        }
    }

    /**
     * VRC.Quest.Input.4: the app keeps rendering when focus is lost, but no
     * drag may continue from stale controller input.
     */
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        updateAvatarVisibility(hasFocus)
        if (!hasFocus) saveFreeLayout()
    }

    private fun saveFreeLayout() {
        if (::placement.isInitialized && placement.free) placement.save(panels)
    }

    /**
     * VRC.Quest.Input.4: hide hands and controllers and ignore all input while
     * another app has focus. IsdkSystem stops ticking, which is where every
     * pointer event is generated; the cursor system's own switch also empties
     * the cursor and laser pools so no beam is left hanging.
     */
    private fun updateAvatarVisibility(hasFocus: Boolean) {
        avatarSystem?.apply {
            setShowHands(hasFocus)
            setShowControllers(hasFocus)
        }
        isdkSystem?.active = hasFocus
        cursorSystem?.enableInput(hasFocus)
    }

    /**
     * Meta VR OS SDK API level (207 on the current OS line), not the Android
     * API level. Logged so a device log shows which Horizon OS the app runs on.
     */
    private fun horizonOsApi(): Int = runCatching { metavr.os.Build.Version.getApiVersion() }.getOrDefault(-1)

    private fun requestScenePermission() {
        // Two runtime permissions, requested together so the user answers once:
        // scene data places the emitter ring, hand tracking drives the panels.
        // Both are optional: denying scene keeps a 1 m ring, denying hands keeps
        // the controllers usable (VRC.Quest.Security.2).
        val wanted = ArrayList<String>()
        if (checkSelfPermission(PERMISSIONS.scene) != PackageManager.PERMISSION_GRANTED) {
            wanted += PERMISSIONS.scene
        }
        if (checkSelfPermission(PERMISSIONS.handTracking) != PackageManager.PERMISSION_GRANTED) {
            wanted += PERMISSIONS.handTracking
        }
        if (wanted.isNotEmpty()) {
            requestPermissions(wanted.toTypedArray(), REQUEST_USE_SCENE)
        } else if (!SceneBridge.granted) {
            // Already granted on an earlier run: no prompt, no callback, but the
            // ring still needs the room and Settings still needs to say so.
            SceneBridge.onPermissionResult(true, this)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_USE_SCENE) return
        val sceneIndex = permissions.indexOf(PERMISSIONS.scene)
        val granted =
            sceneIndex >= 0 && grantResults.getOrNull(sceneIndex) == PackageManager.PERMISSION_GRANTED
        val handsIndex = permissions.indexOf(PERMISSIONS.handTracking)
        val hands =
            handsIndex < 0 || grantResults.getOrNull(handsIndex) == PackageManager.PERMISSION_GRANTED
        Log.i(TAG, "permissions: scene=$granted hands=$hands os=${horizonOsApi()}")
        SceneBridge.onPermissionResult(granted, this)
    }

    companion object {
        private const val TAG = "modplay-xr"
        private const val RECENTER_DEBOUNCE_NS = 250_000_000L

        /**
         * Namespaces differ per permission, and each is the one the current
         * Spatial SDK pages use: `USE_SCENE` under com.oculus.permission (the
         * horizonos.* form only shows up as a system-side implicit grant), hand
         * tracking under horizonos.permission.
         */
        private object PERMISSIONS {
            const val scene = "com.oculus.permission.USE_SCENE"
            const val handTracking = "horizonos.permission.HAND_TRACKING"
        }
        const val REQUEST_USE_SCENE = 1
        const val REQUEST_PICK_MODULES = 2
        const val REQUEST_PICK_TREE = 3
    }
}
