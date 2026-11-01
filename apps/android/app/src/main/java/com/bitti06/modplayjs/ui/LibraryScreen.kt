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
import androidx.compose.material3.SheetValue
import androidx.compose.material3.rememberBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.R
import com.bitti06.modplayjs.library.FolderEntity
import com.bitti06.modplayjs.library.TrackEntity
import com.bitti06.modplayjs.ui.icons.AppIcons

const val ALL_ROOTS = "*"

/** Filter sort keys with their translated labels. */
private val SORT_LABELS =
    listOf(
        "name" to R.string.sort_name,
        "format" to R.string.sort_format,
        "family" to R.string.sort_family,
        "size" to R.string.sort_size,
        "added" to R.string.sort_added,
        "modified" to R.string.sort_modified,
    )

/** Folder status is stored as a key; only "ok" has a translation. */
@Composable
private fun folderStatusLabel(status: String): String =
    if (status == "ok") stringResource(R.string.folder_status_ok) else status

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
    val keyboard = LocalSoftwareKeyboardController.current
    val searchFocus = remember { FocusRequester() }
    var searchWasFocused by rememberSaveable { mutableStateOf(false) }
    // Android 17 does not restore IME visibility when the activity is
    // recreated by a configuration change, so re-focus and re-show it here.
    LaunchedEffect(Unit) {
        if (searchWasFocused) {
            // Consume it: returning to this tab later must not pop the keyboard.
            searchWasFocused = false
            searchFocus.requestFocus()
            withFrameNanos { }
            keyboard?.show()
        }
    }
    val filtersActive =
        filters.status != "all" || filters.family != null || filters.format != null || filters.sort != "name" || filters.descending

    BackHandler(enabled = rootId != null || filters.search.isNotBlank()) {
        when {
            filters.search.isNotBlank() -> vm.updateFilters { it.copy(search = "") }
            path.isNotEmpty() -> onNavigate(rootId, path.dropLast(1))
            else -> onNavigate(null, emptyList())
        }
    }

    Column(Modifier.fillMaxSize().safeContentPadding().padding(horizontal = 12.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.library_title),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onAddFolder) {
                Icon(AppIcons.CreateNewFolder, contentDescription = stringResource(R.string.common_add_folder))
            }
            IconButton(onClick = { showFilters = true }) {
                Icon(
                    AppIcons.FilterList,
                    contentDescription = stringResource(R.string.cd_filters),
                    tint =
                        if (filtersActive) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                )
            }
            IconButton(onClick = onOpenSettings) {
                Icon(AppIcons.Settings, contentDescription = stringResource(R.string.common_settings))
            }
        }
        OutlinedTextField(
            value = filters.search,
            onValueChange = { vm.updateFilters { f -> f.copy(search = it) } },
            modifier =
                Modifier
                    .fillMaxWidth()
                    .focusRequester(searchFocus)
                    .onFocusChanged { searchWasFocused = it.isFocused },
            placeholder = { Text(stringResource(R.string.library_search_hint)) },
            leadingIcon = {
                Icon(AppIcons.Search, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            },
            trailingIcon = {
                if (filters.search.isNotEmpty()) {
                    IconButton(onClick = { vm.updateFilters { it.copy(search = "") } }) {
                        Icon(AppIcons.Close, contentDescription = stringResource(R.string.cd_clear_search))
                    }
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(18.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                unfocusedContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = Color.Transparent,
            ),
        )
        if (filtersActive) {
            Row(
                Modifier.fillMaxWidth().padding(top = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    stringResource(R.string.library_filters_active),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = { vm.resetFilters() }) { Text(stringResource(R.string.common_reset)) }
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
            sheetState = rememberBottomSheetState(
                initialValue = SheetValue.Hidden,
                enabledValues = setOf(SheetValue.Hidden, SheetValue.Expanded),
            ),
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
            sheetState = rememberBottomSheetState(
                initialValue = SheetValue.Hidden,
                enabledValues = setOf(SheetValue.Hidden, SheetValue.Expanded),
            ),
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
            title = { Text(stringResource(R.string.delete_title)) },
            text = { Text(stringResource(R.string.delete_body, track.name)) },
            confirmButton = {
                TextButton(onClick = {
                    vm.deletePermanently(track)
                    showDeleteConfirm = null
                }) { Text(stringResource(R.string.common_delete), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = null }) {
                    Text(stringResource(R.string.common_cancel))
                }
            },
        )
    }

    folderMenu?.let { folder ->
        AlertDialog(
            onDismissRequest = { folderMenu = null },
            title = { Text(folder.name) },
            text = {
                Column {
                    Text(
                        pluralStringResource(
                            R.plurals.folder_files,
                            folder.fileCount,
                            folder.fileCount,
                            folderStatusLabel(folder.status),
                        ),
                        style = MaterialTheme.typography.bodySmall,
                    )
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
                }) { Text(stringResource(R.string.common_rescan)) }
            },
            dismissButton = {
                TextButton(onClick = {
                    vm.removeFolder(folder)
                    folderMenu = null
                }) { Text(stringResource(R.string.action_remove), color = MaterialTheme.colorScheme.error) }
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
    // Counted once for every folder row instead of once per row.
    val trackCounts = remember(tracks) { tracks.groupingBy { it.folderId }.eachCount() }
    LazyColumn(Modifier.fillMaxSize()) {
        if (folders.isNotEmpty()) {
            item {
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        stringResource(R.string.library_folders),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        pluralStringResource(R.plurals.track_count, tracks.size, tracks.size),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            item {
                FolderRow(
                    name = stringResource(R.string.folder_all_tracks),
                    trackCount = tracks.size,
                    onClick = onAll,
                )
            }
        }
        items(folders, key = { it.id }) { folder ->
            FolderRow(
                name = folder.name,
                trackCount = trackCounts[folder.id] ?: 0,
                onClick = { onOpen(folder.id) },
                onPlay = null,
                trailing = {
                    IconButton(onClick = { onFolderMenu(folder) }) {
                        Icon(
                            AppIcons.MoreVert,
                            contentDescription = stringResource(R.string.cd_folder_options),
                        )
                    }
                },
            )
        }
        if (folders.isEmpty()) {
            item {
                EmptyState(
                    title = stringResource(R.string.library_no_folders_title),
                    body = stringResource(R.string.library_no_folders_body),
                    actionLabel = stringResource(R.string.common_add_folder),
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
            pluralStringResource(R.plurals.library_results, tracks.size, tracks.size),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(vertical = 8.dp),
        )
        if (tracks.isEmpty()) {
            EmptyState(
                stringResource(R.string.library_nothing_found_title),
                stringResource(R.string.library_nothing_found_body),
            )
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
                                Icon(
                                    AppIcons.MoreVert,
                                    contentDescription = stringResource(R.string.common_track_options),
                                )
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
            IconButton(onClick = onExit) {
                Icon(AppIcons.ArrowBack, contentDescription = stringResource(R.string.cd_folders))
            }
            Text(
                pluralStringResource(R.plurals.library_all_folders, tracks.size, tracks.size),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
        }
        HorizontalDivider()
        if (tracks.isEmpty()) {
            EmptyState(
                stringResource(R.string.library_nothing_here_title),
                stringResource(R.string.library_nothing_here_body),
            )
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
                                Icon(
                                    AppIcons.MoreVert,
                                    contentDescription = stringResource(R.string.common_track_options),
                                )
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
    val rootName = folders.firstOrNull { it.id == rootId }?.name ?: stringResource(R.string.folder_fallback)
    // A fresh list state per folder: opening a folder, entering a subfolder or
    // stepping up a breadcrumb always starts at the top instead of keeping the
    // scroll offset of the folder that was open before.
    val listState = remember(rootId, base) { LazyListState() }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onExit) {
                Icon(AppIcons.ArrowBack, contentDescription = stringResource(R.string.cd_folders))
            }
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
                pluralStringResource(R.plurals.track_count, scope.size, scope.size),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            FilledTonalButton(
                onClick = { onPlayList(scope, 0) },
                enabled = scope.isNotEmpty(),
                shape = CircleShape,
            ) {
                Icon(AppIcons.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.action_play_all))
            }
        }
        HorizontalDivider()
        LazyColumn(Modifier.weight(1f), state = listState) {
            if (subfolders.isNotEmpty()) {
                item { SectionTitle(stringResource(R.string.library_folders)) }
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
                item {
                    SectionTitle(
                        stringResource(
                            if (subfolders.isEmpty()) R.string.library_tracks else R.string.library_files_here,
                        ),
                    )
                }
                items(direct, key = { it.id }) { track ->
                    TrackRow(
                        track,
                        onClick = { onPlay(track) },
                        onLongClick = { onMore(track) },
                        onToggleFavorite = { onToggleFavorite(track) },
                        trailing = {
                            IconButton(onClick = { onMore(track) }) {
                                Icon(
                                    AppIcons.MoreVert,
                                    contentDescription = stringResource(R.string.common_track_options),
                                )
                            }
                        },
                    )
                }
            }
            if (subfolders.isEmpty() && direct.isEmpty()) {
                item {
                    EmptyState(
                        stringResource(R.string.library_empty_folder_title),
                        stringResource(R.string.library_empty_folder_body),
                    )
                }
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
        Text(stringResource(R.string.cd_filters), style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.filter_status),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(
                filters.status == "all",
                { vm.updateFilters { it.copy(status = "all") } },
                { Text(stringResource(R.string.common_all)) },
            )
            FilterChip(
                filters.status == "missing",
                { vm.updateFilters { it.copy(status = "missing") } },
                { Text(stringResource(R.string.common_missing)) },
            )
        }
        Text(
            stringResource(R.string.filter_family),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(
                filters.family == null,
                { vm.updateFilters { it.copy(family = null) } },
                { Text(stringResource(R.string.common_all)) },
            )
            FilterChip(
                filters.family == "tracker",
                { vm.updateFilters { it.copy(family = "tracker") } },
                { Text(stringResource(R.string.filter_trackers)) },
            )
            FilterChip(
                filters.family == "sid",
                { vm.updateFilters { it.copy(family = "sid") } },
                { Text(stringResource(R.string.filter_sid)) },
            )
            FilterChip(
                filters.family == "audio",
                { vm.updateFilters { it.copy(family = "audio") } },
                { Text(stringResource(R.string.filter_audio)) },
            )
        }
        Text(
            stringResource(R.string.filter_format),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(
                filters.format == null,
                { vm.updateFilters { it.copy(format = null) } },
                { Text(stringResource(R.string.common_all)) },
            )
            formats.forEach { format ->
                FilterChip(filters.format == format, { vm.updateFilters { it.copy(format = format) } }, { Text(format.uppercase()) })
            }
        }
        Text(
            stringResource(R.string.filter_sort),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            SORT_LABELS.forEach { (sort, label) ->
                FilterChip(
                    filters.sort == sort,
                    { vm.updateFilters { it.copy(sort = sort) } },
                    { Text(stringResource(label)) },
                )
            }
        }
        SwitchRow(stringResource(R.string.filter_descending), filters.descending) { v ->
            vm.updateFilters { it.copy(descending = v) }
        }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = { vm.resetFilters() }) { Text(stringResource(R.string.common_reset)) }
            TextButton(onClick = onDone) { Text(stringResource(R.string.common_done)) }
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
        ModalTopBar(stringResource(R.string.queue_title), onBack)
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
        ModalTopBar(stringResource(R.string.ignored_title), onBack)
        Text(
            stringResource(R.string.ignored_body),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 8.dp),
        )
        if (ignored.isEmpty()) {
            EmptyState(
                stringResource(R.string.ignored_empty_title),
                stringResource(R.string.ignored_empty_body),
            )
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
                            Icon(AppIcons.Refresh, contentDescription = stringResource(R.string.cd_restore))
                        }
                        IconButton(onClick = { confirm = track }) {
                            Icon(
                                AppIcons.Delete,
                                contentDescription = stringResource(R.string.common_delete),
                                tint = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }
            }
        }
    }
    confirm?.let { track ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text(stringResource(R.string.delete_title)) },
            text = { Text(stringResource(R.string.delete_body_short, track.name)) },
            confirmButton = {
                TextButton(onClick = {
                    vm.deletePermanently(track)
                    confirm = null
                }) { Text(stringResource(R.string.common_delete), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { confirm = null }) { Text(stringResource(R.string.common_cancel)) }
            },
        )
    }
}
