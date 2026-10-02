package ru.family.chat

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import java.io.ByteArrayOutputStream

/**
 * Демонстрация экрана: снимает экран телефона (с разрешения пользователя)
 * и передаёт кадры странице мессенджера, которая отправляет их собеседнику.
 */
class ScreenCapture(
    private val ctx: Context,
    private val resultCode: Int,
    private val data: Intent,
    private val onStopped: () -> Unit,
) {
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var thread: HandlerThread? = null
    @Volatile private var stopped = false
    private var lastFrame = 0L
    private var sending = false

    fun start(): Boolean {
        return try {
            val mpm = ctx.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val p = mpm.getMediaProjection(resultCode, data) ?: return false
            projection = p
            val t = HandlerThread("screen-share").apply { start() }
            thread = t
            val handler = Handler(t.looper)
            p.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() { if (!stopped) { stop(); onStopped() } }
            }, handler)

            val metrics = ctx.resources.displayMetrics
            // уменьшаем до ~720 по короткой стороне — достаточно чётко и не тормозит
            val scale = minOf(1f, 720f / minOf(metrics.widthPixels, metrics.heightPixels))
            val w = (metrics.widthPixels * scale).toInt() / 2 * 2
            val h = (metrics.heightPixels * scale).toInt() / 2 * 2
            val r = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2)
            reader = r
            r.setOnImageAvailableListener({ ir ->
                val img = try { ir.acquireLatestImage() } catch (_: Throwable) { null } ?: return@setOnImageAvailableListener
                try {
                    val now = System.currentTimeMillis()
                    if (stopped || sending || now - lastFrame < FRAME_MS) return@setOnImageAvailableListener
                    lastFrame = now
                    val plane = img.planes[0]
                    val pixelStride = plane.pixelStride
                    val rowStride = plane.rowStride
                    val padded = rowStride / pixelStride
                    val bmp = Bitmap.createBitmap(padded, h, Bitmap.Config.ARGB_8888)
                    bmp.copyPixelsFromBuffer(plane.buffer)
                    val frame = if (padded != w) Bitmap.createBitmap(bmp, 0, 0, w, h).also { bmp.recycle() } else bmp
                    val out = ByteArrayOutputStream()
                    frame.compress(Bitmap.CompressFormat.JPEG, 55, out)
                    frame.recycle()
                    val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
                    sending = true
                    WebHolder.js("window.onScreenFrame && onScreenFrame('data:image/jpeg;base64,$b64')")
                    handler.postDelayed({ sending = false }, FRAME_MS / 2)
                } catch (_: Throwable) {
                } finally {
                    img.close()
                }
            }, handler)
            display = p.createVirtualDisplay(
                "family-screen", w, h, metrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, handler
            )
            true
        } catch (_: Throwable) {
            stop()
            false
        }
    }

    fun stop() {
        if (stopped) return
        stopped = true
        try { display?.release() } catch (_: Throwable) {}
        try { reader?.close() } catch (_: Throwable) {}
        try { projection?.stop() } catch (_: Throwable) {}
        thread?.quitSafely()
        display = null; reader = null; projection = null; thread = null
    }

    companion object {
        private const val FRAME_MS = 125L    // до 8 кадров в секунду
    }
}
