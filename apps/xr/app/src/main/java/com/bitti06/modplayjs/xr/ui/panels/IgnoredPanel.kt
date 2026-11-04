package com.bitti06.modplayjs.xr.ui.panels

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.XrApp
import com.bitti06.modplayjs.xr.library.Library

/**
 * The ignored files, with per-file restore — the phone app's IgnoredScreen.
 * Twice the work of "clear all", but undoing one ignore is the common case.
 */
@Composable
fun IgnoredPanel() {
    val context = LocalContext.current
    val library = remember { Library(context) }
    val version by XrApp.libraryVersion.collectAsState()
    var localVersion by remember { mutableIntStateOf(0) }
    val ignored = remember(version, localVersion) { library.ignoredUris().sorted() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainer)
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.xr_ignored),
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.weight(1f),
            )
            Text(
                ignored.size.toString(),
                fontSize = 9.sp,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            HomeChip(modifier = Modifier.padding(start = 8.dp))
        }

        if (ignored.isEmpty()) {
            Text(
                stringResource(R.string.xr_ignored_empty),
                fontSize = 9.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(14.dp),
            )
            return@Column
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 10.dp, vertical = 6.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            items(ignored, key = { it }) { raw ->
                val uri = runCatching { android.net.Uri.parse(raw) }.getOrNull()
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(6.dp))
                        .clickable {
                            if (uri != null) {
                                library.restore(uri)
                                localVersion++
                            }
                        }
                        .padding(horizontal = 6.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        uri?.let { library.nameOf(it) } ?: raw,
                        fontSize = 10.sp,
                        maxLines = 1,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        stringResource(R.string.xr_restore),
                        fontSize = 8.sp,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(MaterialTheme.colorScheme.surfaceContainer)
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
        }
    }
}
