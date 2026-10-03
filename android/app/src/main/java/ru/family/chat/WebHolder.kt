package ru.family.chat

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.MutableContextWrapper
import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import java.lang.ref.WeakReference

/**
 * Один WebView на всё приложение. Живёт, пока работает служба ChatService,
 * поэтому соединение с сервером не рвётся, когда окно закрыто или свёрнуто.
 * Окно (MainActivity) только «прикрепляет» его к экрану.
 */
@SuppressLint("StaticFieldLeak")
object WebHolder {
    const val HOST = "appassets.androidplatform.net"
    const val START = "https://$HOST/assets/web/index.html"

    private var web: WebView? = null
    private var wrapper: MutableContextWrapper? = null
    private var activityRef: WeakReference<MainActivity>? = null
    val activity: MainActivity? get() = activityRef?.get()

    @Volatile var foreground = false
    @Volatile var inCall = false

    fun exists() = web != null

    @SuppressLint("SetJavaScriptEnabled")
    fun obtain(context: Context): WebView {
        web?.let { return it }
        val app = context.applicationContext
        val wrap = MutableContextWrapper(app)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(app))
            .addPathHandler("/shared/", Sharing.Handler(app))
            .build()
        val w = WebView(wrap)
        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = true
            setSupportMultipleWindows(false)
            setGeolocationEnabled(true)
        }
        w.addJavascriptInterface(Bridge(app), "AndroidBridge")
        w.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == HOST) return false
                openExternal(app, request.url)
                return true
            }
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val a = activity
                if (a == null) request.deny() else a.runOnUiThread { a.askMediaPermissions(request) }
            }

            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: android.webkit.GeolocationPermissions.Callback) {
                val a = activity
                if (a == null) callback.invoke(origin, false, false) else a.runOnUiThread { a.askLocation(origin, callback) }
            }

            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                val a = activity ?: return false
                return a.chooseFile(callback, params)
            }
        }
        w.setDownloadListener { url, _, _, _, _ -> openExternal(app, Uri.parse(url)) }
        w.loadUrl(START)
        web = w
        wrapper = wrap
        return w
    }

    fun attach(a: MainActivity): WebView {
        val w = obtain(a)
        wrapper?.baseContext = a
        activityRef = WeakReference(a)
        (w.parent as? android.view.ViewGroup)?.removeView(w)
        return w
    }

    fun detach(a: MainActivity) {
        if (activity !== a) return
        (web?.parent as? android.view.ViewGroup)?.removeView(web)
        wrapper?.baseContext = a.applicationContext
        activityRef = null
    }

    fun js(code: String) { web?.post { web?.evaluateJavascript(code, null) } }

    fun destroy() {
        web?.let { (it.parent as? android.view.ViewGroup)?.removeView(it); it.destroy() }
        web = null; wrapper = null
    }

    private fun openExternal(ctx: Context, url: Uri) {
        try {
            ctx.startActivity(Intent(Intent.ACTION_VIEW, url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Throwable) {}
    }

    /** Методы, которые вызывает страница мессенджера. */
    class Bridge(private val ctx: Context) {
        @JavascriptInterface fun isForeground(): Boolean = foreground

        @JavascriptInterface fun notify(title: String, text: String, chatId: String?) =
            Notifier.message(ctx, title, text, chatId)

        @JavascriptInterface fun incomingCall(name: String) = Notifier.incomingCall(ctx, name, false)

        @JavascriptInterface fun incomingCall2(name: String, video: Boolean) = Notifier.incomingCall(ctx, name, video)

        @JavascriptInterface fun incomingCall3(name: String, video: Boolean, photo: String?) = Notifier.incomingCall(ctx, name, video, photo)

        /** Состояние разрешений, от которых зависят звонки — для экрана «Настройки → Звонки». */
        @JavascriptInterface fun callHealth(): String {
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
            val notif = android.os.Build.VERSION.SDK_INT < 33 ||
                ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED
            val o = org.json.JSONObject()
            o.put("notifications", notif)
            o.put("fullScreen", Notifier.canFullScreen(ctx))
            o.put("overlay", Notifier.canOverlay(ctx))
            o.put("battery", pm.isIgnoringBatteryOptimizations(ctx.packageName))
            o.put("reliable", ctx.getSharedPreferences("family", Context.MODE_PRIVATE).getBoolean("reliable", true))
            o.put("service", ChatService.running)
            return o.toString()
        }

        @JavascriptInterface fun setReliable(on: Boolean) {
            ctx.getSharedPreferences("family", Context.MODE_PRIVATE).edit().putBoolean("reliable", on).apply()
            ChatService.reliableChanged(ctx)
        }

        /** Открывает нужный экран системных настроек: notifications | fullScreen | battery | app */
        @SuppressLint("BatteryLife")
        @JavascriptInterface fun openSettings(what: String) {
            val pkg = Uri.parse("package:" + ctx.packageName)
            val i = when (what) {
                "notifications" -> Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, ctx.packageName)
                "fullScreen" -> if (android.os.Build.VERSION.SDK_INT >= 34)
                    Intent(android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg)
                    else Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
                "overlay" -> Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkg)
                "battery" -> Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg)
                "tts" -> Intent("com.android.settings.TTS_SETTINGS")
                "ttsData" -> Intent(android.speech.tts.TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA)
                else -> Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
            }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try { ctx.startActivity(i) } catch (_: Throwable) {
                try { ctx.startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Throwable) {}
            }
        }

        @JavascriptInterface fun appVersion(): String = try {
            ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: ""
        } catch (_: Throwable) { "" }

        @JavascriptInterface fun cancelCall() = Notifier.cancelCall(ctx)

        @JavascriptInterface fun loggedIn() {
            ctx.getSharedPreferences("family", Context.MODE_PRIVATE).edit().putBoolean("logged_in", true).apply()
            if (!ChatService.running) ChatService.start(ctx)
        }

        /** Надёжные оповещения: ключ этого устройства для забора оповещений в фоне. */
        @JavascriptInterface fun pushKey(url: String, anon: String): String = Push.key(ctx, url, anon)
        @JavascriptInterface fun pushPrefs(json: String) = Push.setPrefs(ctx, json)
        @JavascriptInterface fun pushAlive() { Push.alive = System.currentTimeMillis() }
        @JavascriptInterface fun pushReset() = Push.reset(ctx)
        /** Мгновенные оповещения (Firebase): настройки с сервера семьи и состояние на этом телефоне. */
        @JavascriptInterface fun fcmInit(json: String?) = android.os.Handler(android.os.Looper.getMainLooper()).post { Fcm.configure(ctx, json) }
        @JavascriptInterface fun fcmStatus(): String = Fcm.status(ctx)

        @JavascriptInterface fun loggedOut() {
            Push.reset(ctx)
            ctx.getSharedPreferences("family", Context.MODE_PRIVATE).edit().putBoolean("logged_in", false).apply()
            ChatService.stop(ctx)
        }

        @JavascriptInterface fun takeShared(): String = Sharing.take()

        /** Цвет строки состояния под выбранную тему оформления. */
        @JavascriptInterface fun setBarColor(hex: String) {
            val a = activity ?: return
            val color = try { android.graphics.Color.parseColor(hex) } catch (_: Throwable) { return }
            // светлая шапка — тёмные значки в строке состояния, тёмная — светлые
            val light = (android.graphics.Color.red(color) * 299 + android.graphics.Color.green(color) * 587 + android.graphics.Color.blue(color) * 114) / 1000 > 160
            a.runOnUiThread {
                try { @Suppress("DEPRECATION") run { a.window.statusBarColor = color } } catch (_: Throwable) {}
                try { androidx.core.view.WindowCompat.getInsetsController(a.window, a.window.decorView).isAppearanceLightStatusBars = light } catch (_: Throwable) {}
            }
        }

        @JavascriptInterface fun speak(text: String, gender: String) {
            android.os.Handler(android.os.Looper.getMainLooper()).post { Speech.speak(ctx, text, gender) }
        }

        @JavascriptInterface fun speak2(text: String, gender: String, pitch: Float, rate: Float, voice: String, engine: String) {
            android.os.Handler(android.os.Looper.getMainLooper()).post { Speech.speak(ctx, text, gender, pitch, rate, voice, engine) }
        }

        @JavascriptInterface fun listVoices(engine: String) {
            android.os.Handler(android.os.Looper.getMainLooper()).post { Speech.listVoices(ctx, engine) }
        }

        /** Открыть магазин приложений на странице голосового движка (например, RHVoice). */
        @JavascriptInterface fun openStore(pkg: String) {
            if (!pkg.matches(Regex("[a-zA-Z0-9_.]+"))) return
            try { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            catch (_: Throwable) { openExternal(ctx, Uri.parse("https://play.google.com/store/apps/details?id=$pkg")) }
        }

        @JavascriptInterface fun openUrl(url: String) {
            val u = Uri.parse(url)
            if (u.scheme == "https" || u.scheme == "http" || u.scheme == "tel") openExternal(ctx, u)
        }

        /** Выбрать контакт из телефонной книги (ответ в window.onContactPicked). Разрешение на контакты не нужно. */
        @JavascriptInterface fun pickContact() {
            val a = activity ?: return
            a.runOnUiThread { a.pickContact() }
        }

        /** Открыть SMS с готовым текстом приглашения — отправляет сам пользователь. */
        @JavascriptInterface fun sendSms(phone: String, text: String) {
            val num = phone.filter { it.isDigit() || it == '+' }
            try {
                ctx.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$num")).putExtra("sms_body", text).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Throwable) { Sharing.shareText(ctx, text) }
        }

        @JavascriptInterface fun downloadUpdate(url: String) { android.os.Handler(android.os.Looper.getMainLooper()).post { Updater.download(ctx, url) } }

        @JavascriptInterface fun installUpdate() { android.os.Handler(android.os.Looper.getMainLooper()).post { Updater.install(ctx) } }

        @JavascriptInterface fun canInstallUpdates(): Boolean =
            android.os.Build.VERSION.SDK_INT < 26 || ctx.packageManager.canRequestPackageInstalls()

                /** Сохранить файл (например, PDF из сканера) в «Загрузки» телефона. */
        @JavascriptInterface fun saveFile(base64: String, name: String, mime: String): Boolean = try {
            val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
            val safe = name.replace(Regex("[\\/:*?\"<>|]"), "_").take(120)
            if (android.os.Build.VERSION.SDK_INT >= 29) {
                val values = android.content.ContentValues().apply {
                    put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, safe)
                    put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS)
                }
                val uri = ctx.contentResolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                uri != null && (ctx.contentResolver.openOutputStream(uri)?.use { it.write(bytes); true } ?: false)
            } else {
                val dir = ctx.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS) ?: ctx.filesDir
                java.io.File(dir, safe).writeBytes(bytes); true
            }
        } catch (_: Throwable) { false }

                @JavascriptInterface fun lockAvailable(): Boolean =
            (ctx.getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager).isDeviceSecure

        @JavascriptInterface fun unlock() {
            val a = activity
            if (a == null) { WebHolder.js("window.onUnlock && window.onUnlock(false, 'no_activity')"); return }
            a.runOnUiThread { a.unlock() }
        }

        @JavascriptInterface fun setSecure(on: Boolean) {
            val a = activity ?: return
            a.runOnUiThread { a.setSecure(on) }
        }

                @JavascriptInterface fun ringStart() { android.os.Handler(android.os.Looper.getMainLooper()).post { Sounds.ringStart(ctx) } }
        @JavascriptInterface fun ringStop() { android.os.Handler(android.os.Looper.getMainLooper()).post { Sounds.ringStop() } }
        @JavascriptInterface fun playMessageSound() { android.os.Handler(android.os.Looper.getMainLooper()).post { Sounds.message(ctx) } }
        @JavascriptInterface fun previewSound(kind: String) { android.os.Handler(android.os.Looper.getMainLooper()).post { Sounds.preview(ctx, kind) } }
        @JavascriptInterface fun stopPreview() { android.os.Handler(android.os.Looper.getMainLooper()).post { Sounds.stopPreview() } }
        @JavascriptInterface fun soundTitle(kind: String): String = Sounds.title(ctx, kind)
        @JavascriptInterface fun resetSound(kind: String) = Sounds.save(ctx, kind, null, null)
        @JavascriptInterface fun pickSound(kind: String, source: String) {
            val a = activity ?: return
            a.runOnUiThread { a.pickSound(kind, source) }
        }

                @JavascriptInterface fun stopSpeaking() = Speech.stop()

        @JavascriptInterface fun resetVoice() { android.os.Handler(android.os.Looper.getMainLooper()).post { Speech.reset() } }

        @JavascriptInterface fun listen() {
            val a = activity
            if (a == null) { WebHolder.js("window.onSpeechResult && window.onSpeechResult(null, 'error')"); return }
            a.runOnUiThread { a.startListening() }
        }

        @JavascriptInterface fun shareFile(url: String, mime: String, name: String, text: String?) =
            Sharing.shareFile(ctx, url, mime, name, text)

        @JavascriptInterface fun shareText(text: String) = Sharing.shareText(ctx, text)

        @JavascriptInterface fun startScreenShare(): Boolean {
            val a = activity ?: return false
            a.runOnUiThread { a.startScreenCapture() }
            return true
        }

        @JavascriptInterface fun stopScreenShare() = ChatService.screenStop(ctx)

        @JavascriptInterface fun callState(active: Boolean, video: Boolean) {
            ChatService.callState(ctx, active, video)
            inCall = active                                          // во время звонка при выходе — «картинка в картинке»
            activity?.let { a -> a.runOnUiThread { a.updatePip() } }
        }
        /** Свернуть приложение в маленькое окно звонка (кнопка в интерфейсе). */
        @JavascriptInterface fun enterPip(): Boolean { val a = activity ?: return false; a.runOnUiThread { a.enterPip() }; return true }
    }
}
