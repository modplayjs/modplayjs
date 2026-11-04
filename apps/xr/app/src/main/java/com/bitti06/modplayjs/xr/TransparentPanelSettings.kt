package com.bitti06.modplayjs.xr

import com.meta.spatial.runtime.PanelConfigOptions
import com.meta.spatial.toolkit.PanelSettings
import com.meta.spatial.toolkit.UIPanelSettings

/**
 * A [UIPanelSettings] with transparency turned on.
 *
 * `PanelSettings` is just a converter to [PanelConfigOptions], and
 * `PanelConfigOptions.enableTransparent` is the documented switch: the Meta
 * reference for `PanelShapeConfig` says it is needed "for layer panels to have
 * working transparency" and that it hole-punches transparent pixels through the
 * SceneTexture. Without it a transparent Compose pixel renders as opaque black.
 *
 * Wrapping instead of duplicating the settings keeps width, height, display
 * scaling and the render mode identical to every other panel.
 */
class TransparentPanelSettings(
    private val base: UIPanelSettings,
) : PanelSettings {
    override fun toPanelConfigOptions(): PanelConfigOptions =
        base.toPanelConfigOptions().apply { enableTransparent = true }
}
