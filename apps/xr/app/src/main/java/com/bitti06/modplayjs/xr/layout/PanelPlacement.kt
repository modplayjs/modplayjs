package com.bitti06.modplayjs.xr.layout

import android.content.Context
import com.bitti06.modplayjs.xr.panels.PANELS
import com.bitti06.modplayjs.xr.panels.PanelId
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Vector3
import com.meta.spatial.toolkit.Grabbable
import com.meta.spatial.toolkit.GrabbableType
import com.meta.spatial.toolkit.Transform
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/**
 * Where the panels stand: a fixed arc, or free placement the user arranges by
 * hand.
 *
 * Poses come from [PANELS], so a size and its position are never written twice.
 * Free placement persists the pose per panel; stationary restores the arc and
 * removes the grab component. Mode switches slide through [PanelAnimator]; a
 * reset lands instantly, because a reset should.
 *
 * The anchor is a full pose, not a translation: [setAnchor] takes the head's
 * yaw as well. With only the translation the authored arc was always built
 * towards world +Z, so a session that started facing another way put the arc
 * at the user's side and left azimuth 0 - the channel meant to be "in front" -
 * pointing somewhere else.
 */
class PanelPlacement(
    context: Context,
    private val animator: PanelAnimator? = null,
) {

    private val prefs = context.getSharedPreferences("xr.layout", Context.MODE_PRIVATE)
    private val specs = PANELS.associateBy { it.id }

    /**
     * Where the user's head was when the arc was placed. The authored poses
     * assume the eye at [DEFAULT_EYE_HEIGHT] on the origin facing +Z; this
     * offset and yaw move the whole arc onto the real head, so the panels
     * appear in front of the user at eye height whatever the runtime reports.
     */
    private var anchorT = Vector3(0f, 0f, 0f)

    /** Head yaw at the anchor, radians. Applied to the offset and the panels. */
    private var anchorYaw = 0f

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
     * Anchor the arc to a head pose.
     *
     * Called at startup and again after a recenter, because a recenter moves
     * and rotates the LOCAL_FLOOR origin: the entities keep their coordinates,
     * the user gets a new frame, and an anchor from before the recenter would
     * place the arc metres away.
     *
     * `null` keeps the authored poses, which assume an eye at
     * [DEFAULT_EYE_HEIGHT] on the world origin facing +Z.
     */
    fun setAnchor(head: Pose?) {
        if (head == null) {
            anchorT = Vector3(0f, 0f, 0f)
            anchorYaw = 0f
            return
        }
        anchorT = Vector3(head.t.x, head.t.y - DEFAULT_EYE_HEIGHT, head.t.z)
        anchorYaw = yawOf(head.q)
    }

    /**
     * Move an authored pose into the anchored frame.
     *
     * The offset is rotated by the anchor yaw and the yaw is added to the
     * panel's own rotation, so a panel authored facing +Z still faces the user
     * after the arc has been turned.
     */
    private fun anchored(pose: Pose): Pose {
        val c = cos(anchorYaw)
        val s = sin(anchorYaw)
        val x = c * pose.t.x - s * pose.t.z
        val z = s * pose.t.x + c * pose.t.z
        return Pose(
            Vector3(x + anchorT.x, pose.t.y + anchorT.y, z + anchorT.z),
            Quaternion(0f, yawOf(pose.q) + anchorYaw, 0f),
        )
    }

    /** Yaw of a quaternion that carries only a rotation around Y. */
    private fun yawOf(q: Quaternion): Float =
        atan2(2f * (q.w * q.y + q.x * q.z), 1f - 2f * (q.y * q.y + q.z * q.z))

    /**
     * Place every panel and set its grab state.
     *
     * In free mode a panel that already has a Transform is left alone: the user
     * put it there, and a track change must not yank it back into the arc.
     */
    fun apply(entities: Map<PanelId, Entity>, force: Boolean = false) {
        for ((id, entity) in entities) {
            val spec = specs[id] ?: continue
            val placed = hasTransform(entity)
            if (force || !free || !placed) {
                val pose = if (free) savedPose(id) ?: anchored(spec.pose) else anchored(spec.pose)
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
            val pose = if (on) savedPose(id) ?: anchored(spec.pose) else anchored(spec.pose)
            place(entity, pose, animate = true)
            setGrabbable(entity, on)
        }
    }

    /** Deliberate wipe: back to the arc and forget the saved arrangement. */
    fun reset(entities: Map<PanelId, Entity>) {
        for ((id, entity) in entities) {
            val spec = specs[id] ?: continue
            place(entity, anchored(spec.pose), animate = false)
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

    /**
     * Persist the current poses exactly as they are.
     *
     * No clamping here: the user may deliberately put a panel behind them or
     * close to the floor, and the previous save-time clamp rewrote those
     * positions on the next start. [savedPose] still rejects absurd values on
     * load, which is where a bound belongs - it guards the reader, it does not
     * overrule the writer.
     */
    fun save(entities: Map<PanelId, Entity>) {
        val edit = prefs.edit()
        for ((id, entity) in entities) {
            val pose = readPose(entity) ?: continue
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
                prefs.getFloat(key, 0f).coerceIn(-3.5f, 3.5f),
                prefs.getFloat("y${id.name}", 1.60f).coerceIn(0.4f, 2.5f),
                prefs.getFloat("z${id.name}", 1.75f).coerceIn(0.8f, 3.5f),
            ),
            Quaternion(
                w = prefs.getFloat("qw${id.name}", 1f),
                x = prefs.getFloat("qx${id.name}", 0f),
                y = prefs.getFloat("qy${id.name}", 0f),
                z = prefs.getFloat("qz${id.name}", 0f),
            ),
        )
    }

    /**
     * Component reads borrow from a pool and must be recycled. Without this the
     * pool drains over a session and reads start returning stale data.
     */
    private fun hasTransform(entity: Entity): Boolean {
        val transform = runCatching { entity.tryGetComponent<Transform>() }.getOrNull() ?: return false
        runCatching { transform.recycle() }
        return true
    }

    /** Copy the pose out before the borrowed component goes back to the pool. */
    private fun readPose(entity: Entity): Pose? {
        val transform = runCatching { entity.getComponent<Transform>() }.getOrNull() ?: return null
        return try {
            val pose = transform.transform
            Pose(Vector3(pose.t.x, pose.t.y, pose.t.z), Quaternion(w = pose.q.w, x = pose.q.x, y = pose.q.y, z = pose.q.z))
        } finally {
            runCatching { transform.recycle() }
        }
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
     * Free mode writes the toolkit [Grabbable]; `IsdkToolkitBridgeSystem` turns
     * it into the Interaction SDK grabbable and asks
     * `IsdkComponentCreationSystem` for the panel's grab handle, which is the
     * white outline drawn on hover.
     *
     * The Interaction SDK's own components are never written from here. Doing
     * that crashed the main thread: the entity stored `IsdkGrabbable` with an
     * attribute layout the native side did not expect, and the first read from
     * `IsdkPanelHandleCoordinator` failed with "attempted to get int, wrong data
     * type found". The bridge component is the documented input, and it is the
     * only one this class touches.
     */
    private fun setGrabbable(entity: Entity, enabled: Boolean) {
        if (!enabled) {
            entity.tryRemoveComponent<Grabbable>()
            return
        }
        // A slide in progress would fight the hand; drop it for this entity.
        animator?.cancel(entity)

        // Re-writing resets the grab state, so it is only written when it is
        // missing: this runs on every track change, which must not drop a panel
        // mid-grab.
        val current = runCatching { entity.tryGetComponent<Grabbable>() }.getOrNull()
        if (current != null) {
            runCatching { current.recycle() }
            return
        }
        entity.setComponent(
            Grabbable(
                enabled = true,
                type = GrabbableType.PIVOT_Y,
                minHeight = 0.3f,
                maxHeight = 3.0f,
            ),
        )
    }

    private companion object {
        /** Eye height the authored poses assume, in metres above the floor. */
        const val DEFAULT_EYE_HEIGHT = 1.6f
        const val KEY_FREE = "free"
        const val KEY_VERSION = "layoutVersion"

        /**
         * Cleared on every change to the arc or to what a saved pose means.
         * 40: panels are created with a placeholder Transform and then placed
         * at the head anchor, so poses saved under 39 hold the old position.
         * 41: details moved below now playing, so poses saved under 40 hold
         * the old overlap.
         * 42: details panel elevated higher (y=0.58m).
         * 43: default height updated to eye-level (y=1.60m) and pose clamping added.
         * 44: eye-level arc kept, details back below the transport (y=0.55m).
         * 45: the anchor carries the head yaw, so a saved pose from before this
         * change sits in a frame that was never rotated.
         */
        const val LAYOUT_VERSION = 45
    }
}
