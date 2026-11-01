package com.bitti06.modplayjs.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.R
import com.bitti06.modplayjs.library.FolderEntity
import com.bitti06.modplayjs.library.TrackEntity
import com.bitti06.modplayjs.ui.icons.AppIcons

@Composable
fun HomeScreen(
    tracks: List<TrackEntity>,
    recent: List<TrackEntity>,
    folders: List<FolderEntity>,
    favoritesCount: Int,
    onAddFolder: () -> Unit,
    onRescan: () -> Unit,
    onOpenLibrary: () -> Unit,
    onOpenFavorites: () -> Unit,
    onOpenFolder: (String) -> Unit,
    onPlay: (TrackEntity) -> Unit,
    onToggleFavorite: (TrackEntity) -> Unit,
) {
    // One pass over the library instead of a count per folder row.
    val trackCounts = remember(tracks) { tracks.groupingBy { it.folderId }.eachCount() }
    LazyColumn(
        Modifier.fillMaxSize().safeContentPadding().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp)
                    .clip(RoundedCornerShape(28.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.42f),
                                MaterialTheme.colorScheme.tertiary.copy(alpha = 0.26f),
                            ),
                        ),
                    ).padding(horizontal = 18.dp, vertical = 18.dp),
            ) {
                Column {
                    AppWordmark(MaterialTheme.typography.headlineMedium)
                    Text(
                        stringResource(R.string.home_tagline),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onAddFolder, modifier = Modifier.weight(1f)) {
                    Icon(AppIcons.CreateNewFolder, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.common_add_folder))
                }
                OutlinedButton(onClick = onRescan) {
                    Icon(AppIcons.Refresh, contentDescription = null)
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatCard(
                    tracks.size.toString(),
                    stringResource(R.string.stat_tracks),
                    Modifier.weight(1f),
                    onClick = onOpenLibrary,
                    accent = MaterialTheme.colorScheme.primary,
                )
                StatCard(
                    folders.size.toString(),
                    stringResource(R.string.stat_folders),
                    Modifier.weight(1f),
                    onClick = onOpenLibrary,
                    accent = MaterialTheme.colorScheme.secondary,
                )
                StatCard(
                    favoritesCount.toString(),
                    stringResource(R.string.stat_favorites),
                    Modifier.weight(1f),
                    onClick = onOpenFavorites,
                    accent = MaterialTheme.colorScheme.tertiary,
                )
            }
        }
        if (folders.isEmpty()) {
            item {
                EmptyState(
                    title = stringResource(R.string.home_empty_title),
                    body = stringResource(R.string.home_empty_body),
                    actionLabel = stringResource(R.string.common_add_folder),
                    onAction = onAddFolder,
                )
            }
        } else {
            item { SectionTitle(stringResource(R.string.home_recent)) }
            if (recent.isEmpty()) {
                item {
                    Text(
                        stringResource(R.string.home_nothing_yet),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                items(recent, key = { "recent:${it.id}" }) { track ->
                    TrackRow(
                        track,
                        onClick = { onPlay(track) },
                        onToggleFavorite = { onToggleFavorite(track) },
                    )
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    SectionTitle(stringResource(R.string.library_folders))
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = onOpenLibrary) {
                        Text(stringResource(R.string.home_open_library))
                    }
                }
            }
            items(folders, key = { "folder:${it.id}" }) { folder ->
                FolderRow(
                    name = folder.name,
                    trackCount = trackCounts[folder.id] ?: 0,
                    onClick = { onOpenFolder(folder.id) },
                )
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}
