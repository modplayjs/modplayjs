package com.bitti06.modplayjs.xr.ui.panels

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.state.XrStore
import com.bitti06.modplayjs.xr.ui.panel.MetaText
import com.bitti06.modplayjs.xr.ui.panel.PanelScaffold
import com.bitti06.modplayjs.xr.ui.panel.PanelTokens
import com.bitti06.modplayjs.xr.ui.panel.SettingsButton

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun NowPlayingPanel() {
    val state by XrStore.state.collectAsState()
    val playback = state.player
    var volume by remember { mutableFloatStateOf(playback.volume.toFloat()) }

    PanelScaffold(
        title = stringResource(R.string.xr_now_playing),
        subtitle = if (playback.loaded) playback.format else null,
        headerActions = { SettingsButton() },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapXs)) {
            Tag(
                if (playback.spatialEnabled) "SPATIAL · ${playback.channels}" else "STEREO",
                accent = playback.spatialEnabled,
            )
            if (playback.layout.isNotBlank() && playback.spatialEnabled) {
                Tag(playback.layout)
            }
            Spacer(Modifier.weight(1f))
            MetaText(
                if (playback.loaded) {
                    "${playback.channels} ch · ${formatTime(playback.positionMs)} / ${formatTime(playback.durationMs)}"
                } else {
                    stringResource(R.string.xr_push_hint, "…/files/modules")
                },
                color = PanelTokens.TextFaint,
            )
        }

        Text(
            playback.title.ifBlank { stringResource(R.string.xr_no_track) },
            fontSize = PanelTokens.Title,
            fontWeight = FontWeight.SemiBold,
            color = PanelTokens.Text,
            maxLines = 1,
        )

        Visualizer(
            mode = playback.visualizer,
            levels = playback.levels,
            channels = playback.channels,
            active = playback.playing,
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(PanelTokens.Gap),
        ) {
            CircleButton("■") { XrStore.stop() }
            CircleButton("|◀") { XrStore.previous() }
            CircleButton(if (playback.playing) "❚❚" else "▶", primary = true) { XrStore.playPause() }
            CircleButton("▶|") { XrStore.next() }
            if (playback.seekable) {
                CircleButton("−10") { XrStore.seek(playback.positionMs - 10_000L) }
                CircleButton("+10") { XrStore.seek(playback.positionMs + 10_000L) }
            }
            Spacer(Modifier.weight(1f))
            MetaText(formatTime(playback.positionMs), color = PanelTokens.TextFaint)
        }

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm)) {
            Column(
                Modifier
                    .weight(1f)
                    .height(16.dp)
                    .pointerInput(playback.durationMs) {
                        detectTapGestures { offset ->
                            if (playback.durationMs > 0 && size.width > 0) {
                                val fraction = (offset.x / size.width).coerceIn(0f, 1f)
                                XrStore.seek((fraction * playback.durationMs).toLong())
                            }
                        }
                    },
            ) {
                val progress =
                    if (playback.durationMs > 0) {
                        (playback.positionMs.toFloat() / playback.durationMs).coerceIn(0f, 1f)
                    } else {
                        0f
                    }
                Column(
                    Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(PanelTokens.SurfaceSunken),
                ) {
                    Column(
                        Modifier
                            .fillMaxWidth(progress)
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(
                                Brush.horizontalGradient(
                                    listOf(PanelTokens.Accent, PanelTokens.AccentAlt),
                                ),
                            ),
                    ) {}
                }
            }
            MetaText(formatTime(playback.durationMs), color = PanelTokens.TextFaint)
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm),
        ) {
            Text("🔊", fontSize = PanelTokens.Body, color = PanelTokens.TextDim)
            Slider(
                value = volume,
                onValueChange = { volume = it },
                onValueChangeFinished = { XrStore.setVolume(volume.toInt()) },
                valueRange = 0f..100f,
                colors =
                    SliderDefaults.colors(
                        thumbColor = PanelTokens.Accent,
                        activeTrackColor = PanelTokens.Accent,
                        inactiveTrackColor = PanelTokens.SurfaceSunken,
                    ),
                modifier = Modifier.weight(1f).height(26.dp),
            )
            Text(
                "${volume.toInt()}",
                fontSize = PanelTokens.Mono,
                fontFamily = FontFamily.Monospace,
                color = PanelTokens.TextDim,
                modifier = Modifier.width(26.dp),
            )
        }

        if (playback.showChannelStrip && playback.channels in 1..16) {
            Row(horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapXs)) {
                for (i in 0 until playback.channels) {
                    val muted = playback.muted.contains(i)
                    Text(
                        (i + 1).toString().padStart(2, '0'),
                        fontSize = PanelTokens.Mono,
                        fontFamily = FontFamily.Monospace,
                        color =
                            when {
                                playback.solo == i -> PanelTokens.AccentAlt
                                muted -> PanelTokens.TextFaint
                                playback.spatialEnabled && i < playback.azimuths.size -> PanelTokens.AccentWarm
                                else -> PanelTokens.TextDim
                            },
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(PanelTokens.SurfaceRaised)
                            .combinedClickable(
                                onClick = { XrStore.toggleMute(i) },
                                onLongClick = { XrStore.toggleSolo(i) },
                            )
                            .padding(horizontal = PanelTokens.GapXs, vertical = 2.dp),
                    )
                }
            }
        }
    }
}

/**
 * Channel levels. The engine reports one level per channel, so "spectrum" and
 * "waveform" both draw the same data; a real FFT would be new engine output.
 */
@Composable
private fun Visualizer(
    mode: String,
    levels: List<Float>,
    channels: Int,
    active: Boolean,
) {
    if (mode == "off") return
    Row(
        horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapXs),
        verticalAlignment = Alignment.Bottom,
        modifier = Modifier.height(28.dp),
    ) {
        val bars = maxOf(channels, 1).coerceAtMost(16)
        repeat(bars) { i ->
            val level = levels.getOrElse(i) { 0f }.coerceIn(0f, 1f)
            val fallback = listOf(8, 16, 24, 12, 20, 7, 22, 11, 17, 6, 19, 13, 9, 15, 21, 10)[i % 16]
            val barHeight =
                when {
                    mode == "waveform" -> if (active) fallback else fallback / 3
                    levels.isEmpty() -> if (active) fallback / 2 else fallback / 4
                    else -> 2 + (level * 26f).toInt()
                }
            Column(
                Modifier
                    .width(5.dp)
                    .height(barHeight.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(if (i % 3 == 0) PanelTokens.Accent else PanelTokens.AccentAlt),
            ) {}
        }
    }
}

private fun formatTime(ms: Long): String {
    val total = (ms / 1000).coerceAtLeast(0)
    return "${total / 60}:${(total % 60).toString().padStart(2, '0')}"
}

@Composable
private fun Tag(
    text: String,
    accent: Boolean = false,
) {
    Text(
        text,
        fontSize = PanelTokens.Meta,
        fontWeight = FontWeight.Bold,
        color = if (accent) PanelTokens.OnAccent else PanelTokens.Text,
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(if (accent) PanelTokens.AccentAlt else PanelTokens.Highlight)
            .padding(horizontal = PanelTokens.GapSm, vertical = 2.dp),
    )
}

@Composable
private fun CircleButton(
    label: String,
    primary: Boolean = false,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(if (primary) 42.dp else 34.dp)
            .clip(CircleShape)
            .background(if (primary) PanelTokens.Accent else PanelTokens.SurfaceRaised)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            fontSize = if (primary) PanelTokens.Heading else PanelTokens.Meta,
            color = if (primary) PanelTokens.OnAccent else PanelTokens.Text,
        )
    }
}
