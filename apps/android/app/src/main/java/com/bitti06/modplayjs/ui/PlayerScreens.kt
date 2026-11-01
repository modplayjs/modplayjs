package com.bitti06.modplayjs.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.audiofx.AudioEffect
import android.provider.Settings
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularWavyProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.rememberSliderState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.engine.AndroidSnapshot
import com.bitti06.modplayjs.ui.icons.AppIcons

@OptIn(ExperimentalMaterial3ExpressiveApi::class)
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

    val accent = track?.let { accentColor(it.format) } ?: MaterialTheme.colorScheme.primary
    Box(
        Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    0f to accent.copy(alpha = 0.34f),
                    0.42f to MaterialTheme.colorScheme.background,
                    1f to MaterialTheme.colorScheme.background,
                ),
            ),
    ) {
        Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Now Playing",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
                if (track != null) {
                    Spacer(Modifier.width(12.dp))
                    // Scrolls sideways when the name does not fit, like a player's
                    // top bar does.
                    Text(
                        track.title.ifBlank { track.name },
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        modifier = Modifier.weight(1f).basicMarquee(initialDelayMillis = 0),
                    )
                } else {
                    Spacer(Modifier.weight(1f))
                }
                IconButton(onClick = onOpenSettings) { Icon(AppIcons.Settings, contentDescription = "Settings") }
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
                if (loading != null) {
                    LoadingIndicator(
                        modifier = Modifier.size(44.dp).align(Alignment.CenterHorizontally),
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.height(8.dp))
                }
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

            val message = track.message?.takeIf { it.isNotBlank() }
            val instruments = track.instrumentList
            val samples = track.sampleList

            // Message/instruments/samples each scroll on their own.
            val infoBoxes: @Composable (Modifier) -> Unit = { modifier ->
                Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (message == null && instruments.isEmpty() && samples.isEmpty()) {
                        InfoBox("Track", Modifier.weight(1f), accent) {
                            Text(
                                "${track.format.uppercase()} · ${track.channels} channels · ${track.tracker}",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    } else {
                        if (message != null) {
                            InfoBox("Message", Modifier.weight(1f), MaterialTheme.colorScheme.tertiary) {
                                Text(message.replace("\r", ""), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        if (instruments.isNotEmpty()) {
                            InfoBox("Instruments", Modifier.weight(1f), MaterialTheme.colorScheme.primary) {
                                instruments.forEach { instrument ->
                                    Text(
                                        "${instrument.index + 1}. ${instrument.name.ifBlank { "(unnamed)" }}",
                                        style = MaterialTheme.typography.bodySmall,
                                        fontFamily = FontFamily.Monospace,
                                    )
                                }
                            }
                        }
                        if (samples.isNotEmpty()) {
                            InfoBox("Samples", Modifier.weight(1f), MaterialTheme.colorScheme.secondary) {
                                samples.forEach { sample ->
                                    Text(
                                        "${sample.index + 1}. ${sample.name.ifBlank { "(unnamed)" }}  ${sample.length}${if (sample.loop) " L" else ""}",
                                        style = MaterialTheme.typography.bodySmall,
                                        fontFamily = FontFamily.Monospace,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            val transport: @Composable (Modifier) -> Unit = { modifier ->
                Column(modifier) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        FormatArt(track.format, 62.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                track.title.ifBlank { track.name },
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.onSurface,
                                fontWeight = FontWeight.Bold,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                track.tracker.ifBlank { track.format.uppercase() },
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    val duration = snap.state.durationMs
                    val position = snap.state.positionMs
                    var drag by remember(track.id) { mutableStateOf<Float?>(null) }
                    val fraction =
                        drag ?: if (duration > 0) (position / duration).toFloat().coerceIn(0f, 1f) else 0f
                    val sliderState = rememberSliderState(value = fraction, trackRange = 0f..1f)
                    LaunchedEffect(fraction) { sliderState.value = fraction }
                    Slider(
                        state = sliderState,
                        onValueChange = { v ->
                            if (duration > 0) {
                                drag = v
                                sliderState.value = v
                            }
                        },
                        onValueChangeFinished = {
                            drag?.let { vm.seek((it * duration).toLong()) }
                            drag = null
                        },
                        enabled = snap.capabilities.seekable,
                        colors = SliderDefaults.colors(thumbColor = accent, activeTrackColor = accent),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(
                            formatTime(drag?.let { (it * duration).toLong() } ?: position.toLong()),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            if (duration > 0) formatTime(duration.toLong()) else "∞",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconButton(onClick = { vm.previous() }) { Icon(AppIcons.SkipPrevious, contentDescription = "Previous") }
                        Box(contentAlignment = Alignment.Center) {
                            CircularWavyProgressIndicator(
                                progress = { fraction },
                                modifier = Modifier.size(96.dp),
                                color = accent,
                                trackColor = MaterialTheme.colorScheme.surfaceVariant,
                            )
                            FilledIconButton(
                                onClick = { vm.togglePlay() },
                                modifier = Modifier.size(68.dp),
                                shape = CircleShape,
                            ) {
                                Icon(
                                    if (snap.state.playing) AppIcons.Pause else AppIcons.PlayArrow,
                                    contentDescription = "Play or pause",
                                    modifier = Modifier.size(36.dp),
                                )
                            }
                        }
                        IconButton(onClick = { vm.next() }) { Icon(AppIcons.SkipNext, contentDescription = "Next") }
                        IconButton(onClick = { vm.stop() }) { Icon(AppIcons.Stop, contentDescription = "Stop") }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilledTonalButton(onClick = onOpenQueue, modifier = Modifier.weight(1f), shape = CircleShape) {
                            Icon(AppIcons.PlaylistPlay, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Queue")
                        }
                        FilledTonalButton(onClick = onOpenDetails, modifier = Modifier.weight(1f), shape = CircleShape) {
                            Icon(AppIcons.Info, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Details")
                        }
                        FilledTonalButton(
                            onClick = {
                                if (!openSystemAudioEffects(context, vm.audioSessionId)) {
                                    showEffectsDialog = true
                                }
                            },
                            modifier = Modifier.weight(1f),
                            shape = CircleShape,
                        ) {
                            Icon(AppIcons.Equalizer, contentDescription = null, modifier = Modifier.size(18.dp))
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
            }

            // Portrait pins the transport above the tab bar; landscape puts the
            // info boxes beside it, since Android 17 ignores orientation locks
            // and this window can be short and wide.
            BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
                val wide = maxWidth > maxHeight && maxWidth >= 480.dp
                if (wide) {
                    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        infoBoxes(Modifier.weight(1f).fillMaxHeight())
                        transport(
                            Modifier
                                .width(380.dp)
                                .fillMaxHeight()
                                .verticalScroll(rememberScrollState()),
                        )
                    }
                } else {
                    Column(Modifier.fillMaxSize()) {
                        infoBoxes(Modifier.weight(1f).fillMaxWidth())
                        Spacer(Modifier.height(10.dp))
                        transport(Modifier.fillMaxWidth())
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
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

/** A titled, independently scrolling box used on the Now Playing screen. */
@Composable
private fun InfoBox(
    title: String,
    modifier: Modifier = Modifier,
    accent: Color = MaterialTheme.colorScheme.primary,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        color = lerp(MaterialTheme.colorScheme.surfaceContainer, accent, 0.18f),
    ) {
        Column(Modifier.fillMaxSize()) {
            Text(
                title.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = accent,
                modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 2.dp),
            )
            Column(
                Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(start = 12.dp, end = 12.dp, top = 2.dp, bottom = 10.dp),
            ) {
                CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onSurface) {
                    content()
                }
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
                                Text(
                                    channel.label,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    fontWeight = if (channel.muted) FontWeight.Normal else FontWeight.SemiBold,
                                )
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
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            if (track.instrumentList.isNotEmpty()) {
                item { SectionTitle("Instruments") }
                items(track.instrumentList, key = { "i${it.index}" }) { instrument ->
                    Text(
                        "${instrument.index + 1}. ${instrument.name.ifBlank { "(unnamed)" }}",
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            if (track.sampleList.isNotEmpty()) {
                item { SectionTitle("Samples") }
                items(track.sampleList, key = { "s${it.index}" }) { sample ->
                    Text(
                        "${sample.index + 1}. ${sample.name.ifBlank { "(unnamed)" }}  ${sample.length}${if (sample.loop) " L" else ""}",
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.bodySmall,
                    )
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
                    Text(
                        " ${channel.label}",
                        modifier = Modifier.weight(1f),
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    if (channel.solo) Text("SOLO", color = MaterialTheme.colorScheme.primary)
                }
            }
            item { SectionTitle("Message") }
            item {
                Text(
                    track.message ?: "No module message.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}
