package com.bitti06.modplayjs.media

import android.content.Context
import android.os.PowerManager
import android.util.Log

/**
 * Partial wake lock for as long as something is playing.
 *
 * AudioFlinger holds its own `AudioMix` lock while an output stream is active,
 * but that covers the system mixer, not this process. The ring is filled by a
 * Java thread that runs V8, and with the screen off and no lock of our own the
 * scheduler is free to park it - the track then underruns while the media card
 * still says "playing", which is exactly what silence-with-a-progress-bar looks
 * like.
 *
 * Held only while playing, so a paused player costs nothing. This does not make
 * the process unkillable: a foreground service plus this lock is the documented
 * set, and Android may still reclaim the app under real memory pressure, on an
 * app update, or when the user swipes it away (`onTaskRemoved` stops playback
 * on purpose).
 */
class PlaybackWakeLock(
    context: Context,
) {
    private val power = context.getSystemService(PowerManager::class.java)
    private var lock: PowerManager.WakeLock? = null

    val held: Boolean get() = lock?.isHeld == true

    fun acquire() {
        if (lock != null) return
        val manager = power ?: return
        val fresh =
            manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$TAG:playback").apply {
                // One holder, so a double acquire cannot need a double release.
                setReferenceCounted(false)
            }
        runCatching { fresh.acquire() }
            .onSuccess {
                lock = fresh
                Log.i(TAG, "wake lock held: the render thread keeps its slice with the screen off")
            }.onFailure { Log.w(TAG, "cannot acquire the playback wake lock", it) }
    }

    fun release() {
        val current = lock ?: return
        lock = null
        runCatching { if (current.isHeld) current.release() }
        Log.i(TAG, "wake lock released")
    }

    private companion object {
        const val TAG = "PlaybackWakeLock"
    }
}
