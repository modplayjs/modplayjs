package com.bitti06.modplayjs.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.WindowInsetsController
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp

/**
 * Player palette: deep indigo backdrop instead of pure black, violet primary,
 * mint secondary and pink tertiary, with matching raised surface containers.
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
        tertiaryContainer = Color(0xFF6B2A47),
        onTertiaryContainer = Color(0xFFFFD9E7),
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
        onError = Color(0xFF3A0011),
    )

private val Light =
    lightColorScheme(
        primary = Color(0xFF6C4BD6),
        onPrimary = Color(0xFFFFFFFF),
        primaryContainer = Color(0xFFE9DEFF),
        onPrimaryContainer = Color(0xFF21005D),
        secondary = Color(0xFF00806B),
        onSecondary = Color(0xFFFFFFFF),
        secondaryContainer = Color(0xFFBFF6E5),
        onSecondaryContainer = Color(0xFF00201A),
        tertiary = Color(0xFFB3366B),
        onTertiary = Color(0xFFFFFFFF),
        background = Color(0xFFFBF7FF),
        onBackground = Color(0xFF171228),
        surface = Color(0xFFFFFFFF),
        onSurface = Color(0xFF171228),
        surfaceVariant = Color(0xFFEDE6FA),
        onSurfaceVariant = Color(0xFF574E74),
        surfaceContainerLowest = Color(0xFFFFFFFF),
        surfaceContainerLow = Color(0xFFF7F2FF),
        surfaceContainer = Color(0xFFF1EAFE),
        surfaceContainerHigh = Color(0xFFEAE2FC),
        surfaceContainerHighest = Color(0xFFE2D9F7),
        outline = Color(0xFF7B7299),
        outlineVariant = Color(0xFFCFC5E8),
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
private fun SyncSystemBars(dark: Boolean) {
    val view = LocalView.current
    val context = LocalContext.current
    if (view.isInEditMode) return
    SideEffect {
        val window = context.findActivity()?.window ?: return@SideEffect
        val controller = window.insetsController ?: return@SideEffect
        val lightBars =
            WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        controller.setSystemBarsAppearance(if (dark) 0 else lightBars, lightBars)
    }
}

internal tailrec fun Context.findActivity(): Activity? =
    when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }

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
    ) {
        // The theme is chosen in-app and can differ from the system's, so the
        // status and navigation bar icons follow the picked theme rather than
        // enableEdgeToEdge's system-based default.
        SyncSystemBars(dark)
        // Nothing at the root provides LocalContentColor, so unstyled Text
        // would fall back to black. Anchor it to the scheme.
        CompositionLocalProvider(
            LocalContentColor provides MaterialTheme.colorScheme.onBackground,
            content = content,
        )
    }
}
