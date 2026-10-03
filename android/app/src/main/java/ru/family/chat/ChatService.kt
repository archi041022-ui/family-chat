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
    private var callTypesOk = false      // микрофон/камера уже разрешены для этого звонка
    private var screen: ScreenCapture? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        Notifier.channels(this)
        goForeground()
        // WebView должен создаваться в главном потоке
        Handler(Looper.getMainLooper()).post { WebHolder.obtain(this) }
        applyReliable()
        handler.postDelayed(keepAlive, KEEPALIVE_MS)
    }

    // Проверка связи с сервером каждые 20 секунд: если соединение уснуло — мессенджер переподключается,
    // поэтому входящие звонки доходят и при выключенном экране.
    private val handler = Handler(Looper.getMainLooper())
    private var ticks = 0
    private val keepAlive = object : Runnable {
        override fun run() {
            WebHolder.js("window.__keepAlive && window.__keepAlive()")
            // страница не отвечает (уснула или выгружена) — оповещения забираем сами, раз в минуту
            if (++ticks % 3 == 0 && Push.webStale()) Push.poll(this@ChatService)
            handler.postDelayed(this, KEEPALIVE_MS)
        }
    }
    private var onlineLock: PowerManager.WakeLock? = null

    /** «Надёжные звонки»: процессор не засыпает полностью, соединение не рвётся (немного больше расход батареи). */
    private fun applyReliable() {
        val on = getSharedPreferences("family", MODE_PRIVATE).getBoolean("reliable", true)
        if (on && onlineLock?.isHeld != true) {
            onlineLock = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "family:online")
                .apply { setReferenceCounted(false); acquire() }
        } else if (!on) { onlineLock?.let { if (it.isHeld) it.release() }; onlineLock = null }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); return START_NOT_STICKY }
            ACTION_DECLINE -> {
                Sounds.ringStop()
                Notifier.cancelCall(this)
                WebHolder.js("window.declineIncoming && window.declineIncoming()")
            }
            ACTION_RELIABLE -> applyReliable()
            ACTION_CALL -> {
                inCall = intent.getBooleanExtra("active", false)
                if (inCall) Sounds.ringStop()                       // разговор начался — мелодия не нужна
                video = intent.getBooleanExtra("video", false)
                if (!inCall) { callTypesOk = false; stopScreen() }
                goForeground()
                if (inCall) acquire() else release()
            }
            ACTION_SCREEN_START -> {
                val code = intent.getIntExtra("code", 0)
                @Suppress("DEPRECATION")
                val data: Intent? = intent.getParcelableExtra("data")
                if (data == null) { WebHolder.js("window.onScreenShareStopped && onScreenShareStopped()"); return START_STICKY }
                sharing = true
                goForeground()                          // тип mediaProjection — до начала захвата
                screen?.stop()
                screen = ScreenCapture(this, code, data) { stopScreen() }.also {
                    if (!it.start()) { stopScreen() }
                }
            }
            ACTION_SCREEN_STOP -> stopScreen()
        }
        return START_STICKY
    }

    private fun goForeground() {
        val n = Notifier.service(this, inCall)
        if (Build.VERSION.SDK_INT >= 34) {
            var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            // во время звонка микрофон и камера продолжают работать, даже если свернуть приложение
            if (inCall && (WebHolder.foreground || callTypesOk)) {
                type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                if (video) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            }
            if (sharing) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            try {
                startForeground(Notifier.ID_SERVICE, n, type)
                if (inCall && type and ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE != 0) callTypesOk = true
            } catch (_: Throwable) {
                // без камеры (например, видео выключено) — пробуем микрофон и экран
                val fallback = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE or
                    (if (callTypesOk) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0) or
                    (if (sharing) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION else 0)
                try { startForeground(Notifier.ID_SERVICE, n, fallback) }
                catch (_: Throwable) { startForeground(Notifier.ID_SERVICE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) }
            }
        } else if (Build.VERSION.SDK_INT >= 29) {
            var type = 0
            if (inCall) type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or (if (video) ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else 0)
            if (sharing) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
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

    private fun stopScreen() {
        val had = screen != null || sharing
        screen?.stop(); screen = null
        if (sharing) { sharing = false; goForeground() }
        if (had) WebHolder.js("window.onScreenShareStopped && onScreenShareStopped()")
    }

    override fun onDestroy() {
        screen?.stop(); screen = null
        release()
        handler.removeCallbacks(keepAlive)
        onlineLock?.let { if (it.isHeld) it.release() }; onlineLock = null
        running = false
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "ru.family.chat.STOP"
        const val ACTION_CALL = "ru.family.chat.CALL"
        const val ACTION_SCREEN_START = "ru.family.chat.SCREEN_START"
        const val ACTION_SCREEN_STOP = "ru.family.chat.SCREEN_STOP"
        const val ACTION_DECLINE = "ru.family.chat.DECLINE"
        const val ACTION_RELIABLE = "ru.family.chat.RELIABLE"
        private const val KEEPALIVE_MS = 20_000L

        fun reliableChanged(ctx: Context) {
            if (!running) return
            try { ctx.startService(Intent(ctx, ChatService::class.java).setAction(ACTION_RELIABLE)) } catch (_: Throwable) {}
        }
        @Volatile var sharing = false
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

        fun screenStart(ctx: Context, code: Int, data: Intent) {
            try {
                val i = Intent(ctx, ChatService::class.java).setAction(ACTION_SCREEN_START)
                    .putExtra("code", code).putExtra("data", data)
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
            } catch (_: Throwable) { WebHolder.js("window.onScreenShareStopped && onScreenShareStopped()") }
        }

        fun screenStop(ctx: Context) {
            try { ctx.startService(Intent(ctx, ChatService::class.java).setAction(ACTION_SCREEN_STOP)) } catch (_: Throwable) {}
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
