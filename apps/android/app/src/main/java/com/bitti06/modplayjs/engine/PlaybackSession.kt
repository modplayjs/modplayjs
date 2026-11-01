package com.bitti06.modplayjs.engine

import android.content.Context
import android.net.Uri
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Owns the player: V8 render thread, PCM ring, AudioTrack drain, queue and
 * transport. V8 is single-threaded; all V8 calls are serialised on v8Exec.
 */
class PlaybackSession(
    private val context: Context,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val v8Exec =
        Executors.newSingleThreadExecutor { r ->
            Thread(r, "v8-engine").apply { priority = Thread.MAX_PRIORITY }
        }
    private val v8: V8Engine = v8Exec.submit<V8Engine> { V8Engine(context) }.get(20, TimeUnit.SECONDS)
    private val audio = AudioTrackOutput(context)
    private val ring = PcmRing(4096)
    val sampleRate: Int get() = audio.sampleRate

    private val _snapshot = MutableStateFlow<AndroidSnapshot?>(null)
    val snapshot: StateFlow<AndroidSnapshot?> = _snapshot.asStateFlow()
    private val _queue = MutableStateFlow<List<QueueItem>>(emptyList())
    val queue: StateFlow<List<QueueItem>> = _queue.asStateFlow()
    private val _queueIndex = MutableStateFlow(0)
    val queueIndex: StateFlow<Int> = _queueIndex.asStateFlow()

    /** Name of the track currently being decoded, or null. */
    private val _loading = MutableStateFlow<String?>(null)
    val loading: StateFlow<String?> = _loading.asStateFlow()

    /** Last load/playback failure, shown by the player instead of silence. */
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    @Volatile private var currentSettings = AndroidSettings()

    @Volatile private var currentItem: QueueItem? = null

    @Volatile private var playing = false

    @Volatile private var paused = false

    @Volatile private var advancing = AtomicBoolean(false)

    @Volatile private var lastSnapshotAt = 0L
    private val running = AtomicBoolean(true)
    private val playGeneration = AtomicInteger(0)

    val v8Available: Boolean get() = v8.available
    val v8Error: String? get() = v8.initError
    val underruns: Int get() = audio.underruns

    init {
        audio.start(ring)
        audio.pause()
        applyDeviceSampleRate()
        Thread({ renderLoop() }, "render-loop").apply {
            priority = Thread.MAX_PRIORITY
            start()
        }
        refresh()
    }

    private fun applyDeviceSampleRate() {
        if (!v8.available) return
        runCatching { v8Exec.submit { v8.setSampleRate(audio.sampleRate) }.get(2, TimeUnit.SECONDS) }
            .onFailure { Log.e(TAG, "setSampleRate failed", it) }
    }

    fun setSettings(settings: AndroidSettings) {
        currentSettings = settings
        send(
            buildJsonObject {
                put("type", "setSettings")
                put("settings", EngineJson.encodeToJsonElement(AndroidSettings.serializer(), settings))
            }.toString(),
        )
        // The settings screen may carry a sample rate, but output is fixed to
        // the AudioTrack rate; keep the engine rendering at that rate.
        applyDeviceSampleRate()
    }

    fun setQueue(
        items: List<QueueItem>,
        index: Int = 0,
    ) {
        _queue.value = items
        _queueIndex.value = index.coerceIn(0, maxOf(0, items.lastIndex))
    }

    fun playIndex(index: Int) {
        val items = _queue.value
        if (index !in items.indices) return
        _queueIndex.value = index
        play(items[index])
    }

    fun play(item: QueueItem) =
        scope.launch {
            val generation = playGeneration.incrementAndGet()
            _error.value = null
            _loading.value = item.name
            // Stop the old track before decoding: the render thread must not
            // feed the old module into the ring while a new one loads, and an
            // unpaused-but-starved AudioTrack counts underruns.
            playing = false
            paused = true
            audio.pause()
            ring.clear()
            try {
                val bytes =
                    readBytes(item.uri)
                        ?: throw IllegalStateException("cannot open ${item.uri}")
                v8Exec.submit { v8.load(bytes, item.name) }.get(20, TimeUnit.SECONDS)
                if (playGeneration.get() != generation) return@launch
                ring.clear()
                check(send(buildJsonObject { put("type", "play") }.toString())) {
                    "engine is not available"
                }
                refresh()
                val loaded =
                    _snapshot.value
                        ?.takeIf { it.capabilities.loaded }
                        ?.track
                        ?: throw IllegalStateException("engine did not report a loaded track")
                if (playGeneration.get() != generation) return@launch
                currentItem = item
                primeOutput()
                playing = true
                paused = false
                audio.resume()
                Log.i(TAG, "playing ${loaded.name} (${loaded.format})")
            } catch (t: Throwable) {
                if (playGeneration.get() == generation) {
                    playing = false
                    paused = true
                    audio.pause()
                    val reason = t.cause?.message?.ifBlank { null } ?: t.message ?: t.javaClass.simpleName
                    _error.value = "Cannot play ${item.name}: $reason"
                }
                Log.e(TAG, "play failed: ${item.name}", t)
            } finally {
                if (playGeneration.get() == generation) _loading.value = null
            }
        }

    fun play() {
        if (currentItem == null || _snapshot.value?.track == null) {
            playIndex(_queueIndex.value)
            return
        }
        send(buildJsonObject { put("type", "play") }.toString())
        if (paused || !playing) primeOutput()
        paused = false
        playing = true
        audio.resume()
    }

    fun pause() {
        paused = true
        send(buildJsonObject { put("type", "pause") }.toString())
        audio.pause()
        // Frames already rendered are ahead of the pause point; drop them.
        ring.clear()
        refresh()
    }

    fun resume() {
        if (currentItem == null || _snapshot.value?.track == null) {
            playIndex(_queueIndex.value)
            return
        }
        send(buildJsonObject { put("type", "resume") }.toString())
        primeOutput()
        paused = false
        audio.resume()
        refresh()
    }

    fun stop() {
        playing = false
        paused = true
        send(buildJsonObject { put("type", "stop") }.toString())
        audio.pause()
        ring.clear()
        refresh()
    }

    fun seek(ms: Long) {
        send(
            buildJsonObject {
                put("type", "seek")
                put("positionMs", ms)
            }.toString(),
        )
        // Drop audio rendered for the old position so it is not heard after
        // the seek.
        ring.clear()
        refresh()
    }

    fun next() {
        val items = _queue.value
        if (items.isEmpty()) return
        val n = (_queueIndex.value + 1) % items.size
        playIndex(n)
    }

    fun previous() {
        val items = _queue.value
        if (items.isEmpty()) return
        val n = if (_queueIndex.value <= 0) items.lastIndex else _queueIndex.value - 1
        playIndex(n)
    }

    fun auditionInstrument(
        index: Int,
        note: Int = 60,
    ) {
        send(
            buildJsonObject {
                put("type", "auditionInstrument")
                put("index", index)
                put("note", note)
                put("volume", 64)
            }.toString(),
        )
    }

    fun auditionSample(
        index: Int,
        note: Int = 60,
    ) {
        send(
            buildJsonObject {
                put("type", "auditionSample")
                put("sampleId", index)
                put("note", note)
                put("volume", 64)
            }.toString(),
        )
    }

    fun command(
        type: String,
        block: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit = {},
    ) {
        send(
            buildJsonObject {
                put("type", type)
                block()
            }.toString(),
        )
        refreshSoon()
    }

    fun setChannelMute(
        index: Int,
        muted: Boolean,
    ) {
        command("setChannelMute") {
            put("index", index)
            put("muted", muted)
        }
    }

    fun toggleChannelMute(index: Int) = command("toggleChannelMute") { put("index", index) }

    fun soloChannel(index: Int) = command("soloChannel") { put("index", index) }

    fun clearSolo() = command("clearSolo")

    fun muteAllChannels() = command("muteAllChannels")

    fun unmuteAllChannels() = command("unmuteAllChannels")

    fun resetChannels() = command("resetChannels")

    fun loadSidSongLengths(text: String) = command("loadSidSongLengths") { put("text", text) }

    private fun send(json: String): Boolean {
        if (!v8.available) {
            Log.w(TAG, "engine unavailable, dropped $json")
            return false
        }
        val out =
            runCatching { v8Exec.submit<String> { v8.command(json) }.get(5, TimeUnit.SECONDS) }
                .onFailure { Log.e(TAG, "command failed: $json", it) }
                .getOrNull() ?: return false
        if (out.startsWith("{\"error\"")) {
            Log.e(TAG, "engine rejected $json: $out")
            return false
        }
        return true
    }

    /**
     * Fill the ring before starting AudioTrack so output does not begin with
     * an empty buffer (which the framework reports as an underrun).
     */
    private fun primeOutput() {
        repeat(ring.capacity / FRAMES) {
            if (ring.availableWrite() < FRAMES) return
            val pcm =
                runCatching { v8Exec.submit<FloatArray> { v8.render(FRAMES) }.get(1, TimeUnit.SECONDS) }
                    .getOrNull() ?: return
            if (pcm.isEmpty()) return
            ring.write(pcm, pcm.size / 2)
        }
    }

    private fun renderLoop() {
        while (running.get()) {
            try {
                if (playing && !paused) {
                    if (ring.availableWrite() >= FRAMES) {
                        val pcm = v8Exec.submit<FloatArray> { v8.render(FRAMES) }.get(2, TimeUnit.SECONDS)
                        if (pcm.isEmpty()) {
                            if (advancing.compareAndSet(false, true)) onEnded()
                        } else {
                            ring.write(pcm, pcm.size / 2)
                        }
                    }
                }
                val now = System.currentTimeMillis()
                if (now - lastSnapshotAt > 250) refresh()
                Thread.sleep(4)
            } catch (t: Throwable) {
                Log.e(TAG, "render loop", t)
                Thread.sleep(20)
            }
        }
    }

    private fun onEnded() {
        playing = false
        audio.pause()
        advancing.set(false)
        if (_snapshot.value?.track == null) {
            stop()
            return
        }
        val items = _queue.value
        when {
            currentSettings.playback.repeat == "one" && currentItem != null -> play(currentItem!!)
            currentSettings.playback.autoAdvance && items.isNotEmpty() -> next()
            else -> stop()
        }
    }

    private fun refreshSoon() = scope.launch { refresh() }

    @Synchronized
    private fun refresh() {
        if (!v8.available) return
        val json =
            runCatching { v8Exec.submit<String> { v8.snapshot() }.get(2, TimeUnit.SECONDS) }
                .onFailure { Log.e(TAG, "snapshot call failed: ${it.message}") }
                .getOrNull() ?: return
        if (json.startsWith("{\"error\"")) {
            Log.e(TAG, "snapshot error: $json")
            return
        }
        val snap =
            runCatching { EngineJson.decodeFromString<AndroidSnapshot>(json) }
                .onFailure { Log.e(TAG, "snapshot decode failed: ${it.message}") }
                .getOrNull() ?: return
        currentSettings = snap.settings
        _snapshot.value = snap
        lastSnapshotAt = System.currentTimeMillis()
    }

    private fun readBytes(uri: String): ByteArray? =
        runCatching {
            context.contentResolver.openInputStream(Uri.parse(uri))?.use { it.readBytes() }
        }
            .onFailure { Log.e(TAG, "cannot read $uri", it) }
            .getOrNull()

    fun release() {
        running.set(false)
        stop()
        audio.stop()
        runCatching { v8Exec.submit { v8.close() }.get(2, TimeUnit.SECONDS) }
        v8Exec.shutdownNow()
    }

    companion object {
        private const val TAG = "PlaybackSession"
        private const val FRAMES = 1024
    }
}
