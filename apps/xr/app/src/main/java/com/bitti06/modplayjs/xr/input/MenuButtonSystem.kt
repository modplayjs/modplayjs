package com.bitti06.modplayjs.xr.input

import android.util.Log
import com.meta.spatial.core.SystemBase
import com.meta.spatial.runtime.ButtonBits
import com.meta.spatial.toolkit.Controller
import com.meta.spatial.toolkit.ControllerType
import com.meta.spatial.toolkit.PlayerBodyAttachmentSystem

/**
 * VRC.Quest.Input.1: the controller's menu button opens the in-app menu.
 *
 * The entities are taken from the local player's avatar body, the same source the
 * SDK's own LocomotionSystem reads: `Controller` lives on the body's left and
 * right hand, and VRFeature keeps it current for both modalities. Only
 * controllers carry a menu button, so the read is guarded by
 * `type == CONTROLLER`; with hands active nothing fires and the gear chip on
 * every panel opens the same settings.
 *
 * Two component reads per frame, plus the body lookup. If the body or the body
 * system is not there yet, the frame is skipped instead of throwing.
 */
class MenuButtonSystem(
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
            pressed = isMenuDown(body.leftHand) || isMenuDown(body.rightHand)
        } finally {
            runCatching { body.recycle() }
        }

        // Edge, not level: holding the button must not toggle the panel at
        // frame rate.
        if (pressed && !wasPressed) {
            runCatching { onMenu() }.onFailure { Log.e(TAG, "menu action failed", it) }
        }
        wasPressed = pressed
    }

    private fun isMenuDown(entity: com.meta.spatial.core.Entity): Boolean {
        val controller =
            runCatching { entity.tryGetComponent<Controller>() }.getOrNull() ?: return false
        return try {
            controller.type == ControllerType.CONTROLLER &&
                controller.isPressed(ButtonBits.ButtonMenu)
        } finally {
            runCatching { controller.recycle() }
        }
    }

    private companion object {
        const val TAG = "modplay-xr"
    }
}
