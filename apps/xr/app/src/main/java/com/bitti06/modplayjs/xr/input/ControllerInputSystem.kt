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
 * The `Controller` component is read, never written. It is owned by the input
 * pipeline: `buttonState`, `changedButtons` and `isActive` drive the pointer,
 * the grab state machine and the avatar visuals, so writing a copy back can
 * reset them. That is why the laser flag is left alone here; a beam is worth
 * less than a pointer that keeps working.
 *
 * The menu button (VRC.Quest.Input.1): edge-detected, so holding it does not
 * toggle the panel at frame rate. Hands carry no menu button; with hands active
 * this reads false and the gear chip opens the same settings.
 */
class ControllerInputSystem(
    private val onMenu: () -> Unit,
) : SystemBase() {

    private var wasPressed = false

    /** One log line per process. */
    private var reported = false

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
                report(controller)
                controller.isPressed(ButtonBits.ButtonMenu)
            }
        } finally {
            runCatching { controller.recycle() }
        }
    }

    /** One read-only line, so the log shows which controller the SDK reports. */
    private fun report(controller: Controller) {
        if (reported) return
        reported = true
        Log.i(
            TAG,
            "controller: type=${controller.type} laser=${controller.laserEnabled} active=${controller.isActive}",
        )
    }

    private companion object {
        const val TAG = "modplay-xr"
    }
}
