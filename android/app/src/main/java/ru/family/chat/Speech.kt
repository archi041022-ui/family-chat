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
    private var noRussian = false
    private var engineName: String? = null          // пакет движка, к которому подключены (null — системный по умолчанию)
    private val waiters = mutableListOf<(String) -> Unit>()
    private var recognizer: SpeechRecognizer? = null

    // Известные имена голосов Google для русского: rue/ruf — мужские, ruc/rud/dfc — женские
    private val MALE = Regex("(?i)(rue|ruf|ruh|male|#male|муж|aleksandr|artemiy|mikhail|pavel|yuriy|evgeniy|vsevolod|dmitri|maxim|артём|александр)")
    private val FEMALE = Regex("(?i)(ruc|rud|dfc|female|#female|жен|irina|anna|elena|tatiana|victoria|yulia|marina|alyona|ирина|анна|елена)")

    private class Req(val text: String, val gender: String, val pitch: Float, val rate: Float, val voice: String)

    /** Подключиться к движку речи (выбранному или системному) и сообщить результат: ok | nolang | engine */
    private fun ensure(ctx: Context, engine: String?, then: (String) -> Unit) {
        if (tts != null && engine != engineName) reset()
        val t0 = tts
        if (t0 != null && ready) { then("ok"); return }
        if (t0 != null && noRussian) { then("nolang"); return }
        waiters += then
        if (t0 != null) return                         // уже подключаемся
        engineName = engine
        val listener = TextToSpeech.OnInitListener { status ->
            val t = tts
            val res = if (status != TextToSpeech.SUCCESS || t == null) "engine" else {
                var lang = t.setLanguage(Locale("ru", "RU"))
                if (lang < TextToSpeech.LANG_AVAILABLE) lang = t.setLanguage(Locale("ru"))
                if (lang < TextToSpeech.LANG_AVAILABLE) "nolang" else "ok"
            }
            if (res == "engine") { try { tts?.shutdown() } catch (_: Throwable) {}; tts = null }
            ready = res == "ok"; noRussian = res == "nolang"
            if (ready) tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) = state("start", null)
                override fun onDone(utteranceId: String?) = state("done", null)
                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) = state("fail", "error")
                override fun onError(utteranceId: String?, errorCode: Int) = state("fail", "error$errorCode")
            })
            val w = waiters.toList(); waiters.clear(); w.forEach { it(res) }
        }
        tts = try {
            if (engine.isNullOrBlank()) TextToSpeech(ctx.applicationContext, listener)
            else TextToSpeech(ctx.applicationContext, listener, engine)
        } catch (_: Throwable) { null }
        if (tts == null) { val w = waiters.toList(); waiters.clear(); w.forEach { it("engine") } }
    }

    fun speak(ctx: Context, text: String, gender: String, pitch: Float = 1f, rate: Float = 1f, voice: String = "", engine: String = "") {
        val r = Req(text, gender, pitch, rate, voice)
        ensure(ctx, engine.ifBlank { null }) { res ->
            if (res == "ok") say(r) else state("fail", res)
        }
    }

    private fun state(s: String, reason: String?) {
        val r = if (reason == null) "null" else JSONObject.quote(reason)
        WebHolder.js("window.onTtsState && window.onTtsState('$s', $r)")
    }

    private fun say(r: Req) {
        val engine = tts ?: return
        val male = r.gender == "male"
        val voices: List<Voice> = try {
            engine.voices?.filter { it.locale.language == "ru" && !it.features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) } ?: emptyList()
        } catch (_: Throwable) { emptyList() }
        // голос, выбранный в настройках ассистента
        val chosen = if (r.voice.isNotBlank()) voices.firstOrNull { it.name == r.voice } else null
        var pitch = r.pitch
        if (chosen != null) { try { engine.voice = chosen } catch (_: Throwable) {} }
        else {
            // предпочитаем голос без интернета подходящего пола
            val pick = voices.filter { if (male) MALE.containsMatchIn(it.name) else FEMALE.containsMatchIn(it.name) }
                .sortedBy { if (it.isNetworkConnectionRequired) 1 else 0 }.firstOrNull()
            if (pick != null) { try { engine.voice = pick } catch (_: Throwable) {} }
            else {
                // подходящего голоса нет — тот же голос, но ниже или выше
                voices.firstOrNull()?.let { try { engine.voice = it } catch (_: Throwable) {} }
                pitch *= if (male) 0.72f else 1.12f
            }
        }
        engine.setPitch(pitch.coerceIn(0.3f, 2.5f))
        engine.setSpeechRate(r.rate.coerceIn(0.4f, 2.5f))
        val res = engine.speak(r.text, TextToSpeech.QUEUE_FLUSH, null, "asst-" + System.nanoTime())
        if (res != TextToSpeech.SUCCESS) state("fail", "speak")
    }

    /** Список движков и русских голосов — для выбора голоса в настройках ассистента (ответ в window.onTtsVoices). */
    fun listVoices(ctx: Context, engine: String) {
        ensure(ctx, engine.ifBlank { null }) { res ->
            val o = JSONObject()
            o.put("status", res)
            val t = tts
            o.put("engine", engineName ?: (t?.defaultEngine ?: ""))
            val engines = org.json.JSONArray()
            try { t?.engines?.forEach { engines.put(JSONObject().put("name", it.name).put("label", it.label)) } } catch (_: Throwable) {}
            o.put("engines", engines)
            val list = org.json.JSONArray()
            try {
                t?.voices?.filter { it.locale.language == "ru" }?.sortedBy { it.name }?.forEach {
                    list.put(JSONObject().put("name", it.name).put("network", it.isNetworkConnectionRequired)
                        .put("installed", !it.features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))
                        .put("quality", it.quality)
                        .put("gender", if (MALE.containsMatchIn(it.name)) "male" else if (FEMALE.containsMatchIn(it.name)) "female" else ""))
                }
            } catch (_: Throwable) {}
            o.put("voices", list)
            WebHolder.js("window.onTtsVoices && window.onTtsVoices(" + o.toString() + ")")
        }
    }

    fun stop() { try { tts?.stop() } catch (_: Throwable) {} }

    /** Заново подключить движок речи (например, после скачивания голоса). */
    fun reset() {
        try { tts?.shutdown() } catch (_: Throwable) {}
        tts = null; ready = false; noRussian = false; engineName = null
    }

    /** Распознаёт одну фразу и передаёт текст странице (window.onSpeechResult). */
    /** Режим «слушаю имя Макс»: больше вариантов распознавания, терпеливее к паузам, берём вариант с обращением. */
    @Volatile var wake = false
    private val WAKE = Regex("(^|[^а-яёa-z])(макс|мокс|маск|мэкс|макc|max|mux)([^а-яёa-z]|$)", RegexOption.IGNORE_CASE)

    fun listen(activity: MainActivity) {
        val wakeMode = wake; wake = false
        if (!SpeechRecognizer.isRecognitionAvailable(activity)) { result(null, "unavailable"); return }
        try {
            recognizer?.destroy()
            val r = SpeechRecognizer.createSpeechRecognizer(activity)
            recognizer = r
            r.setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle?) {
                    val alts = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val text = if (wakeMode) (alts?.firstOrNull { WAKE.containsMatchIn(it) } ?: alts?.firstOrNull()) else alts?.firstOrNull()
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
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, if (wakeMode) 6 else 1)
            if (wakeMode) i.putExtra("android.speech.extra.SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS", 1800L)
                .putExtra("android.speech.extra.SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS", 1500L)
                .putExtra("android.speech.extra.SPEECH_INPUT_MINIMUM_LENGTH_MILLIS", 4000L)
                .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, activity.packageName)
            r.startListening(i)
        } catch (_: Throwable) { result(null, "error"); cleanup() }
    }

    /** Остановить прослушивание (например, когда началось воспроизведение голосового). */
    fun cancel() { try { recognizer?.cancel() } catch (_: Throwable) {}; cleanup() }

    private fun cleanup() { try { recognizer?.destroy() } catch (_: Throwable) {}; recognizer = null }

    private fun result(text: String?, err: String?) {
        val t = if (text == null) "null" else JSONObject.quote(text)
        val e = if (err == null) "null" else JSONObject.quote(err)
        WebHolder.js("window.onSpeechResult && window.onSpeechResult($t, $e)")
    }
}
