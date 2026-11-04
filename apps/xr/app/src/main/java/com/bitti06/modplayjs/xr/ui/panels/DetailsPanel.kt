package com.bitti06.modplayjs.xr.ui.panels

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bitti06.modplayjs.xr.R
import com.bitti06.modplayjs.xr.XrApp
import com.bitti06.modplayjs.xr.play.XrPlayer

/** Which block, if any, currently covers the panel. */
private enum class Expanded { None, Message, Instruments, Samples }

/**
 * Track details: the module facts plus the three text blocks the phone app
 * shows — message, instruments, samples — side by side, because this panel is
 * registered wider than the others for exactly that reason.
 *
 * Tapping a block expands it over the whole panel. In that state the panel
 * paints no background at all: the room behind the panel is the backdrop, and
 * the text gets a shadow and a larger size so it stays readable while floating
 * in space. A scrollbar is drawn in both states.
 */
@Composable
fun DetailsPanel() {
    val state by (XrApp.player?.state ?: kotlinx.coroutines.flow.MutableStateFlow(XrPlayer.State()))
        .collectAsState()
    var expanded by remember { mutableStateOf(Expanded.None) }

    val message =
        remember(state.message) {
            state.message.replace("\r", "").takeIf { it.isNotBlank() }?.lines().orEmpty()
        }
    val instruments = remember(state.trackDetail.instrumentList) { state.trackDetail.instrumentList }
    val samples = remember(state.trackDetail.sampleList) { state.trackDetail.sampleList }

    // Expanded blocks float on the room: no panel background, no card.
    val floating = expanded != Expanded.None

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .then(
                    if (floating) Modifier else Modifier.background(MaterialTheme.colorScheme.background),
                )
                .padding(
                    horizontal = if (floating) 14.dp else 10.dp,
                    vertical = if (floating) 10.dp else 8.dp,
                ),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Header(floating = floating, onHome = { expanded = Expanded.None })
        if (state.details.isEmpty()) {
            Text(
                stringResource(R.string.xr_no_module),
                fontSize = 9.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@Column
        }

        when (expanded) {
            Expanded.None -> Collapsed(
                state = state,
                message = message,
                instruments = instruments,
                samples = samples,
                onExpand = { expanded = it },
            )

            Expanded.Message ->
                InfoCard(
                    title = stringResource(R.string.xr_details_message),
                    accent = MaterialTheme.colorScheme.tertiary,
                    lines = message.ifEmpty { listOf(stringResource(R.string.xr_details_empty)) },
                    expanded = true,
                    onToggle = { expanded = Expanded.None },
                    modifier = Modifier.fillMaxSize(),
                )

            Expanded.Instruments ->
                InfoCard(
                    title = stringResource(R.string.xr_details_instruments),
                    accent = MaterialTheme.colorScheme.primary,
                    lines = instruments,
                    expanded = true,
                    onToggle = { expanded = Expanded.None },
                    modifier = Modifier.fillMaxSize(),
                )

            Expanded.Samples ->
                InfoCard(
                    title = stringResource(R.string.xr_details_samples),
                    accent = MaterialTheme.colorScheme.secondary,
                    lines = samples,
                    expanded = true,
                    onToggle = { expanded = Expanded.None },
                    modifier = Modifier.fillMaxSize(),
                )
        }
    }
}

@Composable
private fun Header(
    floating: Boolean,
    onHome: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            stringResource(R.string.xr_details),
            fontSize = if (floating) 13.sp else 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onBackground,
            style =
                if (floating) {
                    TextStyle(
                        shadow = Shadow(color = androidx.compose.ui.graphics.Color.Black, blurRadius = 8f),
                    )
                } else {
                    TextStyle.Default
                },
            modifier = Modifier.weight(1f),
        )
        HomeChip()
    }
}

/**
 * The three blocks plus the module facts. The facts are the only part that
 * scrolls as a whole; the blocks scroll inside themselves.
 */
@Composable
private fun Collapsed(
    state: XrPlayer.State,
    message: List<String>,
    instruments: List<String>,
    samples: List<String>,
    onExpand: (Expanded) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        // Order list first: it is the one line that identifies the module.
        if (state.trackDetail.orderList.isNotBlank()) {
            Text(
                state.trackDetail.orderList,
                fontSize = 7.sp,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
            )
        }

        // The three text blocks, side by side, sharing the width evenly and
        // the remaining height evenly.
        Row(
            modifier = Modifier.fillMaxWidth().weight(1f),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            InfoCard(
                title = stringResource(R.string.xr_details_message),
                accent = MaterialTheme.colorScheme.tertiary,
                lines = message,
                expanded = false,
                onToggle = { onExpand(Expanded.Message) },
                modifier = Modifier.weight(1f).fillMaxHeight(),
            )
            InfoCard(
                title = stringResource(R.string.xr_details_instruments),
                accent = MaterialTheme.colorScheme.primary,
                lines = instruments,
                expanded = false,
                onToggle = { onExpand(Expanded.Instruments) },
                modifier = Modifier.weight(1f).fillMaxHeight(),
            )
            InfoCard(
                title = stringResource(R.string.xr_details_samples),
                accent = MaterialTheme.colorScheme.secondary,
                lines = samples,
                expanded = false,
                onToggle = { onExpand(Expanded.Samples) },
                modifier = Modifier.weight(1f).fillMaxHeight(),
            )
        }

        // Facts: key/value rows, compact, at the bottom where they do not
        // compete with the text blocks.
        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(0.7f),
            verticalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            items(state.details) { (key, value) ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(2.dp)),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        key,
                        fontSize = 7.sp,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        value,
                        fontSize = 7.sp,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onBackground,
                        modifier = Modifier.weight(2f),
                    )
                }
            }
        }
    }
}
