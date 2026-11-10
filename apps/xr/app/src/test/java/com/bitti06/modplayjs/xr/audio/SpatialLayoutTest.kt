package com.bitti06.modplayjs.xr.audio

import org.junit.Assert.assertEquals
import org.junit.Test

class SpatialLayoutTest {

    private fun assertAngles(expected: List<Float>, actual: List<Float>) {
        assertEquals("channel count", expected.size, actual.size)
        for (i in expected.indices) {
            assertEquals("channel ${i + 1}", expected[i], actual[i], 0.001f)
        }
    }

    @Test
    fun `full360 starts at front left and keeps the quad order`() {
        assertAngles(
            listOf(-45f, 45f, 135f, -135f),
            SpatialLayout.azimuths("full360", 4, emptyList()),
        )
    }

    @Test
    fun `full360 eight channels starts at front left`() {
        assertAngles(
            listOf(-45f, 0f, 45f, 90f, 135f, 180f, -135f, -90f),
            SpatialLayout.azimuths("full360", 8, emptyList()),
        )
    }

    @Test
    fun `full360 32 channels closes the ring with channel 1 at front left`() {
        val angles = SpatialLayout.azimuths("full360", 32, emptyList())
        assertEquals(-45f, angles[0], 0.001f)
        assertEquals(-33.75f, angles[1], 0.001f)
        assertEquals(-56.25f, angles[31], 0.001f)
        // 11.25 deg per step, no duplicates.
        assertEquals(32, angles.toSet().size)
    }

    @Test
    fun `full360 two channels is hard left right`() {
        assertAngles(listOf(-90f, 90f), SpatialLayout.azimuths("full360", 2, emptyList()))
    }

    @Test
    fun `amiga layouts put the second pair behind the listener`() {
        assertAngles(
            listOf(-45f, 45f, -135f, 135f),
            SpatialLayout.azimuths("lrlr", 4, emptyList()),
        )
        assertAngles(
            listOf(-45f, 45f, 135f, -135f),
            SpatialLayout.azimuths("lrrl", 4, emptyList()),
        )
    }

    @Test
    fun `amiga layouts keep the module pan above four channels`() {
        val pans = listOf(0f, 0f, 0f, 0f, 10f, 20f)
        assertAngles(
            listOf(-45f, 45f, -135f, 135f, 10f, 20f),
            SpatialLayout.azimuths("lrlr", 6, pans),
        )
    }

    @Test
    fun `front180 spreads hard left to hard right`() {
        assertAngles(
            listOf(-90f, -30f, 30f, 90f),
            SpatialLayout.azimuths("front180", 4, emptyList()),
        )
    }

    @Test
    fun `panned passes the engine azimuths through`() {
        assertAngles(
            listOf(-12f, 0f, 7f, 33f),
            SpatialLayout.azimuths("panned", 4, listOf(-12f, 0f, 7f, 33f)),
        )
    }

    @Test
    fun `wrap180 keeps the range half open at the front`() {
        assertEquals(-170f, SpatialLayout.wrap180(190f), 0.001f)
        assertEquals(180f, SpatialLayout.wrap180(-180f), 0.001f)
        assertEquals(-45f, SpatialLayout.wrap180(315f), 0.001f)
    }

    @Test
    fun `3d dome bus layout fills the upper hemisphere with 32 distinct buses`() {
        val buses = SpatialLayout.busLayout("spatial3d")
        assertEquals(32, buses.size)
        assertEquals(32, buses.toSet().size)
        assertEquals(3, buses.map { it.elevation }.toSet().size)
        assertEquals(true, buses.all { it.elevation > 0f })
        assertEquals(true, buses.all { it.elevation < 90f })
    }

    @Test
    fun `horizontal layouts keep every bus on the ear plane`() {
        val buses = SpatialLayout.busLayout("full360")
        assertEquals(32, buses.size)
        assertEquals(true, buses.all { it.elevation == 0f })
    }

    @Test
    fun `3d dome sources start at front left and climb`() {
        val dirs = SpatialLayout.directions("spatial3d", 32, emptyList())
        assertEquals(32, dirs.size)
        assertEquals(-45f, dirs[0].azimuth, 0.01f)
        assertEquals(true, dirs[0].elevation >= 8f)
        assertEquals(true, dirs[31].elevation > dirs[0].elevation)
        assertEquals(32, dirs.map { it.azimuth to it.elevation }.toSet().size)
    }

    @Test
    fun `3d dome pan offsets the azimuth`() {
        val left = SpatialLayout.directions("spatial3d", 8, List(8) { -60f })
        val right = SpatialLayout.directions("spatial3d", 8, List(8) { 60f })
        for (i in 0 until 8) {
            assertEquals(
                40f,
                SpatialLayout.wrap180(right[i].azimuth - left[i].azimuth),
                0.01f,
            )
        }
    }

    @Test
    fun `2d layouts keep the source elevation at zero`() {
        for (layout in listOf("full360", "front180", "lrlr", "lrrl", "panned")) {
            assertEquals(
                true,
                SpatialLayout.directions(layout, 8, List(8) { 10f }).all { it.elevation == 0f },
            )
        }
    }
}
