package com.bitti06.modplayjs.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.bitti06.modplayjs.R
import com.bitti06.modplayjs.engine.AndroidCapabilities
import com.bitti06.modplayjs.engine.AndroidPattern
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.engine.AndroidSnapshot
import com.bitti06.modplayjs.library.FolderEntity
import com.bitti06.modplayjs.library.ScanProgress
import com.bitti06.modplayjs.library.TrackEntity
import com.bitti06.modplayjs.ui.icons.AppIcons

private enum class Tab(
    @StringRes val label: Int,
    val icon: ImageVector,
) {
    Home(R.string.tab_home, AppIcons.Home),
    Library(R.string.tab_library, AppIcons.LibraryMusic),
    Favorites(R.string.tab_favorites, AppIcons.Favorite),
    Playing(R.string.tab_playing, AppIcons.MusicNote),
}

@Composable
fun App(vm: AppViewModel) {
    val settings by vm.settings.collectAsStateWithLifecycle()
    ModplayTheme(dark = settings.view.theme != "light") { AppRoot(vm) }
}

@Composable
private fun AppRoot(vm: AppViewModel) {
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
    val scanProgress by vm.scanProgress.collectAsStateWithLifecycle()
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
    // The player's swipe-left drawer: the folder of the playing track. Held as
    // data (opened) and a flag (visible) so the panel has something to render
    // while it slides out.
    var folderSheet by remember { mutableStateOf<FolderView?>(null) }
    var folderSheetOpen by remember { mutableStateOf(false) }
    var audioSheetOpen by remember { mutableStateOf(false) }

    val folderPicker =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
            if (uri != null) vm.addFolder(uri)
        }

    // Never stack the same destination twice: a double tap on a settings
    // button would push two identical keys, and NavDisplay resolves scenes by
    // key, so popping one would leave the same screen on top.
    val navigate: (NavKey) -> Unit = { key ->
        if (backStack.lastOrNull() != key) backStack.add(key)
    }
    val back: () -> Unit = {
        if (backStack.isNotEmpty()) backStack.removeAt(backStack.lastIndex)
    }
    val playTrack: (TrackEntity) -> Unit = {
        vm.play(it)
        tabName = Tab.Playing.name
    }
    val playList: (List<TrackEntity>, Int) -> Unit = { list, index ->
        vm.playList(list, index)
        tabName = Tab.Playing.name
    }

    // Back closes the drawer before it leaves the player: the panel is not a
    // navigation destination, so NavDisplay does not know about it.
    BackHandler(enabled = backStack.isEmpty() && tab == Tab.Playing && audioSheetOpen) {
        audioSheetOpen = false
    }
    BackHandler(enabled = backStack.isEmpty() && tab == Tab.Playing && folderSheetOpen) {
        folderSheetOpen = false
    }
    // NavDisplay registers its own back handler while the stack is not empty.
    BackHandler(enabled = backStack.isEmpty() && tab == Tab.Playing && !folderSheetOpen && !audioSheetOpen) {
        tabName = Tab.Library.name
    }

    val entries =
        entryProvider<NavKey> {
            entry<SettingsKey> {
                SettingsHub(onOpen = navigate, onBack = back)
            }
            entry<PlaybackSettingsKey> { PlaybackSettingsScreen(vm, settings, back) }
            entry<AudioSettingsKey> { AudioSettingsEntry(vm, settings, back) }
            entry<MixerSettingsKey> { MixerSettingsEntry(vm, settings, back) }
            entry<SidSettingsKey> { SidSettingsScreen(vm, settings, back) }
            entry<AppearanceSettingsKey> { AppearanceSettingsScreen(vm, settings, back) }
            entry<LanguageKey> { LanguageSettingsScreen(back) }
            entry<LibrarySettingsKey> {
                LibrarySettingsScreen(
                    actions = vm,
                    folders = folders,
                    ignoredCount = ignored.size,
                    scanProgress = scanProgress,
                    onAddFolder = { folderPicker.launch(null) },
                    onOpenIgnored = { navigate(IgnoredKey) },
                    onBack = back,
                )
            }
            entry<DiagnosticsKey> { DiagnosticsEntry(vm, back) }
            entry<AboutKey> {
                AboutScreen(
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
            entry<DetailsKey> {
                DetailsEntry(
                    vm = vm,
                    settings = settings,
                    onOpenQueue = { navigate(QueueKey) },
                    onBack = back,
                )
            }
            entry<QueueKey> {
                QueueScreen(queue, queueIndex, onPlay = { vm.playQueue(it) }, onBack = back)
            }
            entry<TextKey> { key -> TextEntry(key.kind, vm, settings, back) }
            entry<PatternKey> { PatternEntry(vm, settings, back) }
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
            contentColor = MaterialTheme.colorScheme.onBackground,
            // Tab screens paint edge to edge and pad their own content, so the
            // player gradient reaches the status bar.
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
            bottomBar = {
                Column {
                    MiniPlayerSlot(
                        vm = vm,
                        tab = tab,
                        onOpen = { tabName = Tab.Playing.name },
                        onToggle = { vm.togglePlay() },
                    )
                    NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
                    tonalElevation = 0.dp,
                ) {
                        Tab.entries.forEach { item ->
                            NavigationBarItem(
                                selected = tab == item,
                                onClick = { tabName = item.name },
                                icon = {
                                    Icon(item.icon, contentDescription = stringResource(item.label))
                                },
                                label = { Text(stringResource(item.label)) },
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
                            actions = vm,
                            tracks = tracks,
                            libraryTracks = libraryTracks,
                            folders = folders,
                            filters = filters,
                            scanProgress = scanProgress,
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
                            actions = vm,
                            favorites = favorites,
                            onPlay = playTrack,
                            onPlayList = playList,
                            onBrowseLibrary = { tabName = Tab.Library.name },
                        )

                    Tab.Playing ->
                        PlayerTab(
                            vm = vm,
                            settings = settings,
                            onOpenDetails = { navigate(DetailsKey) },
                            onOpenText = { kind -> navigate(TextKey(kind)) },
                            onOpenAudio = { audioSheetOpen = true },
                            onOpenPattern = { navigate(PatternKey) },
                            onOpenFolder = { track ->
                                folderSheet = track?.let { FolderView(it.folderId, folderPathOf(it)) }
                                folderSheetOpen = true
                            },
                            onBrowseLibrary = { tabName = Tab.Library.name },
                            onOpenSettings = { navigate(SettingsKey) },
                        )
                }
            }
        }

        // The player's folder drawer. A panel over the tabs rather than a
        // destination: playback and the player underneath keep running, and
        // closing returns to the same screen.
        SideDrawer(
            visible = audioSheetOpen,
            side = DrawerSide.Start,
            onDismiss = { audioSheetOpen = false },
            onHidden = {},
        ) {
            AudioEntry(vm = vm, settings = settings, onClose = { audioSheetOpen = false })
        }
        SideDrawer(
            visible = folderSheetOpen,
            onDismiss = { folderSheetOpen = false },
            onHidden = { folderSheet = null },
        ) {
            FolderSheet(
                initial = folderSheet,
                actions = vm,
                tracks = tracks,
                libraryTracks = libraryTracks,
                folders = folders,
                filters = filters,
                scanProgress = scanProgress,
                onPlay = { track ->
                    folderSheetOpen = false
                    playTrack(track)
                },
                onPlayList = { list, index ->
                    folderSheetOpen = false
                    playList(list, index)
                },
                onClose = { folderSheetOpen = false },
            )
        }
        if (backStack.isNotEmpty()) {
            val backdrop = MaterialTheme.colorScheme.background
            Box(
                Modifier
                    .fillMaxSize()
                    // Fully opaque: a translucent top stop let the tab content
                    // show through the settings screen.
                    .background(
                        Brush.verticalGradient(
                            0f to lerp(backdrop, MaterialTheme.colorScheme.primary, 0.20f),
                            0.40f to backdrop,
                            1f to backdrop,
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
            // Safety net: the arrow and the system gesture share this pop, and
            // this handler is registered after NavDisplay's own one.
            BackHandler { back() }
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
                        color = MaterialTheme.colorScheme.onSurface,
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
                        contentDescription = stringResource(R.string.common_play_pause),
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

/**
 * Screens that observe the engine snapshot. Keeping the collection inside them
 * means the snapshot's 4 Hz refresh only invalidates what actually displays it,
 * not the scaffold, the tab bar or the other tabs.
 */
@Composable
private fun PlayerTab(
    vm: AppViewModel,
    settings: AndroidSettings,
    onOpenDetails: () -> Unit,
    onOpenText: (TrackText) -> Unit,
    onOpenFolder: (TrackEntity?) -> Unit,
    onOpenAudio: () -> Unit,
    onOpenPattern: () -> Unit,
    onBrowseLibrary: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val loading by vm.loading.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val currentTrack by vm.nowPlaying.collectAsStateWithLifecycle()
    PlayerScreen(
        actions = vm,
        snapshot = snapshot,
        currentTrack = currentTrack,
        settings = settings,
        loading = loading,
        error = error,
        onOpenDetails = onOpenDetails,
        onOpenText = onOpenText,
        onOpenFolder = onOpenFolder,
        onOpenAudio = onOpenAudio,
        onOpenPattern = onOpenPattern,
        onBrowseLibrary = onBrowseLibrary,
        onOpenSettings = onOpenSettings,
    )
}

/** Directory segments of a track inside its folder, as the browser wants them. */
private fun folderPathOf(track: TrackEntity): List<String> {
    val directory = track.relativePath.substringBeforeLast('/', "")
    return if (directory.isEmpty()) emptyList() else directory.split('/')
}

/**
 * The audio drawer. It collects the snapshot itself: capabilities drive the
 * enabled state of a few rows, and the 4 Hz snapshot must not reach the tab
 * scaffold above.
 */
@Composable
private fun AudioEntry(
    vm: AppViewModel,
    settings: AndroidSettings,
    onClose: () -> Unit,
) {
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    AudioSheet(vm, settings, snapshot?.capabilities, onClose)
}

/** Volume, pan, interpolation, voices, tempo and the mixer, next to the player. */
@Composable
private fun AudioSheet(
    actions: UiActions,
    settings: AndroidSettings,
    capabilities: AndroidCapabilities?,
    onClose: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .safeContentPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(top = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.settings_audio),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onClose) {
                Icon(AppIcons.Close, contentDescription = stringResource(R.string.common_close))
            }
        }
        AudioSettingsContent(actions, settings, capabilities)
        SectionTitle(stringResource(R.string.settings_mixer))
        MixerSettingsContent(actions, settings, capabilities)
        Spacer(Modifier.height(24.dp))
    }
}

/** What the player's drawer should show: a folder, or the folder list. */
private data class FolderView(
    val folderId: String,
    val path: List<String>,
)

/**
 * Contents of the player's drawer: the folder of the playing track, or the
 * folder list when the player has no library row to point at. It owns the
 * root and path, so browsing inside the panel never changes the Library tab.
 */
@Composable
private fun FolderSheet(
    initial: FolderView?,
    actions: UiActions,
    tracks: List<TrackEntity>,
    libraryTracks: List<TrackEntity>,
    folders: List<FolderEntity>,
    filters: Filters,
    scanProgress: ScanProgress?,
    onPlay: (TrackEntity) -> Unit,
    onPlayList: (List<TrackEntity>, Int) -> Unit,
    onClose: () -> Unit,
) {
    var rootId by remember(initial) { mutableStateOf(initial?.folderId) }
    var path by remember(initial) { mutableStateOf(initial?.path.orEmpty()) }
    // The header arrow mirrors the system back: up one directory, then back to
    // the folder list, then out of the drawer.
    val up = {
        when {
            path.isNotEmpty() -> path = path.dropLast(1)
            rootId != null -> {
                rootId = null
                path = emptyList()
            }
            else -> onClose()
        }
    }
    LibraryScreen(
        actions = actions,
        tracks = tracks,
        libraryTracks = libraryTracks,
        folders = folders,
        filters = filters,
        scanProgress = scanProgress,
        rootId = rootId,
        path = path,
        onNavigate = { root, next ->
            rootId = root
            path = next
        },
        onPlay = onPlay,
        onPlayList = onPlayList,
        onAddFolder = {},
        onOpenSettings = {},
        title = rootId?.let { id -> folders.firstOrNull { it.id == id }?.name },
        onBack = up,
    )
}

/**
 * The pattern view. It owns the fetch: a pattern is rows x channels cells, so
 * it is requested once per order position rather than per snapshot, and the
 * screen asks for faster snapshots while it is open so the playhead keeps up.
 */
@Composable
private fun PatternEntry(
    vm: AppViewModel,
    settings: AndroidSettings,
    onBack: () -> Unit,
) {
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val trackId = snapshot?.track?.id
    val ord = snapshot?.state?.ord ?: 0
    var pattern by remember { mutableStateOf<AndroidPattern?>(null) }
    LaunchedEffect(trackId, ord) {
        pattern = vm.pattern(ord)
    }
    DisposableEffect(Unit) {
        vm.patternViewActive(true)
        onDispose { vm.patternViewActive(false) }
    }
    PatternScreen(
        snapshot = snapshot,
        pattern = pattern,
        follow = settings.view.follow,
        onBack = onBack,
    )
}

@Composable
private fun TextEntry(
    kind: TrackText,
    vm: AppViewModel,
    settings: AndroidSettings,
    onBack: () -> Unit,
) {
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    TrackTextScreen(kind, snapshot, settings, onBack)
}

@Composable
private fun MiniPlayerSlot(
    vm: AppViewModel,
    tab: Tab,
    onOpen: () -> Unit,
    onToggle: () -> Unit,
) {
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val current = snapshot ?: return
    if (current.track != null && tab != Tab.Playing) {
        MiniPlayer(snap = current, onOpen = onOpen, onToggle = onToggle)
    }
}

@Composable
private fun AudioSettingsEntry(
    vm: AppViewModel,
    settings: AndroidSettings,
    onBack: () -> Unit,
) {
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    AudioSettingsScreen(vm, settings, snapshot?.capabilities, onBack)
}

@Composable
private fun MixerSettingsEntry(
    vm: AppViewModel,
    settings: AndroidSettings,
    onBack: () -> Unit,
) {
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    MixerSettingsScreen(vm, settings, snapshot?.capabilities, onBack)
}

@Composable
private fun DiagnosticsEntry(
    vm: AppViewModel,
    onBack: () -> Unit,
) {
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    DiagnosticsScreen(snapshot = snapshot, actions = vm, onBack = onBack)
}

@Composable
private fun DetailsEntry(
    vm: AppViewModel,
    settings: AndroidSettings,
    onOpenQueue: () -> Unit,
    onBack: () -> Unit,
) {
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val queue by vm.queue.collectAsStateWithLifecycle()
    DetailsScreen(snapshot, vm, settings, queue.size, onOpenQueue, onBack)
}
