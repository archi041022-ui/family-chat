package ru.kirprof.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.*
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/** Раз в ~15 минут, даже когда приложение закрыто, спрашивает базу, нет ли нового, и показывает уведомление.
 *  За чем следить, сообщает сама страница (KirprofBridge.setPush). Нового нет — молчит. */
class PushWorker(ctx: Context, p: WorkerParameters) : Worker(ctx, p) {
    private val sp = ctx.getSharedPreferences("kirprof_push", Context.MODE_PRIVATE)

    private fun rpc(cfg: JSONObject, fn: String, args: JSONObject): Any? {
        val c = URL(cfg.getString("sb") + "/rest/v1/rpc/" + fn).openConnection() as HttpURLConnection
        c.requestMethod = "POST"; c.connectTimeout = 10000; c.readTimeout = 10000; c.doOutput = true
        c.setRequestProperty("apikey", cfg.getString("key")); c.setRequestProperty("Authorization", "Bearer " + cfg.getString("key")); c.setRequestProperty("Content-Type", "application/json")
        c.outputStream.use { it.write(args.toString().toByteArray()) }
        if (c.responseCode != 200) return null
        val t = c.inputStream.bufferedReader().readText().trim()
        return when { t.startsWith("{") -> JSONObject(t); t.startsWith("[") -> JSONArray(t); else -> null }
    }

    override fun doWork(): Result {
        val raw = sp.getString("cfg", null) ?: return Result.success()
        try {
            val cfg = JSONObject(raw); val tok = cfg.optString("tok"); val ck = cfg.optString("ck")
            val adm = try { JSONObject(cfg.optString("adm", "{}").ifBlank { "{}" }) } catch (_: Throwable) { JSONObject() }
            // сотрудник: непрочитанные чаты, просьбы перезвонить, новые заявки
            if (tok.isNotBlank() && adm.optBoolean("support")) {
                (rpc(cfg, "kp_adm_support_counts", JSONObject().put("tok", tok)) as? JSONObject)?.let { r ->
                    bump("chats", r.optInt("chats"), 1, "Новое сообщение в чате", "Клиент ждёт ответа", "support")
                    bump("calls", r.optInt("calls"), 2, "Просят перезвонить", "Новая просьба об обратном звонке", "support")
                }
            }
            if (tok.isNotBlank() && adm.optBoolean("orders")) {
                (rpc(cfg, "kp_adm_stats", JSONObject().put("tok", tok)) as? JSONObject)?.let { r -> bump("orders", r.optInt("o_new"), 3, "Новая заявка", "Откройте кабинет, чтобы посмотреть", "orders") }
            }
            // клиент: ответ оператора в чате
            if (ck.length >= 16) {
                (rpc(cfg, "kp_chat_get", JSONObject().put("ck", ck).put("after", 0)) as? JSONObject)?.optJSONArray("items")?.let { items ->
                    var mx = 0L; var txt = ""
                    for (i in 0 until items.length()) { val m = items.getJSONObject(i); if (m.optBoolean("staff") && m.optLong("id") > mx) { mx = m.optLong("id"); txt = m.optString("body") } }
                    val seen = maxOf(cfg.optLong("seen"), sp.getLong("n_chat", 0))
                    if (mx > seen) { notify(4, "Оператор ответил", txt.take(120), "chat"); sp.edit().putLong("n_chat", mx).apply() }
                }
            }
            // клиент: смена статуса заявки
            if (tok.isNotBlank() && !adm.optBoolean("orders")) {
                (rpc(cfg, "kp_me", JSONObject().put("tok", tok)) as? JSONObject)?.optJSONArray("orders")?.let { arr ->
                    val old = try { JSONObject(sp.getString("ord", null) ?: "") } catch (_: Throwable) { null }
                    val now = JSONObject()
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i); val n = o.optInt("num").toString(); val st = o.optString("status"); now.put(n, st)
                        if (old != null && old.optString(n) != st && old.has(n)) notify(10 + o.optInt("num") % 1000, "Заявка №$n", statusText(st), "myorders")
                    }
                    sp.edit().putString("ord", now.toString()).apply()
                }
            }
        } catch (_: Throwable) { return Result.retry() }
        return Result.success()
    }

    private fun statusText(s: String) = when (s) { "work" -> "Принята в работу"; "done" -> "Выполнена. Спасибо, что выбрали КИРПРОФ"; "cancel" -> "Отменена"; else -> "Новый статус: $s" }

    /** Уведомляем, только когда число ожидающих выросло */
    private fun bump(key: String, n: Int, id: Int, title: String, text: String, open: String) {
        val last = sp.getInt("c_$key", 0)
        if (n > last) notify(id, title, if (n > 1) "$text (всего: $n)" else text, open)
        if (n != last) sp.edit().putInt("c_$key", n).apply()
    }

    private fun notify(id: Int, title: String, text: String, open: String) {
        val nm = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel("kirprof", "КИРПРОФ", NotificationManager.IMPORTANCE_HIGH))
        val i = Intent(applicationContext, MainActivity::class.java).putExtra("open", open).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pi = PendingIntent.getActivity(applicationContext, id, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(applicationContext, "kirprof").setSmallIcon(android.R.drawable.ic_dialog_email).setContentTitle(title).setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text)).setAutoCancel(true).setContentIntent(pi).setPriority(NotificationCompat.PRIORITY_HIGH).build()
        try { nm.notify(id, n) } catch (_: SecurityException) { /* разрешение на уведомления не выдано */ }
    }

    companion object {
        fun schedule(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<PushWorker>(15, TimeUnit.MINUTES).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("kirprof-push", ExistingPeriodicWorkPolicy.UPDATE, req)
        }
        fun stop(ctx: Context) { WorkManager.getInstance(ctx).cancelUniqueWork("kirprof-push") }
    }
}
