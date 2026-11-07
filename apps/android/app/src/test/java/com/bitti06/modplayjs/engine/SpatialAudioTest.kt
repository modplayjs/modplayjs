package com.bitti06.modplayjs.engine

import android.media.AudioFormat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The layout list the spatial settings show is built from masks the platform
 * reports, so the ordering and the names are the part worth pinning: a wrong
 * label would tell the user they get 7.1.4 when the phone folds the top
 * channels into the sides.
 */
class SpatialAudioTest {

    @Test
    fun `layouts are ordered by channel count, not by the order the platform reports`() {
        val layouts =
            spatialLayouts(
                listOf(
                    AudioFormat.CHANNEL_OUT_7POINT1POINT4,
                    AudioFormat.CHANNEL_OUT_5POINT1,
                    AudioFormat.CHANNEL_OUT_5POINT1POINT2,
                ),
            )
        assertEquals(listOf("5.1", "5.1.2", "7.1.4"), layouts.map { it.name })
        assertEquals(listOf(6, 8, 12), layouts.map { it.channels })
    }

    @Test
    fun `quad is the floor because the framework does not spatialize anything narrower`() {
        val layouts =
            spatialLayouts(
                listOf(
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.CHANNEL_OUT_STEREO,
                    AudioFormat.CHANNEL_OUT_QUAD,
                ),
            )
        assertEquals(listOf("Quad"), layouts.map { it.name })
    }

    @Test
    fun `duplicate masks are reported once`() {
        val layouts =
            spatialLayouts(
                listOf(
                    AudioFormat.CHANNEL_OUT_5POINT1,
                    AudioFormat.CHANNEL_OUT_5POINT1,
                ),
            )
        assertEquals(1, layouts.size)
    }

    @Test
    fun `a mask without a familiar name keeps its channel count`() {
        // 13.0: a real Android mask, no common name.
        val layout = spatialLayouts(listOf(AudioFormat.CHANNEL_OUT_13POINT0)).single()
        assertNull(layout.name)
        assertEquals(13, layout.channels)
    }

    @Test
    fun `the mask is the channel order a bed renderer has to pan into`() {
        // AudioFormat frames are ordered by the mask bits, LSB first. 5.1 has to
        // stay 5.1: six channels including the LFE, not five.
        val layout = spatialLayouts(listOf(AudioFormat.CHANNEL_OUT_5POINT1)).single()
        assertEquals(AudioFormat.CHANNEL_OUT_5POINT1, layout.mask)
        assertEquals(6, layout.channels)
    }

    @Test
    fun `an empty report stays empty instead of inventing a default layout`() {
        assertEquals(emptyList<SpatialLayout>(), spatialLayouts(emptyList()))
    }

    @Test
    fun `automatic picks the widest reported layout`() {
        val reported =
            spatialLayouts(
                listOf(
                    AudioFormat.CHANNEL_OUT_5POINT1,
                    AudioFormat.CHANNEL_OUT_7POINT1POINT4,
                ),
            )
        assertEquals(AudioFormat.CHANNEL_OUT_7POINT1POINT4, effectiveLayout(0, reported)?.mask)
    }

    @Test
    fun `a stored layout the device still reports wins`() {
        val reported =
            spatialLayouts(
                listOf(
                    AudioFormat.CHANNEL_OUT_5POINT1,
                    AudioFormat.CHANNEL_OUT_7POINT1POINT4,
                ),
            )
        assertEquals(
            AudioFormat.CHANNEL_OUT_5POINT1,
            effectiveLayout(AudioFormat.CHANNEL_OUT_5POINT1, reported)?.mask,
        )
    }

    @Test
    fun `a stored layout the device no longer reports falls back to the widest`() {
        // The headset changed. Rendering the stored mask anyway would let the
        // framework fold the channels, which is worse than the widest intact bed.
        val reported = spatialLayouts(listOf(AudioFormat.CHANNEL_OUT_5POINT1))
        assertEquals(
            AudioFormat.CHANNEL_OUT_5POINT1,
            effectiveLayout(AudioFormat.CHANNEL_OUT_7POINT1POINT4, reported)?.mask,
        )
    }

    @Test
    fun `nothing reported means nothing to render into`() {
        assertEquals(null, effectiveLayout(0, emptyList()))
    }
}
