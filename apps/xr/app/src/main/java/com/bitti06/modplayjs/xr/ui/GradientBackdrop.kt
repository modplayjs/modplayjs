package com.bitti06.modplayjs.xr.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
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
    // Deliberately static. The first version drove both gradient centres from a
    // rememberInfiniteTransition, which recomposes this Box on every frame — on
    // the panel that is always visible, inside a compositor layer. The look is
    // the same without the animation and the panel costs nothing per frame.
    val start = Offset(0.28f, 0.22f)
    val end = Offset(0.78f, 0.82f)
    // #16112A at 85 % read as black against the night sky of the skybox. The
    // base is now a visible indigo and nearly opaque, so a panel is a surface
    // and not a hole.
    val panelBg = Color(0xF52B2452)
    val borderBrush = Brush.linearGradient(
        colors = listOf(
            Color(0xC0B49BFF),
            Color(0x705FE3C0),
            Color(0x55FFFFFF),
        ),
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .clip(shape)
            .border(2.dp, borderBrush, shape)
            .background(panelBg)
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        Color(0xFFB49BFF).copy(alpha = 0.36f),
                        Color(0xFF5FE3C0).copy(alpha = 0.18f),
                        Color(0x002B2452),
                    ),
                    center = start,
                    radius = 900f,
                ),
            )
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        Color(0xFFFF9BC2).copy(alpha = 0.22f),
                        Color(0x002B2452),
                    ),
                    center = end,
                    radius = 700f,
                ),
            ),
        content = content,
    )
}
