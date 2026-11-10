package com.bitti06.modplayjs.xr.play

import android.util.Log
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.engine.ViewSettings
import com.bitti06.modplayjs.xr.audio.SpatialLayout
import com.bitti06.modplayjs.xr.state.Playhead
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * JSON -> state mapping for the engine.
 *
 * The V8 thread captures the raw strings (it owns the isolate); this class
 * parses them on [scope] and caches the expensive parts (track detail, pattern
 * cells are still fetched by the caller through V8). Keeping the parsing here
 * is what lets the render thread return to the mixer immediately.
 */
class EnginePoller(private val scope: CoroutineScope) {

    data class SnapshotInput(
        val raw: String?,
        val pattern: XrPlayer.PatternData,
        val playing: Boolean,
        val settings: AndroidSettings,
        val previous: XrPlayer.State,
        val loaded: Boolean,
        val durationMs: Long,
        val spatialInfo: XrPlayer.SpatialInfo,
        val debugVisible: Boolean,
        val levels: FloatArray,
    )

    data class SnapshotOutput(
        val state: XrPlayer.State,
        val playhead: Playhead,
    )

    private var cachedTrackDetail: XrPlayer.TrackDetail? = null
    private var cachedDetailKey: Pair<Boolean, Boolean>? = null
    private var cachedDetails: List<Pair<String, String>> = emptyList()
    private var cachedMessage = ""
    private var cachedCaps = CapsInfo()

    private data class CapsInfo(
        val canMute: Boolean = false,
        val canPattern: Boolean = false,
        val canMixer: Boolean = false,
        val canPan: Boolean = false,
        val seekable: Boolean = false,
    )

    fun pollSnapshot(input: SnapshotInput, onResult: (SnapshotOutput?) -> Unit) {
        scope.launch {
            onResult(runCatching { parseSnapshot(input) }.getOrNull())
        }
    }

    fun pollPlayhead(raw: String, onResult: (Playhead) -> Unit) {
        scope.launch {
            val playhead = parsePlayhead(raw) ?: return@launch
            onResult(playhead)
        }
    }

    fun pollSpatial(raw: String, onResult: (XrPlayer.SpatialInfo) -> Unit) {
        scope.launch {
            val info = runCatching { parseSpatialInfo(raw) }.getOrNull() ?: return@launch
            onResult(info)
        }
    }

    fun parseSpatialInfo(raw: String): XrPlayer.SpatialInfo {
        val obj = Json.parseToJsonElement(raw) as? JsonObject ?: return XrPlayer.SpatialInfo()
        val ch = obj["channels"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
        val layout = obj["layout"]?.jsonPrimitive?.content ?: "panned"
        val rawAz = (obj["azimuths"] as? kotlinx.serialization.json.JsonArray)
            ?.mapNotNull { it.jsonPrimitive.content.toFloatOrNull() } ?: emptyList()
        return XrPlayer.SpatialInfo(
            enabled = obj["enabled"]?.jsonPrimitive?.content == "true",
            available = obj["available"]?.jsonPrimitive?.content == "true",
            layout = layout,
            channels = ch,
            directions = SpatialLayout.directions(layout, ch, rawAz),
        )
    }

    private fun parseSnapshot(input: SnapshotInput): SnapshotOutput {
        val snap =
            input.raw?.let {
                runCatching { Json.parseToJsonElement(it) as? JsonObject }.getOrNull()
            }
        val state = snap?.get("state") as? JsonObject
        val track = snap?.get("track") as? JsonObject
        val caps = snap?.get("capabilities") as? JsonObject

        if (track != null) {
            // The sample list is the expensive part of the track object, so it
            // is only reformatted when a view option that shapes it changes.
            val detailKey = input.settings.view.sampleLengths to input.settings.view.sampleLoopFlags
            if (cachedTrackDetail == null || cachedDetailKey != detailKey) {
                cachedTrackDetail = readTrackDetail(track, input.settings.view)
                cachedDetailKey = detailKey
            }
            cachedDetails = track.entries
                .filterNot { (k, v) ->
                    k in setOf("instrumentList", "sampleList", "orderList", "artwork") ||
                        (k == "streamed" && (v is JsonNull || v.toString() == "null"))
                }
                .map { (k, v) -> k to v.toString().trim('"').take(80) }
            cachedMessage = track["message"]?.jsonPrimitive?.content ?: ""
        }
        // Capabilities follow the module *and* the mixer layout (`panSeparation`
        // is only offered for the panned layout), so they are read every time.
        cachedCaps =
            CapsInfo(
                canMute = caps?.get("channelMute")?.jsonPrimitive?.content == "true",
                canPattern = caps?.get("patternView")?.jsonPrimitive?.content == "true",
                canMixer = caps?.get("mixer")?.jsonPrimitive?.content == "true",
                canPan = caps?.get("panSeparation")?.jsonPrimitive?.content == "true",
                seekable = caps?.get("seekable")?.jsonPrimitive?.content == "true",
            )

        val current = input.previous
        val newPos = state?.get("positionMs")?.jsonPrimitive?.content?.toLongOrNull()
            ?.let { it / 1000L * 1000L } ?: 0L
        val newPattern =
            if (input.loaded) {
                input.pattern.copy(
                    row = state?.get("row")?.jsonPrimitive?.content?.toIntOrNull() ?: 0,
                )
            } else {
                XrPlayer.PatternData()
            }

        val next =
            current.copy(
                loaded = input.loaded,
                title = track?.get("title")?.jsonPrimitive?.content ?: current.title,
                format = track?.get("format")?.jsonPrimitive?.content ?: current.format,
                channels =
                    track?.get("channels")?.jsonPrimitive?.content?.toIntOrNull()
                        ?: current.channels,
                playing = input.playing,
                positionMs = newPos,
                durationMs =
                    state?.get("durationMs")?.jsonPrimitive?.content?.toLongOrNull()
                        ?: input.durationMs,
                spatialAvailable = input.spatialInfo.available,
                spatialEnabled = input.spatialInfo.enabled,
                layout = input.spatialInfo.layout,
                azimuths = input.spatialInfo.azimuths,
                elevations = input.spatialInfo.directions.map { it.elevation },
                debugSources = input.debugVisible,
                levels = if (input.debugVisible) input.levels.toList() else emptyList(),
                volume = input.settings.transport.volume,
                solo = snap?.get("soloChannel")?.jsonPrimitive?.content?.toIntOrNull() ?: -1,
                muted =
                    snap?.get("channels")
                        ?.let { element ->
                            runCatching {
                                (element as? kotlinx.serialization.json.JsonArray)?.mapNotNull { entry ->
                                    val obj = entry as? JsonObject
                                    val index =
                                        obj?.get("index")?.jsonPrimitive?.content?.toIntOrNull()
                                    val muted =
                                        obj?.get("muted")?.jsonPrimitive?.content == "true"
                                    if (muted && index != null) index else null
                                }?.toSet()
                            }.getOrDefault(current.muted)
                        } ?: current.muted,
                pattern = newPattern,
                details = cachedDetails,
                message = cachedMessage,
                canMute = cachedCaps.canMute,
                canPattern = cachedCaps.canPattern,
                canMixer = cachedCaps.canMixer,
                canPan = cachedCaps.canPan,
                seekable = cachedCaps.seekable,
                follow = input.settings.view.follow,
                visualizer = input.settings.view.visualizer,
                showChannelStrip = input.settings.view.showChannelStrip,
                stripDots = input.settings.view.stripDots,
                sampleLengths = input.settings.view.sampleLengths,
                sampleLoopFlags = input.settings.view.sampleLoopFlags,
                patternColors = input.settings.view.patternColors,
                trackDetail = cachedTrackDetail ?: current.trackDetail,
            )

        if (current.loaded != next.loaded) {
            Log.i(TAG, "state: loaded=${next.loaded}")
        }
        return SnapshotOutput(
            state = next,
            playhead = Playhead(row = next.pattern.row, pattern = next.pattern.pattern),
        )
    }

    private fun parsePlayhead(raw: String): Playhead? {
        val rowIdx = raw.indexOf("\"row\":")
        if (rowIdx < 0) return null
        var rowStart = rowIdx + 6
        while (rowStart < raw.length && raw[rowStart].isWhitespace()) rowStart++
        var rowEnd = rowStart
        while (rowEnd < raw.length && (raw[rowEnd].isDigit() || raw[rowEnd] == '-')) rowEnd++
        val row = raw.substring(rowStart, rowEnd).toIntOrNull() ?: return null

        val patIdx = raw.indexOf("\"pattern\":")
        if (patIdx < 0) return null
        var patStart = patIdx + 10
        while (patStart < raw.length && raw[patStart].isWhitespace()) patStart++
        var patEnd = patStart
        while (patEnd < raw.length && (raw[patEnd].isDigit() || raw[patEnd] == '-')) patEnd++
        val pattern = raw.substring(patStart, patEnd).toIntOrNull() ?: 0

        return Playhead(row = row, pattern = pattern)
    }

    /**
     * Details the phone app lists per instrument/sample. The engine already
     * excludes these lists from the flat `details` map (they are big), so they
     * are formatted here instead of shipping raw JSON to the panel.
     */
    private fun readTrackDetail(
        track: JsonObject?,
        view: ViewSettings,
    ): XrPlayer.TrackDetail {
        if (track == null) return XrPlayer.TrackDetail()
        fun array(key: String) = track[key] as? kotlinx.serialization.json.JsonArray

        val instruments =
            array("instrumentList")
                ?.mapNotNull { element ->
                    val obj = element as? JsonObject ?: return@mapNotNull null
                    val index =
                        obj["index"]?.jsonPrimitive?.content?.toIntOrNull()
                            ?: return@mapNotNull null
                    val name = obj["name"]?.jsonPrimitive?.content ?: ""
                    (index + 1).toString().padStart(2, '0') + "  " + name
                }
                .orEmpty()

        val samples =
            array("sampleList")
                ?.mapNotNull { element ->
                    val obj = element as? JsonObject ?: return@mapNotNull null
                    val index =
                        obj["index"]?.jsonPrimitive?.content?.toIntOrNull()
                            ?: return@mapNotNull null
                    val name = obj["name"]?.jsonPrimitive?.content ?: ""
                    val length = obj["length"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
                    val loop = obj["loop"]?.jsonPrimitive?.content == "true"
                    buildString {
                        append((index + 1).toString().padStart(2, '0'))
                        append("  ")
                        append(name)
                        if (view.sampleLengths) {
                            append("  ")
                            append(length)
                        }
                        if (view.sampleLoopFlags && loop) append(" L")
                    }
                }
                .orEmpty()

        val orders =
            array("orderList")
                ?.mapNotNull { it.jsonPrimitive.content.toIntOrNull() }
                ?.withIndex()
                ?.joinToString(" ") { (i, pattern) ->
                    i.toString().padStart(2, '0') + ":" + pattern.toString().padStart(2, '0')
                }
                .orEmpty()

        return XrPlayer.TrackDetail(
            instrumentList = instruments,
            sampleList = samples,
            orderList = orders,
        )
    }

    private companion object {
        const val TAG = "modplay-xr"
    }
}
