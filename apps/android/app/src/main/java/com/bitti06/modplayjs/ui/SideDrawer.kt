package com.bitti06.modplayjs.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/** Which edge a [SideDrawer] is anchored to. */
enum class DrawerSide { Start, End }

/**
 * A panel anchored to one edge that slides over the screen instead of
 * being a navigation destination: the tab underneath keeps playing and stays
 * composed, and closing returns to exactly where the user was.
 *
 * [progress] is the travel fraction: 0 is fully open, 1 fully off screen. The
 * open and close animations run through it, and so does a drag, so dragging
 * right follows the finger and either snaps back or finishes the close.
 *
 * [onHidden] fires once the panel is off screen, which is when the caller may
 * drop the data it is showing; dropping it on dismiss would empty the panel
 * while it is still sliding out. [side] is the edge it is anchored to: `End`
 * slides in from the right, `Start` from the left, and the drag that closes it
 * always runs towards that edge.
 */
@Composable
fun SideDrawer(
    visible: Boolean,
    side: DrawerSide = DrawerSide.End,
    onDismiss: () -> Unit,
    onHidden: () -> Unit,
    content: @Composable () -> Unit,
) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        // Narrow enough on a phone to leave the player visible behind the
        // scrim, capped so it does not stretch across a tablet.
        val panelWidth = (maxWidth * 0.94f).coerceAtMost(440.dp)
        val widthPx = with(LocalDensity.current) { panelWidth.toPx() }
        val progress = remember { Animatable(1f) }
        val scope = rememberCoroutineScope()
        // +1 when the panel lives on the right, -1 when on the left: closing
        // always moves towards its own edge.
        val toward = if (side == DrawerSide.Start) -1f else 1f
        val anchor = if (side == DrawerSide.Start) Alignment.CenterStart else Alignment.CenterEnd
        val panelShape =
            if (side == DrawerSide.Start) {
                RoundedCornerShape(topEnd = 28.dp, bottomEnd = 28.dp)
            } else {
                RoundedCornerShape(topStart = 28.dp, bottomStart = 28.dp)
            }

        LaunchedEffect(visible, widthPx) {
            if (visible) {
                progress.animateTo(0f, tween(durationMillis = 260, easing = FastOutSlowInEasing))
            } else if (progress.value < 1f) {
                progress.animateTo(1f, tween(durationMillis = 220, easing = FastOutLinearInEasing))
                onHidden()
            }
        }

        // Only the state transition, not every animation frame: reading
        // progress.value in composition here would recompose the whole panel
        // (a full library browser) 60 times a second while it slides.
        val onScreen by remember(visible) { derivedStateOf { visible || progress.value < 1f } }
        if (onScreen) {
            Box(
                Modifier
                    .fillMaxSize()
                    // Alpha follows the animation in the layer, which does not
                    // recompose anything.
                    .graphicsLayer { alpha = 0.55f * (1f - progress.value) }
                    .background(Color.Black)
                    .pointerInput(visible) {
                        if (visible) detectTapGestures { onDismiss() }
                    },
            )
            Box(
                Modifier
                    .align(anchor)
                    .width(panelWidth)
                    .fillMaxHeight()
                    .graphicsLayer {
                        translationX = toward * progress.value * widthPx
                        shadowElevation = 24.dp.toPx()
                        this.shape = panelShape
                        clip = true
                    }
                    .background(MaterialTheme.colorScheme.background)
                    .pointerInput(visible) {
                        if (!visible) return@pointerInput
                        var dragged = 0f
                        detectHorizontalDragGestures(
                            onDragEnd = {
                                val past = dragged > widthPx * 0.25f
                                dragged = 0f
                                if (past) {
                                    onDismiss()
                                } else {
                                    scope.launch {
                                        progress.animateTo(0f, tween(durationMillis = 180))
                                    }
                                }
                            },
                            onDragCancel = {
                                dragged = 0f
                                scope.launch {
                                    progress.animateTo(0f, tween(durationMillis = 180))
                                }
                            },
                        ) { _, delta ->
                            dragged = (dragged + delta * toward).coerceAtLeast(0f)
                            scope.launch {
                                progress.snapTo((dragged / widthPx).coerceIn(0f, 1f))
                            }
                        }
                    },
            ) {
                content()
            }
        }
    }
}
