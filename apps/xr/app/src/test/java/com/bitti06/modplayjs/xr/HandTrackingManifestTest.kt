package com.bitti06.modplayjs.xr

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The hand-tracking declaration, checked against the name Meta actually defines.
 *
 * This exists because the app shipped `horizonos.permission.HAND_TRACKING` for
 * weeks. Nothing in the build noticed: an unknown permission is legal in an
 * Android manifest, it simply never gets granted. The only symptom was on
 * device - `MemoryBrokerClient: Hands: failed to remap HAND_TRACKER (missing
 * runtime permission(s))` - and hands silently did not exist.
 *
 * `com.oculus.permission.HAND_TRACKING` is the documented name: the native
 * hand-tracking page ("Add Flag to Android Manifest"), the Spatial SDK manifest
 * template in "Add Spatial SDK to an existing 2D app", and all thirteen Spatial
 * SDK samples declare it. `horizonos.permission.HAND_TRACKING` appears in none
 * of Meta's documentation corpora.
 *
 * Two things have to agree, so both are checked: the manifest and the runtime
 * request. A manifest declaration without the request, or a request for a name
 * the manifest does not declare, produces the same silent failure.
 */
class HandTrackingManifestTest {

    private fun file(relative: String): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relative)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        throw AssertionError("$relative not found from ${File("").absolutePath}")
    }

    private val manifest: String
        get() = file("app/src/main/AndroidManifest.xml").readText()

    private val activity: String
        get() = file("app/src/main/java/com/bitti06/modplayjs/xr/XrActivity.kt").readText()

    @Test
    fun `manifest declares the documented hand-tracking permission`() {
        assertTrue(
            "manifest must declare com.oculus.permission.HAND_TRACKING",
            manifest.contains("""android:name="com.oculus.permission.HAND_TRACKING""""),
        )
    }

    @Test
    fun `manifest does not declare a hand-tracking permission Meta does not define`() {
        assertFalse(
            "horizonos.permission.HAND_TRACKING is not a permission the platform defines; " +
                "declaring it grants nothing and the hand tracker stays unavailable",
            manifest.contains("""android:name="horizonos.permission.HAND_TRACKING""""),
        )
    }

    @Test
    fun `hand tracking is optional so a controller-only headset still works`() {
        val feature =
            Regex("""<uses-feature[^>]*android:name="oculus\.software\.handtracking"[^>]*>""")
                .find(manifest)
                ?.value
        assertTrue("oculus.software.handtracking feature missing", feature != null)
        assertTrue(
            "required=false means \"controllers and hands\"; required=true would make " +
                "the app refuse to install on a headset without hands",
            feature!!.contains("""android:required="false""""),
        )
    }

    @Test
    fun `the runtime request uses the same name as the manifest`() {
        val constant =
            Regex("""const val handTracking = "([^"]+)"""")
                .find(activity)
                ?.groupValues
                ?.get(1)
        assertTrue("PERMISSIONS.handTracking not found in XrActivity", constant != null)
        assertTrue(
            "XrActivity requests $constant, but the manifest declares a different name",
            manifest.contains("""android:name="$constant""""),
        )
    }
}
