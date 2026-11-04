package com.bitti06.modplayjs.xr

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import com.meta.spatial.core.Color4
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Vector3
import com.meta.spatial.runtime.Scene
import com.meta.spatial.toolkit.Material
import com.meta.spatial.toolkit.Mesh
import com.meta.spatial.toolkit.MeshCollision
import com.meta.spatial.toolkit.Visible
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The room the panels stand in: a coloured dome, its lighting, and the
 * passthrough switch.
 *
 * Meta's environment page: without a skybox the background is black and empty,
 * so two things cover it — [Scene.setBackfillColor] for the clear colour, and a
 * `mesh://skybox` entity for the dome itself. Both are flat colour: no texture,
 * no `.env`, no download, so the app never depends on passthrough.
 *
 * Passthrough and the dome cannot show at the same time (Meta's passthrough
 * page), so [setPassthrough] hides the dome instead of blending.
 */
object XrScene {

    /** Deep indigo, the same family as the panel surface. */
    private val NIGHT = Color4(0.047f, 0.039f, 0.094f, 1f)

    /** Dome colour, one step brighter than the clear colour. */
    private val HORIZON = Color4(0.13f, 0.10f, 0.26f, 1f)

    private val _passthrough = MutableStateFlow(false)
    val passthrough: StateFlow<Boolean> = _passthrough.asStateFlow()

    private var dome: Entity? = null
    private var scene: Scene? = null
    private var prefs: SharedPreferences? = null

    /**
     * @param launchedInPassthrough `scene.isSystemPassthroughEnabled()`: true
     *   when the app was started from MR Home (VRC.Quest.Functional.14). A
     *   stored choice wins after the first launch, so the toggle stays sticky.
     */
    fun install(scene: Scene, context: Context, launchedInPassthrough: Boolean = false) {
        this.scene = scene
        prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        scene.setBackfillColor(NIGHT)

        dome =
            Entity.create(
                Mesh(Uri.parse("mesh://skybox"), MeshCollision.NoCollision),
                Material().apply {
                    baseColor = HORIZON
                    unlit = true
                },
                Visible(true),
            )

        // Soft ambient plus a dim sun, so the debug markers read as lit instead
        // of flat black. No image-based lighting: the app ships no .env.
        scene.setLightingEnvironment(
            ambientColor = Vector3(0.35f, 0.32f, 0.5f),
            sunColor = Vector3(0.5f, 0.5f, 0.7f),
            sunDirection = -Vector3(1f, 3f, -2f),
            environmentIntensity = 0.4f,
        )

        setPassthrough(prefs?.getBoolean(KEY_PASSTHROUGH, launchedInPassthrough) ?: launchedInPassthrough)
    }

    /** Swap the dome for the real room, or back. Persisted. */
    fun setPassthrough(on: Boolean) {
        prefs?.edit()?.putBoolean(KEY_PASSTHROUGH, on)?.apply()
        _passthrough.value = on
        apply(on)
    }

    /**
     * Re-assert the current state. The runtime tears the session down and
     * rebuilds it while MRUK discovers the room, and the passthrough layer and
     * the dome's visibility go with it, so both are applied again on resume.
     */
    fun reapply() {
        apply(_passthrough.value)
    }

    private fun apply(on: Boolean) {
        val s = scene ?: return
        if (on) {
            s.setBackfillColor(Color4(0f, 0f, 0f, 0f))
            dome?.setComponent(Visible(false))
            s.enablePassthrough(true)
        } else {
            s.setBackfillColor(NIGHT)
            dome?.setComponent(Visible(true))
            s.enablePassthrough(false)
        }
    }

    private const val PREFS = "xr.display"
    private const val KEY_PASSTHROUGH = "passthrough"
}
