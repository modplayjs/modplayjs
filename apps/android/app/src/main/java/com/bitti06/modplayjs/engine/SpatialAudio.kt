package com.bitti06.modplayjs.engine

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.Spatializer
import android.os.Build
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * One channel bed the platform can render with a distinct position per speaker.
 *
 * [mask] is an `AudioFormat.CHANNEL_OUT_*` position mask. It is also the
 * channel order inside a frame (LSB first), so it is exactly what a bed
 * renderer has to pan into - not just a label. [name] is the standard name
 * ("5.1", "7.1.4"), or null for a layout without a familiar one.
 */
data class SpatialLayout(
    val mask: Int,
    val name: String?,
    val channels: Int,
)

/**
 * What the platform reports about spatial audio on the current output.
 *
 * Read-only on purpose. Whether spatial audio and head tracking are on is a
 * system setting per audio device; Android exposes no API to change either.
 * An app can query, react, and send the user to the page that owns them - it
 * cannot switch them on.
 */
data class SpatialCapabilities(
    val supported: Boolean = false,
    val available: Boolean = false,
    val enabled: Boolean = false,
    val headTracker: Boolean = false,
    val layouts: List<SpatialLayout> = emptyList(),
)

/**
 * The platform's spatializer, as seen from an app.
 *
 * `getSpatializedChannelMasks()` is the interesting one: it lists the beds the
 * effect renders with *individual* channel positions. `canBeSpatialized()`
 * would answer "yes" for a wider mask too, but the rear and top pairs would be
 * folded together, so it cannot be used to tell the user what they are getting.
 *
 * The list is a capability of the device; whether the effect is actually used
 * still depends on the current output, which is what [SpatialCapabilities.available]
 * reports and what the audio device callback keeps fresh.
 */
class SpatialAudio(
    context: Context,
) {
    private val manager = context.getSystemService(AudioManager::class.java)
    private val spatializer: Spatializer? = runCatching { manager?.spatializer }.getOrNull()
    private val executor = context.mainExecutor

    private val _capabilities = MutableStateFlow(read())
    val capabilities: StateFlow<SpatialCapabilities> = _capabilities.asStateFlow()

    private val stateListener =
        object : Spatializer.OnSpatializerStateChangedListener {
            override fun onSpatializerEnabledChanged(
                spat: Spatializer,
                enabled: Boolean,
            ) = refresh()

            override fun onSpatializerAvailableChanged(
                spat: Spatializer,
                available: Boolean,
            ) = refresh()
        }

    private val headTrackerListener =
        object : Spatializer.OnHeadTrackerAvailableListener {
            override fun onHeadTrackerAvailableChanged(
                spatializer: Spatializer,
                available: Boolean,
            ) = refresh()
        }

    /**
     * Plugging in or removing a headset changes what the effect can do, and the
     * spatializer does not report that on its own.
     */
    private val deviceCallback =
        object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) = refresh()

            override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) = refresh()
        }

    init {
        spatializer?.let {
            runCatching { it.addOnSpatializerStateChangedListener(executor, stateListener) }
            runCatching { it.addOnHeadTrackerAvailableListener(executor, headTrackerListener) }
        }
        runCatching {
            manager?.registerAudioDeviceCallback(deviceCallback, Handler(Looper.getMainLooper()))
        }
    }

    /** Re-read after a change the platform did not report through a listener. */
    fun refresh() {
        _capabilities.value = read()
    }

    fun close() {
        spatializer?.let {
            runCatching { it.removeOnSpatializerStateChangedListener(stateListener) }
            runCatching { it.removeOnHeadTrackerAvailableListener(headTrackerListener) }
        }
        runCatching { manager?.unregisterAudioDeviceCallback(deviceCallback) }
    }

    private fun read(): SpatialCapabilities {
        val sp = spatializer ?: return SpatialCapabilities()
        val level = runCatching { sp.immersiveAudioLevel }.getOrNull() ?: return SpatialCapabilities()
        if (level == Spatializer.SPATIALIZER_IMMERSIVE_LEVEL_NONE) return SpatialCapabilities()
        return SpatialCapabilities(
            supported = true,
            available = runCatching { sp.isAvailable }.getOrDefault(false),
            enabled = runCatching { sp.isEnabled }.getOrDefault(false),
            headTracker = runCatching { sp.isHeadTrackerAvailable }.getOrDefault(false),
            // API 36. On API 35 there is no honest answer to "which beds survive
            // intact", so the list stays empty instead of guessing from
            // canBeSpatialized(), which returns true for folded layouts too.
            layouts =
                if (Build.VERSION.SDK_INT >= 36) {
                    runCatching { spatialLayouts(sp.spatializedChannelMasks) }.getOrDefault(emptyList())
                } else {
                    emptyList()
                },
        )
    }
}

/**
 * Whether the app feeds the spatializer a multichannel bed yet.
 *
 * It does not: the engine renders stereo and the platform only spatializes
 * multichannel content, so head tracking is available but never applied to our
 * audio. Kept as one flag instead of a sentence duplicated in the UI, so the
 * screen stops claiming "not used" the moment the bed renderer lands.
 */
internal const val SPATIAL_BED_RENDERED = false

/** The mask to render into: the stored one if this device still reports it. */
internal fun effectiveLayout(
    stored: Int,
    reported: List<SpatialLayout>,
): SpatialLayout? {
    if (reported.isEmpty()) return null
    if (stored != 0) {
        reported.firstOrNull { it.mask == stored }?.let { return it }
        // The headset changed and the stored bed is gone. Fall back to the
        // widest reported one instead of rendering a mask the platform folds.
    }
    return reported.last()
}

/**
 * Turn reported masks into displayable, ordered layouts.
 *
 * Sorted by channel count so 5.1 comes before 7.1.4. Quad is the floor because
 * the framework does not spatialize anything narrower. Pure, so it is testable
 * without a device.
 */
internal fun spatialLayouts(masks: List<Int>): List<SpatialLayout> =
    masks
        .distinct()
        .map { SpatialLayout(it, spatialLayoutName(it), Integer.bitCount(it)) }
        .filter { it.channels >= 4 }
        .sortedWith(compareBy({ it.channels }, { it.mask }))

/** Standard name for a channel mask, or null when there is no common one. */
internal fun spatialLayoutName(mask: Int): String? =
    when (mask) {
        AudioFormat.CHANNEL_OUT_QUAD -> "Quad"
        AudioFormat.CHANNEL_OUT_5POINT1 -> "5.1"
        AudioFormat.CHANNEL_OUT_5POINT1POINT2 -> "5.1.2"
        AudioFormat.CHANNEL_OUT_5POINT1POINT4 -> "5.1.4"
        AudioFormat.CHANNEL_OUT_7POINT1_SURROUND -> "7.1"
        AudioFormat.CHANNEL_OUT_7POINT1POINT2 -> "7.1.2"
        AudioFormat.CHANNEL_OUT_7POINT1POINT4 -> "7.1.4"
        AudioFormat.CHANNEL_OUT_9POINT1POINT4 -> "9.1.4"
        AudioFormat.CHANNEL_OUT_9POINT1POINT6 -> "9.1.6"
        else -> null
    }
