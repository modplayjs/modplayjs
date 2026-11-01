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

    /** Frames per buffer the device asks apps to use, from AudioManager. */
    val deviceFramesPerBuffer: Int =
        audioManager
            ?.getProperty(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER)
            ?.toIntOrNull()
            ?: 0

    /**
     * What the platform insists a stream buffer must hold. On most devices this
     * is already several hardware bursts; asking for less makes AudioTrack
     * fall back to a deep buffer, which is why it is only a floor here.
     */
    private val minBufferBytes: Int =
        runCatching {
            AudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_STEREO,
                AudioFormat.ENCODING_PCM_FLOAT,
            )
        }.getOrDefault(0)
            .takeIf { it > 0 }
            ?: DEFAULT_BURST_FRAMES * LOW_LATENCY_BURSTS * BYTES_PER_FRAME

    val minBufferFrames: Int get() = minBufferBytes / BYTES_PER_FRAME

    /**
     * Everything the diagnostics screen reports about the open AudioTrack.
     * Read on demand; the values change only when the track is rebuilt.
     */
    val info: AudioOutputInfo
        get() {
            val t = track
            return AudioOutputInfo(
                sampleRate = sampleRate,
                bufferFrames = runCatching { t?.bufferSizeInFrames ?: 0 }.getOrDefault(0),
                minBufferFrames = minBufferFrames,
                playState =
                    when (runCatching { t?.playState }.getOrNull()) {
                        AudioTrack.PLAYSTATE_PLAYING -> OutputPlayState.PLAYING
                        AudioTrack.PLAYSTATE_PAUSED -> OutputPlayState.PAUSED
                        else -> OutputPlayState.STOPPED
                    },
                deviceFramesPerBuffer = deviceFramesPerBuffer,
                lowLatencyRequested = true,
            )
        }

    fun start(ring: PcmRing) {
        if (running.get()) return
        this.ring = ring
        val burst = deviceFramesPerBuffer.takeIf { it in 16..16_384 } ?: DEFAULT_BURST_FRAMES
        // One write covers two hardware bursts, so the drain thread wakes twice
        // per buffer instead of once per burst.
        val blockFrames = (burst * 2).coerceAtLeast(256)
        scratch = FloatArray(blockFrames * 2)
        // getMinBufferSize already carries the framework's safety margin, and
        // it is the smallest buffer the platform documents as safe. The old
        // code asked for twice that, which is where the 120 ms came from; the
        // device minimum is only a floor here, so honour it rather than guess.
        val t = buildTrack(minBufferBytes) ?: return
        Log.i(
            TAG,
            "AudioTrack buffer ${t.bufferSizeInFrames} frames " +
                "(${t.bufferSizeInFrames * 1000 / sampleRate} ms, requested $minBufferFrames, " +
                "${t.bufferCapacityInFrames} capacity)",
        )
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

    private fun buildTrack(bufferBytes: Int): AudioTrack? =
        runCatching {
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
        }.onFailure { Log.w(TAG, "cannot build an AudioTrack with $bufferBytes bytes", it) }
            .getOrNull()

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

        /** Stereo, 32-bit float: the format the engine renders. */
        const val BYTES_PER_FRAME = 2 * 4

        /** Typical hardware burst when the device reports none. */
        const val DEFAULT_BURST_FRAMES = 240

        /** Buffer size in hardware bursts requested on the low-latency path. */
        const val LOW_LATENCY_BURSTS = 4
    }
}

enum class OutputPlayState {
    STOPPED,
    PAUSED,
    PLAYING,
}

/**
 * Diagnostics for the audio path: the AudioTrack that plays the engine's
 * float32 stereo output, and what the device reports about it.
 */
data class AudioOutputInfo(
    val sampleRate: Int = 0,
    val bufferFrames: Int = 0,
    val minBufferFrames: Int = 0,
    val playState: OutputPlayState = OutputPlayState.STOPPED,
    val deviceFramesPerBuffer: Int = 0,
    val lowLatencyRequested: Boolean = false,
)
