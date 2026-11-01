package com.bitti06.modplayjs.media

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.IBinder
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.media.app.NotificationCompat.MediaStyle
import androidx.media.session.MediaButtonReceiver
import com.bitti06.modplayjs.AppGraph
import com.bitti06.modplayjs.R
import com.bitti06.modplayjs.engine.AndroidSnapshot
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class PlaybackService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var mediaSession: MediaSessionCompat
    private lateinit var audioManager: AudioManager
    private var focusRequest: AudioFocusRequest? = null
    private var collectJob: Job? = null
    private var lastNotificationState: String? = null
    private var resumeOnFocus = false

    private val noisyReceiver =
        object : BroadcastReceiver() {
            override fun onReceive(
                context: Context?,
                intent: Intent?,
            ) {
                if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) AppGraph.session.pause()
            }
        }

    override fun onCreate() {
        super.onCreate()
        audioManager = getSystemService(AudioManager::class.java)
        createChannel()
        mediaSession =
            MediaSessionCompat(this, "modplayjs").apply {
                setCallback(
                    object : MediaSessionCompat.Callback() {
                        override fun onPlay() {
                            AppGraph.session.play()
                        }

                        override fun onPause() {
                            AppGraph.session.pause()
                        }

                        override fun onSkipToNext() {
                            AppGraph.session.next()
                        }

                        override fun onSkipToPrevious() {
                            AppGraph.session.previous()
                        }

                        override fun onSeekTo(pos: Long) {
                            AppGraph.session.seek(pos)
                        }

                        override fun onStop() {
                            AppGraph.session.stop()
                        }
                    },
                )
                isActive = true
                setMediaButtonReceiver(
                    MediaButtonReceiver.buildMediaButtonPendingIntent(
                        this@PlaybackService,
                        PlaybackStateCompat.ACTION_PLAY_PAUSE,
                    ),
                )
            }
        registerReceiver(noisyReceiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), RECEIVER_NOT_EXPORTED)
        collectJob =
            scope.launch {
                AppGraph.session.snapshot.collectLatest { update(it) }
            }
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int,
    ): Int {
        when (intent?.action) {
            ACTION_PLAY -> AppGraph.session.play()
            ACTION_PAUSE -> AppGraph.session.pause()
            ACTION_NEXT -> AppGraph.session.next()
            ACTION_PREV -> AppGraph.session.previous()
            else -> intent?.let { MediaButtonReceiver.handleIntent(mediaSession, it) }
        }
        startForegroundCompat(buildNotification(AppGraph.session.snapshot.value))
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun update(snap: AndroidSnapshot?) {
        if (snap == null) return
        val track = snap.track ?: return
        mediaSession.setMetadata(
            MediaMetadataCompat
                .Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, track.title.ifBlank { track.name })
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, track.tracker.ifBlank { track.format.uppercase() })
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, track.durationMs.toLong())
                .build(),
        )
        val state =
            when {
                snap.state.playing -> PlaybackStateCompat.STATE_PLAYING
                snap.state.paused -> PlaybackStateCompat.STATE_PAUSED
                snap.state.ended -> PlaybackStateCompat.STATE_STOPPED
                else -> PlaybackStateCompat.STATE_PAUSED
            }
        mediaSession.setPlaybackState(
            PlaybackStateCompat
                .Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or
                        PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or PlaybackStateCompat.ACTION_SEEK_TO or
                        PlaybackStateCompat.ACTION_STOP,
                ).setState(state, snap.state.positionMs.toLong(), 1f)
                .build(),
        )
        val key = "$state:${track.id}:${snap.state.positionMs.toLong() / 1000}"
        if (key != lastNotificationState) {
            lastNotificationState = key
            val n = buildNotification(snap)
            val nm = getSystemService(NotificationManager::class.java)
            nm.notify(NOTIF_ID, n)
            if (state == PlaybackStateCompat.STATE_PLAYING || state == PlaybackStateCompat.STATE_PAUSED) {
                startForegroundCompat(n)
            }
        }
        if (snap.state.playing) requestFocus()
    }

    private fun createChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Playback", NotificationManager.IMPORTANCE_LOW).apply {
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            },
        )
    }

    private fun buildNotification(snap: AndroidSnapshot?): Notification {
        val track = snap?.track
        val playing = snap?.state?.playing == true
        val intent = Intent(this, com.bitti06.modplayjs.MainActivity::class.java)
        val pi = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val toggle =
            if (playing) {
                PendingIntent.getService(
                    this,
                    1,
                    Intent(this, PlaybackService::class.java).setAction(ACTION_PAUSE),
                    PendingIntent.FLAG_IMMUTABLE,
                )
            } else {
                PendingIntent.getService(
                    this,
                    2,
                    Intent(this, PlaybackService::class.java).setAction(ACTION_PLAY),
                    PendingIntent.FLAG_IMMUTABLE,
                )
            }
        val next =
            PendingIntent.getService(
                this,
                3,
                Intent(this, PlaybackService::class.java).setAction(ACTION_NEXT),
                PendingIntent.FLAG_IMMUTABLE,
            )
        val prev =
            PendingIntent.getService(
                this,
                4,
                Intent(this, PlaybackService::class.java).setAction(ACTION_PREV),
                PendingIntent.FLAG_IMMUTABLE,
            )
        return NotificationCompat
            .Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(track?.title?.ifBlank { track.name } ?: "modplayjs")
            .setContentText(track?.tracker?.ifBlank { track.format.uppercase() } ?: "Tracker player")
            .setContentIntent(pi)
            .setOngoing(playing)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(if (playing) R.drawable.ic_notification else R.drawable.ic_notification, "Previous", prev)
            .addAction(R.drawable.ic_notification, if (playing) "Pause" else "Play", toggle)
            .addAction(R.drawable.ic_notification, "Next", next)
            .setStyle(MediaStyle().setMediaSession(mediaSession.sessionToken).setShowActionsInCompactView(0, 1, 2))
            .build()
    }

    private fun startForegroundCompat(n: Notification) {
        startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    }

    private fun requestFocus() {
        if (focusRequest != null) return
        val attrs =
            AudioAttributes
                .Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
        val req =
            AudioFocusRequest
                .Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener { change ->
                    when (change) {
                        AudioManager.AUDIOFOCUS_LOSS -> {
                            resumeOnFocus = false
                            AppGraph.session.pause()
                        }

                        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                            resumeOnFocus = AppGraph.session.snapshot.value
                                ?.state
                                ?.playing == true
                            AppGraph.session.pause()
                        }

                        AudioManager.AUDIOFOCUS_GAIN -> {
                            if (resumeOnFocus) AppGraph.session.play()
                        }
                    }
                }.build()
        focusRequest = req
        audioManager.requestAudioFocus(req)
    }

    override fun onDestroy() {
        collectJob?.cancel()
        scope.cancel()
        focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        runCatching { unregisterReceiver(noisyReceiver) }
        mediaSession.isActive = false
        mediaSession.release()
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "playback"
        private const val NOTIF_ID = 42
        const val ACTION_PLAY = "com.bitti06.modplayjs.PLAY"
        const val ACTION_PAUSE = "com.bitti06.modplayjs.PAUSE"
        const val ACTION_NEXT = "com.bitti06.modplayjs.NEXT"
        const val ACTION_PREV = "com.bitti06.modplayjs.PREV"

        fun start(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, PlaybackService::class.java))
        }
    }
}
