package com.bitti06.modplayjs.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.SheetValue
import androidx.compose.material3.rememberBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.R
import com.bitti06.modplayjs.library.TrackEntity
import com.bitti06.modplayjs.ui.icons.AppIcons

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FavoritesScreen(
    actions: UiActions,
    favorites: List<TrackEntity>,
    onPlayList: (List<TrackEntity>, Int) -> Unit,
    onBrowseLibrary: () -> Unit,
) {
    var showTrackActions by remember { mutableStateOf<TrackEntity?>(null) }
    var showDeleteConfirm by remember { mutableStateOf<TrackEntity?>(null) }

    Column(Modifier.fillMaxSize().safeContentPadding().padding(horizontal = 12.dp)) {
        Box(
            Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
                .clip(RoundedCornerShape(28.dp))
                .background(
                    Brush.linearGradient(
                        listOf(
                            MaterialTheme.colorScheme.tertiary.copy(alpha = 0.42f),
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.24f),
                        ),
                    ),
                ).padding(horizontal = 16.dp, vertical = 16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.tab_favorites),
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        pluralStringResource(R.plurals.favorites_summary, favorites.size, favorites.size),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                FilledTonalButton(
                    onClick = { onPlayList(favorites, 0) },
                    enabled = favorites.isNotEmpty(),
                    shape = CircleShape,
                ) {
                    Icon(AppIcons.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.action_play_all))
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        if (favorites.isEmpty()) {
            EmptyState(
                title = stringResource(R.string.favorites_empty_title),
                body = stringResource(R.string.favorites_empty_body),
                actionLabel = stringResource(R.string.common_browse_library),
                onAction = onBrowseLibrary,
            )
        } else {
            LazyColumn(Modifier.fillMaxSize()) {
                items(favorites, key = { it.id }) { track ->
                    TrackRow(
                        track,
                        // The favourites tab is one playlist: tapping a row
                        // queues the visible list and starts at that row, so
                        // "next" is the next favourite. Building the queue from
                        // the library here made it the next track of the
                        // track's folder instead.
                        onClick = {
                            val index = favorites.indexOfFirst { it.id == track.id }
                            onPlayList(favorites, index.coerceAtLeast(0))
                        },
                        onLongClick = { showTrackActions = track },
                        onToggleFavorite = { actions.toggleFavorite(track) },
                        trailing = {
                            IconButton(onClick = { showTrackActions = track }) {
                                Icon(
                                    AppIcons.MoreVert,
                                    contentDescription = stringResource(R.string.common_track_options),
                                )
                            }
                        },
                    )
                }
                item { Spacer(Modifier.height(24.dp)) }
            }
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
                    val index = favorites.indexOfFirst { it.id == track.id }
                    onPlayList(favorites, index.coerceAtLeast(0))
                },
                onToggleFavorite = {
                    actions.toggleFavorite(track)
                    showTrackActions = null
                },
                onIgnore = {
                    actions.ignore(track)
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
                    actions.deletePermanently(track)
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
}

@Preview(name = "Favorites", showBackground = true, backgroundColor = 0xFF0C0A18)
@Composable
private fun FavoritesScreenPreview() {
    PreviewFrame {
        FavoritesScreen(
            actions = PreviewActions,
            favorites = previewTracks().filter { it.favoriteAt != null },
            onPlayList = { _, _ -> },
            onBrowseLibrary = {},
        )
    }
}
