package com.bitti06.modplayjs.engine

import android.media.AudioTrack
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A dead output has to be reopened; anything else has to be dropped.
 *
 * `write()` does not throw on failure, it returns a negative code, and the old
 * drain loop ignored the return value entirely. That is how a screen-off output
 * switch turned into "the card says playing and nothing comes out": the track
 * had been invalidated, every write returned ERROR_DEAD_OBJECT, and the loop
 * kept writing into it forever.
 */
class AudioTrackOutputTest {

    @Test
    fun `a dead object is rebuilt`() {
        assertTrue(shouldRebuild(AudioTrack.ERROR_DEAD_OBJECT, 0))
    }

    @Test
    fun `other errors are not rebuilt`() {
        assertFalse(shouldRebuild(AudioTrack.ERROR_INVALID_OPERATION, 0))
        assertFalse(shouldRebuild(AudioTrack.ERROR_BAD_VALUE, 0))
        assertFalse(shouldRebuild(AudioTrack.ERROR, 0))
    }

    @Test
    fun `rebuilds stop after the limit so a broken output cannot spin`() {
        assertTrue(shouldRebuild(AudioTrack.ERROR_DEAD_OBJECT, MAX_REBUILD_ATTEMPTS - 1))
        assertFalse(shouldRebuild(AudioTrack.ERROR_DEAD_OBJECT, MAX_REBUILD_ATTEMPTS))
    }
}
