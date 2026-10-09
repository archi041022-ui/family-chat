/*!
 * AI-агент с голосом: один файл, без зависимостей. Вставляется на любой сайт или в приложение одной строкой:
 *   <script src="https://…/agent/agent.js" data-name="Анна" data-voice="soft" data-color="#7A5AF8"></script>
 * Что умеет: чат и голосовой разговор (микрофон + озвучка), выбор голоса, ползунки тембра и скорости,
 * своя роль и знания (о вашей компании, товарах, ценах), любой ИИ-сервер, память беседы, события для вашего кода.
 * Лицензия: MIT.
 */
(function () {
  "use strict";
  if (window.AIAgent && window.AIAgent.__loaded) return;

  // ───────── Голоса: тембр и скорость поверх голоса устройства ─────────
  var VOICES = {
    soft:    { label: "Нежный (женский)",       gender: "female", pitch: 1.05, rate: 0.93 },
    female:  { label: "Женский",                gender: "female", pitch: 1.0,  rate: 1.0 },
    bright:  { label: "Бодрый женский",         gender: "female", pitch: 1.12, rate: 1.08 },
    male:    { label: "Мужской",                gender: "male",   pitch: 1.0,  rate: 1.0 },
    calm:    { label: "Спокойный мужской",      gender: "male",   pitch: 0.85, rate: 0.92 },
    butler:  { label: "Дворецкий",              gender: "male",   pitch: 0.86, rate: 0.95 },
    robot:   { label: "Робот",                  gender: "male",   pitch: 0.55, rate: 0.9 },
    cartoon: { label: "Мультяшный",             gender: "female", pitch: 1.6,  rate: 1.12 }
  };
  var FEMALE = /(milena|alena|alyona|irina|tatyana|katya|svetlana|anna|elena|olga|female|жен|google\s*рус|yandex.*(alyss|oksana|jane|omazh))/i;
  var MALE = /(yuri|pavel|maxim|dmitr|ivan|aleksandr|male|муж|yandex.*(zahar|ermil|filipp))/i;

  var DEFAULTS = {
    id: "default",                    // для разделения памяти нескольких агентов на одном сайте
    name: "Помощник",
    persona: "Ты дружелюбный и толковый помощник сайта. Отвечай по делу.",
    greeting: "Здравствуйте! Чем могу помочь?",
    knowledge: "", knowledgeUrl: "",  // что агент должен знать (о компании, ценах, правилах)
    lang: "ru-RU",
    voice: "soft", pitch: 1, rate: 1, voiceName: "",  // пресет + множители 0.6–1.6 + точное имя голоса устройства
    speak: true, mic: true, handsfree: false,
    color: "#4B7BEC", position: "right", theme: "auto", // right | left, auto | light | dark
    open: false, remember: true, maxTurns: 12,
    provider: "pollinations",         // pollinations (бесплатно, без ключа) | openai (любой OpenAI-совместимый) | custom (ваш сервер)
    endpoint: "", apiKey: "", model: "openai", headers: null,
    placeholder: "Напишите или скажите…",
    title: "", zIndex: 2147483000
  };

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function el(tag, props, kids) {
    var e = document.createElement(tag);
    for (var k in props || {}) {
      if (k === "class") e.className = props[k];
      else if (k === "text") e.textContent = props[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), props[k]);
      else e.setAttribute(k, props[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
    ".w{--c:#4B7BEC;--bg:#fff;--fg:#1c1e21;--mut:#6b7280;--bd:#e5e7eb;--me:var(--c);--bot:#f1f3f5;position:fixed;bottom:18px;z-index:var(--z);color:var(--fg)}",
    ".w.right{right:18px}.w.left{left:18px}",
    ".w.dark{--bg:#17181b;--fg:#f3f4f6;--mut:#9ca3af;--bd:#2b2e33;--bot:#25282d}",
    "@media(prefers-color-scheme:dark){.w.auto{--bg:#17181b;--fg:#f3f4f6;--mut:#9ca3af;--bd:#2b2e33;--bot:#25282d}}",
    ".fab{width:58px;height:58px;border-radius:50%;border:0;background:var(--c);color:#fff;font-size:26px;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.28);display:grid;place-items:center;transition:transform .15s}",
    ".fab:hover{transform:scale(1.06)}.fab.pulse{animation:p 1.4s infinite}",
    "@keyframes p{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--c) 55%,transparent)}100%{box-shadow:0 0 0 18px transparent}}",
    ".panel{position:absolute;bottom:72px;width:min(380px,calc(100vw - 24px));height:min(600px,calc(100vh - 110px));background:var(--bg);border:1px solid var(--bd);border-radius:18px;box-shadow:0 14px 48px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden}",
    ".right .panel{right:0}.left .panel{left:0}.w.open .panel{display:flex}",
    ".hd{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--c);color:#fff}",
    ".hd b{font-size:16px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hd small{opacity:.85;display:block;font-weight:400;font-size:12px}",
    ".ib{border:0;background:rgba(255,255,255,.18);color:#fff;width:34px;height:34px;border-radius:50%;font-size:16px;cursor:pointer}.ib.off{opacity:.55}",
    ".ms{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}",
    ".m{max-width:84%;padding:9px 12px;border-radius:16px;line-height:1.38;font-size:15px;white-space:pre-wrap;word-wrap:break-word}",
    ".m.bot{background:var(--bot);align-self:flex-start;border-bottom-left-radius:5px}.m.me{background:var(--me);color:#fff;align-self:flex-end;border-bottom-right-radius:5px}",
    ".m.err{background:#fde8e8;color:#9b1c1c}.dots span{display:inline-block;width:7px;height:7px;margin:0 2px;border-radius:50%;background:var(--mut);animation:d 1s infinite}",
    ".dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s}@keyframes d{0%,80%,100%{opacity:.25}40%{opacity:1}}",
    ".in{display:flex;gap:8px;padding:10px;border-top:1px solid var(--bd);align-items:flex-end}",
    ".in textarea{flex:1;resize:none;border:1px solid var(--bd);border-radius:14px;padding:9px 12px;font-size:15px;background:var(--bg);color:var(--fg);max-height:110px;outline:none}",
    ".in textarea:focus{border-color:var(--c)}",
    ".sb{border:0;border-radius:50%;width:40px;height:40px;background:var(--c);color:#fff;font-size:17px;cursor:pointer;flex:none}.sb.mic.on{background:#e11d48;animation:p 1.1s infinite}",
    ".set{display:none;padding:12px 14px;border-top:1px solid var(--bd);background:var(--bg);font-size:14px}.set.show{display:block}",
    ".set label{display:block;margin:8px 0 2px;color:var(--mut)}.set select,.set input[type=range]{width:100%;accent-color:var(--c)}.set select{padding:7px;border-radius:8px;border:1px solid var(--bd);background:var(--bg);color:var(--fg)}",
    ".set .row{display:flex;justify-content:space-between}.set button{margin-top:10px;border:1px solid var(--bd);background:transparent;color:var(--fg);padding:7px 12px;border-radius:10px;cursor:pointer}",
    ".ft{text-align:center;font-size:11px;color:var(--mut);padding:0 0 6px}"
  ].join("\n");

  function Agent(cfg) {
    var self = this;
    this.cfg = Object.assign({}, DEFAULTS, cfg || {});
    this.listeners = {};
    this.history = [];
    this.busy = false;
    this.listening = false;
    this.knowledgeText = this.cfg.knowledge || "";
    this.key = "aiagent:" + this.cfg.id;
    this._load();
    this._build();
    if (this.cfg.knowledgeUrl) {
      fetch(this.cfg.knowledgeUrl).then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (t) { self.knowledgeText = (self.knowledgeText + "\n" + t).trim(); }).catch(function () {});
    }
    if (window.speechSynthesis && speechSynthesis.addEventListener) speechSynthesis.addEventListener("voiceschanged", function () { self._fillVoices(); });
  }

  var P = Agent.prototype;

  // ───────── События для вашего кода ─────────
  P.on = function (ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); return this; };
  P._emit = function (ev, data) { (this.listeners[ev] || []).forEach(function (f) { try { f(data); } catch (e) { console.error(e); } }); };

  // ───────── Память ─────────
  P._load = function () {
    try {
      var s = JSON.parse(localStorage.getItem(this.key) || "{}");
      if (this.cfg.remember && Array.isArray(s.h)) this.history = s.h.slice(-40);
      if (s.s) { ["voice", "pitch", "rate", "voiceName", "speak"].forEach(function (k) { if (s.s[k] !== undefined) this.cfg[k] = s.s[k]; }, this); }
    } catch (e) { /* без памяти */ }
  };
  P._save = function () {
    try { localStorage.setItem(this.key, JSON.stringify({ h: this.cfg.remember ? this.history.slice(-40) : [], s: { voice: this.cfg.voice, pitch: this.cfg.pitch, rate: this.cfg.rate, voiceName: this.cfg.voiceName, speak: this.cfg.speak } })); } catch (e) { /* */ }
  };

  // ───────── Интерфейс (в Shadow DOM, чтобы стили сайта не мешали) ─────────
  P._build = function () {
    var self = this, c = this.cfg;
    this.host = el("div", { "data-ai-agent": c.id });
    var root = this.host.attachShadow ? this.host.attachShadow({ mode: "open" }) : this.host;
    root.appendChild(el("style", { text: CSS }));
    this.w = el("div", { class: "w " + (c.position === "left" ? "left" : "right") + " " + (c.theme === "dark" ? "dark" : c.theme === "light" ? "" : "auto") });
    this.w.style.setProperty("--c", c.color); this.w.style.setProperty("--z", String(c.zIndex));
    this.fab = el("button", { class: "fab", "aria-label": "Открыть чат с помощником: " + c.name, title: c.name, text: "💬", onclick: function () { self.toggle(); } });
    this.msgs = el("div", { class: "ms", role: "log", "aria-live": "polite" });
    this.input = el("textarea", { rows: "1", placeholder: c.placeholder, "aria-label": "Сообщение" });
    this.input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); self._submit(); } });
    this.input.addEventListener("input", function () { self.input.style.height = "auto"; self.input.style.height = Math.min(110, self.input.scrollHeight) + "px"; });
    this.micBtn = el("button", { class: "sb mic", "aria-label": "Говорить", title: "Говорить", text: "🎤", onclick: function () { self.listening ? self._stopListen() : self._listen(); } });
    var send = el("button", { class: "sb", "aria-label": "Отправить", title: "Отправить", text: "➤", onclick: function () { self._submit(); } });
    this.spkBtn = el("button", { class: "ib" + (c.speak ? "" : " off"), title: "Озвучивать ответы", "aria-label": "Озвучка", text: "🔊", onclick: function () { c.speak = !c.speak; self.spkBtn.classList.toggle("off", !c.speak); if (!c.speak) self.stopSpeaking(); self._save(); } });
    var gear = el("button", { class: "ib", title: "Голос", "aria-label": "Настройки голоса", text: "⚙", onclick: function () { self.set.classList.toggle("show"); } });
    var close = el("button", { class: "ib", title: "Закрыть", "aria-label": "Закрыть", text: "✕", onclick: function () { self.close(); } });
    var hd = el("div", { class: "hd" }, [el("b", { text: c.title || c.name }), this.spkBtn, gear, close]);
    // настройки голоса
    this.sel = el("select", { "aria-label": "Голос", onchange: function () { c.voice = self.sel.value; self._applyPreset(); self._save(); self._preview(); } });
    for (var id in VOICES) this.sel.appendChild(el("option", { value: id, text: VOICES[id].label }));
    this.sel.value = c.voice in VOICES ? c.voice : "soft";
    this.devSel = el("select", { "aria-label": "Голос устройства", onchange: function () { c.voiceName = self.devSel.value; self._save(); self._preview(); } });
    this.pv = el("b", { text: "" }); this.rv = el("b", { text: "" });
    this.pr = el("input", { type: "range", min: "60", max: "160", step: "5", "aria-label": "Тембр", oninput: function () { c.pitch = +self.pr.value / 100; self.pv.textContent = self.pr.value + "%"; }, onchange: function () { self._save(); self._preview(); } });
    this.rr = el("input", { type: "range", min: "60", max: "160", step: "5", "aria-label": "Скорость", oninput: function () { c.rate = +self.rr.value / 100; self.rv.textContent = self.rr.value + "%"; }, onchange: function () { self._save(); self._preview(); } });
    this.pr.value = String(Math.round(c.pitch * 100)); this.rr.value = String(Math.round(c.rate * 100)); this.pv.textContent = this.pr.value + "%"; this.rv.textContent = this.rr.value + "%";
    this.set = el("div", { class: "set" }, [
      el("label", { text: "Голос" }), this.sel, el("label", { text: "Голос устройства" }), this.devSel,
      el("label", {}, [el("span", { class: "row" }, [el("span", { text: "Тембр" }), this.pv])]), this.pr,
      el("label", {}, [el("span", { class: "row" }, [el("span", { text: "Скорость" }), this.rv])]), this.rr,
      el("button", { text: "Сбросить", onclick: function () { c.pitch = 1; c.rate = 1; self.pr.value = self.rr.value = "100"; self.pv.textContent = self.rv.textContent = "100%"; self._save(); self._preview(); } })
    ]);
    var panel = el("div", { class: "panel", role: "dialog", "aria-label": c.name }, [hd, this.msgs, this.set,
      el("div", { class: "in" }, [this.input, c.mic && this._sr() ? this.micBtn : null, send]),
      el("div", { class: "ft", text: "ИИ может ошибаться" })]);
    this.w.appendChild(panel); this.w.appendChild(this.fab); root.appendChild(this.w);
    document.body.appendChild(this.host);
    this._fillVoices();
    if (c.greeting) this._bubble("bot", c.greeting);
    this.history.forEach(function (m) { self._bubble(m.role === "user" ? "me" : "bot", m.content); });
    if (c.open) this.open();
  };

  P._fillVoices = function () {
    if (!this.devSel) return;
    var list = (window.speechSynthesis && speechSynthesis.getVoices ? speechSynthesis.getVoices() : []).filter(function (v) { return /^ru/i.test(v.lang) || !/^ru/i.test(this.cfg.lang) && v.lang.slice(0, 2) === this.cfg.lang.slice(0, 2); }, this);
    this.devSel.innerHTML = "";
    this.devSel.appendChild(el("option", { value: "", text: "Подобрать автоматически" }));
    list.forEach(function (v) { this.devSel.appendChild(el("option", { value: v.name, text: v.name })); }, this);
    this.devSel.value = this.cfg.voiceName || "";
  };
  P._applyPreset = function () { /* пресет влияет на высоту и скорость при озвучке */ };

  P._bubble = function (who, text, cls) {
    var b = el("div", { class: "m " + who + (cls ? " " + cls : "") }); b.textContent = text;     // только текст: чужая разметка не вставляется
    this.msgs.appendChild(b); this.msgs.scrollTop = this.msgs.scrollHeight; return b;
  };

  // ───────── Открыть / закрыть ─────────
  P.open = function () { this.w.classList.add("open"); this.fab.classList.remove("pulse"); this._emit("open"); setTimeout(function () { try { this.input.focus(); } catch (e) { /* */ } }.bind(this), 50); return this; };
  P.close = function () { this.w.classList.remove("open"); this._stopListen(); this.stopSpeaking(); this._emit("close"); return this; };
  P.toggle = function () { return this.w.classList.contains("open") ? this.close() : this.open(); };
  P.destroy = function () { this.stopSpeaking(); this._stopListen(); this.host.remove(); };
  P.reset = function () { this.history = []; this.msgs.innerHTML = ""; this._bubble("bot", this.cfg.greeting); this._save(); return this; };

  // ───────── Сообщения ─────────
  P._submit = function () { var t = this.input.value.trim(); if (!t) return; this.input.value = ""; this.input.style.height = "auto"; this.ask(t); };

  P._system = function () {
    var c = this.cfg, now = new Date().toLocaleString(c.lang, { dateStyle: "full", timeStyle: "short" });
    return c.persona + " Тебя зовут " + c.name + ". Сейчас " + now + ". Отвечай на языке собеседника, коротко (1–4 предложения), без markdown и списков со звёздочками: ответ будет зачитан вслух." +
      (this.knowledgeText ? "\n\nЗнания, на которые нужно опираться. Если ответа в них нет — честно скажи, что не знаешь, и предложи связаться с человеком:\n" + this.knowledgeText.slice(0, 8000) : "");
  };

  P.ask = function (text) {
    var self = this;
    if (this.busy) return Promise.resolve(null);
    this.busy = true; this.stopSpeaking(); this._stopListen(true);
    this.history.push({ role: "user", content: text }); this._bubble("me", text); this._emit("message", { role: "user", text: text });
    var typing = el("div", { class: "m bot dots" }, [el("span"), el("span"), el("span")]); this.msgs.appendChild(typing); this.msgs.scrollTop = this.msgs.scrollHeight;
    return this._complete().then(function (reply) {
      typing.remove(); self.busy = false;
      reply = String(reply || "").replace(/\*\*/g, "").replace(/^#+\s*/gm, "").trim() || "Не получилось ответить. Попробуйте ещё раз.";
      self.history.push({ role: "assistant", content: reply }); self._bubble("bot", reply); self._save();
      self._emit("message", { role: "assistant", text: reply });
      self.say(reply);
      return reply;
    }).catch(function (e) {
      typing.remove(); self.busy = false; self.history.pop();
      var msg = e && e.message === "timeout" ? "Сервер долго не отвечает. Попробуйте ещё раз." : "Нет связи с ИИ. Проверьте интернет и попробуйте ещё раз.";
      self._bubble("bot", msg, "err"); self._emit("error", e); return null;
    });
  };

  P._complete = function () {
    var c = this.cfg, msgs = this.history.slice(-c.maxTurns * 2).map(function (m) { return { role: m.role, content: m.content }; });
    var ctl = typeof AbortController === "function" ? new AbortController() : null, timer = setTimeout(function () { if (ctl) ctl.abort(); }, 40000);
    var hdr = Object.assign({ "Content-Type": "application/json" }, c.headers || {});
    var url, body, parse;
    if (c.provider === "custom") {            // ваш сервер: POST { system, messages, name } → { reply }
      url = c.endpoint; body = { system: this._system(), messages: msgs, name: c.name, id: c.id }; parse = function (j) { return j.reply || j.text || (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content); };
    } else {                                   // OpenAI-совместимый формат (в том числе бесплатный pollinations)
      url = c.endpoint || (c.provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://text.pollinations.ai/openai");
      if (c.apiKey) hdr.Authorization = "Bearer " + c.apiKey;
      body = { model: c.model, messages: [{ role: "system", content: this._system() }].concat(msgs) };
      if (c.provider === "pollinations") body.private = true;
      parse = function (j) { return j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content; };
    }
    if (!url) { clearTimeout(timer); return Promise.reject(new Error("endpoint")); }
    return fetch(url, { method: "POST", headers: hdr, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (j) { clearTimeout(timer); return parse(j); })
      .catch(function (e) { clearTimeout(timer); throw (e && e.name === "AbortError" ? new Error("timeout") : e); });
  };

  // ───────── Голос: озвучка ─────────
  P._pickVoice = function (gender) {
    var c = this.cfg, all = window.speechSynthesis && speechSynthesis.getVoices ? speechSynthesis.getVoices() : [];
    var lang = c.lang.slice(0, 2).toLowerCase(), list = all.filter(function (v) { return v.lang && v.lang.slice(0, 2).toLowerCase() === lang; });
    if (c.voiceName) { var named = all.filter(function (v) { return v.name === c.voiceName; })[0]; if (named) return { v: named, match: true }; }
    var re = gender === "male" ? MALE : FEMALE, hit = list.filter(function (v) { return re.test(v.name); })[0];
    if (hit) return { v: hit, match: true };
    return { v: list[0] || null, match: false };
  };
  P.params = function () {     // итоговые высота и скорость: пресет × ползунки
    var c = this.cfg, p = VOICES[c.voice] || VOICES.soft, pick = this._pickVoice(p.gender);
    var pitch = p.pitch * clamp(+c.pitch || 1, 0.6, 1.6), rate = p.rate * clamp(+c.rate || 1, 0.6, 1.6);
    if (pick.v && !pick.match && !c.voiceName) pitch *= p.gender === "male" ? 0.75 : 1.1;    // нет голоса нужного пола — сдвигаем высоту
    return { voice: pick.v, gender: p.gender, pitch: clamp(pitch, 0.1, 2), rate: clamp(rate, 0.5, 2) };
  };
  P.say = function (text) {
    var self = this, c = this.cfg; text = String(text || "").replace(/https?:\/\/\S+/g, "").replace(/[*_#>`]/g, "").slice(0, 1200).trim();
    if (!c.speak || !text) { this._afterSpeak(); return; }
    var pr = this.params();
    if (window.AndroidBridge && window.AndroidBridge.speak2) { try { window.AndroidBridge.speak2(text, pr.gender, pr.pitch, pr.rate, "", ""); this._emit("speak", text); return; } catch (e) { /* дальше обычная озвучка */ } }
    if (!window.speechSynthesis) { this._afterSpeak(); return; }
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text); u.lang = c.lang; if (pr.voice) u.voice = pr.voice; u.pitch = pr.pitch; u.rate = pr.rate;
    u.onend = u.onerror = function () { self.speaking = false; self._afterSpeak(); };
    this.speaking = true; this._emit("speak", text); speechSynthesis.speak(u);
  };
  P._preview = function () { var s = this.cfg.speak; this.cfg.speak = true; this.say("Так я буду говорить."); this.cfg.speak = s; };
  P.stopSpeaking = function () { this.speaking = false; try { if (window.AndroidBridge && window.AndroidBridge.stop) window.AndroidBridge.stop(); if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* */ } };
  P._afterSpeak = function () { if (this.cfg.handsfree && this.w.classList.contains("open") && !this.busy) this._listen(); };

  // ───────── Голос: микрофон ─────────
  P._sr = function () { return window.SpeechRecognition || window.webkitSpeechRecognition; };
  P._listen = function () {
    var self = this, SR = this._sr(); if (!SR || this.listening) return;
    this.stopSpeaking();
    var r = new SR(); r.lang = this.cfg.lang; r.interimResults = true; r.maxAlternatives = 1; var final = "";
    r.onresult = function (e) { var t = ""; for (var i = e.resultIndex; i < e.results.length; i++) { t += e.results[i][0].transcript; if (e.results[i].isFinal) final = t; } self.input.value = t; };
    r.onerror = function (e) { self.listening = false; self.micBtn.classList.remove("on"); if (e.error === "not-allowed" || e.error === "service-not-allowed") self._bubble("bot", "Разрешите доступ к микрофону в настройках браузера.", "err"); };
    r.onend = function () { self.listening = false; self.micBtn.classList.remove("on"); if (final.trim() && !self._silent) { self.input.value = final; self._submit(); } self._silent = false; };
    try { r.start(); this.rec = r; this.listening = true; this.micBtn.classList.add("on"); } catch (e) { this.listening = false; }
  };
  P._stopListen = function (silent) { this._silent = !!silent; try { if (this.rec && this.listening) this.rec.stop(); } catch (e) { /* */ } };

  // ───────── Публичный интерфейс ─────────
  var current = null;
  function init(cfg) { if (current) current.destroy(); current = new Agent(cfg); return current; }
  window.AIAgent = { __loaded: true, init: init, VOICES: VOICES, get instance() { return current; }, create: function (cfg) { return new Agent(cfg); } };

  // автозапуск по data-атрибутам тега <script>
  var s = document.currentScript;
  function auto() {
    if (!s || s.getAttribute("data-auto") === "false") return;
    var d = s.dataset, cfg = {};
    var map = { id: "id", name: "name", persona: "persona", greeting: "greeting", knowledge: "knowledge", knowledgeUrl: "knowledge-url", lang: "lang", voice: "voice", voiceName: "voice-name", color: "color", position: "position", theme: "theme", provider: "provider", endpoint: "endpoint", apiKey: "api-key", model: "model", title: "title", placeholder: "placeholder" };
    Object.keys(map).forEach(function (k) { var attr = map[k]; var camel = attr.replace(/-([a-z])/g, function (_, ch) { return ch.toUpperCase(); }); if (d[camel] !== undefined) cfg[k] = d[camel]; });
    ["pitch", "rate"].forEach(function (k) { if (d[k] !== undefined) cfg[k] = parseFloat(d[k]); });
    ["speak", "mic", "handsfree", "open", "remember"].forEach(function (k) { if (d[k] !== undefined) cfg[k] = d[k] !== "false"; });
    init(cfg);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto); else auto();
})();
