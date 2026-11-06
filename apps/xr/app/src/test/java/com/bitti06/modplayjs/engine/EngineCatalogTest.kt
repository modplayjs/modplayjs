package com.bitti06.modplayjs.engine

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Catalog parsing and the "which file is stale" decision, without Android.
 *
 * The install path itself needs a Context and a filesystem, so it is covered by
 * the device check; what can be tested here is the contract that decides
 * whether an update is a 30 KB download or a 1.3 MB one.
 */
class EngineCatalogTest {

    private fun catalogJson(
        baseUrl: String = "modules/",
        sha: String = "abc",
        bytes: Long = 10,
        apiLevel: Int = 1,
        schema: Int = 1,
    ) = """
        {
          "schema": $schema,
          "apiLevel": $apiLevel,
          "generated": "2026-11-06T00:00:00.000Z",
          "baseUrl": "$baseUrl",
          "engine": { "asset": "engine-core/index.js", "bytes": $bytes,
                      "sha256": "$sha", "version": "0.2.1" },
          "packages": {
            "modplayjs-fmt-mo3": { "asset": "modplayjs-fmt-mo3/index.js",
                                   "bytes": $bytes, "sha256": "$sha", "version": "0.2.1" }
          },
          "formats": {
            "mo3": { "package": "modplayjs-fmt-mo3", "install": "install/mo3.js",
                     "bytes": 20, "sha256": "def", "version": "0.2.1",
                     "extensions": ["mo3"] }
          }
        }
    """.trimIndent()

    @Test
    fun `parses engine, package and install bridge`() {
        val catalog = EngineCatalog.parse(catalogJson(), "https://host/engine/catalog.json")
        assertEquals(1, catalog.schema)
        assertEquals(1, catalog.apiLevel)
        assertEquals("https://host/engine/modules/", catalog.baseUrl)
        assertEquals(
            setOf("engine-core/index.js", "modplayjs-fmt-mo3/index.js", "install/mo3.js"),
            catalog.files.keys,
        )
        assertEquals(listOf("mo3"), catalog.formats.getValue("mo3").third)
        assertEquals("modplayjs-fmt-mo3", catalog.formats.getValue("mo3").first)
    }

    @Test
    fun `absolute base url is kept`() {
        val catalog = EngineCatalog.parse(
            catalogJson(baseUrl = "https://cdn.example/engine/modules/"),
            "https://host/catalog.json",
        )
        assertEquals("https://cdn.example/engine/modules/", catalog.baseUrl)
    }

    @Test(expected = IllegalStateException::class)
    fun `rejects a catalog that needs a newer engine api`() {
        EngineCatalog.parse(catalogJson(apiLevel = 99), "https://host/catalog.json")
    }

    @Test(expected = IllegalStateException::class)
    fun `rejects an unknown schema`() {
        EngineCatalog.parse(catalogJson(schema = 7), "https://host/catalog.json")
    }

    @Test
    fun `verify accepts a matching hash and rejects a wrong one`() {
        val file = File.createTempFile("module", ".js")
        try {
            file.writeText("hello")
            val good = java.security.MessageDigest.getInstance("SHA-256")
                .digest("hello".toByteArray())
                .joinToString("") { "%02x".format(it.toInt() and 0xFF) }
            assertTrue(EngineModules.verify(file, good, 5))
            assertTrue(!EngineModules.verify(file, good, 6))
            assertTrue(!EngineModules.verify(file, "00".repeat(32), 5))
        } finally {
            file.delete()
        }
    }

    @Test
    fun `generated catalog from the build script is valid`() {
        // The Gradle test working directory differs between IDE and CLI, so
        // walk up until the funnel is found instead of guessing a depth.
        var dir: File? = File("").absoluteFile
        var catalog: File? = null
        while (dir != null) {
            val candidate = File(dir, "build/engine-catalog/catalog.json")
            if (candidate.isFile) {
                catalog = candidate
                break
            }
            dir = dir.parentFile
        }
        if (catalog == null) return // only exists after buildModules ran
        val parsed = EngineCatalog.parse(catalog.readText(), "file:///catalog.json")
        assertTrue(parsed.files.isNotEmpty())
        assertTrue(parsed.formats.isNotEmpty())
        // Every format's install bridge must be a downloadable file too.
        for ((_, entry) in parsed.formats) {
            assertTrue(
                "missing install file for ${entry.first}",
                parsed.files.containsKey(entry.second),
            )
        }
        JSONObject(catalog.readText()) // still valid JSON
    }
}
