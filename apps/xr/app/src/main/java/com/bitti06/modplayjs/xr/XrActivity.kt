package com.bitti06.modplayjs.xr

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.compose.ui.platform.ComposeView
import com.meta.spatial.compose.ComposeFeature
import com.meta.spatial.mruk.MRUKFeature
import com.meta.spatial.compose.ComposeViewPanelRegistration
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.SpatialFeature
import com.meta.spatial.core.Vector3
import com.meta.spatial.runtime.ReferenceSpace
import com.meta.spatial.spatialaudio.SpatialAudioFeature
import com.meta.spatial.toolkit.AppSystemActivity
import com.meta.spatial.toolkit.DpPerMeterDisplayOptions
import com.meta.spatial.toolkit.Panel
import com.meta.spatial.toolkit.PanelRegistration
import com.meta.spatial.toolkit.PanelStyleOptions
import com.meta.spatial.toolkit.QuadShapeOptions
import com.meta.spatial.toolkit.Transform
import com.meta.spatial.toolkit.UIPanelSettings
import com.meta.spatial.toolkit.Visible
import com.meta.spatial.vr.VRFeature
import com.bitti06.modplayjs.xr.library.Library
import com.bitti06.modplayjs.xr.layout.PanelLayout
import com.bitti06.modplayjs.xr.library.Playlist
import com.bitti06.modplayjs.xr.play.XrPlayer
import com.bitti06.modplayjs.xr.ui.XrTheme
import com.bitti06.modplayjs.xr.ui.panels.LibraryPanel
import com.bitti06.modplayjs.xr.ui.panels.NowPlayingPanel
import com.bitti06.modplayjs.xr.ui.panels.DebugPanel
import com.bitti06.modplayjs.xr.ui.panels.DetailsPanel
import com.bitti06.modplayjs.xr.ui.panels.PatternPanel
import com.bitti06.modplayjs.xr.ui.panels.SettingsPanel

class XrActivity : AppSystemActivity() {

    private lateinit var spatialAudio: SpatialAudioFeature
    private lateinit var player: XrPlayer
    private lateinit var mrukFeature: MRUKFeature
    private lateinit var layout: PanelLayout
    private val panels = LinkedHashMap<Int, Entity>()

    override fun registerFeatures(): List<SpatialFeature> {
        spatialAudio = SpatialAudioFeature()
        mrukFeature = MRUKFeature(this, systemManager)
        return listOf(
            VRFeature(this),
            ComposeFeature(),
            spatialAudio,
            mrukFeature,
        )
    }

    override fun registerPanels(): List<PanelRegistration> =
        listOf(
            panel(R.id.panel_main, 1.9f, 1.15f) { NowPlayingPanel() },
            panel(R.id.panel_library, 1.5f, 1.05f) { LibraryPanel() },
            panel(R.id.panel_settings, 1.4f, 1.0f) { SettingsPanel() },
            panel(R.id.panel_debug, 1.2f, 1.0f) { DebugPanel() },
            panel(R.id.panel_pattern, 1.35f, 1.05f) { PatternPanel() },
            panel(R.id.panel_details, 1.2f, 1.0f) { DetailsPanel() },
        )

    private fun panel(
        id: Int,
        width: Float,
        height: Float,
        content: @androidx.compose.runtime.Composable () -> Unit,
    ): PanelRegistration =
        ComposeViewPanelRegistration(
            id,
            composeViewCreator = { _, ctx ->
                ComposeView(ctx).apply {
                    setContent { XrTheme { content() } }
                }
            },
            settingsCreator = {
                UIPanelSettings(
                    shape = QuadShapeOptions(width = width, height = height),
                    style = PanelStyleOptions(themeResourceId = R.style.PanelAppThemeTransparent),
                    display = DpPerMeterDisplayOptions(),
                )
            },
        )

    /** Called once the user grants the runtime USE_SCENE permission. */
    fun onScenePermissionGranted() {
        // Scene model: room bounds place the emitter ring in the real room.
        mrukFeature.loadSceneFromDevice().whenComplete { _, _ ->
            runOnUiThread {
                val bounds = mrukFeature.getCurrentRoom()?.roomBounds
                if (bounds != null) {
                    val centre = bounds.center()
                    val size = bounds.size()
                    val radius = XrPlayer.autoRadius(size.x, size.z)
                    player.setRingAuto(radius, centre.x, centre.z)
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        layout = PanelLayout(this)
        XrApp.freeLayout.value = layout.free
        XrApp.setFreeLayout = { on ->
            layout.setFree(on, panels)
            XrApp.freeLayout.value = layout.free
        }
        XrApp.resetLayout = { layout.reset(panels) }
        player = XrPlayer(this)
        XrApp.player = player
        XrApp.playlist = Playlist(Library(this)).also { playlist ->
            player.onEnded = { playlist.onEnded() }
        }
        XrApp.pickFiles = { openModulePicker() }
        XrApp.pickFolder = { openFolderPicker() }
        player.start()
        requestScenePermission()
    }

    private fun openModulePicker() {
        val intent =
            Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                addFlags(
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
                )
            }
        startActivityForResult(intent, REQUEST_PICK_MODULES)
    }

    private fun openFolderPicker() {
        val intent =
            Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                addFlags(
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
                )
            }
        startActivityForResult(intent, REQUEST_PICK_TREE)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != Activity.RESULT_OK) return

        if (requestCode == REQUEST_PICK_TREE) {
            val tree = data?.data ?: return
            Library(this).addTree(tree)
            XrApp.libraryChanged()
            return
        }

        if (requestCode != REQUEST_PICK_MODULES) return
        val uris = ArrayList<Uri>()
        data?.clipData?.let { clip ->
            for (i in 0 until clip.itemCount) uris += clip.getItemAt(i).uri
        }
        data?.data?.let { if (uris.isEmpty()) uris += it }
        if (uris.isEmpty()) return
        Library(this).addUris(uris)
        XrApp.libraryChanged()
    }

    override fun onDestroy() {
        player.stop()
        XrApp.player = null
        super.onDestroy()
    }

    override fun onSceneReady() {
        super.onSceneReady()
        player.attachScene(scene, spatialAudio)
        XrApp.passthroughSetter = { on -> scene.enablePassthrough(on) }
        scene.setReferenceSpace(ReferenceSpace.LOCAL_FLOOR)
        scene.setViewOrigin(0f, 0f, 1.9f, 180f)

        val ids = listOf(
            R.id.panel_main to PanelLayout.PANEL_MAIN,
            R.id.panel_library to PanelLayout.PANEL_LIBRARY,
            R.id.panel_settings to PanelLayout.PANEL_SETTINGS,
            R.id.panel_debug to PanelLayout.PANEL_DEBUG,
            R.id.panel_pattern to PanelLayout.PANEL_PATTERN,
            R.id.panel_details to PanelLayout.PANEL_DETAILS,
        )
        for ((panelId, layoutId) in ids) {
            val entity = Entity.create(Panel(panelId), Visible(true))
            panels[layoutId] = entity
        }
        layout.apply(panels)
    }

    override fun onPause() {
        if (::layout.isInitialized && layout.free) layout.save(panels)
        super.onPause()
    }

    private fun requestScenePermission() {
        val permission = "com.oculus.permission.USE_SCENE"
        if (checkSelfPermission(permission) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(permission), REQUEST_USE_SCENE)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_USE_SCENE) {
            val granted =
                grantResults.isNotEmpty() &&
                    grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED
            SceneBridge.onPermissionResult(granted, this)
        }
    }

    companion object {
        const val REQUEST_USE_SCENE = 1
        const val REQUEST_PICK_MODULES = 2
        const val REQUEST_PICK_TREE = 3
    }
}
