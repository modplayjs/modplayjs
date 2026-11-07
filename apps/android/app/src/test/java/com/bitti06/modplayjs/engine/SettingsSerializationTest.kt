package com.bitti06.modplayjs.engine

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The settings blob is written by an older build and read by a newer one.
 *
 * A field added with a default must therefore decode from JSON that predates it,
 * and must survive a round trip. The spatial layout lives there, so a regression
 * here would silently reset the user's choice on every launch.
 */
class SettingsSerializationTest {

    @Test
    fun `settings from before the spatial block still decode`() {
        val old =
            """
            {"schemaVersion":1,
             "transport":{"volume":70,"panSeparation":80,"sampleRate":48000,
                          "interpolation":1,"numVoices":32,"tempoFactor":1.0},
             "mixer":{},"sid":{},"playback":{},"view":{}}
            """.trimIndent()
        val decoded = EngineJson.decodeFromString<AndroidSettings>(old)
        assertEquals(70, decoded.transport.volume)
        assertEquals(0, decoded.spatial.layoutMask)
    }

    @Test
    fun `the chosen layout survives a round trip`() {
        val chosen = AndroidSettings(spatial = SpatialSettings(layoutMask = 0x3F))
        val text = EngineJson.encodeToString(AndroidSettings.serializer(), chosen)
        val back = EngineJson.decodeFromString<AndroidSettings>(text)
        assertEquals(0x3F, back.spatial.layoutMask)
    }
}
