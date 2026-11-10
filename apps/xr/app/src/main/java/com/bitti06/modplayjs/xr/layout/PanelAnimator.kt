package com.bitti06.modplayjs.xr.layout

import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.SystemBase
import com.meta.spatial.core.Vector3
import com.meta.spatial.toolkit.Transform

/**
 * Slides panels to a new pose instead of teleporting them.
 *
 * A `SystemBase` is the documented place for per-frame work: the `SystemManager`
 * calls [execute] once per frame, so no timer or coroutine is involved. Only
 * registered targets are touched, and an entry removes itself when it arrives,
 * so the system costs a map iteration while idle.
 */
class PanelAnimator : SystemBase() {

    private class Move(
        val from: Pose,
        val to: Pose,
        val startedAt: Long,
        val durationMs: Long,
    )

    private val moves = LinkedHashMap<Entity, Move>()

    /**
     * Move [entity] to [target].
     *
     * A long move (more than 2 m) or a large rotation (more than 120 degrees)
     * lands instantly instead of flying through the user: a panel travelling
     * across the room and spinning on the way is what reads as "the layout
     * flipped".
     */
    fun moveTo(
        entity: Entity,
        target: Pose,
        durationMs: Long = DEFAULT_DURATION_MS,
    ) {
        val from = readPose(entity) ?: return
        if (from.t.distanceTo(target.t) > TELEPORT_DISTANCE_M ||
            angleBetween(from.q, target.q) > TELEPORT_ANGLE_DEG
        ) {
            moves.remove(entity)
            entity.setComponent(Transform(target))
            return
        }
        moves[entity] =
            Move(from, target, System.currentTimeMillis(), durationMs)
    }

    /** Shortest rotation between two orientations, in degrees. */
    private fun angleBetween(a: com.meta.spatial.core.Quaternion, b: com.meta.spatial.core.Quaternion): Float {
        val d = kotlin.math.abs(a.dot(b)).coerceIn(0f, 1f)
        return Math.toDegrees(2.0 * kotlin.math.acos(d.toDouble())).toFloat()
    }

    fun cancel(entity: Entity) {
        moves.remove(entity)
    }

    /** Copy the pose out and hand the borrowed component back to its pool. */
    private fun readPose(entity: Entity): Pose? {
        val transform = runCatching { entity.getComponent<Transform>() }.getOrNull() ?: return null
        return try {
            val pose = transform.transform
            Pose(
                Vector3(pose.t.x, pose.t.y, pose.t.z),
                com.meta.spatial.core.Quaternion(w = pose.q.w, x = pose.q.x, y = pose.q.y, z = pose.q.z),
            )
        } finally {
            runCatching { transform.recycle() }
        }
    }

    override fun execute() {
        if (moves.isEmpty()) return
        val now = System.currentTimeMillis()
        val iterator = moves.entries.iterator()
        while (iterator.hasNext()) {
            val (entity, move) = iterator.next()
            val elapsed = (now - move.startedAt).toFloat() / move.durationMs
            if (elapsed >= 1f) {
                entity.setComponent(Transform(move.to))
                iterator.remove()
                continue
            }
            // Smoothstep: no abrupt start or stop at the ends of the slide.
            val t = elapsed * elapsed * (3f - 2f * elapsed)
            entity.setComponent(Transform(lerp(move.from, move.to, t)))
        }
    }

    private fun lerp(
        from: Pose,
        to: Pose,
        t: Float,
    ): Pose =
        Pose(
            Vector3(
                from.t.x + (to.t.x - from.t.x) * t,
                from.t.y + (to.t.y - from.t.y) * t,
                from.t.z + (to.t.z - from.t.z) * t,
            ),
            from.q.slerp(to.q, t),
        )

    private companion object {
        const val DEFAULT_DURATION_MS = 500L
        const val TELEPORT_DISTANCE_M = 2.0f
        const val TELEPORT_ANGLE_DEG = 120f
    }
}
