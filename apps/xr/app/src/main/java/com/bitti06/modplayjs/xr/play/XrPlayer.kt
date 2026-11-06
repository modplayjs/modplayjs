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
     * The audio objects. Main thread only: every ECS read or write has to
     * happen there. Doing it from the audio thread made
     * `AudioSessionManagerSystem` throw ConcurrentModificationException while
     * it walked its cached query - a hard crash on the next track change.
     */
    private val entities = ArrayList<Entity>()

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

    /** One spatial object to create on the main thread. */
    private data class AudioObject(
        val registerId: Int,
        val sessionId: Int,
        val position: Vector3,
    )

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
        releaseOutputs()
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

    fun sessionId(): Int = outputs.firstOrNull()?.sessionId ?: 0

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
            val stems = eng.renderSpatial(BLOCK)
            if (stems.size >= outChannels * BLOCK) {
                writeSpatial(stems)
                return
            }
            if (stems.isEmpty()) {
                playing = false
                publish(false)
                onEnded?.invoke()
                return
            }
            openStereo()
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

    private fun writeSpatial(stems: FloatArray) {
        val channels = outChannels
        if (channels <= 0) return
        if (levels.size != channels) levels = FloatArray(channels)
        for (ch in 0 until channels) {
            val out = outputs.getOrNull(ch) ?: continue
            if (out.track.playState != AudioTrack.PLAYSTATE_PLAYING) out.track.play()
            var peak = 0f
            val base = ch * BLOCK
            for (i in 0 until BLOCK) {
                val v = stems[base + i]
                val c = if (v > 1f) 1f else if (v < -1f) -1f else v
                val a = if (c < 0f) -c else c
                if (a > peak) peak = a
                scratchShort[i] = (c * 32767f).toInt().toShort()
            }
            levels[ch] = (levels[ch] * 0.7f) + (peak * 0.3f)
            out.track.write(scratchShort, 0, BLOCK, AudioTrack.WRITE_BLOCKING)
        }
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
        val track = newTrack(AudioFormat.CHANNEL_OUT_STEREO, null)
        outputs += TrackOut(0, track.audioSessionId, track)
        outputMode = 1
        outChannels = 1
        track.play()
    }

    private fun openSpatial(info: SpatialInfo) {
        val feature = spatialAudio
        val scene = scene
        if (feature == null || scene == null) {
            openStereo()
            return
        }
        outChannels = info.channels
        outputMode = 2
        // The tracks are created here, the ECS objects on the main thread.
        val generation = ++audioGeneration
        val objects = ArrayList<AudioObject>(info.channels)
        for (i in 0 until info.channels) {
            val sessionId = audioManager?.generateAudioSessionId() ?: 0
            val track = newTrack(AudioFormat.CHANNEL_OUT_MONO, sessionId)
            objects +=
                AudioObject(
                    registerId = REGISTER_BASE + i,
                    sessionId = track.audioSessionId,
                    position = positionFor(info.azimuths.getOrElse(i) { 0f }),
                )
            outputs += TrackOut(i, track.audioSessionId, track)
            track.play()
        }
        mainHandler.post {
            if (generation != audioGeneration) return@post
            for (obj in objects) {
                feature.registerAudioSessionId(obj.registerId, obj.sessionId)
                entities +=
                    Entity.create(
                        Transform(Pose(obj.position)),
                        AudioSessionId(obj.registerId, AudioType.MONO),
                    )
            }
        }
        if (debugVisible) rebuildMarkers()
        Log.i(TAG, "spatial output: ${info.channels} objects, layout ${info.layout}")
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
    private fun newTrack(channelMask: Int, sessionId: Int?): AudioTrack {
        val minBuf =
            AudioTrack.getMinBufferSize(SAMPLE_RATE, channelMask, AudioFormat.ENCODING_PCM_16BIT)
                .takeIf { it > 0 } ?: 0
        val frames = BLOCK * 2
        val twoBlocks = frames * BYTES_PER_SAMPLE
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
        onMain {
            for (e in entities) runCatching { e.destroy() }
            entities.clear()
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

    private fun applyPositions() {
        val channels = spatialInfo.channels
        val positions = List(channels) { i ->
            positionFor(spatialInfo.azimuths.getOrElse(i) { 0f })
        }
        val markerPositions = positions.map { Vector3(it.x, it.y - MARKER_DROP, it.z) }
        mainHandler.post {
            for (i in positions.indices) {
                entities.getOrNull(i)?.setComponent(Transform(Pose(positions[i])))
                markers.getOrNull(i)?.setComponent(Transform(Pose(markerPositions[i])))
            }
        }
    }

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
