package com.bitti06.modplayjs.xr.play

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.util.Log
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.engine.EngineJson
import com.bitti06.modplayjs.engine.SettingsStore
import com.bitti06.modplayjs.engine.V8Engine
import androidx.core.net.toUri
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
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Audio path for the XR app.
 *
 * One thread owns V8 and the AudioTracks. Commands are queued and drained
 * between render blocks, so the engine is never touched from two threads and
 * the audio callback never waits for the UI.
 *
 * Stereo mode writes one interleaved track. Spatial mode asks the engine for
 * one mono stem per module channel, opens one AudioTrack per stem and registers
 * each session with [SpatialAudioFeature]; the entity's position is the
 * channel's azimuth, so the platform HRTF does the panning and head tracking.
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

    private val engine = V8Engine(context)
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

    private val scratch = FloatArray(BLOCK * 2)
    private val scratchShort = ShortArray(BLOCK * 2)

    private data class TrackOut(
        val index: Int,
        val sessionId: Int,
        val track: AudioTrack,
        val registerId: Int,
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
     * Move/resize the emitter ring, e.g. to the centre of the scanned room.
     * A radius from here is treated as an explicit user choice.
     */
    fun setRing(radius: Float, centerX: Float, centerZ: Float) {
        submit {
            radiusManual = true
            ringRadius = radius.coerceIn(0.4f, 3.0f)
            ringCenterX = centerX
            ringCenterZ = centerZ
            prefs.edit()
                .putFloat(KEY_RADIUS, ringRadius)
                .putBoolean(KEY_RADIUS_MANUAL, true)
                .apply()
            applyPositions()
        }
    }

    /**
     * Room-derived placement. Keeps the user's radius once they touched the
     * control, but always accepts the room centre.
     */
    fun setRingAuto(radius: Float, centerX: Float, centerZ: Float) {
        submit {
            if (!radiusManual) ringRadius = radius.coerceIn(0.5f, 2.5f)
            ringCenterX = centerX
            ringCenterZ = centerZ
            applyPositions()
        }
    }

    /** User radius that follows the room size again. */
    fun resetRadiusAuto() {
        submit {
            radiusManual = false
            prefs.edit().putBoolean(KEY_RADIUS_MANUAL, false).apply()
        }
    }

    fun isRadiusManual(): Boolean = radiusManual

    /** Current radius in metres, for the settings panel. */
    fun ringRadius(): Float = ringRadius

    /** Change the radius, keeping the ring centred where MRUK put it. */
    fun setRadius(radius: Float) = setRing(radius, ringCenterX, ringCenterZ)

    /** Show/hide one marker per audio object, coloured per channel. */
    fun setDebugSources(on: Boolean) {
        submit {
            debugVisible = on
            if (on) rebuildMarkers() else destroyMarkers()
            publish(playing)
        }
    }

    fun start() {
        if (running.getAndSet(true)) return
        thread = Thread({ loop() }, "modplay-xr-audio").apply { priority = Thread.MAX_PRIORITY; start() }
    }

    fun stop() {
        running.set(false)
        queue.clear()
        releaseOutputs()
    }

    fun load(bytes: ByteArray, name: String, format: String) {
        submit {
            engine.setSampleRate(SAMPLE_RATE)
            engine.load(bytes, name)
            pushSettings()
            durationMs = snapshotLong("durationMs")
            loaded = true
            playing = false
            rebuildOutputs()
            publish(false)
        }
    }

    fun togglePlay() {
        submit {
            if (!loaded) return@submit
            if (playing) {
                engine.command("{\"type\":\"pause\"}")
                playing = false
            } else {
                engine.command("{\"type\":\"play\"}")
                playing = true
            }
            publish(playing)
        }
    }

    fun stopPlayback() {
        submit {
            engine.command("{\"type\":\"stop\"}")
            playing = false
            publish(false)
        }
    }

    fun seek(ms: Long) {
        submit { engine.command("""{"type":"seek","positionMs":$ms}""") }
    }

    /** Called from the audio thread when a module reaches its end. */
    @Volatile
    var onEnded: (() -> Unit)? = null

    fun setJamMode(on: Boolean) {
        submit {
            engine.command("""{"type":"setJamMode","enabled":$on}""")
            settings = settings.copy(playback = settings.playback.copy(jamMode = on))
            settingsStore.save(settings)
        }
    }

    /** Apply an arbitrary settings change and persist it. */
    fun update(transform: (AndroidSettings) -> AndroidSettings) {
        submit {
            settings = transform(settings)
            pushSettings()
            settingsStore.save(settings)
            publish(playing)
        }
    }

    fun settingsSnapshot(): AndroidSettings = settings

    /** Audio session of the first track, for the diagnostics page. */
    fun sessionId(): Int = outputs.firstOrNull()?.sessionId ?: 0

    fun setSpatialEnabled(enabled: Boolean) {
        submit {
            engine.command("""{"type":"setSpatial","enabled":$enabled}""")
            rebuildOutputs()
            publish(playing)
        }
    }

    fun setLayout(layout: String) {
        submit {
            engine.command("""{"type":"setMixerLayout","value":"$layout"}""")
            settings = settings.copy(mixer = settings.mixer.copy(layout = layout))
            settingsStore.save(settings)
            rebuildOutputs()
            publish(playing)
        }
    }

    /** App-level volume (0..100). No system permission involved. */
    fun setVolume(percent: Int) {
        val v = percent.coerceIn(0, 100)
        submit {
            engine.command("""{"type":"setVolume","value":$v}""")
            settings = settings.copy(transport = settings.transport.copy(volume = v))
            settingsStore.save(settings)
            publish(playing)
        }
    }

    fun toggleSolo(channel: Int) {
        submit {
            engine.command("""{"type":"soloChannel","index":$channel}""")
            publish(playing)
        }
    }

    fun toggleMute(channel: Int) {
        submit {
            engine.command("""{"type":"toggleChannelMute","index":$channel}""")
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
                runCatching { renderBlock() }.onFailure { Log.e(TAG, "render failed", it) }
            } else {
                Thread.sleep(4)
            }
            if (!playing) Thread.sleep(4)
            maybeRefreshState()
        }
    }

    private fun renderBlock() {
        if (outputMode == 2) {
            val stems = engine.renderSpatial(BLOCK)
            if (stems.size >= outChannels * BLOCK) {
                writeSpatial(stems)
                return
            }
            if (stems.isEmpty()) {
                // End of the module: nothing more to render.
                playing = false
                publish(false)
                onEnded?.invoke()
                return
            }
            // Cannot split this source (SID / streamed): fall back to stereo.
            openStereo()
            return
        }
        val frames = engine.render(BLOCK)
        if (frames.isEmpty()) {
            if (playing) {
                playing = false
                publish(false)
                onEnded?.invoke()
            }
            return
        }
        val n = frames.size
        for (i in 0 until n) scratchShort[i] = (frames[i].coerceIn(-1f, 1f) * 32767f).toInt().toShort()
        outputs.firstOrNull()?.track?.write(scratchShort, 0, n, AudioTrack.WRITE_BLOCKING)
    }

    private fun writeSpatial(stems: FloatArray) {
        val channels = outChannels
        if (channels <= 0) return
        if (levels.size != channels) levels = FloatArray(channels)
        for (ch in 0 until channels) {
            val out = outputs.getOrNull(ch) ?: continue
            if (out.track.playState != AudioTrack.PLAYSTATE_PLAYING) out.track.play()
            var peak = 0f
            for (i in 0 until BLOCK) {
                val v = stems[ch * BLOCK + i].coerceIn(-1f, 1f)
                val a = kotlin.math.abs(v)
                if (a > peak) peak = a
                scratchShort[i] = (v * 32767f).toInt().toShort()
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
        outputs += TrackOut(0, track.audioSessionId, track, -1)
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
            outputs += TrackOut(i, track.audioSessionId, track, registerId)
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
        // Azimuth 0 must land in front of the viewer. Spatial SDK is
        // left-handed with +Z forward (the runtime logs
        // "corrected forward: 0 0 1"), so forward is +Z, not -Z.
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
            val lvl = levels.getOrElse(i) { 0f }
            val size = 0.02f + lvl * 0.10f
            markers[i].setComponent(Scale(Vector3(size, size, size)))
            markers[i].setComponent(
                Material().apply {
                    baseColor = channelColor(i)
                    unlit = true
                },
            )
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
    }

    // ---------------------------------------------------------------- state

    private fun maybeRefreshState() {
        val now = System.currentTimeMillis()
        if (now - lastSnapshotAt < 250) return
        lastSnapshotAt = now
        publish(playing)
        if (outputMode == 2) updatePositions()
    }

    private fun updatePositions() {
        val info = readSpatialInfo()
        if (info.channels != outChannels) return
        if (info.azimuths == spatialInfo.azimuths) return
        spatialInfo = info
        applyPositions()
    }

    private fun readSpatialInfo(): SpatialInfo {
        val raw = runCatching { engine.spatialInfo() }.getOrNull() ?: return SpatialInfo()
        return runCatching {
            val obj = Json.parseToJsonElement(raw).jsonObject
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

    fun engineAvailable(): Boolean = engine.available

    private fun readPattern(pattern: Int): PatternData {
        if (pattern < 0) return PatternData()
        val raw = runCatching { engine.command("""{"type":"getPattern","pattern":$pattern}""") }.getOrNull()
            ?: return PatternData()
        return runCatching {
            val obj = Json.parseToJsonElement(raw).jsonObject
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
            )
        }.getOrDefault(PatternData())
    }

    private fun publish(isPlaying: Boolean) {
        val snap = runCatching {
            Json.parseToJsonElement(engine.snapshot()).jsonObject
        }.getOrNull()
        val state = snap?.get("state")?.jsonObject
        val track = snap?.get("track")?.jsonObject
        val current = _state.value
        _state.value = current.copy(
            loaded = loaded,
            title = track?.get("title")?.jsonPrimitive?.content ?: current.title,
            format = track?.get("format")?.jsonPrimitive?.content ?: current.format,
            channels = track?.get("channels")?.jsonPrimitive?.content?.toIntOrNull() ?: current.channels,
            playing = isPlaying,
            positionMs = state?.get("positionMs")?.jsonPrimitive?.content?.toLongOrNull() ?: 0L,
            durationMs = state?.get("durationMs")?.jsonPrimitive?.content?.toLongOrNull() ?: durationMs,
            spatialAvailable = spatialInfo.available,
            spatialEnabled = spatialInfo.enabled,
            layout = spatialInfo.layout,
            azimuths = spatialInfo.azimuths,
            debugSources = debugVisible,
            levels = levels.toList(),
            volume = settings.transport.volume,
            solo = snap?.get("soloChannel")?.jsonPrimitive?.content?.toIntOrNull() ?: -1,
            muted = snap?.get("channels")
                ?.let { element ->
                    runCatching {
                        element.jsonArray.mapNotNull { entry ->
                            val obj = entry.jsonObject
                            val index = obj["index"]?.jsonPrimitive?.content?.toIntOrNull()
                            val muted = obj["muted"]?.jsonPrimitive?.content == "true"
                            if (muted && index != null) index else null
                        }.toSet()
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
        )
    }

    private fun pushSettings() {
        val json = EngineJson.encodeToString(AndroidSettings.serializer(), settings)
        engine.command("{\"type\":\"setSettings\",\"settings\":$json}")
    }

    private fun snapshotLong(key: String): Long =
        runCatching {
            Json.parseToJsonElement(engine.snapshot()).jsonObject["state"]?.jsonObject
                ?.get(key)?.jsonPrimitive?.content?.toLongOrNull() ?: 0L
        }.getOrDefault(0L)

    companion object {
        private const val TAG = "modplay-xr"
        const val SAMPLE_RATE = 48000
        const val BLOCK = 960
        private const val REGISTER_BASE = 1000
        private const val RING_Y = 1.4f
        private const val KEY_RADIUS = "radius"
        private const val KEY_RADIUS_MANUAL = "radiusManual"
        /** Half the smaller room axis minus 60 cm, so no object sits in a wall. */
        fun autoRadius(roomWidth: Float, roomDepth: Float): Float =
            ((minOf(roomWidth, roomDepth) / 2f) - 0.6f).coerceIn(0.5f, 2.5f)
        /** ARGB of a channel marker; the debug panel uses the same palette. */
        fun colorArgb(index: Int): Int = CHANNEL_COLORS[index % CHANNEL_COLORS.size]

        private val CHANNEL_COLORS = intArrayOf(
            0xB49BFF, 0x5FE3C0, 0xFF9BC2, 0xFFD166, 0x8AB4FF, 0xFF8A5C,
            0x9CFF8A, 0xE0AAFF, 0x7FFFD4, 0xFFC8DD, 0xBFD7FF, 0xFFE08A,
        )
    }
}
