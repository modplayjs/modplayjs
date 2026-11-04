package com.bitti06.modplayjs.xr.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Spatial panel backdrop: translucent dark violet glass with 20.dp rounded corners
 * and a glowing border so panels never render as solid black boxes.
 */
@Composable
fun GradientBackdrop(
    modifier: Modifier = Modifier,
    shape: RoundedCornerShape = RoundedCornerShape(20.dp),
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

    val start = Offset((0.15f + phase * 0.25f), (0.1f + phase * 0.2f))
    val end = Offset((0.9f - phase * 0.2f), (0.95f - phase * 0.25f))
    val panelBg = Color(0xD916112A)
    val borderBrush = Brush.linearGradient(
        colors = listOf(
            Color(0x80B49BFF),
            Color(0x405FE3C0),
            Color(0x30FFFFFF),
        ),
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .clip(shape)
            .border(1.5.dp, borderBrush, shape)
            .background(panelBg)
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        Color(0xFFB49BFF).copy(alpha = 0.25f),
                        Color(0xFF5FE3C0).copy(alpha = 0.12f),
                        Color(0x0016112A),
                    ),
                    center = start,
                    radius = 900f,
                ),
            )
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        Color(0xFFFF9BC2).copy(alpha = 0.16f),
                        Color(0x0016112A),
                    ),
                    center = end,
                    radius = 700f,
                ),
            ),
        content = content,
    )
}
