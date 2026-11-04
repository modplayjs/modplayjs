package com.bitti06.modplayjs.xr.ui.panels

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.library.ScanResult
import com.bitti06.modplayjs.xr.library.TrackFile
import com.bitti06.modplayjs.xr.state.XrStore
import com.bitti06.modplayjs.xr.ui.panel.Chip
import com.bitti06.modplayjs.xr.ui.panel.EmptyNote
import com.bitti06.modplayjs.xr.ui.panel.PanelScaffold
import com.bitti06.modplayjs.xr.ui.panel.PanelTokens
import com.bitti06.modplayjs.xr.ui.panel.SettingsButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private enum class Filter(@get:StringRes val label: Int) {
    All(R.string.xr_filter_all),
    Favorites(R.string.xr_filter_favorites),
    Recent(R.string.xr_filter_recent),
}

private enum class Sort(@get:StringRes val label: Int) {
    Name(R.string.xr_sort_name),
    Format(R.string.xr_sort_format),
    Size(R.string.xr_sort_size),
    Folder(R.string.xr_sort_folder),
}

@Composable
fun LibraryPanel() {
    val version by XrStore.libraryVersion.collectAsState()
    var result by remember { mutableStateOf(ScanResult(emptyList(), emptyList(), 0)) }
    var filter by remember { mutableStateOf(Filter.All) }
    var sort by remember { mutableStateOf(Sort.Name) }
    var query by remember { mutableStateOf("") }
    var scanId by remember { mutableIntStateOf(0) }
    // Favourites live in SharedPreferences, so a star tap has to rebuild the
    // filtered list even though the library itself did not change.
    var favoritesVersion by remember { mutableIntStateOf(0) }
    val favorites = remember(version, favoritesVersion) { XrStore.favorites() }

    LaunchedEffect(scanId, version) {
        result = withContext(Dispatchers.IO) { XrStore.scan() } ?: result
    }

    val shown: List<TrackFile> =
        remember(result, filter, sort, query, favorites) {
            val filtered =
                when (filter) {
                    Filter.All -> result.tracks
                    Filter.Favorites -> result.tracks.filter { it.uri.toString() in favorites }
                    Filter.Recent -> {
                        val byUri = result.tracks.associateBy { it.uri.toString() }
                        XrStore.recents().mapNotNull { byUri[it] }
                    }
                }.filter { query.isBlank() || it.title.contains(query, ignoreCase = true) }

            when (sort) {
                Sort.Name -> filtered.sortedBy { it.title.lowercase() }
                Sort.Format -> filtered.sortedWith(compareBy({ it.format }, { it.title.lowercase() }))
                Sort.Size -> filtered.sortedByDescending { it.size }
                Sort.Folder -> filtered.sortedWith(compareBy({ it.folder }, { it.title.lowercase() }))
            }
        }

    PanelScaffold(
        title = "modplay.js",
        subtitle = stringResource(R.string.home_tagline),
        headerActions = { SettingsButton() },
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm)) {
            StatCard(
                count = result.tracks.size.toString(),
                label = stringResource(R.string.stat_tracks),
                color = PanelTokens.Accent,
                modifier = Modifier.weight(1f),
                onClick = { filter = Filter.All },
            )
            StatCard(
                count = result.folders.size.toString(),
                label = stringResource(R.string.stat_folders),
                color = PanelTokens.AccentAlt,
                modifier = Modifier.weight(1f),
                onClick = { XrStore.pickFolder() },
            )
            StatCard(
                count = result.tracks.count { it.uri.toString() in favorites }.toString(),
                label = stringResource(R.string.stat_favorites),
                color = PanelTokens.AccentWarm,
                modifier = Modifier.weight(1f),
                onClick = { filter = Filter.Favorites },
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapXs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Filter.entries.forEach { entry ->
                Chip(stringResource(entry.label), selected = entry == filter) { filter = entry }
            }
            Spacer(Modifier.weight(1f))
            Chip(stringResource(R.string.xr_folders)) { XrStore.pickFolder() }
            Chip(stringResource(R.string.xr_files)) { XrStore.pickFiles() }
            Chip(stringResource(R.string.xr_sort, stringResource(sort.label))) {
                sort = Sort.entries[(sort.ordinal + 1) % Sort.entries.size]
            }
            Chip(stringResource(R.string.xr_rescan)) { scanId++ }
        }

        BasicTextField(
            value = query,
            onValueChange = { query = it },
            singleLine = true,
            textStyle =
                TextStyle(
                    color = PanelTokens.Text,
                    fontSize = PanelTokens.Body,
                    fontFamily = FontFamily.Monospace,
                ),
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(PanelTokens.RadiusSmall))
                .background(PanelTokens.SurfaceSunken)
                .padding(horizontal = PanelTokens.Gap, vertical = PanelTokens.GapSm),
            decorationBox = { inner ->
                if (query.isEmpty()) {
                    Text(
                        stringResource(R.string.xr_search_hint),
                        fontSize = PanelTokens.Body,
                        color = PanelTokens.TextFaint,
                    )
                }
                inner()
            },
        )

        if (result.folders.isNotEmpty()) {
            Row(horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm)) {
                result.folders.forEach { folder ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "${folder.name} ${folder.files}",
                            fontSize = PanelTokens.Mono,
                            fontFamily = FontFamily.Monospace,
                            color = PanelTokens.TextDim,
                        )
                        Text(
                            " ×",
                            fontSize = PanelTokens.Mono,
                            color = PanelTokens.AccentWarm,
                            modifier = Modifier
                                .clickable { XrStore.removeTree(folder.uri) }
                                .padding(horizontal = 2.dp),
                        )
                    }
                }
            }
        }

        if (shown.isEmpty()) {
            EmptyNote(
                when (filter) {
                    Filter.Favorites -> stringResource(R.string.xr_empty_favorites)
                    Filter.Recent -> stringResource(R.string.xr_empty_recent)
                    else -> stringResource(R.string.xr_empty_library)
                },
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxWidth().weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                items(shown, key = { it.uri.toString() }) { track ->
                    TrackRow(
                        track = track,
                        favorite = track.uri.toString() in favorites,
                        onPlay = { XrStore.playAt(shown, shown.indexOf(track)) },
                        onIgnore = { XrStore.ignore(track.uri) },
                        onFavorite = {
                            XrStore.toggleFavorite(track.uri)
                            favoritesVersion++
                        },
                    )
                }
            }
        }

    }
}

@Composable
private fun TrackRow(
    track: TrackFile,
    favorite: Boolean,
    onPlay: () -> Unit,
    onIgnore: () -> Unit,
    onFavorite: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(PanelTokens.RadiusSmall))
            .background(PanelTokens.SurfaceRaised)
            .clickable(onClick = onPlay)
            .padding(horizontal = PanelTokens.GapSm, vertical = PanelTokens.GapXs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm),
    ) {
        Text(
            track.format,
            fontSize = PanelTokens.Meta,
            fontWeight = FontWeight.Bold,
            color = PanelTokens.OnAccent,
            modifier = Modifier
                .clip(RoundedCornerShape(3.dp))
                .background(PanelTokens.Accent)
                .padding(horizontal = 4.dp, vertical = 1.dp),
        )
        Text(
            track.title,
            fontSize = PanelTokens.Body,
            color = PanelTokens.Text,
            maxLines = 1,
            modifier = Modifier.weight(1f),
        )
        Text(
            track.folder,
            fontSize = PanelTokens.Meta,
            color = PanelTokens.TextFaint,
            maxLines = 1,
            modifier = Modifier.weight(0.6f),
        )
        Text(
            "${track.size / 1024}K",
            fontSize = PanelTokens.Mono,
            fontFamily = FontFamily.Monospace,
            color = PanelTokens.TextDim,
        )
        Text(
            "⌀",
            fontSize = PanelTokens.Body,
            color = PanelTokens.TextDim,
            modifier = Modifier.clickable(onClick = onIgnore).padding(horizontal = 2.dp),
        )
        Text(
            if (favorite) "★" else "☆",
            fontSize = PanelTokens.Body,
            color = if (favorite) PanelTokens.Accent else PanelTokens.TextDim,
            modifier = Modifier.clickable(onClick = onFavorite).padding(horizontal = 2.dp),
        )
    }
}

@Composable
private fun StatCard(
    count: String,
    label: String,
    color: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(PanelTokens.Radius))
            .background(PanelTokens.SurfaceRaised)
            .clickable(onClick = onClick)
            .padding(horizontal = PanelTokens.Gap, vertical = PanelTokens.GapSm),
    ) {
        Text(count, fontSize = PanelTokens.Stat, fontWeight = FontWeight.Bold, color = color)
        Text(label, fontSize = PanelTokens.Meta, color = PanelTokens.TextDim)
    }
}
