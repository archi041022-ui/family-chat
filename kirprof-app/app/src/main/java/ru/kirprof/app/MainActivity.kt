package ru.kirprof.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import java.io.File

/** КИРПРОФ: сайт мастерской внутри приложения (открывается из памяти телефона), фото мебели и примерка материалов. */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private var fileCb: ValueCallback<Array<Uri>>? = null
    private var camUri: Uri? = null
    private var camFile: File? = null
    private var micReq: PermissionRequest? = null
    private var geoCb: GeolocationPermissions.Callback? = null
    private var geoOrigin: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#151A22")) }
        setContentView(root)
        val loader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#151A22"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            addJavascriptInterface(Bridge(), "KirprofBridge")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    loader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val u = request.url
                    if (u.host == "appassets.androidplatform.net") return false
                    try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: Throwable) { }
                    return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    fileCb?.onReceiveValue(null); fileCb = cb
                    val extra = ArrayList<Intent>()
                    try {
                        val dir = File(cacheDir, "camera").apply { mkdirs() }
                        val f = File(dir, "f" + System.currentTimeMillis() + ".jpg"); camFile = f
                        camUri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", f)
                        val cam = Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, camUri)
                            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        if (cam.resolveActivity(packageManager) != null) extra.add(cam)
                    } catch (_: Throwable) { camUri = null }
                    val wantsImage = params.acceptTypes.any { it.startsWith("image") } || params.acceptTypes.all { it.isBlank() }
                    val pick = params.createIntent()
                    val chooser = Intent.createChooser(pick, "Выберите фото")
                    if (wantsImage && extra.isNotEmpty()) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extra.toTypedArray())
                    // «capture» — сразу камера
                    val intent = if (params.isCaptureEnabled && extra.isNotEmpty()) extra[0] else chooser
                    return try { startActivityForResult(intent, REQ_FILE); true } catch (_: Throwable) { fileCb = null; cb.onReceiveValue(null); false }
                }

                override fun onPermissionRequest(request: PermissionRequest) {
                    if (request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                        else { micReq = request; requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_MIC) }
                    } else request.deny()
                }

                override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) callback.invoke(origin, true, false)
                    else { geoCb = callback; geoOrigin = origin; requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), REQ_GEO) }
                }
            }
        }
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl("https://appassets.androidplatform.net/assets/kirprof/index.html")
    }

    override fun onSaveInstanceState(out: Bundle) { super.onSaveInstanceState(out); web.saveState(out) }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQ_FILE) { super.onActivityResult(requestCode, resultCode, data); return }
        val cb = fileCb; fileCb = null
        var res: Array<Uri>? = null
        if (resultCode == RESULT_OK) {
            val d = data?.data
            val clip = data?.clipData
            res = when {
                clip != null && clip.itemCount > 0 -> Array(clip.itemCount) { clip.getItemAt(it).uri }
                d != null -> arrayOf(d)
                camFile?.let { it.exists() && it.length() > 0 } == true && camUri != null -> arrayOf(camUri!!)     // снимок с камеры
                else -> null
            }
        }
        cb?.onReceiveValue(res)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grants: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grants)
        val ok = grants.isNotEmpty() && grants[0] == PackageManager.PERMISSION_GRANTED
        if (requestCode == REQ_MIC) { val r = micReq; micReq = null; if (ok) r?.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else r?.deny() }
        if (requestCode == REQ_GEO) { val c = geoCb; geoCb = null; c?.invoke(geoOrigin, ok, false) }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // страница сама решает, что закрыть (окно, раздел); иначе выходим
        web.evaluateJavascript("(function(){try{if(typeof AS!=='undefined'&&AS.open){closeAsst();return 1}if(typeof go==='function'&&KP.tab&&KP.tab!=='home'){go('home');return 1}}catch(e){}return 0})()") { r ->
            if (r != "1") finish()
        }
    }

    /** Методы для страницы: сохранить готовую картинку примерки в галерею. */
    inner class Bridge {
        @JavascriptInterface
        fun saveImage(dataUrl: String, name: String) {
            Thread {
                try {
                    val bytes = Base64.decode(dataUrl.substringAfter("base64,"), Base64.DEFAULT)
                    val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "kirprof.jpg" }
                    val file = "${System.currentTimeMillis() / 1000}-$safe"
                    if (Build.VERSION.SDK_INT >= 29) {
                        val v = ContentValues().apply {
                            put(MediaStore.Images.Media.DISPLAY_NAME, file); put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                            put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/КИРПРОФ")
                        }
                        val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v) ?: throw IllegalStateException("insert")
                        contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                    } else {
                        val dir = getExternalFilesDir(android.os.Environment.DIRECTORY_PICTURES) ?: filesDir
                        File(dir, file).writeBytes(bytes)
                    }
                    runOnUiThread { Toast.makeText(this@MainActivity, "Картинка сохранена в галерею", Toast.LENGTH_LONG).show() }
                } catch (_: Throwable) {
                    runOnUiThread { Toast.makeText(this@MainActivity, "Не удалось сохранить картинку", Toast.LENGTH_LONG).show() }
                }
            }.start()
        }
    }

    companion object {
        private const val REQ_FILE = 41
        private const val REQ_MIC = 42
        private const val REQ_GEO = 43
    }
}
