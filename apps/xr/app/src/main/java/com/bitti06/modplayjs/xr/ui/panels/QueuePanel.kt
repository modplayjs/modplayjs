package com.bitti06.modplayjs.xr.ui.panels

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.font.FontFamily
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.state.XrStore
import com.bitti06.modplayjs.xr.ui.panel.EmptyNote
import com.bitti06.modplayjs.xr.ui.panel.MetaText
import com.bitti06.modplayjs.xr.ui.panel.PanelScaffold
import com.bitti06.modplayjs.xr.ui.panel.PanelTokens

/**
 * What plays next. The playlist owns the order (repeat, shuffle, auto-advance);
 * this panel only shows it and jumps to a row.
 */
@Composable
fun QueuePanel() {
    val state by XrStore.state.collectAsState()
    val tracks = state.queue.tracks
    val current = state.queue.index
    val listState = rememberLazyListState()

    // Keep the playing entry visible when the queue advances on its own.
    LaunchedEffect(tracks, current) {
        if (current in tracks.indices) {
            val visible = listState.layoutInfo.visibleItemsInfo
            if (visible.isEmpty() || current < visible.first().index || current > visible.last().index) {
                listState.scrollToItem(current)
            }
        }
    }

    PanelScaffold(
        title = stringResource(R.string.xr_queue),
        subtitle = stringResource(R.string.xr_queue_meta, tracks.size),
    ) {
        if (tracks.isEmpty()) {
            EmptyNote(stringResource(R.string.xr_queue_empty))
            return@PanelScaffold
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxWidth().weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            itemsIndexed(tracks, key = { _, track -> track.uri.toString() }) { index, track ->
                val playing = index == current
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(PanelTokens.RadiusSmall))
                        .background(if (playing) PanelTokens.Highlight else Color.Transparent)
                        .clickable { XrStore.playQueueIndex(index) }
                        .padding(horizontal = PanelTokens.GapSm, vertical = PanelTokens.GapXs),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm),
                ) {
                    Text(
                        if (playing) "▶" else (index + 1).toString().padStart(2, '0'),
                        fontSize = PanelTokens.Mono,
                        fontFamily = FontFamily.Monospace,
                        color = if (playing) PanelTokens.Accent else PanelTokens.TextFaint,
                    )
                    Column(Modifier.weight(1f)) {
                        Text(
                            track.title,
                            fontSize = PanelTokens.Body,
                            maxLines = 1,
                            color = PanelTokens.Text,
                        )
                        MetaText(
                            "${track.format.uppercase()} · ${track.size / 1024}K",
                            color = PanelTokens.TextFaint,
                        )
                    }
                }
            }
        }
    }
}
