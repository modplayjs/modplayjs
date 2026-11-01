package com.bitti06.modplayjs.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CreateNewFolder
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.library.FolderEntity
import com.bitti06.modplayjs.library.TrackEntity

@Composable
fun HomeScreen(
    tracks: List<TrackEntity>,
    recent: List<TrackEntity>,
    folders: List<FolderEntity>,
    favoritesCount: Int,
    onAddFolder: () -> Unit,
    onRescan: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenLibrary: () -> Unit,
    onOpenFavorites: () -> Unit,
    onOpenFolder: (String) -> Unit,
    onPlay: (TrackEntity) -> Unit,
    onToggleFavorite: (TrackEntity) -> Unit,
) {
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("modplayjs", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                    Text("Tracker player", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = onOpenSettings) {
                    Icon(Icons.Default.Settings, contentDescription = "Settings")
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onAddFolder, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Default.CreateNewFolder, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text("Add folder")
                }
                OutlinedButton(onClick = onRescan) {
                    Icon(Icons.Default.Refresh, contentDescription = null)
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatCard(tracks.size.toString(), "tracks", Modifier.weight(1f), onClick = onOpenLibrary)
                StatCard(folders.size.toString(), "folders", Modifier.weight(1f), onClick = onOpenLibrary)
                StatCard(favoritesCount.toString(), "favorites", Modifier.weight(1f), onClick = onOpenFavorites)
            }
        }
        if (folders.isEmpty()) {
            item {
                EmptyState(
                    title = "No music indexed",
                    body = "Pick a folder. The scanner indexes tracker modules, SID tunes and audio files, including subfolders.",
                    actionLabel = "Add folder",
                    onAction = onAddFolder,
                )
            }
        } else {
            item { SectionTitle("Recently added") }
            if (recent.isEmpty()) {
                item { Text("Nothing yet", color = MaterialTheme.colorScheme.onSurfaceVariant) }
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
                    SectionTitle("Folders")
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = onOpenLibrary) { Text("Open library") }
                }
            }
            items(folders, key = { "folder:${it.id}" }) { folder ->
                FolderRow(
                    name = folder.name,
                    trackCount = tracks.count { it.folderId == folder.id },
                    onClick = { onOpenFolder(folder.id) },
                )
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}
