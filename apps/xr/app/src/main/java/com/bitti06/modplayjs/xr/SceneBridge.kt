package com.bitti06.modplayjs.xr

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Outcome of the system prompt for `com.oculus.permission.USE_SCENE`. */
enum class SceneAccess { PENDING, GRANTED, DENIED }

/**
 * Bridge between the activity's scene permission result and the (later)
 * MRUK scene load. Kept separate so the activity stays free of scene state.
 *
 * A flow, not a boolean: the Settings panel shows the outcome of the permission
 * prompt (VRC.Quest.Security.2 wants a denial to read as a limited feature
 * rather than a broken app), and that prompt is answered while the panel may
 * already be on screen. PENDING matters because "not asked yet" and "denied"
 * must not read the same.
 */
object SceneBridge {
    private val _access = MutableStateFlow(SceneAccess.PENDING)
    val access: StateFlow<SceneAccess> = _access.asStateFlow()

    val granted: Boolean
        get() = _access.value == SceneAccess.GRANTED

    fun onPermissionResult(
        granted: Boolean,
        activity: XrActivity,
    ) {
        _access.value = if (granted) SceneAccess.GRANTED else SceneAccess.DENIED
        if (granted) activity.onScenePermissionGranted()
    }
}
