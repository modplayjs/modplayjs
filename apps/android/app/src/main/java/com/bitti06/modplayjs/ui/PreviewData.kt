package com.bitti06.modplayjs.ui

import androidx.compose.runtime.Composable
import com.bitti06.modplayjs.engine.AndroidCapabilities
import com.bitti06.modplayjs.engine.AndroidChannel
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.engine.AndroidSnapshot
import com.bitti06.modplayjs.engine.AndroidState
import com.bitti06.modplayjs.engine.AndroidTrack
import com.bitti06.modplayjs.engine.InstrumentInfo
import com.bitti06.modplayjs.engine.QueueItem
import com.bitti06.modplayjs.engine.SampleInfo
import com.bitti06.modplayjs.library.FolderEntity
import com.bitti06.modplayjs.library.TrackEntity

/**
 * Sample data for the Android Studio previews.
 *
 * Every screen carries a `@Preview` function that renders it from these values,
 * so the preview pane never touches Room, the V8 engine or an AudioTrack: those
 * need a device, and asking for them is what leaves a preview stuck on its
 * start-up screen. The preview functions are private and unreferenced in a
 * release build, so R8 drops them and the data below with them.
 */

fun previewTrack(
    id: String,
    name: String,
    format: String,
    folder: String,
    size: Long = 240_000,
    favorite: Boolean = false,
    availability: String = "available",
) = TrackEntity(
    id = id,
    folderId = folder,
    documentUri = "content://preview/$id",
    documentId = id,
    relativePath = name,
    name = name,
    mime = "application/octet-stream",
    size = size,
    lastModified = 0L,
    format = format,
    family = if (format == "sid") "sid" else "tracker",
    availability = availability,
    addedAt = 1L,
    favoriteAt = if (favorite) 1L else null,
)

fun previewTracks(): List<TrackEntity> =
    listOf(
        previewTrack("1", "0BiT - Fax Spider 2.1 kg.xm", "xm", "f1", favorite = true),
        previewTrack("2", "4DiAMONDS - Luxology Modo 1.03.xm", "xm", "f1"),
        previewTrack("3", "KHG - Vegas Pro 12 crk.mod", "mod", "f1", 190_000),
        previewTrack("4", "ABAKUS - Indian Mission DE intro.xm", "xm", "f2"),
        previewTrack("5", "SnD - Ashampoo Antispyware 1.61.mod", "mod", "f2", 380_000),
        previewTrack("6", "Monty on the Run.sid", "sid", "f2", 6_000, availability = "missing"),
    )

fun previewFolders(): List<FolderEntity> =
    listOf(
        FolderEntity("f1", "content://preview/f1", "Modules", canWrite = true, fileCount = 4),
        FolderEntity("f2", "content://preview/f2", "Keygen", canWrite = false, fileCount = 2),
    )

fun previewQueue(): List<QueueItem> =
    previewTracks().map { QueueItem(it.id, it.name, it.documentUri, it.format) }

/** A few lines of the real message, columns and backslashes untouched. */
private val PREVIEW_MESSAGE =
    listOf(
        "                  \\.             .",
        "                  :  \\ ______..  proudly   ..______ \\  :",
        "                  <::.\\......=-  Caramel  -=.....\\ .::>",
        "                  +[:]  '\\.    Condition   ./._ \\  [:]+",
        "                  ::  ...  .. 3:01 min        ...__ \\ ::",
        "                  :+\\ ______.. Turn Resampling off!  +",
        "                  :: \\ _____..  Use mpt or xmplay   ::",
        "                  ::'  \\ ___...      - 31.07.2010 -",
        "                     plz watch with Terminal",
    ).joinToString("\n")

fun previewSnapshot(): AndroidSnapshot =
    AndroidSnapshot(
        state =
            AndroidState(
                playing = true,
                positionMs = 61_000.0,
                durationMs = 181_000.0,
                durationKnown = true,
                ord = 4,
                row = 12,
                pattern = 7,
                speed = 6,
                bpm = 125,
            ),
        track =
            AndroidTrack(
                id = "1",
                name = "0BiT - Fax Spider 2.1 kg.xm",
                title = "caramel condition",
                format = "xm",
                tracker = "ModPlug Tracker 1.16 XM 1.04",
                channels = 32,
                orders = 30,
                patterns = 28,
                instruments = 3,
                instrumentList =
                    listOf(
                        InstrumentInfo(0, "ko0x"),
                        InstrumentInfo(1, "Caramel Condition"),
                        InstrumentInfo(2, ""),
                    ),
                samples = 3,
                sampleList =
                    listOf(
                        SampleInfo(0, "ko0x", 2614, true),
                        SampleInfo(1, "Caramel Condition", 2010, false),
                        SampleInfo(2, "", 0, false),
                    ),
                message = PREVIEW_MESSAGE,
                durationMs = 181_000.0,
            ),
        channels =
            (0 until 8).map { index ->
                AndroidChannel(index = index, label = "C${index + 1}", muted = index == 3)
            },
        capabilities =
            AndroidCapabilities(
                loaded = true,
                streamed = true,
                sid = true,
                seekable = true,
                mixer = true,
                mixerMode = true,
                amigaFilter = true,
                panSeparation = true,
                channelMute = true,
            ),
    )

fun previewSettings(): AndroidSettings = AndroidSettings()

/**
 * Every action as a no-op. The previews pass this instead of the view model, so
 * a tap in the preview does nothing rather than reaching for a real session.
 */
object PreviewActions : UiActions

/** The app theme, so previews match the running app instead of the IDE default. */
@Composable
fun PreviewFrame(dark: Boolean = true, content: @Composable () -> Unit) {
    ModplayTheme(dark = dark) { content() }
}
