package com.bitti06.modplayjs.library

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Sorting and filtering, on rows that never touch Room.
 *
 * `folder` is the one worth pinning: it sorts by the whole relative path, so two
 * folders that share a name under different trees stay apart. Sorting by the
 * leaf name alone interleaves them.
 */
class LibraryFilterTest {

    private fun track(
        id: String,
        path: String,
        name: String = path.substringAfterLast('/'),
        format: String = "mod",
        size: Long = 100,
        added: Long = 0,
        family: String = "tracker",
        availability: String = "available",
    ) = TrackEntity(
        id = id,
        folderId = "f",
        documentUri = "content://x/$id",
        documentId = id,
        relativePath = path,
        name = name,
        mime = "application/octet-stream",
        size = size,
        lastModified = 0,
        format = format,
        family = family,
        availability = availability,
        addedAt = added,
    )

    private fun sort(
        tracks: List<TrackEntity>,
        sort: String,
        descending: Boolean = false,
    ) = filterTracks(tracks, "", "all", null, null, sort, descending)

    @Test
    fun `folder sort keeps same-named folders apart`() {
        val tracks =
            listOf(
                track("1", "live/a.mod"),
                track("2", "studio/a.mod"),
                track("3", "live/b.mod"),
            )
        assertEquals(listOf("1", "3", "2"), sort(tracks, "folder").map { it.id })
    }

    @Test
    fun `folder sort compares paths case-insensitively`() {
        val tracks =
            listOf(
                track("1", "Zeta/a.mod"),
                track("2", "alpha/a.mod"),
            )
        assertEquals(listOf("2", "1"), sort(tracks, "folder").map { it.id })
    }

    @Test
    fun `descending reverses the folder order`() {
        val tracks =
            listOf(
                track("1", "a/a.mod"),
                track("2", "b/a.mod"),
            )
        assertEquals(listOf("2", "1"), sort(tracks, "folder", descending = true).map { it.id })
    }

    @Test
    fun `an unknown sort key falls back to the name`() {
        val tracks =
            listOf(
                track("1", "x/zeta.mod"),
                track("2", "x/alpha.mod"),
            )
        assertEquals(listOf("2", "1"), sort(tracks, "nonsense").map { it.id })
    }

    @Test
    fun `search matches the relative path, not only the file name`() {
        val tracks =
            listOf(
                track("1", "demoscene/intro.mod"),
                track("2", "games/level.mod"),
            )
        val hits = filterTracks(tracks, "demoscene", "all", null, null, "name", false)
        assertEquals(listOf("1"), hits.map { it.id })
    }

    @Test
    fun `family and format filters compose`() {
        val tracks =
            listOf(
                track("1", "a.mod", format = "mod"),
                track("2", "b.xm", format = "xm"),
            )
        assertEquals(
            listOf("2"),
            filterTracks(tracks, "", "all", "tracker", "xm", "name", false).map { it.id },
        )
        assertTrue(filterTracks(tracks, "", "all", "sid", null, "name", false).isEmpty())
    }

    @Test
    fun `the status filter selects missing rows`() {
        val tracks =
            listOf(
                track("1", "a.mod"),
                track("2", "b.mod", availability = "missing"),
            )
        assertEquals(
            listOf("2"),
            filterTracks(tracks, "", "missing", null, null, "name", false).map { it.id },
        )
    }
}
