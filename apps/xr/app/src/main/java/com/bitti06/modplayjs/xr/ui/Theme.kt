package com.bitti06.modplayjs.xr.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import com.bitti06.modplayjs.xr.ui.panel.PanelTokens

/**
 * Material roles for the few Material components the panels use (the volume
 * slider), filled from the same palette as everything else.
 *
 * This is not a second design system: every colour below is a [PanelTokens]
 * value, so a panel that uses `MaterialTheme.colorScheme` and one that uses
 * tokens cannot drift apart.
 */
private val Dark =
    darkColorScheme(
        primary = PanelTokens.Accent,
        onPrimary = PanelTokens.OnAccent,
        primaryContainer = PanelTokens.Highlight,
        onPrimaryContainer = PanelTokens.Text,
        secondary = PanelTokens.AccentAlt,
        onSecondary = PanelTokens.OnAccent,
        secondaryContainer = PanelTokens.Highlight,
        onSecondaryContainer = PanelTokens.Text,
        tertiary = PanelTokens.AccentWarm,
        onTertiary = PanelTokens.OnAccent,
        background = PanelTokens.SurfaceSunken,
        onBackground = PanelTokens.Text,
        surface = PanelTokens.Surface,
        onSurface = PanelTokens.Text,
        surfaceVariant = PanelTokens.SurfaceRaised,
        onSurfaceVariant = PanelTokens.TextDim,
        surfaceContainerLowest = PanelTokens.SurfaceSunken,
        surfaceContainerLow = PanelTokens.Surface,
        surfaceContainer = PanelTokens.SurfaceRaised,
        surfaceContainerHigh = PanelTokens.SurfaceRaised,
        surfaceContainerHighest = PanelTokens.SurfaceRaised,
        outline = PanelTokens.Outline,
        outlineVariant = PanelTokens.Outline,
        error = PanelTokens.Error,
    )

/** The app runs the dark scheme only: a light panel in a dark room is glare. */
@Composable
fun XrTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Dark, content = content)
}
