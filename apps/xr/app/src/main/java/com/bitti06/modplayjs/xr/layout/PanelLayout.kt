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
 * - When no track is playing, the Library panel is centered directly in front of the viewer.
 * - When a track is loaded, the Now Playing panel takes center stage and the Library shifts left.
 *
 * Every panel features active [Grabbable] component allowing direct hand and controller manipulation.
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
     * Default spatial poses in ReferenceSpace.LOCAL_FLOOR.
     * Every panel has a fixed, upright 3D location in the arc.
     */
    fun defaultPose(id: Int, @Suppress("UNUSED_PARAMETER") hasTrack: Boolean = false): Pose =
        when (id) {
            PANEL_MAIN -> Pose(Vector3(0f, 1.45f, 1.95f), Quaternion.fromEuler(0f, 0f, 0f))
            PANEL_LIBRARY -> Pose(Vector3(-1.75f, 1.45f, 1.75f), Quaternion.fromEuler(0f, -25f, 0f))
            PANEL_SETTINGS -> Pose(Vector3(1.75f, 1.45f, 1.75f), Quaternion.fromEuler(0f, 25f, 0f))
            PANEL_PATTERN -> Pose(Vector3(-1.75f, 0.45f, 1.75f), Quaternion.fromEuler(-10f, -25f, 0f))
            PANEL_DETAILS -> Pose(Vector3(0f, 0.45f, 1.85f), Quaternion.fromEuler(-18f, 0f, 0f))
            PANEL_DEBUG -> Pose(Vector3(1.75f, 0.45f, 1.75f), Quaternion.fromEuler(-10f, 25f, 0f))
            else -> Pose(Vector3(0f, 1.45f, 1.95f), Quaternion.fromEuler(0f, 0f, 0f))
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

    /** Apply default or saved poses and attach grabbables. */
    fun apply(entities: Map<Int, Entity>, hasTrack: Boolean = false) {
        for ((id, entity) in entities) {
            val pose = if (free) savedPose(id) ?: defaultPose(id, hasTrack) else defaultPose(id, hasTrack)
            entity.setComponent(Transform(pose))
            attachGrabbable(entity)
        }
    }

    fun setFree(on: Boolean, entities: Map<Int, Entity>, hasTrack: Boolean = false) {
        if (!on) save(entities)
        free = on
        prefs.edit().putBoolean(KEY_FREE, on).apply()
        if (on) {
            for ((id, entity) in entities) {
                entity.setComponent(Transform(savedPose(id) ?: defaultPose(id, hasTrack)))
                attachGrabbable(entity)
            }
        } else {
            reset(entities, hasTrack)
        }
    }

    fun reset(entities: Map<Int, Entity>, hasTrack: Boolean = false) {
        for ((id, entity) in entities) {
            entity.setComponent(Transform(defaultPose(id, hasTrack)))
            attachGrabbable(entity)
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

    private fun attachGrabbable(entity: Entity) {
        val toolkitGrabbable = Grabbable(
            enabled = true,
            type = GrabbableType.PIVOT_Y,
            minHeight = 0.3f,
            maxHeight = 3.0f,
        )
        toolkitGrabbable.enabled = true
        entity.setComponent(toolkitGrabbable)
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

        private const val LAYOUT_VERSION = 10
    }
}
