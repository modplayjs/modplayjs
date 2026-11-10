package com.bitti06.modplayjs.xr.audio

/**
 * A direction in the stage frame: azimuth around the listener, elevation above
 * the ear plane. 0 deg azimuth is front (+Z), +90 is right (+X); elevation 0 is
 * the ear plane.
 */
data class Direction(val azimuth: Float, val elevation: Float = 0f)

/**
 * The one place that decides where a module channel and a bus sit.
 *
 * Layouts are a pure function, unit-tested. The engine only reports the raw
 * channel pan; everything else (front 180, the 360 ring, the Amiga quad and the
 * 3D dome) is decided here and consumed by both the mixer parameters and the
 * marker entities.
 */
object SpatialLayout {

    /** Where channel 1 starts in the 360 layouts: front-left. */
    const val FULL_360_START = -45f

    /** Golden angle, for the even dome distribution. */
    private const val GOLDEN_ANGLE = 137.508f

    /** Source elevation band of the 3D dome, in degrees. */
    private const val DOME_LOW = 8f
    private const val DOME_HIGH = 68f

    /** How far the module pan can move a channel inside the dome. */
    private const val DOME_PAN_DEG = 20f

    /** Front pair, and the back pair for the Amiga layouts. */
    private const val FRONT = 45f
    private const val BACK = 135f

    /** Even spread across the front 180 deg, both edges included. */
    private const val FRONT_180_START = -90f

    /** The 32-bus layout of the horizontal ring. */
    private val RING_BUSES: List<Direction> =
        List(32) { i -> Direction(wrap180(-180f + 360f * i / 32f), 0f) }

    /**
     * The 32-bus layout of the 3D dome: 12 low, 12 mid, 8 high, staggered so
     * the nearest neighbours are never directly above each other.
     */
    private val DOME_BUSES: List<Direction> = buildList {
        val counts = intArrayOf(12, 12, 8)
        val elevations = floatArrayOf(10f, 35f, 60f)
        for (ring in counts.indices) {
            val n = counts[ring]
            val offset = if (ring == 0) 0f else 180f / n * ring
            for (i in 0 until n) {
                add(Direction(wrap180(-180f + offset + 360f * i / n), elevations[ring]))
            }
        }
    }

    /**
     * Per-channel directions for the current layout.
     *
     * [rawPans] are the engine's per-channel azimuths, which already include
     * `panSeparation`; they drive `panned` and offset the dome.
     */
    fun directions(
        layout: String,
        channels: Int,
        rawPans: List<Float>,
    ): List<Direction> {
        if (channels <= 0) return emptyList()
        if (channels == 1) return listOf(Direction(0f, if (layout == "spatial3d") DOME_LOW else 0f))
        return when (layout) {
            "spatial3d" -> dome(channels, rawPans)
            "full360" -> full360(channels).map { Direction(it, 0f) }
            "lrlr" -> amiga(channels, rawPans, leftRightLeftRight = true).map { Direction(it, 0f) }
            "lrrl" -> amiga(channels, rawPans, leftRightLeftRight = false).map { Direction(it, 0f) }
            "panned" -> panned(channels, rawPans).map { Direction(it, 0f) }
            // front180, and any unknown layout the engine may add later.
            else -> front180(channels).map { Direction(it, 0f) }
        }
    }

    /** Azimuth-only view of [directions], kept for the debug panel and tests. */
    fun azimuths(layout: String, channels: Int, rawPans: List<Float>): List<Float> =
        directions(layout, channels, rawPans).map { it.azimuth }

    /**
     * The bus ring for a layout.
     *
     * Both layouts are 32 buses, so the audio graph never changes size. The
     * native mixer is told these directions and switches to a 3D panner when
     * any bus leaves the ear plane.
     */
    fun busLayout(layout: String): List<Direction> =
        if (layout == "spatial3d") DOME_BUSES else RING_BUSES

    /** Unit vector for a direction, in the stage frame. */
    fun unit(direction: Direction): FloatArray {
        val az = Math.toRadians(direction.azimuth.toDouble())
        val el = Math.toRadians(direction.elevation.toDouble())
        val ce = kotlin.math.cos(el).toFloat()
        return floatArrayOf(
            (kotlin.math.sin(az).toFloat() * ce),
            kotlin.math.sin(el).toFloat(),
            (kotlin.math.cos(az).toFloat() * ce),
        )
    }

    /**
     * Even ring, clockwise, channel 1 at front-left.
     *
     * 4 channels gives the standard quad (FL, FR, BR, BL) and 32 channels land
     * exactly on the 32-bus ring, so no channel is spread over two buses.
     */
    private fun full360(channels: Int): List<Float> {
        if (channels == 2) return listOf(-90f, 90f)
        val step = 360f / channels
        return List(channels) { i -> wrap180(FULL_360_START + i * step) }
    }

    /**
     * 3D dome: channels spiral around the listener and climb from
     * [DOME_LOW] to [DOME_HIGH]. The module pan offsets the azimuth, so the
     * pan still does something; the height is the dimension the tracker does
     * not carry and the dome provides.
     */
    private fun dome(channels: Int, rawPans: List<Float>): List<Direction> =
        List(channels) { i ->
            val t = (i + 0.5f) / channels
            val pan = rawPans.getOrElse(i) { 0f }.coerceIn(-60f, 60f) * (DOME_PAN_DEG / 60f)
            Direction(
                wrap180(FULL_360_START + i * GOLDEN_ANGLE + pan),
                DOME_LOW + (DOME_HIGH - DOME_LOW) * kotlin.math.sqrt(t),
            )
        }

    /**
     * Amiga hard-panned layouts. Channels 0/1 are the front pair; 2/3 are the
     * back pair, which is what makes the choice audible in VR. Channels above
     * the fourth keep the module's own pan.
     */
    private fun amiga(channels: Int, rawPans: List<Float>, leftRightLeftRight: Boolean): List<Float> {
        if (channels < 4) return front180(channels)
        val backLeft = if (leftRightLeftRight) -BACK else BACK
        val backRight = if (leftRightLeftRight) BACK else -BACK
        val head = listOf(-FRONT, FRONT, backLeft, backRight)
        return List(channels) { i -> if (i < 4) head[i] else rawPans.getOrElse(i) { 0f } }
    }

    private fun panned(channels: Int, rawPans: List<Float>): List<Float> {
        if (rawPans.size >= channels) return rawPans.take(channels)
        // No engine azimuths yet (before the first render tick): everything
        // starts centred; the next spatialInfo poll replaces this.
        return List(channels) { 0f }
    }

    private fun front180(channels: Int): List<Float> =
        if (channels == 1) {
            listOf(0f)
        } else {
            List(channels) { i -> FRONT_180_START + i * 180f / (channels - 1) }
        }

    /** Wrap to (-180, 180]. */
    fun wrap180(degrees: Float): Float {
        var v = (degrees + 180f).mod(360f) - 180f
        if (v == -180f) v = 180f
        return v
    }
}
