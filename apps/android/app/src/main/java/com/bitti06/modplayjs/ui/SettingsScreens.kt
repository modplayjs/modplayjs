package com.bitti06.modplayjs.ui

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.BuildConfig
import com.bitti06.modplayjs.engine.AndroidCapabilities
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.library.FolderEntity

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
    vm: AppViewModel,
    settings: AndroidSettings,
    folders: List<FolderEntity>,
    ignoredCount: Int,
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
) {
    SettingsPage("Settings", onBack) {
        SettingsRow(
            "Playback",
            "Repeat ${settings.playback.repeat} · auto-advance ${if (settings.playback.autoAdvance) "on" else "off"}",
        ) { onOpen(ROUTE_SETTINGS_PLAYBACK) }
        SettingsRow(
            "Audio",
            "Volume ${settings.transport.volume}% · ${vm.sampleRate} Hz",
        ) { onOpen(ROUTE_SETTINGS_AUDIO) }
        SettingsRow(
            "Mixer",
            "${settings.mixer.mode} · ${settings.mixer.layout} · ${settings.mixer.amigaFilter}",
        ) { onOpen(ROUTE_SETTINGS_MIXER) }
        SettingsRow(
            "SID",
            "${settings.sid.quality} · ${settings.sid.model}",
        ) { onOpen(ROUTE_SETTINGS_SID) }
        SettingsRow(
            "Appearance",
            "Theme: ${settings.view.theme}",
        ) { onOpen(ROUTE_SETTINGS_APPEARANCE) }
        SettingsRow(
            "Library",
            "${folders.size} folders · $ignoredCount ignored",
        ) { onOpen(ROUTE_SETTINGS_LIBRARY) }
        SettingsRow("Diagnostics", "V8, output, underruns") { onOpen(ROUTE_SETTINGS_DIAGNOSTICS) }
        SettingsRow("About", "Version, commit, links") { onOpen(ROUTE_ABOUT) }
        SettingsRow("Licenses", "Open source notices") { onOpen(ROUTE_LICENSES) }
    }
}

@Composable
fun PlaybackSettingsScreen(
    vm: AppViewModel,
    settings: AndroidSettings,
    onBack: () -> Unit,
) {
    SettingsPage("Playback", onBack) {
        ChoiceRow(
            "Repeat",
            listOf("off" to "Off", "all" to "All", "one" to "One"),
            settings.playback.repeat,
        ) { value -> vm.updateSettings { it.copy(playback = it.playback.copy(repeat = value)) } }
        SwitchRow("Shuffle", settings.playback.shuffle) { value ->
            vm.updateSettings { it.copy(playback = it.playback.copy(shuffle = value)) }
        }
        SwitchRow("Auto-advance", settings.playback.autoAdvance) { value ->
            vm.updateSettings { it.copy(playback = it.playback.copy(autoAdvance = value)) }
        }
        SwitchRow("Jam mode (mute song)", settings.playback.jamMode) { value ->
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
    SettingsPage("Audio", onBack) {
        SliderRow("Volume", settings.transport.volume.toFloat(), 0f..100f) { value ->
            vm.updateSettings { it.copy(transport = it.transport.copy(volume = value.toInt())) }
        }
        SliderRow(
            "Pan separation",
            settings.transport.panSeparation.toFloat(),
            0f..100f,
            enabled = capabilities?.panSeparation != false,
        ) { value ->
            vm.updateSettings { it.copy(transport = it.transport.copy(panSeparation = value.toInt())) }
        }
        ChoiceRow(
            "Interpolation",
            listOf("0" to "Nearest", "1" to "Linear", "2" to "Spline"),
            settings.transport.interpolation.toString(),
        ) { value ->
            vm.updateSettings { it.copy(transport = it.transport.copy(interpolation = value.toInt())) }
        }
        SliderRow("Voices", settings.transport.numVoices.toFloat(), 4f..64f) { value ->
            vm.updateSettings { it.copy(transport = it.transport.copy(numVoices = value.toInt())) }
        }
        SliderRow("Tempo factor", settings.transport.tempoFactor.toFloat(), 0.25f..4f) { value ->
            vm.updateSettings { it.copy(transport = it.transport.copy(tempoFactor = value.toDouble())) }
        }
        SectionTitle("Output")
        InfoRow("Rate", "${vm.sampleRate} Hz (device)")
        InfoRow("Session", vm.audioSessionId.toString())
        Text(
            "AudioTrack always runs at the device output rate; the engine is told that rate so pitch stays correct.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        SettingsRow("System audio effects", "Equalizer, bass boost and other device effects") {
            if (!openSystemAudioEffects(context, vm.audioSessionId)) {
                Toast.makeText(context, "No system audio effects panel on this device", Toast.LENGTH_SHORT).show()
            }
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
    SettingsPage("Mixer", onBack) {
        Text(
            "Applies to tracker modules. OpenMPT-style modules use libxmp; MOD files can use the Paula path.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        ChoiceRow(
            "Mixer",
            listOf("libxmp" to "libxmp", "paula" to "Paula"),
            settings.mixer.mode,
            enabled = capabilities?.mixerMode != false,
        ) { value -> vm.updateSettings { it.copy(mixer = it.mixer.copy(mode = value)) } }
        ChoiceRow(
            "Layout",
            listOf("panned" to "Module pan", "lrlr" to "L R L R", "lrrl" to "L R R L"),
            settings.mixer.layout,
            enabled = capabilities?.mixer != false,
        ) { value -> vm.updateSettings { it.copy(mixer = it.mixer.copy(layout = value)) } }
        ChoiceRow(
            "A500 filter",
            listOf("a500" to "LED off", "a500led" to "LED on"),
            settings.mixer.amigaFilter,
            enabled = capabilities?.amigaFilter != false,
        ) { value -> vm.updateSettings { it.copy(mixer = it.mixer.copy(amigaFilter = value)) } }
        SliderRow("Amplify", settings.mixer.amplify.toFloat(), 1f..32f) { value ->
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
    SettingsPage("SID", onBack) {
        Text(
            "Settings for SID tunes; they do not affect tracker modules or streamed audio.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        ChoiceRow(
            "Chip",
            listOf("0" to "Header", "6581" to "6581", "8580" to "8580"),
            settings.sid.model.toString(),
        ) { value -> vm.updateSettings { it.copy(sid = it.sid.copy(model = value.toInt())) } }
        ChoiceRow(
            "Video",
            listOf("null" to "Header", "0" to "NTSC", "1" to "PAL"),
            settings.sid.videoStandard?.toString() ?: "null",
        ) { value ->
            vm.updateSettings {
                it.copy(sid = it.sid.copy(videoStandard = if (value == "null") null else value.toInt()))
            }
        }
        ChoiceRow(
            "Quality",
            listOf("light" to "Light", "hq" to "HQ", "sinc" to "Sinc"),
            settings.sid.quality,
        ) { value -> vm.updateSettings { it.copy(sid = it.sid.copy(quality = value)) } }
        ChoiceRow(
            "Channels",
            listOf("0" to "Mono", "1" to "Stereo", "3" to "Narrow"),
            settings.sid.stereo.toString(),
        ) { value -> vm.updateSettings { it.copy(sid = it.sid.copy(stereo = value.toInt())) } }
        SliderRow("Engine volume", settings.sid.volume.toFloat(), 0f..255f) { value ->
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
    SettingsPage("Appearance", onBack) {
        ChoiceRow("Theme", listOf("dark" to "Dark", "light" to "Light"), settings.view.theme) { value ->
            vm.updateSettings { it.copy(view = it.view.copy(theme = value)) }
        }
        SwitchRow("Strip trailing dots", settings.view.stripDots) { value ->
            vm.updateSettings { it.copy(view = it.view.copy(stripDots = value)) }
        }
        SwitchRow("Reduced motion", settings.view.reducedMotion) { value ->
            vm.updateSettings { it.copy(view = it.view.copy(reducedMotion = value)) }
        }
        SwitchRow("Show channel strip", settings.view.showChannelStrip) { value ->
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
    SettingsPage("Library", onBack) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onAddFolder, modifier = Modifier.weight(1f)) {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("Add folder")
            }
            OutlinedButton(onClick = { vm.rescan() }) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("Rescan")
            }
        }
        SettingsRow("Ignored files", "$ignoredCount removed from the library", onOpenIgnored)
        SectionTitle("Indexed folders")
        if (folders.isEmpty()) {
            Text("No folders added yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        folders.forEach { folder ->
            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(folder.name)
                        Text(
                            "${folder.fileCount} files · ${folder.status}" +
                                if (folder.canWrite) " · read/write" else " · read only",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (folder.status == "ok") MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error,
                        )
                        if (folder.error != null) {
                            Text(folder.error, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                        }
                    }
                    IconButton(onClick = { vm.rescan(folder.id) }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Rescan ${folder.name}")
                    }
                    IconButton(onClick = { vm.removeFolder(folder) }) {
                        Icon(Icons.Default.Delete, contentDescription = "Remove ${folder.name}", tint = MaterialTheme.colorScheme.error)
                    }
                }
                HorizontalDivider()
            }
        }
    }
}

@Composable
fun DiagnosticsScreen(
    vm: AppViewModel,
    onBack: () -> Unit,
) {
    SettingsPage("Diagnostics", onBack) {
        SectionTitle("Engine")
        InfoRow("V8", if (vm.v8Available) "available" else "stub")
        val v8Error = vm.v8Error
        if (!vm.v8Available && v8Error != null) {
            Text(v8Error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        InfoRow("Output rate", "${vm.sampleRate} Hz")
        InfoRow("Audio session", vm.audioSessionId.toString())
        InfoRow("Underruns", vm.underruns.toString())
        SectionTitle("Build")
        InfoRow("Version", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
        InfoRow("Commit", BuildConfig.GIT_COMMIT)
        InfoRow("Variant", BuildConfig.BUILD_TYPE)
    }
}

const val ROUTE_SETTINGS = "settings"
const val ROUTE_SETTINGS_PLAYBACK = "settings/playback"
const val ROUTE_SETTINGS_AUDIO = "settings/audio"
const val ROUTE_SETTINGS_MIXER = "settings/mixer"
const val ROUTE_SETTINGS_SID = "settings/sid"
const val ROUTE_SETTINGS_APPEARANCE = "settings/appearance"
const val ROUTE_SETTINGS_LIBRARY = "settings/library"
const val ROUTE_SETTINGS_DIAGNOSTICS = "settings/diagnostics"
const val ROUTE_ABOUT = "about"
const val ROUTE_LICENSES = "licenses"
const val ROUTE_LICENSE_PREFIX = "license/"
const val ROUTE_DETAILS = "details"
const val ROUTE_QUEUE = "queue"
const val ROUTE_IGNORED = "ignored"
