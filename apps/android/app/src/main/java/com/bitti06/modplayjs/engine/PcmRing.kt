package com.bitti06.modplayjs.engine

import java.util.concurrent.atomic.AtomicInteger

/** Single-producer/single-consumer interleaved float stereo ring. */
class PcmRing(
    private val capacityFrames: Int,
) {
    private val data = FloatArray(capacityFrames * 2)
    private val write = AtomicInteger(0)
    private val read = AtomicInteger(0)

    val capacity: Int get() = capacityFrames

    fun availableRead(): Int = write.get() - read.get()

    fun availableWrite(): Int = capacityFrames - availableRead()

    fun write(
        src: FloatArray,
        frames: Int,
    ): Int {
        val room = availableWrite()
        val n = minOf(frames, room)
        var w = write.get()
        for (i in 0 until n) {
            val dst = (w % capacityFrames) * 2
            data[dst] = src[i * 2]
            data[dst + 1] = src[i * 2 + 1]
            w++
        }
        write.set(w)
        return n
    }

    fun read(
        dst: FloatArray,
        frames: Int,
    ): Int {
        val have = availableRead()
        val n = minOf(frames, have)
        var r = read.get()
        for (i in 0 until n) {
            val src = (r % capacityFrames) * 2
            dst[i * 2] = data[src]
            dst[i * 2 + 1] = data[src + 1]
            r++
        }
        read.set(r)
        return n
    }

    fun clear() {
        read.set(write.get())
    }
}
