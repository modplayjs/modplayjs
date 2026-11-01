package com.bitti06.modplayjs.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bitti06.modplayjs.BuildConfig
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.engine.AndroidSnapshot
import com.bitti06.modplayjs.engine.AndroidTrack
import com.bitti06.modplayjs.library.FolderEntity
import com.bitti06.modplayjs.library.TrackEntity
import kotlinx.coroutines.launch
import androidx.compose.foundation.lazy.grid.items as gridItems

private val screens =
    listOf(
        "home" to "Home",
        "search" to "Search",
        "library" to "Library",
        "player" to "Playing",
    )

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun App(vm: AppViewModel) {
    val settings by vm.settings.collectAsStateWithLifecycle()
    ModplayTheme(dark = settings.view.theme != "light") { AppBody(vm, settings) }
}

@Composable
private fun AppBody(
    vm: AppViewModel,
    settings: AndroidSettings,
) {
    val context = LocalContext.current
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val tracks by vm.tracks.collectAsStateWithLifecycle()
    val folders by vm.folders.collectAsStateWithLifecycle()
    val ignored by vm.ignored.collectAsStateWithLifecycle()
    val queue by vm.queue.collectAsStateWithLifecycle()
    val queueIndex by vm.queueIndex.collectAsStateWithLifecycle()
    val filters by vm.filters.collectAsStateWithLifecycle()
    var screen by rememberSaveable { mutableStateOf("home") }

    val folderPicker =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
            if (uri != null) vm.addFolder(uri)
        }

    BackHandler(enabled = screen !in screens.map { it.first }) { screen = "home" }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            Column {
                snapshot?.let { s ->
                    if (s.track != null && screen != "player") {
                        MiniPlayer(s, onOpen = { screen = "player" }, onToggle = { vm.togglePlay() })
                    }
                }
                NavigationBar {
                    screens.forEach { (key, label) ->
                        NavigationBarItem(
                            selected = screen == key,
                            onClick = { screen = key },
                            icon = {
                                Icon(
                                    when (key) {
                                        "home" -> Icons.Default.Home
                                        "search" -> Icons.Default.Search
                                        "library" -> Icons.Default.LibraryMusic
                                        else -> Icons.Default.MusicNote
                                    },
                                    contentDescription = label,
                                )
                            },
                            label = { Text(label) },
                        )
                    }
                }
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (screen) {
                "home" -> {
                    HomeScreen(
                        tracks = tracks,
                        folders = folders,
                        onAddFolder = { folderPicker.launch(null) },
                        onRescan = { vm.rescan() },
                        onPlay = {
                            vm.play(it)
                            screen = "player"
                        },
                        onOpenLibrary = { screen = "library" },
                    )
                }

                "search", "library" -> {
                    LibraryScreen(
                        vm = vm,
                        tracks = tracks,
                        filters = filters,
                        folders = folders,
                        snapshot = snapshot,
                        onPlay = {
                            vm.play(it)
                            screen = "player"
                        },
                        onAddFolder = { folderPicker.launch(null) },
                        onRescan = { vm.rescan() },
                        onOpenSettings = { screen = "settings" },
                    )
                }

                "player" -> {
                    PlayerScreen(
                        snapshot = snapshot,
                        settings = settings,
                        vm = vm,
                        onDetails = { screen = "details" },
                        onQueue = { screen = "queue" },
                        onSettings = { screen = "settings" },
                        onBack = { screen = "library" },
                    )
                }

                "details" -> {
                    DetailsScreen(snapshot, vm) { screen = "player" }
                }

                "queue" -> {
                    QueueScreen(queue, queueIndex, onPlay = { vm.playQueue(it) }, onBack = { screen = "player" })
                }

                "settings" -> {
                    SettingsScreen(
                        vm = vm,
                        settings = settings,
                        folders = folders,
                        ignored = ignored,
                        onIgnored = { screen = "ignored" },
                        onBack = { screen = "home" },
                    )
                }

                "ignored" -> {
                    IgnoredScreen(ignored, vm) { screen = "settings" }
                }
            }
        }
    }
}

@Composable
private fun MiniPlayer(
    snap: AndroidSnapshot,
    onOpen: () -> Unit,
    onToggle: () -> Unit,
) {
    val track = snap.track ?: return
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onOpen)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Default.MusicNote, null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(track.title.ifBlank { track.name }, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold)
            Text(
                track.tracker.ifBlank {
                    track.format.uppercase()
                },
                style = MaterialTheme.typography.labelSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IconButton(onClick = onToggle) {
            Icon(if (snap.state.playing) Icons.Default.Pause else Icons.Default.PlayArrow, "play/pause")
        }
    }
}

@Composable
private fun HomeScreen(
    tracks: List<TrackEntity>,
    folders: List<FolderEntity>,
    onAddFolder: () -> Unit,
    onRescan: () -> Unit,
    onPlay: (TrackEntity) -> Unit,
    onOpenLibrary: () -> Unit,
) {
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Text("modplayjs", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Text("Tracker player", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onAddFolder) {
                    Icon(Icons.Default.CreateNewFolder, null)
                    Spacer(Modifier.width(6.dp))
                    Text("Add folder")
                }
                OutlinedButton(onClick = onRescan) {
                    Icon(Icons.Default.Refresh, null)
                    Spacer(Modifier.width(6.dp))
                    Text("Rescan")
                }
            }
            Text("${folders.size} folders", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item { SectionTitle("Recently added") }
        if (tracks.isEmpty()) {
            item {
                Text("No tracks yet. Add a folder to index your modules.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        items(tracks.take(12), key = { it.id }) { TrackRow(it, onClick = { onPlay(it) }) }
        item { TextButton(onClick = onOpenLibrary) { Text("Open library") } }
    }
}

@Composable
private fun TrackRow(
    track: TrackEntity,
    onClick: () -> Unit,
    onMore: (() -> Unit)? = null,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 7.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            track.format.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.width(52.dp),
        )
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
        if (track.availability == "missing") Icon(Icons.Default.Warning, "missing", tint = MaterialTheme.colorScheme.error)
        if (onMore != null) {
            IconButton(onClick = onMore, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Default.MoreVert, "more", modifier = Modifier.size(18.dp))
            }
        }
    }
}

@Composable
private fun LibraryScreen(
    vm: AppViewModel,
    tracks: List<TrackEntity>,
    filters: Filters,
    folders: List<FolderEntity>,
    snapshot: AndroidSnapshot?,
    onPlay: (TrackEntity) -> Unit,
    onAddFolder: () -> Unit,
    onRescan: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    var selected by remember { mutableStateOf<TrackEntity?>(null) }
    var confirmPermanent by remember { mutableStateOf<TrackEntity?>(null) }
    var sortMenu by remember { mutableStateOf(false) }
    var folderMenu by remember { mutableStateOf(false) }
    var formatMenu by remember { mutableStateOf(false) }
    val missing = tracks.count { it.availability == "missing" }

    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Library", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            IconButton(onClick = onAddFolder) { Icon(Icons.Default.CreateNewFolder, "add folder") }
            IconButton(onClick = onRescan) { Icon(Icons.Default.Refresh, "rescan") }
            IconButton(onClick = onOpenSettings) { Icon(Icons.Default.Settings, "settings") }
        }
        OutlinedTextField(
            value = filters.search,
            onValueChange = { vm.updateFilters { f -> f.copy(search = it) } },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Search modules") },
            leadingIcon = { Icon(Icons.Default.Search, null) },
            singleLine = true,
        )
        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(filters.status == "all", { vm.updateFilters { it.copy(status = "all") } }, { Text("All") })
            FilterChip(filters.status == "missing", { vm.updateFilters { it.copy(status = "missing") } }, { Text("Missing ($missing)") })
            FilterChip(filters.family == "tracker", {
                vm.updateFilters {
                    it.copy(
                        family =
                            if (it.family ==
                                "tracker"
                            ) {
                                null
                            } else {
                                "tracker"
                            },
                    )
                }
            }, { Text("Trackers") })
            FilterChip(filters.family == "sid", {
                vm.updateFilters {
                    it.copy(
                        family =
                            if (it.family ==
                                "sid"
                            ) {
                                null
                            } else {
                                "sid"
                            },
                    )
                }
            }, { Text("SID") })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box {
                TextButton(onClick = { sortMenu = true }) {
                    Text("Sort: ${filters.sort}")
                    Icon(Icons.Default.ArrowDropDown, null)
                }
                DropdownMenu(sortMenu, onDismissRequest = { sortMenu = false }) {
                    listOf("name", "format", "family", "size", "added", "modified", "missing").forEach { s ->
                        DropdownMenuItem(text = { Text(s) }, onClick = {
                            vm.updateFilters { it.copy(sort = s) }
                            sortMenu = false
                        })
                    }
                }
            }
            Box {
                TextButton(onClick = { formatMenu = true }) {
                    Text(filters.format?.uppercase() ?: "Format")
                    Icon(Icons.Default.ArrowDropDown, null)
                }
                DropdownMenu(formatMenu, onDismissRequest = { formatMenu = false }) {
                    DropdownMenuItem(text = { Text("All formats") }, onClick = {
                        vm.updateFilters { it.copy(format = null) }
                        formatMenu =
                            false
                    })
                    listOf("mod", "s3m", "xm", "it", "mtm", "stm", "669", "med", "mo3", "fc", "sid", "wav", "mp3", "ogg").forEach { f ->
                        DropdownMenuItem(text = { Text(f.uppercase()) }, onClick = {
                            vm.updateFilters { it.copy(format = f) }
                            formatMenu =
                                false
                        })
                    }
                }
            }
            Box {
                TextButton(onClick = { folderMenu = true }) {
                    Text(filters.folderId?.let { id -> folders.firstOrNull { it.id == id }?.name } ?: "All folders")
                    Icon(Icons.Default.ArrowDropDown, null)
                }
                DropdownMenu(folderMenu, onDismissRequest = { folderMenu = false }) {
                    DropdownMenuItem(text = { Text("All folders") }, onClick = {
                        vm.updateFilters { it.copy(folderId = null) }
                        folderMenu =
                            false
                    })
                    folders.forEach { f ->
                        DropdownMenuItem(text = { Text(f.name) }, onClick = {
                            vm.updateFilters { it.copy(folderId = f.id) }
                            folderMenu =
                                false
                        })
                    }
                }
            }
        }
        if (missing > 0 && filters.status != "missing") {
            Surface(
                color = MaterialTheme.colorScheme.errorContainer,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, null, tint = MaterialTheme.colorScheme.onErrorContainer)
                    Spacer(Modifier.width(8.dp))
                    Text("$missing files missing", modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer)
                    TextButton(onClick = { vm.updateFilters { it.copy(status = "missing") } }) { Text("Review") }
                }
            }
        }
        LazyColumn(Modifier.weight(1f)) {
            items(tracks, key = { it.id }) { t ->
                TrackRow(t, { onPlay(t) }, onMore = { selected = t })
            }
        }
    }

    selected?.let { t ->
        AlertDialog(
            onDismissRequest = { selected = null },
            title = { Text("Remove \"${t.name}\"?") },
            text = {
                Text(
                    "Remove from library adds it to Ignored files and keeps the file. Delete permanently removes the file from storage.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    vm.ignore(t)
                    selected = null
                }) { Text("Remove from library") }
            },
            dismissButton = {
                Row {
                    TextButton(onClick = {
                        confirmPermanent = t
                        selected = null
                    }) { Text("Delete permanently", color = MaterialTheme.colorScheme.error) }
                    TextButton(onClick = { selected = null }) { Text("Cancel") }
                }
            },
        )
    }
    confirmPermanent?.let { t ->
        AlertDialog(
            onDismissRequest = { confirmPermanent = null },
            title = { Text("Delete permanently?") },
            text = { Text("\"${t.name}\" will be deleted from storage. This cannot be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    vm.deletePermanently(t)
                    confirmPermanent = null
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmPermanent = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SectionTitle(text: String) =
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontWeight = FontWeight.SemiBold,
    )

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PlayerScreen(
    snapshot: AndroidSnapshot?,
    settings: AndroidSettings,
    vm: AppViewModel,
    onDetails: () -> Unit,
    onQueue: () -> Unit,
    onSettings: () -> Unit,
    onBack: () -> Unit,
) {
    val track = snapshot?.track
    val loading by vm.loading.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    var channelDialog by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.KeyboardArrowDown, "back") }
            Text("Now Playing", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            IconButton(onClick = onSettings) { Icon(Icons.Default.Settings, "settings") }
        }
        if (error != null) {
            Text(
                error!!,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
            )
        }
        if (track == null) {
            Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                val message =
                    when {
                        error != null -> error!!
                        loading != null -> "Loading $loading…"
                        else -> "No track loaded"
                    }
                Text(
                    message,
                    textAlign = TextAlign.Center,
                    color = if (error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                )
            }
            return
        }
        InfoPanel(track, Modifier.fillMaxWidth().height(300.dp))
        Spacer(Modifier.height(12.dp))
        Text(
            track.title.ifBlank {
                track.name
            },
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(track.tracker.ifBlank { track.format.uppercase() }, color = MaterialTheme.colorScheme.onSurfaceVariant)
        val dur = snapshot.state.durationMs
        val pos = snapshot.state.positionMs
        var drag by remember(track.id) { mutableStateOf<Float?>(null) }
        Slider(
            value = drag ?: if (dur > 0) (pos / dur).toFloat().coerceIn(0f, 1f) else 0f,
            onValueChange = { if (dur > 0) drag = it },
            onValueChangeFinished = {
                drag?.let { vm.seek((it * dur).toLong()) }
                drag = null
            },
            enabled = snapshot.capabilities.seekable,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(formatTime(drag?.let { (it * dur).toLong() } ?: pos.toLong()))
            Text(if (dur > 0) formatTime(dur.toLong()) else "∞")
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { vm.previous() }) { Icon(Icons.Default.SkipPrevious, "previous") }
            FilledIconButton(onClick = { vm.togglePlay() }, modifier = Modifier.size(64.dp)) {
                Icon(
                    if (snapshot.state.playing) Icons.Default.Pause else Icons.Default.PlayArrow,
                    "play/pause",
                    modifier = Modifier.size(34.dp),
                )
            }
            IconButton(onClick = { vm.next() }) { Icon(Icons.Default.SkipNext, "next") }
            IconButton(onClick = { vm.stop() }) { Icon(Icons.Default.Stop, "stop") }
        }
        val muted = snapshot.channels.count { it.muted }
        if (snapshot.capabilities.channelMute && settings.view.showChannelStrip && snapshot.channels.isNotEmpty()) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                SectionTitle("Channels")
                Spacer(Modifier.width(8.dp))
                Text(
                    "${snapshot.channels.size} channels · $muted muted",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { channelDialog = true }) { Text("Expand") }
            }
            ChannelStrip(snapshot, vm)
        }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onQueue, modifier = Modifier.weight(1f)) { Text("Queue") }
            OutlinedButton(onClick = onDetails, modifier = Modifier.weight(1f)) { Text("Details") }
            OutlinedButton(onClick = onSettings, modifier = Modifier.weight(1f)) { Text("Settings") }
        }
    }
    if (channelDialog && snapshot != null) ChannelDialog(snapshot, vm) { channelDialog = false }
}

@Composable
private fun InfoPanel(
    track: AndroidTrack,
    modifier: Modifier = Modifier,
) {
    Surface(modifier = modifier, shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (!track.message.isNullOrBlank()) {
                Text("MESSAGE", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                Text(track.message?.replace("\r", "") ?: "", style = MaterialTheme.typography.bodySmall)
            }
            if (track.instrumentList.isNotEmpty()) {
                Text("INSTRUMENTS", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                track.instrumentList.forEach { i ->
                    Text(
                        "${i.index + 1}. ${i.name.ifBlank { "(unnamed)" }}",
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }
            if (track.sampleList.isNotEmpty()) {
                Text("SAMPLES", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                track.sampleList.forEach { s ->
                    Text(
                        "${s.index + 1}. ${s.name.ifBlank { "(unnamed)" }}  ${s.length}${if (s.loop) " L" else ""}",
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }
            if (track.message.isNullOrBlank() && track.instrumentList.isEmpty() && track.sampleList.isEmpty()) {
                Text(
                    "${track.format.uppercase()} · ${track.channels} channels · ${track.tracker}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ChannelStrip(
    snapshot: AndroidSnapshot,
    vm: AppViewModel,
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
        items(snapshot.channels, key = { it.index }) { ch ->
            Surface(
                shape = RoundedCornerShape(8.dp),
                color =
                    when {
                        ch.solo -> MaterialTheme.colorScheme.primary
                        ch.muted -> MaterialTheme.colorScheme.surfaceVariant
                        else -> MaterialTheme.colorScheme.surface
                    },
                modifier =
                    Modifier.combinedClickable(
                        onClick = { vm.toggleChannel(ch.index) },
                        onLongClick = { vm.soloChannel(ch.index) },
                    ),
            ) {
                Text(
                    ch.label,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    color = if (ch.solo) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                    fontWeight = if (ch.muted) FontWeight.Normal else FontWeight.SemiBold,
                )
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ChannelDialog(
    snapshot: AndroidSnapshot,
    vm: AppViewModel,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Channels") },
        text = {
            Column {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(56.dp),
                    modifier = Modifier.height(280.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    gridItems(snapshot.channels) { ch ->
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = if (ch.muted) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.surface,
                            modifier =
                                Modifier.height(44.dp).combinedClickable(
                                    onClick = { vm.toggleChannel(ch.index) },
                                    onLongClick = { vm.soloChannel(ch.index) },
                                ),
                        ) {
                            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                                Text(ch.label, fontWeight = if (ch.muted) FontWeight.Normal else FontWeight.SemiBold)
                            }
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    TextButton(onClick = { vm.muteAll() }) { Text("Mute all") }
                    TextButton(onClick = { vm.unmuteAll() }) { Text("Unmute") }
                    TextButton(onClick = { vm.resetChannels() }) { Text("Reset") }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
    )
}

@Composable
private fun SettingsScreen(
    vm: AppViewModel,
    settings: AndroidSettings,
    folders: List<FolderEntity>,
    ignored: List<TrackEntity>,
    onIgnored: () -> Unit,
    onBack: () -> Unit,
) {
    val snap by vm.snapshot.collectAsStateWithLifecycle()
    val caps = snap?.capabilities
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "back") }
                Text("Settings", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            }
        }
        item { SectionTitle("Playback") }
        item {
            ChoiceRow("Repeat", listOf("off" to "Off", "all" to "All", "one" to "One"), settings.playback.repeat) { v ->
                vm.updateSettings {
                    it.copy(playback = it.playback.copy(repeat = v))
                }
            }
        }
        item {
            SwitchRow(
                "Shuffle",
                settings.playback.shuffle,
            ) { v -> vm.updateSettings { it.copy(playback = it.playback.copy(shuffle = v)) } }
        }
        item {
            SwitchRow("Auto-advance", settings.playback.autoAdvance) { v ->
                vm.updateSettings {
                    it.copy(playback = it.playback.copy(autoAdvance = v))
                }
            }
        }
        item {
            SwitchRow("Jam mode (mute song)", settings.playback.jamMode) { v ->
                vm.updateSettings {
                    it.copy(playback = it.playback.copy(jamMode = v))
                }
            }
        }

        item { SectionTitle("Audio") }
        item {
            SliderRow("Volume", settings.transport.volume.toFloat(), 0f..100f) { v ->
                vm.updateSettings {
                    it.copy(transport = it.transport.copy(volume = v.toInt()))
                }
            }
        }
        item {
            SliderRow(
                "Pan separation",
                settings.transport.panSeparation.toFloat(),
                0f..100f,
                enabled = caps?.panSeparation != false,
            ) { v ->
                vm.updateSettings {
                    it.copy(transport = it.transport.copy(panSeparation = v.toInt()))
                }
            }
        }
        item {
            ChoiceRow(
                "Interpolation",
                listOf("0" to "Nearest", "1" to "Linear", "2" to "Spline"),
                settings.transport.interpolation.toString(),
            ) { v ->
                vm.updateSettings {
                    it.copy(transport = it.transport.copy(interpolation = v.toInt()))
                }
            }
        }
        item {
            SliderRow("Voices", settings.transport.numVoices.toFloat(), 4f..64f) { v ->
                vm.updateSettings {
                    it.copy(transport = it.transport.copy(numVoices = v.toInt()))
                }
            }
        }
        item {
            ChoiceRow(
                "Sample rate",
                listOf("48000" to "48 kHz", "44100" to "44.1 kHz"),
                (settings.transport.sampleRate ?: 48000).toString(),
            ) { v ->
                vm.updateSettings {
                    it.copy(transport = it.transport.copy(sampleRate = v.toInt()))
                }
            }
        }
        item {
            SliderRow("Tempo factor", settings.transport.tempoFactor.toFloat(), 0.25f..4f) { v ->
                vm.updateSettings {
                    it.copy(transport = it.transport.copy(tempoFactor = v.toDouble()))
                }
            }
        }

        item { SectionTitle("Module") }
        item {
            ChoiceRow(
                "Mixer",
                listOf("libxmp" to "libxmp", "paula" to "Paula"),
                settings.mixer.mode,
                enabled = caps?.mixerMode != false,
            ) { v ->
                vm.updateSettings {
                    it.copy(mixer = it.mixer.copy(mode = v))
                }
            }
        }
        item {
            ChoiceRow(
                "Layout",
                listOf("panned" to "Module pan", "lrlr" to "L R L R", "lrrl" to "L R R L"),
                settings.mixer.layout,
                enabled =
                    caps?.mixer != false,
            ) { v -> vm.updateSettings { it.copy(mixer = it.mixer.copy(layout = v)) } }
        }
        item {
            ChoiceRow(
                "A500 filter",
                listOf("a500" to "LED off", "a500led" to "LED on"),
                settings.mixer.amigaFilter,
                enabled =
                    caps?.amigaFilter != false,
            ) { v -> vm.updateSettings { it.copy(mixer = it.mixer.copy(amigaFilter = v)) } }
        }
        item {
            SliderRow("Amplify", settings.mixer.amplify.toFloat(), 1f..32f) { v ->
                vm.updateSettings {
                    it.copy(mixer = it.mixer.copy(amplify = v.toInt()))
                }
            }
        }

        if (caps?.sidPanel == true) {
            item { SectionTitle("SID") }
            item {
                ChoiceRow(
                    "Chip",
                    listOf("0" to "Header", "6581" to "6581", "8580" to "8580"),
                    settings.sid.model.toString(),
                ) { v ->
                    vm.updateSettings {
                        it.copy(sid = it.sid.copy(model = v.toInt()))
                    }
                }
            }
            item {
                ChoiceRow(
                    "Video",
                    listOf("null" to "Header", "0" to "NTSC", "1" to "PAL"),
                    (
                        settings.sid.videoStandard?.toString()
                            ?: "null"
                    ),
                ) { v ->
                    vm.updateSettings {
                        it.copy(
                            sid =
                                it.sid.copy(
                                    videoStandard =
                                        if (v ==
                                            "null"
                                        ) {
                                            null
                                        } else {
                                            v.toInt()
                                        },
                                ),
                        )
                    }
                }
            }
            item {
                ChoiceRow(
                    "Quality",
                    listOf("light" to "Light", "hq" to "HQ", "sinc" to "Sinc"),
                    settings.sid.quality,
                ) { v ->
                    vm.updateSettings {
                        it.copy(sid = it.sid.copy(quality = v))
                    }
                }
            }
            item {
                ChoiceRow(
                    "Channels",
                    listOf("0" to "Mono", "1" to "Stereo", "3" to "Narrow"),
                    settings.sid.stereo.toString(),
                    enabled =
                        caps?.sidStereo == true,
                ) { v -> vm.updateSettings { it.copy(sid = it.sid.copy(stereo = v.toInt())) } }
            }
            item {
                SliderRow("Engine volume", settings.sid.volume.toFloat(), 0f..255f) { v ->
                    vm.updateSettings {
                        it.copy(sid = it.sid.copy(volume = v.toInt()))
                    }
                }
            }
        }

        item { SectionTitle("Appearance") }
        item {
            ChoiceRow("Theme", listOf("dark" to "Dark", "light" to "Light"), settings.view.theme) { v ->
                vm.updateSettings {
                    it.copy(view = it.view.copy(theme = v))
                }
            }
        }
        item {
            SwitchRow(
                "Strip trailing dots",
                settings.view.stripDots,
            ) { v -> vm.updateSettings { it.copy(view = it.view.copy(stripDots = v)) } }
        }
        item {
            SwitchRow(
                "Reduced motion",
                settings.view.reducedMotion,
            ) { v -> vm.updateSettings { it.copy(view = it.view.copy(reducedMotion = v)) } }
        }
        item {
            SwitchRow("Show channel strip", settings.view.showChannelStrip) { v ->
                vm.updateSettings {
                    it.copy(view = it.view.copy(showChannelStrip = v))
                }
            }
        }

        item { SectionTitle("Library & storage") }
        item { Text("${folders.size} folders · ${ignored.size} ignored", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        item { TextButton(onClick = { vm.rescan() }) { Text("Rescan library") } }
        item { OutlinedButton(onClick = onIgnored, modifier = Modifier.fillMaxWidth()) { Text("Ignored files (${ignored.size})") } }
        folders.forEach { f ->
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(f.name)
                        Text("${f.fileCount} files · ${f.status}", style = MaterialTheme.typography.labelSmall)
                    }
                    TextButton(onClick = { vm.rescan(f.id) }) { Text("Rescan") }
                    TextButton(onClick = { vm.removeFolder(f) }) { Text("Remove") }
                }
            }
        }

        item { SectionTitle("Diagnostics") }
        item { Text("V8: ${if (vm.v8Available) "available" else "stub — build with -Pv8Lib"}") }
        if (!vm.v8Available && vm.v8Error != null) {
            item { Text(vm.v8Error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }
        item { Text("Sample rate: ${vm.sampleRate} Hz · underruns: ${vm.underruns}") }
        item { Text("Build: ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})") }
        item { Text("modplayjs · BSD-3-Clause · V8 BSD-3-Clause", style = MaterialTheme.typography.labelSmall) }
    }
}

@Composable
private fun DetailsScreen(
    snapshot: AndroidSnapshot?,
    vm: AppViewModel,
    onBack: () -> Unit,
) {
    val track = snapshot?.track
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "back") }
                Text("Track details", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            }
        }
        if (track == null) {
            item { Text("No track") }
            return@LazyColumn
        }
        item { SectionTitle("Info") }
        listOf(
            "file" to track.name,
            "title" to track.title,
            "format" to track.format.uppercase(),
            "tracker" to track.tracker,
            "channels" to track.channels.toString(),
            "orders" to track.orders.toString(),
            "patterns" to track.patterns.toString(),
            "instruments" to track.instruments.toString(),
            "samples" to track.samples.toString(),
            "restart" to track.restart.toString(),
        ).forEach { (k, v) -> item { InfoRow(k, v) } }
        item { SectionTitle("Orders") }
        item {
            Text(
                track.orderList.joinToString(" ") {
                    it.toString().padStart(2, '0')
                },
                fontFamily = FontFamily.Monospace,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        item { SectionTitle("Instruments") }
        items(track.instrumentList, key = { "i${it.index}" }) { i ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { vm.auditionInstrument(i.index) }) { Icon(Icons.Default.PlayArrow, "audition") }
                Text(
                    "${i.index + 1}. ${i.name.ifBlank { "(unnamed)" }}",
                    fontFamily = FontFamily.Monospace,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        item { SectionTitle("Samples") }
        items(track.sampleList, key = { "s${it.index}" }) { s ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { vm.auditionSample(s.index) }) { Icon(Icons.Default.PlayArrow, "audition") }
                Text(
                    "${s.index + 1}. ${s.name.ifBlank { "(unnamed)" }}  ${s.length}${if (s.loop) " L" else ""}",
                    fontFamily = FontFamily.Monospace,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        item { SectionTitle("Channels (${snapshot.channels.size})") }
        if (snapshot.channels.none { it.canMute }) {
            item {
                Text(
                    "Channel mute is not available for this engine.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        items(snapshot.channels, key = { "c${it.index}" }) { c ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Switch(checked = !c.muted, onCheckedChange = { vm.toggleChannel(c.index) }, enabled = c.canMute)
                Text(" ${c.label}", modifier = Modifier.weight(1f))
                if (c.solo) Text("SOLO", color = MaterialTheme.colorScheme.primary)
            }
        }
        item { SectionTitle("Message") }
        item { Text(track.message ?: "No module message.", style = MaterialTheme.typography.bodySmall) }
    }
}

@Composable
private fun QueueScreen(
    queue: List<com.bitti06.modplayjs.engine.QueueItem>,
    index: Int,
    onPlay: (Int) -> Unit,
    onBack: () -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "back") }
            Text("Queue", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        }
        LazyColumn {
            items(queue.withIndex().toList(), key = { it.value.id }) { (i, item) ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 8.dp).clickable { onPlay(i) },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        if (i ==
                            index
                        ) {
                            "▶"
                        } else {
                            "${i + 1}"
                        },
                        modifier = Modifier.width(32.dp),
                        color =
                            if (i ==
                                index
                            ) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                    )
                    Text(item.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun IgnoredScreen(
    ignored: List<TrackEntity>,
    vm: AppViewModel,
    onBack: () -> Unit,
) {
    var confirm by remember { mutableStateOf<TrackEntity?>(null) }
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "back") }
            Text("Ignored files", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        }
        Text(
            "Files you removed from the library. They stay on your device and are skipped by rescans.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (ignored.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("No ignored files") }
        } else {
            LazyColumn {
                items(ignored, key = { it.id }) { t ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(t.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                t.relativePath,
                                style = MaterialTheme.typography.labelSmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        TextButton(onClick = { vm.restore(listOf(t)) }) { Text("Restore") }
                        TextButton(onClick = { confirm = t }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
                    }
                }
            }
        }
    }
    confirm?.let { t ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text("Delete permanently?") },
            text = { Text("\"${t.name}\" will be deleted from storage.") },
            confirmButton = {
                TextButton(onClick = {
                    vm.deletePermanently(t)
                    confirm = null
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SwitchRow(
    label: String,
    checked: Boolean,
    enabled: Boolean = true,
    onChange: (Boolean) -> Unit,
) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            label,
            modifier = Modifier.weight(1f),
            color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}

@Composable
private fun SliderRow(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    enabled: Boolean = true,
    onChange: (Float) -> Unit,
) {
    Column {
        Row(Modifier.fillMaxWidth()) {
            Text(label, modifier = Modifier.weight(1f))
            Text(value.toInt().toString(), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Slider(value = value.coerceIn(range), onValueChange = onChange, valueRange = range, enabled = enabled)
    }
}

@Composable
private fun ChoiceRow(
    label: String,
    options: List<Pair<String, String>>,
    selected: String,
    enabled: Boolean = true,
    onSelect: (String) -> Unit,
) {
    Column {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            items(options) { (value, text) ->
                FilterChip(selected == value, { onSelect(value) }, { Text(text) }, enabled = enabled)
            }
        }
    }
}

@Composable
private fun InfoRow(
    label: String,
    value: String,
) {
    Row(Modifier.fillMaxWidth()) {
        Text(
            label,
            modifier = Modifier.width(100.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
        )
        Text(value, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

private fun formatTime(ms: Long): String {
    val s = (ms / 1000).coerceAtLeast(0)
    return "%d:%02d".format(s / 60, s % 60)
}
