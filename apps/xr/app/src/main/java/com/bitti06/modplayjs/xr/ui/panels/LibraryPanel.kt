package com.bitti06.modplayjs.xr.ui.panels

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.XrApp
import com.bitti06.modplayjs.xr.library.Library
import com.bitti06.modplayjs.xr.library.ScanResult
import com.bitti06.modplayjs.xr.library.TrackFile
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
    val context = LocalContext.current
    val library = remember { Library(context) }
    var result by remember { mutableStateOf(ScanResult(emptyList(), emptyList(), 0)) }
    var filter by remember { mutableStateOf(Filter.All) }
    var sort by remember { mutableStateOf(Sort.Name) }
    var query by remember { mutableStateOf("") }
    var scanId by remember { mutableIntStateOf(0) }
    // Bumped on a star tap: favorites live in SharedPreferences, so the
    // filtered list has to be rebuilt while the library itself is unchanged.
    var favoritesVersion by remember { mutableIntStateOf(0) }
    val version by XrApp.libraryVersion.collectAsState()
    // favourites() copies a string set out of SharedPreferences; doing it per
    // row (twice: glyph + colour) was a prefs read per track per recompose.
    val favorites = remember(version, favoritesVersion) { library.favorites() }

    // One scan per library version change. Rescans walk every tree and
    // DocumentFile child on the IO pool, so they stay off the frame path and
    // never repeat for an identical button press.
    LaunchedEffect(scanId, version) {
        result = withContext(Dispatchers.IO) { library.scan() }
    }

    // Filter + sort run on every recomposition otherwise, over the whole
    // library: thousands of title.lowercase() calls per keystroke. Both are
    // pure, so key them on the inputs.
    val shown: List<TrackFile> =
        remember(result, filter, sort, query, favorites) {
            val filtered =
                when (filter) {
                    Filter.All -> result.tracks
                    Filter.Favorites -> result.tracks.filter { it.uri.toString() in favorites }
                    Filter.Recent -> {
                        val byUri = result.tracks.associateBy { it.uri.toString() }
                        library.recents().mapNotNull { byUri[it] }
                    }
                }.filter { query.isBlank() || it.title.contains(query, ignoreCase = true) }

            when (sort) {
                Sort.Name -> filtered.sortedBy { it.title.lowercase() }
                Sort.Format -> filtered.sortedWith(compareBy({ it.format }, { it.title.lowercase() }))
                Sort.Size -> filtered.sortedByDescending { it.size }
                Sort.Folder -> filtered.sortedWith(compareBy({ it.folder }, { it.title.lowercase() }))
            }
        }

    com.bitti06.modplayjs.xr.ui.GradientBackdrop {
        Column(
            modifier = Modifier.fillMaxSize(),
        ) {
        // Sticky Header: App Title, Tagline & Gear Icon to open Settings
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainer)
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    "modplay.js",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    stringResource(R.string.home_tagline),
                    fontSize = 9.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            // Home is this panel; the chip is here so every panel carries the
            // same control in the same corner.
            HomeChip()
            Spacer(Modifier.width(4.dp))
            // Gear icon button to open/toggle Settings panel
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer)
                    .clickable { XrApp.toggleSettings() }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text("⚙", fontSize = 13.sp, color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Text(
                        stringResource(R.string.xr_settings),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
            }
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 14.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // Stat Cards Row
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    StatCard(
                        count = result.tracks.size.toString(),
                        label = stringResource(R.string.stat_tracks),
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.weight(1f),
                        onClick = { filter = Filter.All },
                    )
                    StatCard(
                        count = result.folders.size.toString(),
                        label = stringResource(R.string.stat_folders),
                        color = MaterialTheme.colorScheme.secondary,
                        modifier = Modifier.weight(1f),
                        onClick = { XrApp.requestFolder() },
                    )
                    StatCard(
                        count = result.tracks.count { it.uri.toString() in favorites }.toString(),
                        label = stringResource(R.string.stat_favorites),
                        color = MaterialTheme.colorScheme.tertiary,
                        modifier = Modifier.weight(1f),
                        onClick = { filter = Filter.Favorites },
                    )
                }
            }

            // Filter Chips & Quick Actions
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Filter.entries.forEach { entry ->
                        val on = entry == filter
                        Text(
                            stringResource(entry.label),
                            fontSize = 9.sp,
                            fontWeight = if (on) FontWeight.Bold else FontWeight.Normal,
                            color = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainer)
                                .clickable { filter = entry }
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                        )
                    }

                    Spacer(Modifier.weight(1f))

                    Text(
                        stringResource(R.string.xr_folders),
                        fontSize = 9.sp,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(MaterialTheme.colorScheme.secondaryContainer)
                            .clickable { XrApp.requestFolder() }
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                    Text(
                        stringResource(R.string.xr_files),
                        fontSize = 9.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(MaterialTheme.colorScheme.surfaceContainer)
                            .clickable { XrApp.requestFiles() }
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                    Text(
                        stringResource(R.string.xr_sort, stringResource(sort.label)),
                        fontSize = 9.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(MaterialTheme.colorScheme.surfaceContainer)
                            .clickable {
                                sort = Sort.entries[(sort.ordinal + 1) % Sort.entries.size]
                            }
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                    Text(
                        stringResource(R.string.xr_rescan),
                        fontSize = 9.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(MaterialTheme.colorScheme.surfaceContainer)
                            .clickable { scanId++ }
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }

            // Search input
            item {
                BasicTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    textStyle = TextStyle(
                        color = MaterialTheme.colorScheme.onBackground,
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(6.dp))
                        .background(MaterialTheme.colorScheme.surfaceContainer)
                        .padding(horizontal = 8.dp, vertical = 5.dp),
                    decorationBox = { inner ->
                        if (query.isEmpty()) {
                            Text(
                                stringResource(R.string.xr_search_hint),
                                fontSize = 10.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        inner()
                    },
                )
            }

            // Folders summary
            if (result.folders.isNotEmpty()) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        result.folders.forEach { folder ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "${folder.name} ${folder.files}",
                                    fontSize = 8.sp,
                                    fontFamily = FontFamily.Monospace,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Text(
                                    " ×",
                                    fontSize = 10.sp,
                                    color = MaterialTheme.colorScheme.tertiary,
                                    modifier = Modifier
                                        .clickable {
                                            library.removeTree(folder.uri)
                                            XrApp.libraryChanged()
                                        }
                                        .padding(horizontal = 2.dp),
                                )
                            }
                        }
                    }
                }
            }

            // Track list
            if (shown.isEmpty()) {
                item {
                    Text(
                        when (filter) {
                            Filter.Favorites -> stringResource(R.string.xr_empty_favorites)
                            Filter.Recent -> stringResource(R.string.xr_empty_recent)
                            else -> stringResource(R.string.xr_empty_library)
                        },
                        fontSize = 9.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                items(shown, key = { it.uri.toString() }) { track ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(6.dp))
                            .clickable {
                                XrApp.playlist?.playAt(shown, shown.indexOf(track))
                            }
                            .padding(vertical = 4.dp, horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                    ) {
                        Text(
                            track.format,
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(MaterialTheme.colorScheme.primaryContainer)
                                .padding(horizontal = 5.dp, vertical = 2.dp),
                        )
                        Text(
                            track.title,
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onBackground,
                            maxLines = 1,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            track.folder,
                            fontSize = 7.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                        )
                        Text(
                            "⌀",
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .clickable {
                                    library.ignore(track.uri)
                                    XrApp.libraryChanged()
                                }
                                .padding(horizontal = 3.dp),
                        )
                        // One membership test per row instead of two prefs reads.
                        val isFavorite = track.uri.toString() in favorites
                        Text(
                            if (isFavorite) "★" else "☆",
                            fontSize = 11.sp,
                            color = if (isFavorite) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            modifier = Modifier
                                .clickable {
                                    library.toggleFavorite(track.uri)
                                    // A star only touches favourites; a full
                                    // libraryChanged() would rescan every tree.
                                    favoritesVersion++
                                }
                                .padding(horizontal = 3.dp),
                        )
                        Text(
                            "${track.size / 1024}K",
                            fontSize = 9.sp,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
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
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.Start,
    ) {
        Text(
            count,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            color = color,
        )
        Text(
            label,
            fontSize = 8.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

