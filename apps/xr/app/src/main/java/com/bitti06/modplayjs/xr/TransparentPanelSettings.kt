package com.bitti06.modplayjs.xr

import com.meta.spatial.runtime.AlphaMode
import com.meta.spatial.runtime.LayerConfig
import com.meta.spatial.runtime.LayerFilters
import com.meta.spatial.runtime.PanelConfigOptions
import com.meta.spatial.runtime.PanelShapeLayerBlendType
import com.meta.spatial.runtime.SceneMaterial
import com.meta.spatial.toolkit.PanelSettings
import com.meta.spatial.toolkit.UIPanelSettings

/**
 * A [UIPanelSettings] configured for a hole-punched, see-through panel.
 *
 * Meta's layer page lists hole punching as a recipe of five settings, not one:
 *
 * ```
 * PanelConfigOptions().apply {
 *     layerConfig = LayerConfig(filters = LayerFilters.HIGHEST_QUALITY, zIndex = -1)
 *     layerBlendType = PanelShapeLayerBlendType.ALPHA_BLEND
 *     enableLayerFeatheredEdge = true
 *     alphaMode = AlphaMode.HOLE_PUNCH
 *     panelShader = SceneMaterial.HOLE_PUNCH_PANEL_SHADER
 * }
 * ```
 *
 * `enableTransparent` on its own only lets the panel's alpha blend, and
 * ALPHA_BLEND does not write depth (see the blend-modes page). That is not the
 * same as hole punching: the layer keeps its surface, so an expanded details
 * panel can still read as a dark plate instead of clear room. The settings below
 * punch the transparent pixels out of the compositor layer.
 *
 * Wrapping instead of duplicating the settings keeps width, height, display
 * scaling and the render mode identical to every other panel.
 */
class TransparentPanelSettings(
    private val base: UIPanelSettings,
) : PanelSettings {
    override fun toPanelConfigOptions(): PanelConfigOptions =
        base.toPanelConfigOptions().apply {
            enableTransparent = true

            // Every panel in the activity is already PanelRenderMode.Layer with
            // ALPHA_BLEND and feathering; repeating them here is what the
            // documented recipe does and keeps this panel independent of that.
            layerConfig = LayerConfig(
                filters = LayerFilters.HIGHEST_QUALITY,
                zIndex = -1,
            )
            layerBlendType = PanelShapeLayerBlendType.ALPHA_BLEND
            enableLayerFeatheredEdge = true
            alphaMode = AlphaMode.HOLE_PUNCH
            panelShader = SceneMaterial.HOLE_PUNCH_PANEL_SHADER
        }
}
