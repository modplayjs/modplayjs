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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.unit.sp
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.XrApp
import com.bitti06.modplayjs.xr.play.XrPlayer

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun NowPlayingPanel() {
    val state by (XrApp.player?.state ?: kotlinx.coroutines.flow.MutableStateFlow(XrPlayer.State()))
        .collectAsState()
    val player = XrApp.player
    var volume by remember { mutableFloatStateOf((XrApp.player?.state?.value?.volume ?: 100).toFloat()) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        // Top Header
        Row(verticalAlignment = Alignment.CenterVertically) {
            Tag(if (state.format.isBlank()) "—" else state.format)
            Spacer(Modifier.width(6.dp))
            Tag(
                if (state.spatialEnabled) "SPATIAL · ${state.channels}" else "STEREO",
                accent = state.spatialEnabled,
            )
            Spacer(Modifier.weight(1f))
            Text(
                if (state.spatialEnabled) state.layout else "48 kHz",
                fontSize = 10.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.width(8.dp))
            // Gear icon button to open/toggle Settings panel
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceContainer)
                    .clickable { XrApp.toggleSettings() }
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("⚙", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface)
            }
        }

        Text(
            state.title.ifBlank { stringResource(R.string.xr_no_track) },
            fontSize = 19.sp,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
        )
        Text(
            if (state.loaded) {
                "${state.channels} ch · ${formatTime(state.positionMs)} / ${formatTime(state.durationMs)}"
            } else {
                stringResource(
                    R.string.xr_push_hint,
                    "Android/data/com.bitti06.modplayjs.xr/files/modules",
                )
            },
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )

        Waveform(active = state.playing)

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            CircleButton("■") { player?.stopPlayback() }
            CircleButton("|◀") { XrApp.playlist?.previous() }
            CircleButton(if (state.playing) "❚❚" else "▶", primary = true) { player?.togglePlay() }
            CircleButton("▶|") { XrApp.playlist?.next() }
            Text(
                "−10s",
                fontSize = 9.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.clickable { player?.seek((state.positionMs - 10_000L).coerceAtLeast(0L)) }
                    .padding(horizontal = 4.dp, vertical = 2.dp),
            )
            Text(
                "+10s",
                fontSize = 9.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.clickable { player?.seek(state.positionMs + 10_000) }
                    .padding(horizontal = 4.dp, vertical = 2.dp),
            )
        }

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(formatTime(state.positionMs), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            val progress =
                if (state.durationMs > 0) {
                    (state.positionMs.toFloat() / state.durationMs).coerceIn(0f, 1f)
                } else {
                    0f
                }
            Column(
                Modifier
                    .weight(1f)
                    .height(14.dp)
                    .pointerInput(state.durationMs) {
                        detectTapGestures { offset ->
                            if (state.durationMs > 0 && size.width > 0) {
                                val fraction = (offset.x / size.width).coerceIn(0f, 1f)
                                player?.seek((fraction * state.durationMs).toLong())
                            }
                        }
                    },
            ) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .height(5.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                ) {
                    Column(
                        Modifier
                            .fillMaxWidth(progress)
                            .height(5.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(
                                Brush.horizontalGradient(
                                    listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.secondary),
                                ),
                            ),
                    ) {}
                }
            }
            Text(formatTime(state.durationMs), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("🔊", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Slider(
                value = volume,
                onValueChange = {
                    volume = it
                    player?.setVolume(it.toInt())
                },
                valueRange = 0f..100f,
                colors = SliderDefaults.colors(
                    thumbColor = MaterialTheme.colorScheme.primary,
                    activeTrackColor = MaterialTheme.colorScheme.primary,
                    inactiveTrackColor = MaterialTheme.colorScheme.surfaceVariant,
                ),
                modifier = Modifier.weight(1f).height(24.dp),
            )
            Text(
                "${volume.toInt()}",
                fontSize = 9.sp,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.width(22.dp),
            )
        }

        if (state.channels in 1..16) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                for (i in 0 until state.channels) {
                    val muted = state.muted.contains(i)
                    Text(
                        (i + 1).toString().padStart(2, '0'),
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace,
                        color = when {
                            state.solo == i -> MaterialTheme.colorScheme.secondary
                            muted -> MaterialTheme.colorScheme.outline
                            state.spatialEnabled && i < state.azimuths.size -> MaterialTheme.colorScheme.tertiary
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainer)
                            .combinedClickable(
                                onClick = { player?.toggleMute(i) },
                                onLongClick = { player?.toggleSolo(i) },
                            )
                            .padding(horizontal = 5.dp, vertical = 2.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun Waveform(active: Boolean) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.Bottom,
        modifier = Modifier.height(26.dp),
    ) {
        repeat(16) { i ->
            val h = listOf(8, 16, 24, 12, 20, 7, 22, 11, 17, 6, 19, 13, 9, 15, 21, 10)[i]
            Column(
                Modifier
                    .width(4.dp)
                    .height(if (active) h.dp else (h / 3).dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(
                        if (i % 3 == 0) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.secondary,
                    ),
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
        fontSize = 9.sp,
        fontWeight = FontWeight.Bold,
        color = if (accent) MaterialTheme.colorScheme.onSecondaryContainer
        else MaterialTheme.colorScheme.onPrimaryContainer,
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(
                if (accent) MaterialTheme.colorScheme.secondaryContainer
                else MaterialTheme.colorScheme.primaryContainer,
            )
            .padding(horizontal = 6.dp, vertical = 3.dp),
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
            .size(if (primary) 38.dp else 32.dp)
            .clip(CircleShape)
            .background(
                if (primary) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.surfaceContainer,
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            fontSize = if (primary) 13.sp else 11.sp,
            color = if (primary) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
        )
    }
}
