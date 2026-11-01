package com.bitti06.modplayjs.media

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Bundle
import android.os.Looper
import android.os.SystemClock
import androidx.media3.common.Player
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.bitti06.modplayjs.AppGraph
import com.bitti06.modplayjs.MainActivity
import com.bitti06.modplayjs.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class PlaybackService : MediaSessionService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var mediaSession: MediaSession
    private lateinit var notificationProvider: StickyMediaNotificationProvider
    private lateinit var player: ModplayPlayer
    private lateinit var audioManager: AudioManager
    private var focusRequest: AudioFocusRequest? = null
    private var resumeOnFocus = false
    private var transientLoss = false
    private var lastFocusAttemptMs = 0L

    private val noisyReceiver =
        object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                    AppGraph.session.pause()
                }
            }
        }

    override fun onCreate() {
        super.onCreate()
        audioManager = getSystemService(AudioManager::class.java)
        player = ModplayPlayer(Looper.getMainLooper(), AppGraph.session)
        // Ongoing while playing: the media card stays until playback stops.
        notificationProvider = StickyMediaNotificationProvider(this)
        setMediaNotificationProvider(notificationProvider)
        mediaSession =
            MediaSession
                .Builder(this, player)
                .setCallback(callback)
                .setSessionActivity(
                    PendingIntent.getActivity(
                        this,
                        0,
                        Intent(this, MainActivity::class.java),
                        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                    ),
                ).build()

        // The app starts the service directly and has no MediaController, so
        // onGetSession() is never called. Register the session here so Media3
        // can post the media notification and run the foreground service.
        addSession(mediaSession)

        registerReceiver(
            noisyReceiver,
            IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
            RECEIVER_NOT_EXPORTED,
        )
        // The card's delete intent fires this instead of starting the service,
        // which MediaSessionService would refuse.
        registerReceiver(
            restoreReceiver,
            IntentFilter(StickyMediaNotificationProvider.ACTION_RESTORE),
            RECEIVER_NOT_EXPORTED,
        )

        scope.launch {
            AppGraph.session.queue.collectLatest { player.onQueueChanged() }
        }

        // The card shows one custom button; it mirrors the favourite flag of
        // whatever is playing, so it toggles like the heart in the player.
        scope.launch {
            combine(
                AppGraph.session.queue,
                AppGraph.session.queueIndex,
                AppGraph.library.tracks,
            ) { queue, index, rows ->
                val id = queue.getOrNull(index)?.id
                rows.firstOrNull { it.id == id }?.favoriteAt != null
            }.distinctUntilChanged()
                .collect { favorite -> mediaSession.setCustomLayout(listOf(favoriteButton(favorite))) }
        }

        scope.launch {
            AppGraph.session.snapshot.collectLatest { snap ->
                player.onSnapshot(snap)
                if (snap?.state?.playing == true) {
                    if (transientLoss) return@collectLatest
                    requestFocus()
                } else if (!transientLoss) {
                    abandonFocus()
                }
            }
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession = mediaSession

    /** Re-posts the card after it was swiped away. */
    private fun restoreNotification() {
        val notification = notificationProvider.last() ?: return
        runCatching {
            startForeground(
                notification.notificationId,
                notification.notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
            )
        }
    }

    private val restoreReceiver =
        object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                restoreNotification()
            }
        }

    private val favoriteCommand = SessionCommand(FAVORITE_ACTION, Bundle.EMPTY)

    private fun favoriteButton(favorite: Boolean): CommandButton =
        CommandButton
            .Builder()
            .setDisplayName(
                getString(if (favorite) R.string.cd_remove_favorite else R.string.cd_add_favorite),
            ).setIconResId(if (favorite) R.drawable.ic_media_favorite else R.drawable.ic_media_favorite_border)
            .setSessionCommand(favoriteCommand)
            .build()

    /**
     * One custom command: favourite the playing track. The session only offers
     * commands it granted at connect time, so it is added to the accepted set.
     */
    private val callback =
        object : MediaSession.Callback {
            override fun onConnect(
                session: MediaSession,
                controller: MediaSession.ControllerInfo,
            ): MediaSession.ConnectionResult =
                MediaSession.ConnectionResult
                    .AcceptedResultBuilder(session)
                    .setAvailableSessionCommands(
                        MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS
                            .buildUpon()
                            .add(favoriteCommand)
                            .build(),
                    ).build()

            override fun onCustomCommand(
                session: MediaSession,
                controller: MediaSession.ControllerInfo,
                customCommand: SessionCommand,
                args: Bundle,
            ): ListenableFuture<SessionResult> {
                if (customCommand.customAction != FAVORITE_ACTION) {
                    return Futures.immediateFuture(SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED))
                }
                val id = AppGraph.session.queue.value.getOrNull(AppGraph.session.queueIndex.value)?.id
                    ?: return Futures.immediateFuture(SessionResult(SessionResult.RESULT_ERROR_INVALID_STATE))
                scope.launch {
                    val favorite = AppGraph.library.tracks.first().firstOrNull { it.id == id }?.favoriteAt != null
                    AppGraph.library.setFavorite(id, !favorite)
                }
                return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
            }
        }

    /**
     * Media3 posts the notification through the provider; this override adds one
     * thing on top of that: while playing, the last notification is posted again
     * even if the system had dropped it, which is what brings a swiped card back.
     */
    override fun onUpdateNotification(
        session: MediaSession,
        startInForegroundRequired: Boolean,
    ) {
        super.onUpdateNotification(session, startInForegroundRequired)
        if (session.player.isPlaying) {
            notificationProvider.repost()
            return
        }
        // Paused: Media3 drops the foreground, and outside it the system lets the
        // card be swiped away. Stay foreground with the same notification - but
        // only while a track is loaded and not stopped, or the card would come
        // back after the user pressed stop.
        if (session.player.playbackState != Player.STATE_READY) return
        val notification = notificationProvider.last() ?: return
        runCatching {
            startForeground(
                notification.notificationId,
                notification.notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
            )
        }
    }

    /**
     * Swiping the app out of recents stops playback. Media3 keeps playing by
     * default, which leaves sound coming from a window the user just dismissed.
     * The position is kept (paused) so reopening offers the same place.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        val position = AppGraph.session.snapshot.value?.state?.positionMs?.toLong() ?: 0L
        AppGraph.playback.savePosition(position, playing = false)
        AppGraph.session.stop()
        super.onTaskRemoved(rootIntent)
    }

    private fun requestFocus() {
        if (focusRequest != null) return
        // Android 17 returns AUDIOFOCUS_REQUEST_FAILED when the request arrives
        // outside a valid lifecycle (no visible activity, no while-in-use FGS).
        // Do not record a failed request as held; retry on a later snapshot.
        val now = SystemClock.elapsedRealtime()
        if (now - lastFocusAttemptMs < FOCUS_RETRY_MS) return
        lastFocusAttemptMs = now
        val attrs =
            AudioAttributes
                .Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
        val request =
            AudioFocusRequest
                .Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener { change ->
                    when (change) {
                        AudioManager.AUDIOFOCUS_LOSS -> {
                            transientLoss = false
                            resumeOnFocus = false
                            AppGraph.session.pause()
                            abandonFocus()
                        }

                        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                            transientLoss = true
                            resumeOnFocus = AppGraph.session.snapshot.value?.state?.playing == true
                            AppGraph.session.pause()
                        }

                        AudioManager.AUDIOFOCUS_GAIN -> {
                            transientLoss = false
                            if (resumeOnFocus) AppGraph.session.play()
                            resumeOnFocus = false
                        }
                    }
                }.build()
        val granted = audioManager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        if (granted) focusRequest = request
    }

    private fun abandonFocus() {
        lastFocusAttemptMs = 0L
        val request = focusRequest ?: return
        audioManager.abandonAudioFocusRequest(request)
        focusRequest = null
    }

    override fun onDestroy() {
        scope.cancel()
        focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        runCatching { unregisterReceiver(noisyReceiver) }
        runCatching { unregisterReceiver(restoreReceiver) }
        mediaSession.release()
        player.release()
        super.onDestroy()
    }

    companion object {
        /** Custom action of the media card's favourite button. */
        private const val FAVORITE_ACTION = "com.bitti06.modplayjs.FAVORITE"

        /** Do not hammer audio focus while Android 17 rejects it. */
        private const val FOCUS_RETRY_MS = 2_000L

        fun start(context: Context) {
            context.startService(Intent(context, PlaybackService::class.java))
        }
    }
}
