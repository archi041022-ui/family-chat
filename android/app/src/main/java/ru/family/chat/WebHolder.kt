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

    fun exists() = web != null

    @SuppressLint("SetJavaScriptEnabled")
    fun obtain(context: Context): WebView {
        web?.let { return it }
        val app = context.applicationContext
        val wrap = MutableContextWrapper(app)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(app))
            .build()
        val w = WebView(wrap)
        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = true
            setSupportMultipleWindows(false)
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

        @JavascriptInterface fun incomingCall(name: String) = Notifier.incomingCall(ctx, name)

        @JavascriptInterface fun cancelCall() = Notifier.cancelCall(ctx)

        @JavascriptInterface fun loggedIn() {
            ctx.getSharedPreferences("family", Context.MODE_PRIVATE).edit().putBoolean("logged_in", true).apply()
            if (!ChatService.running) ChatService.start(ctx)
        }

        @JavascriptInterface fun loggedOut() {
            ctx.getSharedPreferences("family", Context.MODE_PRIVATE).edit().putBoolean("logged_in", false).apply()
            ChatService.stop(ctx)
        }

        @JavascriptInterface fun startScreenShare(): Boolean {
            val a = activity ?: return false
            a.runOnUiThread { a.startScreenCapture() }
            return true
        }

        @JavascriptInterface fun stopScreenShare() = ChatService.screenStop(ctx)

        @JavascriptInterface fun callState(active: Boolean, video: Boolean) = ChatService.callState(ctx, active, video)
    }
}
