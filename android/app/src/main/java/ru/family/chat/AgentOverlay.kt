package ru.family.chat

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView

/** Плавающая кнопка ассистента поверх всех приложений. Живёт, пока работает ChatService. */
object AgentOverlay {
    const val ACTION_OPEN = "ru.family.chat.OPEN_AGENT"
    private var view: View? = null

    fun enabled(ctx: Context) = ctx.getSharedPreferences("family", Context.MODE_PRIVATE).getBoolean("agent_bubble", false)
    fun canDraw(ctx: Context) = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx)
    fun showing() = view != null

    fun setEnabled(ctx: Context, on: Boolean) {
        ctx.getSharedPreferences("family", Context.MODE_PRIVATE).edit().putBoolean("agent_bubble", on).apply()
        if (on) { ChatService.start(ctx); show(ctx) } else hide(ctx)
    }

    /** Открыть системный экран «Поверх других приложений» для нашего приложения. */
    fun askPermission(ctx: Context) {
        try {
            ctx.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + ctx.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Throwable) {}
    }

    fun launchIntent(ctx: Context): Intent =
        Intent(ctx, MainActivity::class.java).setAction(ACTION_OPEN)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)

    fun show(ctx0: Context) {
        val ctx = ctx0.applicationContext
        if (view != null || !enabled(ctx) || !canDraw(ctx)) return
        val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val d = ctx.resources.displayMetrics.density
        val size = (56 * d).toInt()
        val tv = TextView(ctx).apply {
            text = "🤖"; textSize = 26f; gravity = Gravity.CENTER; alpha = 0.92f
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#2AABEE")); setStroke((2 * d).toInt(), Color.WHITE) }
            elevation = 8 * d
        }
        val type = if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
        val lp = WindowManager.LayoutParams(size, size, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT).apply {
            gravity = Gravity.TOP or Gravity.START
            val sp = ctx.getSharedPreferences("family", Context.MODE_PRIVATE)
            x = sp.getInt("agent_x", ctx.resources.displayMetrics.widthPixels - size - (8 * d).toInt())
            y = sp.getInt("agent_y", (ctx.resources.displayMetrics.heightPixels * 0.55).toInt())
        }
        var sx = 0f; var sy = 0f; var ox = 0; var oy = 0; var moved = false
        tv.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> { sx = e.rawX; sy = e.rawY; ox = lp.x; oy = lp.y; moved = false; true }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - sx; val dy = e.rawY - sy
                    if (Math.abs(dx) > 8 * d || Math.abs(dy) > 8 * d) moved = true
                    if (moved) { lp.x = ox + dx.toInt(); lp.y = oy + dy.toInt(); try { wm.updateViewLayout(tv, lp) } catch (_: Throwable) {} }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (moved) {
                        val w = ctx.resources.displayMetrics.widthPixels
                        lp.x = if (lp.x + size / 2 < w / 2) (4 * d).toInt() else w - size - (4 * d).toInt()   // прилипает к краю
                        try { wm.updateViewLayout(tv, lp) } catch (_: Throwable) {}
                        ctx.getSharedPreferences("family", Context.MODE_PRIVATE).edit().putInt("agent_x", lp.x).putInt("agent_y", lp.y).apply()
                    } else {
                        try { ctx.startActivity(launchIntent(ctx)) } catch (_: Throwable) {}
                    }
                    true
                }
                else -> false
            }
        }
        try { wm.addView(tv, lp); view = tv } catch (_: Throwable) { view = null }
    }

    fun hide(ctx0: Context) {
        val v = view ?: return
        view = null
        try { (ctx0.applicationContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(v) } catch (_: Throwable) {}
    }
}
