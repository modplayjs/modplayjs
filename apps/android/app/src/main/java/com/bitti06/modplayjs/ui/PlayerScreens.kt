package com.bitti06.modplayjs.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.audiofx.AudioEffect
import android.provider.Settings
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Equalizer
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.automirrored.filled.PlaylistPlay
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.engine.AndroidSnapshot
import com.bitti06.modplayjs.engine.AndroidTrack

@Composable
fun PlayerScreen(
    vm: AppViewModel,
    snapshot: AndroidSnapshot?,
    settings: AndroidSettings,
    loading: String?,
    error: String?,
    onOpenDetails: () -> Unit,
    onOpenQueue: () -> Unit,
    onBrowseLibrary: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val context = LocalContext.current
    val snap = snapshot
    val track = snap?.track
    var channelDialog by remember { mutableStateOf(false) }
    var showEffectsDialog by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Now Playing", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            IconButton(onClick = onOpenSettings) { Icon(Icons.Default.Settings, contentDescription = "Settings") }
        }
        if (error != null) {
            Text(
                error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
            )
        }
        if (snap == null || track == null) {
            EmptyState(
                title = when {
                    error != null -> "Playback failed"
                    loading != null -> "Loading $loading"
                    else -> "No track loaded"
                },
                body = if (error != null) "Open the library and pick another file." else "Choose a module, SID tune or audio file to start.",
                actionLabel = "Browse library",
                onAction = onBrowseLibrary,
            )
            return
        }
        InfoPanel(track, Modifier.fillMaxWidth().height(250.dp))
        Spacer(Modifier.height(12.dp))
        Text(
            track.title.ifBlank { track.name },
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(track.tracker.ifBlank { track.format.uppercase() }, color = MaterialTheme.colorScheme.onSurfaceVariant)
        val duration = snap.state.durationMs
        val position = snap.state.positionMs
        var drag by remember(track.id) { mutableStateOf<Float?>(null) }
        Slider(
            value = drag ?: if (duration > 0) (position / duration).toFloat().coerceIn(0f, 1f) else 0f,
            onValueChange = { if (duration > 0) drag = it },
            onValueChangeFinished = {
                drag?.let { vm.seek((it * duration).toLong()) }
                drag = null
            },
            enabled = snap.capabilities.seekable,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(formatTime(drag?.let { (it * duration).toLong() } ?: position.toLong()))
            Text(if (duration > 0) formatTime(duration.toLong()) else "∞")
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { vm.previous() }) { Icon(Icons.Default.SkipPrevious, contentDescription = "Previous") }
            FilledIconButton(onClick = { vm.togglePlay() }, modifier = Modifier.size(64.dp)) {
                Icon(
                    if (snap.state.playing) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = "Play or pause",
                    modifier = Modifier.size(34.dp),
                )
            }
            IconButton(onClick = { vm.next() }) { Icon(Icons.Default.SkipNext, contentDescription = "Next") }
            IconButton(onClick = { vm.stop() }) { Icon(Icons.Default.Stop, contentDescription = "Stop") }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onOpenQueue, modifier = Modifier.weight(1f)) {
                Icon(Icons.AutoMirrored.Filled.PlaylistPlay, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("Queue")
            }
            OutlinedButton(onClick = onOpenDetails, modifier = Modifier.weight(1f)) { Text("Details") }
            OutlinedButton(
                onClick = {
                    if (!openSystemAudioEffects(context, vm.audioSessionId)) {
                        showEffectsDialog = true
                    }
                },
                modifier = Modifier.weight(1f),
            ) {
                Icon(Icons.Default.Equalizer, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("Effects")
            }
        }
        val muted = snap.channels.count { it.muted }
        if (snap.capabilities.channelMute && settings.view.showChannelStrip && snap.channels.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                SectionTitle("Channels")
                Spacer(Modifier.width(8.dp))
                Text(
                    "${snap.channels.size} · $muted muted",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { channelDialog = true }) { Text("Expand") }
            }
            ChannelStrip(snap, vm)
        }
    }
    if (channelDialog && snap != null) {
        ChannelDialog(snap, vm) { channelDialog = false }
    }
    if (showEffectsDialog) {
        SystemEffectsUnavailableDialog { showEffectsDialog = false }
    }
}

private fun systemEffectsIntent(
    context: Context,
    sessionId: Int,
): Intent =
    Intent(AudioEffect.ACTION_DISPLAY_AUDIO_EFFECT_CONTROL_PANEL).apply {
        putExtra(AudioEffect.EXTRA_AUDIO_SESSION, sessionId)
        putExtra(AudioEffect.EXTRA_PACKAGE_NAME, context.packageName)
        putExtra(AudioEffect.EXTRA_CONTENT_TYPE, AudioEffect.CONTENT_TYPE_MUSIC)
    }

/** True when the device ships Android's audio-effects panel (many Pixels do not). */
fun hasSystemAudioEffects(context: Context): Boolean =
    context.packageManager.resolveActivity(
        systemEffectsIntent(context, 0),
        PackageManager.MATCH_DEFAULT_ONLY,
    ) != null

/** Opens the platform audio-effects panel (system equalizer) for [sessionId]. */
fun openSystemAudioEffects(
    context: Context,
    sessionId: Int,
): Boolean {
    if (!hasSystemAudioEffects(context)) return false
    return try {
        context.startActivity(systemEffectsIntent(context, sessionId))
        true
    } catch (_: ActivityNotFoundException) {
        false
    } catch (_: SecurityException) {
        false
    }
}

/**
 * Fallback for devices without an audio-effects panel: say so and offer the
 * system sound settings instead of leaving the tap without feedback.
 */
@Composable
fun SystemEffectsUnavailableDialog(onDismiss: () -> Unit) {
    val context = LocalContext.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("No system effects panel") },
        text = {
            Text(
                "Android only provides the audio-effects panel when the device vendor ships one. " +
                    "This device does not, so there is no system equalizer to open. " +
                    "Use your headphones' or speaker's own EQ, or open the system sound settings.",
            )
        },
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                runCatching { context.startActivity(Intent(Settings.ACTION_SOUND_SETTINGS)) }
            }) { Text("Sound settings") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}

@Composable
private fun InfoPanel(
    track: AndroidTrack,
    modifier: Modifier = Modifier,
) {
    Surface(modifier = modifier, shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (!track.message.isNullOrBlank()) {
                Text("MESSAGE", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                Text(track.message.replace("\r", ""), style = MaterialTheme.typography.bodySmall)
            }
            if (track.instrumentList.isNotEmpty()) {
                Text("INSTRUMENTS", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                track.instrumentList.forEach { instrument ->
                    Text(
                        "${instrument.index + 1}. ${instrument.name.ifBlank { "(unnamed)" }}",
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }
            if (track.sampleList.isNotEmpty()) {
                Text("SAMPLES", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                track.sampleList.forEach { sample ->
                    Text(
                        "${sample.index + 1}. ${sample.name.ifBlank { "(unnamed)" }}  ${sample.length}${if (sample.loop) " L" else ""}",
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }
            if (track.message.isNullOrBlank() && track.instrumentList.isEmpty() && track.sampleList.isEmpty()) {
                Text(
                    "${track.format.uppercase()} · ${track.channels} channels · ${track.tracker}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ChannelStrip(
    snapshot: AndroidSnapshot,
    vm: AppViewModel,
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
    ) {
        items(snapshot.channels, key = { it.index }) { channel ->
            Surface(
                shape = RoundedCornerShape(8.dp),
                color =
                    when {
                        channel.solo -> MaterialTheme.colorScheme.primary
                        channel.muted -> MaterialTheme.colorScheme.surfaceVariant
                        else -> MaterialTheme.colorScheme.surface
                    },
                modifier =
                    Modifier.combinedClickable(
                        onClick = { vm.toggleChannel(channel.index) },
                        onLongClick = { vm.soloChannel(channel.index) },
                    ),
            ) {
                Text(
                    channel.label,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    color = if (channel.solo) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                    fontWeight = if (channel.muted) FontWeight.Normal else FontWeight.SemiBold,
                )
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ChannelDialog(
    snapshot: AndroidSnapshot,
    vm: AppViewModel,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Channels") },
        text = {
            Column {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(56.dp),
                    modifier = Modifier.height(280.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    gridItems(snapshot.channels, key = { it.index }) { channel ->
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = if (channel.muted) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.surface,
                            modifier =
                                Modifier.height(44.dp).combinedClickable(
                                    onClick = { vm.toggleChannel(channel.index) },
                                    onLongClick = { vm.soloChannel(channel.index) },
                                ),
                        ) {
                            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                                Text(channel.label, fontWeight = if (channel.muted) FontWeight.Normal else FontWeight.SemiBold)
                            }
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    TextButton(onClick = { vm.muteAll() }) { Text("Mute all") }
                    TextButton(onClick = { vm.unmuteAll() }) { Text("Unmute") }
                    TextButton(onClick = { vm.resetChannels() }) { Text("Reset") }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
    )
}

@Composable
fun DetailsScreen(
    snapshot: AndroidSnapshot?,
    vm: AppViewModel,
    onBack: () -> Unit,
) {
    val snap = snapshot
    val track = snap?.track
    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        ModalTopBar("Track details", onBack)
        if (snap == null || track == null) {
            EmptyState("No track loaded", "Play a module to inspect its orders, instruments and samples.")
            return
        }
        LazyColumn(Modifier.fillMaxSize()) {
            item { SectionTitle("Info") }
            listOf(
                "file" to track.name,
                "title" to track.title,
                "format" to track.format.uppercase(),
                "tracker" to track.tracker,
                "channels" to track.channels.toString(),
                "orders" to track.orders.toString(),
                "patterns" to track.patterns.toString(),
                "instruments" to track.instruments.toString(),
                "samples" to track.samples.toString(),
                "restart" to track.restart.toString(),
            ).forEach { (label, value) -> item { InfoRow(label, value) } }
            item { SectionTitle("Orders") }
            item {
                Text(
                    track.orderList.joinToString(" ") { it.toString().padStart(2, '0') },
                    fontFamily = FontFamily.Monospace,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (track.instrumentList.isNotEmpty()) {
                item { SectionTitle("Instruments") }
                items(track.instrumentList, key = { "i${it.index}" }) { instrument ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { vm.auditionInstrument(instrument.index) }) {
                            Icon(Icons.Default.PlayArrow, contentDescription = "Audition instrument")
                        }
                        Text(
                            "${instrument.index + 1}. ${instrument.name.ifBlank { "(unnamed)" }}",
                            fontFamily = FontFamily.Monospace,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
            if (track.sampleList.isNotEmpty()) {
                item { SectionTitle("Samples") }
                items(track.sampleList, key = { "s${it.index}" }) { sample ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { vm.auditionSample(sample.index) }) {
                            Icon(Icons.Default.PlayArrow, contentDescription = "Audition sample")
                        }
                        Text(
                            "${sample.index + 1}. ${sample.name.ifBlank { "(unnamed)" }}  ${sample.length}${if (sample.loop) " L" else ""}",
                            fontFamily = FontFamily.Monospace,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
            item { SectionTitle("Channels (${snap.channels.size})") }
            if (snap.channels.none { it.canMute }) {
                item {
                    Text(
                        "Channel mute is not available for this engine.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            items(snap.channels, key = { "c${it.index}" }) { channel ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(checked = !channel.muted, onCheckedChange = { vm.toggleChannel(channel.index) }, enabled = channel.canMute)
                    Text(" ${channel.label}", modifier = Modifier.weight(1f))
                    if (channel.solo) Text("SOLO", color = MaterialTheme.colorScheme.primary)
                }
            }
            item { SectionTitle("Message") }
            item { Text(track.message ?: "No module message.", style = MaterialTheme.typography.bodySmall) }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}
