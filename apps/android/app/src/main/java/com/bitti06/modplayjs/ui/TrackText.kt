package com.bitti06.modplayjs.ui

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.isSpecified
import com.bitti06.modplayjs.R
import com.bitti06.modplayjs.engine.AndroidSettings
import com.bitti06.modplayjs.engine.AndroidSnapshot
import kotlinx.serialization.Serializable

/** Text blocks of the loaded module that can be read full screen. */
@Serializable
enum class TrackText {
    Message,
    Instruments,
    Samples,
}

/**
 * One fixed-width block of the current module, rendered over the whole screen.
 * The player boxes show a scaled-down preview; tapping one opens this reader.
 */
@Composable
fun TrackTextScreen(
    kind: TrackText,
    snapshot: AndroidSnapshot?,
    settings: AndroidSettings,
    onBack: () -> Unit,
) {
    val track = snapshot?.track
    val title =
        stringResource(
            when (kind) {
                TrackText.Message -> R.string.info_message
                TrackText.Instruments -> R.string.info_instruments
                TrackText.Samples -> R.string.info_samples
            },
        )
    val text =
        when (kind) {
            TrackText.Message -> track?.message?.replace("\r", "")
            TrackText.Instruments ->
                track?.instrumentList
                    ?.takeIf { it.isNotEmpty() }
                    ?.map { instrumentLine(it.index + 1, it.name) }
                    ?.joinToString("\n")
            TrackText.Samples ->
                track?.sampleList
                    ?.takeIf { it.isNotEmpty() }
                    ?.map {
                        sampleLine(
                            it.index + 1,
                            it.name,
                            it.length,
                            it.loop,
                            settings.view.sampleLengths,
                            settings.view.sampleLoopFlags,
                        )
                    }
                    ?.joinToString("\n")
        }?.takeIf { it.isNotBlank() }

    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        ModalTopBar(title, onBack)
        if (text == null) {
            EmptyState(title = title, body = stringResource(R.string.text_empty_body))
            return
        }
        MonospaceText(
            text,
            modifier = Modifier.weight(1f).padding(top = 8.dp, bottom = 24.dp),
            scrollable = true,
        )
    }
}

/**
 * Lists an instrument as the module shows it: unnamed slots keep their number
 * and print nothing else, instead of repeating "(unnamed)" down the list.
 */
@Composable
fun instrumentLine(
    number: Int,
    name: String,
): String {
    val trimmed = name.trim()
    return if (trimmed.isEmpty()) "$number." else stringResource(R.string.list_numbered, number, trimmed)
}

/** Same for samples, where the length (and loop flag) still carries meaning. */
@Composable
fun sampleLine(
    number: Int,
    name: String,
    length: Int,
    loop: Boolean,
    showLength: Boolean,
    showLoop: Boolean,
): String {
    val trimmed = name.trim()
    val looping = loop && showLoop
    return when {
        // An empty slot has neither a name nor audio; the length would only
        // print a meaningless "0" for every unused sample.
        trimmed.isEmpty() && length <= 0 -> "$number."
        trimmed.isEmpty() ->
            if (showLength) {
                stringResource(
                    if (looping) R.string.sample_line_unnamed_loop else R.string.sample_line_unnamed,
                    number,
                    length,
                )
            } else {
                "$number."
            }
        showLength ->
            stringResource(
                if (looping) R.string.sample_line_loop else R.string.sample_line,
                number,
                trimmed,
                length,
            )
        else ->
            stringResource(
                if (looping) R.string.sample_line_no_length_loop else R.string.sample_line_no_length,
                number,
                trimmed,
            )
    }
}

/**
 * Fixed-width text. Module art is up to ~80 columns, which does not fit a
 * phone, so the text is scaled down until its widest line fits the available
 * width; panning sideways is not needed. Lines never wrap, so the columns stay
 * where the creator put them.
 */
@Composable
fun MonospaceText(
    text: String,
    modifier: Modifier = Modifier,
    scrollable: Boolean = false,
) {
    val measurer = rememberTextMeasurer()
    val base = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace)
    BoxWithConstraints(modifier) {
        val style =
            remember(text, constraints.maxWidth, base) {
                fittedStyle(measurer, text, base, (constraints.maxWidth - 4).coerceAtLeast(1))
            }
        Text(
            text,
            style = style,
            softWrap = false,
            modifier =
                (if (scrollable) Modifier.verticalScroll(rememberScrollState()) else Modifier)
                    .fillMaxWidth(),
        )
    }
}

/**
 * Shrinks [base] until the widest line fits [target] pixels. One pass is not
 * enough: the ratio is taken at the base size, and glyph advances round to
 * whole pixels once the font is smaller, which made the last column spill out.
 */
private fun fittedStyle(
    measurer: TextMeasurer,
    text: String,
    base: TextStyle,
    target: Int,
): TextStyle {
    fun scaled(scale: Float): TextStyle =
        if (base.lineHeight.isSpecified) {
            base.copy(fontSize = base.fontSize * scale, lineHeight = base.lineHeight * scale)
        } else {
            base.copy(fontSize = base.fontSize * scale)
        }

    val first = measurer.measure(AnnotatedString(text), style = base, softWrap = false)
    if (first.size.width <= target) return base
    var scale = target.toFloat() / first.size.width
    var style = scaled(scale)
    repeat(2) {
        val measured = measurer.measure(AnnotatedString(text), style = style, softWrap = false)
        if (measured.size.width <= target) return style
        scale *= target.toFloat() / measured.size.width
        style = scaled(scale)
    }
    return style
}
