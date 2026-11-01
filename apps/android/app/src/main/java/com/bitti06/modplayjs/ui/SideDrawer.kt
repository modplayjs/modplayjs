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

/**
 * A panel anchored to the trailing edge that slides over the screen instead of
 * being a navigation destination: the tab underneath keeps playing and stays
 * composed, and closing returns to exactly where the user was.
 *
 * [progress] is the travel fraction: 0 is fully open, 1 fully off screen. The
 * open and close animations run through it, and so does a drag, so dragging
 * right follows the finger and either snaps back or finishes the close.
 *
 * [onHidden] fires once the panel is off screen, which is when the caller may
 * drop the data it is showing; dropping it on dismiss would empty the panel
 * while it is still sliding out.
 */
@Composable
fun SideDrawer(
    visible: Boolean,
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

        LaunchedEffect(visible, widthPx) {
            if (visible) {
                progress.animateTo(0f, tween(durationMillis = 260, easing = FastOutSlowInEasing))
            } else if (progress.value < 1f) {
                progress.animateTo(1f, tween(durationMillis = 220, easing = FastOutLinearInEasing))
                onHidden()
            }
        }

        // Stays in the tree while it slides out, so the exit is not a blank box.
        if (visible || progress.value < 1f) {
            val open = 1f - progress.value
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.55f * open))
                    .pointerInput(visible) {
                        if (visible) detectTapGestures { onDismiss() }
                    },
            )
            Box(
                Modifier
                    .align(Alignment.CenterEnd)
                    .width(panelWidth)
                    .fillMaxHeight()
                    .graphicsLayer {
                        translationX = progress.value * widthPx
                        shadowElevation = 24.dp.toPx()
                        shape = RoundedCornerShape(topStart = 28.dp, bottomStart = 28.dp)
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
                            dragged = (dragged + delta).coerceAtLeast(0f)
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
