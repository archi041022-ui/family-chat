package ru.kirprof.app

import android.app.Activity
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.widget.Toast
import androidx.core.content.FileProvider
import org.json.JSONArray
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Обновления приложения: раз в несколько часов (и при каждом открытии, если давно не проверяли) смотрим, не вышла ли
 * сборка новее установленной. Если вышла, предлагаем обновиться: APK скачивается и открывается системная установка.
 */
object Updater {
    private const val EVERY_MS = 30 * 60 * 1000L
    private val ui = Handler(Looper.getMainLooper())
    private var downloadId = -1L
    @Volatile private var asking = false

    private fun file(ctx: Context) = File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Kirprof-update.apk")

    /** Проверить, не вышла ли новая версия. force — игнорировать паузу между проверками. */
    fun check(act: Activity, force: Boolean = false) {
        val sp = act.getSharedPreferences("kirprof", Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (!force && now - sp.getLong("upd_at", 0) < EVERY_MS) return
        if (asking) { if (force) ui.post { toast(act, "Окно обновления уже открыто") }; return }
        if (force) ui.post { toast(act, "Проверяю обновления…") }
        Thread {
            try {
                val c = URL(BuildConfig.UPDATE_API).openConnection() as HttpURLConnection
                c.connectTimeout = 8000; c.readTimeout = 8000; c.setRequestProperty("Accept", "application/vnd.github+json")
                if (c.responseCode != 200) { if (force) ui.post { toast(act, "Не удалось проверить обновления") }; return@Thread }
                val arr = JSONArray(c.inputStream.bufferedReader().readText())
                sp.edit().putLong("upd_at", now).apply()
                for (i in 0 until arr.length()) {
                    val r = arr.getJSONObject(i)
                    val tag = r.optString("tag_name")
                    if (!tag.startsWith("kirprof-") || r.optBoolean("draft") || r.optBoolean("prerelease")) continue
                    val n = tag.removePrefix("kirprof-").toIntOrNull() ?: continue
                    val assets = r.optJSONArray("assets") ?: continue
                    var url = ""
                    for (k in 0 until assets.length()) { val a = assets.getJSONObject(k); if (a.optString("name").endsWith(".apk")) { url = a.optString("browser_download_url"); break } }
                    if (n > BuildConfig.BUILD_NUMBER && url.startsWith("https://")) ui.post { ask(act, n, url) }
                    else if (force) ui.post { toast(act, "У вас последняя версия (сборка ${BuildConfig.BUILD_NUMBER})") }
                    return@Thread                                   // нужна только самая свежая сборка КИРПРОФ
                }
            } catch (_: Throwable) { if (force) ui.post { toast(act, "Нет связи — не удалось проверить обновления") } }
        }.start()
    }

    private fun toast(ctx: Context, s: String) { try { android.widget.Toast.makeText(ctx, s, android.widget.Toast.LENGTH_SHORT).show() } catch (_: Throwable) {} }

    private fun ask(act: Activity, build: Int, url: String) {
        if (act.isFinishing || asking) return
        asking = true
        try {
            AlertDialog.Builder(act)
                .setTitle("Вышла новая версия КИРПРОФ")
                .setMessage("Сборка $build. Обновить сейчас? Данные и вход сохранятся.")
                .setPositiveButton("Обновить") { _, _ -> asking = false; download(act, url) }
                .setNegativeButton("Позже") { _, _ -> asking = false }
                .setOnCancelListener { asking = false }
                .show()
        } catch (_: Throwable) { asking = false }
    }

    private fun download(ctx: Context, url: String) {
        val dm = ctx.getSystemService(DownloadManager::class.java) ?: return
        if (downloadId >= 0) try { dm.remove(downloadId) } catch (_: Throwable) {}
        val f = file(ctx); f.parentFile?.mkdirs(); f.delete()
        val req = DownloadManager.Request(Uri.parse(url))
            .setTitle("КИРПРОФ — обновление").setDescription("Скачивается новая версия")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            .setDestinationUri(Uri.fromFile(f))
        downloadId = try { dm.enqueue(req) } catch (_: Throwable) { Toast.makeText(ctx, "Не удалось скачать обновление", Toast.LENGTH_LONG).show(); return }
        Toast.makeText(ctx, "Скачиваю обновление…", Toast.LENGTH_LONG).show()
        val id = downloadId
        ui.post(object : Runnable {
            override fun run() {
                if (id != downloadId) return
                var st = DownloadManager.STATUS_RUNNING
                try { dm.query(DownloadManager.Query().setFilterById(id))?.use { c -> st = if (c.moveToFirst()) c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) else DownloadManager.STATUS_FAILED } } catch (_: Throwable) { st = DownloadManager.STATUS_FAILED }
                when (st) {
                    DownloadManager.STATUS_SUCCESSFUL -> install(ctx)
                    DownloadManager.STATUS_FAILED -> Toast.makeText(ctx, "Не удалось скачать обновление", Toast.LENGTH_LONG).show()
                    else -> ui.postDelayed(this, 700)
                }
            }
        })
    }

    private fun install(ctx: Context) {
        val f = file(ctx)
        if (!f.exists() || f.length() < 100_000) { Toast.makeText(ctx, "Файл обновления повреждён", Toast.LENGTH_LONG).show(); return }
        if (Build.VERSION.SDK_INT >= 26 && !ctx.packageManager.canRequestPackageInstalls()) {
            Toast.makeText(ctx, "Разрешите установку из КИРПРОФ и откройте приложение снова: обновление уже скачано", Toast.LENGTH_LONG).show()
            try { ctx.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Throwable) {}
            return
        }
        try {
            val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", f)
            ctx.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Throwable) { Toast.makeText(ctx, "Не удалось открыть установку", Toast.LENGTH_LONG).show() }
    }
}
