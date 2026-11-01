package com.bitti06.modplayjs.engine

import android.content.Context
import android.net.Uri
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import java.util.concurrent.Executors
import java.util.concurrent.Callable
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

    /**
     * Handed over by [v8Exec] once the isolate and engine.js are ready. Every
     * other V8 call is queued behind that task, so inside the executor it is
     * always non-null; outside it, read it as "may still be starting" instead
     * of waiting for the compile.
     */
    @Volatile private var engine: V8Engine? = null
    private val audio = AudioTrackOutput(context)
    private val ring = PcmRing(4096)
    val sampleRate: Int get() = audio.sampleRate

    init {
        v8Exec.execute { engine = V8Engine(context) }
    }

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
    private val _error = MutableStateFlow<PlayError?>(null)
    val error: StateFlow<PlayError?> = _error.asStateFlow()

    @Volatile private var currentSettings = AndroidSettings()

    @Volatile private var currentItem: QueueItem? = null
    @Volatile private var patternViewActive = false
    /** Start position and pause flag for the next load, see [restore]. */
    @Volatile private var pendingStartMs = 0L
    @Volatile private var pendingPaused = false

    @Volatile private var playing = false

    @Volatile private var paused = false

    @Volatile private var advancing = AtomicBoolean(false)

    @Volatile private var lastSnapshotAt = 0L
    private val running = AtomicBoolean(true)
    private val playGeneration = AtomicInteger(0)

    /** Bumped by every transport tap so a late play cannot override a pause. */
    private val transportGeneration = AtomicInteger(0)

    /**
     * A freshly loaded track waits here until the now-playing screen has drawn
     * it, so the UI is not a second behind the sound. Incremented every time a
     * track is loaded and waiting, which the UI observes to release it.
     */
    private val awaitingOutput = MutableStateFlow(0)
    val awaitingStart: StateFlow<Int> = awaitingOutput.asStateFlow()
    private val outputPending = AtomicBoolean(false)

    val v8Available: Boolean get() = engine?.available == true
    val v8Error: String? get() = engine?.initError
    val underruns: Int get() = audio.underruns
    val audioSessionId: Int get() = audio.audioSessionId

    /** Audio stack details for the diagnostics screen. */
    val audioInfo: AudioOutputInfo get() = audio.info

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
        v8Exec.execute { engine?.setSampleRate(audio.sampleRate) }
    }

    fun setSettings(settings: AndroidSettings) {
        currentSettings = settings
        // Called from the UI thread on every slider move, so post instead of
        // waiting for the V8 round trip. Output is fixed to the AudioTrack
        // rate, so the engine is told that rate again here.
        post(
            buildJsonObject {
                put("type", "setSettings")
                put("settings", EngineJson.encodeToJsonElement(AndroidSettings.serializer(), settings))
            }.toString(),
        )
        applyDeviceSampleRate()
    }

    /**
     * Fetches the pattern at [orderIndex]. Called from a coroutine, never from
     * the UI thread: the V8 call queues behind the render tasks and waits.
     */
    suspend fun pattern(orderIndex: Int): AndroidPattern? =
        withContext(Dispatchers.IO) {
            if (engine?.available != true) return@withContext null
            val json =
                runCatching {
                    v8Exec
                        .submit<String> {
                            engine?.command(
                                buildJsonObject {
                                    put("type", "getPattern")
                                    put("pattern", orderIndex)
                                }.toString(),
                            )
                        }.get(5, TimeUnit.SECONDS)
                }.getOrNull() ?: return@withContext null
            runCatching { EngineJson.decodeFromString<AndroidPattern>(json) }.getOrNull()
        }

    /**
     * The pattern screen follows the playhead, so the snapshot has to arrive
     * faster than four times a second while it is open.
     */
    fun setPatternViewActive(active: Boolean) {
        patternViewActive = active
    }

    fun setQueue(
        items: List<QueueItem>,
        index: Int = 0,
    ) {
        // Replaying a track from the list already in the queue must not replace
        // it: Media3 maps the queue whenever the list instance changes, and a
        // library list is thousands of items.
        if (_queue.value != items) _queue.value = items
        _queueIndex.value = index.coerceIn(0, maxOf(0, _queue.value.lastIndex))
    }

    fun playIndex(index: Int) {
        val items = _queue.value
        if (index !in items.indices) return
        _queueIndex.value = index
        play(items[index])
    }

    /**
     * Picks up where the process left off: loads [index] of the current queue,
     * seeks to [positionMs] before the AudioTrack is armed, and either starts
     * playing or stays paused on that position.
     */
    fun restore(
        index: Int,
        positionMs: Long,
        autoplay: Boolean,
    ) {
        pendingStartMs = positionMs.coerceAtLeast(0)
        pendingPaused = !autoplay
        playIndex(index)
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
                v8Exec.submit { engine?.load(bytes, item.name) }.get(20, TimeUnit.SECONDS)
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
                // A restored session starts where it stopped: the seek has to
                // land before anything is primed from position zero.
                val startAt = pendingStartMs
                pendingStartMs = 0L
                if (startAt > 0) {
                    seek(startAt)
                    refresh()
                }
                val keepPaused = pendingPaused
                pendingPaused = false
                playing = !keepPaused
                paused = keepPaused
                if (keepPaused) {
                    Log.i(TAG, "restored ${loaded.name} at $startAt ms, paused")
                } else {
                    // The engine renders into the ring and stalls once it is
                    // full; the AudioTrack stays paused until the UI says it has
                    // drawn this track, so sound and screen start together.
                    outputPending.set(true)
                    awaitingOutput.value += 1
                }
                // Media buttons and the notification can start playback while
                // no activity is composed; never leave it silent forever.
                scope.launch {
                    delay(UI_START_TIMEOUT_MS)
                    startOutputAfterUi()
                }
                Log.i(TAG, "loaded ${loaded.name} (${loaded.format}), waiting for the ui")
            } catch (t: Throwable) {
                if (playGeneration.get() == generation) {
                    cancelPendingOutput()
                    playing = false
                    paused = true
                    audio.pause()
                    val reason = t.cause?.message?.ifBlank { null } ?: t.message ?: t.javaClass.simpleName
                    _error.value = PlayError(item.name, reason)
                }
                Log.e(TAG, "play failed: ${item.name}", t)
            } finally {
                if (playGeneration.get() == generation) _loading.value = null
            }
        }

    /**
     * Starts the pending AudioTrack once the player screen has drawn the
     * loaded track. Safe to call when nothing is pending.
     */
    fun startOutputAfterUi() {
        if (!outputPending.compareAndSet(true, false)) return
        scope.launch {
            if (!playing || paused) return@launch
            primeOutput()
            if (!playing || paused) return@launch
            audio.resume()
            Log.i(TAG, "output started")
        }
    }

    private fun cancelPendingOutput() {
        outputPending.set(false)
    }

    // Transport calls arrive from the UI thread. The V8 round trip waits behind
    // the render task, so it never runs on the frame that handled the tap.

    fun play() {
        if (currentItem == null || _snapshot.value?.track == null) {
            playIndex(_queueIndex.value)
            return
        }
        cancelPendingOutput()
        val generation = transportGeneration.incrementAndGet()
        // Posted from this thread so commands keep their order; only the
        // priming work goes to a background coroutine.
        post(buildJsonObject { put("type", "play") }.toString())
        scope.launch {
            if (paused || !playing) primeOutput()
            // A pause or stop arrived while priming; leave audio alone.
            if (transportGeneration.get() != generation) return@launch
            paused = false
            playing = true
            audio.resume()
        }
    }

    fun pause() {
        transportGeneration.incrementAndGet()
        cancelPendingOutput()
        paused = true
        audio.pause()
        // Frames already rendered are ahead of the pause point; drop them.
        ring.clear()
        post(buildJsonObject { put("type", "pause") }.toString(), refresh = true)
    }

    fun stop() {
        transportGeneration.incrementAndGet()
        cancelPendingOutput()
        playing = false
        paused = true
        audio.pause()
        ring.clear()
        post(buildJsonObject { put("type", "stop") }.toString(), refresh = true)
    }

    fun seek(ms: Long) {
        // Drop audio rendered for the old position so it is not heard after
        // the seek.
        ring.clear()
        post(
            buildJsonObject {
                put("type", "seek")
                put("positionMs", ms)
            }.toString(),
            refresh = true,
        )
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

    fun command(
        type: String,
        block: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit = {},
    ) {
        post(
            buildJsonObject {
                put("type", type)
                block()
            }.toString(),
            refresh = true,
        )
    }

    fun toggleChannelMute(index: Int) = command("toggleChannelMute") { put("index", index) }

    fun soloChannel(index: Int) = command("soloChannel") { put("index", index) }

    fun muteAllChannels() = command("muteAllChannels")

    fun unmuteAllChannels() = command("unmuteAllChannels")

    fun resetChannels() = command("resetChannels")

    /**
     * Hands a command to the V8 thread without waiting for the result. Calls are
     * made from the UI thread, and the single-thread executor keeps them in
     * that order; the engine-creation task was queued before all of them.
     */
    private fun post(
        json: String,
        refresh: Boolean = false,
    ) {
        v8Exec.execute {
            engine?.command(json)
            // Snapshot from the IO scope; refresh() queues its own V8 call.
            if (refresh) refreshSoon()
        }
    }

    /**
     * Waits for the V8 creation task that was queued before any other command.
     * Only call this from a background thread: at startup the wait covers the
     * engine.js compile.
     */
    private fun awaitEngine(): V8Engine? {
        // A Callable barrier: the empty task only completes after the engine
        // creation task that was queued before it.
        runCatching { v8Exec.submit(Callable { Unit }).get(20, TimeUnit.SECONDS) }
        return engine
    }

    private fun send(json: String): Boolean {
        if (awaitEngine()?.available != true) {
            Log.w(TAG, "engine unavailable, dropped $json")
            return false
        }
        val out =
            runCatching {
                v8Exec.submit<String> { engine?.command(json) ?: "" }.get(5, TimeUnit.SECONDS)
            }
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
                runCatching { v8Exec.submit<FloatArray> { engine?.render(FRAMES) ?: FloatArray(0) }.get(1, TimeUnit.SECONDS) }
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
                        val pcm =
                            v8Exec
                                .submit<FloatArray> { engine?.render(FRAMES) ?: FloatArray(0) }
                                .get(2, TimeUnit.SECONDS)
                        if (pcm.isEmpty()) {
                            if (advancing.compareAndSet(false, true)) onEnded()
                        } else {
                            ring.write(pcm, pcm.size / 2)
                        }
                    } else {
                        // The drain thread unparks this one after a read, so a
                        // full ring costs a park instead of 250 wakeups a second.
                        ring.awaitWrite(FRAMES, RING_WAIT_MS)
                    }
                } else {
                    Thread.sleep(IDLE_SLEEP_MS)
                }
                // The snapshot is a second V8 round trip; it must not run on the
                // thread that has to keep the ring filled.
                refreshThrottled()
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

    /** Snapshot for the UI, throttled, off the render thread. */
    private fun refreshThrottled() {
        val now = System.currentTimeMillis()
        val interval = if (patternViewActive) FAST_REFRESH_MS else SNAPSHOT_MS
        if (now - lastSnapshotAt <= interval) return
        lastSnapshotAt = now
        scope.launch { refresh() }
    }

    private fun refreshSoon() = scope.launch { refresh() }

    @Synchronized
    private fun refresh() {
        if (engine?.available != true) return
        // Throttle even when the call fails, otherwise a broken snapshot makes
        // the render loop retry (and log) every few milliseconds.
        lastSnapshotAt = System.currentTimeMillis()
        val json =
            runCatching { v8Exec.submit<String> { engine?.snapshot() ?: "" }.get(2, TimeUnit.SECONDS) }
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
    }

    private fun readBytes(uri: String): ByteArray? =
        runCatching {
            context.contentResolver.openInputStream(Uri.parse(uri))?.use { it.readBytes() }
        }
            .onFailure { Log.e(TAG, "cannot read $uri", it) }
            .getOrNull()

    companion object {
        private const val TAG = "PlaybackSession"
        private const val FRAMES = 1024

        /** Give the UI time to draw before falling back to an immediate start. */
        private const val UI_START_TIMEOUT_MS = 2_000L

        /** Longest the render thread waits for ring space before rechecking. */
        private const val RING_WAIT_MS = 20L

        /** Snapshot interval, and the shorter one used while the pattern view is open. */
        private const val SNAPSHOT_MS = 250L
        private const val FAST_REFRESH_MS = 60L

        /** Nothing is rendering: only the throttled snapshot refresh matters. */
        private const val IDLE_SLEEP_MS = 20L
    }
}
