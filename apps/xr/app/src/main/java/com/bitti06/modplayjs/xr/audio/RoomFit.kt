package com.bitti06.modplayjs.xr.audio

import com.meta.spatial.core.Vector2
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Freeform room fitting.
 *
 * The MRUK outline is the truth: rooms are hourglass, L-shaped or worse, and
 * the bounding box is not the room. Area and perimeter come from the floor
 * outline and are computed in the plane's own 2D frame - they are invariant
 * to the coordinate offset and rotation between the room model and the app
 * space (which is why only metrics may cross over, never positions).
 */
object RoomFit {

    /** Shoelace area of a closed boundary outline, in m². */
    fun polygonArea(points: List<Vector2>): Float {
        if (points.size < 3) return 0f
        var sum = 0.0
        for (i in points.indices) {
            val a = points[i]
            val b = points[(i + 1) % points.size]
            sum += a.x.toDouble() * b.y - b.x.toDouble() * a.y
        }
        return abs(sum / 2.0).toFloat()
    }

    /** Perimeter of a closed boundary outline, in m. */
    fun polygonPerimeter(points: List<Vector2>): Float {
        if (points.size < 2) return 0f
        var sum = 0f
        for (i in points.indices) {
            val a = points[i]
            val b = points[(i + 1) % points.size]
            val dx = b.x - a.x
            val dy = b.y - a.y
            sum += sqrt(dx * dx + dy * dy)
        }
        return sum
    }

    /**
     * The box with the same volume and the same wall surface as the outline
     * extruded to [height], so the mixer's Sabine tail matches the real
     * shape:
     *
     *   volume:  w*d = A
     *   surface: 2wd + 2h(w+d) = 2A + hP   <=>   w+d = P/2
     *
     * i.e. the two roots of x² − (P/2)x + A = 0. Roundish outlines
     * (P² < 16A, e.g. near-circular) have no such box; the equal-area square
     * is used there and is within a few percent of the true surface.
     */
    fun equivalentBox(area: Float, perimeter: Float, height: Float): FloatArray {
        val halfP = perimeter / 2f
        val disc = halfP * halfP - 4f * area
        if (disc <= 0f) {
            val side = sqrt(area)
            return floatArrayOf(side, side, height)
        }
        val root = sqrt(disc)
        return floatArrayOf((halfP + root) / 2f, (halfP - root) / 2f, height)
    }

    /**
     * The six faces of an upright box (yaw around the vertical axis) as
     * reflection records: kind, centre, normal, halfWidth, halfHeight.
     * The u axis of a face rectangle is the horizontal in-plane axis of the
     * normal (n x up), which lines up with the box axes for every face.
     */
    fun boxFaces(
        kind: Float,
        cx: Float, cy: Float, cz: Float,
        yaw: Float,
        hx: Float, hy: Float, hz: Float,
    ): FloatArray {
        val c = kotlin.math.cos(yaw)
        val s = kotlin.math.sin(yaw)
        // Local -> world, inverse of the occlusion test's world -> panel.
        fun wx(x: Float, z: Float) = c * x + s * z
        fun wz(x: Float, z: Float) = -s * x + c * z
        val out = FloatArray(6 * 9)
        data class Face(val dx: Float, val dy: Float, val dz: Float, val nx: Float, val ny: Float, val nz: Float, val hw: Float, val hh: Float)
        val faces = arrayOf(
            Face(hx, 0f, 0f, 1f, 0f, 0f, hz, hy),
            Face(-hx, 0f, 0f, -1f, 0f, 0f, hz, hy),
            Face(0f, 0f, hz, 0f, 0f, 1f, hx, hy),
            Face(0f, 0f, -hz, 0f, 0f, -1f, hx, hy),
            Face(0f, hy, 0f, 0f, 1f, 0f, hx, hz),
            Face(0f, -hy, 0f, 0f, -1f, 0f, hx, hz),
        )
        for (i in faces.indices) {
            val f = faces[i]
            val o = i * 9
            out[o] = kind
            out[o + 1] = cx + wx(f.dx, f.dz)
            out[o + 2] = cy + f.dy
            out[o + 3] = cz + wz(f.dx, f.dz)
            out[o + 4] = wx(f.nx, f.nz)
            out[o + 5] = f.ny
            out[o + 6] = wz(f.nx, f.nz)
            out[o + 7] = f.hw
            out[o + 8] = f.hh
        }
        return out
    }
}
