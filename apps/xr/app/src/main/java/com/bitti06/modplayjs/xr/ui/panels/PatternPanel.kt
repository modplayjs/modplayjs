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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
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

/** Compiled once: the dot-run test runs for every cell of every visible row. */
private val DOT_RUN = Regex("\\.+")

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
    val pattern = state.player.pattern
    val listState = rememberLazyListState()
    val scrollState = rememberScrollState()
    val palette = patternPalette(state.player.patternColors)

    // Follow the playhead three rows down from the top edge instead of pinned
    // to it, and only scroll when the row left the window: the playhead arrives
    // many times a second, and scrolling on every emit would fight the user.
    LaunchedEffect(pattern.row, pattern.pattern, pattern.rows, state.player.follow) {
        if (!state.player.follow) return@LaunchedEffect
        if (pattern.rows <= 0 || pattern.row !in 0 until pattern.rows) return@LaunchedEffect
        val visible = listState.layoutInfo.visibleItemsInfo
        if (visible.isEmpty()) return@LaunchedEffect
        val first = visible.first().index
        val last = visible.last().index
        if (pattern.row < first || pattern.row > last - 2) {
            listState.scrollToItem((pattern.row - 3).coerceIn(0, (pattern.rows - 1).coerceAtLeast(0)))
        }
    }

    PanelScaffold(
        title = stringResource(R.string.xr_pattern, pattern.pattern.toString().padStart(2, '0')),
        subtitle =
            if (pattern.rows > 0) {
                stringResource(R.string.xr_pattern_meta, pattern.channels, pattern.row)
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
                PatternHeader(channels = pattern.channels, line = palette.line)
                LazyColumn(state = listState, modifier = Modifier.weight(1f)) {
                    items(count = pattern.rows, key = { row -> row }) { row ->
                        PatternRow(
                            row = row,
                            cells = pattern.cells,
                            channels = pattern.channels,
                            active = row == pattern.row,
                            palette = palette,
                            stripDots = state.player.stripDots,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PatternHeader(channels: Int, line: Color) {
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
                modifier = Modifier.width(CELL_WIDTH),
            )
        }
    }
}

/**
 * Row number plus one coloured cell per channel. The AnnotatedString is built
 * once per (cell text, palette) through remember, so a playhead move does not
 * rebuild two thousand styled strings.
 */
@Composable
private fun PatternRow(
    row: Int,
    cells: List<String>,
    channels: Int,
    active: Boolean,
    palette: PatternPalette,
    stripDots: Boolean,
) {
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
        for (ch in 0 until channels) {
            val raw = cells.getOrElse(row * channels + ch) { EMPTY_CELL }
            val cell = if (stripDots) DOT_RUN.replace(raw, "...") else raw
            val text = remember(cell, palette) { annotatedCell(cell, palette) }
            Text(
                text,
                fontSize = CELL_TEXT,
                fontFamily = FontFamily.Monospace,
                maxLines = 1,
                softWrap = false,
                modifier = Modifier.width(CELL_WIDTH),
            )
        }
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

/**
 * Splits one engine cell into its four fields. The engine writes them at fixed
 * widths (3 / 2 / 2 / 3); a short or unexpected string is shown dimmed instead
 * of mis-sliced.
 */
private fun annotatedCell(cell: String, palette: PatternPalette): AnnotatedString =
    buildAnnotatedString {
        if (cell.length < CELL_CHARS) {
            withStyle(SpanStyle(color = palette.empty)) { append(cell) }
            return@buildAnnotatedString
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
