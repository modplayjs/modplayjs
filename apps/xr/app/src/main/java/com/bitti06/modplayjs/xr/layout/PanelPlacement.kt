package com.bitti06.modplayjs.xr.layout

import android.content.Context
import com.bitti06.modplayjs.xr.panels.PANELS
import com.bitti06.modplayjs.xr.panels.PanelId
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Vector3
import com.meta.spatial.isdk.IsdkGrabbable
import com.meta.spatial.toolkit.Transform
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Where the panels stand: a fixed arc, or free placement the user arranges by
 * hand.
 *
 * Poses come from [PANELS], so a size and its position are never written twice.
 * Free placement persists the pose per panel; stationary restores the arc and
 * removes the grab components. Mode switches slide through [PanelAnimator]; a
 * reset lands instantly, because a reset should.
 */
class PanelPlacement(
    context: Context,
    private val animator: PanelAnimator? = null,
) {

    private val prefs = context.getSharedPreferences("xr.layout", Context.MODE_PRIVATE)
    private val specs = PANELS.associateBy { it.id }

    private val _free: MutableStateFlow<Boolean>

    init {
        // Clear first, read after: a version bump wipes the stored layout,
        // including the free/stationary choice, so a stale "stationary" must
        // not survive the wipe for this session.
        if (prefs.getInt(KEY_VERSION, 1) < LAYOUT_VERSION) {
            prefs.edit().clear().putInt(KEY_VERSION, LAYOUT_VERSION).apply()
        }
        _free = MutableStateFlow(prefs.getBoolean(KEY_FREE, true))
    }

    val freeLayout: StateFlow<Boolean> = _free.asStateFlow()

    val free: Boolean
        get() = _free.value

    /**
     * Place every panel and set its grab state.
     *
     * In free mode a panel that already has a Transform is left alone: the user
     * put it there, and a track change must not yank it back into the arc.
     */
    fun apply(entities: Map<PanelId, Entity>) {
        for ((id, entity) in entities) {
            val spec = specs[id] ?: continue
            val placed = entity.tryGetComponent<Transform>() != null
            if (!free || !placed) {
                val pose = if (free) savedPose(id) ?: spec.pose else spec.pose
                place(entity, pose, animate = false)
            }
            setGrabbable(entity, free)
        }
    }

    /**
     * Switch between free and stationary.
     *
     * Free -> stationary saves where the user left everything and puts the arc
     * back, but the saved poses stay: switching back restores the arrangement.
     */
    fun setFree(
        on: Boolean,
        entities: Map<PanelId, Entity>,
        /** Panels to leave untouched, e.g. the settings panel being used. */
        skip: Set<PanelId> = emptySet(),
    ) {
        if (!on) save(entities)
        _free.value = on
        prefs.edit().putBoolean(KEY_FREE, on).apply()
        for ((id, entity) in entities) {
            val spec = specs[id] ?: continue
            if (id in skip) {
                setGrabbable(entity, on)
                continue
            }
            val pose = if (on) savedPose(id) ?: spec.pose else spec.pose
            place(entity, pose, animate = true)
            setGrabbable(entity, on)
        }
    }

    /** Deliberate wipe: back to the arc and forget the saved arrangement. */
    fun reset(entities: Map<PanelId, Entity>) {
        for ((id, entity) in entities) {
            val spec = specs[id] ?: continue
            place(entity, spec.pose, animate = false)
            setGrabbable(entity, free)
        }
        val edit = prefs.edit()
        for (id in entities.keys) {
            edit.remove("x${id.name}")
            edit.remove("y${id.name}")
            edit.remove("z${id.name}")
            edit.remove("qx${id.name}")
            edit.remove("qy${id.name}")
            edit.remove("qz${id.name}")
            edit.remove("qw${id.name}")
        }
        edit.apply()
    }

    /** Persist the current poses. */
    fun save(entities: Map<PanelId, Entity>) {
        val edit = prefs.edit()
        for ((id, entity) in entities) {
            val pose = runCatching { entity.getComponent<Transform>().transform }.getOrNull() ?: continue
            edit.putFloat("x${id.name}", pose.t.x)
            edit.putFloat("y${id.name}", pose.t.y)
            edit.putFloat("z${id.name}", pose.t.z)
            edit.putFloat("qx${id.name}", pose.q.x)
            edit.putFloat("qy${id.name}", pose.q.y)
            edit.putFloat("qz${id.name}", pose.q.z)
            edit.putFloat("qw${id.name}", pose.q.w)
        }
        edit.apply()
    }

    private fun savedPose(id: PanelId): Pose? {
        val key = "x${id.name}"
        if (!prefs.contains(key)) return null
        return Pose(
            Vector3(
                prefs.getFloat(key, 0f),
                prefs.getFloat("y${id.name}", 1.45f),
                prefs.getFloat("z${id.name}", 1.75f),
            ),
            // Named arguments: the primary constructor is Quaternion(w, x, y, z),
            // so positional qx,qy,qz,qw rotated panels around the wrong axis.
            Quaternion(
                w = prefs.getFloat("qw${id.name}", 1f),
                x = prefs.getFloat("qx${id.name}", 0f),
                y = prefs.getFloat("qy${id.name}", 0f),
                z = prefs.getFloat("qz${id.name}", 0f),
            ),
        )
    }

    private fun place(entity: Entity, pose: Pose, animate: Boolean) {
        if (animate && animator != null) {
            animator.moveTo(entity, pose)
        } else {
            animator?.cancel(entity)
            entity.setComponent(Transform(pose))
        }
    }

    /**
     * Panel grabbing, exactly as the Interaction SDK documents it:
     *
     * - Panels are not `Grabbable` entities. The "Listen to input events" page
     *   states that grabbable entities get no `onClick` for controller trigger
     *   presses, and every control in this app is a click on a panel. A toolkit
     *   `Grabbable` here would make the whole UI unclickable.
     * - `IsdkComponentCreationSystem` gives every `Panel` its
     *   `IsdkPanelDimensions` and its `IsdkPanelGrabHandle`, and
     *   `IsdkPanelPaddingRenderSystem` outlines that grab region on hover. The
     *   app never writes or removes those: the creation system only rebuilds
     *   them when the `Panel` component changes, so a hand-written handle would
     *   not be tracked.
     * - The switch is `IsdkGrabbable`. The panel page lists `IsdkGrabbable` and
     *   `IsdkPanelGrabHandle` as the pair that turns grabbing on; the handle
     *   already exists, so free mode sets the flag and stationary clears it.
     *
     * Movement type, responsiveness and constraints stay at their SDK defaults:
     * nothing here is guessed.
     */
    private fun setGrabbable(entity: Entity, enabled: Boolean) {
        if (enabled) {
            val current = runCatching { entity.tryGetComponent<IsdkGrabbable>() }.getOrNull()
            if (current != null) {
                runCatching { current.recycle() }
                return
            }
            // A slide in progress would fight the hand; drop it for this entity.
            animator?.cancel(entity)
            entity.setComponent(IsdkGrabbable(enabled = true))
        } else {
            // Presence is the switch: removing the component is what the panel
            // page's manual path replaces `Grabbable` with, so its absence is
            // "not grabbable".
            entity.tryRemoveComponent<IsdkGrabbable>()
        }
    }

    private companion object {
        const val KEY_FREE = "free"
        const val KEY_VERSION = "layoutVersion"

        /**
         * Cleared on every change to the arc or to what a saved pose means.
         * 37: grabbing is the panel's own ISDK grab region with `IsdkGrabbable`
         * as the switch, and the layout choice is read after the wipe.
         */
        const val LAYOUT_VERSION = 37
    }
}
