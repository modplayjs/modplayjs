package com.bitti06.modplayjs.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.BuildConfig
import com.bitti06.modplayjs.ui.icons.AppIcons

@Composable
fun AboutScreen(
    v8Available: Boolean,
    v8Error: String?,
    sampleRate: Int,
    onOpenLicenses: () -> Unit,
    onBack: () -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        ModalTopBar("About", onBack)
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        AppIcons.MusicNote,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(48.dp),
                    )
                    Text(
                        "modplayjs",
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        "Native tracker player · V8",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
            SectionTitle("Build")
            InfoRow("Version", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            InfoRow("Commit", BuildConfig.GIT_COMMIT)
            InfoRow("Variant", BuildConfig.BUILD_TYPE)
            InfoRow("Package", BuildConfig.APPLICATION_ID)
            SectionTitle("Engine")
            InfoRow("V8", if (v8Available) "available" else "stub")
            if (!v8Available && v8Error != null) {
                Text(v8Error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            InfoRow("Output rate", "$sampleRate Hz")
            InfoRow("Core", "modplayjs JS engine (V8, no WebView, no WASM)")
            SectionTitle("Links")
            SettingsRow("Source code", "github.com/modplayjs/modplayjs") {
                uriHandler.openUri("https://github.com/modplayjs/modplayjs")
            }
            SettingsRow("Issues", "Report a bug or request a feature") {
                uriHandler.openUri("https://github.com/modplayjs/modplayjs/issues")
            }
            SettingsRow("Licenses", "Open source notices and full texts", onOpenLicenses)
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text(
                "modplayjs is free software under the BSD-3-Clause license. " +
                    "Tracker engines and decoders are ported from their original projects; see Licenses for attribution.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
fun LicensesScreen(
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        ModalTopBar("Licenses", onBack)
        Text(
            "This app ships the modplayjs core, V8 and AndroidX libraries. Ported code keeps its original license.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 8.dp),
        )
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            LICENSE_ENTRIES.forEach { entry ->
                SettingsRow(entry.name, entry.license) { onOpen(entry.id) }
                HorizontalDivider()
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
fun LicenseTextScreen(
    entry: LicenseEntry,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val text =
        remember(entry.id) {
            entry.asset?.let { asset ->
                runCatching {
                    context.assets.open(asset).bufferedReader().use { it.readText() }
                }.getOrNull()
            }
        }
    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        ModalTopBar(entry.name, onBack)
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            Text(entry.license, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            if (entry.copyright != null) {
                Text(
                    entry.copyright,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (entry.note != null) {
                Spacer(Modifier.height(4.dp))
                Text(
                    entry.note,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            val url = entry.url
            if (url != null) {
                SettingsRow("Project page", url) { uriHandler.openUri(url) }
            }
            Spacer(Modifier.height(8.dp))
            HorizontalDivider()
            Spacer(Modifier.height(8.dp))
            if (text != null) {
                SelectionContainer {
                    Text(
                        text,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            } else {
                Text(
                    "This component is released into the public domain; no license text is required.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}
