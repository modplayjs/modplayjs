package com.bitti06.modplayjs.xr.scene

import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import kotlin.math.asin
import kotlin.math.atan2

/**
 * One head sample, in the reference space.
 *
 * The raw pose is kept because the stage frame needs its full orientation;
 * yaw and pitch are precomputed because the ring, the occluders and the
 * posture logic all read them.
 */
data class HeadFrame(
    val pose: Pose,
    /** Radians around +Y. */
    val yaw: Float,
    /** Radians above the ear plane; positive when looking up. */
    val pitch: Float,
) {
    val x: Float get() = pose.t.x
    val y: Float get() = pose.t.y
    val z: Float get() = pose.t.z
}

object HeadFrames {

    fun of(pose: Pose): HeadFrame = HeadFrame(pose, yawOf(pose.q), pitchOf(pose.q))

    /** Yaw of a quaternion that only carries a rotation around Y. */
    fun yawOf(q: Quaternion): Float =
        atan2(2f * (q.w * q.y + q.x * q.z), 1f - 2f * (q.y * q.y + q.z * q.z))

    /**
     * Pitch from the rotated forward vector, not from an Euler decomposition:
     * a roll (a listener on their side) cannot make it ambiguous.
     */
    fun pitchOf(q: Quaternion): Float {
        val fy = 2f * (q.w * q.x - q.y * q.z)
        return asin(fy.coerceIn(-1f, 1f))
    }
}
