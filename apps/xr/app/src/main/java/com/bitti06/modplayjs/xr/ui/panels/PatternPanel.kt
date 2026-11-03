package com.bitti06.modplayjs.xr.ui.panels

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bitti06.modplayjs.xr.XrApp
import androidx.compose.ui.res.stringResource
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.play.XrPlayer

/** Tracker pattern, monospace, following the playhead. */
@Composable
fun PatternPanel() {
    val state by (XrApp.player?.state ?: kotlinx.coroutines.flow.MutableStateFlow(XrPlayer.State()))
        .collectAsState()
    val pattern = state.pattern
    val channelCols = pattern.channels.coerceAtMost(4)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
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
            return@Column
        }

        LazyColumn {
            items(pattern.rows) { row ->
                val playing = row == pattern.row
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(2.dp))
                        .background(
                            if (playing) MaterialTheme.colorScheme.primaryContainer
                            else MaterialTheme.colorScheme.background,
                        ),
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Text(
                        row.toString().padStart(2, '0'),
                        fontSize = 7.sp,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    for (ch in 0 until channelCols) {
                        val index = row * pattern.channels + ch
                        Text(
                            pattern.cells.getOrElse(index) { "---" },
                            fontSize = 7.sp,
                            fontFamily = FontFamily.Monospace,
                            color = if (playing) MaterialTheme.colorScheme.onPrimaryContainer
                            else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }
    }
}
