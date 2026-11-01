package com.bitti06.modplayjs.media

import android.os.Looper
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.bitti06.modplayjs.engine.AndroidSnapshot
import com.bitti06.modplayjs.engine.AndroidTrack
import com.bitti06.modplayjs.engine.PlaybackSession
import com.bitti06.modplayjs.engine.QueueItem
import com.google.common.util.concurrent.Futures
import java.util.Locale
import com.google.common.util.concurrent.ListenableFuture

/**
 * Media3 Player facade over the existing PlaybackSession. Media3 owns the
 * session, notification, lockscreen and media buttons; the JS/V8 engine owns
 * the audio.
 */
@androidx.annotation.OptIn(UnstableApi::class)
class ModplayPlayer(
    looper: Looper,
    private val playback: PlaybackSession,
) : SimpleBasePlayer(looper) {
    @Volatile private var snapshot: AndroidSnapshot? = null
    private var lastLoggedState: String? = null

    // Media3 gets a window around the current track, not the whole queue: a
    // library can hold thousands of items, and every playlist change is both
    // mapped here and sent across the session binder. The engine keeps the real
    // queue; this only feeds the notification and the media controls.
    private var windowStart = 0

    // Rebuilt only when something in the window changed. Media3 asks for the
    // state on every snapshot (4x/s).
    private var cachedQueue: List<QueueItem>? = null
    private var cachedStart = -1
    private var cachedEnd = -1
    private var cachedIndex = -1
    private var cachedTitle = ""
    private var cachedArtist = ""
    private var cachedDurationUs = C.TIME_UNSET
    private var cachedArtistLine = ""
    private var cachedSeekable = false
    private var cachedItems: List<MediaItemData> = emptyList()

    fun onSnapshot(value: AndroidSnapshot?) {
        snapshot = value
        invalidateState()
    }

    /** The queue or its index changed without a snapshot; rebuild the state. */
    fun onQueueChanged() {
        invalidateState()
    }

    override fun getState(): State {
        val snap = snapshot
        val engine = snap?.track
        val queue = playback.queue.value
        // The engine is the source of truth for what is audible: the queue
        // index can lag a load, and the notification would then name another
        // track than the player screen.
        val byName =
            engine?.name?.let { name -> queue.indexOfFirst { it.name == name } } ?: -1
        val currentIndex =
            if (byName >= 0) byName else playback.queueIndex.value.coerceIn(0, maxOf(0, queue.lastIndex))
        val items = playlistFor(queue, currentIndex, engine, snap)

        val builder =
            State
                .Builder()
                .setAvailableCommands(
                    Player.Commands
                        .Builder()
                        .addAllReadOnlyCommands()
                        .addAll(
                            Player.COMMAND_PLAY_PAUSE,
                            Player.COMMAND_PREPARE,
                            Player.COMMAND_STOP,
                            Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
                            Player.COMMAND_SEEK_TO_DEFAULT_POSITION,
                            Player.COMMAND_SEEK_TO_NEXT,
                            Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                            Player.COMMAND_SEEK_TO_PREVIOUS,
                            Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
                            Player.COMMAND_RELEASE,
                        ).build(),
                ).setPlaylist(items)
                .setPlayWhenReady(
                    snap != null && snap.state.playing && !snap.state.paused,
                    Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST,
                )
                .setPlaybackState(
                    when {
                        snap == null || snap.track == null -> Player.STATE_IDLE
                        snap.state.ended -> Player.STATE_ENDED
                        else -> Player.STATE_READY
                    },
                ).setContentPositionMs(snap?.state?.positionMs?.toLong() ?: 0L)
                .setRepeatMode(
                    when (snap?.state?.repeat) {
                        "all" -> Player.REPEAT_MODE_ALL
                        "one" -> Player.REPEAT_MODE_ONE
                        else -> Player.REPEAT_MODE_OFF
                    },
                ).setShuffleModeEnabled(snap?.state?.shuffle == true)
                .setVolume((snap?.settings?.transport?.volume ?: 100) / 100f)

        if (items.isNotEmpty()) {
            builder.setCurrentMediaItemIndex((currentIndex - windowStart).coerceIn(0, items.lastIndex))
        }
        val summary = "queue=${queue.size} index=$currentIndex engine=${engine?.name} item=${queue.getOrNull(currentIndex)?.name}"
        if (summary != lastLoggedState) {
            lastLoggedState = summary
            Log.i(TAG, summary)
        }
        return builder.build()
    }

    /**
     * The window of the queue that Media3 sees, centred on [currentIndex] so
     * the notification always has a track either side. Cached, so the 4 Hz
     * state refresh does not remap it.
     */
    private fun playlistFor(
        queue: List<QueueItem>,
        currentIndex: Int,
        engine: AndroidTrack?,
        snap: AndroidSnapshot?,
    ): List<MediaItemData> {
        val title = engine?.title.orEmpty()
        val artist = engine?.tracker.orEmpty()
        val durationUs =
            if (snap != null && snap.state.durationKnown) {
                (snap.state.durationMs * 1000).toLong()
            } else {
                C.TIME_UNSET
            }
        val seekable = snap?.capabilities?.seekable == true
        // The system media card shows no timestamps at rest, so the current
        // item's subtitle carries them; it changes once a second while playing.
        val artistLine =
            if (durationUs != C.TIME_UNSET) {
                val position = snap?.state?.positionMs?.toLong() ?: 0L
                listOf(artist.takeIf { it.isNotBlank() }, "${clock(position)} / ${clock(durationUs / 1000)}")
                    .filterNotNull()
                    .joinToString(" · ")
            } else {
                artist
            }
        val start =
            (currentIndex - WINDOW / 2)
                .coerceAtLeast(0)
                .coerceAtMost((queue.size - WINDOW).coerceAtLeast(0))
        val end = (start + WINDOW).coerceAtMost(queue.size)
        if (cachedQueue === queue &&
            cachedStart == start &&
            cachedEnd == end &&
            cachedIndex == currentIndex &&
            cachedTitle == title &&
            cachedArtist == artist &&
            cachedDurationUs == durationUs &&
            cachedArtistLine == artistLine &&
            cachedSeekable == seekable
        ) {
            windowStart = cachedStart
            return cachedItems
        }
        val built =
            queue.subList(start, end).mapIndexed { offset, item ->
                val index = start + offset
                val current = index == currentIndex
                MediaItemData
                    .Builder(item.id)
                    .setMediaItem(
                        MediaItem
                            .Builder()
                            .setMediaId(item.id)
                            .setMediaMetadata(
                                MediaMetadata
                                    .Builder()
                                    .setTitle(
                                        if (current) {
                                            engine?.title?.takeIf { it.isNotBlank() } ?: item.name
                                        } else {
                                            item.name
                                        },
                                    )
                                    .setArtist(
                                        if (current) {
                                            artistLine.ifBlank { item.format.uppercase() }
                                        } else {
                                            item.format.uppercase()
                                        },
                                    ).build(),
                            ).build(),
                    ).setDurationUs(if (current) durationUs else C.TIME_UNSET)
                    .setIsSeekable(seekable)
                    .build()
            }
        cachedQueue = queue
        cachedStart = start
        cachedEnd = end
        cachedIndex = currentIndex
        cachedTitle = title
        cachedArtist = artist
        cachedDurationUs = durationUs
        cachedArtistLine = artistLine
        cachedSeekable = seekable
        cachedItems = built
        windowStart = start
        return built
    }

    override fun handlePrepare(): ListenableFuture<*> = Futures.immediateVoidFuture()

    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
        if (playWhenReady) playback.play() else playback.pause()
        return Futures.immediateVoidFuture()
    }

    override fun handleStop(): ListenableFuture<*> {
        playback.stop()
        return Futures.immediateVoidFuture()
    }

    override fun handleRelease(): ListenableFuture<*> = Futures.immediateVoidFuture()

    override fun handleSeek(
        mediaItemIndex: Int,
        positionMs: Long,
        seekCommand: Int,
    ): ListenableFuture<*> {
        when (seekCommand) {
            Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> playback.next()
            Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> playback.previous()
            else -> {
                // Playlist indices are window-relative; the engine's are not.
                if (mediaItemIndex != C.INDEX_UNSET) {
                    val target = mediaItemIndex + windowStart
                    if (target != playback.queueIndex.value) playback.playIndex(target)
                }
                if (positionMs != C.TIME_UNSET) playback.seek(positionMs)
            }
        }
        return Futures.immediateVoidFuture()
    }

    /** mm:ss, or h:mm:ss past an hour. */
    private fun clock(ms: Long): String {
        val total = (ms / 1000).coerceAtLeast(0)
        val hours = total / 3600
        val minutes = (total % 3600) / 60
        val seconds = total % 60
        return if (hours > 0) {
            String.format(Locale.ROOT, "%d:%02d:%02d", hours, minutes, seconds)
        } else {
            String.format(Locale.ROOT, "%d:%02d", minutes, seconds)
        }
    }

    private companion object {
        const val TAG = "ModplayPlayer"

        /** How many queue items Media3 is told about at a time. */
        const val WINDOW = 64
    }
}
