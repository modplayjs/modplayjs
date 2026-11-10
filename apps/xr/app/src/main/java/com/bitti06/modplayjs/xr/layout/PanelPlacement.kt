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
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2

/**
 * Where the panels stand: a fixed arc in a head-captured stage frame, or a free
 * arrangement the user owns.
 *
 * The stage frame is captured on an event only - first placement, a recenter,
 * a mode switch, or a sustained posture change. Head movement alone never
 * moves or rotates it, which is what stops the layout from flipping around
 * when the user walks, turns, or switches between free and stationary.
 *
 * The free arrangement is stored *relative to the stage frame*. Restoring it
 * after a mode switch or a recenter therefore rebases the whole arrangement as
 * one rigid body onto the current frame: the shape is kept, nothing is
 * recomputed per panel, and no panel can end up facing the wrong way.
 */
class PanelPlacement(
    context: Context,
    private val animator: PanelAnimator? = null,
) {

    private val prefs = context.getSharedPreferences("xr.layout", Context.MODE_PRIVATE)
    private val specs = PANELS.associateBy { it.id }

    private val _free: MutableStateFlow<Boolean>

    /** Frame the arc and the stored arrangement live in. Captured on events. */
    private var stage: Pose? = null
    private var stagePitch = 0f
    private var stageY = 0f

    /** Last head pose seen by the frame system, for mode switches/recenters. */
    private var lastHead: Pose? = null

    /** When the current posture was first noticed, 0 when it matches. */
    private var postureSinceNs = 0L

    init {
        // A version bump wipes stored poses: the meaning of the numbers changed
        // (world -> stage-relative), so old values must not be reinterpreted.
        if (prefs.getInt(KEY_VERSION, 1) < LAYOUT_VERSION) {
            prefs.edit().clear().putInt(KEY_VERSION, LAYOUT_VERSION).apply()
        }
        _free = MutableStateFlow(prefs.getBoolean(KEY_FREE, true))
    }

    val freeLayout: StateFlow<Boolean> = _free.asStateFlow()

    val free: Boolean
        get() = _free.value

    /**
     * Capture a new stage frame. `null` keeps the authored poses, which assume
     * an eye at [DEFAULT_EYE_HEIGHT] on the world origin facing +Z.
     */
    fun capture(head: Pose?) {
        lastHead = head ?: lastHead
        if (head == null) {
            stage = null
            stagePitch = 0f
            return
        }
        stage =
            Pose(
                Vector3(head.t.x, head.t.y, head.t.z),
                Quaternion(
                    Math.toDegrees(pitchOf(head.q).toDouble()).toFloat(),
                    Math.toDegrees(yawOf(head.q).toDouble()).toFloat(),
                    0f,
                ),
            )
        stagePitch = pitchOf(head.q)
        stageY = head.t.y
        postureSinceNs = 0L
    }

    fun setAnchor(head: Pose?) = capture(head)

    /**
     * Called once per head sample. Returns true when the stage was recaptured
     * (the caller then re-applies every live panel).
     *
     * A posture change is a change of *body* pose, not of gaze: standing up,
     * sitting down, or rolling over in bed. Looking down at a panel must not
     * move it, so the test uses the head height relative to the captured stage
     * (a 35 cm drop is sitting or lying, a neck bend is 5 cm), plus a pitch
     * delta only while already low, which is the rolling-over case. It must
     * hold for [POSTURE_HOLD_NS] before the stage rotates.
     */
    fun onHead(head: Pose, nowNs: Long): Boolean {
        lastHead = head
        if (stage == null) return false
        val pitch = pitchOf(head.q)
        val heightChanged = abs(head.t.y - stageY) > POSTURE_HEIGHT_STEP_M
        val rolledOver = head.t.y < RECLINE_HEAD_Y_M && abs(pitch - stagePitch) > RECLINE_PITCH_STEP_RAD
        if (!heightChanged && !rolledOver) {
            postureSinceNs = 0L
            return false
        }
        if (postureSinceNs == 0L) {
            postureSinceNs = nowNs
            return false
        }
        if (nowNs - postureSinceNs < POSTURE_HOLD_NS) return false
        capture(head)
        return true
    }

    /** Authored arc pose for a panel in the current stage frame. */
    fun poseFor(id: PanelId): Pose {
        val spec = specs[id] ?: return Pose()
        if (free) stored(id)?.let { return it }
        return place(spec.pose)
    }

    /** Apply the current target to every live panel, never to a grabbed one. */
    fun apply(entities: Map<PanelId, Entity>, animate: Boolean) {
        for ((id, entity) in entities) {
            if (isGrabbed(entity)) continue
            move(entity, poseFor(id), animate)
        }
    }

    /**
     * Switch between free and stationary.
     *
     * Entering stationary stores the arrangement first (relative to the old
     * stage) and then captures a fresh stage from the current head, so the arc
     * appears in front of the user instead of at a stale anchor. Entering free
     * never stores the arc over the arrangement.
     */
    fun setFree(
        on: Boolean,
        entities: Map<PanelId, Entity>,
        skip: Set<PanelId> = emptySet(),
    ) {
        if (!on) saveLive(entities)
        capture(lastHead)
        _free.value = on
        prefs.edit().putBoolean(KEY_FREE, on).apply()
        for ((id, entity) in entities) {
            applyGrab(entity)
            if (id in skip || isGrabbed(entity)) continue
            move(entity, poseFor(id), animate = true)
        }
    }

    /** Deliberate wipe: back to the arc and forget the arrangement. */
    fun reset(entities: Map<PanelId, Entity>) {
        clearStored()
        capture(lastHead)
        for ((id, entity) in entities) {
            applyGrab(entity)
            if (isGrabbed(entity)) continue
            move(entity, poseFor(id), animate = false)
        }
    }

    /**
     * A system recenter moved the reference frame. Recapture and rebase; the
     * stored arrangement is stage-relative, so it comes with the user instead
     * of being wiped (which is what the old code did).
     */
    fun onRecenter(entities: Map<PanelId, Entity>) {
        capture(lastHead)
        apply(entities, animate = true)
    }

    /** Persist one panel; called before its entity is destroyed. */
    fun save(id: PanelId, entity: Entity) {
        val pose = readPose(entity) ?: return
        store(id, pose)
    }

    fun saveLive(entities: Map<PanelId, Entity>) {
        for ((id, entity) in entities) save(id, entity)
    }

    fun clearStored() {
        val edit = prefs.edit()
        for (spec in PANELS) {
            for (key in KEYS) edit.remove(key + spec.id.name)
        }
        edit.apply()
    }

    /** Set or clear the toolkit grab handle. */
    fun applyGrab(entity: Entity, enabled: Boolean = free) {
        if (!enabled) {
            entity.tryRemoveComponent<Grabbable>()
            return
        }
        animator?.cancel(entity)
        val current = runCatching { entity.tryGetComponent<Grabbable>() }.getOrNull()
        if (current != null) {
            runCatching { current.recycle() }
            return
        }
        entity.setComponent(
            Grabbable(
                enabled = true,
                type = GrabbableType.PIVOT_Y,
                minHeight = 0.1f,
                maxHeight = 4.0f,
            ),
        )
    }

    // ------------------------------------------------------------ internals

    private fun place(authored: Pose): Pose {
        val s = stage ?: return authored
        val local = Pose(authored.t - Vector3(0f, DEFAULT_EYE_HEIGHT, 0f), authored.q)
        return s * local
    }

    private fun store(id: PanelId, world: Pose) {
        val s = stage ?: return
        val local = s.inverse() * world
        prefs.edit()
            .putFloat("x" + id.name, local.t.x)
            .putFloat("y" + id.name, local.t.y)
            .putFloat("z" + id.name, local.t.z)
            .putFloat("qx" + id.name, local.q.x)
            .putFloat("qy" + id.name, local.q.y)
            .putFloat("qz" + id.name, local.q.z)
            .putFloat("qw" + id.name, local.q.w)
            .apply()
    }

    private fun stored(id: PanelId): Pose? {
        val key = "x" + id.name
        if (!prefs.contains(key)) return null
        val local =
            Pose(
                Vector3(
                    prefs.getFloat(key, 0f),
                    prefs.getFloat("y" + id.name, 0f),
                    prefs.getFloat("z" + id.name, 0f),
                ),
                Quaternion(
                    w = prefs.getFloat("qw" + id.name, 1f),
                    x = prefs.getFloat("qx" + id.name, 0f),
                    y = prefs.getFloat("qy" + id.name, 0f),
                    z = prefs.getFloat("qz" + id.name, 0f),
                ),
            )
        val s = stage ?: return local
        return s * local
    }

    private fun move(entity: Entity, pose: Pose, animate: Boolean) {
        if (animate && animator != null) {
            animator.moveTo(entity, pose)
        } else {
            animator?.cancel(entity)
            entity.setComponent(Transform(pose))
        }
    }

    fun isGrabbed(entity: Entity): Boolean {
        val grab = runCatching { entity.tryGetComponent<Grabbable>() }.getOrNull() ?: return false
        return try {
            grab.isGrabbed
        } finally {
            runCatching { grab.recycle() }
        }
    }

    private fun readPose(entity: Entity): Pose? {
        val transform = runCatching { entity.getComponent<Transform>() }.getOrNull() ?: return null
        return try {
            val pose = transform.transform
            Pose(
                Vector3(pose.t.x, pose.t.y, pose.t.z),
                Quaternion(w = pose.q.w, x = pose.q.x, y = pose.q.y, z = pose.q.z),
            )
        } finally {
            runCatching { transform.recycle() }
        }
    }

    /** Yaw of a quaternion that carries only a rotation around Y. */
    private fun yawOf(q: Quaternion): Float =
        atan2(2f * (q.w * q.y + q.x * q.z), 1f - 2f * (q.y * q.y + q.z * q.z))

    /** Pitch from the rotated forward vector, robust against roll. */
    private fun pitchOf(q: Quaternion): Float {
        val fy = 2f * (q.w * q.x - q.y * q.z)
        return asin(fy.coerceIn(-1f, 1f))
    }

    private companion object {
        /** Eye height the authored poses assume, in metres above the floor. */
        const val DEFAULT_EYE_HEIGHT = 1.6f
        const val KEY_FREE = "free"
        const val KEY_VERSION = "layoutVersion"

        /** 35 cm: sitting down or standing up, not a neck bend. */
        const val POSTURE_HEIGHT_STEP_M = 0.35f

        /** Below this head height the listener is reclined (sofa or bed). */
        const val RECLINE_HEAD_Y_M = 1.05f

        /** While reclined, this much pitch change means rolling over. */
        const val RECLINE_PITCH_STEP_RAD = 0.50f

        /** The new posture must hold this long before the stage rotates. */
        const val POSTURE_HOLD_NS = 1_500_000_000L

        val KEYS = listOf("x", "y", "z", "qx", "qy", "qz", "qw")

        /**
         * 46: free poses are stored relative to the stage frame instead of in
         * world space, so poses from 45 would be reinterpreted.
         */
        const val LAYOUT_VERSION = 46
    }
}
