package com.bitti06.modplayjs.xr.ui.panels

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.state.XrStore
import com.bitti06.modplayjs.xr.ui.panel.EmptyNote
import com.bitti06.modplayjs.xr.ui.panel.HomeButton
import com.bitti06.modplayjs.xr.ui.panel.PanelScaffold
import com.bitti06.modplayjs.xr.ui.panel.PanelTokens
import com.bitti06.modplayjs.xr.ui.panel.Scrollbar

/** Which block, if any, currently covers the panel. */
private enum class Expanded { None, Message, Instruments, Samples }

/**
 * Track details: the module facts plus the three text blocks the phone app
 * shows — message, instruments, samples — side by side, because this panel is
 * registered wider than the others for exactly that reason.
 *
 * The three blocks share the width by how much text they hold, not in equal
 * thirds: the body is monospace, so the longest line is the block's natural
 * width, and a two-line message does not need the same room as a twenty-entry
 * sample list.
 *
 * Tapping a block expands it over the whole panel. In that state the panel
 * paints no background at all: the room behind it is the backdrop, and the text
 * carries a shadow so it stays readable while floating.
 */
@Composable
fun DetailsPanel() {
    val state by XrStore.state.collectAsState()
    val playback = state.player
    var expanded by remember { mutableStateOf(Expanded.None) }

    val message =
        remember(playback.message) {
            playback.message.replace("\r", "").takeIf { it.isNotBlank() }?.lines().orEmpty()
        }
    val instruments = remember(playback.trackDetail.instrumentList) { playback.trackDetail.instrumentList }
    val samples = remember(playback.trackDetail.sampleList) { playback.trackDetail.sampleList }

    if (expanded != Expanded.None) {
        val block =
            when (expanded) {
                Expanded.Message ->
                    Triple(
                        stringResource(R.string.xr_details_message),
                        PanelTokens.AccentWarm,
                        message.ifEmpty { listOf(stringResource(R.string.xr_details_empty)) },
                    )
                Expanded.Instruments ->
                    Triple(
                        stringResource(R.string.xr_details_instruments),
                        PanelTokens.Accent,
                        instruments,
                    )
                else ->
                    Triple(
                        stringResource(R.string.xr_details_samples),
                        PanelTokens.AccentAlt,
                        samples,
                    )
            }
        Column(
            modifier = Modifier.fillMaxSize().padding(PanelTokens.GapLg),
            verticalArrangement = Arrangement.spacedBy(PanelTokens.GapSm),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.xr_details),
                    fontSize = PanelTokens.Heading,
                    fontWeight = FontWeight.SemiBold,
                    color = PanelTokens.Text,
                    style = TextStyle(shadow = Shadow(color = Color.Black, blurRadius = 10f)),
                    modifier = Modifier.weight(1f),
                )
                HomeButton()
            }
            TextBlock(
                title = block.first,
                accent = block.second,
                lines = block.third,
                expanded = true,
                onToggle = { expanded = Expanded.None },
                modifier = Modifier.fillMaxSize(),
            )
        }
        return
    }

    PanelScaffold(
        title = stringResource(R.string.xr_details),
        subtitle = playback.title.ifBlank { null },
    ) {
        if (playback.details.isEmpty()) {
            EmptyNote(stringResource(R.string.xr_no_module))
            return@PanelScaffold
        }

        if (playback.trackDetail.orderList.isNotBlank()) {
            Text(
                playback.trackDetail.orderList,
                fontSize = PanelTokens.Mono,
                fontFamily = FontFamily.Monospace,
                color = PanelTokens.TextDim,
                maxLines = 2,
            )
        }

        // One reference width for all three, so the shares stay relative:
        // the widest block takes the most room, the others keep a usable card.
        val widest =
            maxOf(
                message.widestLine(),
                instruments.widestLine(),
                samples.widestLine(),
            )

        Row(
            modifier = Modifier.fillMaxWidth().weight(1f),
            horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm),
        ) {
            TextBlock(
                title = stringResource(R.string.xr_details_message),
                accent = PanelTokens.AccentWarm,
                lines = message,
                expanded = false,
                onToggle = { expanded = Expanded.Message },
                modifier = Modifier.weight(shareOf(message, widest)).fillMaxHeight(),
            )
            TextBlock(
                title = stringResource(R.string.xr_details_instruments),
                accent = PanelTokens.Accent,
                lines = instruments,
                expanded = false,
                onToggle = { expanded = Expanded.Instruments },
                modifier = Modifier.weight(shareOf(instruments, widest)).fillMaxHeight(),
            )
            TextBlock(
                title = stringResource(R.string.xr_details_samples),
                accent = PanelTokens.AccentAlt,
                lines = samples,
                expanded = false,
                onToggle = { expanded = Expanded.Samples },
                modifier = Modifier.weight(shareOf(samples, widest)).fillMaxHeight(),
            )
        }

        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(0.7f),
            verticalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            items(playback.details) { (key, value) ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(2.dp)),
                    horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm),
                ) {
                    Text(
                        key,
                        fontSize = PanelTokens.Mono,
                        fontFamily = FontFamily.Monospace,
                        color = PanelTokens.TextDim,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        value,
                        fontSize = PanelTokens.Mono,
                        fontFamily = FontFamily.Monospace,
                        color = PanelTokens.Text,
                        modifier = Modifier.weight(2f),
                    )
                }
            }
        }
    }
}

/** Character count of the longest line; the body is monospace, so it is width. */
private fun List<String>.widestLine(): Int = maxOfOrNull { it.length } ?: 0

/**
 * Width share of one block, relative to the widest of the three.
 *
 * [MIN_SHARE] keeps a short block from collapsing to a sliver: its header and
 * a few lines still have to be readable and tappable. With no text at all the
 * three split evenly, which is the old behaviour.
 */
private fun shareOf(lines: List<String>, widest: Int): Float {
    if (widest <= 0) return 1f
    return (lines.widestLine().toFloat() / widest).coerceIn(MIN_SHARE, 1f)
}

private const val MIN_SHARE = 0.45f

/**
 * A scrollable block of module text. Collapsed, three of these sit side by side
 * in a tinted card; expanded, one fills the panel and the panel stops painting
 * a background, so the room shows through and the text carries its own contrast
 * with a shadow. A scrollbar is drawn either way.
 */
@Composable
private fun TextBlock(
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
                fontSize = PanelTokens.Body,
                lineHeight = PanelTokens.Body * 1.35f,
                shadow = Shadow(color = Color.Black, offset = Offset(0f, 0f), blurRadius = 10f),
            )
        } else {
            TextStyle(fontFamily = FontFamily.Monospace, fontSize = PanelTokens.Meta)
        }

    Column(
        modifier =
            modifier.then(
                if (expanded) {
                    Modifier.fillMaxSize()
                } else {
                    Modifier
                        .clip(RoundedCornerShape(PanelTokens.Radius))
                        .background(lerp(PanelTokens.SurfaceRaised, accent, 0.16f))
                },
            ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = !empty, onClick = onToggle)
                .padding(horizontal = PanelTokens.GapSm, vertical = PanelTokens.GapXs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm),
        ) {
            Text(
                title.uppercase(),
                fontSize = PanelTokens.Meta,
                fontWeight = FontWeight.SemiBold,
                color = accent,
                modifier = Modifier.weight(1f),
            )
            if (!empty) {
                Text(
                    if (expanded) "✕" else lines.size.toString(),
                    fontSize = PanelTokens.Meta,
                    fontFamily = FontFamily.Monospace,
                    color = accent,
                )
            }
        }

        if (empty) {
            Text(
                "—",
                fontSize = PanelTokens.Meta,
                color = PanelTokens.TextFaint,
                modifier = Modifier.padding(horizontal = PanelTokens.GapSm, vertical = 2.dp),
            )
            return@Column
        }

        Row(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(start = PanelTokens.GapSm, end = PanelTokens.GapXs, bottom = PanelTokens.GapSm)
                    .verticalScroll(scroll),
            ) {
                lines.forEach { line ->
                    Text(line, style = bodyStyle, color = PanelTokens.Text)
                }
            }
            Scrollbar(indicator = scroll.scrollIndicatorState, color = accent, wide = expanded)
        }
    }
}
