package ru.family.chat

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import java.io.File

/**
 * Мелодии: своя на входящий звонок и своя на уведомления о сообщениях.
 * Звук играет само приложение (а не система), поэтому подходит любой файл — из списка мелодий телефона или свой.
 * Режим «Без звука» / «Вибрация» на телефоне уважается.
 */
object Sounds {
    private const val PREFS = "family"
    private var shortPlayer: MediaPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private val stopRing = Runnable { ringStop() }

    fun uri(ctx: Context, kind: String): Uri? {
        val s = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("sound_$kind", null)
        if (s != null) {
            val u = Uri.parse(s)
            if (u.scheme == "file" && u.path?.let { File(it).exists() } != true) return default(kind)
            return u
        }
        return default(kind)
    }

    private fun default(kind: String): Uri? = RingtoneManager.getDefaultUri(if (kind == "ring") RingtoneManager.TYPE_RINGTONE else RingtoneManager.TYPE_NOTIFICATION)

    fun title(ctx: Context, kind: String): String {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        p.getString("sound_${kind}_title", null)?.let { return it }
        return "По умолчанию"
    }

    fun save(ctx: Context, kind: String, uri: Uri?, title: String?) {
        val e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        if (uri == null) e.remove("sound_$kind").remove("sound_${kind}_title")
        else e.putString("sound_$kind", uri.toString()).putString("sound_${kind}_title", title ?: "Своя мелодия")
        e.apply()
    }

    /** Свой файл: копируем в память приложения, чтобы мелодия не пропала, если файл удалят из загрузок. */
    fun saveFile(ctx: Context, kind: String, src: Uri, name: String?) {
        try {
            val dir = File(ctx.filesDir, "sounds").apply { mkdirs() }
            dir.listFiles()?.filter { it.name.startsWith("$kind.") }?.forEach { it.delete() }
            val f = File(dir, "$kind.${System.currentTimeMillis()}")
            ctx.contentResolver.openInputStream(src)?.use { inp -> f.outputStream().use { inp.copyTo(it) } }
            if (f.length() > 0) save(ctx, kind, Uri.fromFile(f), name?.substringBeforeLast('.') ?: "Своя мелодия")
        } catch (_: Throwable) {}
    }

    private fun canSound(ctx: Context): Int {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        return am.ringerMode   // 0 — без звука, 1 — вибрация, 2 — обычный
    }

    @Suppress("DEPRECATION")
    private fun vibrate(ctx: Context, pattern: LongArray, repeat: Int) {
        try {
            val v: Vibrator = if (Build.VERSION.SDK_INT >= 31) (ctx.getSystemService(VibratorManager::class.java)).defaultVibrator
                else ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            v.vibrate(VibrationEffect.createWaveform(pattern, repeat))
        } catch (_: Throwable) {}
    }

    @Suppress("DEPRECATION")
    private fun cancelVibrate(ctx: Context) {
        try {
            val v: Vibrator = if (Build.VERSION.SDK_INT >= 31) (ctx.getSystemService(VibratorManager::class.java)).defaultVibrator
                else ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            v.cancel()
        } catch (_: Throwable) {}
    }

    private lateinit var app: Context

    // Мелодия звонка: все запуски и остановки идут по очереди в главном потоке, плеер всегда один.
    // Раньше звонок запускали одновременно страница и уведомление (из разных потоков) — создавались
    // два плеера, а останавливался один, и мелодия играла после ответа.
    private val ringPlayers = ArrayList<MediaPlayer>()
    private var ringing = false
    @Volatile private var ringSeq = 0          // каждое «стоп» увеличивает: запуск, не успевший начаться до «стоп», отменяется

    private fun onMain(r: () -> Unit) { if (Looper.myLooper() == Looper.getMainLooper()) r() else handler.post(r) }

    /** Мелодия входящего звонка — играет по кругу до ответа/отказа (не дольше минуты). */
    fun ringStart(ctx: Context) {
        app = ctx.applicationContext
        val seq = ringSeq
        onMain { startRingNow(seq) }
    }

    private fun startRingNow(seq: Int) {
        if (seq != ringSeq || ringing) return
        ringing = true
        val ctx = app
        val mode = canSound(ctx)
        if (mode >= 1) vibrate(ctx, longArrayOf(0, 800, 700), 0)
        if (mode == 2) {
            val p = player(ctx, uri(ctx, "ring"))
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)?.let { player(ctx, it) }   // своя мелодия не читается — стандартная
            if (p != null) ringPlayers.add(p)
        }
        handler.removeCallbacks(stopRing); handler.postDelayed(stopRing, 60_000)
    }

    private fun player(ctx: Context, u: Uri?): MediaPlayer? {
        if (u == null) return null
        val p = MediaPlayer()
        return try {
            p.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            p.setDataSource(ctx, u)
            p.isLooping = true
            p.prepare(); p.start()
            p
        } catch (_: Throwable) { try { p.release() } catch (_: Throwable) {}; null }
    }

    fun ringStop() {
        ringSeq++
        onMain { stopRingNow() }
    }

    private fun stopRingNow() {
        handler.removeCallbacks(stopRing)
        ringing = false
        for (p in ringPlayers) { try { p.stop() } catch (_: Throwable) {}; try { p.release() } catch (_: Throwable) {} }
        ringPlayers.clear()
        if (::app.isInitialized) cancelVibrate(app)
    }

    fun isRinging() = ringing

    /** Короткий звук уведомления о сообщении. */
    fun message(ctx: Context) {
        val mode = canSound(ctx)
        if (mode == 1) { vibrate(ctx, longArrayOf(0, 120, 80, 120), -1); return }
        if (mode != 2) return
        playShort(ctx, uri(ctx, "msg"), AudioAttributes.USAGE_NOTIFICATION, 6000)
    }

    /** Прослушать мелодию в настройках (несколько секунд). */
    fun preview(ctx: Context, kind: String) {
        stopPreview()
        playShort(ctx, uri(ctx, kind), if (kind == "ring") AudioAttributes.USAGE_NOTIFICATION_RINGTONE else AudioAttributes.USAGE_NOTIFICATION, 7000)
    }

    fun stopPreview() { try { shortPlayer?.stop() } catch (_: Throwable) {}; shortPlayer?.release(); shortPlayer = null }

    private fun playShort(ctx: Context, u: Uri?, usage: Int, maxMs: Long) {
        u ?: return
        try {
            shortPlayer?.release()
            val p = MediaPlayer()
            p.setAudioAttributes(AudioAttributes.Builder().setUsage(usage).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            p.setDataSource(ctx, u)
            p.setOnCompletionListener { it.release(); if (shortPlayer === it) shortPlayer = null }
            p.prepare(); p.start()
            shortPlayer = p
            handler.postDelayed({ if (shortPlayer === p) stopPreview() }, maxMs)
        } catch (_: Throwable) {}
    }
}
