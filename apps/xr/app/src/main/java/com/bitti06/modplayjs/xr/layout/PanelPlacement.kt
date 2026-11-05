package com.bitti06.modplayjs.xr.layout

import android.content.Context
import com.bitti06.modplayjs.xr.panels.PANELS
import com.bitti06.modplayjs.xr.panels.PanelId
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Vector3
import com.meta.spatial.isdk.IsdkGrabMovementType
import com.meta.spatial.isdk.IsdkGrabProxy
import com.meta.spatial.isdk.IsdkGrabbable
import com.meta.spatial.isdk.IsdkPanelGrabHandle
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

    private val _free = MutableStateFlow(prefs.getBoolean(KEY_FREE, true))
    val freeLayout: StateFlow<Boolean> = _free.asStateFlow()

    val free: Boolean
        get() = _free.value

    init {
        if (prefs.getInt(KEY_VERSION, 1) < LAYOUT_VERSION) {
            prefs.edit().clear().putInt(KEY_VERSION, LAYOUT_VERSION).apply()
        }
    }

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
     * Free mode is the Interaction SDK's own path: [IsdkGrabbable] plus the
     * panel grab handle. For panels the SDK derives collision and handles from
     * the `Panel` component (`IsdkComponentCreationSystem.ensurePanelComponents`),
     * so no toolkit `Grabbable` is involved; the manual-conversion page lists
     * exactly these two components.
     *
     * Stationary removes them: the handle reads [IsdkGrabbable] to start a grab,
     * and leaving the handle in place would keep the bars drawn around a panel
     * the user pinned down.
     */
    private fun setGrabbable(entity: Entity, enabled: Boolean) {
        if (!enabled) {
            entity.tryRemoveComponent<IsdkGrabbable>()
            entity.tryRemoveComponent<IsdkGrabProxy>()
            entity.tryRemoveComponent<IsdkPanelGrabHandle>()
            return
        }
        // A slide in progress would fight the hand; drop it for this entity.
        animator?.cancel(entity)

        // Re-writing the component resets its grab state, so it is only written
        // when it is missing or still says something else: this runs on every
        // track change, which must not drop a panel mid-grab.
        val current = runCatching { entity.tryGetComponent<IsdkGrabbable>() }.getOrNull()
        val usable =
            if (current == null) {
                false
            } else {
                val ok = current.enabled && current.movementType == IsdkGrabMovementType.AxialBillboard
                runCatching { current.recycle() }
                ok
            }
        if (!usable) {
            // AxialBillboard, not Direct: a grabbed panel stays upright and
            // turns towards the viewer, so text stays readable in the hand.
            entity.setComponent(
                IsdkGrabbable(enabled = true, movementType = IsdkGrabMovementType.AxialBillboard),
            )
        }

        // The creation system only adds the handle when the Panel component
        // changes, so a panel that was stationary once needs it back. These are
        // the same all-defaults values the creation system writes.
        val handle = runCatching { entity.tryGetComponent<IsdkPanelGrabHandle>() }.getOrNull()
        if (handle == null) {
            entity.setComponent(IsdkPanelGrabHandle())
        } else {
            runCatching { handle.recycle() }
        }
    }

    private companion object {
        const val KEY_FREE = "free"
        const val KEY_VERSION = "layoutVersion"

        /**
         * Cleared on every change to the arc or to what a saved pose means.
         * 35: the arc no longer turns every panel 180 degrees, so every pose
         * saved under 34 has the user looking at a back.
         */
        const val LAYOUT_VERSION = 35
    }
}
