package com.bitti06.modplayjs.xr

/**
 * Bridge between the activity's scene permission result and the (later)
 * MRUK scene load. Kept separate so the activity stays free of scene state.
 */
object SceneBridge {
    @Volatile
    var scenePermissionGranted: Boolean = false
        private set

    fun onPermissionResult(
        granted: Boolean,
        activity: XrActivity,
    ) {
        scenePermissionGranted = granted
        if (granted) activity.onScenePermissionGranted()
    }
}
