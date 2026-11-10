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

    /** Formats whose install bridge ran on this isolate. */
    private val installed = HashSet<String>()

    init {
        handle =
            try {
                System.loadLibrary("modplay_v8")
                // The modular engine is an ES module that imports @modplayjs/*
                // from the asset tree; the native loader resolves and caches
                // those. Passing null for the script selects that path. The
                // bundled engine.js is only used when the modular assets are
                // missing (a build without node, or an older APK).
                // Prefer the modular engine. The bundled script stays as a
                // fallback and is only read when the modular start failed, so
                // a successful start never pays for the 1.3 MB read.
                val overlay = EngineModules.overlayRoot(context)
                if (hasModularAssets(context) || overlay != null) {
                    nativeCreate(null, context.assets, overlay)
                } else {
                    nativeCreate(bundledScript(context), context.assets, null)
                }.let { modularHandle ->
                    if (modularHandle != 0L) {
                        modularHandle
                    } else {
                        if (overlay != null) {
                            // A downloaded engine that does not start must not
                            // brick the app: fall back one generation, then to
                            // the APK assets.
                            Log.w(TAG, "modular engine failed with overlay")
                            val recovered = EngineModules.recover(context)
                            val nextOverlay = if (recovered) EngineModules.overlayRoot(context) else null
                            nativeCreate(null, context.assets, nextOverlay)
                        } else {
                            Log.w(TAG, "modular engine failed, retrying with the bundle")
                            nativeCreate(bundledScript(context), context.assets, null)
                        }
                    }
                }
            } catch (t: Throwable) {
                initError = "${t.javaClass.simpleName}: ${t.message}"
                Log.e(TAG, "V8 unavailable: $initError")
                0L
            }
        if (handle == 0L && initError == null) {
            initError = "engine failed to compile or run (see modplay-v8 log)"
            Log.e(TAG, "V8 unavailable: $initError")
        }
    }

    private fun bundledScript(context: Context): String? =
        runCatching {
            context.assets
                .open("engine/engine.js")
                .bufferedReader()
                .use { it.readText() }
        }.getOrNull()

    private fun hasModularAssets(context: Context): Boolean =
        runCatching {
            context.assets.open("modules/manifest.json").close()
            context.assets.open("modules/engine-core/index.js").close()
            true
        }.getOrDefault(false)

    /**
     * Install one format bridge. Idempotent; runs on the V8 thread.
     *
     * Returns false when the bridge is missing or its module threw, which the
     * caller treats as "this format cannot play" rather than crashing.
     */
    fun installFormat(format: String): Boolean {
        if (handle == 0L) return false
        if (format in installed) return true
        val ok = nativeInstallFormat(handle, format)
        if (ok) installed += format
        return ok
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
     * channel stride of [frames], written into [dest].
     *
     * Returns the number of floats written, or 0 at end-of-module. The caller
     * owns [dest], so the JNI boundary does not allocate a Java array per
     * audio block.
     */
    fun renderSpatialInto(dest: FloatArray, frames: Int): Int =
        if (handle == 0L) 0 else nativeRenderSpatialInto(handle, frames, dest)

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

    /** 6 floats per source: azimuthDeg, elevationDeg, distanceM, gain, spreadDeg, occlusion01. */
    fun setSpatialSources(params: FloatArray, count: Int) {
        if (handle != 0L) nativeSetSpatialSources(params, count)
    }

    /** Bus directions in the stage frame, xyz per bus (3 floats each). */
    fun setSpatialBuses(dirs: FloatArray) {
        if (handle != 0L) nativeSetSpatialBuses(dirs)
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
        script: String?,
        assets: android.content.res.AssetManager,
        overlayRoot: String?,
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

    private external fun nativeRenderSpatialInto(
        handle: Long,
        frames: Int,
        dest: FloatArray,
    ): Int

    private external fun nativeSnapshot(handle: Long): String

    private external fun nativeStartSpatialBuses(
        busBuffers: Array<ByteBuffer>,
        reverbBuffer: ByteBuffer?,
        sampleRate: Int,
        frames: Int,
        busCount: Int,
    ): Boolean

    private external fun nativeSetSpatialSources(params: FloatArray, count: Int)

    private external fun nativeSetSpatialBuses(dirs: FloatArray)

    private external fun nativeSetSpatialRoom(
        width: Float,
        depth: Float,
        height: Float,
        absorption: Float,
    )

    private external fun nativeSetSpatialWet(percent: Int)

    private external fun nativeMixSpatial(stems: FloatArray, sources: Int, frames: Int): Int

    private external fun nativeStopSpatialBuses()

    private external fun nativeInstallFormat(handle: Long, format: String): Boolean

    companion object {
        private const val TAG = "V8Engine"
    }
}
