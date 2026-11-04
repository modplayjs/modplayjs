package com.bitti06.modplayjs.xr.layout

import android.content.Context
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Vector3
import com.meta.spatial.toolkit.Grabbable
import com.meta.spatial.toolkit.GrabbableType
import com.meta.spatial.toolkit.Transform

/**
 * Adaptive panel layout:
 * - Every panel has a fixed, upright 3D spatial location in the arc.
 * - Every panel features an active [Grabbable] component allowing direct manipulation.
 */
class PanelLayout(context: Context) {

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
            PANEL_MAIN -> Pose(Vector3(0f, 1.45f, 1.95f), facingUser)
            PANEL_LIBRARY -> Pose(Vector3(-1.75f, 1.45f, 1.75f), facingUser)
            PANEL_SETTINGS -> Pose(Vector3(1.75f, 1.45f, 1.75f), facingUser)
            PANEL_PATTERN -> Pose(Vector3(-1.75f, 0.45f, 1.75f), facingUser)
            PANEL_DETAILS -> Pose(Vector3(0f, 0.45f, 1.85f), facingUser)
            PANEL_DEBUG -> Pose(Vector3(1.75f, 0.45f, 1.75f), facingUser)
            // Second row, further out: these two open from Settings.
            PANEL_QUEUE -> Pose(Vector3(-0.95f, 1.45f, 2.4f), facingUser)
            PANEL_IGNORED -> Pose(Vector3(0.95f, 1.45f, 2.4f), facingUser)
            else -> Pose(Vector3(0f, 1.45f, 1.95f), facingUser)
        }

    fun savedPose(id: Int): Pose? {
        if (!prefs.contains("x$id")) return null
        return Pose(
            Vector3(prefs.getFloat("x$id", 0f), prefs.getFloat("y$id", 1.4f), prefs.getFloat("z$id", 1.5f)),
            Quaternion(
                prefs.getFloat("qx$id", 0f),
                prefs.getFloat("qy$id", 0f),
                prefs.getFloat("qz$id", 0f),
                prefs.getFloat("qw$id", 1f),
            ),
        )
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
                entity.setComponent(Transform(pose))
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
    fun setFree(on: Boolean, entities: Map<Int, Entity>, hasTrack: Boolean = false) {
        if (!on) save(entities)
        free = on
        prefs.edit().putBoolean(KEY_FREE, on).apply()
        for ((id, entity) in entities) {
            val pose =
                if (on) {
                    savedPose(id) ?: defaultPose(id, hasTrack)
                } else {
                    defaultPose(id, hasTrack)
                }
            entity.setComponent(Transform(pose))
            setGrabbable(entity, on)
        }
    }

    /** Deliberate wipe: back to the arc and forget the saved arrangement. */
    fun reset(entities: Map<Int, Entity>, hasTrack: Boolean = false) {
        for ((id, entity) in entities) {
            entity.setComponent(Transform(defaultPose(id, hasTrack)))
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
     * Stationary mode has to remove the component, not just disable it: the
     * Interaction SDK turns a Grabbable panel into a grabbable interactable
     * (grab handles and all), so an entity that keeps the component keeps
     * moving in the user's hand.
     */
    private fun setGrabbable(entity: Entity, enabled: Boolean) {
        if (!enabled) {
            entity.tryRemoveComponent<Grabbable>()
            return
        }
        val grabbable =
            Grabbable(
                enabled = true,
                type = GrabbableType.PIVOT_Y,
                minHeight = 0.3f,
                maxHeight = 3.0f,
            )
        grabbable.enabled = true
        entity.setComponent(grabbable)
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

        private const val LAYOUT_VERSION = 31
    }
}
