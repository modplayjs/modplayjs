package com.bitti06.modplayjs.media

import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.bitti06.modplayjs.engine.AndroidSnapshot
import com.bitti06.modplayjs.engine.PlaybackSession
import com.google.common.util.concurrent.Futures
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

    fun onSnapshot(value: AndroidSnapshot?) {
        snapshot = value
        invalidateState()
    }

    override fun getState(): State {
        val snap = snapshot
        val queue = playback.queue.value
        val currentIndex = playback.queueIndex.value
        val items =
            queue.mapIndexed { index, item ->
                MediaItemData
                    .Builder(item.id)
                    .setMediaItem(
                        MediaItem
                            .Builder()
                            .setMediaId(item.id)
                            .setMediaMetadata(
                                MediaMetadata
                                    .Builder()
                                    .setTitle(item.name)
                                    .setArtist(item.format.uppercase())
                                    .build(),
                            ).build(),
                    ).setDurationUs(
                        if (snap != null && index == currentIndex && snap.state.durationKnown) {
                            (snap.state.durationMs * 1000).toLong()
                        } else {
                            C.TIME_UNSET
                        },
                    ).setIsSeekable(snap?.capabilities?.seekable == true)
                    .build()
            }

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
                            Player.COMMAND_SEEK_TO_PREVIOUS,
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
            builder.setCurrentMediaItemIndex(currentIndex.coerceIn(0, items.lastIndex))
        }
        return builder.build()
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
            Player.COMMAND_SEEK_TO_NEXT -> playback.next()
            Player.COMMAND_SEEK_TO_PREVIOUS -> playback.previous()
            else -> {
                if (mediaItemIndex != C.INDEX_UNSET && mediaItemIndex != playback.queueIndex.value) {
                    playback.playIndex(mediaItemIndex)
                }
                if (positionMs != C.TIME_UNSET) playback.seek(positionMs)
            }
        }
        return Futures.immediateVoidFuture()
    }
}
