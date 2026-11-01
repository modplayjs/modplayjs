package com.bitti06.modplayjs.media

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.core.app.NotificationManagerCompat
import androidx.media3.session.CommandButton
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaNotification
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList

/**
 * Media3's own media notification, with one change: it is ongoing while the
 * player is playing, so the card cannot be swiped away mid-track and leaving the
 * controls a touch away.
 *
 * The default provider's `createNotification` is final and builds the
 * [Notification] internally, so the flag is applied by recovering the builder
 * from the notification it just built; everything else is delegated untouched.
 */
class StickyMediaNotificationProvider(
    context: Context,
) : MediaNotification.Provider {
    private val context = context.applicationContext
    private val delegate = DefaultMediaNotificationProvider(context)

    /** The last notification the system accepted, for [repost]. */
    @Volatile private var lastBuilt: MediaNotification? = null

    override fun createNotification(
        mediaSession: MediaSession,
        mediaButtonPreferences: ImmutableList<CommandButton>,
        actionFactory: MediaNotification.ActionFactory,
        onNotificationChangedCallback: MediaNotification.Provider.Callback,
    ): MediaNotification {
        val built =
            delegate.createNotification(
                mediaSession,
                mediaButtonPreferences,
                actionFactory,
                onNotificationChangedCallback,
            )
        // Ongoing whether playing or paused: a paused session is still a session
        // the user is in the middle of, and a swipe would take the controls.
        // Android 14+ lets the swipe through anyway, so the dismissal is caught
        // and the notification handed straight back.
        val sticky =
            Notification.Builder
                .recoverBuilder(context, built.notification)
                .setOngoing(true)
                .setAutoCancel(false)
                .setDeleteIntent(restoreIntent())
                .build()
                .let { MediaNotification(built.notificationId, it) }
        lastBuilt = sticky
        return sticky
    }

    override fun handleCustomCommand(
        mediaSession: MediaSession,
        action: String,
        extras: Bundle,
    ): Boolean = delegate.handleCustomCommand(mediaSession, action, extras)

    override fun getNotificationChannelInfo(): MediaNotification.Provider.NotificationChannelInfo =
        delegate.notificationChannelInfo

    companion object {
        /** Broadcast to the service when the card is dismissed. */
        const val ACTION_RESTORE = "com.bitti06.modplayjs.RESTORE_NOTIFICATION"

        private const val RESTORE_REQUEST = 1001
    }

    /**
     * A broadcast, not a service start: MediaSessionService treats a start it
     * did not issue as foreign, stops itself and removes the notification, so
     * the restore has to travel around it.
     */
    private fun restoreIntent(): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            RESTORE_REQUEST,
            Intent(ACTION_RESTORE).setPackage(context.packageName),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    /** The last notification the system accepted, for [repost] and the service. */
    fun last(): MediaNotification? = lastBuilt

    /**
     * Posts the last notification again. SystemUI keeps its own "dismissed"
     * memory per session, and Media3 stops posting while the player is idle, so
     * the app has to hand the notification back itself.
     */
    fun repost() {
        val notification = lastBuilt ?: return
        runCatching {
            NotificationManagerCompat.from(context).notify(notification.notificationId, notification.notification)
        }
    }
}
