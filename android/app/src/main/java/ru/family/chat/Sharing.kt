package ru.family.chat

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.WebResourceResponse
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

/**
 * «Поделиться»:
 *  • из других приложений в «Семью» (фото, видео, файлы, текст);
 *  • из «Семьи» в другие приложения (файл скачивается и передаётся системному меню).
 */
object Sharing {
    private data class Item(val uri: Uri, val name: String, val mime: String)

    private val items = ConcurrentHashMap<String, Item>()
    @Volatile private var pending: String? = null

    // ───────── Входящие ─────────
    fun isShare(i: Intent?) = i?.action == Intent.ACTION_SEND || i?.action == Intent.ACTION_SEND_MULTIPLE

    fun accept(ctx: Context, intent: Intent) {
        val uris = mutableListOf<Uri>()
        if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
            @Suppress("DEPRECATION")
            intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris += it }
        } else {
            @Suppress("DEPRECATION")
            (intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri)?.let { uris += it }
        }
        intent.clipData?.let { c: ClipData -> for (k in 0 until c.itemCount) c.getItemAt(k).uri?.let { if (it !in uris) uris += it } }
        val text = listOfNotNull(intent.getStringExtra(Intent.EXTRA_SUBJECT), intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString())
            .filter { it.isNotBlank() }.distinct().joinToString("\n")

        val files = JSONArray()
        for (u in uris.take(20)) {
            val id = java.util.UUID.randomUUID().toString()
            val mime = ctx.contentResolver.getType(u) ?: intent.type ?: "application/octet-stream"
            val name = displayName(ctx, u) ?: ("Файл." + (mime.substringAfter('/', "bin").substringBefore(';')))
            items[id] = Item(u, name, mime)
            files.put(JSONObject().put("url", "https://${WebHolder.HOST}/shared/$id").put("name", name).put("mime", mime))
        }
        if (files.length() == 0 && text.isBlank()) return
        pending = JSONObject().put("files", files).put("text", text).toString()
        WebHolder.js("window.onSharedItems && window.onSharedItems()")
    }

    fun take(): String { val p = pending; pending = null; return p ?: "" }

    private fun displayName(ctx: Context, u: Uri): String? = try {
        ctx.contentResolver.query(u, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    } catch (_: Throwable) { u.lastPathSegment }

    /** Отдаёт странице содержимое присланного файла по адресу /shared/<id>. */
    class Handler(private val ctx: Context) : WebViewAssetLoader.PathHandler {
        override fun handle(path: String): WebResourceResponse? {
            val item = items[path.trim('/')] ?: return null
            return try {
                val stream = ctx.contentResolver.openInputStream(item.uri) ?: return null
                WebResourceResponse(item.mime, null, stream).apply {
                    responseHeaders = mapOf("Access-Control-Allow-Origin" to "*", "Cache-Control" to "no-store")
                }
            } catch (_: Throwable) { null }
        }
    }

    // ───────── Исходящие ─────────
    fun shareText(ctx: Context, text: String) {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        launch(ctx, Intent.createChooser(send, "Поделиться"))
    }

    fun shareFile(ctx: Context, url: String, mime: String, name: String, text: String?) {
        Thread {
            try {
                val dir = File(ctx.cacheDir, "shared_out").apply { mkdirs() }
                dir.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 3600_000 }?.forEach { it.delete() }
                val safe = name.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "file" }
                val out = File(dir, safe)
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.connectTimeout = 15000; conn.readTimeout = 60000
                conn.inputStream.use { input -> out.outputStream().use { input.copyTo(it) } }
                val realMime = conn.contentType?.substringBefore(';')?.takeIf { it.contains('/') && it != "application/octet-stream" } ?: mime
                val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", out)
                val send = Intent(Intent.ACTION_SEND).setType(realMime)
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                if (!text.isNullOrBlank()) send.putExtra(Intent.EXTRA_TEXT, text)
                send.clipData = ClipData.newRawUri(safe, uri)
                launch(ctx, Intent.createChooser(send, "Поделиться").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
            } catch (_: Throwable) {
                WebHolder.js("typeof toast === 'function' && toast('Не удалось подготовить файл')")
            }
        }.start()
    }

    private fun launch(ctx: Context, chooser: Intent) {
        val a: Activity? = WebHolder.activity
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            try {
                if (a != null && !a.isFinishing) a.startActivity(chooser)
                else ctx.startActivity(chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Throwable) {}
        }
    }
}
