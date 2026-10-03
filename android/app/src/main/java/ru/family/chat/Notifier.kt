package ru.family.chat

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** Все уведомления приложения: сообщения, входящие звонки и «на связи». */
object Notifier {
    const val CH_MSG = "messages_v2"
    const val CH_CALL = "calls_v2"
    const val CH_SERVICE = "service"
    const val ID_SERVICE = 100
    private const val ID_CALL = 2

    fun channels(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        // старые каналы со звуком системы — больше не нужны: мелодию играет само приложение
        for (old in listOf("messages", "calls_ring")) try { nm.deleteNotificationChannel(old) } catch (_: Throwable) {}
        nm.createNotificationChannel(NotificationChannel(CH_MSG, "Сообщения", NotificationManager.IMPORTANCE_HIGH).apply {
            setSound(null, null)
            enableVibration(false)
        })
        nm.createNotificationChannel(NotificationChannel(CH_CALL, "Входящие звонки", NotificationManager.IMPORTANCE_HIGH).apply {
            setSound(null, null)
            enableVibration(false)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            setBypassDnd(false)
        })
        nm.createNotificationChannel(NotificationChannel(CH_SERVICE, "Работа в фоне", NotificationManager.IMPORTANCE_MIN).apply {
            setShowBadge(false)
            description = "Нужно, чтобы сообщения и звонки приходили, когда приложение закрыто"
        })
    }

    private fun allowed(ctx: Context) = Build.VERSION.SDK_INT < 33 ||
        ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun openIntent(ctx: Context, chatId: String?, req: Int): PendingIntent = PendingIntent.getActivity(
        ctx, req,
        Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .apply { if (chatId != null) putExtra(MainActivity.EXTRA_CHAT, chatId) },
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    fun message(ctx: Context, title: String, text: String, chatId: String?, id: Int = (chatId ?: title).hashCode(), sound: Boolean = true) {
        if (WebHolder.foreground || !allowed(ctx)) return
        val n = NotificationCompat.Builder(ctx, CH_MSG)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setContentIntent(openIntent(ctx, chatId, id))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()
        try { NotificationManagerCompat.from(ctx).notify(id, n); if (sound) Sounds.message(ctx) } catch (_: SecurityException) {}
    }

    /**
     * Входящий звонок, когда приложение свёрнуто или экран выключен:
     * будим экран, показываем звонок поверх блокировки, кнопки «Ответить» и «Отклонить».
     */
    fun incomingCall(ctx: Context, name: String, video: Boolean = false) {
        if (WebHolder.foreground && isScreenOn(ctx)) return
        wakeScreen(ctx)
        Sounds.ringStart(ctx)
        // Самый надёжный способ: если разрешён показ поверх других приложений — сразу открываем экран звонка
        if (Build.VERSION.SDK_INT < 23 || android.provider.Settings.canDrawOverlays(ctx)) {
            try {
                ctx.startActivity(Intent(ctx, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                    .putExtra(MainActivity.EXTRA_RING, true))
            } catch (_: Throwable) {}
        }
        if (!allowed(ctx)) return
        val ring = PendingIntent.getActivity(ctx, ID_CALL,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_RING, true),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val answer = PendingIntent.getActivity(ctx, ID_CALL + 1,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_ANSWER, true),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val decline = PendingIntent.getService(ctx, ID_CALL + 2,
            Intent(ctx, ChatService::class.java).setAction(ChatService.ACTION_DECLINE),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(ctx, CH_CALL)
            .setSmallIcon(android.R.drawable.sym_call_incoming)
            .setContentTitle(name)
            .setContentText(if (video) "Входящий видеозвонок" else "Входящий звонок")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(true)
            .setTimeoutAfter(50_000)
            .setContentIntent(ring)
            .setFullScreenIntent(ring, true)
            .addAction(0, "Отклонить", decline)
            .addAction(0, "Ответить", answer)
            .build()
        try { NotificationManagerCompat.from(ctx).notify(ID_CALL, n) } catch (_: SecurityException) {}
    }

    private fun isScreenOn(ctx: Context) = (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive

    /** Включает экран на полминуты — как при обычном звонке. */
    @Suppress("DEPRECATION")
    private fun wakeScreen(ctx: Context) {
        try {
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (pm.isInteractive) return
            pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE, "family:ring")
                .acquire(30_000)
        } catch (_: Throwable) {}
    }

    /** Может ли приложение показывать звонок на весь экран поверх блокировки (Android 14+ спрашивает отдельно). */
    fun canOverlay(ctx: Context): Boolean = Build.VERSION.SDK_INT < 23 || android.provider.Settings.canDrawOverlays(ctx)

    fun canFullScreen(ctx: Context): Boolean = Build.VERSION.SDK_INT < 34 ||
        (ctx.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() ?: true)

    fun cancelCall(ctx: Context) = NotificationManagerCompat.from(ctx).cancel(ID_CALL)

    fun clearMessages(ctx: Context) {
        val nm = NotificationManagerCompat.from(ctx)
        for (sb in nm.activeNotifications) if (sb.notification.channelId == CH_MSG) nm.cancel(sb.id)
    }

    fun service(ctx: Context, inCall: Boolean) = NotificationCompat.Builder(ctx, CH_SERVICE)
        .setSmallIcon(android.R.drawable.stat_notify_chat)
        .setContentTitle(if (inCall) "Идёт звонок" else "Семья на связи")
        .setContentText(if (inCall) "Нажмите, чтобы вернуться к звонку" else "Сообщения и звонки приходят и при закрытом приложении")
        .setOngoing(true)
        .setShowWhen(false)
        .setPriority(if (inCall) NotificationCompat.PRIORITY_DEFAULT else NotificationCompat.PRIORITY_MIN)
        .setContentIntent(openIntent(ctx, null, 7))
        .build()
}
