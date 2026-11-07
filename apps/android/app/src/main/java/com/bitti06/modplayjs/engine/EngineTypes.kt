package com.bitti06.modplayjs.engine

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

val EngineJson =
    Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
    }

@Serializable
data class TransportSettings(
    val volume: Int = 100,
    val panSeparation: Int = 100,
    val sampleRate: Int? = null,
    val interpolation: Int = 1,
    val numVoices: Int = 32,
    val tempoFactor: Double = 1.0,
)

@Serializable
data class MixerSettings(
    val mode: String = "libxmp",
    val layout: String = "panned",
    val amigaFilter: String = "a500",
)

@Serializable
data class SidSettings(
    val model: Int = 0,
    val videoStandard: Int? = null,
    val quality: String = "light",
    val stereo: Int = 0,
    val volume: Int = 255,
)

@Serializable
data class PlaybackSettings(
    val repeat: String = "off",
    val shuffle: Boolean = false,
    val autoAdvance: Boolean = true,
    val jamMode: Boolean = false,
)

/**
 * Per-field colours of the pattern view, ARGB. Null means "use the theme's
 * colour for that field", so light and dark keep working and a reset is simply
 * clearing them.
 */
@Serializable
data class PatternColors(
    val note: Int? = null,
    val instrument: Int? = null,
    val volume: Int? = null,
    val effect: Int? = null,
)

@Serializable
data class ViewSettings(
    val theme: String = "dark",
    val artwork: Boolean = false,
    val patternView: Boolean = false,
    val follow: Boolean = true,
    val stripDots: Boolean = false,
    val reducedMotion: Boolean = false,
    val visualizer: String = "off",
    val showChannelStrip: Boolean = true,
    /** Show the sample length (and with it the loop flag) after the name. */
    val sampleLengths: Boolean = true,
    /** Show the trailing "L" for looping samples. */
    val sampleLoopFlags: Boolean = true,
    val patternColors: PatternColors = PatternColors(),
)

@Serializable
data class SpatialSettings(
    /**
     * Preferred channel bed, as an `AudioFormat.CHANNEL_OUT_*` mask, or 0 for
     * "the widest the device reports".
     *
     * A stored mask the device no longer reports falls back to 0 at the point of
     * use, not here: the setting must survive unplugging a headset without being
     * silently rewritten.
     */
    val layoutMask: Int = 0,
)

@Serializable
data class AndroidSettings(
    val schemaVersion: Int = 1,
    val transport: TransportSettings = TransportSettings(),
    val mixer: MixerSettings = MixerSettings(),
    val sid: SidSettings = SidSettings(),
    val playback: PlaybackSettings = PlaybackSettings(),
    val view: ViewSettings = ViewSettings(),
    val spatial: SpatialSettings = SpatialSettings(),
)

@Serializable
data class AndroidCapabilities(
    val loaded: Boolean = false,
    val streamed: Boolean = false,
    val sid: Boolean = false,
    val endless: Boolean = false,
    val seekable: Boolean = false,
    val patternView: Boolean = false,
    val mixer: Boolean = false,
    val mixerMode: Boolean = false,
    val amigaFilter: Boolean = false,
    val panSeparation: Boolean = false,
    val sidPanel: Boolean = false,
    val sidStereo: Boolean = false,
    val audition: Boolean = false,
    val channelMute: Boolean = false,
)

@Serializable
data class AndroidChannel(
    val index: Int,
    val label: String = "C${index + 1}",
    val muted: Boolean = false,
    val solo: Boolean = false,
    val volume: Int = 100,
    val canMute: Boolean = true,
)

@Serializable
data class InstrumentInfo(
    val index: Int,
    val name: String,
    val sampleId: Int? = null,
)

@Serializable
data class SampleInfo(
    val index: Int,
    val name: String,
    val length: Int,
    val loop: Boolean,
)

@Serializable
data class StreamedInfo(
    val format: String,
    val channels: Int,
    val sampleRate: Int,
    val durationMs: Double,
)

@Serializable
data class ArtworkInfo(
    val kind: String = "none",
    val uri: String? = null,
    val palette: String? = null,
)

@Serializable
data class AndroidTrack(
    val id: String = "",
    val name: String = "",
    val title: String = "",
    val format: String = "",
    val tracker: String = "",
    val channels: Int = 0,
    val orders: Int = 0,
    val orderList: List<Int> = emptyList(),
    val patterns: Int = 0,
    val instruments: Int = 0,
    val instrumentList: List<InstrumentInfo> = emptyList(),
    val samples: Int = 0,
    val sampleList: List<SampleInfo> = emptyList(),
    val restart: Int = 0,
    val globalVolume: Int = 0,
    val globalVolumeBase: Int = 0,
    val masterVolume: Int? = null,
    val masterVolumeBase: Int? = null,
    val message: String? = null,
    val durationMs: Double = 0.0,
    val endless: Boolean = false,
    val streamed: StreamedInfo? = null,
    val artwork: ArtworkInfo? = null,
)

/**
 * One pattern as preformatted tracker cells ("C-4 01 40 A0F"), fetched on
 * demand: rows x channels strings is far more than the snapshot carries.
 */
@Serializable
data class AndroidPattern(
    val pattern: Int = 0,
    val rows: Int = 0,
    val channels: Int = 0,
    /** Row-major: index = row * channels + channel. */
    val cells: List<String> = emptyList(),
)

@Serializable
data class AndroidState(
    val playing: Boolean = false,
    val paused: Boolean = false,
    val ended: Boolean = false,
    val seeking: Boolean = false,
    val positionMs: Double = 0.0,
    val durationMs: Double = 0.0,
    val durationKnown: Boolean = false,
    val ord: Int = 0,
    val row: Int = 0,
    val pattern: Int = 0,
    val rowProgress: Float = 0f,
    val speed: Int = 0,
    val bpm: Int = 0,
    val loopCount: Int = 0,
    val trackIndex: Int = 0,
    val repeat: String = "off",
    val shuffle: Boolean = false,
)

@Serializable
data class AndroidSnapshot(
    val schemaVersion: Int = 1,
    /**
     * What the engine build can play, e.g. "formats:mod,xm,...". A change means
     * formats were added or removed, so the library has to be rescanned.
     */
    val engineVersion: String = "",
    val state: AndroidState = AndroidState(),
    val track: AndroidTrack? = null,
    val channels: List<AndroidChannel> = emptyList(),
    val capabilities: AndroidCapabilities = AndroidCapabilities(),
    val settings: AndroidSettings = AndroidSettings(),
    val soloChannel: Int? = null,
)

@Serializable
data class QueueItem(
    val id: String,
    val name: String,
    val uri: String,
    val format: String = "",
)

/**
 * A failed play, kept as data so the UI can format it in the user's language
 * instead of the engine stitching an English sentence together.
 */
data class PlayError(
    val track: String,
    val reason: String,
)
