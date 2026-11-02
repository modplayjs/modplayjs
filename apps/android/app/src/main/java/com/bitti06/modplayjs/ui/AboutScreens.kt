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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.bitti06.modplayjs.BuildConfig
import com.bitti06.modplayjs.R
import com.bitti06.modplayjs.ui.icons.AppIcons

@Composable
fun AboutScreen(
    sampleRate: Int,
    onOpenLicenses: () -> Unit,
    onBack: () -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        ModalTopBar(stringResource(R.string.settings_about), onBack)
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
                    AppWordmark(MaterialTheme.typography.headlineSmall)
                    Text(
                        stringResource(R.string.about_tagline),
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
            Spacer(Modifier.height(12.dp))
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        stringResource(R.string.about_written_by_ai_title),
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        stringResource(R.string.about_written_by_ai),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        stringResource(R.string.about_written_by_ai_checks),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            SectionTitle(stringResource(R.string.build))
            InfoRow(
                stringResource(R.string.version),
                "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
            )
            InfoRow(stringResource(R.string.commit), BuildConfig.GIT_COMMIT)
            InfoRow(stringResource(R.string.variant), BuildConfig.BUILD_TYPE)
            InfoRow(stringResource(R.string.package_label), BuildConfig.APPLICATION_ID)
            SectionTitle(stringResource(R.string.engine))
            InfoRow(stringResource(R.string.output_rate), "$sampleRate Hz")
            InfoRow(stringResource(R.string.core_label), stringResource(R.string.core))
            SectionTitle(stringResource(R.string.links))
            SettingsRow(
                stringResource(R.string.source_code),
                stringResource(R.string.source_code_summary),
            ) {
                uriHandler.openUri("https://github.com/modplayjs/modplayjs")
            }
            SettingsRow(
                stringResource(R.string.issues),
                stringResource(R.string.issues_summary),
            ) {
                uriHandler.openUri("https://github.com/modplayjs/modplayjs/issues")
            }
            SettingsRow(
                stringResource(R.string.privacy_policy),
                stringResource(R.string.privacy_policy_summary),
            ) {
                uriHandler.openUri(PRIVACY_URL)
            }
            SettingsRow(
                stringResource(R.string.settings_licenses),
                stringResource(R.string.licenses_summary),
                onOpenLicenses,
            )
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text(
                stringResource(R.string.about_license_note),
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
        ModalTopBar(stringResource(R.string.settings_licenses), onBack)
        Text(
            stringResource(R.string.licenses_note),
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
                SettingsRow(stringResource(R.string.project_page), url) { uriHandler.openUri(url) }
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
                    stringResource(R.string.public_domain_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

/**
 * Rendered from `apps/android/PRIVACY.md` into the demo site by
 * `apps/demo/scripts/build-privacy.mjs`, so the Play listing and this row share
 * one URL.
 */
private const val PRIVACY_URL = "https://modplayjs.github.io/modplayjs/privacy.html"

@Preview(name = "About", showBackground = true, backgroundColor = 0xFF0C0A18)
@Composable
private fun AboutScreenPreview() {
    PreviewFrame { AboutScreen(sampleRate = 48_000, onOpenLicenses = {}, onBack = {}) }
}

@Preview(name = "Licenses", showBackground = true, backgroundColor = 0xFF0C0A18)
@Composable
private fun LicensesScreenPreview() {
    PreviewFrame { LicensesScreen(onOpen = {}, onBack = {}) }
}
