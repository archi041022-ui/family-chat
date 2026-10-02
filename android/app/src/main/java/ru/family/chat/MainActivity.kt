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
import org.json.JSONObject

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
        callFrom(intent)
        if (Sharing.isShare(intent)) Sharing.accept(this, intent)
        askStartupPermissions()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        openChatFrom(intent)
        callFrom(intent)
        if (Sharing.isShare(intent)) Sharing.accept(this, intent)
    }

    /** Нажали «Ответить» в уведомлении о звонке — отвечаем, как только звонок дойдёт до страницы. */
    private fun callFrom(i: Intent?) {
        if (i?.getBooleanExtra(EXTRA_ANSWER, false) == true) {
            i.removeExtra(EXTRA_ANSWER)
            Sounds.ringStop()
            Notifier.cancelCall(this)
            WebHolder.js("window.answerIncoming && window.answerIncoming()")
        }
        if (i?.getBooleanExtra(EXTRA_RING, false) == true || i?.getBooleanExtra(EXTRA_ANSWER, false) == true) {
            if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
            WebHolder.js("window.__keepAlive && window.__keepAlive(true)")
        }
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

    private var lastBack = 0L

    /**
     * «Назад» (кнопка или свайп от края экрана) сначала обрабатывает сам мессенджер:
     * закрывает историю, фото, меню, чат. Из приложения не выходим — только если
     * на главном экране провести «назад» дважды, приложение сворачивается.
     */
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val w = web ?: return
        w.evaluateJavascript("(window.handleBack && window.handleBack()) ? 'yes' : 'no'") { r ->
            if (r?.contains("yes") == true) return@evaluateJavascript
            val now = System.currentTimeMillis()
            if (now - lastBack < 2000) moveTaskToBack(true)
            else {
                lastBack = now
                android.widget.Toast.makeText(this, "Проведите «назад» ещё раз, чтобы свернуть", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
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
            return
        }
        // Показ поверх других приложений — тогда экран звонка открывается сразу, даже на заблокированном телефоне
        if (!Notifier.canOverlay(this) && !prefs.getBoolean("asked_overlay", false)) {
            prefs.edit().putBoolean("asked_overlay", true).apply()
            android.widget.Toast.makeText(this, "Разрешите «Семье» показ поверх других приложений — чтобы входящий звонок включал экран", android.widget.Toast.LENGTH_LONG).show()
            try { startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))) } catch (_: Throwable) {}
            return
        }
        // Android 14+: разрешение показывать входящий звонок на весь экран (иначе экран не включается)
        if (Build.VERSION.SDK_INT >= 34 && !Notifier.canFullScreen(this) && !prefs.getBoolean("asked_fsi", false)) {
            prefs.edit().putBoolean("asked_fsi", true).apply()
            android.widget.Toast.makeText(this, "Разрешите «Семье» показывать входящие звонки на весь экран", android.widget.Toast.LENGTH_LONG).show()
            try {
                startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName")))
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
        if (requestCode == REQ_LOCATION) {
            val p = geoPending; geoPending = null
            val ok = grantResults.any { it == PackageManager.PERMISSION_GRANTED }
            p?.second?.invoke(p.first, ok, false)
            return
        }
        if (requestCode == REQ_MIC) {
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) Speech.listen(this)
            else WebHolder.js("window.onSpeechResult && window.onSpeechResult(null, 'permission')")
            return
        }
        if (requestCode == REQ_CAMERA) {
            val p = pendingCapture; pendingCapture = null
            if (p == null) return
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) openCamera(p.second)
            else { p.first.onReceiveValue(null); fileCallback = null }
            return
        }
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
    private var cameraUri: Uri? = null
    private var pendingCapture: Pair<ValueCallback<Array<Uri>>, WebChromeClient.FileChooserParams>? = null

    fun chooseFile(callback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
        fileCallback?.onReceiveValue(null)
        fileCallback = callback
        // «Сделать фото» — сразу открываем камеру телефона
        if (params.isCaptureEnabled) {
            if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                pendingCapture = callback to params
                requestPermissions(arrayOf(Manifest.permission.CAMERA), REQ_CAMERA)
                return true
            }
            return openCamera(params)
        }
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

    // ───────────── Геолокация и голосовой ввод ─────────────
    private var geoPending: Pair<String, android.webkit.GeolocationPermissions.Callback>? = null

    fun askLocation(origin: String, callback: android.webkit.GeolocationPermissions.Callback) {
        val fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (fine || coarse) { callback.invoke(origin, true, false); return }
        geoPending?.let { it.second.invoke(it.first, false, false) }
        geoPending = origin to callback
        requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), REQ_LOCATION)
    }

    fun startListening() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_MIC)
            return
        }
        Speech.listen(this)
    }

    // ───────────── Вход по отпечатку / лицу / ПИН-коду телефона ─────────────
    fun unlock() {
        val done = { ok: Boolean, reason: String -> WebHolder.js("window.onUnlock && window.onUnlock($ok, " + JSONObject.quote(reason) + ")") }
        val km = getSystemService(KEYGUARD_SERVICE) as android.app.KeyguardManager
        if (!km.isDeviceSecure) { done(false, "no_lock"); return }
        if (Build.VERSION.SDK_INT >= 28) {
            val b = android.hardware.biometrics.BiometricPrompt.Builder(this)
                .setTitle("Вход в «Семью»")
                .setSubtitle("Приложите палец или посмотрите на экран")
            if (Build.VERSION.SDK_INT >= 30) {
                b.setAllowedAuthenticators(android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_WEAK or
                    android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL)
            } else if (Build.VERSION.SDK_INT == 29) {
                @Suppress("DEPRECATION") b.setDeviceCredentialAllowed(true)
            } else {
                b.setNegativeButton("ПИН-код телефона", mainExecutor) { _, _ -> confirmCredential(km) }
            }
            try {
                b.build().authenticate(android.os.CancellationSignal(), mainExecutor,
                    object : android.hardware.biometrics.BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(result: android.hardware.biometrics.BiometricPrompt.AuthenticationResult?) = done(true, "ok")
                        override fun onAuthenticationError(errorCode: Int, errString: CharSequence?) {
                            if (Build.VERSION.SDK_INT == 28 && errorCode == android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS) confirmCredential(km)
                            else done(false, errString?.toString() ?: "cancel")
                        }
                    })
            } catch (_: Throwable) { confirmCredential(km) }
        } else confirmCredential(km)
    }

    @Suppress("DEPRECATION")
    private fun confirmCredential(km: android.app.KeyguardManager) {
        val i = km.createConfirmDeviceCredentialIntent("Вход в «Семью»", "Введите ПИН-код или графический ключ телефона")
        if (i == null) { WebHolder.js("window.onUnlock && window.onUnlock(false, 'no_lock')"); return }
        try { startActivityForResult(i, REQ_UNLOCK) } catch (_: Throwable) { WebHolder.js("window.onUnlock && window.onUnlock(false, 'error')") }
    }

    /** Защищённый чат: запрет снимков и записи экрана. */
    fun setSecure(on: Boolean) {
        if (on) window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        else window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
    }

    // ───────────── Мелодии звонка и уведомлений ─────────────
    private var soundKind = "ring"

    fun pickSound(kind: String, source: String) {
        soundKind = if (kind == "msg") "msg" else "ring"
        try {
            if (source == "file") {
                startActivityForResult(Intent.createChooser(Intent(Intent.ACTION_GET_CONTENT).setType("audio/*").addCategory(Intent.CATEGORY_OPENABLE), "Выберите мелодию"), REQ_SOUND_FILE)
            } else {
                val type = if (soundKind == "ring") android.media.RingtoneManager.TYPE_RINGTONE else android.media.RingtoneManager.TYPE_NOTIFICATION
                startActivityForResult(Intent(android.media.RingtoneManager.ACTION_RINGTONE_PICKER)
                    .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_TYPE, type)
                    .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_TITLE, if (soundKind == "ring") "Мелодия звонка" else "Звук уведомлений")
                    .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
                    .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
                    .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Sounds.uri(this, soundKind)), REQ_SOUND)
            }
        } catch (_: Throwable) { soundDone() }
    }

    private fun soundDone() {
        WebHolder.js("window.onSoundPicked && window.onSoundPicked(" + JSONObject.quote(soundKind) + ", " + JSONObject.quote(Sounds.title(this, soundKind)) + ")")
    }

    private fun soundResult(requestCode: Int, data: Intent?) {
        if (requestCode == REQ_SOUND) {
            @Suppress("DEPRECATION")
            val u: Uri? = data?.getParcelableExtra(android.media.RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
            if (u != null) {
                val title = try { android.media.RingtoneManager.getRingtone(this, u)?.getTitle(this) } catch (_: Throwable) { null }
                Sounds.save(this, soundKind, u, title)
            }
        } else {
            val u = data?.data
            if (u != null) {
                var name: String? = null
                try { contentResolver.query(u, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) name = c.getString(0) } } catch (_: Throwable) {}
                Sounds.saveFile(this, soundKind, u, name)
            }
        }
        soundDone()
    }

    // ───────────── Контакты телефона (для приглашений) ─────────────
    fun pickContact() {
        try {
            startActivityForResult(Intent(Intent.ACTION_PICK, android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI), REQ_CONTACT)
        } catch (_: Throwable) { WebHolder.js("window.onContactPicked && window.onContactPicked(null)") }
    }

    private fun contactResult(data: Intent?) {
        var name = ""; var phone = ""
        try {
            val uri = data?.data
            if (uri != null) contentResolver.query(uri, arrayOf(
                android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER), null, null, null)?.use { c ->
                if (c.moveToFirst()) { name = c.getString(0) ?: ""; phone = c.getString(1) ?: "" }
            }
        } catch (_: Throwable) {}
        val js = if (phone.isBlank()) "null" else org.json.JSONObject().put("name", name).put("phone", phone).toString()
        WebHolder.js("window.onContactPicked && window.onContactPicked($js)")
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

    private fun openCamera(params: WebChromeClient.FileChooserParams): Boolean {
        val video = params.acceptTypes.any { it.startsWith("video") } && params.acceptTypes.none { it.startsWith("image") }
        return try {
            val dir = java.io.File(cacheDir, "camera").apply { mkdirs() }
            dir.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86_400_000 }?.forEach { it.delete() }
            val f = java.io.File(dir, (if (video) "Видео_" else "Фото_") + System.currentTimeMillis() + if (video) ".mp4" else ".jpg")
            val uri = androidx.core.content.FileProvider.getUriForFile(this, "$packageName.files", f)
            cameraUri = uri
            val i = Intent(if (video) android.provider.MediaStore.ACTION_VIDEO_CAPTURE else android.provider.MediaStore.ACTION_IMAGE_CAPTURE)
                .putExtra(android.provider.MediaStore.EXTRA_OUTPUT, uri)
                .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            if (video) i.putExtra(android.provider.MediaStore.EXTRA_DURATION_LIMIT, 180)
            startActivityForResult(i, REQ_CAPTURE); true
        } catch (_: Throwable) {
            fileCallback?.onReceiveValue(null); fileCallback = null; false
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_CAPTURE) {
            val cb = fileCallback; fileCallback = null
            val u = cameraUri; cameraUri = null
            cb?.onReceiveValue(if (resultCode == RESULT_OK && u != null) arrayOf(u) else null)
            return
        }
        if (requestCode == REQ_UNLOCK) {
            WebHolder.js("window.onUnlock && window.onUnlock(" + (resultCode == RESULT_OK) + ", 'credential')")
            return
        }
        if (requestCode == REQ_SOUND || requestCode == REQ_SOUND_FILE) {
            soundResult(requestCode, if (resultCode == RESULT_OK) data else null)
            return
        }
        if (requestCode == REQ_CONTACT) {
            contactResult(if (resultCode == RESULT_OK) data else null)
            return
        }
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
        const val EXTRA_ANSWER = "answer_call"
        const val EXTRA_RING = "ring_call"
        private const val REQ_MEDIA = 10
        private const val REQ_FILE = 11
        private const val REQ_NOTIFY = 12
        private const val REQ_SCREEN = 13
        private const val REQ_CAPTURE = 14
        private const val REQ_CAMERA = 15
        private const val REQ_LOCATION = 16
        private const val REQ_MIC = 17
        private const val REQ_CONTACT = 18
        private const val REQ_SOUND = 19
        private const val REQ_SOUND_FILE = 20
        private const val REQ_UNLOCK = 21
    }
}
