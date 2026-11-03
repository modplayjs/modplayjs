package com.bitti06.modplayjs.xr.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * The only background the XR panels get: a slow two-point gradient in the
 * app's violet/mint. No images, no 3D scenery — text carries the interface.
 */
@Composable
fun GradientBackdrop(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val transition = rememberInfiniteTransition(label = "backdrop")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 26000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "phase",
    )

    val start = Offset(0.15f + phase * 0.25f, 0.1f + phase * 0.2f)
    val end = Offset(0.9f - phase * 0.2f, 0.95f - phase * 0.25f)
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF0C0A18))
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        Color(0xFFB49BFF).copy(alpha = 0.22f),
                        Color(0xFF5FE3C0).copy(alpha = 0.10f),
                        Color(0x000C0A18),
                    ),
                    center = start,
                    radius = 900f,
                ),
            )
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        Color(0xFFFF9BC2).copy(alpha = 0.14f),
                        Color(0x000C0A18),
                    ),
                    center = end,
                    radius = 700f,
                ),
            ),
        content = content,
    )
}
