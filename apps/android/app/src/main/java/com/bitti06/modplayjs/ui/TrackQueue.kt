package com.bitti06.modplayjs.ui

import com.bitti06.modplayjs.library.TrackEntity

/**
 * Position of [track] inside the list it is displayed in.
 *
 * Every screen that shows tracks is its own playlist: tapping a row queues the
 * rows around it, so "next" stays inside the list the user is looking at -
 * the open folder, the favourites, the search results, the recents. Falling
 * back to 0 keeps the index valid when the row is not in the list (a stale
 * recomposition) instead of handing -1 to the queue.
 */
internal fun queuePosition(
    list: List<TrackEntity>,
    track: TrackEntity,
): Int = list.indexOfFirst { it.id == track.id }.coerceAtLeast(0)
