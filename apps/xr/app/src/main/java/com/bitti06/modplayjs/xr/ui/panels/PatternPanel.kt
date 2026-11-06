package com.bitti06.modplayjs.xr.ui.panels

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bitti06.modplayjs.engine.PatternColors
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.state.XrStore
import com.bitti06.modplayjs.xr.ui.panel.EmptyNote
import com.bitti06.modplayjs.xr.ui.panel.PanelScaffold
import com.bitti06.modplayjs.xr.ui.panel.PanelTokens

private val ROW_NUM_WIDTH = 30.dp
private val CELL_WIDTH = 96.dp
private val ROW_HEIGHT = 22.dp
private val HEADER_HEIGHT = 24.dp
private val CELL_TEXT = 10.sp

/** "C-4 01 40 A0F": note, instrument, volume, effect at fixed widths. */
private const val CELL_CHARS = 13
private const val NOTE_EMPTY = "..."
private const val FIELD_EMPTY = ".."
private const val EMPTY_CELL = "... .. .. ..."

/** Fast replacement of dot sequences without regex allocations. */
private fun stripDotsFast(raw: String): String {
    if (!raw.contains('.')) return raw
    val sb = StringBuilder(raw.length)
    var inDots = false
    for (i in raw.indices) {
        val c = raw[i]
        if (c == '.') {
            if (!inDots) {
                sb.append("...")
                inDots = true
            }
        } else {
            inDots = false
            sb.append(c)
        }
    }
    return sb.toString()
}

/**
 * Letter spacing that makes exactly [CELL_CHARS] monospace glyphs fill
 * [CELL_WIDTH].
 *
 * A row is one Text node so the list stays fast, which means the cells run
 * together at the font's own advance instead of each sitting in its own 96 dp
 * box. At 10 sp that advance is about 78 dp for 13 glyphs, so the combined
 * string fell roughly 18 dp behind per column: at 32 channels the last one sat
 * more than 600 dp left of its line. Compose adds letter spacing after every
 * glyph, the last one included, so the measured run plus n spacings is exactly
 * the column width and every cell starts on its own line again.
 */
@Composable
private fun rememberCellSpacing(): TextUnit {
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    return remember(density, measurer) {
        val style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = CELL_TEXT)
        val run = measurer.measure(EMPTY_CELL, style, maxLines = 1).size.width
        val target = with(density) { CELL_WIDTH.toPx() }
        with(density) { ((target - run) / CELL_CHARS.toFloat()).toSp() }
    }
}

/**
 * The playing pattern the way a tracker shows it: one row per line, one column
 * per channel, cells in four colours so the eye can follow a single column
 * through the matrix.
 *
 * The grid is a LazyColumn, so a 64-row, 32-channel pattern never builds more
 * than the visible window; the channel header sits outside the list so it stays
 * pinned while still scrolling sideways with the columns.
 */
@Composable
fun PatternPanel() {
    val state by XrStore.state.collectAsState()
    val viewSettings = state.settings.view
    // The row has its own flow: it moves about twelve times a second, and the
    // other panels must not recompose at that rate.
    val playhead by XrStore.playhead.collectAsState()
    val pattern = state.player.pattern
    val listState = rememberLazyListState()
    val scrollState = rememberScrollState()
    val palette = patternPalette(viewSettings.patternColors)
    val cellSpacing = rememberCellSpacing()

    // Follow the playhead three rows down from the top edge instead of pinned
    // to it, and only scroll when the row left the window: collecting the flow
    // in a single long-lived effect avoids cancelling and restarting coroutines
    // on every rapid row tick at high BPM.
    LaunchedEffect(pattern.pattern, pattern.rows, viewSettings.follow) {
        if (!viewSettings.follow || pattern.rows <= 0) return@LaunchedEffect
        XrStore.playhead.collect { ph ->
            val row = ph.row
            if (row !in 0 until pattern.rows) return@collect
            val visible = listState.layoutInfo.visibleItemsInfo
            if (visible.isEmpty()) return@collect
            val first = visible.first().index
            val last = visible.last().index
            if (row < first || row > last - 2) {
                val target = (row - 3).coerceIn(0, (pattern.rows - 1).coerceAtLeast(0))
                listState.scrollToItem(target)
            }
        }
    }

    PanelScaffold(
        title = stringResource(R.string.xr_pattern, pattern.pattern.toString().padStart(2, '0')),
        subtitle =
            if (pattern.rows > 0) {
                stringResource(R.string.xr_pattern_size, pattern.channels, pattern.rows)
            } else {
                "—"
            },
    ) {
        if (pattern.rows == 0 || pattern.cells.isEmpty()) {
            EmptyNote(
                if (state.player.loaded) {
                    stringResource(R.string.xr_pattern_empty)
                } else {
                    stringResource(R.string.xr_no_module)
                },
            )
            return@PanelScaffold
        }

        val gridWidth = ROW_NUM_WIDTH + CELL_WIDTH * pattern.channels

        Box(modifier = Modifier.weight(1f).horizontalScroll(scrollState)) {
            Column(modifier = Modifier.width(gridWidth).fillMaxHeight()) {
                PatternHeader(
                    channels = pattern.channels,
                    line = palette.line,
                    cellSpacing = cellSpacing,
                )
                LazyColumn(state = listState, modifier = Modifier.weight(1f)) {
                    items(count = pattern.rows, key = { row -> row }) { row ->
                        PatternRow(
                            row = row,
                            cells = pattern.cells,
                            channels = pattern.channels,
                            active = row == playhead.row,
                            palette = palette,
                            stripDots = viewSettings.stripDots,
                            cellSpacing = cellSpacing,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PatternHeader(
    channels: Int,
    line: Color,
    cellSpacing: TextUnit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(HEADER_HEIGHT)
            .background(PanelTokens.SurfaceRaised)
            .channelGrid(channels, line),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "#",
            fontSize = CELL_TEXT,
            fontFamily = FontFamily.Monospace,
            color = PanelTokens.TextFaint,
            textAlign = TextAlign.Center,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.width(ROW_NUM_WIDTH),
        )
        repeat(channels) { ch ->
            Text(
                "C${(ch + 1).toString().padStart(2, '0')}",
                fontSize = CELL_TEXT,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                color = PanelTokens.Accent,
                textAlign = TextAlign.Center,
                maxLines = 1,
                softWrap = false,
                letterSpacing = cellSpacing,
                modifier = Modifier.width(CELL_WIDTH),
            )
        }
    }
}

/**
 * Row number plus a single combined AnnotatedString for all channels. Combining
 * cells into one Text node per row reduces Compose layout nodes from N*32 down
 * to N*1, eliminating UI lag on modules with >6 channels.
 */
@Composable
private fun PatternRow(
    row: Int,
    cells: List<String>,
    channels: Int,
    active: Boolean,
    palette: PatternPalette,
    stripDots: Boolean,
    cellSpacing: TextUnit,
) {
    val rowAnnotated = remember(cells, row, channels, palette, stripDots) {
        buildAnnotatedString {
            for (ch in 0 until channels) {
                val raw = cells.getOrElse(row * channels + ch) { EMPTY_CELL }
                val cell = if (stripDots) stripDotsFast(raw) else raw
                appendCell(cell, palette)
            }
        }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(ROW_HEIGHT)
            .background(if (active) PanelTokens.Highlight else Color.Transparent)
            .channelGrid(channels, palette.line),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            row.toString().padStart(2, '0'),
            fontSize = CELL_TEXT,
            fontFamily = FontFamily.Monospace,
            color = if (active) PanelTokens.Accent else PanelTokens.TextFaint,
            textAlign = TextAlign.Center,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.width(ROW_NUM_WIDTH),
        )
        Text(
            rowAnnotated,
            fontSize = CELL_TEXT,
            fontFamily = FontFamily.Monospace,
            maxLines = 1,
            softWrap = false,
            letterSpacing = cellSpacing,
            modifier = Modifier.width(CELL_WIDTH * channels),
        )
    }
}

private data class PatternPalette(
    val note: Color,
    val instrument: Color,
    val volume: Color,
    val effect: Color,
    val empty: Color,
    val line: Color,
)

@Composable
private fun patternPalette(colors: PatternColors): PatternPalette =
    remember(colors) {
        PatternPalette(
            note = colors.note?.let { Color(it) } ?: PanelTokens.Text,
            instrument = colors.instrument?.let { Color(it) } ?: PanelTokens.AccentAlt,
            volume = colors.volume?.let { Color(it) } ?: PanelTokens.AccentWarm,
            effect = colors.effect?.let { Color(it) } ?: PanelTokens.Accent,
            empty = PanelTokens.TextFaint.copy(alpha = 0.55f),
            line = PanelTokens.Outline.copy(alpha = 0.7f),
        )
    }

private fun AnnotatedString.Builder.appendCell(cell: String, palette: PatternPalette) {
    if (cell.length < CELL_CHARS) {
        withStyle(SpanStyle(color = palette.empty)) { append(cell.padEnd(CELL_CHARS)) }
        return
    }
    field(cell, 0, 3, NOTE_EMPTY, palette.note, palette.empty)
    append(' ')
    field(cell, 4, 6, FIELD_EMPTY, palette.instrument, palette.empty)
    append(' ')
    field(cell, 7, 9, FIELD_EMPTY, palette.volume, palette.empty)
    append(' ')
    field(cell, 10, 13, FIELD_EMPTY, palette.effect, palette.empty)
}

private fun AnnotatedString.Builder.field(
    cell: String,
    start: Int,
    end: Int,
    empty: String,
    color: Color,
    dim: Color,
) {
    val text = cell.substring(start, end)
    withStyle(SpanStyle(color = if (text == empty) dim else color)) { append(text) }
}

/** Vertical lines at every channel boundary, so wide modules stay readable. */
private fun Modifier.channelGrid(
    channels: Int,
    line: Color,
): Modifier =
    drawBehind {
        val stroke = 1.dp.toPx()
        var x = ROW_NUM_WIDTH.toPx()
        drawLine(line, Offset(x, 0f), Offset(x, size.height), stroke)
        val cellWidth = CELL_WIDTH.toPx()
        repeat(channels) {
            x += cellWidth
            drawLine(line, Offset(x, 0f), Offset(x, size.height), stroke)
        }
    }
