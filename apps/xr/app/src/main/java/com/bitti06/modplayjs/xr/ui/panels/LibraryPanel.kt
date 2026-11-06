package com.bitti06.modplayjs.xr.ui.panels

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
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
    var selectedFolder by remember { mutableStateOf<String?>(null) }
    var favoritesVersion by remember { mutableIntStateOf(0) }
    val favorites = remember(version, favoritesVersion) { XrStore.favorites() }

    var isScanning by remember { mutableStateOf(false) }
    var scanCount by remember { mutableIntStateOf(0) }
    var scanCurrentItem by remember { mutableStateOf("") }

    LaunchedEffect(scanId, version) {
        isScanning = true
        scanCount = 0
        scanCurrentItem = ""
        val res = withContext(Dispatchers.IO) {
            XrStore.scan { count, item ->
                scanCount = count
                scanCurrentItem = item
            }
        }
        if (res != null) result = res
        isScanning = false
    }

    val foldersList = remember(result.tracks) {
        result.tracks.map { it.folder }.distinct().sorted()
    }

    val shown: List<TrackFile> =
        remember(result, filter, sort, query, favorites, selectedFolder) {
            val filtered =
                when (filter) {
                    Filter.All -> {
                        if (selectedFolder != null) {
                            result.tracks.filter { it.folder == selectedFolder }
                        } else {
                            result.tracks
                        }
                    }
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
        Row(
            modifier = Modifier.fillMaxWidth().weight(1f),
            horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm),
        ) {
            // Left Tree / Folder Navigation Sidebar
            Column(
                modifier = Modifier
                    .width(180.dp)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(PanelTokens.Radius))
                    .background(PanelTokens.SurfaceSunken)
                    .padding(PanelTokens.GapSm)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(PanelTokens.GapXs),
            ) {
                Text(
                    "LIBRARY",
                    fontSize = PanelTokens.Meta,
                    fontWeight = FontWeight.Bold,
                    color = PanelTokens.TextFaint,
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                )

                NavItem(
                    label = stringResource(R.string.xr_filter_all),
                    icon = "📁",
                    count = result.tracks.size,
                    selected = filter == Filter.All && selectedFolder == null,
                    onClick = {
                        filter = Filter.All
                        selectedFolder = null
                    },
                )

                NavItem(
                    label = stringResource(R.string.xr_filter_favorites),
                    icon = "★",
                    count = result.tracks.count { it.uri.toString() in favorites },
                    selected = filter == Filter.Favorites,
                    onClick = {
                        filter = Filter.Favorites
                        selectedFolder = null
                    },
                )

                NavItem(
                    label = stringResource(R.string.xr_filter_recent),
                    icon = "🕒",
                    count = XrStore.recents().size,
                    selected = filter == Filter.Recent,
                    onClick = {
                        filter = Filter.Recent
                        selectedFolder = null
                    },
                )

                if (foldersList.isNotEmpty()) {
                    Text(
                        "FOLDERS",
                        fontSize = PanelTokens.Meta,
                        fontWeight = FontWeight.Bold,
                        color = PanelTokens.TextFaint,
                        modifier = Modifier.padding(start = 4.dp, top = 8.dp, bottom = 2.dp),
                    )

                    foldersList.forEach { folderName ->
                        val trackCount = result.tracks.count { it.folder == folderName }
                        NavItem(
                            label = folderName,
                            icon = "📂",
                            count = trackCount,
                            selected = filter == Filter.All && selectedFolder == folderName,
                            onClick = {
                                filter = Filter.All
                                selectedFolder = folderName
                            },
                        )
                    }
                }

                Spacer(Modifier.weight(1f))

                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(50))
                            .background(PanelTokens.SurfaceRaised)
                            .clickable { XrStore.pickFolder() }
                            .padding(vertical = PanelTokens.GapXs),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("+ Folder", fontSize = PanelTokens.ChipText, color = PanelTokens.TextDim)
                    }
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(50))
                            .background(PanelTokens.SurfaceRaised)
                            .clickable { XrStore.pickFiles() }
                            .padding(vertical = PanelTokens.GapXs),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("+ File", fontSize = PanelTokens.ChipText, color = PanelTokens.TextDim)
                    }
                }
            }

            // Right File List & Search View
            Column(
                modifier = Modifier.weight(1f).fillMaxHeight(),
                verticalArrangement = Arrangement.spacedBy(PanelTokens.GapSm),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapXs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
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
                            .weight(1f)
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

                    Chip(stringResource(R.string.xr_sort, stringResource(sort.label))) {
                        sort = Sort.entries[(sort.ordinal + 1) % Sort.entries.size]
                    }
                    Chip(
                        if (isScanning) "⚡ ($scanCount)" else stringResource(R.string.xr_rescan),
                    ) {
                        if (!isScanning) scanId++
                    }
                }

                if (isScanning) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(PanelTokens.RadiusSmall))
                            .background(PanelTokens.SurfaceRaised)
                            .padding(horizontal = PanelTokens.Gap, vertical = PanelTokens.GapXs),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm),
                    ) {
                        Text(
                            "⚡ Scanning...",
                            fontSize = PanelTokens.Body,
                            fontWeight = FontWeight.Bold,
                            color = PanelTokens.Accent,
                        )
                        Text(
                            "$scanCount tracks",
                            fontSize = PanelTokens.Mono,
                            fontFamily = FontFamily.Monospace,
                            color = PanelTokens.AccentAlt,
                        )
                        if (scanCurrentItem.isNotBlank()) {
                            Text(
                                scanCurrentItem,
                                fontSize = PanelTokens.Meta,
                                color = PanelTokens.TextFaint,
                                maxLines = 1,
                                modifier = Modifier.weight(1f),
                            )
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
    }
}

@Composable
private fun NavItem(
    label: String,
    icon: String,
    count: Int,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(PanelTokens.RadiusSmall))
            .background(if (selected) PanelTokens.SurfaceRaised else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = PanelTokens.GapSm, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(icon, fontSize = PanelTokens.Body)
        Text(
            label,
            fontSize = PanelTokens.Body,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            color = if (selected) PanelTokens.Accent else PanelTokens.Text,
            maxLines = 1,
            modifier = Modifier.weight(1f),
        )
        if (count > 0) {
            Text(
                count.toString(),
                fontSize = PanelTokens.Meta,
                fontFamily = FontFamily.Monospace,
                color = if (selected) PanelTokens.AccentAlt else PanelTokens.TextFaint,
            )
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
