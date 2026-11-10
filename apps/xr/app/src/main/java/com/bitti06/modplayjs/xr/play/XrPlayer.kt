package com.bitti06.modplayjs.xr.play

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.util.Log
import androidx.core.content.edit
import com.bitti06.modplayjs.engine.ModuleCatalog
import androidx.core.net.toUri
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.xr.state.Playhead
import com.bitti06.modplayjs.engine.EngineJson
import com.bitti06.modplayjs.engine.PatternColors
import com.bitti06.modplayjs.engine.SettingsStore
import com.bitti06.modplayjs.engine.V8Engine
import com.bitti06.modplayjs.xr.audio.Direction
import com.bitti06.modplayjs.xr.audio.SpatialLayout
import com.meta.spatial.core.Color4
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Vector3
import com.meta.spatial.runtime.Scene
import com.meta.spatial.spatialaudio.AudioSessionId
import com.meta.spatial.spatialaudio.AudioType
import com.meta.spatial.spatialaudio.SoundfieldOrientation
import com.meta.spatial.spatialaudio.SoundfieldOrientationType
import com.meta.spatial.spatialaudio.SpatialAudioFeature
import com.meta.spatial.toolkit.Grabbable
import com.meta.spatial.toolkit.GrabbableType
import com.meta.spatial.toolkit.Material
import com.meta.spatial.toolkit.Mesh
import com.meta.spatial.toolkit.MeshCollision
import com.meta.spatial.toolkit.Scale
import com.meta.spatial.toolkit.Sphere
import com.meta.spatial.toolkit.Text3D
import com.meta.spatial.toolkit.Transform
import com.meta.spatial.toolkit.Visible
import com.bitti06.modplayjs.xr.R
import com.meta.spatial.core.ComponentBase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Where the ring sits while the listener moves.
 *
 * WORLD keeps the stage in the room (walking carries you between channels).
 * STICKY is the experimental live mode: the ring follows the head position
 * continuously but keeps its world yaw, so turning the head still reveals the
 * side channels. LOCKED also follows the head yaw (the old "ring follows you").
 */
enum class RingFollow { WORLD, STICKY, LOCKED }

/**
 * Owns the V8 render thread and AudioTrack streaming.
 *
 * All V8 methods must run on the exact same thread that created the V8 Isolate.
 * Here, `engine` is created inside the `"modplay-xr-audio"` thread when `start()` is called.
 */
class XrPlayer(
    private val context: Context,
) {
    data class State(
        val loaded: Boolean = false,
        val title: String = "",
        val format: String = "",
        val channels: Int = 0,
        val playing: Boolean = false,
        val positionMs: Long = 0,
        val durationMs: Long = 0,
        val spatialAvailable: Boolean = false,
        val spatialEnabled: Boolean = false,
        val layout: String = "panned",
        val azimuths: List<Float> = emptyList(),
        val elevations: List<Float> = emptyList(),
        val muted: Set<Int> = emptySet(),
        val solo: Int = -1,
        val error: String? = null,
        val debugSources: Boolean = false,
        val levels: List<Float> = emptyList(),
        val volume: Int = 100,
        val pattern: PatternData = PatternData(),
        val details: List<Pair<String, String>> = emptyList(),
        val message: String = "",
        /** Engine capabilities: mute, pattern view, mixer, pan are optional. */
        val canMute: Boolean = false,
        val canPattern: Boolean = false,
        val canMixer: Boolean = false,
        val canPan: Boolean = false,
        /** View settings the panels read; they live in the engine's settings. */
        val follow: Boolean = true,
        val visualizer: String = "off",
        val showChannelStrip: Boolean = true,
        val stripDots: Boolean = false,
        val sampleLengths: Boolean = true,
        val sampleLoopFlags: Boolean = true,
        val patternColors: PatternColors = PatternColors(),
        val seekable: Boolean = false,
        val trackDetail: TrackDetail = TrackDetail(),
    )

    data class TrackDetail(
        val instrumentList: List<String> = emptyList(),
        val sampleList: List<String> = emptyList(),
        val orderList: String = "",
    )

    data class PatternData(
        val pattern: Int = 0,
        val rows: Int = 0,
        val channels: Int = 0,
        val cells: List<String> = emptyList(),
        val row: Int = 0,
    )

    /**
     * Preferences of the XR app. Read before the first state, so the spatial
     * toggle already shows the stored value (on by default) before a module is
     * loaded - the panels read the state, not the preference.
     */
    private val prefs = context.getSharedPreferences("xr", Context.MODE_PRIVATE)

    /** Settings persistence and snapshot parsing: never on the V8 thread. */
    private val ioScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val parseScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private val poller = EnginePoller(parseScope)

    @Volatile
    private var publishPending = false

    /**
     * The user's spatial choice, on by default. It is kept separately from
     * [spatialInfo] because the engine's own default is off: every rebuild
     * re-asserts this, so a `setSpatial` command that raced the isolate startup
     * cannot leave the app in stereo.
     */
    @Volatile
    private var spatialPreferred = prefs.getBoolean(KEY_SPATIAL, DEFAULT_SPATIAL)

    private val _state = MutableStateFlow(
        State(spatialEnabled = prefs.getBoolean(KEY_SPATIAL, DEFAULT_SPATIAL)),
    )
    val state: StateFlow<State> = _state.asStateFlow()

    /**
     * The playhead on its own flow. See [Playhead]: carrying the row in [State]
     * made every panel recompose on every row.
     */
    private val _playhead = MutableStateFlow(Playhead())
    val playhead: StateFlow<Playhead> = _playhead.asStateFlow()

    @Volatile
    private var engine: V8Engine? = null
    private val settingsStore = SettingsStore(context)
    @Volatile
    private var settings: AndroidSettings = settingsStore.load()

    private val queue = LinkedBlockingQueue<() -> Unit>()
    private val running = AtomicBoolean(false)
    private lateinit var thread: Thread

    private var scene: Scene? = null
    private var spatialAudio: SpatialAudioFeature? = null

    private val audioManager = context.getSystemService(AudioManager::class.java)
    private val outputs = ArrayList<TrackOut>()
    /**
     * The 32 bus entities and the ambisonic reverb entity. Main thread only:
     * every ECS read or write has to happen there. The graph is created once
     * per playback session and never rebuilt for a track change, which is what
     * removed the per-channel entity churn from the old design.
     */
    private val busEntities = ArrayList<Entity>()
    private var reverbEntity: Entity? = null

    /** The fixed output graph: one mono track per bus, one ambisonic reverb. */
    private var busTracks: Array<AudioTrack> = emptyArray()
    private var busBuffers: Array<ByteBuffer> = emptyArray()
    private var reverbTrack: AudioTrack? = null
    private var reverbBuffer: ByteBuffer? = null

    /** Sessions registered and entities created. Written on the main thread. */
    @Volatile private var busGraphReady = false

    /** The bus tracks are playing and the native mixer may write into them. */
    @Volatile private var busesReady = false

    /** Only a teardown changes this, so a track change cannot orphan entities. */
    @Volatile private var busGraphGeneration = 0

    /** Last ring geometry written to the bus entities. */
    private var placedRadius = -1f
    private var placedLayout = ""

    /**
     * True while a ring↔dome switch is moving the 32 bus entities. The mixer
     * would otherwise use the new directions with the old entity positions for
     * one frame; renderBlock writes silence until the main thread has placed
     * the entities and the new directions are handed to the panner.
     */
    private var layoutSwitchPending = false
    private var placedX = Float.NaN
    private var placedZ = Float.NaN
    private var placedY = Float.NaN
    private var placedTilt = Float.NaN
    private var placedYaw = Float.NaN

    /** Listener and panel boxes arrive from the activity, read by the mixer. */
    @Volatile private var listenerPos = Vector3(0f, RING_Y, 0f)
    @Volatile private var occluders = FloatArray(0)

    @Volatile private var roomWidth = 4f
    @Volatile private var roomDepth = 5f
    @Volatile private var roomHeight = 2.6f
    @Volatile private var wetPercent = prefs.getInt(KEY_WET, 25)
    @Volatile private var spreadDeg = prefs.getFloat(KEY_SPREAD, 0f)

    /** Reused every push; 6 floats per source. */
    private val sourceParams = FloatArray(MAX_SOURCES * 6)
    private var lastSourceAt = 0L

    /** Invalidates a pending create when the outputs are rebuilt again. */
    @Volatile
    private var audioGeneration = 0
    @Volatile
    private var outputMode: Int = 0 // 0 none, 1 stereo, 2 spatial
    private var outChannels = 0

    /** Written on the audio thread, read again when a posted marker job runs. */
    @Volatile
    private var debugVisible = false

    /** Marker entities are created and mutated on the main thread only. */
    private val markers = ArrayList<Entity>()
    private val markerLabels = ArrayList<Entity>()
    /** World point of each label, so the billboard pass does not read ECS. */
    private val labelPoints = ArrayList<Vector3>()
    /** Last yaw written per label, radians; a still head writes nothing. */
    private var labelYaw = FloatArray(0)

    /** Grabbed marker positions, copied on the main thread for the mixer. */
    @Volatile
    private var grabOverrides: Array<Vector3?> = arrayOfNulls(MAX_SOURCES)
    @Volatile
    private var levels = FloatArray(0)
    private var radiusManual = prefs.getBoolean(KEY_RADIUS_MANUAL, false)
    private var ringRadius = prefs.getFloat(KEY_RADIUS, 1.8f)
    private var ringCenterX = 0f
    private var ringCenterZ = 0f

    /**
     * Height of the ring plane. It is the ear height read from the head pose,
     * not a constant: with the ring fixed at 1.40 m a listener lying down (head
     * around 0.60 m) had all 32 buses 80 cm above their ears, which put every
     * channel overhead and made the distance gains quiet.
     */
    private var ringY = RING_Y

    /**
     * Ring follow mode. STICKY is the experimental live mode (position only,
     * world yaw); LOCKED keeps the old "ring follows you" behaviour (position
     * and yaw). The stored boolean from older builds migrates to LOCKED.
     */
    @Volatile
    private var ringFollow: RingFollow =
        RingFollow.entries.firstOrNull { it.name == prefs.getString(KEY_RING_FOLLOW_MODE, null) }
            ?: if (prefs.getBoolean(KEY_RING_FOLLOW, false)) RingFollow.LOCKED else RingFollow.WORLD

    /** Set once a real head pose has been applied, so (0,0) is never assumed. */
    private var ringAnchored = false

    /**
     * "Bühne kippt mit": in a reclined posture the ring plane follows the head
     * pitch instead of staying horizontal.
     *
     * Lying on your back and looking at the ceiling, the visual forward is up.
     * A horizontal ring then puts every channel beside or behind the head, and
     * the front channels are the ones you are not looking at. With this option
     * the ring rotates about the listener's right axis by the head pitch, so
     * azimuth 0 ends up in front of the eyes. Off by default: the horizontal
     * ring is the right thing for sitting and standing, and a tilted ring is
     * head-relative, so "walk between the channels" no longer works.
     */
    @Volatile
    private var ringTilts = prefs.getBoolean(KEY_RING_TILT, false)

    /**
     * Yaw of the ring itself, radians: where the user faced when the stage was
     * built. It turns the whole bus ring with the user instead of leaving
     * azimuth 0 pointing at world +Z, and it is the axis the recline tilt
     * rotates about.
     */
    @Volatile
    private var ringYawRad = 0f

    /** Head yaw/pitch of the last listener update, radians. */
    @Volatile
    private var headYaw = 0f

    @Volatile
    private var headPitch = 0f

    /** Smoothed applied tilt, radians. Keeps the plane from snapping. */
    private var tiltApplied = 0f

    /** Where the tilt is heading; [tiltApplied] eases towards it. */
    @Volatile
    private var tiltTarget = 0f

    private var lastTiltPlaceNs = 0L

    private var playing = false
    @Volatile
    private var loaded = false
    @Volatile
    private var durationMs = 0L
    private var lastSnapshotAt = 0L
    private var lastPlayheadAt = 0L
    private var lastMarkerAt = 0L
    @Volatile
    private var spatialInfo: SpatialInfo = SpatialInfo()
    /** False until the azimuths have been read once after a rebuild. */
    private var spatialSettled = false
    private var lastSpatialAt = 0L
    private var cachedPatternIndex = -1
    private var cachedPattern: PatternData? = null
    private var markerSizes = FloatArray(0)

    private val scratchShort = ShortArray(BLOCK * 2)

    /** Reused destination for the mono stems; no per-block JNI allocation. */
    private val spatialScratch = FloatArray(MAX_SOURCES * BLOCK)

    /** Silence for the bus gate; allocated once. */
    private val silentBytes = ByteArray(BLOCK * BYTES_PER_SAMPLE)
    private val silentReverbBytes = ByteArray(BLOCK * 4 * BYTES_PER_SAMPLE)

    private data class TrackOut(
        val index: Int,
        val sessionId: Int,
        val track: AudioTrack,
    )

    data class SpatialInfo(
        val enabled: Boolean = false,
        val available: Boolean = false,
        val layout: String = "panned",
        val channels: Int = 0,
        val directions: List<Direction> = emptyList(),
    ) {
        val azimuths: List<Float> get() = directions.map { it.azimuth }
    }

    fun attachScene(scene: Scene, spatialAudio: SpatialAudioFeature) {
        this.scene = scene
        this.spatialAudio = spatialAudio
    }

    /**
     * Ring/radius change. The marker sizes are reset because a rebuild after a
     * layout switch starts at the neutral size, not the last level.
     */
    fun setRing(radius: Float, centerX: Float, centerZ: Float) {
        submit {
            val clamped = radius.coerceIn(0.8f, 5.0f)
            if (clamped == ringRadius && centerX == ringCenterX && centerZ == ringCenterZ && radiusManual) {
                return@submit
            }
            radiusManual = true
            ringRadius = clamped
            ringCenterX = centerX
            ringCenterZ = centerZ
            prefs.edit {
                putFloat(KEY_RADIUS, ringRadius)
                putBoolean(KEY_RADIUS_MANUAL, true)
            }
            applyPositions()
            if (debugVisible) rebuildMarkers()
        }
    }

    fun setRingAuto(radius: Float, centerX: Float, centerZ: Float) {
        submit {
            val oldR = ringRadius
            if (!radiusManual) ringRadius = radius.coerceIn(1.0f, 4.0f)
            ringCenterX = centerX
            ringCenterZ = centerZ
            ringAnchored = true
            applyPositions()
            if (debugVisible && oldR != ringRadius) rebuildMarkers()
        }
    }

    /**
     * Rebuild the ring from a fresh head pose: height from the ear, centre from
     * the listener, radius unchanged unless it is on auto.
     *
     * This is what a recenter needs. The LOCAL_FLOOR origin moves, every entity
     * keeps its coordinates, so a ring placed before the recenter sits at the
     * wrong distance and the wrong height afterwards.
     */
    fun recenterRing(x: Float, y: Float, z: Float, yaw: Float) {
        submit {
            ringYawRad = yaw
            ringY = y.coerceIn(0.2f, 2.4f)
            ringCenterX = x
            ringCenterZ = z
            ringAnchored = true
            applyPositions()
        }
    }

    /**
     * Where the ring lives while the listener moves.
     *
     * Switching away from WORLD pulls the ring under the current head at once;
     * switching back to WORLD leaves it where it is, which is the point of the
     * world-anchored mode.
     */
    fun setRingFollow(mode: RingFollow) {
        if (mode == ringFollow) return
        ringFollow = mode
        prefs.edit { putString(KEY_RING_FOLLOW_MODE, mode.name) }
        if (mode != RingFollow.WORLD) {
            submit {
                ringCenterX = listenerPos.x
                ringCenterZ = listenerPos.z
                ringY = listenerPos.y.coerceIn(0.2f, 2.4f)
                if (mode == RingFollow.LOCKED) ringYawRad = headYaw
                ringAnchored = true
                applyPositions()
            }
        }
    }

    fun ringFollowMode(): RingFollow = ringFollow

    /** True when the ring follows the listener in any way. */
    fun isRingFollowsHead(): Boolean = ringFollow != RingFollow.WORLD

    /** Tilt the ring plane with the head when the listener reclines. */
    fun setRingTilts(on: Boolean) {
        ringTilts = on
        prefs.edit { putBoolean(KEY_RING_TILT, on) }
        submit {
            applyPositions()
        }
    }

    fun isRingTilts(): Boolean = ringTilts

    fun resetRadiusAuto() {
        submit {
            radiusManual = false
            prefs.edit { putBoolean(KEY_RADIUS_MANUAL, false) }
            applyPositions()
            if (debugVisible) rebuildMarkers()
        }
    }

    fun isRadiusManual(): Boolean = radiusManual

    fun ringCenterX(): Float = ringCenterX

    fun ringCenterZ(): Float = ringCenterZ

    fun ringRadius(): Float = ringRadius

    fun setRadius(radius: Float) = setRing(radius, ringCenterX, ringCenterZ)

    fun setDebugSources(on: Boolean) {
        submit {
            debugVisible = on
            if (on) rebuildMarkers() else destroyMarkers()
            publish(playing)
        }
    }

    fun start() {
        if (running.getAndSet(true)) return
        val spatial = spatialPreferred
        thread = Thread({
            // Audio priority, not MAX: MAX outranks the VR compositor and the
            // frame thread, so a long render block would drop frames.
            android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_AUDIO)
            engine = V8Engine(context)
            // Push the stored spatial choice before anything can render, so a
            // module loaded later opens its output in the right mode.
            engine?.command("""{"type":"setSpatial","enabled":$spatial}""")
            spatialInfo = spatialInfo.copy(enabled = spatial)
            loop()
        }, "modplay-xr-audio").apply { start() }
    }

    /**
     * Stop the render thread, then release the outputs.
     *
     * The order matters: releasing an AudioTrack while the audio thread is
     * inside `write(..., WRITE_BLOCKING)` on it is undefined. The loop wakes
     * from its idle poll within 50 ms and a blocking write returns after at
     * most one buffer (40 ms), so a short join is enough and keeps teardown
     * from racing the writer.
     */
    fun stop() {
        running.set(false)
        queue.clear()
        if (::thread.isInitialized && Thread.currentThread() !== thread) {
            runCatching { thread.join(STOP_JOIN_MS) }
        }
        releaseAll()
        ioScope.cancel()
        parseScope.cancel()
    }

    /** True once the HVSC database went to the SID service. */
    private var sidLengthsLoaded = false

    /**
     * Give the SID service its tune lengths.
     *
     * A SID file has no runtime of its own; the number comes from HVSC's
     * `Songlengths.md5`, keyed by the MD5 of the file. Without it the engine
     * reports 0 and the seekbar has nothing to scale against. Returns false when
     * the asset is missing, so a later attempt can retry.
     */
    private fun loadSongLengths(eng: V8Engine): Boolean {
        val text =
            runCatching {
                context.assets.open("Songlengths.md5").bufferedReader().use { it.readText() }
            }.getOrNull()
        if (text.isNullOrBlank()) {
            android.util.Log.w("modplay-xr", "no Songlengths.md5 asset: SID lengths stay unknown")
            return false
        }
        val json =
            kotlinx.serialization.json.buildJsonObject {
                put("type", "loadSidSongLengths")
                put("text", text)
            }.toString()
        return runCatching { eng.command(json) }.isSuccess.also { ok ->
            android.util.Log.i("modplay-xr", "song lengths ${if (ok) "loaded" else "failed"}")
        }
    }

    fun load(bytes: ByteArray, name: String, format: String, autoPlay: Boolean = true) {
        submit {
            try {
                val eng = engine ?: error("V8 engine unavailable")
                eng.command("{\"type\":\"pause\"}")
                playing = false
                // The format's bridge has to be installed before the engine can
                // probe the bytes: an unregistered plugin means every test()
                // fails and loadModule throws "module did not load".
                val bridge = ModuleCatalog.formatFor(name)
                if (bridge != null && !eng.installFormat(bridge)) {
                    error("format '$bridge' could not be installed")
                }
                // Installing the SID bridge is what creates the service that
                // owns the HVSC database, so the lengths have to arrive after it.
                if (bridge == "sid" && !sidLengthsLoaded) {
                    sidLengthsLoaded = loadSongLengths(eng)
                }
                cachedPatternIndex = -1
                cachedPattern = null
                eng.setSampleRate(SAMPLE_RATE)
                eng.load(bytes, name)
                pushSettings()
                durationMs = snapshotLong("durationMs")
                loaded = true
                if (autoPlay) {
                    eng.command("{\"type\":\"play\"}")
                    playing = true
                } else {
                    playing = false
                }
                rebuildOutputs()
                publish(playing)
            } catch (t: Throwable) {
                Log.e(TAG, "Failed to load module '$name'", t)
                cachedPatternIndex = -1
                cachedPattern = null
                loaded = false
                playing = false
                _state.value = _state.value.copy(
                    loaded = false,
                    playing = false,
                    error = t.message ?: "Failed to load module $name",
                )
                rebuildOutputs()
                publish(false)
            }
        }
    }

    /** Pause without toggling. Used when the headset comes off. */
    fun pause() {
        submit {
            if (!loaded || !playing) return@submit
            engine?.command("""{"type":"pause"}""")
            playing = false
            publish(false)
        }
    }

    /** Resume without toggling, only if a module is loaded and paused. */
    fun resume() {
        submit {
            if (!loaded || playing) return@submit
            engine?.command("""{"type":"play"}""")
            playing = true
            publish(true)
        }
    }

    fun togglePlay() {
        submit {
            if (!loaded) return@submit
            val eng = engine ?: return@submit
            if (playing) {
                eng.command("{\"type\":\"pause\"}")
                playing = false
            } else {
                eng.command("{\"type\":\"play\"}")
                playing = true
            }
            publish(playing)
        }
    }

    fun stopPlayback() {
        submit {
            engine?.command("{\"type\":\"stop\"}")
            playing = false
            publish(false)
        }
    }

    fun seek(ms: Long) {
        submit { engine?.command("""{"type":"seek","positionMs":$ms}""") }
    }

    @Volatile
    var onEnded: (() -> Unit)? = null

    /** End-of-module callback: never run it on the render thread. */
    private fun notifyEnded() {
        val callback = onEnded ?: return
        ioScope.launch { runCatching { callback() } }
    }

    fun setJamMode(on: Boolean) {
        submit {
            engine?.command("""{"type":"setJamMode","enabled":$on}""")
            settings = settings.copy(playback = settings.playback.copy(jamMode = on))
            saveSettingsAsync()
        }
    }

    fun update(transform: (AndroidSettings) -> AndroidSettings) {
        submit {
            val oldGrab = settings.view.grabSources
            settings = transform(settings)
            pushSettings()
            saveSettingsAsync()
            if (settings.view.grabSources != oldGrab) {
                applyPositions()
                if (debugVisible) rebuildMarkers()
            }
            publish(playing)
        }
    }

    fun settingsSnapshot(): AndroidSettings = settings

    fun sessionId(): Int =
        outputs.firstOrNull()?.sessionId ?: busTracks.firstOrNull()?.audioSessionId ?: 0

    fun setSpatialEnabled(enabled: Boolean) {
        spatialPreferred = enabled
        prefs.edit { putBoolean(KEY_SPATIAL, enabled) }
        submit {
            engine?.command("""{"type":"setSpatial","enabled":$enabled}""")
            spatialInfo = spatialInfo.copy(enabled = enabled)
            rebuildOutputs()
            publish(playing)
        }
    }

    fun setLayout(layout: String) {
        submit {
            engine?.command("""{"type":"setMixerLayout","value":"$layout"}""")
            settings = settings.copy(mixer = settings.mixer.copy(layout = layout))
            saveSettingsAsync()
            rebuildOutputs()
            // The bus layout (ring or dome) is geometry as well as panning:
            // move the 32 bus entities and hand the native panner the new
            // directions before the next block.
            applyPositions()
            publish(playing)
        }
    }

    fun setVolume(percent: Int) {
        val v = percent.coerceIn(0, 100)
        submit {
            // `settings` is owned by this thread, so the comparison has to
            // happen here. The slider commits once per drag, but a repeat
            // would still re-serialise settings and publish a full state.
            if (v == settings.transport.volume) return@submit
            engine?.command("""{"type":"setVolume","value":$v}""")
            settings = settings.copy(transport = settings.transport.copy(volume = v))
            saveSettingsAsync()
            publish(playing)
        }
    }

    fun toggleSolo(channel: Int) {
        submit {
            engine?.command("""{"type":"soloChannel","index":$channel}""")
            publish(playing)
        }
    }

    fun toggleMute(channel: Int) {
        submit {
            engine?.command("""{"type":"toggleChannelMute","index":$channel}""")
            publish(playing)
        }
    }

    // ---------------------------------------------------------------- thread

    private fun submit(block: () -> Unit) {
        queue.offer(block)
    }

    private fun loop() {
        while (running.get()) {
            var task = queue.poll()
            while (task != null) {
                runCatching(task).onFailure { Log.e(TAG, "command failed", it) }
                task = queue.poll()
            }
            if (playing && outputMode != 0) {
                // WRITE_BLOCKING paces this loop at one block per iteration.
                runCatching { renderBlock() }.onFailure { Log.e(TAG, "render failed", it) }
                maybeRefreshState()
            } else {
                // Idle: wait for a command instead of spinning at 250 Hz. The
                // 50 ms cap still lets the 1 Hz paused snapshot through.
                queue.poll(IDLE_POLL_MS, TimeUnit.MILLISECONDS)?.let { task ->
                    runCatching(task).onFailure { Log.e(TAG, "command failed", it) }
                }
                maybeRefreshState()
            }
        }
    }

    private fun renderBlock() {
        val eng = engine ?: return
        if (outputMode == 2) {
            if (layoutSwitchPending) {
                runCatching { writeBusSilence() }
                return
            }
            if (!busesReady) {
                // The fixed graph is being registered on the main thread.
                // If that already finished while this thread was still opening
                // the outputs, start it here; otherwise wait, because rendering
                // now would only produce blocks we have to drop.
                if (busGraphReady) startBuses()
                if (!busesReady) runCatching { Thread.sleep(4) }
                return
            }
            val stems = spatialScratch
            val n = eng.renderSpatialInto(stems, BLOCK)
            if (n >= outChannels * BLOCK) {
                writeBuses(stems)
                return
            }
            // A short block is the tail of a module: drop it and let the next
            // pass report the end. Switching to stereo here used to tear down
            // the spatial path for the rest of the session.
            if (n <= 0) {
                playing = false
                publish(false)
                notifyEnded()
            }
            return
        }
        val frames = eng.render(BLOCK)
        if (frames.isEmpty()) {
            if (playing) {
                playing = false
                publish(false)
                notifyEnded()
            }
            return
        }
        val n = frames.size
        // Hot loop: inline clamp, no per-sample Math.abs/max calls.
        for (i in 0 until n) {
            val v = frames[i]
            val c = if (v > 1f) 1f else if (v < -1f) -1f else v
            scratchShort[i] = (c * 32767f).toInt().toShort()
        }
        val out = outputs.firstOrNull()?.track
        if (out == null) {
            outputMode = 0
            return
        }
        out.write(scratchShort, 0, n, AudioTrack.WRITE_BLOCKING)
    }

    /**
     * Mix the stems into the fixed buses and write every bus track.
     *
     * The native side does distance, air absorption, occlusion, the bass split
     * and the pan; Kotlin only reads the peak levels for the debug view and
     * hands the direct buffers to the tracks. No per-channel track exists any
     * more, so the write cost is 32 buffers regardless of the module size.
     */
    private fun writeBuses(stems: FloatArray) {
        val channels = outChannels
        val eng = engine ?: return
        if (channels <= 0 || !busesReady || busTracks.isEmpty()) return

        if (debugVisible) {
            if (levels.size != channels) levels = FloatArray(channels)
            for (ch in 0 until channels) {
                var peak = 0f
                val base = ch * BLOCK
                for (i in 0 until BLOCK) {
                    val v = stems[base + i]
                    val a = if (v < 0f) -v else v
                    if (a > peak) peak = a
                }
                levels[ch] = (levels[ch] * 0.7f) + (peak * 0.3f)
            }
        }

        if (eng.mixSpatial(stems, channels, BLOCK) != 0) return

        for (b in busTracks.indices) {
            val buf = busBuffers[b]
            buf.clear()
            busTracks[b].write(buf, BLOCK * BYTES_PER_SAMPLE, AudioTrack.WRITE_BLOCKING)
        }
        val reverb = reverbTrack ?: return
        val reverbBuf = reverbBuffer ?: return
        reverbBuf.clear()
        reverb.write(reverbBuf, BLOCK * 4 * BYTES_PER_SAMPLE, AudioTrack.WRITE_BLOCKING)
    }

    // --------------------------------------------------------------- outputs

    private fun rebuildOutputs() {
        releaseOutputs()
        destroyMarkers()
        // The first read happens before the mixer has run, so the azimuths are
        // not final yet; a settle pass follows as soon as audio has ticked.
        spatialSettled = false
        // The peaks belong to the module that just stopped. Keeping them would
        // hand the old song's levels to the new markers and to the debug bars
        // until the first render block replaces them.
        levels = FloatArray(0)
        // The engine starts with spatial off. Pushing the choice again on every
        // rebuild makes the default stick even if the startup command was sent
        // before the isolate could take it.
        engine?.command("""{"type":"setSpatial","enabled":$spatialPreferred}""")
        val info = readSpatialInfo()
        spatialInfo = info
        if (!loaded) return
        val wantSpatial = info.enabled && info.available && info.channels > 0
        if (wantSpatial) {
            openSpatial(info)
        } else {
            openStereo()
        }
    }

    private fun openStereo() {
        val track = newTrack(AudioFormat.CHANNEL_OUT_STEREO, null, 2)
        outputs += TrackOut(0, track.audioSessionId, track)
        outputMode = 1
        outChannels = 1
        val silence = ShortArray(BLOCK * 4)
        runCatching {
            track.write(silence, 0, silence.size, AudioTrack.WRITE_BLOCKING)
            track.write(silence, 0, silence.size, AudioTrack.WRITE_BLOCKING)
        }
        track.play()
    }

    private fun openSpatial(info: SpatialInfo) {
        if (spatialAudio == null || scene == null) {
            openStereo()
            return
        }
        ensureBuses()
        if (busTracks.isEmpty()) {
            // The native mixer refused its buffers: stereo is better than silence.
            openStereo()
            return
        }
        outChannels = info.channels
        outputMode = 2
        if (busGraphReady) startBuses()
        pushSources()
        if (debugVisible) rebuildMarkers()
        Log.i(
            TAG,
            "spatial buses ${busTracks.size}, sources ${info.channels}, layout ${info.layout}",
        )
    }

    /**
     * Build the fixed output graph once per playback session.
     *
     * 32 mono tracks and one 4-channel ambisonic track, each with its own
     * session id. Sessions and entities are created on the main thread; the
     * native mixer gets the direct buffer addresses. Nothing here is rebuilt
     * for a track change - only the source parameters are pushed afterwards.
     */
    private fun ensureBuses() {
        if (busTracks.isNotEmpty()) return
        val feature = spatialAudio ?: return

        val tracks =
            runCatching {
                Array(BUS_COUNT) {
                    newTrack(
                        AudioFormat.CHANNEL_OUT_MONO,
                        audioManager?.generateAudioSessionId() ?: 0,
                        1,
                    )
                }
            }.getOrNull() ?: return
        val buffers =
            Array(BUS_COUNT) {
                ByteBuffer.allocateDirect(BLOCK * BYTES_PER_SAMPLE)
                    .order(ByteOrder.nativeOrder())
            }
        // The reverb is optional: if a 4-channel track is not supported, the
        // buses still work and the mix stays dry instead of falling to stereo.
        val reverb =
            runCatching {
                newTrack(
                    AudioFormat.CHANNEL_OUT_QUAD,
                    audioManager?.generateAudioSessionId() ?: 0,
                    4,
                )
            }.getOrNull()
        val reverbBuf =
            reverb?.let {
                ByteBuffer.allocateDirect(BLOCK * 4 * BYTES_PER_SAMPLE)
                    .order(ByteOrder.nativeOrder())
            }

        val ok = engine?.startSpatialBuses(buffers, reverbBuf, SAMPLE_RATE, BLOCK, BUS_COUNT) == true
        if (!ok) {
            tracks.forEach { runCatching { it.release() } }
            reverb?.let { runCatching { it.release() } }
            Log.e(TAG, "native bus mixer unavailable")
            return
        }
        busTracks = tracks
        busBuffers = buffers
        reverbTrack = reverb
        reverbBuffer = reverbBuf
        engine?.setSpatialWet(wetPercent)
        engine?.setSpatialRoom(roomWidth, roomDepth, roomHeight, ROOM_ABSORPTION)
        engine?.setSpatialBuses(busDirectionArray(settings.mixer.layout))
        placedLayout = settings.mixer.layout

        // Snapshot the geometry: the bus entities must be created on the same
        // ring the mixer is already using, and the fields may move before the
        // posted job runs.
        val radius = ringRadius
        val cx = ringCenterX
        val cz = ringCenterZ
        val cy = ringY
        val generation = busGraphGeneration
        mainHandler.post {
            if (generation != busGraphGeneration) return@post
            for (i in tracks.indices) {
                feature.registerAudioSessionId(BUS_BASE + i, tracks[i].audioSessionId)
                busEntities +=
                    Entity.create(
                        Transform(Pose(busPositionOf(i, radius, cx, cz, cy))),
                        AudioSessionId(BUS_BASE + i, AudioType.MONO),
                    )
            }
            reverb?.let {
                feature.registerAudioSessionId(REVERB_ID, it.audioSessionId)
                reverbEntity =
                    Entity.create(
                        Transform(Pose(Vector3(cx, cy, cz))),
                        AudioSessionId(REVERB_ID, AudioType.AMBISONIC_ORDER_1),
                        SoundfieldOrientation(SoundfieldOrientationType.POSITION_Y_LOCKED),
                    )
            }
            placedRadius = radius
            placedX = cx
            placedZ = cz
            placedY = cy
            placedTilt = tiltApplied
            placedYaw = ringYawRad
            busGraphReady = true
            // The audio thread starts the tracks when it sees busGraphReady;
            // the silence prefill must not run on the main thread.
        }
    }

    /** Start (or resume) the fixed graph. Audio thread only. */
    private fun startBuses() {
        if (!busesReady) {
            val silence = ByteBuffer.allocateDirect(BLOCK * BYTES_PER_SAMPLE)
                .order(ByteOrder.nativeOrder())
            for (track in busTracks) {
                runCatching {
                    silence.clear()
                    track.write(silence, BLOCK * BYTES_PER_SAMPLE, AudioTrack.WRITE_BLOCKING)
                    silence.clear()
                    track.write(silence, BLOCK * BYTES_PER_SAMPLE, AudioTrack.WRITE_BLOCKING)
                }
            }
            reverbTrack?.let { rev ->
                val revSilence = ByteBuffer.allocateDirect(BLOCK * 4 * BYTES_PER_SAMPLE)
                    .order(ByteOrder.nativeOrder())
                runCatching {
                    revSilence.clear()
                    rev.write(revSilence, BLOCK * 4 * BYTES_PER_SAMPLE, AudioTrack.WRITE_BLOCKING)
                    revSilence.clear()
                    rev.write(revSilence, BLOCK * 4 * BYTES_PER_SAMPLE, AudioTrack.WRITE_BLOCKING)
                }
            }
        }
        for (track in busTracks) {
            if (track.playState != AudioTrack.PLAYSTATE_PLAYING) track.play()
        }
        reverbTrack?.let { if (it.playState != AudioTrack.PLAYSTATE_PLAYING) it.play() }
        busesReady = true
    }

    /** Put the buses on the ring again after a radius, centre or layout change. */
    private fun placeBuses() {
        if (busEntities.isEmpty()) return
        val layout = settings.mixer.layout
        val layoutChanged = placedLayout != layout
        if (!layoutChanged &&
            placedRadius == ringRadius &&
            placedX == ringCenterX &&
            placedZ == ringCenterZ &&
            placedY == ringY &&
            placedTilt == tiltApplied &&
            placedYaw == ringYawRad
        ) {
            return
        }
        placedRadius = ringRadius
        placedX = ringCenterX
        placedZ = ringCenterZ
        placedY = ringY
        placedTilt = tiltApplied
        placedYaw = ringYawRad
        placedLayout = layout
        if (layoutChanged) {
            layoutSwitchPending = true
        }
        val radius = ringRadius
        val cx = ringCenterX
        val cz = ringCenterZ
        val cy = ringY
        onMain {
            // Positions are computed here, from the snapshot taken above: the
            // audio thread may already be building the next ring while this
            // job is still queued.
            for (i in busEntities.indices) {
                busEntities[i].setComponent(Transform(Pose(busPositionOf(i, radius, cx, cz, cy))))
            }
            reverbEntity?.setComponent(Transform(Pose(Vector3(cx, cy, cz))))
            if (layoutChanged) {
                // The entities are in the new layout; hand the directions to
                // the panner on the audio thread and lift the gate.
                val dirs = busDirectionArray(layout)
                submit {
                    engine?.setSpatialBuses(dirs)
                    layoutSwitchPending = false
                }
            }
        }
    }

    /** Silence to every bus while a layout switch places the entities. */
    private fun writeBusSilence() {
        if (busTracks.isEmpty()) return
        for (b in busTracks.indices) {
            val buf = busBuffers[b]
            buf.clear()
            buf.put(silentBytes)
            buf.flip()
            busTracks[b].write(buf, BLOCK * BYTES_PER_SAMPLE, AudioTrack.WRITE_BLOCKING)
        }
        val reverb = reverbTrack
        val reverbBuf = reverbBuffer
        if (reverb != null && reverbBuf != null) {
            reverbBuf.clear()
            reverbBuf.put(silentReverbBytes)
            reverbBuf.flip()
            reverb.write(reverbBuf, BLOCK * 4 * BYTES_PER_SAMPLE, AudioTrack.WRITE_BLOCKING)
        }
    }

    /** Flattened xyz per bus, in the stage frame: what the native panner uses. */
    private fun busDirectionArray(layout: String): FloatArray {
        val dirs = SpatialLayout.busLayout(layout)
        val out = FloatArray(dirs.size * 3)
        for (i in dirs.indices) {
            val v = SpatialLayout.unit(dirs[i])
            out[i * 3] = v[0]
            out[i * 3 + 1] = v[1]
            out[i * 3 + 2] = v[2]
        }
        return out
    }

    /** Ring point for a bus, from the current bus layout. */
    private fun busPositionOf(index: Int, radius: Float, cx: Float, cz: Float, cy: Float): Vector3 {
        val dirs = SpatialLayout.busLayout(settings.mixer.layout)
        val d = dirs.getOrElse(index) { dirs.last() }
        return domePoint(d.azimuth, d.elevation, radius, cx, cz, cy)
    }

    /**
     * A point on the 3D dome, optionally tilted about the listener's right axis.
     */
    private fun domePoint(
        azimuthDeg: Float,
        elevationDeg: Float,
        radius: Float,
        cx: Float,
        cz: Float,
        cy: Float,
    ): Vector3 {
        val ringYaw = ringYawRad
        val azRad = Math.toRadians(azimuthDeg.toDouble()).toFloat() + ringYaw
        val elRad = Math.toRadians(elevationDeg.toDouble()).toFloat()

        val cosEl = Math.cos(elRad.toDouble()).toFloat()
        val sinEl = Math.sin(elRad.toDouble()).toFloat()

        val vx = (Math.sin(azRad.toDouble()).toFloat() * radius * cosEl)
        val vz = (Math.cos(azRad.toDouble()).toFloat() * radius * cosEl)
        val vy = radius * sinEl

        val tilt = tiltApplied
        if (tilt == 0f) return Vector3(cx + vx, cy + vy, cz + vz)

        val kx = Math.cos(ringYaw.toDouble()).toFloat()
        val kz = -Math.sin(ringYaw.toDouble()).toFloat()
        val c = Math.cos(tilt.toDouble()).toFloat()
        val s = Math.sin(tilt.toDouble()).toFloat()
        val kkv = kx * vx + kz * vz
        val crossY = kx * vz - kz * vx
        val rx = vx * c + kx * kkv * (1f - c)
        val rz = vz * c + kz * kkv * (1f - c)
        val ry = crossY * s + vy * c
        return Vector3(cx + rx, cy + ry, cz + rz)
    }


    /**
     * One streaming track.
     *
     * The buffer holds two render blocks. The audio thread writes exactly one
     * [BLOCK] (960 frames, 20 ms) per pass with WRITE_BLOCKING, so a buffer of
     * one block has no headroom at all: any preemption between two passes runs
     * the track dry and the next write waits for a whole block. Two blocks are
     * 40 ms of audio and 20 ms of slack, which is what a music player needs;
     * nothing here is monitoring input.
     *
     * The session id must be positive. `AudioManager.generateAudioSessionId()`
     * returns `AudioManager.ERROR` (-1) when allocation fails, and
     * `AudioTrack.Builder.setSessionId` rejects anything outside
     * `AUDIO_SESSION_ID_GENERATE` (0) and the positive range. Passing -1 threw
     * and took the whole output rebuild down with it.
     */
    private fun newTrack(channelMask: Int, sessionId: Int?, channels: Int = 1): AudioTrack {
        val minBuf =
            AudioTrack.getMinBufferSize(SAMPLE_RATE, channelMask, AudioFormat.ENCODING_PCM_16BIT)
                .takeIf { it > 0 } ?: 0
        val fourBlocks = BLOCK * 4 * channels * BYTES_PER_SAMPLE
        val builder = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(channelMask)
                    .build(),
            )
            .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setBufferSizeInBytes(maxOf(minBuf, fourBlocks))
        if (sessionId != null && sessionId > 0) builder.setSessionId(sessionId)
        return builder.build()
    }

    private fun releaseOutputs() {
        // Any create that is still queued must not run after this.
        audioGeneration++
        for (out in outputs) {
            runCatching { out.track.stop() }
            runCatching { out.track.release() }
        }
        outputs.clear()
        // The bus graph survives a track change; only its audio stops. Pausing
        // and flushing drops the queued blocks so the next module starts clean.
        if (busesReady) {
            for (track in busTracks) {
                runCatching { track.pause() }
                runCatching { track.flush() }
            }
            reverbTrack?.let {
                runCatching { it.pause() }
                runCatching { it.flush() }
            }
            busesReady = false
        }
        destroyMarkers()
        outputMode = 0
        outChannels = 0
    }

    /** Tear the fixed graph down: only stop() and the activity teardown. */
    private fun releaseAll() {
        audioGeneration++
        busGraphGeneration++
        for (out in outputs) {
            runCatching { out.track.stop() }
            runCatching { out.track.release() }
        }
        outputs.clear()
        runCatching { engine?.stopSpatialBuses() }
        for (track in busTracks) {
            runCatching { track.stop() }
            runCatching { track.release() }
        }
        busTracks = emptyArray()
        busBuffers = emptyArray()
        reverbTrack?.let {
            runCatching { it.stop() }
            runCatching { it.release() }
        }
        reverbTrack = null
        reverbBuffer = null
        busesReady = false
        busGraphReady = false
        onMain {
            for (e in busEntities) runCatching { e.destroy() }
            busEntities.clear()
            reverbEntity?.let { runCatching { it.destroy() } }
            reverbEntity = null
        }
        destroyMarkers()
        outputMode = 0
        outChannels = 0
    }

    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())

    /**
     * Run an ECS job on the main thread. Inline when already there, so a call
     * from the UI (layout reset, stop) does not reorder it behind a later post.
     */
    private fun onMain(block: () -> Unit) {
        if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) {
            block()
        } else {
            mainHandler.post(block)
        }
    }

    /**
     * Where a channel's sound is: a point on the stage at the channel's
     * direction, on the ring radius. Both panners place the phantom at this
     * direction (2D VBAP on the ring, a 3D kernel on the dome), so the marker
     * and the sound share one point.
     */
    private fun sourcePoint(
        direction: Direction,
        radius: Float,
        cx: Float,
        cz: Float,
        cy: Float,
    ): Vector3 = domePoint(direction.azimuth, direction.elevation, radius, cx, cz, cy)

    /**
     * Push new azimuths to the markers, the buses and the native mixer.
     *
     * There are no per-channel audio entities any more: the sound comes from
     * the fixed bus ring, so only the debug spheres still follow a channel.
     */
    private fun applyPositions() {
        placeBuses()
        moveMarkers()
        pushSources()
    }

    /**
     * Move the existing debug spheres and labels. Only the azimuths, the ring
     * and the tilt changed, so no entity has to be rebuilt.
     */
    private fun moveMarkers() {
        if (markers.isEmpty()) return
        val channels = minOf(spatialInfo.channels, MAX_SOURCES)
        if (channels <= 0) return
        val radius = ringRadius
        val cx = ringCenterX
        val cz = ringCenterZ
        val cy = ringY
        val overrides = grabOverrides
        val dirs = spatialInfo.directions
        val positions =
            Array(channels) { i ->
                overrides.getOrNull(i) ?: sourcePoint(
                    dirs.getOrElse(i) { Direction(0f) },
                    radius,
                    cx,
                    cz,
                    cy,
                )
            }
        mainHandler.post {
            for (i in 0 until minOf(channels, markers.size)) {
                val p = positions[i]
                markers[i].setComponent(Transform(Pose(p)))
                val label = Vector3(p.x, p.y + MARKER_LABEL_OFFSET, p.z)
                if (i < labelPoints.size) labelPoints[i] = label
                markerLabels.getOrNull(i)?.let { setLabelPose(it, label, i) }
            }
        }
    }

    /**
     * Point one channel label at the listener.
     *
     * `Text3D` is an extruded mesh with a fixed orientation: created at
     * identity it faces world +Z, so walking around the ring left labels
     * edge-on or mirrored. The billboard is yaw-only, because a full look-at
     * would tip the text when the listener looks down; a dead band keeps a
     * still head from writing a Transform thirty times a second.
     */
    private fun setLabelPose(label: Entity, point: Vector3, index: Int) {
        val dx = listenerPos.x - point.x
        val dz = listenerPos.z - point.z
        if (dx * dx + dz * dz < LABEL_MIN_DISTANCE_SQ) return
        val yaw = kotlin.math.atan2(dx, dz)
        val last = labelYaw.getOrNull(index) ?: Float.NaN
        if (!last.isNaN() && kotlin.math.abs(wrapPi(yaw - last)) < LABEL_YAW_STEP) return
        if (index < labelYaw.size) labelYaw[index] = yaw
        label.setComponent(
            Transform(
                Pose(
                    point,
                    Quaternion(0f, Math.toDegrees(yaw.toDouble()).toFloat(), 0f),
                ),
            ),
        )
    }

    /** Re-aim every label after the head moved. Main thread only. */
    private fun faceLabels() {
        for (i in markerLabels.indices) {
            val point = labelPoints.getOrNull(i) ?: continue
            setLabelPose(markerLabels[i], point, i)
        }
    }

    /**
     * Hand the mixer one parameter row per channel.
     *
     * A grabbed marker overrides the geometric position; the array is filled
     * on the main thread by [refreshGrabOverrides] and is immutable in between,
     * so the audio thread never reads an ECS component.
     */
    private fun pushSources() {
        val eng = engine ?: return
        if (outputMode != 2) return
        val channels = minOf(spatialInfo.channels, MAX_SOURCES)
        if (channels <= 0) return

        val listener = listenerPos
        val boxes = occluders
        val params = sourceParams
        val overrides = grabOverrides
        val dirs = spatialInfo.directions
        val radius = ringRadius
        val cx = ringCenterX
        val cz = ringCenterZ
        val cy = ringY
        val cY = kotlin.math.cos(ringYawRad)
        val sY = kotlin.math.sin(ringYawRad)
        val cT = kotlin.math.cos(tiltApplied)
        val sT = kotlin.math.sin(tiltApplied)
        for (i in 0 until channels) {
            val position =
                overrides.getOrNull(i) ?: sourcePoint(
                    dirs.getOrElse(i) { Direction(0f) },
                    radius,
                    cx,
                    cz,
                    cy,
                )

            val dx = position.x - listener.x
            val dy = position.y - listener.y
            val dz = position.z - listener.z
            val distance = kotlin.math.sqrt((dx * dx + dy * dy + dz * dz).toDouble()).toFloat()

            // Direction in the stage frame: undo the ring yaw and the tilt, so
            // the native panner works in the same local frame as the bus
            // directions it was given. Using the listener made a fixed marker
            // slide across the ring while walking.
            val rx = position.x - cx
            val ry = position.y - cy
            val rz = position.z - cz
            val vx = rx * cY - rz * sY
            val vz = rx * sY + rz * cY
            val vy = ry * cT - vz * sT
            val vz2 = ry * sT + vz * cT
            val horizontal = kotlin.math.sqrt(vx * vx + vz2 * vz2)
            val azimuth = Math.toDegrees(kotlin.math.atan2(vx.toDouble(), vz2.toDouble())).toFloat()
            val elevation = Math.toDegrees(kotlin.math.atan2(vy.toDouble(), horizontal.toDouble())).toFloat()

            val base = i * 6
            params[base] = azimuth
            params[base + 1] = elevation
            params[base + 2] = distance
            params[base + 3] = 1f
            params[base + 4] = spreadDeg
            params[base + 5] = occlusion(listener, position, boxes)
        }
        eng.setSpatialSources(params, channels)
    }

    /**
     * Read the live position of grabbed markers on the main thread.
     *
     * Called from the per-frame host system at the listener rate. When the
     * debug view is off, or nothing is grabbable, the overrides are cleared and
     * the mixer uses the geometric positions.
     */
    fun refreshGrabOverrides() {
        if (!debugVisible || !settings.view.grabSources || markers.isEmpty()) {
            if (grabOverrides.any { it != null }) grabOverrides = arrayOfNulls(MAX_SOURCES)
            return
        }
        val channels = minOf(spatialInfo.channels, MAX_SOURCES)
        val next = arrayOfNulls<Vector3>(MAX_SOURCES)
        for (i in 0 until minOf(channels, markers.size)) {
            val t = runCatching { markers[i].getComponent<Transform>() }.getOrNull() ?: continue
            try {
                val p = t.transform.t
                next[i] = Vector3(p.x, p.y, p.z)
            } finally {
                runCatching { t.recycle() }
            }
        }
        grabOverrides = next
    }

    /**
     * One ray from the ear to the source against the panel boxes.
     *
     * The boxes arrive as seven floats each: centre, yaw, half extents. A hit
     * means the panel is between the listener and the channel, which the mixer
     * turns into a gain reduction and a low-pass. The binary result is fine
     * because the mixer smooths the gain over ~30 ms.
     */
    private fun occlusion(origin: Vector3, target: Vector3, boxes: FloatArray): Float {
        if (boxes.isEmpty()) return 0f
        val dx = target.x - origin.x
        val dy = target.y - origin.y
        val dz = target.z - origin.z
        val length = kotlin.math.sqrt(dx * dx + dy * dy + dz * dz)
        if (length < 1e-3f) return 0f
        val ux = dx / length
        val uy = dy / length
        val uz = dz / length

        var i = 0
        while (i + 7 <= boxes.size) {
            val cx = boxes[i]
            val cy = boxes[i + 1]
            val cz = boxes[i + 2]
            val yaw = boxes[i + 3]
            val hx = boxes[i + 4]
            val hy = boxes[i + 5]
            val hz = boxes[i + 6]
            val c = kotlin.math.cos(yaw)
            val s = kotlin.math.sin(yaw)

            // World -> panel space (yaw only, the panels are upright).
            val ox = c * (origin.x - cx) - s * (origin.z - cz)
            val oz = s * (origin.x - cx) + c * (origin.z - cz)
            val oy = origin.y - cy
            val vx = c * ux - s * uz
            val vz = s * ux + c * uz

            var tMin = 0f
            var tMax = length
            var hit = true
            for (axis in 0 until 3) {
                val o = when (axis) { 0 -> ox; 1 -> oy; else -> oz }
                val d = when (axis) { 0 -> vx; 1 -> uy; else -> vz }
                val h = when (axis) { 0 -> hx; 1 -> hy; else -> hz }
                if (kotlin.math.abs(d) < 1e-6f) {
                    if (o < -h || o > h) { hit = false; break }
                } else {
                    var t1 = (-h - o) / d
                    var t2 = (h - o) / d
                    if (t1 > t2) { val tmp = t1; t1 = t2; t2 = tmp }
                    if (t1 > tMin) tMin = t1
                    if (t2 < tMax) tMax = t2
                    if (tMin > tMax) { hit = false; break }
                }
            }
            if (hit && tMin in 0f..length) return 1f
            i += 7
        }
        return 0f
    }

    // ---- listener, occluders, room (from the activity) -------------------

    /**
     * The ear position, published at 10 Hz by the activity.
     *
     * Two things follow from it. The ring height always tracks the ears, so a
     * listener lying down is not surrounded by buses 80 cm above their head.
     * The ring centre follows the listener only when the "mitwandern" option is
     * on; otherwise the stage stays anchored in the room and walking carries
     * you between the channels.
     */
    fun setListener(x: Float, y: Float, z: Float, yaw: Float, pitch: Float) {
        listenerPos = Vector3(x, y, z)
        headYaw = yaw
        headPitch = pitch
        // The labels are billboards: they follow the head, not the ring.
        if (markerLabels.isNotEmpty()) faceLabels()
        val targetY = y.coerceIn(0.2f, 2.4f)

        if (!ringAnchored) {
            // The very first pose: never fall back to the world origin.
            submit {
                ringY = targetY
                ringCenterX = x
                ringCenterZ = z
                ringYawRad = yaw
                ringAnchored = true
                applyPositions()
            }
            return
        }

        when (ringFollow) {
            RingFollow.WORLD -> {
                // World-anchored, but the plane still has to sit on the ears:
                // lying down changes the height without moving the stage.
                if (kotlin.math.abs(targetY - ringY) > RING_HEIGHT_STEP) {
                    submit {
                        ringY = targetY
                        applyPositions()
                    }
                }
            }
            RingFollow.STICKY, RingFollow.LOCKED -> {
                // Live reposition: one-pole towards the head, 33 Hz feed.
                // Only the centre (and the yaw in LOCKED) moves; the radius
                // stays, so the mix keeps its shape around the body.
                submit {
                    val k = FOLLOW_SMOOTH
                    val nx = ringCenterX + (x - ringCenterX) * k
                    val nz = ringCenterZ + (z - ringCenterZ) * k
                    val ny = ringY + (targetY - ringY) * k
                    val moved = kotlin.math.abs(nx - ringCenterX) > FOLLOW_EPSILON ||
                        kotlin.math.abs(nz - ringCenterZ) > FOLLOW_EPSILON ||
                        kotlin.math.abs(ny - ringY) > FOLLOW_EPSILON
                    ringCenterX = nx
                    ringCenterZ = nz
                    ringY = ny
                    var turned = false
                    if (ringFollow == RingFollow.LOCKED) {
                        val d = wrapPi(yaw - ringYawRad)
                        if (kotlin.math.abs(d) > FOLLOW_YAW_STEP) {
                            ringYawRad += d * k
                            turned = true
                        }
                    }
                    if (moved || turned) applyPositions()
                }
            }
        }

        // A recline changes the plane, not the centre. Only when the option is
        // on; the applied tilt eases towards this on the render tick, so the
        // stage rotates instead of stepping with the listener feed.
        tiltTarget = if (ringTilts) pitch.coerceIn(-1.2f, 1.2f) else 0f
    }

    /** Shortest signed angle between two angles, in radians. */
    private fun wrapPi(a: Float): Float {
        var v = a
        while (v > Math.PI) v -= (2.0 * Math.PI).toFloat()
        while (v < -Math.PI) v += (2.0 * Math.PI).toFloat()
        return v
    }

    /**
     * Ease the tilt and move the bus entities while it changes.
     *
     * Only the ring is touched here: re-pushing the source parameters every
     * block would send 128 JNI rows at 50 Hz for a movement the mixer already
     * smooths.
     */
    private fun stepTilt() {
        val target = tiltTarget
        val diff = target - tiltApplied
        if (kotlin.math.abs(diff) < TILT_EPSILON) {
            if (tiltApplied != target) {
                tiltApplied = target
                placeBuses()
            }
            return
        }
        // ~0.5 s to close the gap at 50 blocks per second.
        tiltApplied += diff * TILT_SMOOTH
        // 32 Transform writes are cheap but not free; 30 Hz is smooth enough
        // for a slow recline and keeps the main thread free for the panels.
        val now = System.nanoTime()
        if (now - lastTiltPlaceNs >= TILT_PLACE_NS) {
            lastTiltPlaceNs = now
            placeBuses()
        }
    }

    /** Seven floats per occluding panel: centre, yaw, half extents. */
    fun setOccluders(boxes: FloatArray) {
        occluders = boxes
    }

    fun setRoomSize(width: Float, depth: Float, height: Float) {
        if (width <= 0f || depth <= 0f || height <= 0f) return
        roomWidth = width
        roomDepth = depth
        roomHeight = height
        submit { engine?.setSpatialRoom(width, depth, height, ROOM_ABSORPTION) }
    }

    fun setSpatialWet(percent: Int) {
        val v = percent.coerceIn(0, 100)
        wetPercent = v
        prefs.edit { putInt(KEY_WET, v) }
        submit { engine?.setSpatialWet(v) }
    }

    fun spatialWet(): Int = wetPercent

    /** Point width in degrees; 0 is a point source, 30 a wide pad. */
    fun setSpatialSpread(degrees: Float) {
        val v = degrees.coerceIn(0f, 90f)
        spreadDeg = v
        prefs.edit { putFloat(KEY_SPREAD, v) }
        submit { runCatching { pushSources() } }
    }

    fun spatialSpread(): Float = spreadDeg

    private fun channelColor(index: Int): Color4 {
        val rgb = colorArgb(index)
        return Color4(
            ((rgb shr 16) and 0xFF) / 255f,
            ((rgb shr 8) and 0xFF) / 255f,
            (rgb and 0xFF) / 255f,
            1f,
        )
    }

    /**
     * (Re)create one marker sphere and one text mesh per spatial channel.
     *
     * `mesh://sphere` is parameterised: Meta's 3D objects page defines it as a
     * sphere mesh with a radius from the attached `Sphere(radius: Float)`
     * component. `Sphere` supplies the geometry and `Scale` the live size, so
     * a level change does not rebuild the mesh.
     *
     * The label used to be a Compose panel - one Android view, virtual display
     * and compositor layer per channel, 32 of them. `Text3D` is the SDK's own
     * extruded text mesh: no view, no layer, one draw call each.
     */
    private fun rebuildMarkers() {
        destroyMarkers()
        if (!debugVisible || outputMode != 2) return
        val channels = spatialInfo.channels
        if (channels <= 0) return
        val positions = List(channels) { i ->
            sourcePoint(
                spatialInfo.directions.getOrElse(i) { Direction(0f) },
                ringRadius,
                ringCenterX,
                ringCenterZ,
                ringY,
            )
        }
        val colors = List(channels) { channelColor(it) }
        val grab = settings.view.grabSources
        val collision = if (grab) MeshCollision.LineTest else MeshCollision.NoCollision
        mainHandler.post {
            if (!debugVisible || outputMode != 2) return@post
            if (markerSizes.size < positions.size) {
                markerSizes = FloatArray(positions.size) { -1f }
            }
            labelYaw = FloatArray(positions.size) { Float.NaN }
            labelPoints.clear()
            for (i in positions.indices) {
                val components = ArrayList<ComponentBase>()
                components += Mesh("mesh://sphere".toUri(), collision)
                components += Sphere(MARKER_SPHERE_RADIUS)
                components += Transform(Pose(positions[i]))
                components += Scale(Vector3(MARKER_MIN, MARKER_MIN, MARKER_MIN))
                components += Material().apply {
                    baseColor = colors[i]
                    unlit = true
                }
                components += Visible(true)
                if (grab) {
                    components += Grabbable(
                        enabled = true,
                        type = GrabbableType.PIVOT_Y,
                        minHeight = 0.3f,
                        maxHeight = 3.0f,
                    )
                }
                markers += Entity.create(components)

                val labelComponents = ArrayList<ComponentBase>()
                labelComponents += Mesh(
                    Text3D.create("CH ${(i + 1).toString().padStart(2, '0')}"),
                    MeshCollision.NoCollision,
                )
                labelComponents += Transform(
                    Pose(Vector3(positions[i].x, positions[i].y + MARKER_LABEL_OFFSET, positions[i].z)),
                )
                labelComponents += Scale(Vector3(MARKER_LABEL_SCALE, MARKER_LABEL_SCALE, MARKER_LABEL_SCALE))
                labelComponents += Material().apply {
                    baseColor = colors[i]
                    unlit = true
                }
                labelComponents += Visible(true)
                val labelPoint =
                    Vector3(positions[i].x, positions[i].y + MARKER_LABEL_OFFSET, positions[i].z)
                labelPoints += labelPoint
                val labelEntity = Entity.create(labelComponents)
                markerLabels += labelEntity
                setLabelPose(labelEntity, labelPoint, i)
            }
        }
    }

    /**
     * Always posted, even with nothing to destroy: the queued jobs run in the
     * order they were posted, so a rebuild that was queued earlier can never
     * outlive a destroy that came after it. Runs inline when the caller already
     * is the main thread, which is the case on activity teardown.
     */
    private fun destroyMarkers() {
        if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) {
            destroyMarkersNow()
        } else {
            mainHandler.post { destroyMarkersNow() }
        }
    }

    private fun destroyMarkersNow() {
        for (m in markers) runCatching { m.destroy() }
        markers.clear()
        for (l in markerLabels) runCatching { l.destroy() }
        markerLabels.clear()
        grabOverrides = arrayOfNulls(MAX_SOURCES)
        markerSizes.fill(-1f)
    }

    // ---------------------------------------------------------------- state

    private fun maybeRefreshState() {
        val now = System.currentTimeMillis()
        // Two rates on purpose.
        //
        // The full snapshot() rebuilds the track object (instrument and sample
        // lists included) and every panel recomposes on it, so it stays at
        // 2 Hz playing / 1 Hz paused. The playhead is a handful of numbers and
        // changes every ~120 ms at 125 BPM speed 6, so it is polled at
        // PLAYHEAD_MS and only updates the row/pattern fields of the state:
        // the pattern grid then follows the music instead of jumping four rows
        // every half second.
        val snapshotInterval = if (playing) SNAPSHOT_ACTIVE_MS else SNAPSHOT_IDLE_MS
        if (now - lastSnapshotAt >= snapshotInterval) {
            lastSnapshotAt = now
            publish(playing)
        } else if (playing && now - lastPlayheadAt >= PLAYHEAD_MS) {
            lastPlayheadAt = now
            publishPlayhead()
        }

        // Marker size does not need a state publish, so it runs on its own
        // timer: twice per snapshot would step 500 ms at a time, which reads
        // as a slideshow next to the audio.
        if (debugVisible && outputMode == 2 && now - lastMarkerAt >= MARKER_MS) {
            lastMarkerAt = now
            applyMarkerLevels()
        }

        // Spatial placement follows the mix. `rebuildOutputs` runs inside
        // `load`, before the mixer has processed a single tick, so every
        // channel still reports its preset pan and all objects land on one
        // spot; a module that pans channels while it plays drifts the same way.
        // The first pass runs as soon as audio renders, then on the mixer's
        // rhythm while playing. A paused module cannot move its channels, so
        // the poll sleeps until the next rebuild.
        if (outputMode == 2 &&
            (playing || !spatialSettled) &&
            (!spatialSettled || now - lastSpatialAt >= SPATIAL_MS)
        ) {
            lastSpatialAt = now
            val settle = !spatialSettled
            spatialSettled = true
            pollSpatial(settle)
        }

        // The recline tilt eases here, at block rate, so the ring rotates
        // smoothly instead of stepping with the 10 Hz listener feed.
        if (tiltApplied != tiltTarget) stepTilt()

        // Distance, occlusion and spread change with the listener and the
        // panels, not with the module. 10 Hz is enough for both: the mixer
        // smooths the resulting gains over ~30 ms.
        if (outputMode == 2 && now - lastSourceAt >= SOURCE_MS) {
            lastSourceAt = now
            runCatching { pushSources() }
        }
    }

    /**
     * Fetch the spatial JSON on the V8 thread and parse it off-thread.
     *
     * The result is applied back on the render thread, because the bus
     * entities, the markers and the output rebuild are owned there.
     */
    private fun pollSpatial(rebuild: Boolean) {
        val eng = engine ?: return
        val raw = runCatching { eng.spatialInfo() }.getOrNull() ?: return
        poller.pollSpatial(raw) { info ->
            submit { runCatching { applySpatialInfo(info, rebuild) } }
        }
    }

    /**
     * Re-read the azimuths and move (or rebuild) the objects accordingly.
     *
     * [rebuild] also recreates the debug markers, which is what a track change
     * needs: they were built from the pre-tick azimuths and sit in one place
     * until something rebuilds them.
     */
    private fun applySpatialInfo(info: SpatialInfo, rebuild: Boolean) {
        if (!info.available || info.channels <= 0) return
        if (info.channels != spatialInfo.channels) {
            // A different module with a different channel count: the objects
            // and the marker count have to be rebuilt from scratch.
            spatialInfo = info
            rebuildOutputs()
            return
        }
        val changed =
            info.directions != spatialInfo.directions || info.layout != spatialInfo.layout
        if (!rebuild && !changed) return
        spatialInfo = info
        applyPositions()
        if (rebuild && debugVisible) rebuildMarkers()
        // The panels read the azimuths from [publish] on the snapshot clock
        // (2 Hz while playing). Publishing them here too would put a new
        // XrState through XrStore seven times a second, and every visible
        // panel recomposes on that - the same reason the playhead has its own
        // flow. The ECS objects and the markers are updated above regardless.
    }

    /** Reads `row` and `pattern` out of the cheap playhead JSON. */

    /**
     * Cheap update of just the playhead.
     *
     * A row change publishes on [playhead] only. The shared [State] is touched
     * when the order moves to another pattern, because that is when the cells
     * change too.
     */
    private fun publishPlayhead() {
        if (!loaded) return
        val eng = engine ?: return
        val raw = runCatching { eng.playhead() }.getOrNull() ?: return
        poller.pollPlayhead(raw) { playhead ->
            if (_playhead.value.row == playhead.row &&
                _playhead.value.pattern == playhead.pattern
            ) {
                return@pollPlayhead
            }
            if (_state.value.pattern.pattern != playhead.pattern) {
                // The cells need a V8 call; hand that back to the render thread.
                submit { runCatching { refreshPattern(playhead.pattern) } }
            }
            _playhead.value = playhead
        }
    }

    /** Fetch the pattern cells for [pattern] on the V8 thread. */
    private fun refreshPattern(pattern: Int) {
        val current = _state.value
        val data = readPattern(pattern).takeIf { it.cells.isNotEmpty() } ?: current.pattern
        if (data.pattern != current.pattern.pattern) {
            _state.value = current.copy(pattern = data)
        }
    }

    /**
     * Marker size follows the channel level; positions and colours stay put.
     *
     * Called from the audio thread with a copy of the levels, because the
     * entities belong to the main thread.
     */
    private fun applyMarkerLevels() {
        val count = minOf(levels.size, spatialInfo.channels)
        if (count <= 0) return
        val snapshot = FloatArray(count) { levels[it] }
        mainHandler.post {
            for (i in markers.indices) {
                val lvl = snapshot.getOrElse(i) { 0f }
                val size = MARKER_MIN + lvl * MARKER_RANGE
                val shown = markerSizes.getOrElse(i) { -1f }
                if (kotlin.math.abs(size - shown) < MARKER_STEP) continue
                markers[i].setComponent(Scale(Vector3(size, size, size)))
                if (i < markerSizes.size) markerSizes[i] = size
            }
        }
    }

    /**
     * Synchronous read for the output rebuild: the decision whether to open
     * the spatial path fits in the same block. The 6.7 Hz poll uses
     * [pollSpatial] instead, which parses off the V8 thread.
     */
    private fun readSpatialInfo(): SpatialInfo {
        val eng = engine ?: return SpatialInfo()
        val raw = runCatching { eng.spatialInfo() }.getOrNull() ?: return SpatialInfo()
        return runCatching { poller.parseSpatialInfo(raw) }.getOrElse { SpatialInfo() }
    }


    fun engineAvailable(): Boolean = engine?.available == true

    private fun readPattern(pattern: Int): PatternData {
        if (pattern < 0) return PatternData()
        cachedPattern?.let { if (cachedPatternIndex == pattern) return it }
        val eng = engine ?: return PatternData()
        val raw = runCatching { eng.command("""{"type":"getPattern","pattern":$pattern}""") }.getOrNull()
            ?: return PatternData()
        return runCatching {
            val obj = Json.parseToJsonElement(raw) as? JsonObject ?: return PatternData()
            val rows = obj["rows"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
            val channels = obj["channels"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
            val cells = (obj["cells"] as? kotlinx.serialization.json.JsonArray)
                ?.map { it.jsonPrimitive.content } ?: emptyList()
            PatternData(
                pattern = obj["pattern"]?.jsonPrimitive?.content?.toIntOrNull() ?: pattern,
                rows = rows,
                channels = channels,
                cells = cells,
                row = 0,
            ).also {
                cachedPatternIndex = it.pattern
                cachedPattern = it
            }
        }.getOrDefault(PatternData())
    }

    /**
     * Capture the engine strings on the V8 thread and parse them elsewhere.
     *
     * `snapshot()` builds the track object and the channel list and used to be
     * parsed here, on the thread that owes the mixer a block every 20 ms. V8
     * calls must stay on this thread; kotlinx.serialization does not.
     */
    private fun publish(isPlaying: Boolean) {
        val eng = engine ?: return
        if (publishPending) return
        publishPending = true
        val raw = runCatching { eng.snapshot() }.getOrNull()
        val pattern = if (loaded) readPattern(_playhead.value.pattern) else PatternData()
        val input =
            EnginePoller.SnapshotInput(
                raw = raw,
                pattern = pattern,
                playing = isPlaying,
                settings = settings,
                previous = _state.value,
                loaded = loaded,
                durationMs = durationMs,
                spatialInfo = spatialInfo,
                debugVisible = debugVisible,
                levels = levels,
            )
        poller.pollSnapshot(input) { output ->
            if (output != null) {
                _state.value = output.state
                _playhead.value = output.playhead
            }
            publishPending = false
        }
    }


    /**
     * Details the phone app lists per instrument/sample. The engine already
     * excludes these lists from the flat `details` map (they are big), so they
     * are formatted here instead of shipping raw JSON to the panel.
     */

    private fun pushSettings() {
        val json = EngineJson.encodeToString(AndroidSettings.serializer(), settings)
        engine?.command("{\"type\":\"setSettings\",\"settings\":$json}")
    }

    /** Serialise and persist off the audio thread. */
    private fun saveSettingsAsync() {
        val snapshot = settings
        ioScope.launch { runCatching { settingsStore.save(snapshot) } }
    }

    private fun snapshotLong(key: String): Long =
        runCatching {
            val eng = engine ?: return 0L
            Json.parseToJsonElement(eng.snapshot()).jsonObject["state"]?.jsonObject
                ?.get(key)?.jsonPrimitive?.content?.toLongOrNull() ?: 0L
        }.getOrDefault(0L)

    companion object {
        private const val TAG = "modplay-xr"
        const val SAMPLE_RATE = 48000
        const val BLOCK = 960
        /** PCM 16-bit: the only encoding this player creates. */
        private const val BYTES_PER_SAMPLE = 2
        private const val REGISTER_BASE = 1000

        /** Fixed spatial bus ring. 32 buses = 11.25 degrees between neighbours. */
        const val BUS_COUNT = 32
        private const val BUS_BASE = 2000
        private const val REVERB_ID = 2100

        /** Matches SpatialBusMixer::kMaxSources. */
        private const val MAX_SOURCES = 128

        /** Average absorption of a furnished room, for the Sabine estimate. */
        private const val ROOM_ABSORPTION = 0.25f

        /** How often listener distance, occlusion and spread are pushed. */
        private const val SOURCE_MS = 100L
        private const val SNAPSHOT_ACTIVE_MS = 500L
        private const val SNAPSHOT_IDLE_MS = 1000L

        /**
         * Smooth playhead polling (~28 Hz) so high BPM tracks step smoothly
         * without multi-row jumps or coroutine cancellation stalls.
         */
        private const val PLAYHEAD_MS = 35L

        /** Marker levels: fast enough to follow the music, slow enough to be cheap. */
        private const val MARKER_MS = 100L
        /**
         * How often the channel azimuths are re-read while playing.
         *
         * A row at 125 BPM speed 6 is about 120 ms, and the dynamic pan mode
         * re-places a channel on every row. At the old 1 s the objects and
         * their markers stepped a whole second behind the pan - a visible and
         * audible staircase once the panned layout started using the engine's
         * azimuths again. 150 ms is one row at typical speed and one small
         * `spatialInfo` command plus at most one Transform per channel.
         */
        private const val SPATIAL_MS = 150L
        private const val IDLE_POLL_MS = 50L
        /** Waits out one idle poll plus one blocking write at most. */
        private const val STOP_JOIN_MS = 250L
        private const val RING_Y = 1.4f
        private const val MARKER_MIN = 0.8f
        private const val MARKER_RANGE = 0.8f
        private const val MARKER_STEP = 0.02f

        /**
         * `Sphere` carries the radius that `mesh://sphere` builds from; the
         * diameter on screen is the radius times twice `Scale`. With 0.08 m (8 cm)
         * and a base scale of 0.8 the marker is ~13 cm across, easily visible and grabbable.
         */
        private const val MARKER_SPHERE_RADIUS = 0.08f

        /** Text3D's default glyph height is 0.1 m; 0.55 gives a 5.5 cm label. */
        private const val MARKER_LABEL_SCALE = 0.55f

        /** Label sits above its sphere so the text does not cover it. */
        private const val MARKER_LABEL_OFFSET = 0.10f
        private const val KEY_RADIUS = "radius"
        private const val KEY_RADIUS_MANUAL = "radiusManual"
        private const val KEY_RING_FOLLOW = "ringFollowsHead"
        private const val KEY_RING_FOLLOW_MODE = "ringFollowMode"
        private const val KEY_RING_TILT = "ringTiltsWithHead"

        private const val RING_HEIGHT_STEP = 0.05f

        /** Below this the tilt counts as settled and the ring stops moving. */
        private const val TILT_EPSILON = 0.004f

        /** Per 20 ms block: closes ~90 % of the gap in half a second. */
        private const val TILT_SMOOTH = 0.09f

        private const val TILT_PLACE_NS = 33_000_000L

        /** ~5.7 degrees of head yaw before the following ring is re-placed. */
        private const val FOLLOW_YAW_STEP = 0.10f

        /** One-pole per 33 ms listener feed (~80 ms time constant). */
        private const val FOLLOW_SMOOTH = 0.34f

        /** 2 mm: below this the bus entities are not rewritten. */
        private const val FOLLOW_EPSILON = 0.002f

        /** Label billboard: rewrite only past ~1.7 degrees of head turn. */
        private const val LABEL_YAW_STEP = 0.03f

        /** Closer than 2 cm the direction is numerical noise. */
        private const val LABEL_MIN_DISTANCE_SQ = 0.0004f
        private const val KEY_SPATIAL = "spatialEnabled"
        private const val KEY_WET = "reverbWet"
        private const val KEY_SPREAD = "sourceSpread"

        /** Spatial is the point of the XR app; stereo is the fallback. */
        const val DEFAULT_SPATIAL = true

        fun autoRadius(roomWidth: Float, roomDepth: Float): Float =
            ((minOf(roomWidth, roomDepth) / 2f) - 0.6f).coerceIn(0.5f, 2.5f)

        fun colorArgb(index: Int): Int = CHANNEL_COLORS[index % CHANNEL_COLORS.size]

        private val CHANNEL_COLORS = intArrayOf(
            0xB49BFF, 0x5FE3C0, 0xFF9BC2, 0xFFD166, 0x8AB4FF, 0xFF8A5C,
            0x9CFF8A, 0xE0AAFF, 0x7FFFD4, 0xFFC8DD, 0xBFD7FF, 0xFFE08A,
        )
    }
}
