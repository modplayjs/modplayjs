package com.bitti06.modplayjs.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.audiofx.AudioEffect
import android.provider.Settings
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bitti06.modplayjs.R
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.engine.AndroidSnapshot
import com.bitti06.modplayjs.engine.PlayError
import com.bitti06.modplayjs.ui.icons.AppIcons

@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun PlayerScreen(
    vm: AppViewModel,
    snapshot: AndroidSnapshot?,
    settings: AndroidSettings,
    loading: String?,
    error: PlayError?,
    onOpenDetails: () -> Unit,
    onOpenQueue: () -> Unit,
    onBrowseLibrary: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val current by vm.nowPlaying.collectAsStateWithLifecycle()
    val errorText = error?.let { stringResource(R.string.player_error, it.track, it.reason) }
    val snap = snapshot
    val track = snap?.track
    var channelDialog by remember { mutableStateOf(false) }

    val accent = track?.let { accentColor(it.format) } ?: MaterialTheme.colorScheme.primary
    Box(
        Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    0f to lerp(MaterialTheme.colorScheme.background, accent, 0.36f),
                    0.45f to MaterialTheme.colorScheme.background,
                    1f to lerp(MaterialTheme.colorScheme.background, accent, 0.12f),
                ),
            ),
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .safeContentPadding()
                .padding(horizontal = 16.dp),
        ) {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.player_now_playing),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                )
                // A delegated property cannot be smart cast; read it once.
                val favoriteTrack = current
                if (favoriteTrack != null) {
                    val favorite = favoriteTrack.favoriteAt != null
                    IconButton(onClick = { vm.toggleFavorite(favoriteTrack) }) {
                        Icon(
                            if (favorite) AppIcons.Favorite else AppIcons.FavoriteBorder,
                            contentDescription =
                                stringResource(
                                    if (favorite) R.string.cd_remove_favorite else R.string.cd_add_favorite,
                                ),
                            tint =
                                if (favorite) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                        )
                    }
                }
                IconButton(onClick = onOpenSettings) {
                    Icon(AppIcons.Settings, contentDescription = stringResource(R.string.common_settings))
                }
            }
            if (errorText != null) {
                Text(
                    errorText,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
                )
            }
            if (snap == null || track == null) {
                // Centred in the whole free area rather than stuck under the
                // header, with a large format-tinted tile as the anchor.
                Box(
                    Modifier.weight(1f).fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            Modifier
                                .size(108.dp)
                                .clip(RoundedCornerShape(36.dp))
                                .background(lerp(MaterialTheme.colorScheme.surface, accent, 0.28f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                AppIcons.MusicNote,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.size(48.dp),
                            )
                        }
                        Spacer(Modifier.height(20.dp))
                        if (loading != null) {
                            LoadingIndicator(
                                modifier = Modifier.size(44.dp),
                                color = MaterialTheme.colorScheme.primary,
                            )
                            Spacer(Modifier.height(12.dp))
                        }
                        Text(
                            text = when {
                                error != null -> stringResource(R.string.player_failed)
                                loading != null -> stringResource(R.string.player_loading, loading)
                                else -> stringResource(R.string.player_no_track)
                            },
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.onSurface,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text =
                                stringResource(
                                    if (error != null) R.string.player_error_body else R.string.player_empty_body,
                                ),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(0.85f),
                        )
                        Spacer(Modifier.height(22.dp))
                        FilledTonalButton(onClick = onBrowseLibrary, shape = CircleShape) {
                            Icon(AppIcons.LibraryMusic, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(stringResource(R.string.common_browse_library))
                        }
                    }
                }
                return
            }

            val message = track.message?.takeIf { it.isNotBlank() }
            val instruments = track.instrumentList
            val samples = track.sampleList

            // Message/instruments/samples each scroll on their own.
            val infoBoxes: @Composable (Modifier) -> Unit = { modifier ->
                Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (message == null && instruments.isEmpty() && samples.isEmpty()) {
                        InfoBox(stringResource(R.string.info_track), Modifier.weight(1f), accent) {
                            Text(
                                stringResource(
                                    R.string.player_track_summary,
                                    track.format.uppercase(),
                                    track.channels,
                                    track.tracker,
                                ),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    } else {
                        if (message != null) {
                            InfoBox(
                                stringResource(R.string.info_message),
                                Modifier.weight(1f),
                                MaterialTheme.colorScheme.tertiary,
                            ) {
                                // Module messages are fixed-width ASCII: the
                                // web player renders them in a monospaced,
                                // centred <pre> and the creator's columns only
                                // line up the same way here.
                                Text(
                                    message.replace("\r", ""),
                                    style = MaterialTheme.typography.bodySmall,
                                    fontFamily = FontFamily.Monospace,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                        if (instruments.isNotEmpty()) {
                            InfoBox(
                                stringResource(R.string.info_instruments),
                                Modifier.weight(1f),
                                MaterialTheme.colorScheme.primary,
                            ) {
                                instruments.forEach { instrument ->
                                    Text(
                                        instrumentLine(instrument.index + 1, instrument.name),
                                        style = MaterialTheme.typography.bodySmall,
                                        fontFamily = FontFamily.Monospace,
                                    )
                                }
                            }
                        }
                        if (samples.isNotEmpty()) {
                            InfoBox(
                                stringResource(R.string.info_samples),
                                Modifier.weight(1f),
                                MaterialTheme.colorScheme.secondary,
                            ) {
                                samples.forEach { sample ->
                                    // The slot number always stays, so an empty
                                    // slot never collapses the row.
                                    Text(
                                        sampleLine(
                                            sample.index + 1,
                                            sample.name,
                                            sample.length,
                                            sample.loop,
                                            settings.view.sampleLengths,
                                            settings.view.sampleLoopFlags,
                                        ),
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
                        FormatArt(track.format, 52.dp)
                        Spacer(Modifier.width(12.dp))
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
                    // The slider thumb stands taller than its track, so it needs
                    // its own gap instead of hugging the tile above it.
                    Spacer(Modifier.height(8.dp))
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
                    // Queue, details and stop share the transport row; three
                    // labelled buttons underneath ate a whole row for two
                    // secondary actions. SpaceEvenly keeps the touch targets
                    // apart on narrow windows instead of overlapping them.
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconButton(onClick = onOpenQueue) {
                            Icon(
                                AppIcons.PlaylistPlay,
                                contentDescription = stringResource(R.string.player_queue),
                            )
                        }
                        IconButton(onClick = { vm.previous() }) {
                            Icon(
                                AppIcons.SkipPrevious,
                                contentDescription = stringResource(R.string.cd_previous),
                            )
                        }
                        Box(contentAlignment = Alignment.Center) {
                            CircularWavyProgressIndicator(
                                progress = { fraction },
                                modifier = Modifier.size(88.dp),
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
                                    contentDescription = stringResource(R.string.common_play_pause),
                                    modifier = Modifier.size(36.dp),
                                )
                            }
                        }
                        IconButton(onClick = { vm.next() }) {
                            Icon(AppIcons.SkipNext, contentDescription = stringResource(R.string.cd_next))
                        }
                        IconButton(onClick = { vm.stop() }) {
                            Icon(AppIcons.Stop, contentDescription = stringResource(R.string.cd_stop))
                        }
                        IconButton(onClick = onOpenDetails) {
                            Icon(
                                AppIcons.Info,
                                contentDescription = stringResource(R.string.player_details),
                            )
                        }
                    }
                    val muted = snap.channels.count { it.muted }
                    if (snap.capabilities.channelMute && settings.view.showChannelStrip && snap.channels.isNotEmpty()) {
                        Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            SectionTitle(stringResource(R.string.player_channels), accent)
                            Spacer(Modifier.width(8.dp))
                            Text(
                                stringResource(R.string.player_channels_count, snap.channels.size, muted),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.weight(1f))
                            TextButton(onClick = { channelDialog = true }) {
                                Text(stringResource(R.string.player_expand))
                            }
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
                // A fixed 380 dp column left the info panes ~50 dp wide on a
                // 480 dp window; scale it with the window instead.
                val transportWidth = (maxWidth * 0.55f).coerceIn(240.dp, 380.dp)
                if (wide) {
                    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        infoBoxes(Modifier.weight(1f).fillMaxHeight())
                        transport(
                            Modifier
                                .width(transportWidth)
                                .fillMaxHeight()
                                .verticalScroll(rememberScrollState()),
                        )
                    }
                } else if (maxHeight < 520.dp) {
                    // Split screen or a very short window: the transport alone
                    // can exceed the height, so the pair scrolls instead of the
                    // info boxes collapsing to nothing.
                    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                        infoBoxes(Modifier.heightIn(max = 240.dp).fillMaxWidth())
                        Spacer(Modifier.height(10.dp))
                        transport(Modifier.fillMaxWidth())
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
        title = { Text(stringResource(R.string.effects_missing_title)) },
        text = { Text(stringResource(R.string.effects_missing_body)) },
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                runCatching { context.startActivity(Intent(Settings.ACTION_SOUND_SETTINGS)) }
            }) { Text(stringResource(R.string.effects_sound_settings)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_close)) } },
    )
}

/**
 * Lists an instrument as the module shows it: unnamed slots keep their number
 * and print nothing else, instead of repeating "(unnamed)" down the list.
 */
@Composable
private fun instrumentLine(
    number: Int,
    name: String,
): String {
    val trimmed = name.trim()
    return if (trimmed.isEmpty()) "$number." else stringResource(R.string.list_numbered, number, trimmed)
}

/** Same for samples, where the length (and loop flag) still carries meaning. */
@Composable
private fun sampleLine(
    number: Int,
    name: String,
    length: Int,
    loop: Boolean,
    showLength: Boolean,
    showLoop: Boolean,
): String {
    val trimmed = name.trim()
    val looping = loop && showLoop
    return when {
        // An empty slot has neither a name nor audio; the length would only
        // print a meaningless "0" for every unused sample.
        trimmed.isEmpty() && length <= 0 -> "$number."
        trimmed.isEmpty() ->
            if (showLength) {
                stringResource(
                    if (looping) R.string.sample_line_unnamed_loop else R.string.sample_line_unnamed,
                    number,
                    length,
                )
            } else {
                "$number."
            }
        showLength ->
            stringResource(
                if (looping) R.string.sample_line_loop else R.string.sample_line,
                number,
                trimmed,
                length,
            )
        else ->
            stringResource(
                if (looping) R.string.sample_line_no_length_loop else R.string.sample_line_no_length,
                number,
                trimmed,
            )
    }
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
                    // Without fillMaxWidth the scrollable area only spans the
                    // widest text line, so a drag beside the text did nothing.
                    .fillMaxWidth()
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
        title = { Text(stringResource(R.string.player_channels)) },
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
                    TextButton(onClick = { vm.muteAll() }) { Text(stringResource(R.string.action_mute_all)) }
                    TextButton(onClick = { vm.unmuteAll() }) { Text(stringResource(R.string.action_unmute)) }
                    TextButton(onClick = { vm.resetChannels() }) { Text(stringResource(R.string.common_reset)) }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_done)) }
        },
    )
}

@Composable
fun DetailsScreen(
    snapshot: AndroidSnapshot?,
    vm: AppViewModel,
    settings: AndroidSettings,
    onBack: () -> Unit,
) {
    val snap = snapshot
    val track = snap?.track
    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        ModalTopBar(stringResource(R.string.details_title), onBack)
        if (snap == null || track == null) {
            EmptyState(
                stringResource(R.string.details_empty_title),
                stringResource(R.string.details_empty_body),
            )
            return
        }
        LazyColumn(Modifier.fillMaxSize()) {
            item { SectionTitle(stringResource(R.string.details_info)) }
            listOf(
                R.string.details_file to track.name,
                R.string.details_name to track.title,
                R.string.details_format to track.format.uppercase(),
                R.string.details_tracker to track.tracker,
                R.string.details_channels_label to track.channels.toString(),
                R.string.details_orders to track.orders.toString(),
                R.string.details_patterns to track.patterns.toString(),
                R.string.details_instruments to track.instruments.toString(),
                R.string.details_samples to track.samples.toString(),
                R.string.details_restart to track.restart.toString(),
            ).forEach { (label, value) -> item { InfoRow(stringResource(label), value) } }
            item { SectionTitle(stringResource(R.string.details_orders)) }
            item {
                Text(
                    // "position:pattern", the same pairing the web player lists.
                    track.orderList.withIndex().joinToString(" ") { (index, pattern) ->
                        index.toString().padStart(2, '0') + ":" + pattern.toString().padStart(2, '0')
                    },
                    fontFamily = FontFamily.Monospace,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            if (track.instrumentList.isNotEmpty()) {
                item { SectionTitle(stringResource(R.string.details_instruments)) }
                items(track.instrumentList, key = { "i${it.index}" }) { instrument ->
                    Text(
                        instrumentLine(instrument.index + 1, instrument.name),
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            if (track.sampleList.isNotEmpty()) {
                item { SectionTitle(stringResource(R.string.details_samples)) }
                items(track.sampleList, key = { "s${it.index}" }) { sample ->
                    Text(
                        sampleLine(
                            sample.index + 1,
                            sample.name,
                            sample.length,
                            sample.loop,
                            settings.view.sampleLengths,
                            settings.view.sampleLoopFlags,
                        ),
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            item { SectionTitle(stringResource(R.string.details_channels, snap.channels.size)) }
            if (snap.channels.none { it.canMute }) {
                item {
                    Text(
                        stringResource(R.string.details_mute_unavailable),
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
                    if (channel.solo) {
                        Text(stringResource(R.string.details_solo), color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
            item { SectionTitle(stringResource(R.string.details_message)) }
            item {
                Text(
                    track.message?.replace("\r", "") ?: stringResource(R.string.details_no_message),
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}
