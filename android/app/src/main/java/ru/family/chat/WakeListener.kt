package ru.family.chat

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * Голосовая активация при закрытом приложении: служба слушает обращение «Макс».
 * Услышали — открываем ассистента и передаём ему фразу («Макс, позвони маме» исполняется сразу).
 * Работает, пока приложение не в экране, нет звонка, и включён переключатель в настройках ассистента.
 */
object WakeListener {
    private val handler = Handler(Looper.getMainLooper())
    private var rec: SpeechRecognizer? = null
    private var ctx: Context? = null
    @Volatile private var on = false
    private val NAME = Regex("(^|[^а-яёa-z])(макс|мокс|маск|мэкс|max|mux)(?![а-яё])", RegexOption.IGNORE_CASE)

    fun enabled(c: Context) = c.getSharedPreferences("family", Context.MODE_PRIVATE).getBoolean("bg_wake", false)
    fun setEnabled(c: Context, v: Boolean) {
        c.getSharedPreferences("family", Context.MODE_PRIVATE).edit().putBoolean("bg_wake", v).apply()
        if (v) { ChatService.start(c); ChatService.refreshTypes(c) } else stop()
    }
    fun canRun(c: Context) =
        c.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED && AgentOverlay.canDraw(c)

    /** Вызывает ChatService, когда можно слушать. */
    fun start(c: Context) {
        ctx = c.applicationContext
        if (on || !enabled(c) || !canRun(c) || !SpeechRecognizer.isRecognitionAvailable(c)) return
        on = true
        next(200)
    }

    fun stop() {
        on = false; handler.removeCallbacksAndMessages(null)
        try { rec?.destroy() } catch (_: Throwable) {}
        rec = null
        ctx?.let { WebHolder.muteBeeps(it, false) }
    }

    /** Нужно ли слушать прямо сейчас: приложение закрыто, звонка нет. */
    private fun allowed(): Boolean {
        val c = ctx ?: return false
        return enabled(c) && !WebHolder.foreground && !ChatService.inCallNow
    }

    private fun next(delay: Long) {
        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({ if (on) listen() }, delay)
    }

    private fun listen() {
        val c = ctx ?: return
        if (!allowed()) { WebHolder.muteBeeps(c, false); next(2500); return }
        WebHolder.muteBeeps(c, true)
        try {
            rec?.destroy()
            val r = SpeechRecognizer.createSpeechRecognizer(c); rec = r
            r.setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle?) {
                    val alts = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val hit = alts?.firstOrNull { NAME.containsMatchIn(it) }
                    if (hit != null) wake(hit) else next(250)
                }
                override fun onError(error: Int) {
                    next(when (error) {
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> 3000
                        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> 300
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> 60000
                        else -> 1500
                    })
                }
                override fun onReadyForSpeech(p: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(r: Float) {}
                override fun onBufferReceived(b: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onPartialResults(p: Bundle?) {}
                override fun onEvent(t: Int, p: Bundle?) {}
            })
            val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU")
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 6)
                .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, c.packageName)
                .putExtra("android.speech.extra.SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS", 1200L)
            r.startListening(i)
        } catch (_: Throwable) { next(5000) }
    }

    private fun wake(phrase: String) {
        val c = ctx ?: return
        try { rec?.destroy() } catch (_: Throwable) {}
        rec = null
        WebHolder.muteBeeps(c, false)
        try { c.startActivity(AgentOverlay.launchIntent(c).putExtra("agent_text", phrase)) } catch (_: Throwable) {}
        // после выхода из приложения слушание возобновится само (см. ChatService)
        on = false
        handler.postDelayed({ if (enabled(c)) start(c) }, 4000)
    }
}
