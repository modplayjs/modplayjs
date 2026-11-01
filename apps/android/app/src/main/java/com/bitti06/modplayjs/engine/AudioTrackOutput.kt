package com.bitti06.modplayjs.engine

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Process
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Float32 stereo output through AudioTrack. Low-latency performance mode is a
 * request; the device decides the final buffer. The callback thread only
 * drains a preallocated ring and never calls into V8 or allocates per block.
 */
class AudioTrackOutput(
    context: Context,
) {
    private val audioManager = context.getSystemService(AudioManager::class.java)
    val sampleRate: Int =
        audioManager
            ?.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)
            ?.toIntOrNull()
            ?.takeIf { it in 8000..192000 } ?: 48000

    private var track: AudioTrack? = null
    private val running = AtomicBoolean(false)
    private val paused = AtomicBoolean(false)
    private var ring: PcmRing? = null
    private var scratch = FloatArray(0)

    /**
     * Underruns reported by the audio framework for the current track. This is
     * the platform counter (AudioTrack.getUnderrunCount); it only moves while
     * the track is actually playing and the framework had no data to consume.
     * The old hand-rolled counter incremented once per drain-thread poll, so an
     * idle-but-unpaused track (nothing loaded yet) inflated it by ~500/s.
     */
    val underruns: Int
        get() = runCatching { track?.underrunCount ?: 0 }.getOrDefault(0)

    /** Audio session used by the current track, for system audio effects. */
    val audioSessionId: Int
        get() = runCatching { track?.audioSessionId ?: 0 }.getOrDefault(0)

    fun start(ring: PcmRing) {
        if (running.get()) return
        this.ring = ring
        val minBytes =
            AudioTrack
                .getMinBufferSize(
                    sampleRate,
                    AudioFormat.CHANNEL_OUT_STEREO,
                    AudioFormat.ENCODING_PCM_FLOAT,
                ).coerceAtLeast(4096)
        val burstFrames = maxOf(256, minBytes / (2 * 4))
        val bufferBytes = minBytes.coerceAtLeast(burstFrames * 2 * 4 * 2)
        scratch = FloatArray(burstFrames * 2)
        val t =
            AudioTrack
                .Builder()
                .setAudioAttributes(
                    AudioAttributes
                        .Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build(),
                ).setAudioFormat(
                    AudioFormat
                        .Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
                        .build(),
                ).setBufferSizeInBytes(bufferBytes)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
                .build()
        track = t
        running.set(true)
        // Stay paused until the engine has audio. Anything else lets the
        // framework count underruns for a track nobody is feeding.
        paused.set(true)
        Thread({ loop() }, "oboe-drain").apply {
            priority = Thread.MAX_PRIORITY
            start()
        }
    }

    private fun loop() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
        val t = track ?: return
        while (running.get()) {
            if (paused.get()) {
                Thread.sleep(10)
                continue
            }
            val r = ring ?: break
            val n = r.read(scratch, scratch.size / 2)
            if (n == 0) {
                Thread.sleep(2)
                continue
            }
            try {
                t.write(scratch, 0, n * 2, AudioTrack.WRITE_BLOCKING)
            } catch (t2: Throwable) {
                if (running.get()) Log.e(TAG, "write failed", t2)
                Thread.sleep(5)
            }
        }
    }

    fun pause() {
        paused.set(true)
        runCatching { track?.pause() }
    }

    fun resume() {
        // Drop audio buffered before a pause so playback resumes at the
        // current engine position instead of replaying stale frames.
        runCatching { if (track?.playState == AudioTrack.PLAYSTATE_PAUSED) track?.flush() }
        runCatching { track?.play() }
        paused.set(false)
    }

    private companion object {
        const val TAG = "AudioTrackOutput"
    }
}
