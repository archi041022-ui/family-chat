package ru.family.chat

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import org.json.JSONObject
import java.util.Locale

/**
 * Голос ассистента: озвучка ответов (мужской или женский голос) и распознавание речи.
 * Работает через системные службы Android (Google или Samsung).
 */
object Speech {
    private var tts: TextToSpeech? = null
    private var ready = false
    private var pending: Pair<String, String>? = null
    private var recognizer: SpeechRecognizer? = null

    // Известные имена голосов Google для русского: rue/ruf — мужские, ruc/rud/dfc — женские
    private val MALE = Regex("(?i)(rue|ruf|ruh|male|#male|муж)")
    private val FEMALE = Regex("(?i)(ruc|rud|dfc|female|#female|жен)")

    fun speak(ctx: Context, text: String, gender: String) {
        val engine = tts
        if (engine == null) {
            pending = text to gender
            tts = TextToSpeech(ctx.applicationContext) { status ->
                if (status != TextToSpeech.SUCCESS) {
                    // на телефоне нет движка синтеза речи — страница включит запасной голос
                    try { tts?.shutdown() } catch (_: Throwable) {}
                    tts = null; ready = false; pending = null
                    state("fail", "engine"); return@TextToSpeech
                }
                val t = tts ?: return@TextToSpeech
                var lang = t.setLanguage(Locale("ru", "RU"))
                if (lang < TextToSpeech.LANG_AVAILABLE) lang = t.setLanguage(Locale("ru"))
                if (lang < TextToSpeech.LANG_AVAILABLE) {
                    // движок есть, но русского голоса нет (часто на Samsung/Xiaomi без скачанных данных)
                    ready = false; pending = null; noRussian = true
                    state("fail", "nolang"); return@TextToSpeech
                }
                t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) = state("start", null)
                    override fun onDone(utteranceId: String?) = state("done", null)
                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) = state("fail", "error")
                    override fun onError(utteranceId: String?, errorCode: Int) = state("fail", "error$errorCode")
                })
                ready = true
                pending?.let { (tx, g) -> say(tx, g) }
                pending = null
            }
            return
        }
        if (noRussian) { state("fail", "nolang"); return }
        if (ready) say(text, gender) else pending = text to gender
    }

    private var noRussian = false

    private fun state(s: String, reason: String?) {
        val r = if (reason == null) "null" else JSONObject.quote(reason)
        WebHolder.js("window.onTtsState && window.onTtsState('$s', $r)")
    }

    private fun say(text: String, gender: String) {
        val engine = tts ?: return
        val male = gender == "male"
        val voices: List<Voice> = try {
            engine.voices?.filter { it.locale.language == "ru" && !it.features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) } ?: emptyList()
        } catch (_: Throwable) { emptyList() }
        // предпочитаем голос без интернета, но подходящего пола
        val pick = voices.filter { if (male) MALE.containsMatchIn(it.name) else FEMALE.containsMatchIn(it.name) }
            .sortedBy { if (it.isNetworkConnectionRequired) 1 else 0 }.firstOrNull()
        if (pick != null) { try { engine.voice = pick } catch (_: Throwable) {} ; engine.setPitch(1.0f) }
        else {
            // подходящего голоса нет — тот же голос, но ниже или выше
            voices.firstOrNull()?.let { try { engine.voice = it } catch (_: Throwable) {} }
            engine.setPitch(if (male) 0.72f else 1.12f)
        }
        engine.setSpeechRate(1.0f)
        val r = engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "asst-" + System.nanoTime())
        if (r != TextToSpeech.SUCCESS) state("fail", "speak")
    }

    fun stop() { try { tts?.stop() } catch (_: Throwable) {} }

    /** Заново подключить движок речи (например, после скачивания русского голоса). */
    fun reset() {
        try { tts?.shutdown() } catch (_: Throwable) {}
        tts = null; ready = false; noRussian = false; pending = null
    }

    /** Распознаёт одну фразу и передаёт текст странице (window.onSpeechResult). */
    fun listen(activity: MainActivity) {
        if (!SpeechRecognizer.isRecognitionAvailable(activity)) { result(null, "unavailable"); return }
        try {
            recognizer?.destroy()
            val r = SpeechRecognizer.createSpeechRecognizer(activity)
            recognizer = r
            r.setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle?) {
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                    result(text, if (text.isNullOrBlank()) "no_match" else null); cleanup()
                }
                override fun onError(error: Int) {
                    result(null, when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no_match"
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission"
                        else -> "error"
                    }); cleanup()
                }
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onPartialResults(partialResults: Bundle?) {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU")
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            r.startListening(i)
        } catch (_: Throwable) { result(null, "error"); cleanup() }
    }

    private fun cleanup() { try { recognizer?.destroy() } catch (_: Throwable) {}; recognizer = null }

    private fun result(text: String?, err: String?) {
        val t = if (text == null) "null" else JSONObject.quote(text)
        val e = if (err == null) "null" else JSONObject.quote(err)
        WebHolder.js("window.onSpeechResult && window.onSpeechResult($t, $e)")
    }
}
