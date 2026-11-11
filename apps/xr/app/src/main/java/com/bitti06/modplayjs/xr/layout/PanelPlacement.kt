package com.bitti06.modplayjs.xr.layout

import android.content.Context
import com.bitti06.modplayjs.xr.panels.PANELS
import com.bitti06.modplayjs.xr.panels.PanelId
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Vector3
import com.meta.spatial.isdk.IsdkGrabState
import com.meta.spatial.isdk.IsdkGrabbable
import com.meta.spatial.toolkit.Transform
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Where the panels stand: the arc in a head-captured stage frame, or a free
 * arrangement the user owns.
 *
 * The stage itself is [StageAnchor]; this class owns the stored arrangement,
 * the free/stationary switch and the grab component. Free poses are stored
 * relative to the stage, so a mode switch or recenter rebases the arrangement
 * as one rigid body.
 */
class PanelPlacement(
    context: Context,
    private val animator: PanelAnimator? = null,
) {

    private val prefs = context.getSharedPreferences("xr.layout", Context.MODE_PRIVATE)
    private val specs = PANELS.associateBy { it.id }
    private val anchor = StageAnchor()

    private val _free: MutableStateFlow<Boolean>

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

    fun capture(head: Pose?) = anchor.capture(head)

    fun setAnchor(head: Pose?) = anchor.capture(head)

    /** Returns true when the stage was recaptured and panels must be re-applied. */
    fun onHead(head: Pose, nowNs: Long): Boolean = anchor.onHead(head, nowNs)

    /** Authored arc pose for a panel in the current stage frame. */
    fun poseFor(id: PanelId): Pose {
        val spec = specs[id] ?: return Pose()
        if (free) stored(id)?.let { return it }
        return anchor.place(spec.pose)
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
        anchor.recapture()
        _free.value = on
        prefs.edit().putBoolean(KEY_FREE, on).apply()
        for ((id, entity) in entities) {
            if (id in skip || isGrabbed(entity)) continue
            move(entity, poseFor(id), animate = true)
        }
    }

    /** Deliberate wipe: back to the arc and forget the arrangement. */
    fun reset(entities: Map<PanelId, Entity>) {
        clearStored()
        anchor.recapture()
        for ((id, entity) in entities) {
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
        anchor.recapture()
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

    /**
     * Whether the input system owns this panel right now.
     *
     * Free mode makes the panel grabbable through `IsdkGrabbable` (see
     * [PanelGrabSystem]); while it is grabbed the SDK moves it and the layout
     * must not.
     */
    fun isGrabbed(entity: Entity): Boolean {
        val isdk = runCatching { entity.tryGetComponent<IsdkGrabbable>() }.getOrNull() ?: return false
        return try {
            isdk.grabState == IsdkGrabState.Grabbed
        } finally {
            runCatching { isdk.recycle() }
        }
    }

    // ------------------------------------------------------------ internals

    private fun store(id: PanelId, world: Pose) {
        val local = anchor.localOf(world) ?: return
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
        return anchor.worldOf(local)
    }

    private fun move(entity: Entity, pose: Pose, animate: Boolean) {
        if (animate && animator != null) {
            animator.moveTo(entity, pose)
        } else {
            animator?.cancel(entity)
            entity.setComponent(Transform(pose))
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

    private companion object {
        const val KEY_FREE = "free"
        const val KEY_VERSION = "layoutVersion"

        val KEYS = listOf("x", "y", "z", "qx", "qy", "qz", "qw")

        /**
         * 46: free poses are stored relative to the stage frame instead of in
         * world space, so poses from 45 would be reinterpreted.
         */
        const val LAYOUT_VERSION = 46
    }
}
