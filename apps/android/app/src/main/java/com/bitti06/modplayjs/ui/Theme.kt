package com.bitti06.modplayjs.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Player-style dark palette: near-black backdrop (AMOLED friendly), raised
 * cards, periwinkle accent and a mint secondary for the secondary actions.
 */
private val Dark =
    darkColorScheme(
        primary = Color(0xFF9BAAFF),
        onPrimary = Color(0xFF10142B),
        primaryContainer = Color(0xFF2B3268),
        onPrimaryContainer = Color(0xFFDCE1FF),
        secondary = Color(0xFF79D6BE),
        onSecondary = Color(0xFF04291F),
        secondaryContainer = Color(0xFF173F36),
        onSecondaryContainer = Color(0xFFAFEFDD),
        tertiary = Color(0xFFFFB59A),
        onTertiary = Color(0xFF3A1200),
        tertiaryContainer = Color(0xFF57230C),
        onTertiaryContainer = Color(0xFFFFDBCE),
        background = Color(0xFF07070C),
        onBackground = Color(0xFFEDEEF7),
        surface = Color(0xFF0C0C13),
        onSurface = Color(0xFFEDEEF7),
        surfaceVariant = Color(0xFF191926),
        onSurfaceVariant = Color(0xFFA8AABF),
        surfaceContainerLowest = Color(0xFF06060A),
        surfaceContainerLow = Color(0xFF101018),
        surfaceContainer = Color(0xFF14141E),
        surfaceContainerHigh = Color(0xFF1B1B27),
        surfaceContainerHighest = Color(0xFF22222F),
        outline = Color(0xFF3A3A4E),
        outlineVariant = Color(0xFF26263A),
        error = Color(0xFFFF8A8A),
        onError = Color(0xFF2A0000),
    )

private val Light =
    lightColorScheme(
        primary = Color(0xFF4A5BD0),
        onPrimary = Color(0xFFFFFFFF),
        primaryContainer = Color(0xFFDEE1FF),
        onPrimaryContainer = Color(0xFF00105C),
        secondary = Color(0xFF1F6F5C),
        onSecondary = Color(0xFFFFFFFF),
        secondaryContainer = Color(0xFFB8F1DF),
        onSecondaryContainer = Color(0xFF00211A),
        tertiary = Color(0xFF8A4B2A),
        onTertiary = Color(0xFFFFFFFF),
        background = Color(0xFFF7F7FC),
        onBackground = Color(0xFF14141C),
        surface = Color(0xFFFFFFFF),
        onSurface = Color(0xFF14141C),
        surfaceVariant = Color(0xFFEDEDF6),
        onSurfaceVariant = Color(0xFF55566B),
        surfaceContainerLowest = Color(0xFFFFFFFF),
        surfaceContainerLow = Color(0xFFF4F4FB),
        surfaceContainer = Color(0xFFEFEFF8),
        surfaceContainerHigh = Color(0xFFE9E9F4),
        surfaceContainerHighest = Color(0xFFE2E2EF),
        outline = Color(0xFF76778C),
        outlineVariant = Color(0xFFC9C9DB),
    )

/** Rounded, player-like geometry: cards and sheets are noticeably softer. */
private val AppShapes =
    Shapes(
        extraSmall = RoundedCornerShape(10.dp),
        small = RoundedCornerShape(14.dp),
        medium = RoundedCornerShape(20.dp),
        large = RoundedCornerShape(26.dp),
        extraLarge = RoundedCornerShape(34.dp),
    )

@Composable
fun ModplayTheme(
    dark: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    // Material 3 Expressive: expanded shape scale and the expressive motion
    // scheme, which is what the player-style cards and controls rely on.
    MaterialExpressiveTheme(
        colorScheme = if (dark) Dark else Light,
        shapes = AppShapes,
        content = content,
    )
}
