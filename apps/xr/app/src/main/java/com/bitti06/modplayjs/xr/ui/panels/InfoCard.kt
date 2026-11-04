package com.bitti06.modplayjs.xr.ui.panels

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * A scrollable block of module text.
 *
 * Collapsed, three of these sit side by side in the details panel, each its own
 * tinted card. Expanded, one fills the panel and the panel stops painting a
 * background at all: the room shows through and the text carries its own
 * contrast with a shadow instead of a plate. A scrollbar is drawn either way,
 * because Compose has no scrollbar component and a list of samples is useless
 * without knowing how far down it goes.
 */
@Composable
fun InfoCard(
    title: String,
    accent: Color,
    lines: List<String>,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scroll = rememberScrollState()
    val empty = lines.isEmpty()

    val bodyStyle =
        if (expanded) {
            TextStyle(
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                lineHeight = 15.sp,
                // A blurred shadow, not a scrim: readable over an arbitrary
                // room without hiding it.
                shadow = Shadow(color = Color.Black, offset = Offset(0f, 0f), blurRadius = 10f),
            )
        } else {
            TextStyle(fontFamily = FontFamily.Monospace, fontSize = 7.5.sp, lineHeight = 10.sp)
        }

    Column(
        modifier =
            modifier.then(
                if (expanded) {
                    // Nothing painted: the panel itself is transparent, so the
                    // 3D scene behind the panel is what the text sits on.
                    Modifier.fillMaxSize()
                } else {
                    Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(lerp(MaterialTheme.colorScheme.surfaceContainer, accent, 0.18f))
                },
            ),
    ) {
        // The header stays put, so the toggle is reachable even when the
        // content is scrolled far down.
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .clickable(enabled = !empty, onClick = onToggle)
                    .padding(horizontal = 8.dp, vertical = if (expanded) 6.dp else 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                title.uppercase(),
                fontSize = if (expanded) 11.sp else 8.sp,
                fontWeight = FontWeight.SemiBold,
                color = accent,
                modifier = Modifier.weight(1f),
            )
            if (!empty) {
                Text(
                    if (expanded) "✕" else lines.size.toString(),
                    fontSize = if (expanded) 11.sp else 8.sp,
                    fontFamily = FontFamily.Monospace,
                    color = accent,
                )
            }
        }

        if (empty) {
            Text(
                "—",
                fontSize = 8.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            )
            return@Column
        }

        Row(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier =
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .padding(start = 8.dp, end = 4.dp, bottom = 6.dp)
                        .verticalScroll(scroll),
            ) {
                lines.forEach { line ->
                    Text(
                        line,
                        style = bodyStyle,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                }
            }
            Scrollbar(
                state = scroll,
                color = accent,
                wide = expanded,
            )
        }
    }
}

/**
 * A thumb whose length is the visible fraction and whose position is
 * `value / maxValue`. Both come from [ScrollState] itself, so no measurement
 * or layout listener is needed.
 */
@Composable
fun Scrollbar(
    state: ScrollState,
    color: Color,
    wide: Boolean,
) {
    val max = state.maxValue
    val viewport = state.viewportSize
    if (max <= 0 || viewport <= 0) return

    val thumb = (viewport.toFloat() / (viewport + max)).coerceIn(0.08f, 1f)
    val progress = state.value.toFloat() / max
    val before = progress * (1f - thumb)
    val after = (1f - thumb - before).coerceAtLeast(0f)

    Column(
        modifier =
            Modifier
                .width(if (wide) 5.dp else 3.dp)
                .fillMaxHeight()
                .padding(vertical = 3.dp),
    ) {
        Spacer(Modifier.weight(before.coerceAtLeast(MIN_WEIGHT)))
        Box(
            Modifier
                .fillMaxWidth()
                .weight(thumb.coerceAtLeast(MIN_WEIGHT))
                .clip(RoundedCornerShape(50))
                .background(color.copy(alpha = if (wide) 0.9f else 0.5f)),
        )
        Spacer(Modifier.weight(after.coerceAtLeast(MIN_WEIGHT)))
    }
}

/** Column weights must be positive; this is the floor for the tiny gaps. */
private const val MIN_WEIGHT = 0.0001f
