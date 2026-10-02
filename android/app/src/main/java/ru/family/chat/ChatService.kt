package ru.family.chat

import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

/**
 * Служба «Семья на связи»: держит мессенджер запущенным в фоне,
 * чтобы сообщения и входящие звонки приходили при закрытом приложении.
 */
class ChatService : Service() {

    private var lock: PowerManager.WakeLock? = null
    private var inCall = false
    private var video = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        Notifier.channels(this)
        goForeground()
        // WebView должен создаваться в главном потоке
        Handler(Looper.getMainLooper()).post { WebHolder.obtain(this) }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); return START_NOT_STICKY }
            ACTION_CALL -> {
                inCall = intent.getBooleanExtra("active", false)
                video = intent.getBooleanExtra("video", false)
                goForeground()
                if (inCall) acquire() else release()
            }
        }
        return START_STICKY
    }

    private fun goForeground() {
        val n = Notifier.service(this, inCall)
        if (Build.VERSION.SDK_INT >= 34) {
            var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            // во время звонка микрофон и камера продолжают работать, даже если свернуть приложение
            if (inCall && WebHolder.foreground) {
                type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                if (video) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            }
            try { startForeground(Notifier.ID_SERVICE, n, type) }
            catch (_: Throwable) { startForeground(Notifier.ID_SERVICE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) }
        } else if (Build.VERSION.SDK_INT >= 29) {
            var type = 0
            if (inCall) type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or (if (video) ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else 0)
            try { startForeground(Notifier.ID_SERVICE, n, type) } catch (_: Throwable) { startForeground(Notifier.ID_SERVICE, n) }
        } else {
            startForeground(Notifier.ID_SERVICE, n)
        }
    }

    private fun acquire() {
        if (lock?.isHeld == true) return
        lock = (getSystemService(POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "family:call").apply { acquire(3 * 60 * 60 * 1000L) }
    }

    private fun release() { lock?.let { if (it.isHeld) it.release() }; lock = null }

    override fun onDestroy() {
        release()
        running = false
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "ru.family.chat.STOP"
        const val ACTION_CALL = "ru.family.chat.CALL"
        @Volatile var running = false

        fun start(ctx: Context) {
            running = true
            val i = Intent(ctx, ChatService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
            } catch (_: Throwable) { running = false }
        }

        fun stop(ctx: Context) {
            running = false
            try { ctx.startService(Intent(ctx, ChatService::class.java).setAction(ACTION_STOP)) } catch (_: Throwable) {}
        }

        fun callState(ctx: Context, active: Boolean, video: Boolean) {
            if (!running) return
            try {
                ctx.startService(Intent(ctx, ChatService::class.java).setAction(ACTION_CALL)
                    .putExtra("active", active).putExtra("video", video))
            } catch (_: Throwable) {}
        }
    }
}

/** После перезагрузки телефона служба запускается сама. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val a = intent.action ?: return
        if (a == Intent.ACTION_BOOT_COMPLETED || a == Intent.ACTION_MY_PACKAGE_REPLACED || a == "android.intent.action.QUICKBOOT_POWERON") {
            if (context.getSharedPreferences("family", Context.MODE_PRIVATE).getBoolean("logged_in", false)) ChatService.start(context)
        }
    }
}
