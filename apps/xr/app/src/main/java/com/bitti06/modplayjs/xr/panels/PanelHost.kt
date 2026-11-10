package com.bitti06.modplayjs.xr.panels

import com.bitti06.modplayjs.xr.layout.PanelAnimator
import com.bitti06.modplayjs.xr.layout.PanelPlacement
import com.meta.spatial.core.Entity
import com.meta.spatial.toolkit.MeshCollision
import com.meta.spatial.toolkit.Panel
import com.meta.spatial.toolkit.Transform
import com.meta.spatial.toolkit.Visible

/**
 * The live panels.
 *
 * A panel entity exists only while the panel is meant to be on screen. That is
 * the whole performance story: a `Panel` component makes `PanelCreationSystem`
 * build a `PanelSceneObject` with its own virtual display, texture and
 * compositor layer, and the compositor keeps paying for a hidden one. Eight
 * eager panels plus 32 channel-label panels was 40 layers.
 *
 * [MAX_LIVE] is a hard ceiling. The context panels are made mutually exclusive
 * by the visibility rule, so normal use stays at three or four.
 */
class PanelHost(
    private val placement: PanelPlacement,
    private val animator: PanelAnimator,
    private val onRelease: (Entity) -> Unit = {},
) {

    private val live = LinkedHashMap<PanelId, Entity>()

    /** The entities that currently exist, for save/apply/grab passes. */
    val entities: Map<PanelId, Entity>
        get() = live

    /**
     * Make the live set match [visible] (priority order). Extra panels beyond
     * [MAX_LIVE] are dropped from the tail.
     */
    fun sync(visible: List<PanelId>) {
        val wanted = visible.take(MAX_LIVE)
        val wantedSet = wanted.toSet()

        val iterator = live.entries.iterator()
        while (iterator.hasNext()) {
            val (id, entity) = iterator.next()
            if (id in wantedSet) continue
            // A panel in a hand is not taken away; the next sync retries.
            if (placement.isGrabbed(entity)) continue
            // Only a free arrangement is the user's; saving an arc pose here
            // would overwrite it.
            if (placement.free) placement.save(id, entity)
            animator.cancel(entity)
            onRelease(entity)
            entity.destroy()
            iterator.remove()
        }

        for (id in wanted) {
            if (id in live) continue
            val spec = PANELS.firstOrNull { it.id == id } ?: continue
            val entity =
                Entity.create(
                    Panel(spec.androidId, MeshCollision.LineTest),
                    Transform(placement.poseFor(id)),
                    Visible(true),
                )
            live[id] = entity
            placement.applyGrab(entity)
        }
    }

    fun applyPoses(animate: Boolean) = placement.apply(live, animate)

    fun save() = placement.saveLive(live)

    fun reset() = placement.reset(live)

    fun release() {
        for (entity in live.values) {
            animator.cancel(entity)
            onRelease(entity)
            entity.destroy()
        }
        live.clear()
    }

    private companion object {
        /** At most five live panel displays; see the class comment. */
        const val MAX_LIVE = 5
    }
}
