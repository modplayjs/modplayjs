package com.bitti06.modplayjs.engine

import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.locks.LockSupport

/** Single-producer/single-consumer interleaved float stereo ring. */
class PcmRing(
    private val capacityFrames: Int,
) {
    private val data = FloatArray(capacityFrames * 2)
    private val write = AtomicInteger(0)
    private val read = AtomicInteger(0)

    /**
     * Render thread waiting for space, woken by [read] instead of polling the
     * ring every few milliseconds.
     */
    @Volatile private var spaceWaiter: Thread? = null

    val capacity: Int get() = capacityFrames

    fun availableRead(): Int = write.get() - read.get()

    fun availableWrite(): Int = capacityFrames - availableRead()

    fun write(
        src: FloatArray,
        frames: Int,
    ): Int {
        val n = minOf(frames, availableWrite())
        var w = write.get()
        var copied = 0
        // Two array copies at most: to the end of the ring, then from its start.
        while (copied < n) {
            val start = w % capacityFrames
            val chunk = minOf(n - copied, capacityFrames - start)
            System.arraycopy(src, copied * 2, data, start * 2, chunk * 2)
            copied += chunk
            w += chunk
        }
        write.set(w)
        return n
    }

    fun read(
        dst: FloatArray,
        frames: Int,
    ): Int {
        val n = minOf(frames, availableRead())
        var r = read.get()
        var copied = 0
        while (copied < n) {
            val start = r % capacityFrames
            val chunk = minOf(n - copied, capacityFrames - start)
            System.arraycopy(data, start * 2, dst, copied * 2, chunk * 2)
            copied += chunk
            r += chunk
        }
        read.set(r)
        if (n > 0) LockSupport.unpark(spaceWaiter)
        return n
    }

    /**
     * Parks the calling thread until the drain thread has made room for
     * [frames], or [timeoutMs] passes. The timeout keeps a lost unpark from
     * stalling audio.
     */
    fun awaitWrite(
        frames: Int,
        timeoutMs: Long,
    ) {
        if (availableWrite() >= frames) return
        spaceWaiter = Thread.currentThread()
        LockSupport.parkNanos(timeoutMs * 1_000_000)
        spaceWaiter = null
    }

    fun clear() {
        read.set(write.get())
    }
}
