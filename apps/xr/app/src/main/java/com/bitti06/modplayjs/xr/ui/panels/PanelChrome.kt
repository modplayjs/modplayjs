package com.bitti06.modplayjs.xr.ui.panels

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bitti06.modplayjs.xr.XrApp

/**
 * The way back to the library from every panel.
 *
 * The library panel is the app's home: it is always visible, it carries the
 * app title and the entry points for folders, files and settings. Every other
 * panel therefore only needs one action, and this is it: close whatever
 * overlay is open and let the library be the thing in front again.
 */
@Composable
fun HomeChip(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .clickable { XrApp.goHome() }
            .padding(horizontal = 8.dp, vertical = 3.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            "⌂",
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}
