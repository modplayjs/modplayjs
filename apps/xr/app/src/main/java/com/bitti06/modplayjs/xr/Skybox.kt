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

/**
 * Coloured backdrop, so the app never depends on passthrough.
 *
 * Meta's "Create an environment" page: without a skybox the app background is
 * black and empty. Two things cover that:
 *
 * - [Scene.setBackfillColor] paints the eye-buffer clear colour, including the
 *   frames before the dome entity exists.
 * - A `mesh://skybox` entity with an unlit material supplies the dome.
 *
 * Both are a flat colour in the app's indigo palette: no texture, no `.env`,
 * no download. Passthrough stays optional, and Meta's passthrough page states
 * that passthrough does not work while the skybox is visible, so [setPassthrough]
 * hides the dome instead of trying to blend the two.
 */
object Skybox {

    /** Deep indigo, matching the Compose background of the panels. */
    private val NIGHT = Color4(0.047f, 0.039f, 0.094f, 1f)

    /** Dome colour, one step brighter than the clear colour. */
    private val HORIZON = Color4(0.10f, 0.08f, 0.20f, 1f)

    private var dome: Entity? = null
    private var scene: Scene? = null
    private var prefs: SharedPreferences? = null

    fun install(scene: Scene, context: Context) {
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

        // Soft ambient plus a dim sun, so the debug markers read as lit
        // instead of flat black. No image-based lighting: the app ships no
        // .env file and does not fetch one.
        scene.setLightingEnvironment(
            ambientColor = Vector3(0.35f, 0.32f, 0.5f),
            sunColor = Vector3(0.5f, 0.5f, 0.7f),
            sunDirection = -Vector3(1f, 3f, -2f),
            environmentIntensity = 0.4f,
        )

        // Restore the last choice, including across process restarts.
        val on = prefs?.getBoolean(KEY_PASSTHROUGH, false) == true
        XrApp.passthrough.value = on
        applyState(on)
    }

    /** Toggle passthrough and swap the dome for the real room. */
    fun setPassthrough(on: Boolean) {
        prefs?.edit()?.putBoolean(KEY_PASSTHROUGH, on)?.apply()
        applyState(on)
    }

    /**
     * Re-assert the current state. The runtime tears the session down and
     * rebuilds it while MRUK discovers the room (XR_SESSION_STATE_STOPPING ->
     * IDLE -> READY in the log), and the passthrough layer and the dome's
     * visibility go with it, so both are applied again on resume.
     */
    fun reapply() {
        applyState(XrApp.passthrough.value)
    }

    private fun applyState(on: Boolean) {
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
