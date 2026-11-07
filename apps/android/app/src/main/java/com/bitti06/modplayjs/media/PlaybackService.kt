package com.bitti06.modplayjs.media

import android.app.ActivityManager
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
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import androidx.media3.common.util.UnstableApi
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

@androidx.annotation.OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var mediaSession: MediaSession
    private lateinit var notificationProvider: StickyMediaNotificationProvider
    private lateinit var player: ModplayPlayer
    private lateinit var audioManager: AudioManager
    private lateinit var wakeLock: PlaybackWakeLock
    private var focusRequest: AudioFocusRequest? = null
    private var resumeOnFocus = false
    private var transientLoss = false
    private var playbackDelayed = false
    private var lastFocusAttemptMs = 0L
    private val mainHandler = Handler(Looper.getMainLooper())
    private val nudgeNotification = Runnable { notificationProvider.repost() }
    private var lastFavorite = false

    /**
     * Last foreground-service state this app observed, so a transition is one
     * log line instead of four a second. Android 17 only lets a foreground
     * service with while-in-use capability play audio; losing that state is
     * otherwise invisible until the sound stops.
     */
    private var lastForeground: Boolean? = null
    private var lastForegroundQuery = 0L

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
        wakeLock = PlaybackWakeLock(this)
        player = ModplayPlayer(Looper.getMainLooper(), AppGraph.session)
        // Media3 updates the notification on its own events; a short delay puts
        // the re-attach after that, so it shows the new track, not the old one.
        player.addListener(
            object : Player.Listener {
                // A track transition only refreshes the card. Creating a new
                // MediaSession here would remove the old one from the service,
                // and Media3 stops the foreground service when the last session
                // is removed (MediaNotificationManager.removeNotification ->
                // Util.stopForeground). Re-entering the foreground from the
                // background is then refused, or granted without while-in-use
                // capability, and Android 17 silences AudioTrack.write without
                // reporting anything. One session for the service lifetime is
                // the documented Media3 shape, so that is what we keep.
                override fun onMediaItemTransition(
                    mediaItem: MediaItem?,
                    reason: Int,
                ) = nudge()

                override fun onPlayWhenReadyChanged(
                    playWhenReady: Boolean,
                    reason: Int,
                ) = nudge()
            },
        )
        // Ongoing while playing: the media card stays until playback stops.
        notificationProvider = StickyMediaNotificationProvider(this)
        setMediaNotificationProvider(notificationProvider)
        // Android 12+ may refuse a foreground start from the background; Media3
        // swallows the exception and reports it here instead.
        setListener(
            object : MediaSessionService.Listener {
                override fun onForegroundServiceStartNotAllowedException() {
                    Log.w(TAG, "foreground start blocked by the system")
                }
            },
        )
        mediaSession = buildSession()
        // The engine starts its AudioTrack on its own thread; the contract is
        // that the service has focus before output begins, so the engine asks.
        AppGraph.session.audioFocusHeld = { ensureFocus() }

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
                .collect { favorite ->
                    lastFavorite = favorite
                    if (::mediaSession.isInitialized) {
                        mediaSession.setCustomLayout(listOf(favoriteButton(favorite)))
                    }
                }
        }

        scope.launch {
            AppGraph.session.snapshot.collectLatest { snap ->
                player.onSnapshot(snap)
                val foreground = inForeground()
                AppGraph.session.foregroundServiceActive = foreground
                // Entering the foreground is what unblocks a focus request that
                // was refused while the service was not yet foreground, so that
                // transition gets an immediate retry instead of waiting out the
                // rate limit.
                val enteredForeground = foreground && lastForeground != true
                if (foreground != lastForeground) {
                    lastForeground = foreground
                    Log.i(TAG, "foreground service state: $foreground")
                }
                if (snap?.state?.playing == true) {
                    // Hold the CPU for the render thread before asking for
                    // focus: with the screen off the scheduler is otherwise free
                    // to park the Java thread that fills the ring, which is the
                    // silence-with-a-progress-bar case.
                    wakeLock.acquire()
                    if (!transientLoss && ensureFocus(force = enteredForeground)) {
                        // Focus was refused earlier and has now been granted on
                        // a retry; finish a start the engine is holding back.
                        AppGraph.session.startOutputAfterUi()
                    }
                } else {
                    // Also on a transient focus loss: the player is paused then,
                    // and a held lock would keep the CPU up for nothing.
                    wakeLock.release()
                    // A pause keeps focus: the documented rule is to abandon
                    // when playback is finished, not when it is interrupted, and
                    // a track change passes through "not playing" for a second.
                    // Abandoning there meant a fresh request per track, which on
                    // Android 15+ fails whenever the app happens to be in the
                    // background at that moment.
                    val finished = snap == null || snap.state.ended || snap.track == null
                    if (!transientLoss && finished) abandonFocus()
                }
            }
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession = mediaSession

    /**
     * One session for the whole service lifetime.
     *
     * The previous code built a fresh session per track so a swiped-away card
     * would come back, because SystemUI remembers a dismissal by session token.
     * The price is what Media3 does when the last session is removed: the
     * notification is cancelled and the foreground service is stopped
     * (MediaNotificationManager.updateNotification -> removeNotification ->
     * Util.stopForeground). The next track then re-enters the foreground from
     * the background, which Android 12+ may refuse and which on Android 17
     * yields a foreground service without while-in-use capability. Background
     * audio hardening then silences AudioTrack.write with no error, no
     * underrun and no dead object, while the player still reports "playing".
     *
     * A session id only has to be unique inside this process; one service
     * instance creates exactly one, so the creation time is enough.
     */
    private fun buildSession(): MediaSession =
        MediaSession
            .Builder(this, player)
            .setId("modplay-${System.currentTimeMillis()}")
            .setCallback(callback)
            .setSessionActivity(
                PendingIntent.getActivity(
                    this,
                    0,
                    Intent(this, MainActivity::class.java),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                ),
            ).setCustomLayout(listOf(favoriteButton(lastFavorite)))
            .build()

    /**
     * Re-posts the card shortly after the player changed, once Media3 rebuilt
     * it. Plain notificationManager.notify, not startForeground: the service
     * is already running, and a foreground (re)start is exactly what Android
     * refuses from the background.
     */
    private fun nudge() {
        mainHandler.removeCallbacks(nudgeNotification)
        mainHandler.postDelayed(nudgeNotification, NUDGE_DELAY_MS)
    }

    /** Re-posts the card after it was swiped away. */
    private fun restoreNotification() {
        if (!::mediaSession.isInitialized) return
        if (mediaSession.player.currentMediaItem == null) return
        val notification = notificationProvider.last() ?: return
        runCatching {
            startForeground(
                notification.notificationId,
                notification.notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
            )
        }.onFailure { Log.w(TAG, "cannot restore the media card", it) }
    }

    private val restoreReceiver =
        object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                restoreNotification()
            }
        }

    private val favoriteCommand = SessionCommand(FAVORITE_ACTION, Bundle.EMPTY)

    private fun favoriteButton(favorite: Boolean): CommandButton =
        // The heart is one of Media3's own icons, so no drawable resource is
        // needed and R8 can shrink ours.
        CommandButton
            .Builder(if (favorite) CommandButton.ICON_HEART_FILLED else CommandButton.ICON_HEART_UNFILLED)
            .setDisplayName(
                getString(if (favorite) R.string.cd_remove_favorite else R.string.cd_add_favorite),
            ).setSessionCommand(favoriteCommand)
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
            ): MediaSession.ConnectionResult {
                // The two-argument builder seeds its defaults from the trust of
                // the controller; the card's heart is the one command on top.
                val defaults =
                    if (controller.isTrusted) {
                        MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS
                    } else {
                        MediaSession.ConnectionResult.DEFAULT_UNTRUSTED_SESSION_COMMANDS
                    }
                return MediaSession.ConnectionResult
                    .AcceptedResultBuilder(session, controller)
                    .setAvailableSessionCommands(defaults.buildUpon().add(favoriteCommand).build())
                    .build()
            }

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
     * Whether this service is currently a foreground service.
     *
     * Media3's own `isPlaybackOngoing()` reports "has been started in the
     * foreground at least once", not the current state, so it cannot be used
     * here. `ActivityManager.getRunningServices` is deprecated but still
     * returns the caller's own services with their foreground flag.
     */
    @Suppress("DEPRECATION") // getRunningServices still lists the caller's own services.
    private fun inForeground(): Boolean {
        val now = SystemClock.elapsedRealtime()
        if (now - lastForegroundQuery < FOREGROUND_QUERY_MS) return lastForeground ?: false
        lastForegroundQuery = now
        val manager = getSystemService(ActivityManager::class.java) ?: return false
        return runCatching {
            manager.getRunningServices(Int.MAX_VALUE).any {
                it.service.packageName == packageName &&
                    it.service.className == PlaybackService::class.java.name &&
                    it.foreground
            }
        }.getOrDefault(false)
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
        }.onFailure { Log.w(TAG, "cannot keep the card in the foreground while paused", it) }
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

    /**
     * Ask for audio focus if it is not held yet. Returns whether output may
     * start now. Called from the main thread (focus listener, snapshot) and
     * from the engine's IO threads through [PlaybackSession.audioFocusHeld],
     * hence synchronized.
     */
    @Synchronized
    private fun ensureFocus(force: Boolean = false): Boolean {
        if (focusRequest != null) return !playbackDelayed
        val now = SystemClock.elapsedRealtime()
        if (!force && now - lastFocusAttemptMs < FOCUS_RETRY_MS) return false
        lastFocusAttemptMs = now
        val request = buildFocusRequest()
        return when (audioManager.requestAudioFocus(request)) {
            AudioManager.AUDIOFOCUS_REQUEST_GRANTED -> {
                focusRequest = request
                playbackDelayed = false
                AppGraph.session.audioFocusGranted = true
                Log.i(TAG, "audio focus granted")
                true
            }

            AudioManager.AUDIOFOCUS_REQUEST_DELAYED -> {
                // Focus is locked by a call or another exclusive app. The
                // listener gets AUDIOFOCUS_GAIN when it is released; until then
                // output must not start, or the system mutes us for the whole
                // call instead of resuming cleanly afterwards.
                focusRequest = request
                playbackDelayed = true
                Log.i(TAG, "audio focus delayed until the other app releases it")
                false
            }

            else -> {
                AppGraph.session.audioFocusGranted = false
                Log.w(TAG, "audio focus refused, output stays paused until it is granted")
                false
            }
        }
    }

    private fun buildFocusRequest(): AudioFocusRequest =
        AudioFocusRequest
            .Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(
                AudioAttributes
                    .Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build(),
            )
            // A call or an exclusive app locks focus instead of refusing it;
            // without this the request simply fails and never resumes.
            .setAcceptsDelayedFocusGain(true)
            // Music keeps playing ducked under a notification sound: automatic
            // ducking then needs no callback at all. These are the documented
            // conditions for it (usage media, gain focus, no pause-on-duck).
            .setWillPauseWhenDucked(false)
            .setOnAudioFocusChangeListener { change ->
                when (change) {
                    AudioManager.AUDIOFOCUS_LOSS -> {
                        transientLoss = false
                        resumeOnFocus = false
                        playbackDelayed = false
                        Log.i(TAG, "audio focus lost permanently: pausing")
                        AppGraph.session.audioFocusGranted = false
                        AppGraph.session.pause()
                        abandonFocus()
                    }

                    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                        transientLoss = true
                        resumeOnFocus = AppGraph.session.snapshot.value?.state?.playing == true
                        AppGraph.session.audioFocusGranted = false
                        Log.i(TAG, "audio focus lost transiently: pausing, resume=$resumeOnFocus")
                        AppGraph.session.pause()
                    }

                    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                        // Automatic ducking handles the level; the callback only
                        // arrives if the system did not duck on our behalf.
                        Log.i(TAG, "audio focus loss, ducking allowed: keep playing")
                    }

                    AudioManager.AUDIOFOCUS_GAIN -> {
                        Log.i(TAG, "audio focus regained, resume=$resumeOnFocus delayed=$playbackDelayed")
                        val resume = resumeOnFocus || playbackDelayed
                        AppGraph.session.audioFocusGranted = true
                        transientLoss = false
                        playbackDelayed = false
                        resumeOnFocus = false
                        if (resume) {
                            AppGraph.session.play()
                            AppGraph.session.startOutputAfterUi()
                        }
                    }
                }
            }.build()

    @Synchronized
    private fun abandonFocus() {
        lastFocusAttemptMs = 0L
        playbackDelayed = false
        val request = focusRequest ?: return
        audioManager.abandonAudioFocusRequest(request)
        focusRequest = null
        AppGraph.session.audioFocusGranted = false
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(nudgeNotification)
        scope.cancel()
        AppGraph.session.audioFocusHeld = null
        AppGraph.session.audioFocusGranted = false
        AppGraph.session.foregroundServiceActive = false
        wakeLock.release()
        abandonFocus()
        runCatching { unregisterReceiver(noisyReceiver) }
        runCatching { unregisterReceiver(restoreReceiver) }
        mediaSession.release()
        player.release()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "PlaybackService"

        /** Wait for Media3 to rebuild the notification before re-attaching it. */
        private const val NUDGE_DELAY_MS = 200L

        /** Custom action of the media card's favourite button. */
        private const val FAVORITE_ACTION = "com.bitti06.modplayjs.FAVORITE"

        /** Do not hammer audio focus while Android 17 rejects it. */
        private const val FOCUS_RETRY_MS = 2_000L

        /** getRunningServices is a binder call; once a second is plenty. */
        private const val FOREGROUND_QUERY_MS = 1_000L

        fun start(context: Context) {
            context.startService(Intent(context, PlaybackService::class.java))
        }
    }
}
