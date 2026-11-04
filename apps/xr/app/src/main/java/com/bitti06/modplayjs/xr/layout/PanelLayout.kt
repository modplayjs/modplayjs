package com.bitti06.modplayjs.xr.layout

import android.content.Context
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Vector3
import com.meta.spatial.isdk.IsdkGrabMovementType
import com.meta.spatial.isdk.IsdkGrabProxy
import com.meta.spatial.isdk.IsdkGrabbable
import com.meta.spatial.isdk.IsdkPanelGrabHandle
import com.meta.spatial.toolkit.Transform

/**
 * Panel placement: a fixed arc, or free placement the user arranges by hand.
 *
 * Free mode writes the Interaction SDK's grabbable and persists poses;
 * stationary removes it again (otherwise the panel keeps following the hand) and
 * re-applies the arc. Mode switches slide via [PanelAnimator]; a reset lands
 * instantly.
 */
class PanelLayout(
    context: Context,
    /** Slides panels to their target pose instead of teleporting them. */
    private val animator: PanelAnimator? = null,
) {

    private val prefs = context.getSharedPreferences("xr.layout", Context.MODE_PRIVATE)

    var free: Boolean = prefs.getBoolean(KEY_FREE, true)
        private set

    init {
        if (prefs.getInt(KEY_VERSION, 1) < LAYOUT_VERSION) {
            prefs.edit().clear().putInt(KEY_VERSION, LAYOUT_VERSION).apply()
        }
    }

    /**
     * Panels face the viewer, upright: 180 degrees of YAW, 0 pitch, 0 roll.
     * This is the Euler (pitch, yaw, roll) form Meta's panel tutorial uses.
     */
    private val facingUser = Quaternion(0f, 180f, 0f)

    /**
     * Default spatial poses in ReferenceSpace.LOCAL_FLOOR, arc at +Z (the SDK is
     * left-handed, +Z is forward). Passing the 180 degrees as ROLL instead of
     * yaw stands every panel on its head, so the poses go through [facingUser].
     */
    fun defaultPose(id: Int, @Suppress("UNUSED_PARAMETER") hasTrack: Boolean = false): Pose =
        when (id) {
            // The panel you look at most, so it is the one that sits closest:
            // 1.70 m instead of 1.95 m makes every glyph a tenth larger without
            // closing the gap to the library on the left.
            PANEL_MAIN -> Pose(Vector3(0f, 1.45f, 1.70f), facingUser)
            PANEL_LIBRARY -> Pose(Vector3(-1.75f, 1.45f, 1.75f), facingUser)
            PANEL_SETTINGS -> Pose(Vector3(1.75f, 1.45f, 1.75f), facingUser)
            PANEL_PATTERN -> Pose(Vector3(-1.75f, 0.45f, 1.75f), facingUser)
            // Wider panel: further out so its edges clear the neighbours and
            // higher, because three text columns need vertical room.
            PANEL_DETAILS -> Pose(Vector3(0f, 1.05f, 2.15f), facingUser)
            PANEL_DEBUG -> Pose(Vector3(1.75f, 0.45f, 1.75f), facingUser)
            // Second row, further out: these two open from Settings.
            PANEL_QUEUE -> Pose(Vector3(-0.95f, 1.45f, 2.4f), facingUser)
            PANEL_IGNORED -> Pose(Vector3(0.95f, 1.45f, 2.4f), facingUser)
            else -> Pose(Vector3(0f, 1.45f, 1.70f), facingUser)
        }

    fun savedPose(id: Int): Pose? {
        if (!prefs.contains("x$id")) return null
        return Pose(
            Vector3(prefs.getFloat("x$id", 0f), prefs.getFloat("y$id", 1.4f), prefs.getFloat("z$id", 1.5f)),
            // Named arguments, not positional: the primary constructor is
            // Quaternion(w, x, y, z), so passing qx,qy,qz,qw positionally
            // rotated every panel by the wrong axis and showed its back.
            Quaternion(
                w = prefs.getFloat("qw$id", 1f),
                x = prefs.getFloat("qx$id", 0f),
                y = prefs.getFloat("qy$id", 0f),
                z = prefs.getFloat("qz$id", 0f),
            ),
        )
    }

    /**
     * Move one panel. Switching modes animates so the arc change is followable;
     * an explicit reset lands immediately, because a reset should.
     */
    private fun place(entity: Entity, pose: Pose, animate: Boolean = true) {
        if (animate && animator != null) {
            animator.moveTo(entity, pose)
        } else {
            animator?.cancel(entity)
            entity.setComponent(Transform(pose))
        }
    }

    /**
     * Place the panels and set whether they can be grabbed.
     *
     * In free mode a panel that already has a Transform is left alone: the user
     * put it there, and a track change must not yank it back into the arc. Only
     * new panels (first placement) and stationary mode get a written pose.
     */
    fun apply(entities: Map<Int, Entity>, hasTrack: Boolean = false) {
        for ((id, entity) in entities) {
            val placed = entity.tryGetComponent<Transform>() != null
            if (!free || !placed) {
                val pose =
                    if (free) {
                        savedPose(id) ?: defaultPose(id, hasTrack)
                    } else {
                        defaultPose(id, hasTrack)
                    }
                // First placement is instant: a panel should appear where it
                // belongs, not fly in from the origin.
                place(entity, pose, animate = false)
            }
            setGrabbable(entity, free)
        }
    }

    /**
     * Switch between free and stationary.
     *
     * Free -> stationary saves where the user left everything and then puts the
     * arc back, but the saved poses stay: switching back to free restores the
     * arrangement instead of starting over.
     */
    fun setFree(
        on: Boolean,
        entities: Map<Int, Entity>,
        hasTrack: Boolean = false,
        /** Panels to leave untouched, e.g. the settings panel being used. */
        skip: Set<Int> = emptySet(),
    ) {
        if (!on) save(entities)
        free = on
        prefs.edit().putBoolean(KEY_FREE, on).apply()
        for ((id, entity) in entities) {
            if (id in skip) {
                setGrabbable(entity, on)
                continue
            }
            val pose =
                if (on) {
                    savedPose(id) ?: defaultPose(id, hasTrack)
                } else {
                    defaultPose(id, hasTrack)
                }
            place(entity, pose)
            setGrabbable(entity, on)
        }
    }

    /** Deliberate wipe: back to the arc and forget the saved arrangement. */
    fun reset(entities: Map<Int, Entity>, hasTrack: Boolean = false) {
        for ((id, entity) in entities) {
            place(entity, defaultPose(id, hasTrack), animate = false)
            setGrabbable(entity, free)
        }
        val edit = prefs.edit()
        for (id in entities.keys) {
            edit.remove("x$id")
            edit.remove("y$id")
            edit.remove("z$id")
            edit.remove("qx$id")
            edit.remove("qy$id")
            edit.remove("qz$id")
            edit.remove("qw$id")
        }
        edit.apply()
    }

    /** Persist the current poses. */
    fun save(entities: Map<Int, Entity>) {
        val edit = prefs.edit()
        for ((id, entity) in entities) {
            val pose = runCatching { entity.getComponent<Transform>().transform }.getOrNull() ?: continue
            edit.putFloat("x$id", pose.t.x)
            edit.putFloat("y$id", pose.t.y)
            edit.putFloat("z$id", pose.t.z)
            edit.putFloat("qx$id", pose.q.x)
            edit.putFloat("qy$id", pose.q.y)
            edit.putFloat("qz$id", pose.q.z)
            edit.putFloat("qw$id", pose.q.w)
        }
        edit.apply()
    }

    /**
     * Free mode is the Interaction SDK's own path: [IsdkGrabbable] plus the
     * panel grab handle the SDK attaches to every `Panel`. There is no toolkit
     * `Grabbable` here on purpose — for panels the SDK derives collision and
     * handles from `Panel` itself, so the legacy component only added a second,
     * competing grab path.
     *
     * Stationary removes the components instead of disabling them: the handle
     * reads [IsdkGrabbable] to start a grab, but leaving it in place would still
     * draw the handle bars around a panel the user asked to pin down.
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
        // when it is missing or still says something else. This runs on every
        // track change, and a track change must not drop a panel mid-grab.
        val current = runCatching { entity.tryGetComponent<IsdkGrabbable>() }.getOrNull()
        val grabbableIsUsable =
            if (current == null) {
                false
            } else {
                val usable =
                    current.enabled && current.movementType == IsdkGrabMovementType.AxialBillboard
                runCatching { current.recycle() }
                usable
            }
        if (!grabbableIsUsable) {
            // AxialBillboard, not Direct: a grabbed panel stays upright and
            // turns towards the viewer, so text is readable wherever the hand
            // puts it.
            entity.setComponent(
                IsdkGrabbable(
                    enabled = true,
                    movementType = IsdkGrabMovementType.AxialBillboard,
                ),
            )
        }
        // IsdkComponentCreationSystem only adds the handle when the Panel
        // component changes, so a panel that was stationary once needs it back.
        // These are the same all-defaults values the creation system writes.
        val handle = runCatching { entity.tryGetComponent<IsdkPanelGrabHandle>() }.getOrNull()
        if (handle == null) {
            entity.setComponent(IsdkPanelGrabHandle())
        } else {
            runCatching { handle.recycle() }
        }
    }

    companion object {
        const val PANEL_MAIN = 1
        const val PANEL_LIBRARY = 2
        const val PANEL_SETTINGS = 3
        const val PANEL_DEBUG = 4
        const val PANEL_PATTERN = 5
        const val PANEL_DETAILS = 6
        const val PANEL_QUEUE = 7
        const val PANEL_IGNORED = 8

        private const val KEY_FREE = "free"
        private const val KEY_VERSION = "layoutVersion"

        /**
         * Bumped when the arc itself changes or when a saved pose would be read
         * wrongly. 33: the main panel moved 1.95 m -> 1.70 m and free mode no
         * longer writes the toolkit Grabbable, so poses from 32 belong to a
         * different layout.
         */
        private const val LAYOUT_VERSION = 33
    }
}
