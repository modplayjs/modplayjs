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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.XrApp
import com.bitti06.modplayjs.xr.play.XrPlayer

private val ROW_NUM_WIDTH = 26.dp
private val CELL_WIDTH = 58.dp
private val ROW_HEIGHT = 18.dp

/**
 * Full tracker pattern matrix matching phone app's PatternScreen:
 * - Shows all channels (4, 8, 16, 32) with sticky channel header row.
 * - Horizontal scrolling for wide modules.
 * - Auto-scrolls to follow active playhead row.
 */
@Composable
fun PatternPanel() {
    val state by (XrApp.player?.state ?: kotlinx.coroutines.flow.MutableStateFlow(XrPlayer.State()))
        .collectAsState()
    val pattern = state.pattern
    val listState = rememberLazyListState()

    // Follow the playhead, but only jump when it actually moved: the state
    // emits at 2 Hz and scrollToItem against the same index still relayouts.
    LaunchedEffect(pattern.row, pattern.pattern) {
        if (pattern.rows > 0 && pattern.row in 0 until pattern.rows) {
            if (listState.firstVisibleItemIndex != pattern.row) {
                listState.scrollToItem(pattern.row)
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        // Header
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.xr_pattern, pattern.pattern.toString().padStart(2, '0')),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                if (pattern.rows > 0) {
                    "  " + stringResource(R.string.xr_pattern_meta, pattern.channels, pattern.row)
                } else {
                    "  —"
                },
                fontSize = 8.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (pattern.rows == 0 || pattern.cells.isEmpty()) {
            Text(
                if (state.loaded) {
                    stringResource(R.string.xr_pattern_empty)
                } else {
                    stringResource(R.string.xr_no_module)
                },
                fontSize = 9.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return
        }

        val totalGridWidth = ROW_NUM_WIDTH + (CELL_WIDTH * pattern.channels)

        Box(
            modifier = Modifier
                .fillMaxSize()
                .horizontalScroll(rememberScrollState()),
        ) {
            Column(modifier = Modifier.width(totalGridWidth).fillMaxHeight()) {
                // Sticky Channel Header
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(20.dp)
                        .background(MaterialTheme.colorScheme.surfaceContainer),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "#",
                        fontSize = 8.sp,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.width(ROW_NUM_WIDTH),
                    )
                    for (ch in 0 until pattern.channels) {
                        Text(
                            "C${(ch + 1).toString().padStart(2, '0')}",
                            fontSize = 8.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.width(CELL_WIDTH),
                        )
                    }
                }

                // Pattern Rows
                LazyColumn(state = listState, modifier = Modifier.fillMaxHeight()) {
                    items(pattern.rows) { row ->
                        val playing = row == pattern.row
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(ROW_HEIGHT)
                                .clip(RoundedCornerShape(2.dp))
                                .background(
                                    if (playing) MaterialTheme.colorScheme.primaryContainer
                                    else Color.Transparent,
                                ),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                row.toString().padStart(2, '0'),
                                fontSize = 7.sp,
                                fontFamily = FontFamily.Monospace,
                                color = if (playing) MaterialTheme.colorScheme.onPrimaryContainer
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.width(ROW_NUM_WIDTH),
                            )
                            for (ch in 0 until pattern.channels) {
                                val cellIndex = row * pattern.channels + ch
                                val cell = pattern.cells.getOrElse(cellIndex) { "---" }
                                Text(
                                    cell,
                                    fontSize = 7.sp,
                                    fontFamily = FontFamily.Monospace,
                                    color = if (playing) MaterialTheme.colorScheme.onPrimaryContainer
                                    else MaterialTheme.colorScheme.onSurface,
                                    textAlign = TextAlign.Center,
                                    maxLines = 1,
                                    modifier = Modifier.width(CELL_WIDTH),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
