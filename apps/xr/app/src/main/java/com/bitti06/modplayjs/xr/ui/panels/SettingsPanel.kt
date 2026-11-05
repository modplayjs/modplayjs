package com.bitti06.modplayjs.xr.ui.panels

import android.app.LocaleManager
import android.content.Context
import android.os.LocaleList
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.xr.BuildConfig
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.SceneAccess
import com.bitti06.modplayjs.xr.SceneBridge
import com.bitti06.modplayjs.xr.state.XrStore
import com.bitti06.modplayjs.xr.ui.panel.Chip
import com.bitti06.modplayjs.xr.ui.panel.MetaText
import com.bitti06.modplayjs.xr.ui.panel.Option
import com.bitti06.modplayjs.xr.ui.panel.OptionRow
import com.bitti06.modplayjs.xr.ui.panel.PanelScaffold
import com.bitti06.modplayjs.xr.ui.panel.PanelTokens
import com.bitti06.modplayjs.xr.ui.panel.Section
import com.bitti06.modplayjs.xr.ui.panel.StepperRow
import com.bitti06.modplayjs.xr.ui.panel.ToggleRow
import java.util.Locale

@Composable
fun SettingsPanel() {
    val context = LocalContext.current
    val state by XrStore.state.collectAsState()
    val playback = state.player
    val settings = state.settings
    val libraryVersion by XrStore.libraryVersion.collectAsState()
    var radius by remember { mutableFloatStateOf(state.radius) }
    var radiusManual by remember { mutableStateOf(state.radiusManual) }
    var treeCount by remember(libraryVersion) { mutableIntStateOf(XrStore.treeUris().size) }
    var pickedCount by remember(libraryVersion) { mutableIntStateOf(XrStore.pickedCount()) }
    var favoriteCount by remember(libraryVersion) { mutableIntStateOf(XrStore.favorites().size) }
    var ignoredCount by remember(libraryVersion) { mutableIntStateOf(XrStore.ignoredUris().size) }
    val trees = remember(libraryVersion) { XrStore.treeUris() }
    val ignored = remember(libraryVersion) { XrStore.ignoredUris().isNotEmpty() }

    fun set(transform: (AndroidSettings) -> AndroidSettings) {
        XrStore.updateSettings(transform)
    }

    PanelScaffold(title = stringResource(R.string.xr_settings)) {
        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(1f),
            verticalArrangement = Arrangement.spacedBy(PanelTokens.GapSm),
        ) {
            item {
                Section(stringResource(R.string.xr_section_spatial)) {
                    ToggleRow(stringResource(R.string.xr_spatial_audio), playback.spatialEnabled) {
                        XrStore.setSpatialEnabled(!playback.spatialEnabled)
                    }
                    if (!playback.spatialAvailable) {
                        MetaText(stringResource(R.string.xr_spatial_unavailable), PanelTokens.AccentWarm)
                    } else if (playback.layout.isNotBlank()) {
                        MetaText(
                            stringResource(R.string.xr_spatial_objects, playback.channels, playback.layout),
                        )
                    }
                    OptionRow(
                        stringResource(R.string.xr_layout),
                        listOf(
                            Option(stringResource(R.string.xr_pan), "panned"),
                            Option("LR·LR", "lrlr"),
                            Option("LR·RL", "lrrl"),
                        ),
                        settings.mixer.layout,
                    ) { XrStore.setLayout(it) }
                    ToggleRow(stringResource(R.string.xr_passthrough), state.passthrough) {
                        XrStore.setPassthrough(!state.passthrough)
                    }
                    val sceneAccess by SceneBridge.access.collectAsState()
                    if (sceneAccess != SceneAccess.PENDING) {
                        MetaText(
                            stringResource(
                                if (sceneAccess == SceneAccess.GRANTED) {
                                    R.string.xr_scene_note
                                } else {
                                    R.string.xr_scene_denied
                                },
                            ),
                        )
                    }
                    StepperRow(stringResource(R.string.xr_ring), String.format("%.1f m", radius)) { step ->
                        radius = (radius + step).coerceIn(0.4f, 3.0f)
                        radiusManual = true
                        XrStore.setRadius(radius)
                    }
                    if (radiusManual) {
                        Chip(stringResource(R.string.xr_auto)) {
                            XrStore.resetRadiusAuto()
                            radiusManual = false
                        }
                    }
                    ToggleRow(stringResource(R.string.xr_free_layout), state.freeLayout) {
                        XrStore.setFreeLayout(!state.freeLayout)
                    }
                    MetaText(
                        stringResource(
                            if (state.freeLayout) R.string.xr_free_hint else R.string.xr_stationary_hint,
                        ),
                    )
                    if (state.freeLayout) {
                        Chip(stringResource(R.string.xr_layout_reset)) { XrStore.resetLayout() }
                    }
                    ToggleRow(stringResource(R.string.xr_source_markers), playback.debugSources) {
                        XrStore.setDebugSources(!playback.debugSources)
                    }
                    if (playback.azimuths.isNotEmpty()) {
                        MetaText(
                            playback.azimuths.joinToString("  ") { "${it.toInt()}°" },
                            PanelTokens.AccentWarm,
                        )
                    }
                }
            }

            item {
                Section(stringResource(R.string.xr_section_playback)) {
                    OptionRow(
                        stringResource(R.string.xr_repeat),
                        listOf(
                            Option(stringResource(R.string.xr_off), "off"),
                            Option(stringResource(R.string.xr_all), "all"),
                            Option(stringResource(R.string.xr_one), "one"),
                        ),
                        settings.playback.repeat,
                    ) { set { s -> s.copy(playback = s.playback.copy(repeat = it)) } }
                    ToggleRow(stringResource(R.string.xr_shuffle), settings.playback.shuffle) {
                        set { s -> s.copy(playback = s.playback.copy(shuffle = !s.playback.shuffle)) }
                    }
                    ToggleRow(stringResource(R.string.xr_auto_advance), settings.playback.autoAdvance) {
                        set { s -> s.copy(playback = s.playback.copy(autoAdvance = !s.playback.autoAdvance)) }
                    }
                    ToggleRow(stringResource(R.string.xr_jam), settings.playback.jamMode) {
                        XrStore.setJamMode(!settings.playback.jamMode)
                    }
                }
            }

            item {
                Section(stringResource(R.string.xr_section_audio)) {
                    if (playback.canPan) {
                        StepperRow(stringResource(R.string.xr_pan), "${settings.transport.panSeparation}") { step ->
                            set { s ->
                                s.copy(
                                    transport = s.transport.copy(
                                        panSeparation =
                                            (s.transport.panSeparation + (step * 10).toInt()).coerceIn(0, 100),
                                    ),
                                )
                            }
                        }
                    }
                    OptionRow(
                        stringResource(R.string.xr_interpolation),
                        listOf(Option("N", "0"), Option("L", "1"), Option("S", "2")),
                        settings.transport.interpolation.toString(),
                    ) { set { s -> s.copy(transport = s.transport.copy(interpolation = it.toInt())) } }
                    StepperRow(stringResource(R.string.xr_voices), "${settings.transport.numVoices}") { step ->
                        set { s ->
                            s.copy(
                                transport = s.transport.copy(
                                    numVoices = (s.transport.numVoices + (step * 4).toInt()).coerceIn(4, 128),
                                ),
                            )
                        }
                    }
                    StepperRow(stringResource(R.string.xr_tempo), String.format("%.2f×", settings.transport.tempoFactor)) { step ->
                        set { s ->
                            s.copy(
                                transport = s.transport.copy(
                                    tempoFactor = (s.transport.tempoFactor + step * 0.05).coerceIn(0.25, 4.0),
                                ),
                            )
                        }
                    }
                }
            }

            item {
                Section(stringResource(R.string.xr_section_mixer)) {
                    if (!playback.canMixer) {
                        MetaText(stringResource(R.string.xr_mixer_unavailable))
                    }
                    OptionRow(
                        stringResource(R.string.xr_mode),
                        listOf(Option("libxmp", "libxmp"), Option("Paula", "paula")),
                        settings.mixer.mode,
                    ) { set { s -> s.copy(mixer = s.mixer.copy(mode = it)) } }
                    OptionRow(
                        stringResource(R.string.xr_filter),
                        listOf(
                            Option(stringResource(R.string.xr_led_off), "a500"),
                            Option(stringResource(R.string.xr_led_on), "a500led"),
                        ),
                        settings.mixer.amigaFilter,
                    ) { set { s -> s.copy(mixer = s.mixer.copy(amigaFilter = it)) } }
                }
            }

            item {
                Section(stringResource(R.string.xr_section_sid)) {
                    OptionRow(
                        stringResource(R.string.xr_chip),
                        listOf(Option("6581", "6581"), Option("8580", "8580")),
                        settings.sid.model.toString(),
                    ) { set { s -> s.copy(sid = s.sid.copy(model = it.toInt())) } }
                    OptionRow(
                        stringResource(R.string.xr_video),
                        listOf(Option("PAL", "1"), Option("NTSC", "0")),
                        (settings.sid.videoStandard ?: 1).toString(),
                    ) { set { s -> s.copy(sid = s.sid.copy(videoStandard = it.toInt())) } }
                    OptionRow(
                        stringResource(R.string.xr_quality),
                        listOf(
                            Option(stringResource(R.string.xr_light), "light"),
                            Option(stringResource(R.string.xr_hq), "hq"),
                            Option(stringResource(R.string.xr_sinc), "sinc"),
                        ),
                        settings.sid.quality,
                    ) { set { s -> s.copy(sid = s.sid.copy(quality = it)) } }
                    OptionRow(
                        stringResource(R.string.xr_channels),
                        listOf(
                            Option(stringResource(R.string.xr_mono), "0"),
                            Option(stringResource(R.string.xr_stereo), "1"),
                            Option(stringResource(R.string.xr_narrow), "3"),
                        ),
                        settings.sid.stereo.toString(),
                    ) { set { s -> s.copy(sid = s.sid.copy(stereo = it.toInt())) } }
                    StepperRow(stringResource(R.string.xr_volume), "${settings.sid.volume}") { step ->
                        set { s ->
                            s.copy(
                                sid = s.sid.copy(volume = (s.sid.volume + (step * 16).toInt()).coerceIn(0, 255)),
                            )
                        }
                    }
                }
            }

            item {
                Section(stringResource(R.string.xr_section_appearance)) {
                    MetaText(stringResource(R.string.xr_theme_note))
                    ToggleRow(stringResource(R.string.xr_reduced_motion), settings.view.reducedMotion) {
                        set { s -> s.copy(view = s.view.copy(reducedMotion = !s.view.reducedMotion)) }
                    }
                    ToggleRow(stringResource(R.string.xr_channel_strip), settings.view.showChannelStrip) {
                        set { s -> s.copy(view = s.view.copy(showChannelStrip = !s.view.showChannelStrip)) }
                    }
                    ToggleRow(stringResource(R.string.xr_pattern_view), settings.view.patternView) {
                        set { s -> s.copy(view = s.view.copy(patternView = !s.view.patternView)) }
                    }
                    ToggleRow(stringResource(R.string.xr_follow), settings.view.follow) {
                        set { s -> s.copy(view = s.view.copy(follow = !s.view.follow)) }
                    }
                    ToggleRow(stringResource(R.string.xr_strip_dots), settings.view.stripDots) {
                        set { s -> s.copy(view = s.view.copy(stripDots = !s.view.stripDots)) }
                    }
                    ToggleRow(stringResource(R.string.xr_sample_lengths), settings.view.sampleLengths) {
                        set { s -> s.copy(view = s.view.copy(sampleLengths = !s.view.sampleLengths)) }
                    }
                    ToggleRow(stringResource(R.string.xr_loop_marker), settings.view.sampleLoopFlags) {
                        set { s -> s.copy(view = s.view.copy(sampleLoopFlags = !s.view.sampleLoopFlags)) }
                    }
                    SwatchRow(stringResource(R.string.xr_color_note), settings.view.patternColors.note) { argb ->
                        set { s -> s.copy(view = s.view.copy(patternColors = s.view.patternColors.copy(note = argb))) }
                    }
                    SwatchRow(stringResource(R.string.xr_color_instrument), settings.view.patternColors.instrument) { argb ->
                        set { s -> s.copy(view = s.view.copy(patternColors = s.view.patternColors.copy(instrument = argb))) }
                    }
                    SwatchRow(stringResource(R.string.xr_color_volume), settings.view.patternColors.volume) { argb ->
                        set { s -> s.copy(view = s.view.copy(patternColors = s.view.patternColors.copy(volume = argb))) }
                    }
                    SwatchRow(stringResource(R.string.xr_color_effect), settings.view.patternColors.effect) { argb ->
                        set { s -> s.copy(view = s.view.copy(patternColors = s.view.patternColors.copy(effect = argb))) }
                    }
                    OptionRow(
                        stringResource(R.string.xr_visualizer),
                        listOf(
                            Option(stringResource(R.string.xr_vis_off), "off"),
                            Option(stringResource(R.string.xr_vis_levels), "spectrum"),
                            Option(stringResource(R.string.xr_vis_wave), "waveform"),
                            Option(stringResource(R.string.xr_vis_both), "both"),
                        ),
                        settings.view.visualizer,
                    ) { set { s -> s.copy(view = s.view.copy(visualizer = it)) } }
                }
            }

            item {
                Section(stringResource(R.string.xr_section_library)) {
                    MetaText(
                        stringResource(
                            R.string.xr_library_summary,
                            treeCount,
                            pickedCount,
                            favoriteCount,
                            ignoredCount,
                        ),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm)) {
                        Chip(stringResource(R.string.xr_add_folder)) { XrStore.pickFolder() }
                        Chip(stringResource(R.string.xr_clear_ignored)) { XrStore.clearIgnored() }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm)) {
                        if (state.queue.tracks.isNotEmpty()) {
                            Chip(stringResource(R.string.xr_queue)) { XrStore.toggleQueue() }
                        }
                        if (ignored) {
                            Chip(stringResource(R.string.xr_ignored)) { XrStore.toggleIgnored() }
                        }
                    }
                    for (tree in trees) {
                        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                tree.lastPathSegment ?: tree.toString(),
                                fontSize = PanelTokens.Body,
                                color = PanelTokens.Text,
                                maxLines = 1,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                "✕",
                                fontSize = PanelTokens.Body,
                                color = PanelTokens.Error,
                                modifier = Modifier
                                    .clickable { XrStore.removeTree(tree) }
                                    .padding(horizontal = PanelTokens.GapSm),
                            )
                        }
                    }
                }
            }

            item {
                Section(stringResource(R.string.xr_section_diagnostics)) {
                    MetaText(
                        stringResource(
                            R.string.xr_diag_line,
                            stringResource(
                                if (state.engineAvailable) R.string.xr_engine_v8 else R.string.xr_engine_missing,
                            ),
                            state.sessionId,
                            playback.channels,
                        ),
                    )
                }
            }

            item {
                Section(stringResource(R.string.xr_section_language)) {
                    OptionRow(
                        stringResource(R.string.xr_app_language),
                        listOf(
                            Option(stringResource(R.string.xr_lang_system), "sys"),
                            Option(stringResource(R.string.xr_lang_de), "de"),
                            Option(stringResource(R.string.xr_lang_en), "en"),
                        ),
                        currentLocaleTag(context),
                    ) { setLocale(context, it) }
                }
            }

            item {
                Section(stringResource(R.string.xr_section_licenses)) {
                    MetaText(stringResource(R.string.xr_licenses_text))
                }
            }

            item {
                Section(stringResource(R.string.xr_section_about)) {
                    MetaText(stringResource(R.string.xr_about_line, BuildConfig.VERSION_NAME))
                }
            }
        }
    }
}

private fun currentLocaleTag(context: Context): String {
    val manager = context.getSystemService(LocaleManager::class.java) ?: return "sys"
    val locales = manager.applicationLocales
    if (locales.isEmpty) return "sys"
    return locales[0]?.language ?: "sys"
}

private fun setLocale(context: Context, tag: String) {
    val manager = context.getSystemService(LocaleManager::class.java) ?: return
    manager.applicationLocales =
        when (tag) {
            "de" -> LocaleList(Locale.GERMAN)
            "en" -> LocaleList(Locale.ENGLISH)
            else -> LocaleList.getEmptyLocaleList()
        }
}

/**
 * One pattern colour: a swatch that cycles the phone app's palette and wraps
 * back to "theme colour". Cycling avoids a colour dialog, which is awkward with
 * a controller ray.
 */
@Composable
private fun SwatchRow(
    label: String,
    value: Int?,
    onPick: (Int?) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm),
    ) {
        Text(
            label,
            fontSize = PanelTokens.Body,
            color = PanelTokens.Text,
            modifier = Modifier.weight(1f),
        )
        val swatch = value?.let { Color(it) } ?: PanelTokens.SurfaceSunken
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(4.dp))
                .background(swatch)
                .clickable {
                    val next =
                        if (value == null) {
                            PATTERN_SWATCHES.first()
                        } else {
                            val i = PATTERN_SWATCHES.indexOf(value)
                            if (i < 0 || i == PATTERN_SWATCHES.lastIndex) null else PATTERN_SWATCHES[i + 1]
                        }
                    onPick(next)
                }
                .padding(horizontal = PanelTokens.Gap, vertical = PanelTokens.GapXs),
        ) {
            Text(
                if (value == null) {
                    stringResource(R.string.xr_color_default)
                } else {
                    String.format("#%06X", value and 0xFFFFFF)
                },
                fontSize = PanelTokens.Meta,
                fontWeight = FontWeight.SemiBold,
                color = if (value == null) PanelTokens.TextDim else Color.Black,
            )
        }
    }
}

/** Same palette as the phone app's PatternColorsScreen. */
private val PATTERN_SWATCHES =
    listOf(
        0xFFFFFFFF, 0xFFF1EDFB, 0xFFB9B0D4, 0xFF9E9E9E,
        0xFFB49BFF, 0xFF8EA2FF, 0xFF64B5F6, 0xFF4DD0E1,
        0xFF5FE3C0, 0xFF7BD88F, 0xFFFFD166, 0xFFFFB74D,
        0xFFFF9BC2, 0xFFE57373, 0xFFBA68C8, 0xFF6B7FA8,
    ).map { it.toInt() }
