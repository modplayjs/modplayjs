package com.bitti06.modplayjs.ui

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

/**
 * Destinations of the modal navigation stack (Navigation 3). The bottom tabs
 * are not destinations; they stay plain state inside the scaffold.
 */
@Serializable
data object SettingsKey : NavKey

@Serializable
data object PlaybackSettingsKey : NavKey

@Serializable
data object AudioSettingsKey : NavKey

@Serializable
data object MixerSettingsKey : NavKey

@Serializable
data object SidSettingsKey : NavKey

@Serializable
data object AppearanceSettingsKey : NavKey

@Serializable
data object LanguageKey : NavKey

@Serializable
data object LibrarySettingsKey : NavKey

@Serializable
data object DiagnosticsKey : NavKey

@Serializable
data object AboutKey : NavKey

@Serializable
data object LicensesKey : NavKey

@Serializable
data class LicenseKey(
    val id: String,
) : NavKey

@Serializable
data object DetailsKey : NavKey

@Serializable
data object QueueKey : NavKey

@Serializable
data object IgnoredKey : NavKey
