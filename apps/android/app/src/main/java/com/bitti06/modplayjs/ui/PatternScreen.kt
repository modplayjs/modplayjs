package com.bitti06.modplayjs.ui

import android.content.res.Configuration
import android.view.WindowInsets
import android.view.WindowInsetsController
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bitti06.modplayjs.R
import com.bitti06.modplayjs.engine.AndroidPattern
import com.bitti06.modplayjs.engine.AndroidSnapshot

/**
 * The playing pattern, one row per line and one column per channel, the way a
 * tracker shows it: channel numbers stay pinned at the top while the rows
 * scroll, and the columns scroll sideways because a module can have more
 * channels than a phone has width.
 */
@Composable
fun PatternScreen(
    snapshot: AndroidSnapshot?,
    pattern: AndroidPattern?,
    follow: Boolean,
    onBack: () -> Unit,
) {
    val ord = snapshot?.state?.ord ?: 0
    val activeRow = snapshot?.state?.row ?: 0
    // Landscape is the only way to see many channels at once, so the system
    // bars get out of the way there.
    ImmersiveInLandscape(LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE)

    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        ModalTopBar(stringResource(R.string.pattern_title, ord), onBack)
        val data = pattern
        if (data == null || data.rows <= 0 || data.channels <= 0) {
            EmptyState(
                title = stringResource(R.string.pattern_empty_title),
                body = stringResource(R.string.pattern_empty_body),
            )
            return
        }
        Text(
            pluralStringResource(R.plurals.pattern_rows, data.rows, data.rows) +
                " · " +
                pluralStringResource(R.plurals.pattern_channels, data.channels, data.channels),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 6.dp),
        )

        val listState = rememberLazyListState()
        val rowHeightPx = with(LocalDensity.current) { ROW_HEIGHT.toPx() }
        // Keep the playhead a few rows down the window instead of pinned to the
        // first line, so the rows that follow stay visible.
        LaunchedEffect(activeRow, follow, data.pattern) {
            if (follow && activeRow in 0 until data.rows) {
                listState.animateScrollToItem(activeRow, scrollOffset = -(rowHeightPx * 3).toInt())
            }
        }

        val gridWidth = ROW_NUMBER_WIDTH + CELL_WIDTH * data.channels.toFloat()
        Box(Modifier.fillMaxSize().horizontalScroll(rememberScrollState())) {
            // The header lives outside the list, so it stays put vertically and
            // still travels with the columns.
            Column(Modifier.width(gridWidth).fillMaxHeight()) {
                ChannelHeader(data.channels)
                LazyColumn(state = listState, modifier = Modifier.fillMaxHeight()) {
                    items(data.rows) { row ->
                        PatternLine(
                            row = row,
                            cells = data.cells,
                            channels = data.channels,
                            active = row == activeRow,
                            accent = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
        }
    }
}

/** Channel numbers over their columns, with the same grid lines as the rows. */
@Composable
private fun ChannelHeader(channels: Int) {
    val line = MaterialTheme.colorScheme.outlineVariant
    Row(
        Modifier
            .fillMaxWidth()
            .height(HEADER_HEIGHT)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .channelGrid(channels, line),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            stringResource(R.string.pattern_row_label),
            style = labelStyle(),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.width(ROW_NUMBER_WIDTH),
        )
        for (channel in 0 until channels) {
            Text(
                "C${(channel + 1).toString().padStart(2, '0')}",
                style = labelStyle(),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                maxLines = 1,
                softWrap = false,
                modifier = Modifier.width(CELL_WIDTH),
            )
        }
    }
}

/**
 * Row number plus one cell per channel. A cell is "C-4 01 40 A0F": note,
 * instrument, volume and effect, each in its own colour so the columns of a
 * cell stay readable at 10 sp.
 */
@Composable
private fun PatternLine(
    row: Int,
    cells: List<String>,
    channels: Int,
    active: Boolean,
    accent: Color,
) {
    val scheme = MaterialTheme.colorScheme
    val dim = scheme.onSurfaceVariant.copy(alpha = 0.40f)
    val style = remember { cellStyle() }
    Row(
        Modifier
            .fillMaxWidth()
            .height(ROW_HEIGHT)
            .background(if (active) accent.copy(alpha = 0.20f) else Color.Transparent)
            .channelGrid(channels, scheme.outlineVariant.copy(alpha = 0.55f)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            row.toString().padStart(2, '0'),
            style = style,
            color = if (active) accent else scheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.width(ROW_NUMBER_WIDTH),
        )
        for (channel in 0 until channels) {
            val cell = cells.getOrElse(row * channels + channel) { EMPTY_CELL }
            Text(
                annotatedCell(
                    cell = cell,
                    note = scheme.onSurface,
                    ins = scheme.secondary,
                    vol = scheme.tertiary,
                    fx = scheme.primary,
                    dim = dim,
                ),
                style = style,
                // A cell must never wrap: the grid alignment depends on one line.
                maxLines = 1,
                softWrap = false,
                modifier = Modifier.width(CELL_WIDTH),
            )
        }
    }
}

/**
 * Splits one engine cell into its four fields. The engine writes them at fixed
 * widths (3 / 2 / 2 / 3), which is what keeps the columns aligned; a short or
 * unexpected string is shown dimmed instead of mis-sliced.
 */
private fun annotatedCell(
    cell: String,
    note: Color,
    ins: Color,
    vol: Color,
    fx: Color,
    dim: Color,
): AnnotatedString =
    buildAnnotatedString {
        if (cell.length < CELL_CHARS) {
            withStyle(SpanStyle(color = dim)) { append(cell) }
            return@buildAnnotatedString
        }
        field(cell, 0, 3, NOTE_EMPTY, note, dim)
        append(' ')
        field(cell, 4, 6, FIELD_EMPTY, ins, dim)
        append(' ')
        field(cell, 7, 9, FIELD_EMPTY, vol, dim)
        append(' ')
        field(cell, 10, 13, FIELD_EMPTY, fx, dim)
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

/** Vertical lines at every channel boundary. */
private fun Modifier.channelGrid(
    channels: Int,
    line: Color,
): Modifier =
    drawBehind {
        val stroke = 1.dp.toPx()
        val cellWidth = CELL_WIDTH.toPx()
        var x = ROW_NUMBER_WIDTH.toPx()
        drawLine(line, Offset(x, 0f), Offset(x, size.height), stroke)
        repeat(channels) {
            x += cellWidth
            drawLine(line, Offset(x, 0f), Offset(x, size.height), stroke)
        }
    }

/**
 * Full screen in landscape: the bars take real estate the grid can use, and the
 * system gesture still brings them back.
 */
@Composable
private fun ImmersiveInLandscape(enabled: Boolean) {
    val view = LocalView.current
    val context = LocalContext.current
    DisposableEffect(enabled) {
        if (!enabled) return@DisposableEffect onDispose { }
        val controller = context.findActivity()?.window?.insetsController
            ?: return@DisposableEffect onDispose { }
        controller.systemBarsBehavior =
            WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsets.Type.systemBars())
        onDispose { controller.show(WindowInsets.Type.systemBars()) }
    }
}

private const val CELL_CHARS = 13
private const val NOTE_EMPTY = "..."
private const val FIELD_EMPTY = ".."
private const val EMPTY_CELL = "... .. .. ..."

private val ROW_HEIGHT: Dp = 15.dp
private val HEADER_HEIGHT: Dp = 18.dp
private val ROW_NUMBER_WIDTH: Dp = 26.dp

/** "C-4 01 40 A0F" at 10 sp monospace. */
private val CELL_WIDTH: Dp = 84.dp

private fun cellStyle(): TextStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp)

private fun labelStyle(): TextStyle =
    TextStyle(fontFamily = FontFamily.Monospace, fontSize = 9.sp, fontWeight = FontWeight.Bold)

@Preview(name = "Pattern", showBackground = true, backgroundColor = 0xFF0C0A18, heightDp = 700)
@Composable
private fun PatternScreenPreview() {
    PreviewFrame(dark = true) {
        PatternScreen(
            snapshot = previewSnapshot(),
            pattern = previewPattern(),
            follow = true,
            onBack = {},
        )
    }
}

private fun previewPattern(): AndroidPattern {
    val channels = 12
    val rows = 64
    val notes = listOf("C-4", "D#4", "F-4", "G-4", "A#3", "...", "...", "C-5")
    val cells =
        (0 until rows * channels).map { index ->
            val row = index / channels
            val channel = index % channels
            when {
                channel % 4 == 3 && row % 8 == 0 -> "---  .. .. A0F"
                row % 2 == 0 -> "${notes[(row + channel) % notes.size]} ${(channel + 1).toString().padStart(2, ' ')} 48 ..."
                else -> "... .. .. ..."
            }
        }
    return AndroidPattern(pattern = 7, rows = rows, channels = channels, cells = cells)
}
