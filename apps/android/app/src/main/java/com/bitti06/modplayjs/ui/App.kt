package com.bitti06.modplayjs.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bitti06.modplayjs.engine.AndroidSnapshot
import com.bitti06.modplayjs.engine.QueueItem
import com.bitti06.modplayjs.library.TrackEntity

private enum class Tab(
    val label: String,
    val icon: ImageVector,
) {
    Home("Home", Icons.Default.Home),
    Library("Library", Icons.Default.LibraryMusic),
    Favorites("Favorites", Icons.Default.Favorite),
    Playing("Playing", Icons.Default.MusicNote),
}

@Composable
fun App(vm: AppViewModel) {
    val settings by vm.settings.collectAsStateWithLifecycle()
    ModplayTheme(dark = settings.view.theme != "light") { AppRoot(vm) }
}

@Composable
private fun AppRoot(vm: AppViewModel) {
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val tracks by vm.tracks.collectAsStateWithLifecycle()
    val libraryTracks by vm.libraryTracks.collectAsStateWithLifecycle()
    val recent by vm.recent.collectAsStateWithLifecycle()
    val favorites by vm.favorites.collectAsStateWithLifecycle()
    val folders by vm.folders.collectAsStateWithLifecycle()
    val ignored by vm.ignored.collectAsStateWithLifecycle()
    val queue by vm.queue.collectAsStateWithLifecycle()
    val queueIndex by vm.queueIndex.collectAsStateWithLifecycle()
    val filters by vm.filters.collectAsStateWithLifecycle()
    val loading by vm.loading.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()

    var tabName by rememberSaveable { mutableStateOf(Tab.Library.name) }
    val tab = Tab.entries.firstOrNull { it.name == tabName } ?: Tab.Library
    var modals by rememberSaveable { mutableStateOf(arrayListOf<String>()) }
    var libraryRoot by rememberSaveable { mutableStateOf<String?>(null) }
    var libraryPath by rememberSaveable { mutableStateOf(arrayListOf<String>()) }

    val folderPicker =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
            if (uri != null) vm.addFolder(uri)
        }

    val open: (String) -> Unit = { route -> modals = ArrayList(modals).apply { add(route) } }
    val close: () -> Unit = { modals = ArrayList(modals).apply { if (isNotEmpty()) removeAt(lastIndex) } }
    val playTrack: (TrackEntity) -> Unit = {
        vm.play(it)
        tabName = Tab.Playing.name
    }
    val playList: (List<TrackEntity>, Int) -> Unit = { list, index ->
        vm.playList(list, index)
        tabName = Tab.Playing.name
    }

    BackHandler(enabled = modals.isNotEmpty()) { close() }
    BackHandler(enabled = modals.isEmpty() && tab == Tab.Playing) { tabName = Tab.Library.name }

    Box(Modifier.fillMaxSize()) {
        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            bottomBar = {
                Column {
                    snapshot?.let { current ->
                        if (current.track != null && tab != Tab.Playing) {
                            MiniPlayer(
                                snap = current,
                                onOpen = { tabName = Tab.Playing.name },
                                onToggle = { vm.togglePlay() },
                            )
                        }
                    }
                    NavigationBar {
                        Tab.entries.forEach { item ->
                            NavigationBarItem(
                                selected = tab == item,
                                onClick = { tabName = item.name },
                                icon = { Icon(item.icon, contentDescription = item.label) },
                                label = { Text(item.label) },
                            )
                        }
                    }
                }
            },
        ) { padding ->
            Box(Modifier.padding(padding).fillMaxSize()) {
                when (tab) {
                    Tab.Home ->
                        HomeScreen(
                            tracks = libraryTracks,
                            recent = recent,
                            folders = folders,
                            favoritesCount = favorites.size,
                            onAddFolder = { folderPicker.launch(null) },
                            onRescan = { vm.rescan() },
                            onOpenSettings = { open(ROUTE_SETTINGS) },
                            onOpenLibrary = { tabName = Tab.Library.name },
                            onOpenFavorites = { tabName = Tab.Favorites.name },
                            onOpenFolder = { id ->
                                libraryRoot = id
                                libraryPath = arrayListOf()
                                tabName = Tab.Library.name
                            },
                            onPlay = playTrack,
                            onToggleFavorite = { vm.toggleFavorite(it) },
                        )

                    Tab.Library ->
                        LibraryScreen(
                            vm = vm,
                            tracks = tracks,
                            libraryTracks = libraryTracks,
                            folders = folders,
                            filters = filters,
                            rootId = libraryRoot,
                            path = libraryPath,
                            onNavigate = { root, path ->
                                libraryRoot = root
                                libraryPath = ArrayList(path)
                            },
                            onPlay = playTrack,
                            onPlayList = playList,
                            onAddFolder = { folderPicker.launch(null) },
                            onOpenSettings = { open(ROUTE_SETTINGS) },
                        )

                    Tab.Favorites ->
                        FavoritesScreen(
                            vm = vm,
                            favorites = favorites,
                            onPlay = playTrack,
                            onPlayList = playList,
                            onBrowseLibrary = { tabName = Tab.Library.name },
                        )

                    Tab.Playing ->
                        PlayerScreen(
                            vm = vm,
                            snapshot = snapshot,
                            settings = settings,
                            loading = loading,
                            error = error,
                            onOpenDetails = { open(ROUTE_DETAILS) },
                            onOpenQueue = { open(ROUTE_QUEUE) },
                            onBrowseLibrary = { tabName = Tab.Library.name },
                            onOpenSettings = { open(ROUTE_SETTINGS) },
                        )
                }
            }
        }
        if (modals.isNotEmpty()) {
            BackHandler { close() }
            ModalHost(
                route = modals.last(),
                vm = vm,
                snapshot = snapshot,
                settings = settings,
                folders = folders,
                ignored = ignored,
                queue = queue,
                queueIndex = queueIndex,
                onAddFolder = { folderPicker.launch(null) },
                onOpen = open,
                onBack = close,
            )
        }
    }
}

@Composable
private fun ModalHost(
    route: String,
    vm: AppViewModel,
    snapshot: AndroidSnapshot?,
    settings: com.bitti06.modplayjs.engine.AndroidSettings,
    folders: List<com.bitti06.modplayjs.library.FolderEntity>,
    ignored: List<TrackEntity>,
    queue: List<QueueItem>,
    queueIndex: Int,
    onAddFolder: () -> Unit,
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            when {
                route == ROUTE_SETTINGS ->
                SettingsHub(
                    vm = vm,
                    settings = settings,
                    folders = folders,
                    ignoredCount = ignored.size,
                    onOpen = onOpen,
                    onBack = onBack,
                )
            route == ROUTE_SETTINGS_PLAYBACK -> PlaybackSettingsScreen(vm, settings, onBack)
            route == ROUTE_SETTINGS_AUDIO ->
                AudioSettingsScreen(vm, settings, snapshot?.capabilities, onBack)
            route == ROUTE_SETTINGS_MIXER ->
                MixerSettingsScreen(vm, settings, snapshot?.capabilities, onBack)
            route == ROUTE_SETTINGS_SID -> SidSettingsScreen(vm, settings, onBack)
            route == ROUTE_SETTINGS_APPEARANCE -> AppearanceSettingsScreen(vm, settings, onBack)
            route == ROUTE_SETTINGS_LIBRARY ->
                LibrarySettingsScreen(
                    vm = vm,
                    folders = folders,
                    ignoredCount = ignored.size,
                    onAddFolder = onAddFolder,
                    onOpenIgnored = { onOpen(ROUTE_IGNORED) },
                    onBack = onBack,
                )
            route == ROUTE_SETTINGS_DIAGNOSTICS ->
                DiagnosticsScreen(vm = vm, onBack = onBack)
            route == ROUTE_ABOUT ->
                AboutScreen(
                    v8Available = vm.v8Available,
                    v8Error = vm.v8Error,
                    sampleRate = vm.sampleRate,
                    onOpenLicenses = { onOpen(ROUTE_LICENSES) },
                    onBack = onBack,
                )
            route == ROUTE_LICENSES -> LicensesScreen(onOpen = { onOpen(ROUTE_LICENSE_PREFIX + it) }, onBack = onBack)
            route.startsWith(ROUTE_LICENSE_PREFIX) -> {
                val entry = licenseEntry(route.removePrefix(ROUTE_LICENSE_PREFIX))
                if (entry != null) LicenseTextScreen(entry, onBack)
            }
            route == ROUTE_DETAILS -> DetailsScreen(snapshot, vm, onBack)
            route == ROUTE_QUEUE -> QueueScreen(queue, queueIndex, onPlay = { vm.playQueue(it) }, onBack = onBack)
            route == ROUTE_IGNORED -> IgnoredScreen(ignored, vm, onBack)
            else -> EmptyState("Unknown screen", route, "Back", onBack)
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
        Icon(Icons.Default.MusicNote, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(
                track.title.ifBlank { track.name },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                track.tracker.ifBlank { track.format.uppercase() },
                style = MaterialTheme.typography.labelSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IconButton(onClick = onToggle) {
            Icon(
                if (snap.state.playing) Icons.Default.Pause else Icons.Default.PlayArrow,
                contentDescription = "Play or pause",
            )
        }
    }
}