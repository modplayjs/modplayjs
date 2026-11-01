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
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearWavyProgressIndicator
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.bitti06.modplayjs.engine.AndroidSnapshot
import com.bitti06.modplayjs.library.TrackEntity
import com.bitti06.modplayjs.ui.icons.AppIcons

private enum class Tab(
    val label: String,
    val icon: ImageVector,
) {
    Home("Home", AppIcons.Home),
    Library("Library", AppIcons.LibraryMusic),
    Favorites("Favorites", AppIcons.Favorite),
    Playing("Playing", AppIcons.MusicNote),
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
    val awaitingStart by vm.awaitingStart.collectAsStateWithLifecycle()

    // A loaded track stays silent until this screen has composed and drawn it
    // once, so the player is never behind the sound.
    LaunchedEffect(awaitingStart) {
        if (awaitingStart == 0) return@LaunchedEffect
        withFrameNanos { }
        withFrameNanos { }
        vm.startOutputAfterUi()
    }

    var tabName by rememberSaveable { mutableStateOf(Tab.Library.name) }
    val tab = Tab.entries.firstOrNull { it.name == tabName } ?: Tab.Library
    val backStack = rememberNavBackStack()
    var libraryRoot by rememberSaveable { mutableStateOf<String?>(null) }
    var libraryPath by rememberSaveable { mutableStateOf(arrayListOf<String>()) }

    val folderPicker =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
            if (uri != null) vm.addFolder(uri)
        }

    val navigate: (NavKey) -> Unit = { backStack.add(it) }
    val back: () -> Unit = { backStack.removeLastOrNull() }
    val playTrack: (TrackEntity) -> Unit = {
        vm.play(it)
        tabName = Tab.Playing.name
    }
    val playList: (List<TrackEntity>, Int) -> Unit = { list, index ->
        vm.playList(list, index)
        tabName = Tab.Playing.name
    }

    // NavDisplay registers its own back handler while the stack is not empty.
    BackHandler(enabled = backStack.isEmpty() && tab == Tab.Playing) { tabName = Tab.Library.name }

    val entries =
        entryProvider<NavKey> {
            entry<SettingsKey> {
                SettingsHub(
                    vm = vm,
                    settings = settings,
                    folders = folders,
                    ignoredCount = ignored.size,
                    onOpen = navigate,
                    onBack = back,
                )
            }
            entry<PlaybackSettingsKey> { PlaybackSettingsScreen(vm, settings, back) }
            entry<AudioSettingsKey> { AudioSettingsScreen(vm, settings, snapshot?.capabilities, back) }
            entry<MixerSettingsKey> { MixerSettingsScreen(vm, settings, snapshot?.capabilities, back) }
            entry<SidSettingsKey> { SidSettingsScreen(vm, settings, back) }
            entry<AppearanceSettingsKey> { AppearanceSettingsScreen(vm, settings, back) }
            entry<LibrarySettingsKey> {
                LibrarySettingsScreen(
                    vm = vm,
                    folders = folders,
                    ignoredCount = ignored.size,
                    onAddFolder = { folderPicker.launch(null) },
                    onOpenIgnored = { navigate(IgnoredKey) },
                    onBack = back,
                )
            }
            entry<DiagnosticsKey> { DiagnosticsScreen(vm = vm, onBack = back) }
            entry<AboutKey> {
                AboutScreen(
                    v8Available = vm.v8Available,
                    v8Error = vm.v8Error,
                    sampleRate = vm.sampleRate,
                    onOpenLicenses = { navigate(LicensesKey) },
                    onBack = back,
                )
            }
            entry<LicensesKey> {
                LicensesScreen(onOpen = { navigate(LicenseKey(it)) }, onBack = back)
            }
            entry<LicenseKey> { key ->
                licenseEntry(key.id)?.let { LicenseTextScreen(it, onBack = back) }
            }
            entry<DetailsKey> { DetailsScreen(snapshot, vm, back) }
            entry<QueueKey> {
                QueueScreen(queue, queueIndex, onPlay = { vm.playQueue(it) }, onBack = back)
            }
            entry<IgnoredKey> { IgnoredScreen(ignored, vm, back) }
        }

    Box(
        Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    0f to MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                    0.30f to MaterialTheme.colorScheme.background,
                    0.72f to MaterialTheme.colorScheme.background,
                    1f to MaterialTheme.colorScheme.tertiary.copy(alpha = 0.12f),
                ),
            ),
    ) {
        Scaffold(
            containerColor = Color.Transparent,
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
                    NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
                    tonalElevation = 0.dp,
                ) {
                        Tab.entries.forEach { item ->
                            NavigationBarItem(
                                selected = tab == item,
                                onClick = { tabName = item.name },
                                icon = { Icon(item.icon, contentDescription = item.label) },
                                label = { Text(item.label) },
                                colors =
                                    NavigationBarItemDefaults.colors(
                                        indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.22f),
                                        selectedIconColor = MaterialTheme.colorScheme.primary,
                                        selectedTextColor = MaterialTheme.colorScheme.primary,
                                    ),
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
                            onOpenSettings = { navigate(SettingsKey) },
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
                            // A removed folder or an empty library drops back to
                            // the folder list instead of an empty browser.
                            rootId =
                                libraryRoot?.takeIf { root ->
                                    (root == ALL_ROOTS && libraryTracks.isNotEmpty()) ||
                                        folders.any { it.id == root }
                                },
                            path = libraryPath,
                            onNavigate = { root, path ->
                                libraryRoot = root
                                libraryPath = ArrayList(path)
                            },
                            onPlay = playTrack,
                            onPlayList = playList,
                            onAddFolder = { folderPicker.launch(null) },
                            onOpenSettings = { navigate(SettingsKey) },
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
                            onOpenDetails = { navigate(DetailsKey) },
                            onOpenQueue = { navigate(QueueKey) },
                            onBrowseLibrary = { tabName = Tab.Library.name },
                            onOpenSettings = { navigate(SettingsKey) },
                        )
                }
            }
        }
        if (backStack.isNotEmpty()) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            0f to MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                            0.40f to MaterialTheme.colorScheme.background,
                            1f to MaterialTheme.colorScheme.background,
                        ),
                    ),
            ) {
                Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
                    NavDisplay(
                        backStack = backStack,
                        modifier = Modifier.fillMaxSize(),
                        onBack = back,
                        entryProvider = entries,
                    )
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
    val duration = snap.state.durationMs
    val progress = if (duration > 0) (snap.state.positionMs / duration).toFloat().coerceIn(0f, 1f) else 0f
    val accent = accentColor(track.format)
    Surface(
        color = lerp(MaterialTheme.colorScheme.surfaceContainerHigh, accent, 0.20f),
        shape = RoundedCornerShape(22.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .clickable(onClick = onOpen),
    ) {
        Column {
            Row(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                FormatArt(track.format, 42.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        track.title.ifBlank { track.name },
                        style = MaterialTheme.typography.bodyLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        track.tracker.ifBlank { track.format.uppercase() },
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(onClick = onToggle) {
                    Icon(
                        if (snap.state.playing) AppIcons.Pause else AppIcons.PlayArrow,
                        contentDescription = "Play or pause",
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            LinearWavyProgressIndicator(
                progress = { progress },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 2.dp),
                color = accent,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
            )
        }
    }
}
