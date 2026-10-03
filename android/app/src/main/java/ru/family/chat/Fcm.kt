package ru.family.chat

import android.app.Application
import android.content.Context
import android.os.Handler
import android.os.Looper
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

/**
 * Мгновенные оповещения через Firebase Cloud Messaging.
 * Настройки Firebase приложение получает с сервера семьи (их загружает администратор),
 * поэтому новая сборка для подключения не нужна. Google присылает только сигнал «проснись»,
 * сами оповещения телефон забирает с сервера семьи.
 */
object Fcm {
    private const val PREFS = "fcm"
    @Volatile var lastError: String = ""
    @Volatile var hasToken = false

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Запуск приложения: поднять Firebase по сохранённым настройкам (до прихода сигналов). */
    fun boot(ctx: Context) {
        val cfg = prefs(ctx).getString("cfg", null) ?: return
        try { init(ctx, JSONObject(cfg)) } catch (e: Throwable) { lastError = e.message ?: "init" }
    }

    /** Настройки от страницы мессенджера (или null — Firebase не настроен). */
    fun configure(ctx: Context, json: String?) {
        val app = ctx.applicationContext
        if (json.isNullOrEmpty() || json == "null") { prefs(app).edit().remove("cfg").apply(); return }
        try {
            val o = JSONObject(json)
            prefs(app).edit().putString("cfg", o.toString()).apply()
            init(app, o)
            refreshToken(app)
        } catch (e: Throwable) { lastError = e.message ?: "configure" }
    }

    private fun init(ctx: Context, o: JSONObject) {
        val opts = FirebaseOptions.Builder()
            .setApplicationId(o.getString("app_id"))
            .setApiKey(o.getString("api_key"))
            .setProjectId(o.getString("project_id"))
            .setGcmSenderId(o.getString("sender_id"))
            .build()
        val cur = FirebaseApp.getApps(ctx).firstOrNull { it.name == FirebaseApp.DEFAULT_APP_NAME }
        if (cur != null) {
            if (cur.options.projectId == opts.projectId && cur.options.applicationId == opts.applicationId) return
            cur.delete()                                  // администратор сменил проект Firebase
        }
        FirebaseApp.initializeApp(ctx, opts)
    }

    fun refreshToken(ctx: Context) {
        val app = ctx.applicationContext
        try {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { t -> hasToken = true; lastError = ""; send(app, t) }
                .addOnFailureListener { e -> hasToken = false; lastError = e.message ?: "token" }
        } catch (e: Throwable) { lastError = e.message ?: "token" }
    }

    /** Сообщить серверу адрес этого телефона (по ключу устройства). */
    fun send(ctx: Context, token: String) {
        val key = Push.deviceKey(ctx) ?: return
        Thread { Push.rpc(ctx, "device_token", JSONObject().put("key", key).put("token", token)) }.start()
    }

    fun status(ctx: Context): String = JSONObject()
        .put("configured", prefs(ctx).contains("cfg"))
        .put("token", hasToken)
        .put("error", lastError)
        .toString()

    /** Входящий звонок: поднять службу и соединение, экран звонка покажет мессенджер. */
    fun wakeForCall(ctx: Context) {
        val app = ctx.applicationContext
        if (!app.getSharedPreferences("family", Context.MODE_PRIVATE).getBoolean("logged_in", false)) return
        Handler(Looper.getMainLooper()).post {
            if (!ChatService.running) ChatService.start(app)
            WebHolder.js("window.__keepAlive && window.__keepAlive(true)")
        }
    }
}

class FcmService : FirebaseMessagingService() {
    override fun onNewToken(token: String) { Fcm.hasToken = true; Fcm.send(this, token) }

    override fun onMessageReceived(msg: RemoteMessage) {
        val app = applicationContext
        if (!app.getSharedPreferences("family", Context.MODE_PRIVATE).getBoolean("logged_in", false)) return
        when (msg.data["type"]) {
            "test" -> {
                Notifier.message(app, "✅ Мгновенные оповещения работают", "Сигнал от сервера семьи дошёл до этого телефона", null, 7701, force = true)
                WebHolder.js("window.onPushTest && window.onPushTest()")
            }
            "call" -> { Fcm.wakeForCall(app); Push.poll(app) }
            else -> {
                // служба могла быть остановлена системой — сигнал Firebase разрешает её запустить
                Handler(Looper.getMainLooper()).post { if (!ChatService.running) ChatService.start(app) }
                if (Push.webStale()) Push.poll(app)
                else {
                    WebHolder.js("typeof Push !== 'undefined' && Push.soon(200)")
                    // страница не успела забрать — заберём сами
                    Handler(Looper.getMainLooper()).postDelayed({ if (Push.webStale()) Push.poll(app) }, 7000)
                }
            }
        }
    }
}

/** Приложение: Firebase поднимается сразу при запуске процесса (в том числе от сигнала Firebase). */
class FamilyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Fcm.boot(this)
    }
}
