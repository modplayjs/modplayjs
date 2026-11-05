package com.bitti06.modplayjs.xr.ui.panel

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.ScrollIndicatorState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.state.XrStore

/**
 * The one panel surface: an opaque plate, a header with the panel title and the
 * way home, then whatever the panel draws.
 *
 */
@Composable
fun PanelScaffold(
    title: String,
    subtitle: String? = null,
    headerActions: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PanelTokens.Surface),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(PanelTokens.SurfaceRaised)
                .padding(horizontal = PanelTokens.GapLg, vertical = PanelTokens.Gap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    title,
                    fontSize = PanelTokens.Title,
                    fontWeight = FontWeight.Bold,
                    color = PanelTokens.Text,
                )
                if (subtitle != null) {
                    Text(
                        subtitle,
                        fontSize = PanelTokens.Meta,
                        color = PanelTokens.TextDim,
                        maxLines = 1,
                    )
                }
            }
            headerActions?.invoke()
            HomeButton()
        }
        Column(
            modifier = Modifier.fillMaxSize().padding(horizontal = PanelTokens.GapLg, vertical = PanelTokens.GapSm),
            verticalArrangement = Arrangement.spacedBy(PanelTokens.GapSm),
            content = content,
        )
    }
}

/** The way back to the library, in the same corner of every panel. */
@Composable
fun HomeButton() {
    Text(
        "⌂",
        fontSize = PanelTokens.ChipText,
        color = PanelTokens.Text,
        modifier = Modifier
            .padding(start = PanelTokens.GapSm)
            .clip(RoundedCornerShape(50))
            .background(PanelTokens.SurfaceSunken)
            .clickable { XrStore.goHome() }
            .padding(horizontal = PanelTokens.GapSm, vertical = PanelTokens.GapXs),
    )
}

/** Opens the settings panel; there is exactly one of these per panel. */
@Composable
fun SettingsButton() {
    Text(
        "⚙",
        fontSize = PanelTokens.ChipText,
        color = PanelTokens.OnAccent,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(PanelTokens.Accent)
            .clickable { XrStore.toggleSettings() }
            .padding(horizontal = PanelTokens.Gap, vertical = PanelTokens.GapXs),
    )
}

/** A tinted block with a heading, used for the settings sections. */
@Composable
fun Section(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(PanelTokens.Radius))
            .background(PanelTokens.SurfaceRaised)
            .padding(PanelTokens.Gap),
        verticalArrangement = Arrangement.spacedBy(PanelTokens.GapXs),
    ) {
        Text(
            title,
            fontSize = PanelTokens.Heading,
            fontWeight = FontWeight.SemiBold,
            color = PanelTokens.Text,
        )
        content()
    }
}

/** One selectable value in a row of options. */
data class Option(val text: String, val value: String)

@Composable
fun OptionRow(
    label: String,
    options: List<Option>,
    current: String,
    onPick: (String) -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapXs),
    ) {
        Text(
            label,
            fontSize = PanelTokens.Body,
            color = PanelTokens.TextDim,
        )
        Spacer(Modifier.weight(1f))
        options.forEach { option ->
            val on = option.value == current
            Text(
                option.text,
                fontSize = PanelTokens.ChipText,
                fontWeight = if (on) FontWeight.Bold else FontWeight.Normal,
                color = if (on) PanelTokens.OnAccent else PanelTokens.TextDim,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(if (on) PanelTokens.Accent else PanelTokens.SurfaceSunken)
                    .clickable { onPick(option.value) }
                    .padding(horizontal = PanelTokens.GapSm, vertical = 2.dp),
            )
        }
    }
}

@Composable
fun ToggleRow(
    label: String,
    on: Boolean,
    onToggle: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, fontSize = PanelTokens.Body, color = PanelTokens.Text)
        Spacer(Modifier.weight(1f))
        Text(
            stringResource(if (on) R.string.xr_on else R.string.xr_off),
            fontSize = PanelTokens.ChipText,
            fontWeight = FontWeight.Bold,
            color = if (on) PanelTokens.OnAccent else PanelTokens.TextDim,
            modifier = Modifier
                .clip(RoundedCornerShape(50))
                .background(if (on) PanelTokens.AccentAlt else PanelTokens.SurfaceSunken)
                .clickable(onClick = onToggle)
                .padding(horizontal = PanelTokens.Gap, vertical = 2.dp),
        )
    }
}

@Composable
fun StepperRow(
    label: String,
    value: String,
    onStep: (Float) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, fontSize = PanelTokens.Body, color = PanelTokens.TextDim)
        Spacer(Modifier.weight(1f))
        StepChip("−") { onStep(-1f) }
        Text(
            value,
            fontSize = PanelTokens.Body,
            fontFamily = FontFamily.Monospace,
            color = PanelTokens.AccentWarm,
            modifier = Modifier.padding(horizontal = PanelTokens.GapSm),
        )
        StepChip("+") { onStep(1f) }
    }
}

@Composable
private fun StepChip(text: String, onClick: () -> Unit) {
    Text(
        text,
        fontSize = PanelTokens.ChipText,
        color = PanelTokens.Text,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(PanelTokens.SurfaceSunken)
            .clickable(onClick = onClick)
            .padding(horizontal = PanelTokens.GapSm, vertical = 1.dp),
    )
}

/** A tappable pill. [selected] fills it with the accent colour. */
@Composable
fun Chip(
    text: String,
    selected: Boolean = false,
    onClick: () -> Unit,
) {
    Text(
        text,
        fontSize = PanelTokens.ChipText,
        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
        color = if (selected) PanelTokens.OnAccent else PanelTokens.TextDim,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(if (selected) PanelTokens.Accent else PanelTokens.SurfaceRaised)
            .clickable(onClick = onClick)
            .padding(horizontal = PanelTokens.GapSm, vertical = PanelTokens.GapXs),
    )
}

@Composable
fun MetaText(text: String, color: Color = PanelTokens.TextDim) {
    Text(text, fontSize = PanelTokens.Meta, color = color)
}

@Composable
fun EmptyNote(text: String) {
    Text(text, fontSize = PanelTokens.Body, color = PanelTokens.TextDim)
}

/**
 * A thumb drawn from Compose's [ScrollIndicatorState].
 *
 * Compose ships no scrollbar on Android; the state interface is the platform's
 * own answer to "what should a scrollbar show" and is implemented by both
 * `ScrollState` and `LazyListState`.
 */
@Composable
fun Scrollbar(
    indicator: ScrollIndicatorState?,
    color: Color,
    wide: Boolean,
) {
    if (indicator == null) return
    val viewport = indicator.viewportSize
    val content = indicator.contentSize
    if (viewport <= 0 || content <= viewport) return

    val thumb = (viewport.toFloat() / content).coerceIn(MIN_THUMB, 1f)
    val travel = content - viewport
    val progress = (indicator.scrollOffset.toFloat() / travel).coerceIn(0f, 1f)
    val before = progress * (1f - thumb)
    val after = (1f - thumb - before).coerceAtLeast(0f)

    Column(
        modifier = Modifier
            .width(if (wide) 5.dp else 3.dp)
            .fillMaxHeight()
            .padding(vertical = PanelTokens.GapXs),
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

/** Even a huge module keeps a grabbable thumb on screen. */
private const val MIN_THUMB = 0.08f
