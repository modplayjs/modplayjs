package com.bitti06.modplayjs.ui

import android.app.LocaleManager
import android.os.LocaleList
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.NavKey
import kotlin.math.roundToInt
import com.bitti06.modplayjs.BuildConfig
import com.bitti06.modplayjs.R
import com.bitti06.modplayjs.engine.AndroidCapabilities
import com.bitti06.modplayjs.engine.AndroidSnapshot
import com.bitti06.modplayjs.engine.OutputPlayState
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.engine.PatternColors
import com.bitti06.modplayjs.library.FolderEntity
import com.bitti06.modplayjs.library.ScanProgress
import com.bitti06.modplayjs.ui.icons.AppIcons

@Composable
private fun SettingsPage(
    title: String,
    onBack: () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        ModalTopBar(title, onBack)
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp),
            content = content,
        )
    }
}

@Composable
fun SettingsHub(
    onOpen: (NavKey) -> Unit,
    onBack: () -> Unit,
) {
    SettingsPage(stringResource(R.string.settings_title), onBack) {
        SettingsRow(stringResource(R.string.settings_playback)) { onOpen(PlaybackSettingsKey) }
        SettingsRow(stringResource(R.string.settings_audio)) { onOpen(AudioSettingsKey) }
        SettingsRow(stringResource(R.string.settings_mixer)) { onOpen(MixerSettingsKey) }
        SettingsRow(stringResource(R.string.settings_sid)) { onOpen(SidSettingsKey) }
        SettingsRow(stringResource(R.string.settings_appearance)) { onOpen(AppearanceSettingsKey) }
        SettingsRow(stringResource(R.string.settings_language)) { onOpen(LanguageKey) }
        SettingsRow(stringResource(R.string.settings_library)) { onOpen(LibrarySettingsKey) }
        SettingsRow(stringResource(R.string.settings_diagnostics)) { onOpen(DiagnosticsKey) }
        SettingsRow(stringResource(R.string.settings_about)) { onOpen(AboutKey) }
        SettingsRow(stringResource(R.string.settings_licenses)) { onOpen(LicensesKey) }
    }
}

@Composable
fun PlaybackSettingsScreen(
    actions: UiActions,
    settings: AndroidSettings,
    onBack: () -> Unit,
) {
    SettingsPage(stringResource(R.string.settings_playback), onBack) {
        ChoiceRow(
            stringResource(R.string.repeat_label),
            listOf(
                "off" to stringResource(R.string.repeat_off),
                "all" to stringResource(R.string.repeat_all),
                "one" to stringResource(R.string.repeat_one),
            ),
            settings.playback.repeat,
        ) { value -> actions.updateSettings { it.copy(playback = it.playback.copy(repeat = value)) } }
        SwitchRow(stringResource(R.string.shuffle), settings.playback.shuffle) { value ->
            actions.updateSettings { it.copy(playback = it.playback.copy(shuffle = value)) }
        }
        SwitchRow(stringResource(R.string.auto_advance), settings.playback.autoAdvance) { value ->
            actions.updateSettings { it.copy(playback = it.playback.copy(autoAdvance = value)) }
        }
        SwitchRow(stringResource(R.string.jam_mode), settings.playback.jamMode) { value ->
            actions.updateSettings { it.copy(playback = it.playback.copy(jamMode = value)) }
        }
    }
}

@Composable
fun AudioSettingsScreen(
    actions: UiActions,
    settings: AndroidSettings,
    capabilities: AndroidCapabilities?,
    onBack: () -> Unit,
) {
    SettingsPage(stringResource(R.string.settings_audio), onBack) {
        AudioSettingsContent(actions, settings, capabilities)
    }
}

/** The audio controls, shared by the Settings page and the player's audio panel. */
@Composable
fun AudioSettingsContent(
    actions: UiActions,
    settings: AndroidSettings,
    capabilities: AndroidCapabilities?,
) {
    val context = LocalContext.current
    var showEffectsDialog by remember { mutableStateOf(false) }
    val effectsAvailable = remember { hasSystemAudioEffects(context) }
    SliderRow(stringResource(R.string.volume), settings.transport.volume.toFloat(), 0f..100f) { value ->
        actions.updateSettings { it.copy(transport = it.transport.copy(volume = value.toInt())) }
    }
    SliderRow(
        stringResource(R.string.pan_separation),
        settings.transport.panSeparation.toFloat(),
        0f..100f,
        enabled = capabilities?.panSeparation != false,
    ) { value ->
        actions.updateSettings { it.copy(transport = it.transport.copy(panSeparation = value.toInt())) }
    }
    ChoiceRow(
        stringResource(R.string.interpolation),
        listOf(
            "0" to stringResource(R.string.interpolation_nearest),
            "1" to stringResource(R.string.interpolation_linear),
            "2" to stringResource(R.string.interpolation_spline),
        ),
        settings.transport.interpolation.toString(),
    ) { value ->
        actions.updateSettings { it.copy(transport = it.transport.copy(interpolation = value.toInt())) }
    }
    SliderRow(stringResource(R.string.voices), settings.transport.numVoices.toFloat(), 4f..64f) { value ->
        actions.updateSettings { it.copy(transport = it.transport.copy(numVoices = value.toInt())) }
    }
    SliderRow(stringResource(R.string.tempo_factor), settings.transport.tempoFactor.toFloat(), 0.25f..4f) { value ->
        actions.updateSettings { it.copy(transport = it.transport.copy(tempoFactor = value.toDouble())) }
    }
    SectionTitle(stringResource(R.string.output))
    InfoRow(stringResource(R.string.rate), stringResource(R.string.rate_value, actions.sampleRate))
    InfoRow(stringResource(R.string.session), actions.audioSessionId.toString())
    Text(
        stringResource(R.string.audio_output_note),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    SettingsRow(
        stringResource(R.string.audio_effects),
        stringResource(
            if (effectsAvailable) R.string.audio_effects_summary else R.string.audio_effects_unavailable,
        ),
    ) {
        if (!openSystemAudioEffects(context, actions.audioSessionId)) {
            showEffectsDialog = true
        }
    }
    if (showEffectsDialog) {
        SystemEffectsUnavailableDialog { showEffectsDialog = false }
    }
}

@Composable
fun MixerSettingsScreen(
    actions: UiActions,
    settings: AndroidSettings,
    capabilities: AndroidCapabilities?,
    onBack: () -> Unit,
) {
    SettingsPage(stringResource(R.string.settings_mixer), onBack) {
        MixerSettingsContent(actions, settings, capabilities)
    }
}

/** The mixer controls, shared by the Settings page and the player's audio panel. */
@Composable
fun MixerSettingsContent(
    actions: UiActions,
    settings: AndroidSettings,
    capabilities: AndroidCapabilities?,
) {
    Text(
        stringResource(R.string.mixer_note),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    ChoiceRow(
        stringResource(R.string.mixer_mode),
        listOf("libxmp" to "libxmp", "paula" to "Paula"),
        settings.mixer.mode,
        enabled = capabilities?.mixerMode != false,
    ) { value -> actions.updateSettings { it.copy(mixer = it.mixer.copy(mode = value)) } }
    ChoiceRow(
        stringResource(R.string.mixer_layout),
        listOf(
            "panned" to stringResource(R.string.layout_module_pan),
            "lrlr" to "L R L R",
            "lrrl" to "L R R L",
        ),
        settings.mixer.layout,
        enabled = capabilities?.mixer != false,
    ) { value -> actions.updateSettings { it.copy(mixer = it.mixer.copy(layout = value)) } }
    ChoiceRow(
        stringResource(R.string.a500_filter),
        listOf(
            "a500" to stringResource(R.string.a500_off),
            "a500led" to stringResource(R.string.a500_on),
        ),
        settings.mixer.amigaFilter,
        enabled = capabilities?.amigaFilter != false,
    ) { value -> actions.updateSettings { it.copy(mixer = it.mixer.copy(amigaFilter = value)) } }
}

@Composable
fun SidSettingsScreen(
    actions: UiActions,
    settings: AndroidSettings,
    onBack: () -> Unit,
) {
    SettingsPage(stringResource(R.string.settings_sid), onBack) {
        Text(
            stringResource(R.string.sid_note),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        ChoiceRow(
            stringResource(R.string.sid_chip),
            listOf("0" to stringResource(R.string.common_header), "6581" to "6581", "8580" to "8580"),
            settings.sid.model.toString(),
        ) { value -> actions.updateSettings { it.copy(sid = it.sid.copy(model = value.toInt())) } }
        ChoiceRow(
            stringResource(R.string.sid_video),
            listOf(
                "null" to stringResource(R.string.common_header),
                "0" to stringResource(R.string.sid_ntsc),
                "1" to stringResource(R.string.sid_pal),
            ),
            settings.sid.videoStandard?.toString() ?: "null",
        ) { value ->
            actions.updateSettings {
                it.copy(sid = it.sid.copy(videoStandard = if (value == "null") null else value.toInt()))
            }
        }
        ChoiceRow(
            stringResource(R.string.sid_quality),
            listOf(
                "light" to stringResource(R.string.quality_light),
                "hq" to stringResource(R.string.quality_hq),
                "sinc" to stringResource(R.string.quality_sinc),
            ),
            settings.sid.quality,
        ) { value -> actions.updateSettings { it.copy(sid = it.sid.copy(quality = value)) } }
        ChoiceRow(
            stringResource(R.string.sid_channels),
            listOf(
                "0" to stringResource(R.string.sid_mono),
                "1" to stringResource(R.string.sid_stereo),
                "3" to stringResource(R.string.sid_narrow),
            ),
            settings.sid.stereo.toString(),
        ) { value -> actions.updateSettings { it.copy(sid = it.sid.copy(stereo = value.toInt())) } }
        SliderRow(stringResource(R.string.sid_engine_volume), settings.sid.volume.toFloat(), 0f..255f) { value ->
            actions.updateSettings { it.copy(sid = it.sid.copy(volume = value.toInt())) }
        }
    }
}

@Composable
fun AppearanceSettingsScreen(
    actions: UiActions,
    settings: AndroidSettings,
    onOpenPatternColors: () -> Unit,
    onBack: () -> Unit,
) {
    SettingsPage(stringResource(R.string.settings_appearance), onBack) {
        ChoiceRow(
            stringResource(R.string.theme),
            listOf(
                "dark" to stringResource(R.string.theme_dark),
                "light" to stringResource(R.string.theme_light),
            ),
            settings.view.theme,
        ) { value ->
            actions.updateSettings { it.copy(view = it.view.copy(theme = value)) }
        }
        SwitchRow(stringResource(R.string.strip_dots), settings.view.stripDots) { value ->
            actions.updateSettings { it.copy(view = it.view.copy(stripDots = value)) }
        }
        SwitchRow(stringResource(R.string.reduced_motion), settings.view.reducedMotion) { value ->
            actions.updateSettings { it.copy(view = it.view.copy(reducedMotion = value)) }
        }
        SwitchRow(stringResource(R.string.show_channel_strip), settings.view.showChannelStrip) { value ->
            actions.updateSettings { it.copy(view = it.view.copy(showChannelStrip = value)) }
        }
        SwitchRow(stringResource(R.string.sample_lengths), settings.view.sampleLengths) { value ->
            actions.updateSettings { it.copy(view = it.view.copy(sampleLengths = value)) }
        }
        SwitchRow(stringResource(R.string.loop_marker), settings.view.sampleLoopFlags) { value ->
            actions.updateSettings { it.copy(view = it.view.copy(sampleLoopFlags = value)) }
        }
        SettingsRow(stringResource(R.string.pattern_colors_title)) { onOpenPatternColors() }
    }
}

/** Which field of a pattern cell is being coloured. */
private enum class PatternField(
    val label: Int,
) {
    Note(R.string.pattern_color_note),
    Instrument(R.string.pattern_color_instrument),
    Volume(R.string.pattern_color_volume),
    Effect(R.string.pattern_color_effect),
}

/**
 * Colours for the four fields of a pattern cell. A field left alone follows the
 * theme, which is why "reset" clears the values instead of restoring hex codes:
 * the grid then adapts to light and dark like everything else.
 */
@Composable
fun PatternColorsScreen(
    actions: UiActions,
    settings: AndroidSettings,
    onBack: () -> Unit,
) {
    val colors = settings.view.patternColors
    var editing by remember { mutableStateOf<PatternField?>(null) }
    SettingsPage(stringResource(R.string.pattern_colors_title), onBack) {
        Text(
            stringResource(R.string.pattern_colors_body),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        PatternField.entries.forEach { field ->
            SettingsRow(stringResource(field.label), colorSummary(field.pick(colors))) {
                editing = field
            }
        }
        SettingsRow(
            stringResource(R.string.pattern_colors_reset),
            stringResource(R.string.pattern_colors_reset_summary),
        ) {
            actions.updateSettings { it.copy(view = it.view.copy(patternColors = PatternColors())) }
        }
    }
    val field = editing
    if (field != null) {
        ColorSwatchDialog(
            title = stringResource(field.label),
            selected = field.pick(colors),
            onPick = { argb ->
                actions.updateSettings { it.copy(view = it.view.copy(patternColors = field.replace(colors, argb))) }
                editing = null
            },
            onDismiss = { editing = null },
        )
    }
}

private fun PatternField.pick(colors: PatternColors): Int? =
    when (this) {
        PatternField.Note -> colors.note
        PatternField.Instrument -> colors.instrument
        PatternField.Volume -> colors.volume
        PatternField.Effect -> colors.effect
    }

private fun PatternField.replace(
    colors: PatternColors,
    argb: Int?,
): PatternColors =
    when (this) {
        PatternField.Note -> colors.copy(note = argb)
        PatternField.Instrument -> colors.copy(instrument = argb)
        PatternField.Volume -> colors.copy(volume = argb)
        PatternField.Effect -> colors.copy(effect = argb)
    }

@Composable
private fun colorSummary(argb: Int?): String =
    if (argb == null) {
        stringResource(R.string.pattern_color_default)
    } else {
        String.format(java.util.Locale.ROOT, "#%06X", argb and 0xFFFFFF)
    }

/** A palette to pick from; "theme colour" is the first, unset option. */
@Composable
private fun ColorSwatchDialog(
    title: String,
    selected: Int?,
    onPick: (Int?) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                TextButton(onClick = { onPick(null) }) {
                    Text(stringResource(R.string.pattern_color_default))
                }
                Spacer(Modifier.height(8.dp))
                LazyVerticalGrid(GridCells.Fixed(6), modifier = Modifier.height(160.dp)) {
                    gridItems(PATTERN_SWATCHES) { argb ->
                        Box(
                            Modifier
                                .padding(3.dp)
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(Color(argb))
                                .then(
                                    if (argb == selected) {
                                        Modifier.border(2.dp, MaterialTheme.colorScheme.primary, CircleShape)
                                    } else {
                                        Modifier
                                    },
                                ).clickable { onPick(argb) },
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_close)) }
        },
    )
}

private val PATTERN_SWATCHES: List<Int> =
    listOf(
        0xFFFFFFFF, 0xFFF1EDFB, 0xFFB9B0D4, 0xFF9E9E9E,
        0xFFB49BFF, 0xFF8EA2FF, 0xFF64B5F6, 0xFF4DD0E1,
        0xFF5FE3C0, 0xFF7BD88F, 0xFFFFD166, 0xFFFFB74D,
        0xFFFF9BC2, 0xFFE57373, 0xFFBA68C8, 0xFF6B7FA8,
    ).map { it.toInt() }

@Composable
fun LibrarySettingsScreen(
    actions: UiActions,
    folders: List<FolderEntity>,
    ignoredCount: Int,
    scanProgress: ScanProgress?,
    onAddFolder: () -> Unit,
    onOpenIgnored: () -> Unit,
    onBack: () -> Unit,
) {
    SettingsPage(stringResource(R.string.settings_library), onBack) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onAddFolder, modifier = Modifier.weight(1f)) {
                Icon(AppIcons.Add, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.common_add_folder))
            }
            OutlinedButton(onClick = { actions.rescan() }) {
                Icon(AppIcons.Refresh, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.common_rescan))
            }
        }
        scanProgress?.let { ScanBanner(it) }
        SettingsRow(
            stringResource(R.string.ignored_files),
            pluralStringResource(R.plurals.ignored_summary, ignoredCount, ignoredCount),
            onOpenIgnored,
        )
        SectionTitle(stringResource(R.string.indexed_folders))
        if (folders.isEmpty()) {
            Text(
                stringResource(R.string.no_folders_yet),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        folders.forEach { folder ->
            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(folder.name, color = MaterialTheme.colorScheme.onSurface)
                        Text(
                            pluralStringResource(
                                R.plurals.folder_summary,
                                folder.fileCount,
                                folder.fileCount,
                                if (folder.status == "ok") {
                                    stringResource(R.string.folder_status_ok)
                                } else {
                                    folder.status
                                },
                                stringResource(
                                    if (folder.canWrite) R.string.folder_read_write else R.string.folder_read_only,
                                ),
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (folder.status == "ok") MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error,
                        )
                        if (folder.error != null) {
                            Text(folder.error, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                        }
                    }
                    IconButton(onClick = { actions.rescan(folder.id) }) {
                        Icon(
                            AppIcons.Refresh,
                            contentDescription = stringResource(R.string.cd_rescan_folder, folder.name),
                        )
                    }
                    IconButton(onClick = { actions.removeFolder(folder) }) {
                        Icon(
                            AppIcons.Delete,
                            contentDescription = stringResource(R.string.cd_remove_folder, folder.name),
                            tint = MaterialTheme.colorScheme.error,
                        )
                    }
                }
                HorizontalDivider()
            }
        }
    }
}

@Composable
fun DiagnosticsScreen(
    snapshot: AndroidSnapshot?,
    actions: UiActions,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val effectsPanel = remember { hasSystemAudioEffects(context) }
    val audio = actions.audioInfo
    val bufferMs =
        if (audio.sampleRate > 0 && audio.bufferFrames > 0) {
            (audio.bufferFrames * 1000.0 / audio.sampleRate).roundToInt()
        } else {
            0
        }
    SettingsPage(stringResource(R.string.settings_diagnostics), onBack) {
        SectionTitle(stringResource(R.string.engine))
        InfoRow(
            "V8",
            stringResource(if (actions.v8Available) R.string.v8_available else R.string.v8_stub),
        )
        // The signature the library was scanned with; a change triggers a
        // rescan on the next start.
        InfoRow(
            stringResource(R.string.diag_engine_version),
            snapshot?.engineVersion?.takeIf { it.isNotBlank() } ?: "—",
        )
        val v8Error = actions.v8Error
        if (!actions.v8Available && v8Error != null) {
            Text(v8Error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        InfoRow(stringResource(R.string.output_rate), "${actions.sampleRate} Hz")
        InfoRow(stringResource(R.string.audio_session), actions.audioSessionId.toString())
        InfoRow(stringResource(R.string.underruns), actions.underruns.toString())

        // What the samples actually travel through, from the engine's float32
        // ring to the AudioTrack the platform mixes.
        SectionTitle(stringResource(R.string.diag_audio))
        InfoRow(stringResource(R.string.diag_output_api), stringResource(R.string.diag_output_api_value))
        InfoRow(
            stringResource(R.string.diag_performance),
            stringResource(
                if (audio.lowLatencyRequested) {
                    R.string.diag_performance_low_latency
                } else {
                    R.string.diag_performance_default
                },
            ),
        )
        InfoRow(stringResource(R.string.diag_channels), stringResource(R.string.diag_channels_stereo))
        InfoRow(
            stringResource(R.string.diag_buffer),
            stringResource(R.string.diag_buffer_value, audio.bufferFrames, bufferMs),
        )
        InfoRow(
            stringResource(R.string.diag_buffer_minimum),
            stringResource(R.string.diag_frames, audio.minBufferFrames),
        )
        audio.writtenFrames?.let { frames ->
            InfoRow(stringResource(R.string.diag_written_frames), frames.toString())
        }
        InfoRow(
            stringResource(R.string.diag_play_state),
            stringResource(
                when (audio.playState) {
                    OutputPlayState.PLAYING -> R.string.play_state_playing
                    OutputPlayState.PAUSED -> R.string.play_state_paused
                    OutputPlayState.STOPPED -> R.string.play_state_stopped
                },
            ),
        )

        SectionTitle(stringResource(R.string.diag_device))
        InfoRow(stringResource(R.string.diag_frames_per_buffer), audio.deviceFramesPerBuffer.toString())
        InfoRow(
            stringResource(R.string.diag_effects_panel),
            stringResource(
                if (effectsPanel) R.string.diag_effects_yes else R.string.diag_effects_no,
            ),
        )

        SectionTitle(stringResource(R.string.diag_capabilities))
        val capabilities = snapshot?.capabilities
        if (capabilities == null) {
            Text(
                stringResource(R.string.diag_caps_none),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text(
                capabilitySummary(capabilities),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }

        SectionTitle(stringResource(R.string.build))
        InfoRow(
            stringResource(R.string.version),
            "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
        )
        InfoRow(stringResource(R.string.commit), BuildConfig.GIT_COMMIT)
        InfoRow(stringResource(R.string.variant), BuildConfig.BUILD_TYPE)
    }
}

/** Capabilities the engine reports for the loaded track, as a readable list. */
@Composable
private fun capabilitySummary(capabilities: AndroidCapabilities): String {
    val flags =
        listOf(
            capabilities.seekable to R.string.cap_seekable,
            capabilities.channelMute to R.string.cap_channel_mute,
            capabilities.mixer to R.string.cap_mixer,
            capabilities.mixerMode to R.string.cap_mixer_mode,
            capabilities.amigaFilter to R.string.cap_amiga_filter,
            capabilities.panSeparation to R.string.cap_pan_separation,
            capabilities.sid to R.string.cap_sid,
            capabilities.sidPanel to R.string.cap_sid_panel,
            capabilities.sidStereo to R.string.cap_sid_stereo,
            capabilities.patternView to R.string.cap_pattern_view,
            capabilities.endless to R.string.cap_endless,
            capabilities.streamed to R.string.cap_streamed,
            capabilities.audition to R.string.cap_audition,
        )
    val enabled = flags.filter { it.first }.map { stringResource(it.second) }
    return if (enabled.isEmpty()) {
        stringResource(R.string.diag_caps_empty)
    } else {
        enabled.joinToString(" · ")
    }
}

@Composable
fun LanguageSettingsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val manager = remember { context.getSystemService(LocaleManager::class.java) }
    var selected by remember { mutableStateOf(manager?.applicationLocales?.toLanguageTags().orEmpty()) }
    SettingsPage(stringResource(R.string.language_title), onBack) {
        Text(
            stringResource(R.string.language_body),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        LanguageRow(
            title = stringResource(R.string.common_system_default),
            summary = stringResource(R.string.language_system_summary),
            selected = selected.isEmpty(),
        ) {
            selected = ""
            setAppLocale(context, "")
        }
        SupportedLocales.forEach { tag ->
            val locale = java.util.Locale.forLanguageTag(tag)
            LanguageRow(
                title = locale.getDisplayName(locale).replaceFirstChar { it.uppercase(locale) },
                summary = tag,
                selected = selected == tag,
            ) {
                selected = tag
                setAppLocale(context, tag)
            }
        }
    }
}

@Composable
private fun LanguageRow(
    title: String,
    summary: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface)
            Text(
                summary,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        RadioButton(selected = selected, onClick = onClick)
    }
}

/** Applies a per-app locale; an empty tag means "follow the system". */
private fun setAppLocale(
    context: android.content.Context,
    tag: String,
) {
    // Null in the preview host, which has no locale manager.
    val manager = context.getSystemService(LocaleManager::class.java) ?: return
    manager.applicationLocales =
        if (tag.isEmpty()) {
            LocaleList.getEmptyLocaleList()
        } else {
            LocaleList.forLanguageTags(tag)
        }
}

@Preview(name = "Settings", showBackground = true, backgroundColor = 0xFF0C0A18)
@Composable
private fun SettingsHubPreview() {
    PreviewFrame { SettingsHub(onOpen = {}, onBack = {}) }
}

@Preview(name = "Settings playback", showBackground = true, backgroundColor = 0xFF0C0A18)
@Composable
private fun PlaybackSettingsPreview() {
    PreviewFrame { PlaybackSettingsScreen(PreviewActions, previewSettings(), onBack = {}) }
}

@Preview(name = "Settings audio", showBackground = true, backgroundColor = 0xFF0C0A18)
@Composable
private fun AudioSettingsPreview() {
    PreviewFrame {
        AudioSettingsScreen(PreviewActions, previewSettings(), previewSnapshot().capabilities, onBack = {})
    }
}

@Preview(name = "Settings mixer", showBackground = true, backgroundColor = 0xFF0C0A18)
@Composable
private fun MixerSettingsPreview() {
    PreviewFrame {
        MixerSettingsScreen(PreviewActions, previewSettings(), previewSnapshot().capabilities, onBack = {})
    }
}

@Preview(name = "Settings sid", showBackground = true, backgroundColor = 0xFF0C0A18)
@Composable
private fun SidSettingsPreview() {
    PreviewFrame { SidSettingsScreen(PreviewActions, previewSettings(), onBack = {}) }
}

@Preview(name = "Settings appearance", showBackground = true, backgroundColor = 0xFF0C0A18)
@Composable
private fun AppearanceSettingsPreview() {
    PreviewFrame {
        AppearanceSettingsScreen(
            actions = PreviewActions,
            settings = previewSettings(),
            onOpenPatternColors = {},
            onBack = {},
        )
    }
}

@Preview(name = "Settings library", showBackground = true, backgroundColor = 0xFF0C0A18)
@Composable
private fun LibrarySettingsPreview() {
    PreviewFrame {
        LibrarySettingsScreen(
            actions = PreviewActions,
            folders = previewFolders(),
            ignoredCount = 2,
            scanProgress = ScanProgress("Modules", 1, 2, 640, 1280),
            onAddFolder = {},
            onOpenIgnored = {},
            onBack = {},
        )
    }
}

@Preview(name = "Pattern colours", showBackground = true, backgroundColor = 0xFF0C0A18)
@Composable
private fun PatternColorsPreview() {
    PreviewFrame {
        PatternColorsScreen(PreviewActions, previewSettings(), onBack = {})
    }
}

@Preview(name = "Settings language", showBackground = true, backgroundColor = 0xFF0C0A18)
@Composable
private fun LanguageSettingsPreview() {
    PreviewFrame { LanguageSettingsScreen(onBack = {}) }
}

@Preview(name = "Diagnostics", showBackground = true, backgroundColor = 0xFF0C0A18, heightDp = 1400)
@Composable
private fun DiagnosticsPreview() {
    PreviewFrame { DiagnosticsScreen(previewSnapshot(), PreviewActions, onBack = {}) }
}
