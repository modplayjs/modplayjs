package com.bitti06.modplayjs.xr.ui.panels

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.play.XrPlayer
import com.bitti06.modplayjs.xr.state.XrStore
import com.bitti06.modplayjs.xr.ui.panel.EmptyNote
import com.bitti06.modplayjs.xr.ui.panel.MetaText
import com.bitti06.modplayjs.xr.ui.panel.PanelScaffold
import com.bitti06.modplayjs.xr.ui.panel.PanelTokens

/**
 * Debug view of the spatial scene: one row per audio object, in the same colour
 * as its marker in the room, with the live level and the azimuth the engine
 * computed for that channel.
 */
@Composable
fun DebugPanel() {
    val state by XrStore.state.collectAsState()
    val playback = state.player

    PanelScaffold(
        title = stringResource(R.string.xr_sources),
        subtitle =
            if (playback.spatialEnabled) {
                "${playback.channels} objects · ${playback.layout}"
            } else {
                stringResource(R.string.xr_debug_stereo)
            },
    ) {
        if (!playback.spatialEnabled) {
            EmptyNote(stringResource(R.string.xr_debug_off))
            return@PanelScaffold
        }

        if (!playback.canMute) {
            MetaText(stringResource(R.string.xr_debug_mute_unavailable))
        }

        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(1f),
            verticalArrangement = Arrangement.spacedBy(PanelTokens.GapXs),
        ) {
            items(count = playback.channels) { ch ->
                val level = playback.levels.getOrElse(ch) { 0f }.coerceIn(0f, 1f)
                val azimuth = playback.azimuths.getOrElse(ch) { 0f }
                val color = Color(XrPlayer.colorArgb(ch))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm),
                ) {
                    Box(
                        Modifier
                            .size(9.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(color),
                    )
                    Text(
                        "CH ${(ch + 1).toString().padStart(2, '0')}",
                        fontSize = PanelTokens.Mono,
                        fontFamily = FontFamily.Monospace,
                        color = PanelTokens.Text,
                    )
                    Text(
                        "${azimuth.toInt()}°",
                        fontSize = PanelTokens.Mono,
                        fontFamily = FontFamily.Monospace,
                        color = PanelTokens.TextDim,
                        modifier = Modifier.padding(start = 2.dp),
                    )
                    Box(
                        Modifier
                            .weight(1f)
                            .height(5.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(PanelTokens.SurfaceSunken),
                    ) {
                        Box(
                            Modifier
                                .fillMaxWidth(level)
                                .height(5.dp)
                                .background(color),
                        )
                    }
                    Text(
                        "${(level * 100).toInt()}",
                        fontSize = PanelTokens.Mono,
                        fontFamily = FontFamily.Monospace,
                        color = PanelTokens.TextDim,
                    )
                }
            }
        }

        MetaText(stringResource(R.string.xr_debug_hint))
    }
}
