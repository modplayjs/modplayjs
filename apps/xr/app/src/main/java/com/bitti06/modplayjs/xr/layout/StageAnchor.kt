package com.bitti06.modplayjs.xr.layout

import com.bitti06.modplayjs.xr.scene.HeadFrames
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Vector3
import kotlin.math.abs

/**
 * The frame the panel arc and the free arrangement live in.
 *
 * Captured on an event only: first placement, a mode switch, a recenter, a
 * reset, or a sustained body-posture change. Walking and turning never recapture
 * it, which is what keeps the layout from flipping around.
 *
 * Free poses are stored relative to this frame, so a recapture rebases the
 * whole arrangement as one rigid body: the shape is kept and no panel can end
 * up facing the wrong way.
 */
class StageAnchor {

    /** Current stage pose, or null before the first head sample. */
    var stage: Pose? = null
        private set

    /** Last head pose seen, used when a mode switch has to recapture. */
    var lastHead: Pose? = null
        private set

    private var stagePitch = 0f
    private var stageY = 0f

    /** When the current posture was first noticed, 0 when it matches. */
    private var postureSinceNs = 0L

    /**
     * Capture a new frame. `null` keeps the authored poses, which assume an
     * eye at [DEFAULT_EYE_HEIGHT] on the world origin facing +Z.
     */
    fun capture(head: Pose?) {
        lastHead = head ?: lastHead
        if (head == null) {
            stage = null
            stagePitch = 0f
            return
        }
        val pitch = HeadFrames.pitchOf(head.q)
        stage =
            Pose(
                Vector3(head.t.x, head.t.y, head.t.z),
                Quaternion(
                    Math.toDegrees(pitch.toDouble()).toFloat(),
                    Math.toDegrees(HeadFrames.yawOf(head.q).toDouble()).toFloat(),
                    0f,
                ),
            )
        stagePitch = pitch
        stageY = head.t.y
        postureSinceNs = 0L
    }

    /** Recapture from the last head pose (mode switches, reset, recenter). */
    fun recapture() = capture(lastHead)

    /**
     * Called once per head sample. Returns true when the stage was recaptured
     * and the caller has to re-apply every live panel.
     *
     * A posture change is a change of body pose, not of gaze. Standing up,
     * sitting down, or rolling over in bed moves the head height by tens of
     * centimetres; looking at a panel moves it by a neck bend. The pitch test
     * is only used while already low, which is the rolling-over case. It must
     * hold for [POSTURE_HOLD_NS] before the stage rotates.
     */
    fun onHead(head: Pose, nowNs: Long): Boolean {
        lastHead = head
        if (stage == null) return false
        val pitch = HeadFrames.pitchOf(head.q)
        val heightChanged = abs(head.t.y - stageY) > POSTURE_HEIGHT_STEP_M
        val rolledOver =
            head.t.y < RECLINE_HEAD_Y_M &&
                abs(pitch - stagePitch) > RECLINE_PITCH_STEP_RAD
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

    /** Authored arc pose in the current stage frame. */
    fun place(authored: Pose): Pose {
        val s = stage ?: return authored
        return s * Pose(authored.t - Vector3(0f, DEFAULT_EYE_HEIGHT, 0f), authored.q)
    }

    /** Stage-local pose to world. */
    fun worldOf(local: Pose): Pose = stage?.times(local) ?: local

    /** World pose to stage-local, or null before the first capture. */
    fun localOf(world: Pose): Pose? = stage?.inverse()?.times(world)

    private companion object {
        /** Eye height the authored poses assume, in metres above the floor. */
        const val DEFAULT_EYE_HEIGHT = 1.6f

        /** 35 cm: sitting down or standing up, not a neck bend. */
        const val POSTURE_HEIGHT_STEP_M = 0.35f

        /** Below this head height the listener is reclined (sofa or bed). */
        const val RECLINE_HEAD_Y_M = 1.05f

        /** While reclined, this much pitch change means rolling over. */
        const val RECLINE_PITCH_STEP_RAD = 0.50f

        /** The new posture must hold this long before the stage rotates. */
        const val POSTURE_HOLD_NS = 1_500_000_000L
    }
}
