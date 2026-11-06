package com.bitti06.modplayjs.xr.play

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.util.Log
import androidx.core.content.edit
import androidx.core.net.toUri
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.xr.state.Playhead
import com.bitti06.modplayjs.engine.EngineJson
import com.bitti06.modplayjs.engine.PatternColors
import com.bitti06.modplayjs.engine.SettingsStore
import com.bitti06.modplayjs.engine.V8Engine
import com.meta.spatial.core.Color4
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Vector3
import com.meta.spatial.runtime.Scene
import com.meta.spatial.spatialaudio.AudioSessionId
import com.meta.spatial.spatialaudio.AudioType
import com.meta.spatial.spatialaudio.SoundfieldOrientation
import com.meta.spatial.spatialaudio.SoundfieldOrientationType
import com.meta.spatial.spatialaudio.SpatialAudioFeature
import com.meta.spatial.toolkit.Material
import com.meta.spatial.toolkit.Mesh
import com.meta.spatial.toolkit.MeshCollision
import com.meta.spatial.toolkit.Scale
import com.meta.spatial.toolkit.Sphere
import com.meta.spatial.toolkit.Transform
import com.meta.spatial.toolkit.Visible
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

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
    private var placedX = Float.NaN
    private var placedZ = Float.NaN

    /** Listener and panel boxes arrive from the activity, read by the mixer. */
    @Volatile private var listenerPos = Vector3(0f, RING_Y, 0f)
    @Volatile private var occluders = FloatArray(0)

    @Volatile private var roomWidth = 4f
    @Volatile private var roomDepth = 5f
    @Volatile private var roomHeight = 2.6f
    @Volatile private var wetPercent = prefs.getInt(KEY_WET, 25)
    @Volatile private var spreadDeg = prefs.getFloat(KEY_SPREAD, 0f)

    /** Reused every push; 5 floats per source (azimuth, distance, gain, spread, occlusion). */
    private val sourceParams = FloatArray(MAX_SOURCES * 5)
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
    private var levels = FloatArray(0)
    private var radiusManual = prefs.getBoolean(KEY_RADIUS_MANUAL, false)
    private var ringRadius = prefs.getFloat(KEY_RADIUS, 1.0f)
    private var ringCenterX = 0f
    private var ringCenterZ = 0f

    private var playing = false
    private var loaded = false
    private var durationMs = 0L
    private var lastSnapshotAt = 0L
    private var lastPlayheadAt = 0L
    private var lastMarkerAt = 0L
    private var spatialInfo: SpatialInfo = SpatialInfo()
    /** False until the azimuths have been read once after a rebuild. */
    private var spatialSettled = false
    private var lastSpatialAt = 0L
    private var cachedPatternIndex = -1
    private var cachedPattern: PatternData? = null
    private var cachedTrackDetail: TrackDetail? = null
    private var cachedDetailKey: Pair<Boolean, Boolean>? = null
    private var cachedDetails: List<Pair<String, String>> = emptyList()
    private var cachedMessage: String = ""
    private var cachedCaps: CapsInfo = CapsInfo()
    private var markerSizes = FloatArray(0)

    private data class CapsInfo(
        val canMute: Boolean = false,
        val canPattern: Boolean = false,
        val canMixer: Boolean = false,
        val canPan: Boolean = false,
        val seekable: Boolean = false,
    )

    private val scratchShort = ShortArray(BLOCK * 2)

    private data class TrackOut(
        val index: Int,
        val sessionId: Int,
        val track: AudioTrack,
    )

    private data class SpatialInfo(
        val enabled: Boolean = false,
        val available: Boolean = false,
        val layout: String = "panned",
        val channels: Int = 0,
        val azimuths: List<Float> = emptyList(),
    )

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
            val clamped = radius.coerceIn(0.4f, 3.0f)
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
        }
    }

    fun setRingAuto(radius: Float, centerX: Float, centerZ: Float) {
        submit {
            if (!radiusManual) ringRadius = radius.coerceIn(0.5f, 2.5f)
            ringCenterX = centerX
            ringCenterZ = centerZ
            applyPositions()
        }
    }

    fun resetRadiusAuto() {
        submit {
            radiusManual = false
            prefs.edit { putBoolean(KEY_RADIUS_MANUAL, false) }
        }
    }

    fun isRadiusManual(): Boolean = radiusManual

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
    }

    fun load(bytes: ByteArray, name: String, format: String, autoPlay: Boolean = true) {
        submit {
            try {
                val eng = engine ?: error("V8 engine unavailable")
                cachedPatternIndex = -1
                cachedPattern = null
                cachedTrackDetail = null
                cachedDetailKey = null
                cachedDetails = emptyList()
                cachedMessage = ""
                cachedCaps = CapsInfo()
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
                cachedTrackDetail = null
                cachedDetailKey = null
                cachedDetails = emptyList()
                cachedMessage = ""
                cachedCaps = CapsInfo()
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

    fun setJamMode(on: Boolean) {
        submit {
            engine?.command("""{"type":"setJamMode","enabled":$on}""")
            settings = settings.copy(playback = settings.playback.copy(jamMode = on))
            settingsStore.save(settings)
        }
    }

    fun update(transform: (AndroidSettings) -> AndroidSettings) {
        submit {
            settings = transform(settings)
            pushSettings()
            settingsStore.save(settings)
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
            settingsStore.save(settings)
            rebuildOutputs()
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
            settingsStore.save(settings)
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
            if (!busesReady) {
                // The fixed graph is being registered on the main thread.
                // If that already finished while this thread was still opening
                // the outputs, start it here; otherwise wait, because rendering
                // now would only produce blocks we have to drop.
                if (busGraphReady) startBuses()
                if (!busesReady) runCatching { Thread.sleep(4) }
                return
            }
            val stems = eng.renderSpatial(BLOCK)
            if (stems.size >= outChannels * BLOCK) {
                writeBuses(stems)
                return
            }
            // A short block is the tail of a module: drop it and let the next
            // pass report the end. Switching to stereo here used to tear down
            // the spatial path for the rest of the session.
            if (stems.isEmpty()) {
                playing = false
                publish(false)
                onEnded?.invoke()
            }
            return
        }
        val frames = eng.render(BLOCK)
        if (frames.isEmpty()) {
            if (playing) {
                playing = false
                publish(false)
                onEnded?.invoke()
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

        val generation = busGraphGeneration
        mainHandler.post {
            if (generation != busGraphGeneration) return@post
            for (i in tracks.indices) {
                feature.registerAudioSessionId(BUS_BASE + i, tracks[i].audioSessionId)
                busEntities +=
                    Entity.create(
                        Transform(Pose(busPosition(i))),
                        AudioSessionId(BUS_BASE + i, AudioType.MONO),
                    )
            }
            reverb?.let {
                feature.registerAudioSessionId(REVERB_ID, it.audioSessionId)
                reverbEntity =
                    Entity.create(
                        Transform(Pose(Vector3(ringCenterX, RING_Y, ringCenterZ))),
                        AudioSessionId(REVERB_ID, AudioType.AMBISONIC_ORDER_1),
                        SoundfieldOrientation(SoundfieldOrientationType.POSITION_Y_LOCKED),
                    )
            }
            placedRadius = ringRadius
            placedX = ringCenterX
            placedZ = ringCenterZ
            busGraphReady = true
            if (outputMode == 2) startBuses()
        }
    }

    /** Start (or resume) the fixed graph. Main thread: the tracks are shared. */
    private fun startBuses() {
        for (track in busTracks) {
            if (track.playState != AudioTrack.PLAYSTATE_PLAYING) track.play()
        }
        reverbTrack?.let { if (it.playState != AudioTrack.PLAYSTATE_PLAYING) it.play() }
        busesReady = true
    }

    /** Put the buses on the ring again after a radius or centre change. */
    private fun placeBuses() {
        if (busEntities.isEmpty()) return
        if (placedRadius == ringRadius && placedX == ringCenterX && placedZ == ringCenterZ) return
        placedRadius = ringRadius
        placedX = ringCenterX
        placedZ = ringCenterZ
        onMain {
            for (i in busEntities.indices) {
                busEntities[i].setComponent(Transform(Pose(busPosition(i))))
            }
            reverbEntity?.setComponent(
                Transform(Pose(Vector3(ringCenterX, RING_Y, ringCenterZ))),
            )
        }
    }

    private fun busPosition(index: Int): Vector3 =
        positionFor(-180f + 360f * index / BUS_COUNT)

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
        val twoBlocks = BLOCK * 2 * channels * BYTES_PER_SAMPLE
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
            .setBufferSizeInBytes(maxOf(minBuf, twoBlocks))
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

    private fun positionFor(degrees: Float): Vector3 {
        val rad = Math.toRadians(degrees.toDouble())
        val r = ringRadius
        return Vector3(
            ringCenterX + (Math.sin(rad) * r).toFloat(),
            RING_Y,
            ringCenterZ + (Math.cos(rad) * r).toFloat(),
        )
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
     * Move the per-channel objects and the debug markers onto the ring.
     *
     * The positions are computed on the audio thread; the ECS writes happen on
     * the main thread, because that is the only place the data model may be
     * touched.
     */
    /**
     * Where the debug sphere for one channel sits.
     *
     * The sphere is the *object's* position dropped by [MARKER_DROP] so the two
     * never z-fight. Both the first build and the per-tick update go through
     * here: the first build used to place the sphere at exactly the object's
     * height, and with a static layout it then kept that height, because
     * [refreshSpatial] returns early when no azimuth changed. The markers were
     * 12 cm above the sound for the rest of the session after every rebuild.
     */
    private fun markerPositionFor(degrees: Float): Vector3 {
        val p = positionFor(degrees)
        return Vector3(p.x, p.y - MARKER_DROP, p.z)
    }

    /**
     * Push new azimuths to the markers, the buses and the native mixer.
     *
     * There are no per-channel audio entities any more: the sound comes from
     * the fixed bus ring, so only the debug spheres still follow a channel.
     */
    private fun applyPositions() {
        placeBuses()
        val channels = spatialInfo.channels
        val markerPositions =
            List(channels) { i ->
                markerPositionFor(spatialInfo.azimuths.getOrElse(i) { 0f })
            }
        onMain {
            for (i in markerPositions.indices) {
                markers.getOrNull(i)?.setComponent(Transform(Pose(markerPositions[i])))
            }
        }
        pushSources()
    }

    /**
     * Hand the mixer one parameter row per channel.
     *
     * Azimuth comes from the layout mapping (panned, front180, full360, lrlr,
     * lrrl all end up as an angle in -180..180), distance from the listener to
     * the channel's ring position, occlusion from the panel boxes the activity
     * publishes. All five values are already computed here; the native side
     * only turns them into gains, filters and bus taps.
     */
    private fun pushSources() {
        val eng = engine ?: return
        if (outputMode != 2) return
        val channels = minOf(spatialInfo.channels, MAX_SOURCES)
        if (channels <= 0) return

        val listener = listenerPos
        val boxes = occluders
        val params = sourceParams
        for (i in 0 until channels) {
            val azimuth = spatialInfo.azimuths.getOrElse(i) { 0f }
            val position = positionFor(azimuth)
            val dx = position.x - listener.x
            val dy = position.y - listener.y
            val dz = position.z - listener.z
            val distance = kotlin.math.sqrt(dx * dx + dy * dy + dz * dz)
            val base = i * 5
            params[base] = azimuth
            params[base + 1] = distance
            params[base + 2] = 1f
            params[base + 3] = spreadDeg
            params[base + 4] = occlusion(listener, position, boxes)
        }
        eng.setSpatialSources(params, channels)
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

    fun setListener(x: Float, y: Float, z: Float) {
        listenerPos = Vector3(x, y, z)
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
     * (Re)create one marker sphere per spatial channel.
     *
     * `mesh://sphere` is parameterised, not a fixed primitive: Meta's 3D objects
     * page defines it as a "sphere mesh with a radius defined by the attached
     * `Sphere(radius: Float)` component". A sphere mesh without that component
     * gives the mesh creator no radius, and the entity takes the renderer down
     * with it - which is what the marker switch used to do. `Sphere` supplies
     * the geometry, `Scale` (documented for meshes) the live size, so a level
     * change does not rebuild the mesh.
     */
    private fun rebuildMarkers() {
        destroyMarkers()
        if (!debugVisible || outputMode != 2) return
        // `spatialInfo` is refreshed before every caller runs (rebuildOutputs,
        // refreshSpatial, setDebugSources), so it is the same list the audio
        // objects were placed from. Re-reading the engine here used to cost a
        // second command and could hand the markers a newer list than the
        // objects had - two positions for the same channel.
        val channels = spatialInfo.channels
        if (channels <= 0) return
        val positions = List(channels) { i ->
            markerPositionFor(spatialInfo.azimuths.getOrElse(i) { 0f })
        }
        val colors = List(channels) { channelColor(it) }
        mainHandler.post {
            // The switch may have gone off again while this was queued.
            if (!debugVisible || outputMode != 2) return@post
            if (markerSizes.size < positions.size) {
                markerSizes = FloatArray(positions.size) { -1f }
            }
            for (i in positions.indices) {
                markers += Entity.create(
                    Mesh("mesh://sphere".toUri(), MeshCollision.NoCollision),
                    Sphere(MARKER_SPHERE_RADIUS),
                    Transform(Pose(positions[i])),
                    Scale(Vector3(MARKER_MIN, MARKER_MIN, MARKER_MIN)),
                    Material().apply {
                        baseColor = colors[i]
                        unlit = true
                    },
                    Visible(true),
                )
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
            runCatching { refreshSpatial(rebuild = settle) }
        }

        // Distance, occlusion and spread change with the listener and the
        // panels, not with the module. 10 Hz is enough for both: the mixer
        // smooths the resulting gains over ~30 ms.
        if (outputMode == 2 && now - lastSourceAt >= SOURCE_MS) {
            lastSourceAt = now
            runCatching { pushSources() }
        }
    }

    /**
     * Re-read the azimuths and move (or rebuild) the objects accordingly.
     *
     * [rebuild] also recreates the debug markers, which is what a track change
     * needs: they were built from the pre-tick azimuths and sit in one place
     * until something rebuilds them.
     */
    private fun refreshSpatial(rebuild: Boolean) {
        val info = readSpatialInfo()
        if (!info.available || info.channels <= 0) return
        if (info.channels != spatialInfo.channels) {
            // A different module with a different channel count: the objects
            // and the marker count have to be rebuilt from scratch.
            spatialInfo = info
            rebuildOutputs()
            return
        }
        val changed =
            info.azimuths != spatialInfo.azimuths || info.layout != spatialInfo.layout
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
    private fun parsePlayhead(raw: String): Pair<Int, Int>? {
        val rowIdx = raw.indexOf("\"row\":")
        if (rowIdx < 0) return null
        var rowStart = rowIdx + 6
        while (rowStart < raw.length && raw[rowStart].isWhitespace()) rowStart++
        var rowEnd = rowStart
        while (rowEnd < raw.length && (raw[rowEnd].isDigit() || raw[rowEnd] == '-')) rowEnd++
        val row = raw.substring(rowStart, rowEnd).toIntOrNull() ?: return null

        val patIdx = raw.indexOf("\"pattern\":")
        if (patIdx < 0) return null
        var patStart = patIdx + 10
        while (patStart < raw.length && raw[patStart].isWhitespace()) patStart++
        var patEnd = patStart
        while (patEnd < raw.length && (raw[patEnd].isDigit() || raw[patEnd] == '-')) patEnd++
        val pattern = raw.substring(patStart, patEnd).toIntOrNull() ?: 0

        return row to pattern
    }

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
        val parsed = parsePlayhead(raw) ?: return
        val row = parsed.first
        val pattern = parsed.second
        if (_playhead.value.row == row && _playhead.value.pattern == pattern) return

        val current = _state.value
        if (current.pattern.pattern != pattern) {
            val data = readPattern(pattern).takeIf { it.cells.isNotEmpty() } ?: current.pattern
            if (data.pattern != current.pattern.pattern) {
                _state.value = current.copy(pattern = data)
            }
        }
        _playhead.value = Playhead(row = row, pattern = pattern)
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

    private fun effectiveAzimuths(
        channels: Int,
        layout: String,
        rawAzimuths: List<Float>,
    ): List<Float> {
        if (channels <= 0) return emptyList()
        if (channels == 1) return listOf(0f)
        if (layout == "full360") {
            val step = 360f / channels
            val offset = step / 2f
            return List(channels) { i ->
                val angle = -180f + offset + i * step
                if (angle > 180f) angle - 360f else angle
            }
        }
        if (layout == "lrlr" && channels >= 4) {
            return List(channels) { i ->
                when (i) {
                    0 -> -45f  // Left Front
                    1 -> 45f   // Right Front
                    2 -> -135f // Left Back
                    3 -> 135f  // Right Back
                    else -> rawAzimuths.getOrElse(i) { 0f }
                }
            }
        }
        if (layout == "lrrl" && channels >= 4) {
            return List(channels) { i ->
                when (i) {
                    0 -> -45f  // Left Front
                    1 -> 45f   // Right Front
                    2 -> 135f  // Right Back
                    3 -> -135f // Left Back
                    else -> rawAzimuths.getOrElse(i) { 0f }
                }
            }
        }
        // "Pan (Dynamic)" is the engine's own pan, not a spread. The engine
        // reports one azimuth per channel from the module's channel pan times
        // the pan separation (rounded to 0.1 degree), and that is what this
        // mode is named after. Falling through to the even spread below made
        // the most dynamic layout the most static one and discarded the
        // separation the settings slider sets.
        if (layout == "panned" && rawAzimuths.size >= channels) {
            return rawAzimuths.take(channels)
        }
        // 180 degrees in front: even spacing, both edges included.
        return List(channels) { i ->
            -90f + (i * 180f / (channels - 1))
        }
    }

    private fun readSpatialInfo(): SpatialInfo {
        val eng = engine ?: return SpatialInfo()
        val raw = runCatching { eng.spatialInfo() }.getOrNull() ?: return SpatialInfo()
        return runCatching {
            val obj = Json.parseToJsonElement(raw) as? JsonObject ?: return SpatialInfo()
            val ch = obj["channels"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
            val layout = obj["layout"]?.jsonPrimitive?.content ?: "panned"
            val rawAz = (obj["azimuths"] as? kotlinx.serialization.json.JsonArray)
                ?.mapNotNull { it.jsonPrimitive.content.toFloatOrNull() } ?: emptyList()
            val azimuths = effectiveAzimuths(ch, layout, rawAz)
            SpatialInfo(
                enabled = obj["enabled"]?.jsonPrimitive?.content == "true",
                available = obj["available"]?.jsonPrimitive?.content == "true",
                layout = layout,
                channels = ch,
                azimuths = azimuths,
            )
        }.getOrElse { SpatialInfo() }
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

    private fun publish(isPlaying: Boolean) {
        val eng = engine ?: return
        val previous = _state.value
        val snap = runCatching {
            Json.parseToJsonElement(eng.snapshot()) as? JsonObject
        }.getOrNull()
        val state = snap?.get("state") as? JsonObject
        val track = snap?.get("track") as? JsonObject
        val caps = snap?.get("capabilities") as? JsonObject

        if (track != null) {
            // The sample list is the expensive part of the track object, so it
            // is only reformatted when a view option that shapes it changes.
            // Without this key, toggling "sample lengths" or "loop marker" left
            // the panel on the old text until the next module loaded.
            val detailKey = settings.view.sampleLengths to settings.view.sampleLoopFlags
            if (cachedTrackDetail == null || cachedDetailKey != detailKey) {
                cachedTrackDetail = readTrackDetail(track, settings.view)
                cachedDetailKey = detailKey
            }
            cachedDetails = track.entries
                .filterNot { (k, v) ->
                    k in setOf("instrumentList", "sampleList", "orderList", "artwork") ||
                        (k == "streamed" && (v is JsonNull || v.toString() == "null"))
                }
                .map { (k, v) -> k to v.toString().trim('"').take(80) }
            cachedMessage = track["message"]?.jsonPrimitive?.content ?: ""
        }
        // Capabilities follow the module *and* the mixer layout (`panSeparation`
        // is only offered for the panned layout), so they are read every time.
        // Caching them until the next track left the layout controls stale.
        cachedCaps =
            CapsInfo(
                canMute = caps?.get("channelMute")?.jsonPrimitive?.content == "true",
                canPattern = caps?.get("patternView")?.jsonPrimitive?.content == "true",
                canMixer = caps?.get("mixer")?.jsonPrimitive?.content == "true",
                canPan = caps?.get("panSeparation")?.jsonPrimitive?.content == "true",
                seekable = caps?.get("seekable")?.jsonPrimitive?.content == "true",
            )

        val current = _state.value
        val newPos = state?.get("positionMs")?.jsonPrimitive?.content?.toLongOrNull()
            ?.let { it / 1000L * 1000L } ?: 0L
        val newPattern = if (loaded) {
            readPattern(state?.get("pattern")?.jsonPrimitive?.content?.toIntOrNull() ?: 0)
                .copy(row = state?.get("row")?.jsonPrimitive?.content?.toIntOrNull() ?: 0)
        } else {
            PatternData()
        }

        _state.value = current.copy(
            loaded = loaded,
            title = track?.get("title")?.jsonPrimitive?.content ?: current.title,
            format = track?.get("format")?.jsonPrimitive?.content ?: current.format,
            channels = track?.get("channels")?.jsonPrimitive?.content?.toIntOrNull() ?: current.channels,
            playing = isPlaying,
            positionMs = newPos,
            durationMs = state?.get("durationMs")?.jsonPrimitive?.content?.toLongOrNull() ?: durationMs,
            spatialAvailable = spatialInfo.available,
            spatialEnabled = spatialInfo.enabled,
            layout = spatialInfo.layout,
            azimuths = spatialInfo.azimuths,
            debugSources = debugVisible,
            levels = if (debugVisible) levels.toList() else emptyList(),
            volume = settings.transport.volume,
            solo = snap?.get("soloChannel")?.jsonPrimitive?.content?.toIntOrNull() ?: -1,
            muted = snap?.get("channels")
                ?.let { element ->
                    runCatching {
                        (element as? kotlinx.serialization.json.JsonArray)?.mapNotNull { entry ->
                            val obj = entry as? JsonObject
                            val index = obj?.get("index")?.jsonPrimitive?.content?.toIntOrNull()
                            val muted = obj?.get("muted")?.jsonPrimitive?.content == "true"
                            if (muted && index != null) index else null
                        }?.toSet()
                    }.getOrDefault(current.muted)
                } ?: current.muted,
            pattern = newPattern,
            details = cachedDetails,
            message = cachedMessage,
            canMute = cachedCaps.canMute,
            canPattern = cachedCaps.canPattern,
            canMixer = cachedCaps.canMixer,
            canPan = cachedCaps.canPan,
            seekable = cachedCaps.seekable,
            follow = settings.view.follow,
            visualizer = settings.view.visualizer,
            showChannelStrip = settings.view.showChannelStrip,
            stripDots = settings.view.stripDots,
            sampleLengths = settings.view.sampleLengths,
            sampleLoopFlags = settings.view.sampleLoopFlags,
            patternColors = settings.view.patternColors,
            trackDetail = cachedTrackDetail ?: current.trackDetail,
        )

        _playhead.value =
            Playhead(row = _state.value.pattern.row, pattern = _state.value.pattern.pattern)

        if (previous.loaded != _state.value.loaded) {
            Log.i(TAG, "state: loaded=${_state.value.loaded}")
        }
    }

    /**
     * Details the phone app lists per instrument/sample. The engine already
     * excludes these lists from the flat `details` map (they are big), so they
     * are formatted here instead of shipping raw JSON to the panel.
     */
    private fun readTrackDetail(
        track: JsonObject?,
        view: com.bitti06.modplayjs.engine.ViewSettings,
    ): TrackDetail {
        if (track == null) return TrackDetail()
        fun array(key: String) = track[key] as? kotlinx.serialization.json.JsonArray

        val instruments =
            array("instrumentList")
                ?.mapNotNull { element ->
                    val obj = element as? JsonObject ?: return@mapNotNull null
                    val index = obj["index"]?.jsonPrimitive?.content?.toIntOrNull() ?: return@mapNotNull null
                    val name = obj["name"]?.jsonPrimitive?.content ?: ""
                    (index + 1).toString().padStart(2, '0') + "  " + name
                }
                .orEmpty()

        val samples =
            array("sampleList")
                ?.mapNotNull { element ->
                    val obj = element as? JsonObject ?: return@mapNotNull null
                    val index = obj["index"]?.jsonPrimitive?.content?.toIntOrNull() ?: return@mapNotNull null
                    val name = obj["name"]?.jsonPrimitive?.content ?: ""
                    val length = obj["length"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
                    val loop = obj["loop"]?.jsonPrimitive?.content == "true"
                    buildString {
                        append((index + 1).toString().padStart(2, '0'))
                        append("  ")
                        append(name)
                        if (view.sampleLengths) {
                            append("  ")
                            append(length)
                        }
                        if (view.sampleLoopFlags && loop) append(" L")
                    }
                }
                .orEmpty()

        val orders =
            array("orderList")
                ?.mapNotNull { it.jsonPrimitive.content.toIntOrNull() }
                ?.withIndex()
                ?.joinToString(" ") { (i, pattern) ->
                    i.toString().padStart(2, '0') + ":" + pattern.toString().padStart(2, '0')
                }
                .orEmpty()

        return TrackDetail(instrumentList = instruments, sampleList = samples, orderList = orders)
    }

    private fun pushSettings() {
        val json = EngineJson.encodeToString(AndroidSettings.serializer(), settings)
        engine?.command("{\"type\":\"setSettings\",\"settings\":$json}")
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
        private const val MARKER_MIN = 0.02f
        private const val MARKER_RANGE = 0.10f
        private const val MARKER_STEP = 0.005f

        /**
         * `Sphere` carries the radius that `mesh://sphere` builds from; the
         * diameter on screen is the radius times twice `Scale`. With 0.5 and a
         * base scale of MARKER_MIN the smallest marker is 2 cm across.
         */
        private const val MARKER_SPHERE_RADIUS = 0.5f

        /** Markers sit a little below the audio objects so they do not z-fight. */
        private const val MARKER_DROP = 0.12f
        private const val KEY_RADIUS = "radius"
        private const val KEY_RADIUS_MANUAL = "radiusManual"
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
