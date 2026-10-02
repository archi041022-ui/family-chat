package ru.family.chat

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.FrameLayout

/**
 * Окно приложения «Семья». Сам мессенджер живёт в общем WebView (WebHolder),
 * который продолжает работать в фоне вместе со службой ChatService.
 */
class MainActivity : Activity() {

    private lateinit var root: FrameLayout
    private var web: WebView? = null
    private var pendingPermission: PermissionRequest? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Notifier.channels(this)
        root = FrameLayout(this)
        setContentView(root)
        val w = WebHolder.attach(this)
        root.addView(w, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        web = w
        openChatFrom(intent)
        if (Sharing.isShare(intent)) Sharing.accept(this, intent)
        askStartupPermissions()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        openChatFrom(intent)
        if (Sharing.isShare(intent)) Sharing.accept(this, intent)
    }

    private fun openChatFrom(i: Intent?) {
        val id = i?.getStringExtra(EXTRA_CHAT) ?: return
        if (id.matches(Regex("[0-9a-f-]{36}"))) WebHolder.js("location.hash='$id'")
    }

    override fun onResume() {
        super.onResume()
        WebHolder.foreground = true
        Notifier.clearMessages(this)
        Notifier.cancelCall(this)
        WebHolder.js("window.onAppForeground && window.onAppForeground()")
    }

    override fun onPause() {
        super.onPause()
        WebHolder.foreground = false
        WebHolder.js("window.onAppBackground && window.onAppBackground()")
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val w = web
        if (w != null && w.canGoBack()) w.goBack() else moveTaskToBack(true)
    }

    override fun onDestroy() {
        WebHolder.detach(this)
        root.removeAllViews()
        // без службы (пользователь не вошёл) — освобождаем память
        if (!ChatService.running) WebHolder.destroy()
        super.onDestroy()
    }

    // ───────────── Разрешения при первом запуске ─────────────
    @SuppressLint("BatteryLife")
    private fun askStartupPermissions() {
        val prefs = getSharedPreferences("family", MODE_PRIVATE)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIFY)
            return
        }
        // чтобы Android не усыплял мессенджер — спрашиваем один раз
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        if (!pm.isIgnoringBatteryOptimizations(packageName) && !prefs.getBoolean("asked_battery", false)) {
            prefs.edit().putBoolean("asked_battery", true).apply()
            try {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
            } catch (_: Throwable) {}
        }
    }

    // ───────────── Камера и микрофон для звонков ─────────────
    fun askMediaPermissions(request: PermissionRequest) {
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
        if (requestCode == REQ_NOTIFY) { askStartupPermissions(); return }
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

    // ───────────── Выбор фото, видео, файлов ─────────────
    fun chooseFile(callback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
        fileCallback?.onReceiveValue(null)
        fileCallback = callback
        val pick = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            val types = params.acceptTypes.filter { it.isNotBlank() && !it.startsWith(".") }.toTypedArray()
            if (types.isNotEmpty()) putExtra(Intent.EXTRA_MIME_TYPES, types)
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)
        }
        return try {
            startActivityForResult(Intent.createChooser(pick, "Выберите файл"), REQ_FILE); true
        } catch (_: Throwable) {
            fileCallback = null; false
        }
    }

    // ───────────── Демонстрация экрана ─────────────
    fun startScreenCapture() {
        try {
            val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as android.media.projection.MediaProjectionManager
            startActivityForResult(mpm.createScreenCaptureIntent(), REQ_SCREEN)
        } catch (_: Throwable) {
            WebHolder.js("window.onScreenShareStopped && onScreenShareStopped()")
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_SCREEN) {
            if (resultCode == RESULT_OK && data != null) ChatService.screenStart(this, resultCode, data)
            else WebHolder.js("window.onScreenShareStopped && onScreenShareStopped()")
            return
        }
        if (requestCode != REQ_FILE) return
        val cb = fileCallback ?: return
        fileCallback = null
        if (resultCode != RESULT_OK || data == null) { cb.onReceiveValue(null); return }
        val uris = mutableListOf<Uri>()
        data.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris += clip.getItemAt(i).uri }
        if (uris.isEmpty()) data.data?.let { uris += it }
        cb.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
    }

    companion object {
        const val EXTRA_CHAT = "chat"
        private const val REQ_MEDIA = 10
        private const val REQ_FILE = 11
        private const val REQ_NOTIFY = 12
        private const val REQ_SCREEN = 13
    }
}
