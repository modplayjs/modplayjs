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
 * Panel placement: an arc by default, free-floating on request.
 *
 * In free mode every panel gets a [Grabbable] (pivot on Y, floor-to-head
 * height clamp) and its pose is written to preferences, so the stage the user
 * builds survives a restart. Reset restores the arc.
 */
class PanelLayout(private val context: Context) {

    private val prefs = context.getSharedPreferences("xr.layout", Context.MODE_PRIVATE)

    var free: Boolean = prefs.getBoolean(KEY_FREE, false)
        private set

    init {
        // Layouts saved before the coordinate fix hold z < 0 and would put
        // every panel behind the viewer again. Drop them once.
        if (prefs.getInt(KEY_VERSION, 1) < LAYOUT_VERSION) {
            val edit = prefs.edit()
            for (key in prefs.all.keys) {
                if (key != KEY_FREE && key != KEY_VERSION) edit.remove(key)
            }
            edit.putInt(KEY_VERSION, LAYOUT_VERSION).apply()
        }
    }

    /**
     * Panels face the viewer: the arc is authored at +Z (forward) and each
     * panel is turned 180 degrees, exactly as Meta's "Build and position your
     * first panel" tutorial does.
     */
    private val facingUser = Quaternion(0f, 180f, 0f)

    /**
     * Default arc in front of the viewer, floor-relative (the scene uses
     * ReferenceSpace.LOCAL_FLOOR, so Y = 0 is the floor and 1.45 m is eye
     * height), 1.1-2 m out along +Z.
     */
    fun defaultPose(id: Int): Pose =
        when (id) {
            PANEL_MAIN -> Pose(Vector3(0f, 1.45f, 1.7f), facingUser)
            PANEL_LIBRARY -> Pose(Vector3(-1.25f, 1.35f, 1.35f), facingUser)
            PANEL_SETTINGS -> Pose(Vector3(1.25f, 1.35f, 1.35f), facingUser)
            PANEL_DEBUG -> Pose(Vector3(1.6f, 0.85f, 1.15f), facingUser)
            PANEL_PATTERN -> Pose(Vector3(-1.55f, 0.85f, 1.25f), facingUser)
            PANEL_DETAILS -> Pose(Vector3(0f, 0.75f, 2.05f), facingUser)
            else -> Pose(Vector3(0f, 1.45f, 1.7f), facingUser)
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

    /** Apply arc or saved free poses and set the grabbable flag. */
    fun apply(entities: Map<Int, Entity>) {
        for ((id, entity) in entities) {
            val pose = if (free) savedPose(id) ?: defaultPose(id) else defaultPose(id)
            entity.setComponent(Transform(pose))
            entity.setComponent(grabbable(free))
        }
    }

    fun setFree(on: Boolean, entities: Map<Int, Entity>) {
        if (!on) save(entities)
        free = on
        prefs.edit().putBoolean(KEY_FREE, on).apply()
        if (on) {
            // Start from where the arc put them, then let the user move things.
            for ((id, entity) in entities) {
                entity.setComponent(Transform(savedPose(id) ?: defaultPose(id)))
                entity.setComponent(grabbable(true))
            }
        } else {
            reset(entities)
        }
    }

    fun reset(entities: Map<Int, Entity>) {
        for ((id, entity) in entities) {
            entity.setComponent(Transform(defaultPose(id)))
            entity.setComponent(grabbable(free))
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

    /** Persist the current poses (only meaningful in free mode). */
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

    private fun grabbable(on: Boolean): Grabbable {
        val component = Grabbable(type = GrabbableType.PIVOT_Y, minHeight = 0.6f, maxHeight = 2.4f)
        component.enabled = on
        return component
    }

    companion object {
        const val PANEL_MAIN = 1
        const val PANEL_LIBRARY = 2
        const val PANEL_SETTINGS = 3
        const val PANEL_DEBUG = 4
        const val PANEL_PATTERN = 5
        const val PANEL_DETAILS = 6

        private const val KEY_FREE = "free"
        private const val KEY_VERSION = "layoutVersion"

        /** Bumped whenever the default poses change incompatibly. */
        private const val LAYOUT_VERSION = 2
    }
}
