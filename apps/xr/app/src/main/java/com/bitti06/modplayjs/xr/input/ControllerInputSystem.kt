package com.bitti06.modplayjs.xr.input

import android.util.Log
import com.meta.spatial.core.Entity
import com.meta.spatial.core.SystemBase
import com.meta.spatial.runtime.ButtonBits
import com.meta.spatial.toolkit.Controller
import com.meta.spatial.toolkit.ControllerType
import com.meta.spatial.toolkit.PlayerBodyAttachmentSystem

/**
 * Controller-side input that the Interaction SDK does not do itself: the visible
 * laser and the menu button.
 *
 * The entities come from the local player's avatar body, the same source the
 * SDK's LocomotionSystem reads; `Controller` sits on the body's left and right
 * hand and VRFeature keeps it current for both modalities.
 *
 * The laser: `IsdkDefaultCursorSystem` only draws a beam for a controller whose
 * `laserEnabled` is set, and the component default is `false` (the toolkit's
 * seven-argument constructor defaults bit 32 to `iconst_0`). Without this,
 * controllers get a hover dot and no line to aim with. The flag is written once
 * per controller and re-written only if the runtime has reset it.
 *
 * The menu button (VRC.Quest.Input.1): edge-detected, so holding it does not
 * toggle the panel at frame rate. Hands carry no menu button; with hands active
 * this reads false and the gear chip on every panel opens the same settings.
 */
class ControllerInputSystem(
    private val onMenu: () -> Unit,
) : SystemBase() {

    private var wasPressed = false

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
                if (!controller.laserEnabled) {
                    controller.laserEnabled = true
                    entity.setComponent(controller)
                }
                controller.isPressed(ButtonBits.ButtonMenu)
            }
        } finally {
            runCatching { controller.recycle() }
        }
    }

    private companion object {
        const val TAG = "modplay-xr"
    }
}
