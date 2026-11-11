// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
package com.bitti06.modplayjs.xr.layout

import com.bitti06.modplayjs.xr.panels.PanelId
import com.meta.spatial.core.Entity
import com.meta.spatial.core.SystemBase
import com.meta.spatial.isdk.IsdkGrabbable
import com.meta.spatial.isdk.IsdkPanelGrabHandle

/**
 * Makes free-mode panels grabbable through the Interaction SDK's own component.
 *
 * The toolkit `Grabbable` bridge builds a grabbable only for entities that also
 * carry a `Box`, `RoundedBox`, `Quad`, `Plane` or `Sphere`; a `Panel` has none
 * of those, so that component did nothing here and the panel could only be
 * grabbed by the SDK's edge handle.
 *
 * `IsdkPanelGrabHandle` alone does not move a panel in depth. The sample path
 * (`SpatialVideoSampleActivity`) adds `IsdkGrabbable()` next to it, whose
 * defaults are `movementType = Direct` and `responsiveness = 0.15` — Direct is
 * the movement that follows the hand or controller in all three axes, which is
 * the push and pull that was missing.
 *
 * Order matters, and it is what broke the earlier attempt: writing
 * `IsdkGrabbable` on an entity that the creation system had not yet given its
 * `IsdkPanelDimensions` / `IsdkPanelGrabHandle` ends in the native panel handle
 * coordinator reading `enabled` with the wrong type (process crash). This
 * system runs after `IsdkComponentCreationSystem`, waits for the handle, and
 * then writes the component once. Stationary mode flips `enabled` on the
 * existing instance instead of removing and re-creating it.
 */
class PanelGrabSystem(
    private val panels: () -> Map<PanelId, Entity>,
    private val free: () -> Boolean,
) : SystemBase() {

    override fun execute() {
        val wanted = free()
        for (entity in panels().values) {
            val grab = runCatching { entity.tryGetComponent<IsdkGrabbable>() }.getOrNull()
            if (grab == null) {
                // Dimensions and handle first: the creation system adds them on
                // the frame the panel appears, this system runs after it.
                if (wanted && entity.hasComponent<IsdkPanelGrabHandle>()) {
                    entity.setComponent(IsdkGrabbable())
                }
                continue
            }
            try {
                if (grab.enabled != wanted) {
                    grab.enabled = wanted
                    entity.setComponent(grab)
                }
            } finally {
                runCatching { grab.recycle() }
            }
        }
    }
}
