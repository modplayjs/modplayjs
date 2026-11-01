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

    @Volatile private var currentSettings = AndroidSettings()

    @Volatile private var currentItem: QueueItem? = null

    @Volatile private var playing = false

    @Volatile private var paused = false

    @Volatile private var advancing = AtomicBoolean(false)

    @Volatile private var lastSnapshotAt = 0L
    private val running = AtomicBoolean(true)

    val v8Available: Boolean get() = v8.available
    val underruns: Int get() = audio.underruns

    init {
        audio.start(ring)
        audio.pause()
        Thread({ renderLoop() }, "render-loop").apply {
            priority = Thread.MAX_PRIORITY
            start()
        }
        refresh()
    }

    fun setSettings(settings: AndroidSettings) {
        currentSettings = settings
        send(
            buildJsonObject {
                put("type", "setSettings")
                put("settings", EngineJson.encodeToJsonElement(AndroidSettings.serializer(), settings))
            }.toString(),
        )
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
            val bytes =
                readBytes(item.uri) ?: run {
                    Log.e(TAG, "cannot read ${item.uri}")
                    return@launch
                }
            runCatching {
                v8Exec.submit { v8.load(bytes, item.name) }.get(20, TimeUnit.SECONDS)
                currentItem = item
                ring.clear()
                send(buildJsonObject { put("type", "play") }.toString())
                playing = true
                paused = false
                audio.resume()
                refresh()
            }.onFailure { Log.e(TAG, "play failed", it) }
        }

    fun play() {
        if (currentItem == null) {
            playIndex(_queueIndex.value)
            return
        }
        send(buildJsonObject { put("type", "play") }.toString())
        paused = false
        playing = true
        audio.resume()
    }

    fun pause() {
        paused = true
        send(buildJsonObject { put("type", "pause") }.toString())
        audio.pause()
        refresh()
    }

    fun resume() {
        send(buildJsonObject { put("type", "resume") }.toString())
        paused = false
        audio.resume()
        refresh()
    }

    fun stop() {
        playing = false
        paused = false
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

    private fun send(json: String) {
        if (!v8.available) return
        runCatching { v8Exec.submit { v8.command(json) }.get(5, TimeUnit.SECONDS) }
            .onFailure { Log.e(TAG, "command failed: $json", it) }
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
        advancing.set(false)
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
        val json = runCatching { v8Exec.submit<String> { v8.snapshot() }.get(2, TimeUnit.SECONDS) }.getOrNull() ?: return
        val snap = runCatching { EngineJson.decodeFromString<AndroidSnapshot>(json) }.getOrNull() ?: return
        currentSettings = snap.settings
        _snapshot.value = snap
        lastSnapshotAt = System.currentTimeMillis()
    }

    private fun readBytes(uri: String): ByteArray? =
        runCatching {
            context.contentResolver.openInputStream(Uri.parse(uri))?.use { it.readBytes() }
        }.getOrNull()

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
