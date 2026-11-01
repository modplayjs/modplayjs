package com.bitti06.modplayjs.engine

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

/** The queue and where playback was in it, as ids the library can resolve. */
@Serializable
data class SavedPlayback(
    val ids: List<String> = emptyList(),
    val index: Int = 0,
    val positionMs: Long = 0,
    val playing: Boolean = false,
)

/**
 * Where playback was when the process died: which list, which entry and how
 * far in. Stored apart from the settings because the position moves every few
 * seconds while the queue rarely does - two small writes rather than one large.
 */
class PlaybackStore(
    context: Context,
) {
    private val prefs = context.getSharedPreferences("modplayjs-play", Context.MODE_PRIVATE)

    fun load(): SavedPlayback? {
        val ids = prefs.getString(KEY_QUEUE, null)?.let { json ->
            runCatching { EngineJson.decodeFromString<SavedQueue>(json) }.getOrNull()
        } ?: return null
        if (ids.ids.isEmpty()) return null
        val position =
            prefs.getString(KEY_POSITION, null)?.let { json ->
                runCatching { EngineJson.decodeFromString<SavedPosition>(json) }.getOrNull()
            } ?: SavedPosition()
        return SavedPlayback(
            ids = ids.ids,
            index = ids.index,
            positionMs = position.positionMs,
            playing = position.playing,
        )
    }

    fun saveQueue(
        ids: List<String>,
        index: Int,
    ) {
        prefs.edit().putString(KEY_QUEUE, EngineJson.encodeToString(SavedQueue(ids, index))).apply()
    }

    fun savePosition(
        positionMs: Long,
        playing: Boolean,
    ) {
        prefs.edit().putString(KEY_POSITION, EngineJson.encodeToString(SavedPosition(positionMs, playing))).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY_QUEUE).remove(KEY_POSITION).apply()
    }

    private companion object {
        const val KEY_QUEUE = "queue"
        const val KEY_POSITION = "position"
    }
}

@Serializable
private data class SavedQueue(
    val ids: List<String>,
    val index: Int,
)

@Serializable
private data class SavedPosition(
    val positionMs: Long = 0,
    val playing: Boolean = false,
)
