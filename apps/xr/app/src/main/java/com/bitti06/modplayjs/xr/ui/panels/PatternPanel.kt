package com.bitti06.modplayjs.xr.ui.panels

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
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
import com.bitti06.modplayjs.xr.XrApp
import com.bitti06.modplayjs.xr.play.XrPlayer

// Same proportions as the phone app's PatternScreen (10 sp in a 15 dp row),
// scaled to a panel you read from ~2 m instead of ~30 cm.
private val ROW_NUM_WIDTH = 26.dp
private val CELL_WIDTH = 88.dp
private val ROW_HEIGHT = 20.dp
private val HEADER_HEIGHT = 22.dp

/** "C-4 01 40 A0F": note, instrument, volume, effect at fixed widths. */
private const val CELL_CHARS = 13
private const val NOTE_EMPTY = "..."
private const val FIELD_EMPTY = ".."
private const val EMPTY_CELL = "... .. .. ..."

/** Compiled once: the dot-run test runs for every cell of every visible row. */
private val DOT_RUN = Regex("\\.+")

/**
 * The playing pattern the way a tracker shows it: one row per line, one column
 * per channel, cells in four colours (note, instrument, volume, effect) so the
 * eye can follow a single column through the matrix.
 *
 * The grid is a LazyColumn so a 64-row, 32-channel pattern never builds more
 * than the visible window; the channel header sits outside the list, which
 * keeps it pinned vertically while it still scrolls sideways with the columns.
 */
@Composable
fun PatternPanel() {
    val state by (XrApp.player?.state ?: kotlinx.coroutines.flow.MutableStateFlow(XrPlayer.State()))
        .collectAsState()
    val pattern = state.pattern
    val listState = rememberLazyListState()
    val scrollState = rememberScrollState()
    val palette = patternPalette(state.patternColors)

    // Follow the playhead three rows down from the top edge instead of pinned
    // to it, and only scroll when the row left the window. The playhead now
    // arrives ~8x/s (see XrPlayer.publishPlayhead), so scrolling on every emit
    // would fight the user's own drag and jitter the whole grid.
    LaunchedEffect(pattern.row, pattern.pattern, pattern.rows, state.follow) {
        if (!state.follow) return@LaunchedEffect
        if (pattern.rows <= 0 || pattern.row !in 0 until pattern.rows) return@LaunchedEffect
        val visible = listState.layoutInfo.visibleItemsInfo
        if (visible.isEmpty()) return@LaunchedEffect
        val first = visible.first().index
        val last = visible.last().index
        if (pattern.row < first || pattern.row > last - 2) {
            val target = (pattern.row - 3).coerceIn(0, (pattern.rows - 1).coerceAtLeast(0))
            listState.scrollToItem(target)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.xr_pattern, pattern.pattern.toString().padStart(2, '0')),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                if (pattern.rows > 0) {
                    "  " + stringResource(R.string.xr_pattern_meta, pattern.channels, pattern.row)
                } else {
                    "  —"
                },
                fontSize = 9.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            HomeChip()
        }

        if (pattern.rows == 0 || pattern.cells.isEmpty()) {
            Text(
                if (state.loaded) stringResource(R.string.xr_pattern_empty) else stringResource(R.string.xr_no_module),
                fontSize = 9.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return
        }

        val gridWidth = ROW_NUM_WIDTH + CELL_WIDTH * pattern.channels

        Box(
            modifier = Modifier
                .fillMaxSize()
                .horizontalScroll(scrollState),
        ) {
            Column(modifier = Modifier.width(gridWidth).fillMaxHeight()) {
                PatternHeader(channels = pattern.channels, line = palette.line)

                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxHeight(),
                    // No animateItem here: the playhead moves 8x/s, and an item
                    // animation would start a new transition per step.
                ) {
                    items(count = pattern.rows, key = { row -> row }) { row ->
                        PatternRow(
                            row = row,
                            cells = pattern.cells,
                            channels = pattern.channels,
                            active = row == pattern.row,
                            palette = palette,
                            stripDots = state.stripDots,
                        )
                    }
                }
            }
        }
    }
}

/** Channel numbers over their columns, with the same grid lines as the rows. */
@Composable
private fun PatternHeader(channels: Int, line: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(HEADER_HEIGHT)
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .channelGrid(channels, line),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "#",
            fontSize = 9.sp,
            fontFamily = FontFamily.Monospace,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.width(ROW_NUM_WIDTH),
        )
        repeat(channels) { ch ->
            Text(
                "C${(ch + 1).toString().padStart(2, '0')}",
                fontSize = 9.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
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
    val scheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(ROW_HEIGHT)
            .background(if (active) scheme.primaryContainer else Color.Transparent)
            .channelGrid(channels, palette.line),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            row.toString().padStart(2, '0'),
            fontSize = 9.sp,
            fontFamily = FontFamily.Monospace,
            color = if (active) scheme.onPrimaryContainer else scheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.width(ROW_NUM_WIDTH),
        )
        for (ch in 0 until channels) {
            val raw = cells.getOrElse(row * channels + ch) { EMPTY_CELL }
            // A top-level Regex, not one per cell: building a Regex for every
            // cell of every row was allocation churn on the frame path.
            val cell = if (stripDots) DOT_RUN.replace(raw, "...") else raw
            val text =
                remember(cell, palette) {
                    annotatedCell(cell, palette)
                }
            // No `color =` here: the AnnotatedString carries one per field, and
            // a Text-level colour would override them. The phone app does the
            // same; only the row background marks the playhead.
            Text(
                text,
                fontSize = 9.sp,
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
private fun patternPalette(colors: PatternColors): PatternPalette {
    val scheme = MaterialTheme.colorScheme
    return remember(scheme, colors) {
        PatternPalette(
            note = colors.note?.let { Color(it) } ?: scheme.onSurface,
            instrument = colors.instrument?.let { Color(it) } ?: scheme.secondary,
            volume = colors.volume?.let { Color(it) } ?: scheme.tertiary,
            effect = colors.effect?.let { Color(it) } ?: scheme.primary,
            empty = scheme.onSurfaceVariant.copy(alpha = 0.40f),
            line = scheme.outlineVariant.copy(alpha = 0.55f),
        )
    }
}

/**
 * Splits one engine cell into its four fields. The engine writes them at fixed
 * widths (3 / 2 / 2 / 3), which is what keeps the columns aligned; a short or
 * unexpected string is shown dimmed instead of mis-sliced.
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
