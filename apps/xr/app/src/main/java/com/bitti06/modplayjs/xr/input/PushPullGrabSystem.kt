package com.bitti06.modplayjs.xr.input

import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.SystemBase
import com.meta.spatial.core.Vector3
import com.meta.spatial.runtime.ButtonBits
import com.meta.spatial.toolkit.Controller
import com.meta.spatial.toolkit.Grabbable
import com.meta.spatial.toolkit.PlayerBodyAttachmentSystem
import com.meta.spatial.toolkit.Transform

class PushPullGrabSystem(
    private val getTargets: () -> List<Entity>,
    private val getHeadPose: () -> Pose?,
    private val speedMetersPerSec: Float = 1.2f,
    private val rotationSpeedDegPerSec: Float = 60f,
    private val minDistance: Float = 0.35f,
    private val maxDistance: Float = 4.5f,
) : SystemBase() {

    private var lastTimeNs = System.nanoTime()

    // Caches initial grab distance and accumulated offset per entity to prevent feedback loops
    private val initialGrabDistances = mutableMapOf<Entity, Float>()
    private val accumulatedOffsets = mutableMapOf<Entity, Float>()

    override fun execute() {
        val now = System.nanoTime()
        val deltaTime = ((now - lastTimeNs) / 1_000_000_000.0f).coerceIn(0.001f, 0.1f)
        lastTimeNs = now

        val body = runCatching {
            systemManager.tryFindSystem<PlayerBodyAttachmentSystem>()?.tryGetLocalPlayerAvatarBody()
        }.getOrNull() ?: return

        var leftController: Controller? = null
        var rightController: Controller? = null

        val pushUp: Boolean
        val pullDown: Boolean
        val pivotLeft: Boolean
        val pivotRight: Boolean

        try {
            leftController = runCatching { body.leftHand.tryGetComponent<Controller>() }.getOrNull()
            rightController = runCatching { body.rightHand.tryGetComponent<Controller>() }.getOrNull()

            val leftUp = leftController?.isDown(ButtonBits.ButtonThumbLU) == true
            val rightUp = rightController?.isDown(ButtonBits.ButtonThumbRU) == true
            val leftDown = leftController?.isDown(ButtonBits.ButtonThumbLD) == true
            val rightDown = rightController?.isDown(ButtonBits.ButtonThumbRD) == true

            val leftLeft = leftController?.isDown(ButtonBits.ButtonThumbLL) == true
            val rightLeft = rightController?.isDown(ButtonBits.ButtonThumbRL) == true
            val leftRight = leftController?.isDown(ButtonBits.ButtonThumbLR) == true
            val rightRight = rightController?.isDown(ButtonBits.ButtonThumbRR) == true

            pushUp = leftUp || rightUp
            pullDown = leftDown || rightDown
            pivotLeft = leftLeft || rightLeft
            pivotRight = leftRight || rightRight
        } finally {
            leftController?.let { runCatching { it.recycle() } }
            rightController?.let { runCatching { it.recycle() } }
            runCatching { body.recycle() }
        }

        val targets = getTargets()
        val head = getHeadPose() ?: return

        for (entity in targets) {
            val grabbable = runCatching { entity.tryGetComponent<Grabbable>() }.getOrNull()
            val isGrabbed = grabbable?.isGrabbed == true
            grabbable?.let { runCatching { it.recycle() } }

            if (isGrabbed) {
                val transformComp = runCatching { entity.tryGetComponent<Transform>() }.getOrNull() ?: continue
                try {
                    val pose = transformComp.transform

                    val dx = pose.t.x - head.t.x
                    val dy = pose.t.y - head.t.y
                    val dz = pose.t.z - head.t.z
                    val currentDist = kotlin.math.sqrt((dx * dx) + (dy * dy) + (dz * dz))

                    var newPos = pose.t
                    if (currentDist > 0.05f) {
                        if (!initialGrabDistances.containsKey(entity)) {
                            initialGrabDistances[entity] = currentDist
                            accumulatedOffsets[entity] = 0f
                        }

                        if (pushUp) {
                            accumulatedOffsets[entity] = (accumulatedOffsets[entity] ?: 0f) + (speedMetersPerSec * deltaTime)
                        } else if (pullDown) {
                            accumulatedOffsets[entity] = (accumulatedOffsets[entity] ?: 0f) - (speedMetersPerSec * deltaTime)
                        }

                        val baseDist = initialGrabDistances[entity] ?: currentDist
                        val offset = accumulatedOffsets[entity] ?: 0f
                        val targetDist = (baseDist + offset).coerceIn(minDistance, maxDistance)

                        val factor = targetDist / currentDist
                        newPos = Vector3(
                            head.t.x + (dx * factor),
                            head.t.y + (dy * factor),
                            head.t.z + (dz * factor),
                        )
                    }

                    var newQ = pose.q
                    if (pivotLeft || pivotRight) {
                        val yawDelta = (if (pivotRight) -rotationSpeedDegPerSec else rotationSpeedDegPerSec) * deltaTime
                        val euler = pose.q.toEuler()
                        newQ = Quaternion(euler.x, euler.y + yawDelta, euler.z)
                    }

                    transformComp.transform = Pose(newPos, newQ)
                    entity.setComponent(transformComp)
                } finally {
                    runCatching { transformComp.recycle() }
                }
            } else {
                initialGrabDistances.remove(entity)
                accumulatedOffsets.remove(entity)
            }
        }
    }
}
