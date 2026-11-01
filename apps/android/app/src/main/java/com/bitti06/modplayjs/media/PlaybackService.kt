package com.bitti06.modplayjs.media

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Looper
import android.os.SystemClock
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.bitti06.modplayjs.AppGraph
import com.bitti06.modplayjs.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class PlaybackService : MediaSessionService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var mediaSession: MediaSession
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
        mediaSession =
            MediaSession
                .Builder(this, player)
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

        scope.launch {
            AppGraph.session.queue.collectLatest { player.onQueueChanged() }
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
        mediaSession.release()
        player.release()
        super.onDestroy()
    }

    companion object {
        /** Do not hammer audio focus while Android 17 rejects it. */
        private const val FOCUS_RETRY_MS = 2_000L

        fun start(context: Context) {
            context.startService(Intent(context, PlaybackService::class.java))
        }
    }
}
