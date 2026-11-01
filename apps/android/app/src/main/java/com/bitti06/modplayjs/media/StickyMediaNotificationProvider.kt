package com.bitti06.modplayjs.media

import android.app.Notification
import android.content.Context
import android.os.Bundle
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
        val sticky =
            Notification.Builder
                .recoverBuilder(context, built.notification)
                .setOngoing(mediaSession.player.isPlaying)
                .build()
        return MediaNotification(built.notificationId, sticky)
    }

    override fun handleCustomCommand(
        mediaSession: MediaSession,
        action: String,
        extras: Bundle,
    ): Boolean = delegate.handleCustomCommand(mediaSession, action, extras)

    override fun getNotificationChannelInfo(): MediaNotification.Provider.NotificationChannelInfo =
        delegate.notificationChannelInfo
}
