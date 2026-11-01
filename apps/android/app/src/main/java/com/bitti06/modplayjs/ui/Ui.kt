package com.bitti06.modplayjs.ui

import android.text.format.DateUtils
import android.text.format.Formatter
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.rememberSliderState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bitti06.modplayjs.R
import com.bitti06.modplayjs.library.TrackEntity
import com.bitti06.modplayjs.ui.icons.AppIcons

/**
 * Keeps screen content clear of the status bar and cutouts while letting the
 * screen's own background paint behind them.
 */
@Composable
fun Modifier.safeContentPadding(): Modifier =
    windowInsetsPadding(
        WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal),
    )

/**
 * The wordmark from the web player: "modplay" in the normal text colour and
 * "js" in the secondary accent.
 */
@Composable
fun AppWordmark(
    style: TextStyle,
    modifier: Modifier = Modifier,
) {
    Text(
        text =
            buildAnnotatedString {
                append("modplay")
                withStyle(SpanStyle(color = MaterialTheme.colorScheme.secondary)) { append("js") }
            },
        style = style,
        color = MaterialTheme.colorScheme.onSurface,
        fontWeight = FontWeight.Bold,
        modifier = modifier,
    )
}

@Composable
fun SectionTitle(text: String) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.primary,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.8.sp,
        modifier = Modifier.padding(top = 8.dp),
    )
}

/**
 * Deterministic cover-art stand-in: tracker files have no artwork, but a
 * per-format gradient tile gives rows and the player the visual anchor that
 * album art gives a normal music player.
 */
fun accentColor(
    seed: String,
    saturation: Float = 0.55f,
    value: Float = 0.98f,
): Color {
    val hue = ((seed.uppercase().hashCode().toLong() and 0xFFFFFFFFL) % 360L).toFloat()
    return Color.hsv(hue, saturation, value)
}

@Composable
fun FormatArt(
    format: String,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    val base = accentColor(format, saturation = 0.6f)
    Box(
        modifier
            .size(size)
            .clip(RoundedCornerShape(size / 3f))
            .background(Brush.linearGradient(listOf(base, base.copy(alpha = 0.55f)))),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            format.uppercase().take(4),
            style = if (size >= 56.dp) MaterialTheme.typography.labelLarge else MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF0A0A12),
        )
    }
}

/** Top bar used by every modal screen. */
@Composable
fun ModalTopBar(
    title: String,
    onBack: () -> Unit,
    actions: @Composable RowScope.() -> Unit = {},
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(AppIcons.ArrowBack, contentDescription = stringResource(R.string.common_back))
        }
        Text(
            title,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        actions()
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TrackRow(
    track: TrackEntity,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null,
    onToggleFavorite: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val base = Modifier.fillMaxWidth()
    val modifier =
        if (onLongClick != null) {
            base.combinedClickable(onClick = onClick, onLongClick = onLongClick)
        } else {
            base.clickable(onClick = onClick)
        }
    Row(
        modifier.padding(horizontal = 4.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FormatArt(track.format, 46.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                track.name,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                track.relativePath.substringBeforeLast('/', track.format.uppercase()),
                style = MaterialTheme.typography.labelSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (track.availability == "missing") {
            Icon(
                AppIcons.Warning,
                contentDescription = stringResource(R.string.common_missing),
                tint = MaterialTheme.colorScheme.error,
            )
        }
        if (onToggleFavorite != null) {
            val favorite = track.favoriteAt != null
            IconButton(onClick = onToggleFavorite) {
                Icon(
                    if (favorite) AppIcons.Favorite else AppIcons.FavoriteBorder,
                    contentDescription =
                        stringResource(
                            if (favorite) R.string.cd_remove_favorite else R.string.cd_add_favorite,
                        ),
                    tint = if (favorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        trailing?.invoke()
    }
}

/** Actions for one track, shared by the library and the favorites list. */
@Composable
fun TrackActionsSheet(
    track: TrackEntity,
    onPlay: () -> Unit,
    onToggleFavorite: () -> Unit,
    onIgnore: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
        Text(
            track.name,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            track.relativePath,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FormatBadge(track.format.uppercase())
            Text(formatSize(track.size), style = MaterialTheme.typography.labelSmall)
            if (track.availability == "missing") {
                Text(
                    stringResource(R.string.common_missing),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        HorizontalDivider()
        SettingsRow(stringResource(R.string.common_play), null, onPlay)
        SettingsRow(
            stringResource(
                if (track.favoriteAt == null) R.string.action_add_favorite else R.string.action_remove_favorite,
            ),
            null,
            onToggleFavorite,
        )
        SettingsRow(
            stringResource(R.string.action_ignore),
            stringResource(R.string.action_ignore_summary),
            onIgnore,
        )
        SettingsRow(
            stringResource(R.string.action_delete_permanent),
            stringResource(R.string.action_delete_summary),
            onDelete,
        )
    }
}

@Composable
fun FolderRow(
    name: String,
    trackCount: Int,
    onClick: () -> Unit,
    onPlay: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable(onClick = onClick).padding(horizontal = 4.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val accent = accentColor(name)
        Box(
            Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(accent.copy(alpha = 0.20f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                AppIcons.Folder,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(22.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                name,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                pluralStringResource(R.plurals.track_count, trackCount, trackCount),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (onPlay != null) {
            IconButton(onClick = onPlay) {
                Icon(AppIcons.PlayArrow, contentDescription = stringResource(R.string.cd_play_folder))
            }
        }
        trailing?.invoke()
        Icon(AppIcons.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun SettingsRow(
    title: String,
    summary: String? = null,
    onClick: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                title,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (!summary.isNullOrBlank()) {
                Text(
                    summary,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Icon(AppIcons.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun SwitchRow(
    label: String,
    checked: Boolean,
    enabled: Boolean = true,
    onChange: (Boolean) -> Unit,
) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            label,
            modifier = Modifier.weight(1f),
            color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}

@Composable
fun SliderRow(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    enabled: Boolean = true,
    onChange: (Float) -> Unit,
) {
    val state = rememberSliderState(value = value.coerceIn(range), trackRange = range)
    // The state is remembered once; follow external updates (presets, engine
    // clamps) by assigning the value instead of recreating the state.
    LaunchedEffect(value) { state.value = value.coerceIn(range) }
    Column(Modifier.padding(vertical = 2.dp)) {
        Row(Modifier.fillMaxWidth()) {
            Text(label, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface)
            Text(value.toInt().toString(), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Slider(
            state = state,
            onValueChange = { v ->
                state.value = v
                onChange(v)
            },
            enabled = enabled,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
fun ChoiceRow(
    label: String,
    options: List<Pair<String, String>>,
    selected: String,
    enabled: Boolean = true,
    onSelect: (String) -> Unit,
) {
    Column(Modifier.padding(vertical = 2.dp)) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
            items(options, key = { it.first }) { (value, text) ->
                FilterChip(selected == value, { onSelect(value) }, { Text(text) }, enabled = enabled)
            }
        }
    }
}

@Composable
fun InfoRow(
    label: String,
    value: String,
) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(
            label,
            modifier = Modifier.width(104.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
        )
        Text(
            value,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun EmptyState(
    title: String,
    body: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                body,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            if (actionLabel != null && onAction != null) {
                Spacer(Modifier.height(12.dp))
                TextButton(onClick = onAction) { Text(actionLabel) }
            }
        }
    }
}

@Composable
fun FormatBadge(text: String) {
    Surface(
        color = MaterialTheme.colorScheme.secondaryContainer,
        shape = RoundedCornerShape(6.dp),
    ) {
        Text(
            text,
            style = MaterialTheme.typography.labelSmall,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
        )
    }
}

fun formatTime(ms: Long): String = DateUtils.formatElapsedTime((ms / 1000).coerceAtLeast(0))

@Composable
fun formatSize(bytes: Long): String = Formatter.formatShortFileSize(LocalContext.current, bytes)

/** Small clickable card used on the home screen. */
@Composable
fun StatCard(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    accent: Color = MaterialTheme.colorScheme.primary,
) {
    Box(
        modifier
            .clip(RoundedCornerShape(20.dp))
            .background(
                Brush.linearGradient(
                    listOf(accent.copy(alpha = 0.34f), accent.copy(alpha = 0.12f)),
                ),
            ).then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 14.dp, vertical = 14.dp),
    ) {
        Column {
            Text(
                value,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = accent,
            )
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
