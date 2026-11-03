package com.bitti06.modplayjs.xr.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Same palette as the phone app (ui/Theme.kt): deep indigo backdrop, violet
 * primary, mint secondary, pink tertiary. The XR panels use the dark scheme
 * only; a light panel in a dark room costs contrast and battery.
 */
private val Dark =
    darkColorScheme(
        primary = Color(0xFFB49BFF),
        onPrimary = Color(0xFF1B0F3A),
        primaryContainer = Color(0xFF3B2C6E),
        onPrimaryContainer = Color(0xFFE7DEFF),
        secondary = Color(0xFF5FE3C0),
        onSecondary = Color(0xFF00382C),
        secondaryContainer = Color(0xFF17513F),
        onSecondaryContainer = Color(0xFFB8F5E2),
        tertiary = Color(0xFFFF9BC2),
        onTertiary = Color(0xFF3D0A22),
        background = Color(0xFF0C0A18),
        onBackground = Color(0xFFF1EDFB),
        surface = Color(0xFF130F22),
        onSurface = Color(0xFFF1EDFB),
        surfaceVariant = Color(0xFF241E3A),
        onSurfaceVariant = Color(0xFFB9B0D4),
        surfaceContainerLowest = Color(0xFF090713),
        surfaceContainerLow = Color(0xFF171228),
        surfaceContainer = Color(0xFF1D1733),
        surfaceContainerHigh = Color(0xFF251D40),
        surfaceContainerHighest = Color(0xFF2E2450),
        outline = Color(0xFF4A3F70),
        outlineVariant = Color(0xFF2F2750),
        error = Color(0xFFFF8FA8),
    )

@Composable
fun XrTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Dark, content = content)
}
