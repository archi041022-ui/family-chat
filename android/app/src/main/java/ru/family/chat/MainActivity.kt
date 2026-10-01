package ru.family.chat

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Приложение «Семья»: сам мессенджер — веб-страница из папки assets/web,
 * показанная во встроенном браузере с доступом к камере, микрофону и уведомлениям.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private var pendingPermission: PermissionRequest? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var visible = false

    private val assets by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createChannels()
        web = WebView(this)
        setContentView(web)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = true
            setSupportMultipleWindows(false)
        }
        web.addJavascriptInterface(Bridge(), "AndroidBridge")
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assets.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == HOST) return false
                // ссылки, файлы и всё внешнее — открываем в обычном браузере
                try { startActivity(Intent(Intent.ACTION_VIEW, url)) } catch (_: Throwable) {}
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { askMediaPermissions(request) }
            }

            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val pick = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    val types = params.acceptTypes.filter { it.isNotBlank() && !it.startsWith(".") }.toTypedArray()
                    if (types.isNotEmpty()) putExtra(Intent.EXTRA_MIME_TYPES, types)
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                }
                return try {
                    startActivityForResult(Intent.createChooser(pick, "Выберите файл"), REQ_FILE); true
                } catch (_: Throwable) {
                    fileCallback = null; false
                }
            }
        }
        web.setDownloadListener { url, _, _, _, _ ->
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Throwable) {}
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIFY)
        }
        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl(START + (intent?.getStringExtra(EXTRA_CHAT)?.let { "#$it" } ?: ""))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_CHAT)?.let { web.evaluateJavascript("location.hash='$it'", null) }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onResume() { super.onResume(); visible = true; NotificationManagerCompat.from(this).cancelAll() }
    override fun onPause() { super.onPause(); visible = false }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else moveTaskToBack(true)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    // ───────────── Камера и микрофон для звонков ─────────────
    private fun askMediaPermissions(request: PermissionRequest) {
        val need = mutableListOf<String>()
        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE in request.resources) need += Manifest.permission.CAMERA
        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE in request.resources) {
            need += Manifest.permission.RECORD_AUDIO
            need += Manifest.permission.MODIFY_AUDIO_SETTINGS
        }
        val missing = need.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) { request.grant(request.resources); return }
        pendingPermission?.deny()
        pendingPermission = request
        requestPermissions(missing.toTypedArray(), REQ_MEDIA)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_MEDIA) return
        val req = pendingPermission ?: return
        pendingPermission = null
        val granted = req.resources.filter {
            when (it) {
                PermissionRequest.RESOURCE_VIDEO_CAPTURE -> checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                PermissionRequest.RESOURCE_AUDIO_CAPTURE -> checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                else -> false
            }
        }
        if (granted.isEmpty()) req.deny() else req.grant(granted.toTypedArray())
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_FILE) return
        val cb = fileCallback ?: return
        fileCallback = null
        if (resultCode != RESULT_OK || data == null) { cb.onReceiveValue(null); return }
        val uris = mutableListOf<Uri>()
        data.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris += clip.getItemAt(i).uri }
        if (uris.isEmpty()) data.data?.let { uris += it }
        cb.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
    }

    // ───────────── Уведомления ─────────────
    private fun createChannels() {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(NotificationChannel(CH_MSG, "Сообщения", NotificationManager.IMPORTANCE_HIGH))
        nm.createNotificationChannel(NotificationChannel(CH_CALL, "Звонки", NotificationManager.IMPORTANCE_HIGH).apply {
            enableVibration(true); vibrationPattern = longArrayOf(0, 600, 400, 600, 400, 600)
        })
    }

    private fun show(channel: String, id: Int, title: String, text: String) {
        if (visible && channel == CH_MSG) return
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val open = PendingIntent.getActivity(this, id, Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(this, channel)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setContentIntent(open)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(if (channel == CH_CALL) NotificationCompat.CATEGORY_CALL else NotificationCompat.CATEGORY_MESSAGE)
            .apply { if (channel == CH_CALL) setFullScreenIntent(open, true) }
            .build()
        try { NotificationManagerCompat.from(this).notify(id, n) } catch (_: SecurityException) {}
    }

    inner class Bridge {
        @JavascriptInterface
        fun notify(title: String, text: String) = runOnUiThread { show(CH_MSG, 1, title, text) }

        @JavascriptInterface
        fun incomingCall(name: String) = runOnUiThread {
            show(CH_CALL, 2, "Входящий звонок", name)
            if (!visible) startActivity(Intent(this@MainActivity, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
        }
    }

    companion object {
        private const val HOST = "appassets.androidplatform.net"
        private const val START = "https://$HOST/assets/web/index.html"
        private const val EXTRA_CHAT = "chat"
        private const val CH_MSG = "messages"
        private const val CH_CALL = "calls"
        private const val REQ_MEDIA = 10
        private const val REQ_FILE = 11
        private const val REQ_NOTIFY = 12
    }
}
