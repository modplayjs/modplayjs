package com.bitti06.modplayjs.engine

import android.content.Context
import android.util.Log
import java.nio.ByteBuffer

/**
 * Owns the V8 isolate. Every method must be called from the same thread
 * (PlaybackSession's v8 executor). The native side is a thin V8 embedding;
 * engine.js is evaluated once and exposes globalThis.__modplay.
 */
class V8Engine(
    context: Context,
) {
    private var handle: Long = 0L
    val available: Boolean get() = handle != 0L

    /** Why the isolate or engine.js failed to start, if it did. */
    @Volatile var initError: String? = null
        private set

    init {
        handle =
            try {
                System.loadLibrary("modplay_v8")
                val script =
                    context.assets
                        .open("engine/engine.js")
                        .bufferedReader()
                        .use { it.readText() }
                nativeCreate(script, context.cacheDir.absolutePath)
            } catch (t: Throwable) {
                initError = "${t.javaClass.simpleName}: ${t.message}"
                Log.e(TAG, "V8 unavailable: $initError")
                0L
            }
        if (handle == 0L && initError == null) {
            initError = "engine.js failed to compile or run (see modplay-v8 log)"
            Log.e(TAG, "V8 unavailable: $initError")
        }
    }

    fun load(
        bytes: ByteArray,
        name: String,
    ) {
        if (handle == 0L) return
        nativeLoad(handle, bytes, name)
    }

    fun command(json: String): String = if (handle == 0L) """{"error":"v8-unavailable"}""" else nativeCommand(handle, json)

    /**
     * Tell the engine which rate the AudioTrack was actually created at. The
     * JS default is 48000; on a 44100 Hz device that mismatch would render
     * audio at the wrong pitch/speed.
     */
    fun setSampleRate(hz: Int) {
        if (handle == 0L || hz <= 0) return
        nativeCommand(handle, """{"type":"setSampleRate","value":$hz}""")
    }

    fun render(frames: Int): FloatArray = if (handle == 0L) FloatArray(0) else nativeRender(handle, frames)

    /**
     * Mono stems for the spatial path: layout is [channel][frame] with a
     * channel stride of [frames]. Empty when the module cannot be split
     * (SID tunes and streamed audio keep the stereo path).
     */
    fun renderSpatial(frames: Int): FloatArray =
        if (handle == 0L) FloatArray(0) else nativeRenderSpatial(handle, frames)

    /**
     * JSON: {playing, paused, ended, positionMs, ord, row, pattern}.
     * Cheaper than [snapshot]: no track object, no instrument/sample lists, so
     * it is safe to poll at the rate a pattern view needs.
     */
    fun playhead(): String = command("{\"type\":\"playhead\"}")

    /** JSON: {enabled, available, layout, channels, azimuths[]}. */
    fun spatialInfo(): String = command("{\"type\":\"spatialInfo\"}")

    fun snapshot(): String = if (handle == 0L) """{"error":"v8-unavailable"}""" else nativeSnapshot(handle)

    // ------------------------------------------------------- spatial buses

    /** True when the native mixer accepted the direct buffers. */
    fun startSpatialBuses(
        busBuffers: Array<ByteBuffer>,
        reverbBuffer: ByteBuffer?,
        sampleRate: Int,
        frames: Int,
        busCount: Int,
    ): Boolean =
        handle != 0L &&
            nativeStartSpatialBuses(busBuffers, reverbBuffer, sampleRate, frames, busCount)

    /** 5 floats per source: azimuthDeg, distanceM, gain, spreadDeg, occlusion01. */
    fun setSpatialSources(params: FloatArray, count: Int) {
        if (handle != 0L) nativeSetSpatialSources(params, count)
    }

    fun setSpatialRoom(width: Float, depth: Float, height: Float, absorption: Float) {
        if (handle != 0L) nativeSetSpatialRoom(width, depth, height, absorption)
    }

    fun setSpatialWet(percent: Int) {
        if (handle != 0L) nativeSetSpatialWet(percent)
    }

    /** Mixes the stems into the bus buffers. Returns 0 on success. */
    fun mixSpatial(stems: FloatArray, sources: Int, frames: Int): Int =
        if (handle == 0L) -1 else nativeMixSpatial(stems, sources, frames)

    fun stopSpatialBuses() {
        if (handle != 0L) nativeStopSpatialBuses()
    }

    private external fun nativeCreate(
        script: String,
        cacheDir: String,
    ): Long

    private external fun nativeLoad(
        handle: Long,
        bytes: ByteArray,
        name: String,
    )

    private external fun nativeCommand(
        handle: Long,
        json: String,
    ): String

    private external fun nativeRender(
        handle: Long,
        frames: Int,
    ): FloatArray

    private external fun nativeRenderSpatial(
        handle: Long,
        frames: Int,
    ): FloatArray

    private external fun nativeSnapshot(handle: Long): String

    private external fun nativeStartSpatialBuses(
        busBuffers: Array<ByteBuffer>,
        reverbBuffer: ByteBuffer?,
        sampleRate: Int,
        frames: Int,
        busCount: Int,
    ): Boolean

    private external fun nativeSetSpatialSources(params: FloatArray, count: Int)

    private external fun nativeSetSpatialRoom(
        width: Float,
        depth: Float,
        height: Float,
        absorption: Float,
    )

    private external fun nativeSetSpatialWet(percent: Int)

    private external fun nativeMixSpatial(stems: FloatArray, sources: Int, frames: Int): Int

    private external fun nativeStopSpatialBuses()

    companion object {
        private const val TAG = "V8Engine"
    }
}
