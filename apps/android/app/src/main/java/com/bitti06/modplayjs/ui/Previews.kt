package com.bitti06.modplayjs.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.engine.AndroidSnapshot
import com.bitti06.modplayjs.engine.AndroidTrack
import com.bitti06.modplayjs.engine.InstrumentInfo
import com.bitti06.modplayjs.engine.SampleInfo
import com.bitti06.modplayjs.library.FolderEntity
import com.bitti06.modplayjs.library.TrackEntity

/**
 * Previews for Android Studio. Compose has no layout files, so the editor view
 * is the preview pane next to the code: these functions drive it with sample
 * data instead of Room and the engine.
 *
 * Screens that need [AppViewModel] are not previewable until their state is
 * hoisted; the ones below take plain data and are the ones worth a look while
 * tuning spacing.
 */
private fun previewTrack(
    id: String,
    name: String,
    format: String,
    folder: String,
    size: Long = 240_000,
    favorite: Boolean = false,
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
    addedAt = 1L,
    favoriteAt = if (favorite) 1L else null,
)

private fun previewFolders() =
    listOf(
        FolderEntity("f1", "content://preview/f1", "Modules", canWrite = true, fileCount = 4),
        FolderEntity("f2", "content://preview/f2", "Keygen", canWrite = false, fileCount = 2),
    )

private fun previewTracks() =
    listOf(
        previewTrack("1", "0BiT - Fax Spider 2.1 kg.xm", "xm", "f1", favorite = true),
        previewTrack("2", "4DiAMONDS - Luxology Modo 1.03.xm", "xm", "f1"),
        previewTrack("3", "KHG - Vegas Pro 12 crk.mod", "mod", "f1", 190_000),
        previewTrack("4", "ABAKUS - Indian Mission DE intro.xm", "xm", "f2"),
        previewTrack("5", "SnD - Ashampoo Antispyware 1.61.mod", "mod", "f2", 380_000),
        previewTrack("6", "Monty on the Run.sid", "sid", "f2", 6_000),
    )

@Composable
private fun PreviewFrame(dark: Boolean, content: @Composable () -> Unit) {
    ModplayTheme(dark = dark) { content() }
}

@Preview(name = "Home dark", showBackground = true, backgroundColor = 0xFF0C0A18)
@Composable
private fun HomePreview() {
    PreviewFrame(dark = true) {
        HomeScreen(
            tracks = previewTracks(),
            recent = previewTracks().take(3),
            folders = previewFolders(),
            favoritesCount = 1,
            onAddFolder = {},
            onRescan = {},
            onOpenLibrary = {},
            onOpenFavorites = {},
            onOpenFolder = {},
            onPlay = {},
            onToggleFavorite = {},
        )
    }
}

@Preview(name = "Home light", showBackground = true, backgroundColor = 0xFFFBF7FF)
@Composable
private fun HomeLightPreview() {
    PreviewFrame(dark = false) {
        HomeScreen(
            tracks = previewTracks(),
            recent = previewTracks().take(3),
            folders = previewFolders(),
            favoritesCount = 1,
            onAddFolder = {},
            onRescan = {},
            onOpenLibrary = {},
            onOpenFavorites = {},
            onOpenFolder = {},
            onPlay = {},
            onToggleFavorite = {},
        )
    }
}

@Preview(name = "Settings", showBackground = true, backgroundColor = 0xFF0C0A18)
@Composable
private fun SettingsPreview() {
    PreviewFrame(dark = true) {
        SettingsHub(onOpen = {}, onBack = {})
    }
}

private fun previewSnapshot() =
    AndroidSnapshot(
        track =
            AndroidTrack(
                id = "0BiT - Fax Spider 2.1 kg.xm",
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
                message =
                    """
                    |                  \.             .
                    |                  :  \ ______..  proudly   ..______ \  :
                    |                  <::.\......=-  Caramel  -=.....\ .::>
                    |                  +[:]  '\.    Condition   ./._ \  [:]+
                    |                  ::  ...  .. 3:01 min        ...__ \ ::
                    |                  :+\ ______.. Turn Resampling off!  +
                    |                  :: \ _____..  Use mpt or xmplay   ::
                    |                  ::'  \ ___...      - 31.07.2010 -
                    |                     plz watch with Terminal
                    """.trimMargin(),
            ),
    )

@Preview(name = "Message reader", showBackground = true, backgroundColor = 0xFF0C0A18)
@Composable
private fun MessagePreview() {
    PreviewFrame(dark = true) {
        TrackTextScreen(
            kind = TrackText.Message,
            snapshot = previewSnapshot(),
            settings = AndroidSettings(),
            onBack = {},
        )
    }
}

@Preview(name = "Track row", showBackground = true, backgroundColor = 0xFF0C0A18, heightDp = 120)
@Composable
private fun TrackRowPreview() {
    PreviewFrame(dark = true) {
        TrackRow(
            track = previewTracks().first(),
            onClick = {},
            onToggleFavorite = {},
        )
    }
}
