package com.bitti06.modplayjs.xr.input

import android.util.Log
import com.meta.spatial.core.Entity
import com.meta.spatial.core.SystemBase
import com.meta.spatial.runtime.ButtonBits
import com.meta.spatial.toolkit.Controller
import com.meta.spatial.toolkit.ControllerType
import com.meta.spatial.toolkit.PlayerBodyAttachmentSystem

/**
 * Controller-side input that the Interaction SDK leaves to the app: the visible
 * laser and the menu button.
 *
 * The entities come from the local player's avatar body, the same source the
 * SDK's LocomotionSystem reads; `Controller` sits on the body's left and right
 * hand and VRFeature keeps it current for both modalities.
 *
 * The laser: `IsdkDefaultCursorSystem` reads `Controller.laserEnabled` before it
 * draws a beam, and the component default is false, so controllers would only
 * get a hover dot. The flag is written back once per controller; the write is
 * guarded, because a failed write must cost the beam and nothing else.
 *
 * The menu button (VRC.Quest.Input.1): edge-detected, so holding it does not
 * toggle the panel at frame rate. Hands carry no menu button; with hands active
 * this reads false and the gear chip opens the same settings.
 */
class ControllerInputSystem(
    private val onMenu: () -> Unit,
) : SystemBase() {

    private var wasPressed = false

    /** One log line per process: device logs must show whether the write stuck. */
    private var laserReported = false

    override fun execute() {
        val body =
            runCatching {
                systemManager.tryFindSystem<PlayerBodyAttachmentSystem>()?.tryGetLocalPlayerAvatarBody()
            }.getOrNull()
        if (body == null) {
            wasPressed = false
            return
        }

        var pressed = false
        try {
            // Both hands are read, not short-circuited: each one needs its
            // laser enabled even when the other already holds the button.
            val left = read(body.leftHand)
            val right = read(body.rightHand)
            pressed = left || right
        } finally {
            runCatching { body.recycle() }
        }

        if (pressed && !wasPressed) {
            runCatching { onMenu() }.onFailure { Log.e(TAG, "menu action failed", it) }
        }
        wasPressed = pressed
    }

    /** Enables the laser on [entity] and reports whether menu is held. */
    private fun read(entity: Entity): Boolean {
        val controller =
            runCatching { entity.tryGetComponent<Controller>() }.getOrNull() ?: return false
        return try {
            if (controller.type != ControllerType.CONTROLLER) {
                false
            } else {
                enableLaser(entity, controller)
                controller.isPressed(ButtonBits.ButtonMenu)
            }
        } finally {
            runCatching { controller.recycle() }
        }
    }

    /**
     * Writes the flag back with the values just read, so nothing else in the
     * component changes. Failure is logged once and otherwise ignored: a missing
     * beam must never take the pointer down.
     */
    private fun enableLaser(entity: Entity, controller: Controller) {
        if (controller.laserEnabled) return
        runCatching {
            controller.laserEnabled = true
            entity.setComponent(controller)
            if (!laserReported) {
                laserReported = true
                Log.i(TAG, "laser enabled on ${controller.type}")
            }
        }.onFailure {
            if (!laserReported) {
                laserReported = true
                Log.w(TAG, "laser enable failed", it)
            }
        }
    }

    private companion object {
        const val TAG = "modplay-xr"
    }
}
