package com.bitti06.modplayjs.xr.play

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.util.Log
import androidx.core.net.toUri
import com.bitti06.modplayjs.engine.AndroidSettings
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
import com.meta.spatial.toolkit.Scale
import com.meta.spatial.toolkit.Transform
import com.meta.spatial.toolkit.Visible
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
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

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

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
    private val entities = ArrayList<Entity?>()
    private var outputMode: Int = 0 // 0 none, 1 stereo, 2 spatial
    private var outChannels = 0
    private var debugVisible = false
    private val markers = ArrayList<Entity>()
    private var levels = FloatArray(0)
    private val prefs = context.getSharedPreferences("xr", Context.MODE_PRIVATE)
    private var radiusManual = prefs.getBoolean(KEY_RADIUS_MANUAL, false)
    private var ringRadius = prefs.getFloat(KEY_RADIUS, 1.0f)
    private var ringCenterX = 0f
    private var ringCenterZ = 0f

    private var playing = false
    private var loaded = false
    private var durationMs = 0L
    private var lastSnapshotAt = 0L
    private var spatialInfo: SpatialInfo = SpatialInfo()
    private var cachedPatternIndex = -1
    private var cachedPattern: PatternData? = null
    private var markerSizes = FloatArray(16) { -1f }

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
            prefs.edit()
                .putFloat(KEY_RADIUS, ringRadius)
                .putBoolean(KEY_RADIUS_MANUAL, true)
                .apply()
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
            prefs.edit().putBoolean(KEY_RADIUS_MANUAL, false).apply()
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
        val spatial = prefs.getBoolean(KEY_SPATIAL, DEFAULT_SPATIAL)
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

    fun stop() {
        running.set(false)
        queue.clear()
        releaseOutputs()
    }

    fun load(bytes: ByteArray, name: String, format: String, autoPlay: Boolean = true) {
        submit {
            try {
                val eng = engine ?: error("V8 engine unavailable")
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
        prefs.edit().putBoolean(KEY_SPATIAL, enabled).apply()
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
        entities.clear()
        for (i in 0 until info.channels) {
            val sessionId = audioManager?.generateAudioSessionId() ?: 0
            val track = newTrack(AudioFormat.CHANNEL_OUT_MONO, sessionId)
            val registerId = REGISTER_BASE + i
            feature.registerAudioSessionId(registerId, track.audioSessionId)
            outputs += TrackOut(i, track.audioSessionId, track)
            val p = positionFor(info.azimuths.getOrElse(i) { 0f })
            val entity = Entity.create(
                Transform(Pose(p)),
                AudioSessionId(registerId, AudioType.MONO),
            )
            entities += entity
            track.play()
        }
        if (debugVisible) rebuildMarkers()
        Log.i(TAG, "spatial output: ${info.channels} objects, layout ${info.layout}")
    }

    private fun newTrack(channelMask: Int, sessionId: Int?): AudioTrack {
        val minBuf = AudioTrack.getMinBufferSize(SAMPLE_RATE, channelMask, AudioFormat.ENCODING_PCM_16BIT)
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
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setBufferSizeInBytes(maxOf(minBuf, BLOCK * 2 * 12))
        if (sessionId != null && sessionId != 0) builder.setSessionId(sessionId)
        return builder.build()
    }

    private fun releaseOutputs() {
        for (out in outputs) {
            runCatching { out.track.stop() }
            runCatching { out.track.release() }
        }
        outputs.clear()
        for (e in entities) runCatching { e?.destroy() }
        entities.clear()
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

    private fun applyPositions() {
        for (i in 0 until minOf(spatialInfo.channels, entities.size)) {
            entities[i]?.setComponent(Transform(Pose(positionFor(spatialInfo.azimuths.getOrElse(i) { 0f }))))
        }
        for (i in markers.indices) {
            val pos = positionFor(spatialInfo.azimuths.getOrElse(i) { 0f })
            markers[i].setComponent(Transform(Pose(Vector3(pos.x, pos.y - 0.12f, pos.z))))
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

    private fun rebuildMarkers() {
        destroyMarkers()
        if (outputMode != 2) return
        if (markerSizes.size < spatialInfo.channels) {
            markerSizes = FloatArray(spatialInfo.channels) { -1f }
        }
        for (i in 0 until spatialInfo.channels) {
            val entity = Entity.create(
                Mesh("mesh://sphere".toUri(), com.meta.spatial.toolkit.MeshCollision.NoCollision),
                Transform(Pose(positionFor(spatialInfo.azimuths.getOrElse(i) { 0f }))),
                Scale(Vector3(0.02f, 0.02f, 0.02f)),
                Material().apply {
                    baseColor = channelColor(i)
                    unlit = true
                },
                Visible(true),
            )
            markers += entity
        }
    }

    private fun destroyMarkers() {
        for (m in markers) runCatching { m.destroy() }
        markers.clear()
        markerSizes.fill(-1f)
    }

    // ---------------------------------------------------------------- state

    private fun maybeRefreshState() {
        val now = System.currentTimeMillis()
        // Playing: 2 Hz is enough - the position label has second resolution
        // and every publish makes all six Compose panels recompose. Paused:
        // nothing moves, so 1 Hz keeps solo/mute/pattern edits visible.
        val interval = if (playing) SNAPSHOT_ACTIVE_MS else SNAPSHOT_IDLE_MS
        if (now - lastSnapshotAt < interval) return
        lastSnapshotAt = now
        publish(playing)
        // Azimuths only change on load/layout switches, which already rebuild
        // the outputs; polling spatialInfo here was one extra V8 JSON round
        // trip per tick. All that is left is the level-driven marker size.
        if (debugVisible && outputMode == 2) applyMarkerLevels()
    }

    /** Marker size follows the channel level; positions and colours stay put. */
    private fun applyMarkerLevels() {
        for (i in markers.indices) {
            val lvl = levels.getOrElse(i) { 0f }
            val size = MARKER_MIN + lvl * MARKER_RANGE
            // A jumping 2 cm sphere is unreadable and each setComponent
            // dirties the entity; 5 mm of hysteresis keeps it steady.
            val shown = if (i < markerSizes.size) markerSizes[i] else -1f
            if (kotlin.math.abs(size - shown) < MARKER_STEP) continue
            markers[i].setComponent(Scale(Vector3(size, size, size)))
            markerSizes[i] = size
        }
    }

    private fun readSpatialInfo(): SpatialInfo {
        val eng = engine ?: return SpatialInfo()
        val raw = runCatching { eng.spatialInfo() }.getOrNull() ?: return SpatialInfo()
        return runCatching {
            val obj = Json.parseToJsonElement(raw) as? JsonObject ?: return SpatialInfo()
            SpatialInfo(
                enabled = obj["enabled"]?.jsonPrimitive?.content == "true",
                available = obj["available"]?.jsonPrimitive?.content == "true",
                layout = obj["layout"]?.jsonPrimitive?.content ?: "panned",
                channels = obj["channels"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0,
                azimuths = obj["azimuths"]?.let { arr ->
                    arr.toString().trim('[', ']').split(',').filter { it.isNotBlank() }
                        .map { it.trim().toFloatOrNull() ?: 0f }
                } ?: emptyList(),
            )
        }.getOrElse { SpatialInfo() }
    }

    fun engineAvailable(): Boolean = engine?.available == true

    private fun readPattern(pattern: Int): PatternData {
        if (pattern < 0) return PatternData()
        // cells/rows/channels only change with the module, not with the
        // playhead: cache the last pattern instead of re-parsing every tick.
        // `load` clears the cache, so an order index is enough as a key.
        cachedPattern?.let { if (cachedPatternIndex == pattern) return it }
        val eng = engine ?: return PatternData()
        val raw = runCatching { eng.command("""{"type":"getPattern","pattern":$pattern}""") }.getOrNull()
            ?: return PatternData()
        return runCatching {
            val obj = Json.parseToJsonElement(raw) as? JsonObject ?: return PatternData()
            val rows = obj["rows"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
            val channels = obj["channels"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
            val cells = obj["cells"]?.let { arr ->
                arr.toString().trim('[', ']').split(',').map { it.trim().trim('"') }
            } ?: emptyList()
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
        val current = _state.value
        _state.value = current.copy(
            loaded = loaded,
            title = track?.get("title")?.jsonPrimitive?.content ?: current.title,
            format = track?.get("format")?.jsonPrimitive?.content ?: current.format,
            channels = track?.get("channels")?.jsonPrimitive?.content?.toIntOrNull() ?: current.channels,
            playing = isPlaying,
            // Whole seconds only: the label shows seconds, and a state that
            // does not change is not re-emitted, so the panels skip a
            // recompose on every tick that lands inside the same second.
            positionMs = state?.get("positionMs")?.jsonPrimitive?.content?.toLongOrNull()
                ?.let { it / 1000L * 1000L } ?: 0L,
            durationMs = state?.get("durationMs")?.jsonPrimitive?.content?.toLongOrNull() ?: durationMs,
            spatialAvailable = spatialInfo.available,
            spatialEnabled = spatialInfo.enabled,
            layout = spatialInfo.layout,
            azimuths = spatialInfo.azimuths,
            debugSources = debugVisible,
            // Only the debug markers read this; skip the copy otherwise.
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
            pattern = if (loaded) {
                readPattern(state?.get("pattern")?.jsonPrimitive?.content?.toIntOrNull() ?: 0)
                    .copy(row = state?.get("row")?.jsonPrimitive?.content?.toIntOrNull() ?: 0)
            } else {
                PatternData()
            },
            details = track?.entries
                ?.filterNot { (k, _) -> k in setOf("instrumentList", "sampleList", "orderList", "artwork") }
                ?.map { (k, v) -> k to v.toString().trim('"').take(80) }
                ?: current.details,
            message = track?.get("message")?.jsonPrimitive?.content ?: current.message,
            canMute = caps?.get("channelMute")?.jsonPrimitive?.content == "true",
            canPattern = caps?.get("patternView")?.jsonPrimitive?.content == "true",
            canMixer = caps?.get("mixer")?.jsonPrimitive?.content == "true",
            canPan = caps?.get("panSeparation")?.jsonPrimitive?.content == "true",
            seekable = caps?.get("seekable")?.jsonPrimitive?.content == "true",
            follow = settings.view.follow,
            visualizer = settings.view.visualizer,
            showChannelStrip = settings.view.showChannelStrip,
            stripDots = settings.view.stripDots,
            sampleLengths = settings.view.sampleLengths,
            sampleLoopFlags = settings.view.sampleLoopFlags,
            patternColors = settings.view.patternColors,
            trackDetail = readTrackDetail(track, settings.view),
        )
        // Only log transitions, not every tick.
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
        private const val REGISTER_BASE = 1000
        private const val SNAPSHOT_ACTIVE_MS = 500L
        private const val SNAPSHOT_IDLE_MS = 1000L
        private const val IDLE_POLL_MS = 50L
        private const val RING_Y = 1.4f
        private const val MARKER_MIN = 0.02f
        private const val MARKER_RANGE = 0.10f
        private const val MARKER_STEP = 0.005f
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
