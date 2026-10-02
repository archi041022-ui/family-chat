package ru.family.chat

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File

/**
 * Обновление приложения: скачивает новую сборку (APK) системным загрузчиком и открывает экран установки.
 * Ход скачивания передаётся странице: window.onUpdateProgress(процент) — -1 ошибка, 100 готово,
 * 101 — нужно разрешить установку из этого приложения (откроются настройки, потом нажать «Установить» ещё раз).
 */
object Updater {
    private var downloadId = -1L
    private val handler = Handler(Looper.getMainLooper())

    private fun file(ctx: Context) = File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Semya-update.apk")

    private fun progress(p: Int) = WebHolder.js("window.onUpdateProgress && window.onUpdateProgress($p)")

    fun download(ctx: Context, url: String) {
        if (!url.startsWith("https://")) { progress(-1); return }
        val dm = ctx.getSystemService(DownloadManager::class.java) ?: run { progress(-1); return }
        if (downloadId >= 0) try { dm.remove(downloadId) } catch (_: Throwable) {}
        val f = file(ctx)
        f.parentFile?.mkdirs(); f.delete()
        val req = DownloadManager.Request(Uri.parse(url))
            .setTitle("Семья — обновление")
            .setDescription("Скачивается новая версия приложения")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            .setDestinationUri(Uri.fromFile(f))
        downloadId = try { dm.enqueue(req) } catch (_: Throwable) { progress(-1); return }
        val id = downloadId
        progress(0)
        handler.post(object : Runnable {
            override fun run() {
                if (id != downloadId) return
                var status = DownloadManager.STATUS_RUNNING; var done = 0L; var total = 0L
                try {
                    dm.query(DownloadManager.Query().setFilterById(id))?.use { c ->
                        if (c.moveToFirst()) {
                            status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                            done = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                            total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                        } else status = DownloadManager.STATUS_FAILED
                    }
                } catch (_: Throwable) { status = DownloadManager.STATUS_FAILED }
                when (status) {
                    DownloadManager.STATUS_SUCCESSFUL -> { progress(100); install(ctx) }
                    DownloadManager.STATUS_FAILED -> progress(-1)
                    else -> {
                        if (total > 0) progress(((done * 99) / total).toInt().coerceIn(0, 99))
                        handler.postDelayed(this, 500)
                    }
                }
            }
        })
    }

    /** Открыть системный экран установки скачанного обновления. */
    fun install(ctx: Context) {
        val f = file(ctx)
        if (!f.exists() || f.length() < 100_000) { progress(-1); return }
        if (Build.VERSION.SDK_INT >= 26 && !ctx.packageManager.canRequestPackageInstalls()) {
            progress(101)
            try {
                ctx.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.packageName))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Throwable) {}
            return
        }
        try {
            val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", f)
            ctx.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Throwable) { progress(-1) }
    }

    fun hasDownloaded(ctx: Context) = file(ctx).let { it.exists() && it.length() > 100_000 }
}
