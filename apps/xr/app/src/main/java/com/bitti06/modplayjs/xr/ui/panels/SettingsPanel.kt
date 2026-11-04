package com.bitti06.modplayjs.xr.ui.panels

import android.app.LocaleManager
import android.content.Context
import android.os.LocaleList
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.xr.BuildConfig
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.SceneAccess
import com.bitti06.modplayjs.xr.SceneBridge
import com.bitti06.modplayjs.xr.XrApp
import com.bitti06.modplayjs.xr.library.Library
import com.bitti06.modplayjs.xr.play.XrPlayer
import java.util.Locale

@Composable
fun SettingsPanel() {
    val player = XrApp.player
    val context = LocalContext.current
    val library = remember { Library(context) }
    val state by (player?.state ?: kotlinx.coroutines.flow.MutableStateFlow(XrPlayer.State())).collectAsState()
    val settings = player?.settingsSnapshot() ?: AndroidSettings()
    val passthrough by XrApp.passthrough.collectAsState()
    val freeLayout by XrApp.freeLayout.collectAsState()
    var radius by remember { mutableFloatStateOf(player?.ringRadius() ?: 1.0f) }
    var radiusManual by remember { mutableStateOf(player?.isRadiusManual() ?: false) }
    val onLabel = stringResource(R.string.xr_on)
    val offLabel = stringResource(R.string.xr_off)

    fun set(transform: (AndroidSettings) -> AndroidSettings) {
        player?.update(transform)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        // Sticky Header with Title and Gear Close Icon
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainer)
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.xr_settings),
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.weight(1f),
            )
            HomeChip()
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 14.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            item {
                Section(stringResource(R.string.xr_section_spatial)) {
                    ToggleRow(
                        stringResource(R.string.xr_spatial_audio),
                        if (state.spatialEnabled) onLabel else offLabel,
                        state.spatialEnabled,
                    ) { player?.setSpatialEnabled(!state.spatialEnabled) }
                    // Why the toggle may do nothing: the module can't be split
                    // (SID or streamed audio) or spatial mode is off.
                    if (!state.spatialAvailable) {
                        Text(
                            stringResource(R.string.xr_spatial_unavailable),
                            fontSize = 8.sp,
                            color = MaterialTheme.colorScheme.tertiary,
                        )
                    } else if (state.layout.isNotBlank()) {
                        Text(
                            stringResource(R.string.xr_spatial_objects, state.channels, state.layout),
                            fontSize = 8.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Options(
                        stringResource(R.string.xr_layout),
                        listOf(stringResource(R.string.xr_pan) to "panned", "LR·LR" to "lrlr", "LR·RL" to "lrrl"),
                        settings.mixer.layout,
                    ) { player?.setLayout(it) }
                    ToggleRow(stringResource(R.string.xr_passthrough), if (passthrough) onLabel else offLabel, passthrough) {
                        XrApp.setPassthrough(!passthrough)
                    }
                    // VRC.Quest.Security.2 graceful-failure wording: the scene
                    // permission is only used to place the ring, and denying it
                    // must read as a limited feature rather than a broken app.
                    val sceneAccess by SceneBridge.access.collectAsState()
                    if (sceneAccess != SceneAccess.PENDING) {
                        Text(
                            stringResource(
                                if (sceneAccess == SceneAccess.GRANTED) {
                                    R.string.xr_scene_note
                                } else {
                                    R.string.xr_scene_denied
                                },
                            ),
                            fontSize = 8.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    StepperRow(stringResource(R.string.xr_ring), String.format("%.1f m", radius), manual = radiusManual) { step ->
                        radius = (radius + step).coerceIn(0.4f, 3.0f)
                        radiusManual = true
                        player?.setRadius(radius)
                    }
                    if (radiusManual) {
                        Text(
                            stringResource(R.string.xr_auto),
                            fontSize = 8.sp,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(MaterialTheme.colorScheme.surfaceContainer)
                                .clickable {
                                    player?.resetRadiusAuto()
                                    radiusManual = false
                                }
                                .padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
                    ToggleRow(stringResource(R.string.xr_free_layout), if (freeLayout) onLabel else offLabel, freeLayout) {
                        XrApp.requestFreeLayout(!freeLayout)
                    }
                    Text(
                        stringResource(
                            if (freeLayout) R.string.xr_free_hint else R.string.xr_stationary_hint,
                        ),
                        fontSize = 8.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (freeLayout) {
                        Text(
                            stringResource(R.string.xr_layout_reset),
                            fontSize = 9.sp,
                            color = MaterialTheme.colorScheme.tertiary,
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(MaterialTheme.colorScheme.surfaceContainerHighest)
                                .clickable { XrApp.requestLayoutReset() }
                                .padding(horizontal = 8.dp, vertical = 3.dp),
                        )
                    }
                    ToggleRow(stringResource(R.string.xr_source_markers), if (state.debugSources) onLabel else offLabel, state.debugSources) {
                        player?.setDebugSources(!state.debugSources)
                    }
                    if (state.azimuths.isNotEmpty()) {
                        Text(
                            state.azimuths.joinToString("  ") { "${it.toInt()}°" },
                            fontSize = 8.sp,
                            color = MaterialTheme.colorScheme.tertiary,
                        )
                    }
                }
            }

            item {
                Section(stringResource(R.string.xr_section_playback)) {
                    Options(
                        stringResource(R.string.xr_repeat),
                        listOf(stringResource(R.string.xr_off) to "off", stringResource(R.string.xr_all) to "all", stringResource(R.string.xr_one) to "one"),
                        settings.playback.repeat,
                    ) { set { s -> s.copy(playback = s.playback.copy(repeat = it)) } }
                    ToggleRow(stringResource(R.string.xr_shuffle), if (settings.playback.shuffle) onLabel else offLabel, settings.playback.shuffle) {
                        set { s -> s.copy(playback = s.playback.copy(shuffle = !s.playback.shuffle)) }
                    }
                    ToggleRow(stringResource(R.string.xr_auto_advance), if (settings.playback.autoAdvance) onLabel else offLabel, settings.playback.autoAdvance) {
                        set { s -> s.copy(playback = s.playback.copy(autoAdvance = !s.playback.autoAdvance)) }
                    }
                    ToggleRow(stringResource(R.string.xr_jam), if (settings.playback.jamMode) onLabel else offLabel, settings.playback.jamMode) {
                        player?.setJamMode(!settings.playback.jamMode)
                    }
                }
            }

            item {
                Section(stringResource(R.string.xr_section_audio)) {
                    if (state.canPan) StepperRow(stringResource(R.string.xr_pan), "${settings.transport.panSeparation}") { step ->
                        set { s ->
                            s.copy(
                                transport = s.transport.copy(
                                    panSeparation = (s.transport.panSeparation + (step * 10).toInt()).coerceIn(0, 100),
                                ),
                            )
                        }
                    }
                    Options(
                        stringResource(R.string.xr_interpolation),
                        listOf("N" to "0", "L" to "1", "S" to "2"),
                        settings.transport.interpolation.toString(),
                    ) { set { s -> s.copy(transport = s.transport.copy(interpolation = it.toInt())) } }
                    StepperRow(stringResource(R.string.xr_voices), "${settings.transport.numVoices}") { step ->
                        set { s ->
                            s.copy(transport = s.transport.copy(numVoices = (s.transport.numVoices + (step * 4).toInt()).coerceIn(4, 128)))
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
                    if (!state.canMixer) {
                        Text(
                            stringResource(R.string.xr_mixer_unavailable),
                            fontSize = 8.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Options(
                        stringResource(R.string.xr_mode),
                        listOf("libxmp" to "libxmp", "Paula" to "paula"),
                        settings.mixer.mode,
                    ) { set { s -> s.copy(mixer = s.mixer.copy(mode = it)) } }
                    Options(
                        stringResource(R.string.xr_filter),
                        listOf(stringResource(R.string.xr_led_off) to "a500", stringResource(R.string.xr_led_on) to "a500led"),
                        settings.mixer.amigaFilter,
                    ) { set { s -> s.copy(mixer = s.mixer.copy(amigaFilter = it)) } }
                }
            }

            item {
                Section(stringResource(R.string.xr_section_sid)) {
                    Options(
                        stringResource(R.string.xr_chip),
                        listOf("6581" to "6581", "8580" to "8580"),
                        settings.sid.model.toString(),
                    ) { set { s -> s.copy(sid = s.sid.copy(model = it.toInt())) } }
                    Options(
                        stringResource(R.string.xr_video),
                        listOf("PAL" to "1", "NTSC" to "0"),
                        (settings.sid.videoStandard ?: 1).toString(),
                    ) { set { s -> s.copy(sid = s.sid.copy(videoStandard = it.toInt())) } }
                    Options(
                        stringResource(R.string.xr_quality),
                        listOf(stringResource(R.string.xr_light) to "light", stringResource(R.string.xr_hq) to "hq", stringResource(R.string.xr_sinc) to "sinc"),
                        settings.sid.quality,
                    ) { set { s -> s.copy(sid = s.sid.copy(quality = it)) } }
                    Options(
                        stringResource(R.string.xr_channels),
                        listOf(stringResource(R.string.xr_mono) to "0", stringResource(R.string.xr_stereo) to "1", stringResource(R.string.xr_narrow) to "3"),
                        settings.sid.stereo.toString(),
                    ) { set { s -> s.copy(sid = s.sid.copy(stereo = it.toInt())) } }
                    StepperRow(stringResource(R.string.xr_volume), "${settings.sid.volume}") { step ->
                        set { s -> s.copy(sid = s.sid.copy(volume = (s.sid.volume + (step * 16).toInt()).coerceIn(0, 255))) }
                    }
                }
            }

            item {
                Section(stringResource(R.string.xr_section_appearance)) {
                    Text(
                        stringResource(R.string.xr_theme_note),
                        fontSize = 8.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    ToggleRow(stringResource(R.string.xr_reduced_motion), if (settings.view.reducedMotion) onLabel else offLabel, settings.view.reducedMotion) {
                        set { s -> s.copy(view = s.view.copy(reducedMotion = !s.view.reducedMotion)) }
                    }
                    ToggleRow(stringResource(R.string.xr_channel_strip), if (settings.view.showChannelStrip) onLabel else offLabel, settings.view.showChannelStrip) {
                        set { s -> s.copy(view = s.view.copy(showChannelStrip = !s.view.showChannelStrip)) }
                    }
                    ToggleRow(stringResource(R.string.xr_pattern_view), if (settings.view.patternView) onLabel else offLabel, settings.view.patternView) {
                        set { s -> s.copy(view = s.view.copy(patternView = !s.view.patternView)) }
                    }
                    ToggleRow(stringResource(R.string.xr_follow), if (settings.view.follow) onLabel else offLabel, settings.view.follow) {
                        set { s -> s.copy(view = s.view.copy(follow = !s.view.follow)) }
                    }
                    ToggleRow(stringResource(R.string.xr_strip_dots), if (settings.view.stripDots) onLabel else offLabel, settings.view.stripDots) {
                        set { s -> s.copy(view = s.view.copy(stripDots = !s.view.stripDots)) }
                    }
                    ToggleRow(stringResource(R.string.xr_sample_lengths), if (settings.view.sampleLengths) onLabel else offLabel, settings.view.sampleLengths) {
                        set { s -> s.copy(view = s.view.copy(sampleLengths = !s.view.sampleLengths)) }
                    }
                    ToggleRow(stringResource(R.string.xr_loop_marker), if (settings.view.sampleLoopFlags) onLabel else offLabel, settings.view.sampleLoopFlags) {
                        set { s -> s.copy(view = s.view.copy(sampleLoopFlags = !s.view.sampleLoopFlags)) }
                    }
                    PatternColorRow(stringResource(R.string.xr_color_note), settings.view.patternColors.note) { argb ->
                        set { s -> s.copy(view = s.view.copy(patternColors = s.view.patternColors.copy(note = argb))) }
                    }
                    PatternColorRow(stringResource(R.string.xr_color_instrument), settings.view.patternColors.instrument) { argb ->
                        set { s -> s.copy(view = s.view.copy(patternColors = s.view.patternColors.copy(instrument = argb))) }
                    }
                    PatternColorRow(stringResource(R.string.xr_color_volume), settings.view.patternColors.volume) { argb ->
                        set { s -> s.copy(view = s.view.copy(patternColors = s.view.patternColors.copy(volume = argb))) }
                    }
                    PatternColorRow(stringResource(R.string.xr_color_effect), settings.view.patternColors.effect) { argb ->
                        set { s -> s.copy(view = s.view.copy(patternColors = s.view.patternColors.copy(effect = argb))) }
                    }
                    Options(
                        stringResource(R.string.xr_visualizer),
                        listOf(stringResource(R.string.xr_vis_off) to "off", stringResource(R.string.xr_vis_levels) to "spectrum", stringResource(R.string.xr_vis_wave) to "waveform", stringResource(R.string.xr_vis_both) to "both"),
                        settings.view.visualizer,
                    ) { set { s -> s.copy(view = s.view.copy(visualizer = it)) } }
                }
            }

            item {
                Section(stringResource(R.string.xr_section_library)) {
                    Text(
                        stringResource(
                            R.string.xr_library_summary,
                            library.treeUris().size,
                            library.pickedCount(),
                            library.favorites().size,
                            library.ignoredUris().size,
                        ),
                        fontSize = 8.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            stringResource(R.string.xr_add_folder),
                            fontSize = 9.sp,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(MaterialTheme.colorScheme.surfaceContainer)
                                .clickable { XrApp.requestFolder() }
                                .padding(horizontal = 8.dp, vertical = 3.dp),
                        )
                        Text(
                            stringResource(R.string.xr_clear_ignored),
                            fontSize = 9.sp,
                            color = MaterialTheme.colorScheme.tertiary,
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(MaterialTheme.colorScheme.surfaceContainer)
                                .clickable {
                                    library.clearIgnored()
                                    XrApp.libraryChanged()
                                }
                                .padding(horizontal = 8.dp, vertical = 3.dp),
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if ((XrApp.playlist?.tracks?.size ?: 0) > 0) Text(
                            stringResource(R.string.xr_queue),
                            fontSize = 9.sp,
                            color = MaterialTheme.colorScheme.secondary,
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(MaterialTheme.colorScheme.surfaceContainer)
                                .clickable { XrApp.toggleQueue() }
                                .padding(horizontal = 8.dp, vertical = 3.dp),
                        )
                        if (library.ignoredUris().isNotEmpty()) Text(
                            stringResource(R.string.xr_ignored),
                            fontSize = 9.sp,
                            color = MaterialTheme.colorScheme.secondary,
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(MaterialTheme.colorScheme.surfaceContainer)
                                .clickable { XrApp.toggleIgnored() }
                                .padding(horizontal = 8.dp, vertical = 3.dp),
                        )
                    }
                    // Every indexed folder with a remove action, like the
                    // phone app's Library settings page.
                    for (tree in library.treeUris()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text(
                                tree.lastPathSegment ?: tree.toString(),
                                fontSize = 8.sp,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                "✕",
                                fontSize = 9.sp,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .clickable {
                                        library.removeTree(tree)
                                        XrApp.libraryChanged()
                                    }
                                    .padding(horizontal = 6.dp, vertical = 2.dp),
                            )
                        }
                    }
                }
            }

            item {
                Section(stringResource(R.string.xr_section_diagnostics)) {
                    Text(
                        stringResource(
                            R.string.xr_diag_line,
                            stringResource(
                                if (player?.engineAvailable() == true) R.string.xr_engine_v8
                                else R.string.xr_engine_missing,
                            ),
                            player?.sessionId() ?: 0,
                            state.channels,
                        ),
                        fontSize = 8.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            item {
                Section(stringResource(R.string.xr_section_language)) {
                    Options(
                        stringResource(R.string.xr_app_language),
                        listOf(stringResource(R.string.xr_lang_system) to "sys", stringResource(R.string.xr_lang_de) to "de", stringResource(R.string.xr_lang_en) to "en"),
                        currentLocaleTag(context),
                    ) { setLocale(context, it) }
                }
            }

            item {
                Section(stringResource(R.string.xr_section_licenses)) {
                    Text(
                        stringResource(R.string.xr_licenses_text),
                        fontSize = 7.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            item {
                Section(stringResource(R.string.xr_section_about)) {
                    Text(
                        stringResource(R.string.xr_about_line, BuildConfig.VERSION_NAME),
                        fontSize = 8.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
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
    manager.applicationLocales = when (tag) {
        "de" -> LocaleList(Locale.GERMAN)
        "en" -> LocaleList(Locale.ENGLISH)
        else -> LocaleList.getEmptyLocaleList()
    }
}

@Composable
private fun Section(
    title: String,
    content: @Composable () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(title, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
        content()
    }
}

@Composable
private fun Options(
    label: String,
    options: List<Pair<String, String>>,
    current: String,
    onPick: (String) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(label, fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        options.forEach { (text, value) ->
            val on = value == current
            Text(
                text,
                fontSize = 8.sp,
                color = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(
                        if (on) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.surfaceContainerHighest,
                    )
                    .clickable { onPick(value) }
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
    }
}

@Composable
private fun ToggleRow(
    label: String,
    value: String,
    on: Boolean,
    onToggle: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurface)
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
            Text(
                value,
                fontSize = 8.sp,
                fontWeight = FontWeight.Bold,
                color = if (on) MaterialTheme.colorScheme.onSecondaryContainer
                else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(
                        if (on) MaterialTheme.colorScheme.secondaryContainer
                        else MaterialTheme.colorScheme.surfaceContainerHighest,
                    )
                    .clickable(onClick = onToggle)
                    .padding(horizontal = 9.dp, vertical = 3.dp),
            )
        }
    }
}

@Composable
private fun StepperRow(
    label: String,
    value: String,
    manual: Boolean = false,
    onStep: (Float) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
            StepChip("−") { onStep(-1f) }
            Text(value, fontSize = 9.sp, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(horizontal = 4.dp))
            StepChip("+") { onStep(1f) }
        }
    }
}

@Composable
private fun StepChip(
    text: String,
    onClick: () -> Unit,
) {
    Text(
        text,
        fontSize = 10.sp,
        color = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(MaterialTheme.colorScheme.surfaceContainerHighest)
            .clickable(onClick = onClick)
            .padding(horizontal = 7.dp, vertical = 1.dp),
    )
}

/**
 * One pattern colour: a swatch that cycles the phone app's palette and wraps
 * back to "theme colour", the same list `PATTERN_SWATCHES` uses there. Cycling
 * avoids a colour dialog, which is awkward with a controller ray.
 */
@Composable
private fun PatternColorRow(
    label: String,
    value: Int?,
    onPick: (Int?) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            label,
            fontSize = 9.sp,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        val swatch = value?.let { androidx.compose.ui.graphics.Color(it) } ?: MaterialTheme.colorScheme.surfaceVariant
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
                .padding(horizontal = 10.dp, vertical = 3.dp),
        ) {
            Text(
                if (value == null) {
                    stringResource(R.string.xr_color_default)
                } else {
                    String.format("#%06X", value and 0xFFFFFF)
                },
                fontSize = 8.sp,
                color = if (value == null) {
                    MaterialTheme.colorScheme.onSurfaceVariant
                } else {
                    androidx.compose.ui.graphics.Color.Black
                },
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
