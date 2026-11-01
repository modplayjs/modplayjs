package com.bitti06.modplayjs.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Dark =
    darkColorScheme(
        primary = Color(0xFF8EA2FF),
        onPrimary = Color(0xFF101528),
        secondary = Color(0xFFB9C4FF),
        background = Color(0xFF0B0B12),
        surface = Color(0xFF12121C),
        surfaceVariant = Color(0xFF1B1B28),
        onBackground = Color(0xFFF0F0F7),
        onSurface = Color(0xFFF0F0F7),
    )

private val Light =
    lightColorScheme(
        primary = Color(0xFF4056C8),
        background = Color(0xFFF7F7FB),
        surface = Color(0xFFFFFFFF),
    )

@Composable
fun ModplayTheme(
    dark: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    // The app defaults to dark; Settings can force light later.
    MaterialTheme(colorScheme = if (dark) Dark else Light, content = content)
}
