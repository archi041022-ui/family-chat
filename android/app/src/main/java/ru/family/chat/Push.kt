package ru.family.chat

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Надёжные оповещения. Сервер складывает оповещения для каждого члена семьи (сообщения, публикации,
 * истории, реакции, задачи, заявки). Пока страница мессенджера жива, она забирает их сама.
 * Если страница уснула или система её выгрузила — оповещения забирает эта служба напрямую с сервера
 * по ключу устройства (без пароля и без входа).
 */
object Push {
    private const val PREFS = "push"
    private const val JOB_ID = 4242
    private val busy = AtomicBoolean(false)

    /** Когда страница в последний раз сообщила, что она на связи. */
    @Volatile var alive = 0L

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Ключ устройства: создаётся один раз; адрес сервера и открытый ключ — из настроек страницы. */
    fun key(ctx: Context, url: String, anon: String): String {
        val p = prefs(ctx)
        var k = p.getString("key", null)
        if (k.isNullOrEmpty()) {
            val b = ByteArray(32); SecureRandom().nextBytes(b)
            k = b.joinToString("") { "%02x".format(it) }
        }
        p.edit().putString("key", k).putString("url", url.trimEnd('/')).putString("anon", anon).apply()
        schedule(ctx)
        return k
    }

    fun reset(ctx: Context) {
        prefs(ctx).edit().clear().apply()
        try { (ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler).cancel(JOB_ID) } catch (_: Throwable) {}
    }

    /** Настройки из приложения: чаты без звука, показывать ли текст, какие оповещения нужны. */
    fun setPrefs(ctx: Context, json: String) { prefs(ctx).edit().putString("opts", json).apply() }

    /** Страница давно не отвечала — значит, оповещения забираем сами. */
    fun webStale() = System.currentTimeMillis() - alive > 50_000

    /** Забрать оповещения с сервера и показать (в отдельном потоке). */
    fun poll(ctx: Context, done: (() -> Unit)? = null) {
        val app = ctx.applicationContext
        val p = prefs(app)
        val key = p.getString("key", null); val url = p.getString("url", null); val anon = p.getString("anon", null)
        if (key.isNullOrEmpty() || url.isNullOrEmpty() || anon.isNullOrEmpty() || !busy.compareAndSet(false, true)) { done?.invoke(); return }
        Thread {
            try {
                val c = URL("$url/rest/v1/rpc/device_pull").openConnection() as HttpURLConnection
                c.requestMethod = "POST"; c.connectTimeout = 15_000; c.readTimeout = 20_000; c.doOutput = true
                c.setRequestProperty("apikey", anon)
                c.setRequestProperty("Authorization", "Bearer $anon")
                c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use { it.write(JSONObject().put("key", key).toString().toByteArray()) }
                if (c.responseCode == 200) {
                    val text = c.inputStream.bufferedReader().use { it.readText() }
                    show(app, JSONArray(text))
                }
                c.disconnect()
            } catch (_: Throwable) {
            } finally { busy.set(false); done?.invoke() }
        }.start()
    }

    /** Показ: по одному уведомлению на чат (или на событие), с числом новых. */
    fun show(ctx: Context, list: JSONArray) {
        if (list.length() == 0) return
        val opts = try { JSONObject(prefs(ctx).getString("opts", "{}") ?: "{}") } catch (_: Throwable) { JSONObject() }
        val muted = opts.optJSONArray("muted")?.let { a -> (0 until a.length()).map { a.optString(it) }.toSet() } ?: emptySet()
        val preview = opts.optBoolean("preview", true)
        val stories = opts.optBoolean("stories", true)
        val reacts = opts.optBoolean("reactions", true)
        data class G(var title: String, var text: String, var n: Int, val chat: String?)
        val groups = LinkedHashMap<String, G>()
        for (i in 0 until list.length()) {
            val o = list.optJSONObject(i) ?: continue
            val kind = o.optString("kind")
            val chat = o.optString("chat_id").takeIf { it.isNotEmpty() && it != "null" }
            if (!stories && (kind == "story" || kind == "story_react")) continue
            if (!reacts && (kind == "reaction" || kind == "story_react")) continue
            if (chat != null && chat in muted && (kind == "message" || kind == "reaction")) continue
            val title = o.optString("title")
            val body = if (kind == "message" && !preview) "Новое сообщение" else o.optString("body").takeIf { it != "null" } ?: ""
            val gk = if (kind == "message" && chat != null) "m:$chat" else "$kind:${o.optString("ref")}:${o.optString("actor")}"
            val g = groups[gk]
            if (g == null) groups[gk] = G(title, body, 1, chat) else { g.title = title; g.text = body; g.n++ }
        }
        var first = true
        for ((gk, g) in groups) {
            val text = if (g.n > 1) "${g.text}\n…и ещё ${g.n - 1}" else g.text
            Notifier.message(ctx, g.title, text, g.chat, gk.hashCode(), sound = first)   // звук — один раз на пачку
            first = false
        }
    }

    /** Фоновая проверка раз в 15 минут — работает, даже если система выгрузила приложение. */
    fun schedule(ctx: Context) {
        try {
            val js = ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
            if (js.getPendingJob(JOB_ID) != null) return
            js.schedule(JobInfo.Builder(JOB_ID, ComponentName(ctx, PushJob::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60 * 1000L)
                .setPersisted(true)
                .build())
        } catch (_: Throwable) {}
    }
}

class PushJob : JobService() {
    override fun onStartJob(params: JobParameters?): Boolean {
        val logged = getSharedPreferences("family", MODE_PRIVATE).getBoolean("logged_in", false)
        if (!logged) return false
        if (!ChatService.running) ChatService.start(this)        // служба могла быть остановлена системой
        if (!Push.webStale()) return false
        Push.poll(this) { jobFinished(params, false) }
        return true
    }
    override fun onStopJob(params: JobParameters?): Boolean = true
}
