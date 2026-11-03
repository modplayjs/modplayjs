package com.bitti06.modplayjs.engine

import android.content.Context

class SettingsStore(
    context: Context,
) {
    private val prefs = context.getSharedPreferences("modplayjs", Context.MODE_PRIVATE)

    fun load(): AndroidSettings =
        runCatching {
            prefs.getString(KEY, null)?.let { EngineJson.decodeFromString<AndroidSettings>(it) }
        }.getOrNull() ?: AndroidSettings()

    fun save(settings: AndroidSettings) {
        prefs.edit().putString(KEY, EngineJson.encodeToString(AndroidSettings.serializer(), settings)).apply()
    }

    /** Engine signature the library was last scanned with, or null before any. */
    var engineVersion: String?
        get() = prefs.getString(KEY_ENGINE, null)
        set(value) {
            prefs.edit().putString(KEY_ENGINE, value).apply()
        }

    private companion object {
        const val KEY = "settings"
        const val KEY_ENGINE = "engineVersion"
    }
}
