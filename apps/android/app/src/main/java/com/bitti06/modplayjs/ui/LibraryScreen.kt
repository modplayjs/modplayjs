package com.bitti06.modplayjs.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CreateNewFolder
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.library.FolderEntity
import com.bitti06.modplayjs.library.TrackEntity

const val ALL_ROOTS = "*"

private data class Subfolder(
    val name: String,
    val count: Int,
    val size: Long,
)

private fun scopeTracks(
    tracks: List<TrackEntity>,
    rootId: String,
    base: String,
): List<TrackEntity> =
    if (rootId == ALL_ROOTS) {
        tracks
    } else {
        tracks.filter { it.folderId == rootId && (base.isEmpty() || it.relativePath.startsWith("$base/")) }
    }

private fun split(
    scope: List<TrackEntity>,
    base: String,
): Pair<List<Subfolder>, List<TrackEntity>> {
    val prefix = if (base.isEmpty()) "" else "$base/"
    val folders = LinkedHashMap<String, Pair<Int, Long>>()
    val direct = ArrayList<TrackEntity>()
    for (track in scope) {
        val rest = track.relativePath.removePrefix(prefix)
        val slash = rest.indexOf('/')
        if (slash < 0) {
            direct += track
        } else {
            val name = rest.substring(0, slash)
            val current = folders[name] ?: (0 to 0L)
            folders[name] = (current.first + 1) to (current.second + track.size)
        }
    }
    val subs =
        folders.entries
            .sortedBy { it.key.lowercase() }
            .map { Subfolder(it.key, it.value.first, it.value.second) }
    return subs to direct
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(
    vm: AppViewModel,
    tracks: List<TrackEntity>,
    libraryTracks: List<TrackEntity>,
    folders: List<FolderEntity>,
    filters: Filters,
    rootId: String?,
    path: List<String>,
    onNavigate: (String?, List<String>) -> Unit,
    onPlay: (TrackEntity) -> Unit,
    onPlayList: (List<TrackEntity>, Int) -> Unit,
    onAddFolder: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    var showFilters by remember { mutableStateOf(false) }
    var showTrackActions by remember { mutableStateOf<TrackEntity?>(null) }
    var showDeleteConfirm by remember { mutableStateOf<TrackEntity?>(null) }
    var folderMenu by remember { mutableStateOf<FolderEntity?>(null) }
    val filtersActive =
        filters.status != "all" || filters.family != null || filters.format != null || filters.sort != "name" || filters.descending

    BackHandler(enabled = rootId != null || filters.search.isNotBlank()) {
        when {
            filters.search.isNotBlank() -> vm.updateFilters { it.copy(search = "") }
            path.isNotEmpty() -> onNavigate(rootId, path.dropLast(1))
            else -> onNavigate(null, emptyList())
        }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Library", style = MaterialTheme.typography.headlineMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, modifier = Modifier.weight(1f))
            IconButton(onClick = onAddFolder) { Icon(Icons.Default.CreateNewFolder, contentDescription = "Add folder") }
            IconButton(onClick = { showFilters = true }) {
                Icon(Icons.Default.FilterList, contentDescription = "Filters", tint = if (filtersActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = onOpenSettings) { Icon(Icons.Default.Settings, contentDescription = "Settings") }
        }
        OutlinedTextField(
            value = filters.search,
            onValueChange = { vm.updateFilters { f -> f.copy(search = it) } },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Search modules, paths") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            trailingIcon = {
                if (filters.search.isNotEmpty()) {
                    IconButton(onClick = { vm.updateFilters { it.copy(search = "") } }) {
                        Icon(Icons.Default.Close, contentDescription = "Clear search")
                    }
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(18.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surfaceContainer,
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainer,
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = Color.Transparent,
            ),
        )
        if (filtersActive) {
            Row(
                Modifier.fillMaxWidth().padding(top = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Filters active", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
                TextButton(onClick = { vm.resetFilters() }) { Text("Reset") }
            }
        }
        Spacer(Modifier.height(4.dp))

        when {
            // Nothing indexed: no browser, no all-tracks list, no search.
            folders.isEmpty() ->
                RootList(
                    folders = folders,
                    tracks = libraryTracks,
                    onOpen = { onNavigate(it, emptyList()) },
                    onAll = { onNavigate(ALL_ROOTS, emptyList()) },
                    onAddFolder = onAddFolder,
                    onFolderMenu = { folderMenu = it },
                )
            filters.search.isNotBlank() ->
                SearchResults(
                    tracks = tracks,
                    onPlay = onPlay,
                    onMore = { showTrackActions = it },
                    onToggleFavorite = { vm.toggleFavorite(it) },
                )
            rootId == ALL_ROOTS ->
                AllTracks(
                    tracks = tracks,
                    onPlay = onPlay,
                    onMore = { showTrackActions = it },
                    onToggleFavorite = { vm.toggleFavorite(it) },
                    onExit = { onNavigate(null, emptyList()) },
                )
            rootId == null -> RootList(
                folders = folders,
                tracks = libraryTracks,
                onOpen = { onNavigate(it, emptyList()) },
                onAll = { onNavigate(ALL_ROOTS, emptyList()) },
                onAddFolder = onAddFolder,
                onFolderMenu = { folderMenu = it },
            )
            else -> Browser(
                folders = folders,
                tracks = tracks,
                rootId = rootId,
                path = path,
                onNavigate = { newPath -> onNavigate(rootId, newPath) },
                onExit = { onNavigate(null, emptyList()) },
                onPlay = onPlay,
                onPlayList = onPlayList,
                onMore = { showTrackActions = it },
                onToggleFavorite = { vm.toggleFavorite(it) },
            )
        }
    }

    if (showFilters) {
        ModalBottomSheet(
            onDismissRequest = { showFilters = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        ) {
            FilterSheet(
                vm = vm,
                filters = filters,
                formats = libraryTracks.map { it.format }.distinct().sorted(),
                onDone = { showFilters = false },
            )
        }
    }

    showTrackActions?.let { track ->
        ModalBottomSheet(
            onDismissRequest = { showTrackActions = null },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        ) {
            TrackActionsSheet(
                track = track,
                onPlay = {
                    showTrackActions = null
                    onPlay(track)
                },
                onToggleFavorite = { vm.toggleFavorite(track) },
                onIgnore = {
                    vm.ignore(track)
                    showTrackActions = null
                },
                onDelete = {
                    showTrackActions = null
                    showDeleteConfirm = track
                },
            )
        }
    }

    showDeleteConfirm?.let { track ->
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = null },
            title = { Text("Delete permanently?") },
            text = { Text("\"${track.name}\" will be deleted from storage. This cannot be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    vm.deletePermanently(track)
                    showDeleteConfirm = null
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = null }) { Text("Cancel") } },
        )
    }

    folderMenu?.let { folder ->
        AlertDialog(
            onDismissRequest = { folderMenu = null },
            title = { Text(folder.name) },
            text = {
                Column {
                    Text("${folder.fileCount} files · ${folder.status}", style = MaterialTheme.typography.bodySmall)
                    val error = folder.error
                    if (error != null) {
                        Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    vm.rescan(folder.id)
                    folderMenu = null
                }) { Text("Rescan") }
            },
            dismissButton = {
                TextButton(onClick = {
                    vm.removeFolder(folder)
                    folderMenu = null
                }) { Text("Remove", color = MaterialTheme.colorScheme.error) }
            },
        )
    }
}

@Composable
private fun RootList(
    folders: List<FolderEntity>,
    tracks: List<TrackEntity>,
    onOpen: (String) -> Unit,
    onAll: () -> Unit,
    onAddFolder: () -> Unit,
    onFolderMenu: (FolderEntity) -> Unit,
) {
    LazyColumn(Modifier.fillMaxSize()) {
        if (folders.isNotEmpty()) {
            item {
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "Folders",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        "${tracks.size} tracks",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            item {
                FolderRow(
                    name = "All tracks",
                    trackCount = tracks.size,
                    onClick = onAll,
                )
            }
        }
        items(folders, key = { it.id }) { folder ->
            FolderRow(
                name = folder.name,
                trackCount = tracks.count { it.folderId == folder.id },
                onClick = { onOpen(folder.id) },
                onPlay = null,
                trailing = {
                    IconButton(onClick = { onFolderMenu(folder) }) {
                        Icon(Icons.Default.MoreVert, contentDescription = "Folder options")
                    }
                },
            )
        }
        if (folders.isEmpty()) {
            item {
                EmptyState(
                    title = "No folders yet",
                    body = "Add a folder to index your tracker modules, SID tunes or audio files.",
                    actionLabel = "Add folder",
                    onAction = onAddFolder,
                )
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun SearchResults(
    tracks: List<TrackEntity>,
    onPlay: (TrackEntity) -> Unit,
    onMore: (TrackEntity) -> Unit,
    onToggleFavorite: (TrackEntity) -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        Text(
            "${tracks.size} ${if (tracks.size == 1) "result" else "results"}",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(vertical = 8.dp),
        )
        if (tracks.isEmpty()) {
            EmptyState("Nothing found", "Try a different name or part of a folder path.")
        } else {
            LazyColumn(Modifier.weight(1f)) {
                items(tracks, key = { it.id }) { track ->
                    TrackRow(
                        track,
                        onClick = { onPlay(track) },
                        onLongClick = { onMore(track) },
                        onToggleFavorite = { onToggleFavorite(track) },
                        trailing = {
                            IconButton(onClick = { onMore(track) }) {
                                Icon(Icons.Default.MoreVert, contentDescription = "Track options")
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun AllTracks(
    tracks: List<TrackEntity>,
    onPlay: (TrackEntity) -> Unit,
    onMore: (TrackEntity) -> Unit,
    onToggleFavorite: (TrackEntity) -> Unit,
    onExit: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onExit) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Folders") }
            Text(
                "All folders · ${tracks.size} ${if (tracks.size == 1) "track" else "tracks"}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
        }
        HorizontalDivider()
        if (tracks.isEmpty()) {
            EmptyState("Nothing here", "Add a folder or change the filters.")
        } else {
            LazyColumn(Modifier.weight(1f)) {
                items(tracks, key = { it.id }) { track ->
                    TrackRow(
                        track,
                        onClick = { onPlay(track) },
                        onLongClick = { onMore(track) },
                        onToggleFavorite = { onToggleFavorite(track) },
                        trailing = {
                            IconButton(onClick = { onMore(track) }) {
                                Icon(Icons.Default.MoreVert, contentDescription = "Track options")
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun Browser(
    folders: List<FolderEntity>,
    tracks: List<TrackEntity>,
    rootId: String,
    path: List<String>,
    onNavigate: (List<String>) -> Unit,
    onExit: () -> Unit,
    onPlay: (TrackEntity) -> Unit,
    onPlayList: (List<TrackEntity>, Int) -> Unit,
    onMore: (TrackEntity) -> Unit,
    onToggleFavorite: (TrackEntity) -> Unit,
) {
    val base = path.joinToString("/")
    val scope = remember(tracks, rootId, base) { scopeTracks(tracks, rootId, base) }
    val (subfolders, direct) = remember(scope, base) { split(scope, base) }
    val rootName = folders.firstOrNull { it.id == rootId }?.name ?: "Folder"
    // A fresh list state per folder: opening a folder, entering a subfolder or
    // stepping up a breadcrumb always starts at the top instead of keeping the
    // scroll offset of the folder that was open before.
    val listState = remember(rootId, base) { LazyListState() }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onExit) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Folders") }
            TextButton(onClick = { onNavigate(emptyList()) }) {
                Text(rootName, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            path.forEachIndexed { index, segment ->
                Text("/", color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = { onNavigate(path.take(index + 1)) }) {
                    Text(segment, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                "${scope.size} ${if (scope.size == 1) "track" else "tracks"}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            FilledTonalButton(
                onClick = { onPlayList(scope, 0) },
                enabled = scope.isNotEmpty(),
                shape = CircleShape,
            ) {
                Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Play all")
            }
        }
        HorizontalDivider()
        LazyColumn(Modifier.weight(1f), state = listState) {
            if (subfolders.isNotEmpty()) {
                item { SectionTitle("Folders") }
                items(subfolders, key = { "f:${it.name}" }) { folder ->
                    val childBase = if (base.isEmpty()) folder.name else "$base/${folder.name}"
                    val childPrefix = "$childBase/"
                    FolderRow(
                        name = folder.name,
                        trackCount = folder.count,
                        onClick = { onNavigate(path + folder.name) },
                        onPlay = {
                            onPlayList(
                                scope.filter { it.relativePath.startsWith(childPrefix) },
                                0,
                            )
                        },
                    )
                }
            }
            if (direct.isNotEmpty()) {
                item { SectionTitle(if (subfolders.isEmpty()) "Tracks" else "Files here") }
                items(direct, key = { it.id }) { track ->
                    TrackRow(
                        track,
                        onClick = { onPlay(track) },
                        onLongClick = { onMore(track) },
                        onToggleFavorite = { onToggleFavorite(track) },
                        trailing = {
                            IconButton(onClick = { onMore(track) }) {
                                Icon(Icons.Default.MoreVert, contentDescription = "Track options")
                            }
                        },
                    )
                }
            }
            if (subfolders.isEmpty() && direct.isEmpty()) {
                item { EmptyState("Empty folder", "No playable files match the current filters.") }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun FilterSheet(
    vm: AppViewModel,
    filters: Filters,
    formats: List<String>,
    onDone: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
        Text("Filters", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))
        Text("Status", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(filters.status == "all", { vm.updateFilters { it.copy(status = "all") } }, { Text("All") })
            FilterChip(filters.status == "missing", { vm.updateFilters { it.copy(status = "missing") } }, { Text("Missing") })
        }
        Text("Family", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(filters.family == null, { vm.updateFilters { it.copy(family = null) } }, { Text("All") })
            FilterChip(filters.family == "tracker", { vm.updateFilters { it.copy(family = "tracker") } }, { Text("Trackers") })
            FilterChip(filters.family == "sid", { vm.updateFilters { it.copy(family = "sid") } }, { Text("SID") })
            FilterChip(filters.family == "audio", { vm.updateFilters { it.copy(family = "audio") } }, { Text("Audio") })
        }
        Text("Format", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(filters.format == null, { vm.updateFilters { it.copy(format = null) } }, { Text("All") })
            formats.forEach { format ->
                FilterChip(filters.format == format, { vm.updateFilters { it.copy(format = format) } }, { Text(format.uppercase()) })
            }
        }
        Text("Sort", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("name", "format", "family", "size", "added", "modified").forEach { sort ->
                FilterChip(filters.sort == sort, { vm.updateFilters { it.copy(sort = sort) } }, { Text(sort.replaceFirstChar { c -> c.uppercase() }) })
            }
        }
        SwitchRow("Descending", filters.descending) { v -> vm.updateFilters { it.copy(descending = v) } }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = { vm.resetFilters() }) { Text("Reset") }
            TextButton(onClick = onDone) { Text("Done") }
        }
    }
}

@Composable
fun QueueScreen(
    queue: List<com.bitti06.modplayjs.engine.QueueItem>,
    index: Int,
    onPlay: (Int) -> Unit,
    onBack: () -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        ModalTopBar("Queue", onBack)
        LazyColumn(Modifier.fillMaxSize()) {
            items(queue.withIndex().toList(), key = { it.value.id }) { (i, item) ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 10.dp, horizontal = 4.dp)
                        .clickable { onPlay(i) },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        if (i == index) "▶" else "${i + 1}",
                        modifier = Modifier.width(32.dp),
                        color = if (i == index) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(item.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
fun IgnoredScreen(
    ignored: List<TrackEntity>,
    vm: AppViewModel,
    onBack: () -> Unit,
) {
    var confirm by remember { mutableStateOf<TrackEntity?>(null) }
    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        ModalTopBar("Ignored files", onBack)
        Text(
            "Removed from the library, still on your device, skipped by rescans.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 8.dp),
        )
        if (ignored.isEmpty()) {
            EmptyState("No ignored files", "Files you remove from the library end up here.")
        } else {
            LazyColumn(Modifier.fillMaxSize()) {
                items(ignored, key = { it.id }) { track ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(track.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                track.relativePath,
                                style = MaterialTheme.typography.labelSmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        IconButton(onClick = { vm.restore(listOf(track)) }) {
                            Icon(Icons.Default.Refresh, contentDescription = "Restore")
                        }
                        IconButton(onClick = { confirm = track }) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }
    confirm?.let { track ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text("Delete permanently?") },
            text = { Text("\"${track.name}\" will be deleted from storage.") },
            confirmButton = {
                TextButton(onClick = {
                    vm.deletePermanently(track)
                    confirm = null
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text("Cancel") } },
        )
    }
}
