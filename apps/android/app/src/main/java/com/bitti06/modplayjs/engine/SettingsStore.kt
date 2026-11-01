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

    private companion object {
        const val KEY = "settings"
    }
}
