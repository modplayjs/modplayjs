package com.bitti06.modplayjs.ui

import android.app.LocaleManager
import android.os.LocaleList
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.NavKey
import kotlin.math.roundToInt
import com.bitti06.modplayjs.BuildConfig
import com.bitti06.modplayjs.R
import com.bitti06.modplayjs.engine.AndroidCapabilities
import com.bitti06.modplayjs.engine.AndroidSnapshot
import com.bitti06.modplayjs.engine.OutputPlayState
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.library.FolderEntity
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
    vm: AppViewModel,
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
        ) { value -> vm.updateSettings { it.copy(playback = it.playback.copy(repeat = value)) } }
        SwitchRow(stringResource(R.string.shuffle), settings.playback.shuffle) { value ->
            vm.updateSettings { it.copy(playback = it.playback.copy(shuffle = value)) }
        }
        SwitchRow(stringResource(R.string.auto_advance), settings.playback.autoAdvance) { value ->
            vm.updateSettings { it.copy(playback = it.playback.copy(autoAdvance = value)) }
        }
        SwitchRow(stringResource(R.string.jam_mode), settings.playback.jamMode) { value ->
            vm.updateSettings { it.copy(playback = it.playback.copy(jamMode = value)) }
        }
    }
}

@Composable
fun AudioSettingsScreen(
    vm: AppViewModel,
    settings: AndroidSettings,
    capabilities: AndroidCapabilities?,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    var showEffectsDialog by remember { mutableStateOf(false) }
    val effectsAvailable = remember { hasSystemAudioEffects(context) }
    SettingsPage(stringResource(R.string.settings_audio), onBack) {
        SliderRow(stringResource(R.string.volume), settings.transport.volume.toFloat(), 0f..100f) { value ->
            vm.updateSettings { it.copy(transport = it.transport.copy(volume = value.toInt())) }
        }
        SliderRow(
            stringResource(R.string.pan_separation),
            settings.transport.panSeparation.toFloat(),
            0f..100f,
            enabled = capabilities?.panSeparation != false,
        ) { value ->
            vm.updateSettings { it.copy(transport = it.transport.copy(panSeparation = value.toInt())) }
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
            vm.updateSettings { it.copy(transport = it.transport.copy(interpolation = value.toInt())) }
        }
        SliderRow(stringResource(R.string.voices), settings.transport.numVoices.toFloat(), 4f..64f) { value ->
            vm.updateSettings { it.copy(transport = it.transport.copy(numVoices = value.toInt())) }
        }
        SliderRow(stringResource(R.string.tempo_factor), settings.transport.tempoFactor.toFloat(), 0.25f..4f) { value ->
            vm.updateSettings { it.copy(transport = it.transport.copy(tempoFactor = value.toDouble())) }
        }
        SectionTitle(stringResource(R.string.output))
        InfoRow(stringResource(R.string.rate), stringResource(R.string.rate_value, vm.sampleRate))
        InfoRow(stringResource(R.string.session), vm.audioSessionId.toString())
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
            if (!openSystemAudioEffects(context, vm.audioSessionId)) {
                showEffectsDialog = true
            }
        }
        if (showEffectsDialog) {
            SystemEffectsUnavailableDialog { showEffectsDialog = false }
        }
    }
}

@Composable
fun MixerSettingsScreen(
    vm: AppViewModel,
    settings: AndroidSettings,
    capabilities: AndroidCapabilities?,
    onBack: () -> Unit,
) {
    SettingsPage(stringResource(R.string.settings_mixer), onBack) {
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
        ) { value -> vm.updateSettings { it.copy(mixer = it.mixer.copy(mode = value)) } }
        ChoiceRow(
            stringResource(R.string.mixer_layout),
            listOf(
                "panned" to stringResource(R.string.layout_module_pan),
                "lrlr" to "L R L R",
                "lrrl" to "L R R L",
            ),
            settings.mixer.layout,
            enabled = capabilities?.mixer != false,
        ) { value -> vm.updateSettings { it.copy(mixer = it.mixer.copy(layout = value)) } }
        ChoiceRow(
            stringResource(R.string.a500_filter),
            listOf(
                "a500" to stringResource(R.string.a500_off),
                "a500led" to stringResource(R.string.a500_on),
            ),
            settings.mixer.amigaFilter,
            enabled = capabilities?.amigaFilter != false,
        ) { value -> vm.updateSettings { it.copy(mixer = it.mixer.copy(amigaFilter = value)) } }
        SliderRow(stringResource(R.string.amplify), settings.mixer.amplify.toFloat(), 1f..32f) { value ->
            vm.updateSettings { it.copy(mixer = it.mixer.copy(amplify = value.toInt())) }
        }
    }
}

@Composable
fun SidSettingsScreen(
    vm: AppViewModel,
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
        ) { value -> vm.updateSettings { it.copy(sid = it.sid.copy(model = value.toInt())) } }
        ChoiceRow(
            stringResource(R.string.sid_video),
            listOf(
                "null" to stringResource(R.string.common_header),
                "0" to stringResource(R.string.sid_ntsc),
                "1" to stringResource(R.string.sid_pal),
            ),
            settings.sid.videoStandard?.toString() ?: "null",
        ) { value ->
            vm.updateSettings {
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
        ) { value -> vm.updateSettings { it.copy(sid = it.sid.copy(quality = value)) } }
        ChoiceRow(
            stringResource(R.string.sid_channels),
            listOf(
                "0" to stringResource(R.string.sid_mono),
                "1" to stringResource(R.string.sid_stereo),
                "3" to stringResource(R.string.sid_narrow),
            ),
            settings.sid.stereo.toString(),
        ) { value -> vm.updateSettings { it.copy(sid = it.sid.copy(stereo = value.toInt())) } }
        SliderRow(stringResource(R.string.sid_engine_volume), settings.sid.volume.toFloat(), 0f..255f) { value ->
            vm.updateSettings { it.copy(sid = it.sid.copy(volume = value.toInt())) }
        }
    }
}

@Composable
fun AppearanceSettingsScreen(
    vm: AppViewModel,
    settings: AndroidSettings,
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
            vm.updateSettings { it.copy(view = it.view.copy(theme = value)) }
        }
        SwitchRow(stringResource(R.string.strip_dots), settings.view.stripDots) { value ->
            vm.updateSettings { it.copy(view = it.view.copy(stripDots = value)) }
        }
        SwitchRow(stringResource(R.string.reduced_motion), settings.view.reducedMotion) { value ->
            vm.updateSettings { it.copy(view = it.view.copy(reducedMotion = value)) }
        }
        SwitchRow(stringResource(R.string.show_channel_strip), settings.view.showChannelStrip) { value ->
            vm.updateSettings { it.copy(view = it.view.copy(showChannelStrip = value)) }
        }
    }
}

@Composable
fun LibrarySettingsScreen(
    vm: AppViewModel,
    folders: List<FolderEntity>,
    ignoredCount: Int,
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
            OutlinedButton(onClick = { vm.rescan() }) {
                Icon(AppIcons.Refresh, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.common_rescan))
            }
        }
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
                    IconButton(onClick = { vm.rescan(folder.id) }) {
                        Icon(
                            AppIcons.Refresh,
                            contentDescription = stringResource(R.string.cd_rescan_folder, folder.name),
                        )
                    }
                    IconButton(onClick = { vm.removeFolder(folder) }) {
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
    vm: AppViewModel,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val effectsPanel = remember { hasSystemAudioEffects(context) }
    val audio = vm.audioInfo
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
            stringResource(if (vm.v8Available) R.string.v8_available else R.string.v8_stub),
        )
        val v8Error = vm.v8Error
        if (!vm.v8Available && v8Error != null) {
            Text(v8Error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        InfoRow(stringResource(R.string.output_rate), "${vm.sampleRate} Hz")
        InfoRow(stringResource(R.string.audio_session), vm.audioSessionId.toString())
        InfoRow(stringResource(R.string.underruns), vm.underruns.toString())

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
    var selected by remember { mutableStateOf(manager.applicationLocales.toLanguageTags()) }
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
    val manager = context.getSystemService(LocaleManager::class.java)
    manager.applicationLocales =
        if (tag.isEmpty()) {
            LocaleList.getEmptyLocaleList()
        } else {
            LocaleList.forLanguageTags(tag)
        }
}
