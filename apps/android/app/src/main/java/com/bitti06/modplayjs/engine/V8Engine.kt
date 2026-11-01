package com.bitti06.modplayjs.engine

import android.content.Context
import android.util.Log

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
                Log.e(TAG, "V8 unavailable: ${t.message}")
                0L
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

    fun render(frames: Int): FloatArray = if (handle == 0L) FloatArray(0) else nativeRender(handle, frames)

    fun snapshot(): String = if (handle == 0L) """{"error":"v8-unavailable"}""" else nativeSnapshot(handle)

    fun close() {
        if (handle != 0L) {
            nativeDestroy(handle)
            handle = 0L
        }
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

    private external fun nativeSnapshot(handle: Long): String

    private external fun nativeDestroy(handle: Long)

    companion object {
        private const val TAG = "V8Engine"
    }
}
