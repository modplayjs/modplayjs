package com.bitti06.modplayjs.xr.ui.panels

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.state.XrStore
import com.bitti06.modplayjs.xr.ui.panel.EmptyNote
import com.bitti06.modplayjs.xr.ui.panel.PanelScaffold
import com.bitti06.modplayjs.xr.ui.panel.PanelTokens

/**
 * The ignored files, with per-file restore — the phone app's IgnoredScreen.
 * Undoing one ignore is the common case, so each row restores itself.
 */
@Composable
fun IgnoredPanel() {
    val version by XrStore.libraryVersion.collectAsState()
    val ignored = remember(version) { XrStore.ignoredUris().sorted() }

    PanelScaffold(
        title = stringResource(R.string.xr_ignored),
        subtitle = ignored.size.toString(),
    ) {
        if (ignored.isEmpty()) {
            EmptyNote(stringResource(R.string.xr_ignored_empty))
            return@PanelScaffold
        }

        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            items(ignored, key = { it }) { raw ->
                val uri = runCatching { Uri.parse(raw) }.getOrNull()
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(PanelTokens.RadiusSmall))
                        .background(PanelTokens.SurfaceRaised)
                        .clickable {
                            if (uri != null) XrStore.restore(uri)
                        }
                        .padding(horizontal = PanelTokens.GapSm, vertical = PanelTokens.GapXs),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(PanelTokens.GapSm),
                ) {
                    Text(
                        uri?.let { XrStore.nameOf(it) } ?: raw,
                        fontSize = PanelTokens.Body,
                        maxLines = 1,
                        color = PanelTokens.Text,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        stringResource(R.string.xr_restore),
                        fontSize = PanelTokens.Meta,
                        color = PanelTokens.Accent,
                    )
                }
            }
        }
    }
}
