package com.bitti06.modplayjs.xr

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import androidx.compose.ui.platform.ComposeView
import com.bitti06.modplayjs.engine.ModuleCatalog
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
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Vector3
import com.meta.spatial.core.SpatialFeature
import com.meta.spatial.core.SystemBase
import com.meta.spatial.isdk.IsdkDefaultCursorSystem
import com.meta.spatial.isdk.IsdkSystem
import com.meta.spatial.mruk.MRUKFeature
import com.meta.spatial.mruk.MRUKRoom
import com.meta.spatial.mruk.MRUKSceneEventListener
import com.meta.spatial.runtime.PanelShapeLayerBlendType
import com.meta.spatial.runtime.ReferenceSpace
import com.meta.spatial.spatialaudio.SpatialAudioFeature
import com.meta.spatial.toolkit.AppSystemActivity
import com.meta.spatial.toolkit.DpPerMeterDisplayOptions
import com.meta.spatial.toolkit.MeshCollision
import com.meta.spatial.toolkit.Panel
import com.meta.spatial.toolkit.PanelRegistration
import com.meta.spatial.toolkit.PlayerBodyAttachmentSystem
import com.meta.spatial.toolkit.QuadShapeOptions
import com.meta.spatial.toolkit.PanelSettings
import com.meta.spatial.toolkit.PanelRenderMode
import com.meta.spatial.toolkit.PanelStyleOptions
import com.meta.spatial.toolkit.Transform
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
    private var isdkSystem: IsdkSystem? = null
    private var cursorSystem: IsdkDefaultCursorSystem? = null
    /** What the input systems were last told; re-asserted after a reload. */
    private var iskdInputActive = false
    private var lastRecenterNs = 0L
    /** The arc is placed once, anchored to the head position. */
    private var panelsPlaced = false
    /** Last listener/occluder push to the mixer. */
    private var lastSpatialFeedNs = 0L
    private var anchoredToHead = false
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
                        setContent { XrTheme { PanelContent(spec) } }
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
                // OPAQUE, not ALPHA_BLEND: every panel surface is a full
                // rectangle (PanelScaffold paints it edge to edge), so there is
                // no interior alpha to blend. ALPHA_BLEND makes the compositor
                // analyse the alpha of the whole texture every frame, and it
                // does not write depth. The only transparent panel - details -
                // overrides this with the hole-punch recipe in
                // TransparentPanelSettings.
                rendering =
                    UIPanelRenderOptions(
                        renderMode =
                            PanelRenderMode.Layer(
                                layerBlendType = PanelShapeLayerBlendType.OPAQUE,
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
        // The extension -> format bridge table comes from the asset manifest.
        ModuleCatalog.load(this)
        player = XrPlayer(this)
        library = Library(this)
        playlist = Playlist(library, player) { XrStore.recentsChanged() }
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
        // No setViewOrigin here. It positions the *viewer*, not the world: the
        // documented example calls setViewOrigin(0, 0, 2, 180) to stand the
        // viewer two metres forward. Passing zeros put the eye at the floor
        // origin, so panels authored at 1.45 m looked a metre and a half above
        // the user. Leaving it alone keeps the eye at head height in the floor
        // space.
        // Documented knob: multiplies thumbstick scroll speed on panels. 1.6
        // lets a 32-channel pattern be crossed in a reasonable time.
        scene.setPanelControllerScrollFactor(1.6f)
        // VRC.Quest.Performance.1: interactive apps must hold an allowed refresh
        // rate, not necessarily the lowest one. 72 Hz is what every Quest
        // supports, but on Quest 3 it is below the 90 Hz the system runs at,
        // and tracked hands and the pointer are sampled and displayed once per
        // frame: at 72 Hz the pose prediction horizon is ~23 ms against ~18 ms
        // at 90, and hand motion updates 72 instead of 90 times a second. The
        // app renders in about 2.5 ms of GPU time, so 90 Hz stays far inside
        // the 11 ms frame budget. If the device rejects it, 72 remains.
        val displayRate =
            if (scene.setPreferredDisplayRate(90f)) {
                90
            } else {
                scene.setPreferredDisplayRate(72f)
                72
            }
        Log.i(TAG, "display rate $displayRate Hz")
        XrScene.install(scene, this, launchedInPassthrough = scene.isSystemPassthroughEnabled())

        isdkSystem = runCatching { systemManager.findSystem<IsdkSystem>() }.getOrNull()
        cursorSystem = runCatching { systemManager.findSystem<IsdkDefaultCursorSystem>() }.getOrNull()
        applyInputState()
        // VRC.Quest.Input.1 (menu button) and the visible laser: both are the
        // app's job under the Interaction SDK.
        systemManager.registerSystem(ControllerInputSystem { XrStore.toggleSettings() })
        Log.i(TAG, "input: isdk=${isdkSystem?.active} cursor=${cursorSystem != null}")

        for (spec in PANELS) {
            panels[spec.id] =
                Entity.create(
                    Panel(spec.androidId, MeshCollision.LineTest),
                    // A panel must have a Transform from the first frame: the
                    // ISDK reads it on its first tick and a missing component
                    // is a native assert, not a nullable read. This is a
                    // placeholder until the anchored placement below runs.
                    Transform(spec.pose),
                    Visible(false),
                )
        }

        registerArcAnchor()
        activityScope.launch { XrStore.state.collect { applyState(it) } }

        Log.i(TAG, "panels placed: ${panels.size}, free=${placement.free}")
    }

    /**
     * Apply one state: place the arc when the loaded track changed, then show
     * exactly the panels [visiblePanels] names.
     */
    private fun applyState(state: XrState) {
        if (!panelsPlaced) {
            // Show the arc in this very emission. Panels are created hidden so
            // the placeholder Transform is never on screen; waiting for the
            // avatar body before revealing them left the room empty, because
            // the body arrives well after the scene and the state flow only
            // emits when something changes. The authored poses are the
            // fallback; the head anchor moves the arc once it is readable.
            placement.apply(panels, force = true)
            panelsPlaced = true
            // The head may already be readable in this first emission; the
            // per-frame system is only the retry.
            anchorArcToHead()
        }
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

    /**
     * Retry the head anchor once per frame until it succeeds.
     *
     * The state flow only emits when something changes, so it cannot be the
     * retry clock: without an emission there was no retry, and the arc stayed
     * where the authored poses put it. `SystemBase.execute` is the documented
     * place for per-frame work. The race is bounded to a few seconds so a panel
     * grabbed early is never pulled out of a hand by a late anchor.
     */
    private fun registerArcAnchor() {
        systemManager.registerSystem(
            object : SystemBase() {
                /** ~5 s at 72 Hz; enough for the avatar, and bounded. */
                private var frames = 0

                override fun execute() {
                    if (!panelsPlaced) return
                    if (!anchoredToHead) {
                        if (frames++ > 360) {
                            anchoredToHead = true
                            Log.w(TAG, "arc not anchored: no head pose within 5 s")
                        } else {
                            anchorArcToHead()
                        }
                    }
                    // The mixer needs the ear position for distance and the
                    // panels for occlusion. Both are ECS reads, so they belong
                    // here on the main thread; 10 Hz is enough, the mixer
                    // smooths the gains.
                    val now = System.nanoTime()
                    if (now - lastSpatialFeedNs < SPATIAL_FEED_NS) return
                    lastSpatialFeedNs = now
                    feedSpatialInputs()
                }
            },
        )
    }

    /**
     * Publish the listener pose and the opaque panel boxes to the player.
     *
     * Seven floats per panel: centre, yaw, half extents. The details shelf is
     * transparent and therefore not an occluder; a 4 cm depth keeps a ray from
     * slipping through a panel that is nearly edge-on.
     */
    private fun feedSpatialInputs() {
        // Occluders do not depend on the head, so they are published even
        // before the avatar exists and the pose is still unreadable.
        readHeadPose()?.let { head ->
            val (yaw, pitch) = headYawPitch(head.q)
            player.setListener(head.t.x, head.t.y, head.t.z, yaw, pitch)
        }

        val boxes = ArrayList<Float>(PANELS.size * 7)
        for (spec in PANELS) {
            if (spec.transparent) continue
            val entity = panels[spec.id] ?: continue
            val pose = readEntityPose(entity) ?: continue
            boxes.add(pose.t.x)
            boxes.add(pose.t.y)
            boxes.add(pose.t.z)
            boxes.add(yawOf(pose.q))
            boxes.add(spec.width / 2f)
            boxes.add(spec.height / 2f)
            boxes.add(PANEL_HALF_THICKNESS)
        }
        player.setOccluders(boxes.toFloatArray())
    }

    private fun readEntityPose(entity: Entity): Pose? {
        val transform = runCatching { entity.getComponent<Transform>() }.getOrNull() ?: return null
        return try {
            val pose = transform.transform
            Pose(
                Vector3(pose.t.x, pose.t.y, pose.t.z),
                Quaternion(w = pose.q.w, x = pose.q.x, y = pose.q.y, z = pose.q.z),
            )
        } finally {
            runCatching { transform.recycle() }
        }
    }

    /** Yaw of a quaternion that only carries a rotation around Y. */
    private fun yawOf(q: Quaternion): Float =
        kotlin.math.atan2(
            2f * (q.w * q.y + q.x * q.z),
            1f - 2f * (q.y * q.y + q.z * q.z),
        )

    /**
     * Yaw and pitch of a head quaternion, in radians.
     *
     * Pitch is positive when looking up. It is derived from the rotated forward
     * vector rather than from the Euler decomposition, so a roll (which the
     * runtime reports when the user lies on their side) cannot make the pitch
     * ambiguous.
     */
    private fun headYawPitch(q: Quaternion): Pair<Float, Float> {
        val yaw = yawOf(q)
        // Forward is (0,0,-1) in this SDK (a panel's front is its local -Z).
        // Rotating it by q gives y = 2(w·x - y·z) = sin(pitch), positive when
        // the user looks up.
        val fy = 2f * (q.w * q.x - q.y * q.z)
        return yaw to kotlin.math.asin(fy.coerceIn(-1f, 1f))
    }

    /**
     * Move the arc from the world origin to the user's head, once.
     *
     * `PANELS` authors the arc around an eye at 1.6 m on the origin. The real
     * eye is wherever the runtime put the reference space, which in this room
     * was metres away, so the same poses showed the panels far ahead. The head
     * entity only exists after the avatar is attached; [placement] keeps the
     * authored poses until then, so this corrects the arc, it never gates it.
     */
    private fun anchorArcToHead() {
        val head = readHeadPose() ?: return
        placement.setAnchor(head)
        // force: a panel already holds the placeholder Transform from creation,
        // which apply() would otherwise leave alone in free mode.
        placement.apply(panels, force = true)
        // The bus ring is built from the same pose, so panels and sound share
        // one frame: height from the ear, centre from the listener, yaw from
        // where the user is looking.
        player.setRingAuto(
            player.ringRadius(),
            head.t.x,
            head.t.z,
        )
        player.recenterRing(head.t.x, head.t.y, head.t.z, yawOf(head.q))
        anchoredToHead = true
        Log.i(
            TAG,
            "arc anchored to head at (${head.t.x}, ${head.t.y}, ${head.t.z}) " +
                "yaw=${Math.toDegrees(yawOf(head.q).toDouble()).toInt()}",
        )
    }

    /** Called once the user grants the runtime USE_SCENE permission. */
    fun onScenePermissionGranted() {
        // Room changes are a first-class event: a repeated space setup or a
        // different room used to leave the radius and the reverb tail on the
        // old bounds, because the scene was read exactly once.
        mrukFeature.addSceneEventListener(
            object : MRUKSceneEventListener {
                override fun onRoomUpdated(room: MRUKRoom) {
                    runOnUiThread { applyRoom(room) }
                }

                override fun onRoomAdded(room: MRUKRoom) {
                    runOnUiThread { applyRoom(room) }
                }
            },
        )
        mrukFeature.loadSceneFromDevice().whenComplete { _, _ ->
            runOnUiThread {
                mrukFeature.getCurrentRoom()?.let { applyRoom(it) }
            }
        }
    }

    /**
     * Radius and reverb from the room bounds.
     *
     * The ring is never centred on the room: MRUK reports its bounds in its own
     * coordinate space - the runtime logs a scene origin offset of about
     * -1.3 / -1.0 m and a rotation - while the audio objects live in the app's
     * reference space. Only the size is taken from the room; the centre stays
     * on the listener, and the height on the ear.
     */
    private fun applyRoom(room: MRUKRoom) {
        if (!::player.isInitialized) return
        val size = room.roomBounds.size()
        val head = readHeadPose()
        player.setRingAuto(
            XrPlayer.autoRadius(size.x, size.z),
            head?.t?.x ?: player.ringCenterX(),
            head?.t?.z ?: player.ringCenterZ(),
        )
        // Sabine estimate for the room reverb, from the same bounds.
        player.setRoomSize(size.x, size.y, size.z)
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

        // A recenter moves and rotates the LOCAL_FLOOR origin. Every entity
        // keeps its coordinates and the user gets a new frame, so an anchor
        // taken before the recenter puts the arc metres away. Re-read the head
        // and rebuild both the arc and the ring from it. Free placements are
        // left alone: the user put those in the world on purpose.
        val head = readHeadPose()
        if (head != null && ::placement.isInitialized) {
            placement.setAnchor(head)
            if (!placement.free) placement.apply(panels, force = true)
            if (::player.isInitialized) {
                player.recenterRing(head.t.x, head.t.y, head.t.z, yawOf(head.q))
            }
            Log.i(
                TAG,
                "recenter: head at (${head.t.x}, ${head.t.y}, ${head.t.z}) " +
                    "free=${placement.free}",
            )
        }
        XrScene.reapply()
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
        setInputActive(true)
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
     * Window focus is not app focus.
     *
     * Every Compose panel is its own Android activity, so aiming at a panel and
     * pressing a button moves window focus to that panel and this callback
     * reports `false` for the immersive activity. Gating input on it switched the
     * pointer off on the first panel click. VR focus is handled by
     * [onVRReady] / [onVRPause]; here only the layout is saved.
     */
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        Log.i(TAG, "window focus=$hasFocus")
        if (!hasFocus) saveFreeLayout()
    }

    /** The VR session is active again: the pointer may run. */
    override fun onVRReady() {
        super.onVRReady()
        setInputActive(true)
    }

    /** The session is paused (system UI, passthrough, headset off). */
    override fun onVRPause() {
        super.onVRPause()
        setInputActive(false)
    }

    /**
     * Head pose of the local player, copied out of the borrowed Transform.
     * `null` until the avatar body exists.
     */
    private fun readHeadPose(): Pose? {
        val body =
            runCatching {
                systemManager.tryFindSystem<PlayerBodyAttachmentSystem>()?.tryGetLocalPlayerAvatarBody()
            }.getOrNull() ?: return null
        return try {
            val transform =
                runCatching { body.head.getComponent<Transform>() }.getOrNull() ?: return null
            try {
                val pose = transform.transform
                Pose(
                    Vector3(pose.t.x, pose.t.y, pose.t.z),
                    Quaternion(w = pose.q.w, x = pose.q.x, y = pose.q.y, z = pose.q.z),
                )
            } finally {
                runCatching { transform.recycle() }
            }
        } finally {
            runCatching { body.recycle() }
        }
    }

    private fun saveFreeLayout() {
        if (::placement.isInitialized && placement.free) placement.save(panels)
    }

    /**
     * VRC.Quest.Input.4: ignore input while another app has focus.
     *
     * `IsdkSystem` stops ticking, which is where every pointer event is
     * generated. The cursor system is only ever switched on, never off: its
     * `enableInput(false)` empties the cursor and laser pools, and after a
     * headset off/on cycle the pools were not rebuilt, which is why the pointer
     * stayed dead once focus came back.
     *
     * It is driven by the VR session callbacks (`onVRReady` / `onVRPause`) and
     * re-asserted on HMD mount, so a session restart cannot leave the pointer
     * switched off.
     */
    private fun setInputActive(active: Boolean) {
        if (iskdInputActive == active) return
        iskdInputActive = active
        applyInputState()
        Log.i(TAG, "input active=$active")
    }

    /**
     * Push the current switch into the systems. Separate from
     * [setInputActive] because the systems are found later than the first
     * `onVRReady`: the scene becomes ready after the session, so the state has
     * to be applied again once they exist.
     */
    private fun applyInputState() {
        isdkSystem?.active = iskdInputActive
        if (iskdInputActive) cursorSystem?.enableInput(true)
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
        private const val SPATIAL_FEED_NS = 100_000_000L
        /** Half thickness of a panel used as an acoustic occluder. */
        private const val PANEL_HALF_THICKNESS = 0.02f

        /**
         * Namespaces differ per permission, and each is the one current Meta
         * documentation uses: `USE_SCENE` under com.oculus.permission (the
         * horizonos.* form only shows up as a system-side implicit grant), and
         * hand tracking under com.oculus.permission as well - that is the name
         * on the hand-tracking page, in the Spatial SDK manifest template and
         * in every Spatial SDK sample. `horizonos.permission.HAND_TRACKING`
         * does not exist in any Meta document; requesting it returns DENIED
         * and leaves the process without the grant, which is what makes the
         * runtime refuse the hand tracker.
         */
        private object PERMISSIONS {
            const val scene = "com.oculus.permission.USE_SCENE"
            const val handTracking = "com.oculus.permission.HAND_TRACKING"
        }
        const val REQUEST_USE_SCENE = 1
        const val REQUEST_PICK_MODULES = 2
        const val REQUEST_PICK_TREE = 3
    }
}

/**
 * Compose a panel only while it is on screen.
 *
 * All eight panels exist as windows from the start, so all eight used to keep
 * their whole composition alive and recompose on every state change - eight
 * Compose trees for the two or three panels anyone can see. Returning before
 * `spec.content()` releases the hidden ones; they compose again when they
 * become visible.
 */
@Composable
private fun PanelContent(spec: PanelSpec) {
    val isVisible by remember(spec.id) {
        XrStore.state.map { spec.id in visiblePanels(it) }.distinctUntilChanged()
    }.collectAsState(initial = spec.id in visiblePanels(XrStore.state.value))

    if (isVisible) spec.content()
}
