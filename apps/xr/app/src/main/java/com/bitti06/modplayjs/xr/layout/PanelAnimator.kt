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
     * Animate [entity] to [target]. Re-targeting an entity that is already
     * moving starts from where it currently is, not from the old destination.
     */
    fun moveTo(
        entity: Entity,
        target: Pose,
        durationMs: Long = DEFAULT_DURATION_MS,
    ) {
        val current =
            runCatching { entity.getComponent<Transform>().transform }.getOrNull()
                ?: return
        moves[entity] = Move(current, target, System.currentTimeMillis(), durationMs)
    }

    fun cancel(entity: Entity) {
        moves.remove(entity)
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
        const val DEFAULT_DURATION_MS = 320L
    }
}
