/* Ассистент: погода, новости, курсы валют и ответы на вопросы. Голосовой ввод и озвучка мужским или женским голосом. */
"use strict";

// Голоса-персонажи ассистента: высота и скорость голоса + манера обращения
const VOICES = [
  { id: "female", icon: "👩", name: "Женский", desc: "Обычный женский голос", gender: "female", pitch: 1, rate: 1 },
  { id: "soft", icon: "🌸", name: "Нежный", desc: "Приятный мягкий женский голос", gender: "female", pitch: 1.05, rate: 0.93,
    style: "приятная, спокойная и доброжелательная помощница, говорит мягко и тепло", hello: "Здравствуйте! Рада вас слышать. Чем могу помочь?" },
  { id: "male", icon: "👨", name: "Мужской", desc: "Обычный мужской голос", gender: "male", pitch: 1, rate: 1 },
  { id: "jarvis", icon: "🤖", name: "Джарвис", desc: "Невозмутимый дворецкий, обращается «Сэр»", gender: "male", pitch: 0.86, rate: 0.95, address: "Сэр",
    style: "вежливый невозмутимый британский дворецкий с лёгкой иронией", hello: "К вашим услугам, сэр. Все системы работают нормально." },
  { id: "friday", icon: "💁‍♀️", name: "Пятница", desc: "Бодрая помощница, зовёт вас «Босс»", gender: "female", pitch: 1.08, rate: 1.07, address: "Босс",
    style: "бодрая энергичная помощница", hello: "Привет, босс! Пятница на связи." },
  { id: "robot", icon: "🦾", name: "Робот", desc: "Низкий механический голос", gender: "male", pitch: 0.55, rate: 0.9,
    style: "робот, говорит чётко и коротко", hello: "Система активирована. Ожидаю команду." },
  { id: "storyteller", icon: "🧙", name: "Сказочник", desc: "Неторопливый добрый голос", gender: "male", pitch: 0.8, rate: 0.85,
    style: "добрый сказочник, говорит образно", hello: "Здравствуй, друг мой. Чем могу помочь?" },
  { id: "granny", icon: "👵", name: "Бабушка", desc: "Тёплый заботливый голос", gender: "female", pitch: 0.88, rate: 0.86,
    style: "заботливая бабушка, ласковая", hello: "Здравствуй, родной! Чем тебе помочь?" },
  { id: "cartoon", icon: "🐿", name: "Мультяшка", desc: "Высокий весёлый голос", gender: "female", pitch: 1.7, rate: 1.12,
    style: "весёлый мультяшный персонаж", hello: "Приветики! Чем помочь?" },
  { id: "joker", icon: "🎤", name: "Весельчак", desc: "Бодрый шутник: отвечает с юмором", gender: "male", pitch: 1.04, rate: 1.12,
    style: "остроумный весельчак-комик, отвечает бодро и с лёгкой шуткой, но по делу и без грубостей", hello: "О, привет! Весельчак на связи. Что у нас на повестке, кроме хорошего настроения?" },
];

const Assistant = {
  history: [],
  busy: false,
  geo: null,          // { lat, lon, at }
  settings: { voice: "female", speak: true, city: "", handsfree: true, voiceEngine: "auto", sysVoice: null, pitchAdj: 1, rateAdj: 1 },
  preset(id) { return VOICES.find((v) => v.id === (id || this.settings.voice)) || VOICES[0]; },
  // ответ в манере выбранного персонажа (для быстрых ответов без нейросети)
  persona(text) {
    const p = this.preset();
    if (!p.address || !text) return text;
    return `${p.address}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  },

  key(k) { return `assistant:${k}:${S.me?.id || ""}`; },
  load() {
    try { this.history = JSON.parse(localStorage.getItem(this.key("h")) || "[]"); } catch { this.history = []; }
    for (const m of this.history) if (m.card?.state === "pending") m.card.state = "cancelled";
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(this.key("s")) || "{}")); } catch { /* */ }
  },
  save() {
    try { localStorage.setItem(this.key("h"), JSON.stringify(this.history.slice(-60))); } catch { /* */ }
    try { localStorage.setItem(this.key("s"), JSON.stringify(this.settings)); } catch { /* */ }
  },

  // личный ассистент — закреплён первым в списке чатов у каждого участника; переписка видна только ему
  listItem() {
    if (!this.loaded) { this.load(); this.loaded = true; }
    const last = [...this.history].reverse().find((m) => m.content);
    const prev = last ? (last.role === "user" ? "Вы: " : "") + String(last.content).replace(/\s+/g, " ") : `Личный помощник${S.me?.name ? " для " + S.me.name.split(" ")[0] : ""}: погода, новости, звонки`;
    return h("button", { class: `chat-item assistant-item pinned${S.assistantOpen ? " on" : ""}`, onclick: () => this.open() },
      h("div", { class: "avatar assistant-avatar", html: I.bot }),
      h("div", { class: "mid" },
        h("div", { class: "row" }, h("span", { class: "name" }, "Мой ассистент"), h("span", { class: "time" }, last?.at ? fmtListTime(last.at) : "")),
        h("div", { class: "row" }, h("span", { class: "last" }, prev), h("span", { class: "pin-ico", html: I.pushpin }))));
  },

  open() {
    if (!this.loaded) { this.load(); this.loaded = true; }
    S.current = null; S.assistantOpen = true; S.tasksOpen = false;
    Protect.off();
    app.classList.add("in-chat");
    $("#placeholder")?.remove(); $("#chatView")?.remove();
    const speakBtn = h("button", { class: "icon-btn", title: "Озвучивать ответы", html: this.settings.speak ? I.speaker : I.mute });
    speakBtn.onclick = () => {
      this.settings.speak = !this.settings.speak; this.save();
      speakBtn.innerHTML = this.settings.speak ? I.speaker : I.mute;
      if (!this.settings.speak) Voice2.stop();
      toast(this.settings.speak ? "Ответы будут озвучиваться" : "Озвучка выключена");
    };
    const view = h("section", { class: "chat", id: "chatView" },
      h("div", { class: "topbar" },
        h("button", { class: "icon-btn back-btn", onclick: () => closeChat(), html: I.back }),
        h("div", { class: "avatar sm assistant-avatar", html: I.bot }),
        h("div", { class: "title" }, h("b", null, "Мой ассистент"), h("small", { id: "asstSub" }, "с выходом в интернет")),
        speakBtn,
        h("button", { class: "icon-btn", title: "Настройки", html: I.gear, onclick: () => this.settingsSheet() })),
      h("div", { class: "messages", id: "asstMsgs" }),
      h("div", { class: "asst-chips", id: "asstChips" },
        ["📞 Позвони…", "📹 Видеочат", "✉️ Напиши…", "⏰ Напомни…", "✅ Мои задачи", "☀️ Погода сейчас", "📰 Главные новости", "💵 Курс доллара", "😄 Расскажи анекдот"].map((t) =>
          h("button", { onclick: () => {
            const q = t.replace(/^\S+\s/, "");
            if (q.endsWith("…")) { const inp = $("#asstInput"); inp.value = q.replace("…", " "); inp.focus(); inp.dispatchEvent(new Event("input")); }
            else this.ask(q);
          } }, t))),
      this.composer());
    app.append(view);
    SwipeBack.attach(view, () => closeChat());
    renderChatList();
    this.render(true);
  },

  composer() {
    const ta = h("textarea", { rows: 1, placeholder: "Спросите что-нибудь…", id: "asstInput" });
    const mic = h("button", { class: "send", id: "asstMic", title: "Сказать голосом", html: I.mic });
    const wrap = h("div", { class: "composer" }, ta, mic);
    const update = () => {
      ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
      mic.innerHTML = ta.value.trim() ? I.send : I.mic;
    };
    ta.addEventListener("input", update);
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); go(); } });
    const go = () => { const t = ta.value.trim(); if (!t) return; ta.value = ""; update(); this.ask(t); };
    mic.onclick = () => { if (ta.value.trim()) go(); else this.listen(mic); };
    return wrap;
  },

  render(toBottom) {
    const box = $("#asstMsgs"); if (!box) return;
    box.innerHTML = "";
    if (!this.history.length) {
      box.append(h("div", { class: "asst-hello" },
        h("div", { class: "asst-hello-icon", html: I.bot }),
        h("b", null, `Здравствуйте${S.me?.name ? ", " + S.me.name.split(" ")[0] : ""}!`),
        h("p", null, "Я помогу узнать погоду, свежие новости и курсы валют, отвечу на вопросы. Пишите или нажмите на микрофон и говорите.")));
    }
    for (const m of this.history) {
      const out = m.role === "user";
      const bubble = h("div", { class: "bubble" }, h("div", { class: "text" }, linkify(m.content), h("span", { class: "meta" }, fmtTime(m.at || Date.now()))));
      if (m.card) bubble.append(this.cardEl(m));
      if (!out) bubble.append(h("button", { class: "asst-say", title: "Прочитать вслух", html: I.speaker, onclick: (e) => { e.stopPropagation(); Voice2.speak(m.content, this.settings.voice); } }));
      if (!out && this.mini && S.current && !m.card) bubble.append(h("button", { class: "asst-insert", onclick: (e) => {
        e.stopPropagation(); const inp = $("#input"); if (!inp) return;
        inp.value = (inp.value ? inp.value + "\n" : "") + m.content; inp.dispatchEvent(new Event("input"));
        this.closeMini?.(); inp.focus(); toast("Вставлено — проверьте и отправьте");
      } }, "Вставить в чат"));
      box.append(h("div", { class: `msg ${out ? "out" : "in"} tail first-in-run` }, bubble));
    }
    if (this.busy) box.append(h("div", { class: "msg in tail" }, h("div", { class: "bubble typing" }, h("i"), h("i"), h("i"))));
    $("#asstChips")?.classList.toggle("hidden", this.history.length > 0);
    if (toBottom !== false) box.scrollTop = box.scrollHeight;
  },

  async location() {
    if (this.geo && Date.now() - this.geo.at < 30 * 60e3) return this.geo;
    try {
      const p = await getPosition(6000);
      this.geo = { lat: p.coords.latitude, lon: p.coords.longitude, at: Date.now() };
    } catch { this.geo = null; }
    return this.geo;
  },

  async ask(text, fromVoice = false) {
    if (this.busy) return;
    Voice2.stop();
    this.fromVoice = fromVoice;
    this.history.push({ role: "user", content: text, at: Date.now() });
    { const bare = Maks.strip(text); if (bare) text = bare; }          // «Макс, …» — обращение по имени убираем
    // звонки и сообщения выполняются прямо в приложении, без нейросети
    // в чате: «позвони», «напиши ему …» — без имени, для собеседника открытого чата
    if (this.ctxChat && !this.pending) {
      const cc = this.contextCommand(text);
      if (cc?.call) { this.callTarget(cc.call, cc.video); this.closeMini?.(); return; }
      if (cc?.msg) {
        if (cc.text) this.offer(cc.msg, cc.text.charAt(0).toUpperCase() + cc.text.slice(1));
        else { this.pending = { type: "dictate", target: cc.msg }; this.say(`Что написать? ${cc.msg.kind === "chat" ? "Группа: «" + cc.msg.name + "»" : "Получатель: " + cc.msg.name}. Продиктуйте или напишите текст.`); }
        return;
      }
    }
    try { if (await Maks.command(text)) return; } catch { /* обычный вопрос */ }
    try { if (this.taskCommand(text)) return; } catch { /* обычный вопрос */ }
    try { if (await this.command(text)) return; } catch { /* обычный вопрос */ }
    // простое — отвечаем сразу, без интернета
    const q = this.quick(text);
    if (q) { this.say(this.persona(q)); return; }
    this.busy = true; this.render(); this.save(); this.setSub("думаю…");
    let reply = null;
    // погода и курсы — напрямую из открытых источников (1–2 секунды вместо 10)
    try { reply = await this.direct(text); if (reply) reply = this.persona(reply); } catch { reply = null; }
    if (!reply) {
      let geo = null;
      if (this.isWeather(text) && !/\s(в|во)\s+[А-ЯЁ]/.test(text) && !this.settings.city) geo = await this.location();
      let viaFn = null, fnErr = null;
      try {
        const call = S.sb.functions.invoke("assistant", {
          body: { messages: this.history.slice(-10).map(({ role, content }) => ({ role, content })), lat: geo?.lat, lon: geo?.lon, city: this.settings.city || undefined, name: this.llmName() },
        });
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 35000));
        const { data, error } = await Promise.race([call, timeout]);
        if (error) throw error;
        viaFn = data;
      } catch (e) { fnErr = e; }
      // нейросеть на сервере не ответила (или сервер недоступен) — пробуем напрямую с телефона: у него другой адрес, и ему обычно отвечают
      if (!viaFn || viaFn.source === "data") {
        this.setSub("пробую другой путь…");
        const direct = await this.directLLM(viaFn?.reply && viaFn.source === "data" && !/^Сейчас не получается/.test(viaFn.reply) ? viaFn.reply : "");
        if (direct) reply = direct;
      }
      if (!reply && viaFn && !(viaFn.source === "data" && /^Сейчас не получается связаться/.test(viaFn.reply || ""))) reply = viaFn.reply || null;
      if (!reply) {
        reply = String(fnErr?.message) === "timeout" ? "Сервер долго не отвечает. Спросите ещё раз чуть позже."
          : navigator.onLine === false ? "Нет интернета на телефоне. Проверьте сеть. Команды «позвони маме», «напиши папе», «открой настройки» работают и без сети."
          : "Нейросеть сейчас не отвечает. Команды работают как обычно: «позвони маме», «напиши папе привет», «создай заметку», «открой настройки». Попробуйте задать вопрос ещё раз чуть позже.";
      }
    }
    this.busy = false; this.setSub();
    this.history.push({ role: "assistant", content: reply, at: Date.now() });
    this.save(); this.render();
    this.voice(reply);
  },
  /** Запрос к нейросети напрямую с телефона (запасной путь). Возвращает текст или null. */
  async directLLM(context) {
    const msgs = this.history.slice(-10).map(({ role, content }) => ({ role: role === "assistant" ? "assistant" : "user", content: String(content).slice(0, 2000) }));
    if (!msgs.length) return null;
    const now = new Date().toLocaleString("ru-RU", { dateStyle: "full", timeStyle: "short" });
    const system = `Ты — дружелюбный голосовой помощник семейного мессенджера «Семья». Собеседника зовут ${this.llmName()}. Сейчас ${now}. Отвечай по-русски, коротко (2–5 предложений), без markdown. ` +
      `Ты умеешь звонить, писать сообщения, создавать заметки, группы и каналы, открывать настройки — если просят об этом, попроси назвать имя: «позвони маме», «напиши папе привет». Не говори, что у тебя нет доступа к интернету или телефону.` +
      (context ? `\n\nСвежие данные:\n${context}` : "");
    const tries = [
      () => fetch("https://text.pollinations.ai/openai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "openai", messages: [{ role: "system", content: system }, ...msgs], private: true }) })
        .then(async (r) => { if (!r.ok) throw new Error(r.status); const j = await r.json(); return j.choices?.[0]?.message?.content; }),
      () => fetch("https://text.pollinations.ai/openai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "mistral", messages: [{ role: "system", content: system }, ...msgs], private: true }) })
        .then(async (r) => { if (!r.ok) throw new Error(r.status); const j = await r.json(); return j.choices?.[0]?.message?.content; }),
      () => fetch(`https://text.pollinations.ai/${encodeURIComponent(msgs.at(-1).content.slice(0, 600))}?model=openai&private=true&system=${encodeURIComponent(system.slice(0, 900))}`)
        .then(async (r) => { if (!r.ok) throw new Error(r.status); return r.text(); }),
    ];
    for (const go of tries) {
      try {
        const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 14000);
        let txt; try { txt = await Promise.race([go(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 14000))]); } finally { clearTimeout(timer); }
        txt = String(txt || "").trim().replace(/\*\*/g, "").replace(/^#+\s*/gm, "");
        if (txt && !/^\s*[{<]/.test(txt)) return txt;
      } catch { /* следующий способ */ }
    }
    return null;
  },
  llmName() {
    const p = this.preset(), n = S.me?.name || "друг";
    if (!p.style) return n;
    return `${n}. Ты играешь роль персонажа «${p.name}»: ${p.style}${p.address ? `; обращайся к собеседнику «${p.address}»` : ""}`;
  },
  setSub(t) { const el = $("#asstSub"); if (el) el.textContent = t || "с выходом в интернет"; },
  // озвучить ответ; в разговорном режиме после ответа снова слушаем
  voice(text) {
    const again = this.fromVoice && this.settings.handsfree && !this.pending?.noListen;
    const visible = S.assistantOpen || this.mini;
    const relisten = () => { if (again && visible && (S.assistantOpen || this.mini) && !this.busy) { const mic = $("#asstMic") || $("#chatView .composer .send"); if (mic && !$("#asstInput")?.value.trim()) this.listen(mic, true); } };
    if (this.settings.speak && visible) Voice2.speak(text, this.settings.voice, relisten);
    else relisten();
  },
  listen(btn, auto = false) {
    Voice2.stop();
    if (this.listening) return;
    this.listening = true;
    const done = (text) => {
      this.listening = false;
      btn.classList.remove("listening"); this.setSub();
      if (text) this.ask(text, true);
    };
    btn.classList.add("listening"); $("#asstSub") && ($("#asstSub").textContent = "слушаю…");
    if (window.AndroidBridge?.listen) {
      window.onSpeechResult = (text, err) => {
        window.onSpeechResult = null;
        if (!text && err && !(auto && err === "no_match")) toast(err === "no_match" ? "Не расслышал, попробуйте ещё раз" : err === "permission" ? "Нет доступа к микрофону" : "Распознавание речи недоступно");
        done(text);
      };
      window.AndroidBridge.listen();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { done(null); toast("Голосовой ввод не поддерживается в этом браузере — напишите вопрос"); return; }
    const r = new SR(); r.lang = "ru-RU"; r.interimResults = false; r.maxAlternatives = 1;
    let got = null;
    r.onresult = (e) => { got = e.results[0][0].transcript; };
    r.onerror = (e) => { if (e.error !== "no-speech") toast("Не удалось распознать речь"); };
    r.onend = () => done(got);
    try { r.start(); } catch { done(null); }
  },

  settingsSheet() {
    let close;
    const city = h("input", { value: this.settings.city || "", placeholder: "например, Казань (пусто — по геолокации)" });
    const grid = h("div", { class: "voice-grid" }, VOICES.map((v) => h("button", { class: `voice-card${this.settings.voice === v.id ? " on" : ""}`, "data-voice": v.id, onclick: (e) => {
      this.settings.voice = v.id; this.save();
      grid.querySelectorAll(".voice-card").forEach((b) => b.classList.toggle("on", b === e.currentTarget));
      Voice2.speak(v.hello || (v.gender === "male" ? "Здравствуйте! Я буду говорить мужским голосом." : "Здравствуйте! Я буду говорить женским голосом."), v.id);
    } }, h("span", { class: "vc-ico" }, v.icon), h("b", null, v.name), h("small", null, v.desc))));
    close = sheet([
      h("h3", null, "Настройки ассистента"),
      h("div", { class: "section-title", style: { padding: "4px 4px 6px" } }, "Голос и характер"),
      grid,
      h("p", { class: "sheet-note" }, "Персонаж меняет высоту и скорость голоса и манеру ответов. Настоящие голоса актёров из фильмов защищены — их копировать нельзя, поэтому «Джарвис» здесь — похожий по характеру дворецкий."),
      window.AndroidBridge?.listVoices ? h("button", { class: "menu-item", onclick: () => this.voicePicker() }, h("span", { html: I.mic }),
        h("span", null, "Голос телефона", h("small", { class: "sub" }, this.settings.sysVoice?.name ? this.settings.sysVoice.label || this.settings.sysVoice.name : "выбирается автоматически"))) : null,
      window.AndroidBridge?.openStore ? h("button", { class: "menu-item", onclick: () => this.downloadVoices() }, h("span", { html: I.download }), "Скачать новые голоса из интернета") : null,
      h("label", { class: "toggle-row" }, h("input", { type: "checkbox", checked: this.settings.speak, onchange: (e) => { this.settings.speak = e.target.checked; this.save(); } }), "Озвучивать ответы"),
      h("label", { class: "toggle-row" }, h("input", { type: "checkbox", checked: !!this.settings.wake, onchange: (e) => { Maks.setWake(e.target.checked); if (e.target.checked) toast("Скажите: «Макс, открой настройки». Работает, пока приложение открыто"); } }), h("span", null, "Отзываться на имя «Макс»", h("small", null, "Микрофон слушает только пока приложение открыто. Сверху виден значок «Макс»"))),
      h("label", { class: "toggle-row" }, h("input", { type: "checkbox", checked: MaksPlus.enabled(), onchange: (e) => Prefs.set("maks_remind", e.target.checked) }), h("span", null, "Напоминать о пропущенном", h("small", null, "О пропущенных звонках и непрочитанных сообщениях, пока приложение открыто"))),
      window.AndroidBridge?.agentOverlay ? h("label", { class: "toggle-row" }, h("input", { type: "checkbox", id: "agentBubble", checked: window.AndroidBridge.agentOverlayState?.() !== "off", onchange: (e) => {
        const r = window.AndroidBridge.agentOverlay(e.target.checked);
        if (r === "permission") toast("Разрешите «Поверх других приложений» для «Семьи», затем вернитесь");
        else toast(e.target.checked ? "Кнопка ассистента появится поверх других приложений" : "Кнопка убрана");
      } }), h("span", null, "Кнопка ассистента поверх приложений", h("small", null, "Плавающий круг: нажмите — ассистент слушает. Также есть ярлык на значке и плитка в шторке"))) : null,
      window.AndroidBridge?.wakeBg ? h("label", { class: "toggle-row" }, h("input", { type: "checkbox", id: "wakeBg", checked: window.AndroidBridge.wakeBgState?.() === "on", onchange: (e) => {
        const r = window.AndroidBridge.wakeBg(e.target.checked);
        if (r === "mic") { toast("Разрешите микрофон и включите ещё раз"); e.target.checked = false; }
        else if (r === "permission") toast("Разрешите «Поверх других приложений» для «Семьи», затем вернитесь");
        else toast(e.target.checked ? "Скажите «Макс…» — даже когда приложение закрыто" : "Фоновое слушание выключено");
      } }), h("span", null, "Голос «Макс» при закрытом приложении", h("small", null, "Включайте, когда «Семья» открыта. После перезагрузки телефона откройте приложение один раз. Расходует батарею; в звонке не слушает"))) : null,
      h("button", { class: "menu-item", onclick: () => { close?.(); MaksPlus.memorySheet(); } }, h("span", null, "🧠"), "Что помнит Макс"),
      h("button", { class: "menu-item", onclick: () => { close?.(); MaksPlus.notesSheet(); } }, h("span", null, "📝"), "Заметки"),
      h("label", { class: "toggle-row" }, h("input", { type: "checkbox", checked: this.settings.handsfree, onchange: (e) => { this.settings.handsfree = e.target.checked; this.save(); } }), "Разговор голосом: после ответа снова слушать"),
      h("div", { class: "section-title", style: { padding: "10px 4px 6px" } }, "Чей голос использовать"),
      h("div", { class: "segmented" }, ...[["auto", "Авто"], ["device", "Телефона"], ["online", "Интернет"]].map(([v, l]) =>
        h("button", { class: `seg${(this.settings.voiceEngine || "auto") === v ? " on" : ""}`, onclick: (e) => {
          this.settings.voiceEngine = v; this.save(); Voice2.native = null; Voice2.slow = 0;
          e.target.parentNode.querySelectorAll(".seg").forEach((b) => b.classList.toggle("on", b === e.target));
        } }, l))),
      h("div", { class: "section-title", style: { padding: "10px 4px 2px" } }, "Тембр и скорость речи"),
      ...[["pitchAdj", "Тембр", "ниже", "выше"], ["rateAdj", "Скорость", "медленнее", "быстрее"]].map(([key, name, lo, hi]) => {
        const val = h("b", null, "");
        const show = () => { val.textContent = Math.round((+this.settings[key] || 1) * 100) + "%"; };
        const inp = h("input", { type: "range", min: "60", max: "160", step: "5", value: String(Math.round((+this.settings[key] || 1) * 100)), class: "voice-slider",
          oninput: (e) => { this.settings[key] = +e.target.value / 100; show(); },
          onchange: () => { this.save(); Voice2.speak("Так я буду говорить.", this.settings.voice); } });
        show();
        return h("label", { class: "slider-row" }, h("span", { class: "slider-top" }, h("span", null, name), val), inp, h("span", { class: "slider-ends" }, h("small", null, lo), h("small", null, hi)));
      }),
      h("button", { class: "menu-item", onclick: () => { this.settings.pitchAdj = 1; this.settings.rateAdj = 1; this.save(); document.querySelectorAll(".voice-slider").forEach((s) => { s.value = "100"; s.closest(".slider-row").querySelector("b").textContent = "100%"; }); Voice2.speak("Голос по умолчанию.", this.settings.voice); } }, h("span", { html: I.close }), "Сбросить тембр и скорость"),
      h("button", { class: "menu-item", onclick: () => { window.AndroidBridge?.resetVoice?.(); Voice2.native = null; Voice2.slow = 0; Voice2.speak("Проверка голоса. Так я буду отвечать.", this.settings.voice); } }, h("span", { html: I.speaker }), "Проверить голос"),
      h("label", { class: "field", style: { marginTop: "10px" } }, h("span", null, "Город для погоды"), city),
      h("button", { class: "btn wide", onclick: () => { this.settings.city = city.value.trim(); this.save(); close(); toast("Сохранено"); } }, "Сохранить"),
      h("button", { class: "menu-item danger", style: { marginTop: "8px" }, onclick: () => { this.history = []; this.save(); this.render(); close(); } }, h("span", { html: I.trash }), "Очистить переписку с ассистентом"),
    ]);
  },
};

// ───────────── Команды: «позвони маме», «напиши папе что…» ─────────────
Object.assign(Assistant, {
  pending: null,     // { type: "dictate" | "confirm", target, text, msgIndex }

  say(text, extra = {}) {
    const m = { role: "assistant", content: text, at: Date.now(), ...extra };
    this.history.push(m); this.save(); this.render();
    this.voice(text);
    return m;
  },

  norm(w) { return String(w).toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/g, ""); },
  stem(w) {
    w = this.norm(w);
    if (w.length <= 3) return w;
    return w.replace(/(ами|ями|ого|ему|ому|ыми|ими|ой|ей|ом|ем|ам|ям|ах|ях|ою|ею|у|ю|е|и|ы|а|я|ь)$/, "") || w;
  },
  same(a, b) {
    const x = this.stem(a), y = this.stem(b);
    if (x.length < 2 || y.length < 2) return false;
    return x === y || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x)));
  },
  targets() {
    const list = [];
    for (const p of S.profiles.values()) if (p.id !== S.me.id && !p.banned) list.push({ kind: "user", id: p.id, name: p.name, words: p.name.split(/\s+/) });
    for (const c of S.chats) if (c.is_group) {
      const words = (c.title || "Группа").split(/\s+/);
      list.push({ kind: "chat", id: c.id, name: c.title || "Группа", words });
      if (c.id === FAMILY_CHAT) for (const alias of [["семейный", "чат"], ["общий", "чат"], ["общую", "группу"], ["всем"], ["всех"]])
        list.push({ kind: "chat", id: c.id, name: c.title || "Семья", words: alias });
    }
    return list;
  },
  // ищем адресата в начале фразы: «маме», «тёте Свете», «в группу Семья»
  findTarget(words, groupOnly) {
    let best = null;
    for (const t of this.targets()) {
      if (groupOnly && t.kind !== "chat") continue;
      for (let k = Math.min(3, words.length); k >= 1; k--) {
        const part = words.slice(0, k);
        // все слова фразы должны совпасть со словами имени (по порядку), либо одно слово — с любым словом имени
        const ok = k === 1 ? t.words.some((w) => this.same(part[0], w)) : part.every((w, i) => t.words[i] && this.same(w, t.words[i]));
        if (ok && (!best || k > best.used)) best = { ...t, used: k };
        if (ok) break;
      }
    }
    return best;
  },

  async command(raw) {
    let text = raw.trim().replace(/[.!]+$/, "").replace(/(^|\s)(пожалуйста|срочно|быстро)(?=[\s,]|$),?/gi, " ").replace(/\s+/g, " ").trim();
    // «ну давай позвони», «можешь написать маме», «мне нужно позвонить папе», «хочу набрать Свету» → простая команда
    if (!this.pending) {
      text = text.replace(/^(?:(?:ну|а|так|слушай|давай|ладно|эй|окей|ок)[,\s]+)+/i, "").replace(/^(?:ты\s+)?(?:можешь|мог бы|смог бы|сможешь|умеешь)(?:\s+ли\s+ты)?\s+/i, "")
        .replace(/^(?:мне\s+(?:надо|нужно)|я\s+хочу|хочу|надо|нужно|помоги(?:\s+мне)?|мне\s+бы)\s+/i, "")
        .replace(/^(?:давай\s+)?позвоним\s+/i, "позвони ").replace(/^(?:дозвонись|свяжись)\s+(?:до|с|со)\s+/i, "позвони ").replace(/^(?:пошли|черкни|набросай)\s+/i, "напиши ")
        .replace(/^(?:набери|напиши)\s+сообщение\s+/i, "напиши ").replace(/^отправь\s+(?:смс|сообщение)\s+(?:для\s+|на\s+)?/i, "напиши ").replace(/^отправь\s+(?:ей|ему|им)\s+/i, "напиши ").trim();
    }
    const low = text.toLowerCase().replace(/ё/g, "е");
    const p = this.pending;

    // ответ на «Отправить?» или текст под диктовку
    if (p?.type === "confirm") {
      if (/^(да|ага|угу|верно|ок|окей|давай|конечно|отправ|подтвержда)/.test(low)) { await this.sendPending(); return true; }
      if (/^(нет|не надо|отмен|стоп|не отправ)/.test(low)) { this.cancelPending(); return true; }
      if (/^(измени|исправ|по-другому|заново|перепиш)/.test(low)) {
        this.markCard("cancelled"); this.pending = { type: "dictate", target: p.target };
        this.say("Хорошо, продиктуйте новый текст."); return true;
      }
      // любая другая фраза — новый вариант текста
      this.markCard("cancelled"); this.offer(p.target, text); return true;
    }
    if (p?.type === "dictate") {
      if (/^(отмен|не надо|стоп)/.test(low)) { this.pending = null; this.say("Отменил."); return true; }
      this.offer(p.target, text); return true;
    }

    // групповой видеочат: «начни видеочат», «видеочат в группе Семья», «групповой звонок с семьёй»
    const gm = text.match(/^(?:пожалуйста[,\s]+)?(?:(?:начни|начать|запусти|собери|устрой|открой|сделай|создай)\s+)?(?:групповой\s+видео\s*звонок|групповой\s+звонок|групповую\s+видеосвязь|видео\s*чат|видео\s*конференци\S*|конференци\S*)(?:\s+(.*))?$/i);
    if (gm) {
      const video = !/^(?:\S+\s+)?групповой\s+звонок/i.test(text.replace(/^пожалуйста[,\s]+/i, ""));
      const rest = (gm[1] || "").replace(/^(?:в|во|для|с|со)\s+/i, "").replace(/^(?:группе|группу|группы|чате|чат|беседе)\s*/i, "").trim();
      let t = null;
      if (rest) {
        t = this.findTarget(rest.split(/\s+/).filter(Boolean), true) || this.findTarget(rest.split(/\s+/).filter(Boolean), false);
        if (!t) { this.notFound(rest, true); return true; }
      } else {
        const cur = S.chats.find((c) => c.id === S.current && c.is_group);
        const fam = S.chats.find((c) => c.id === FAMILY_CHAT);
        t = cur ? { kind: "chat", id: cur.id, name: chatTitle(cur) } : fam ? { kind: "chat", id: FAMILY_CHAT, name: chatTitle(fam) } : null;
        if (!t) { this.say("Скажите, кому позвонить: например, «позвони маме» или «видеозвонок в группу Друзья»."); return true; }
      }
      return this.callTarget(t, video);
    }

    // звонок
    let m = text.match(/^(?:пожалуйста[,\s]+)?(позвони(?:ть)?|набери|звони|вызови|сделай\s+(?:видео)?звонок|видеозвонок|видео\s*звонок|аудиозвонок)\s+(.*)$/i);
    if (m) {
      const video = /видео/i.test(text);
      let rest = m[2].replace(/^(?:мне\s+)?(?:по\s+видео(?:связи)?\s+|по\s+телефону\s+)?/i, "").replace(/^(к|с|на)\s+/i, "");
      const g = rest.match(/^(?:в\s+)?(?:группу|группе|чат|чате|беседу)\s+(.*)$/i);
      if (g) rest = g[1];
      const t = this.findTarget(rest.split(/\s+/).filter(Boolean), !!g);
      if (!t) { this.notFound(rest, !!g); return true; }
      return this.callTarget(t, video);
    }

    // сообщение
    m = text.match(/^(?:пожалуйста[,\s]+)?(напиши|написать|отправь|отправить|сообщи|передай|скажи)\s+(.*)$/i);
    if (m) {
      let rest = m[2].replace(/^(сообщение|смс|sms)\s+/i, "");
      let groupOnly = false;
      const g = rest.match(/^(?:в\s+)?(?:группу|группе|чат|чате|беседу)\s+(.*)$/i);
      if (g) { rest = g[1]; groupOnly = true; }
      const words = rest.split(/\s+/).filter(Boolean);
      const t = this.findTarget(words.map((w) => w.replace(/[,:—-]+$/, "")), groupOnly);
      // «напиши стих», «скажи, который час» — это не сообщение человеку, а вопрос ассистенту
      if (!t) { if (groupOnly) { this.notFound(words[0] || "", true); return true; } return false; }
      let body = words.slice(t.used).join(" ").replace(/^[,:—-]+\s*/, "").replace(/^(?:(?:что|чтобы|текст|сообщение)\s+)+/i, "").trim();
      if (!body) {
        this.pending = { type: "dictate", target: t };
        this.say(`Что написать? ${t.kind === "chat" ? "Группа: «" + t.name + "»" : "Получатель: " + t.name}. Продиктуйте или напишите текст.`);
        return true;
      }
      body = body.charAt(0).toUpperCase() + body.slice(1);
      this.offer(t, body);
      return true;
    }
    return false;
  },

  offer(target, text) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
    this.pending = { type: "confirm", target, text };
    const to = target.kind === "chat" ? `Группа: «${target.name}»` : `Получатель: ${target.name}`;
    this.say(`${to}. Текст: «${text}». Отправить? Скажите «да», «нет» или «измени».`,
      { card: { kind: target.kind, id: target.id, name: target.name, text, state: "pending" } });
  },
  markCard(state) {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const c = this.history[i].card;
      if (c && c.state === "pending") { c.state = state; break; }
    }
    this.save();
  },
  cancelPending() { this.markCard("cancelled"); this.pending = null; this.say("Не отправляю."); },
  async sendPending() {
    const p = this.pending; if (!p) return;
    this.pending = null;
    let chatId = p.target.id;
    try {
      if (p.target.kind === "user") {
        const { data, error } = await S.sb.rpc("get_or_create_dm", { other: p.target.id });
        if (error || !data) throw error || new Error("dm");
        chatId = data;
        if (!S.chats.find((c) => c.id === chatId)) { await loadChats(); renderChatList(); }
      }
      const res = await postMessage({ body: p.text.slice(0, 8000) }, chatId);
      if (!res) throw new Error("send");
      this.markCard("sent");
      this.say(`Отправлено ✓ ${p.target.kind === "chat" ? "Группа: «" + p.target.name + "»" : "Получатель: " + p.target.name}.`);
    } catch {
      this.markCard("cancelled");
      this.say("Не получилось отправить. Проверьте интернет и попробуйте ещё раз.");
    }
  },
  callTarget(t, video) {
    if (Calls.pc || Calls.ui || GroupCall.active) { this.say("Сейчас уже идёт звонок."); return true; }
    if (t.kind === "chat") {
      this.say(`${video ? "Начинаю видеочат" : "Начинаю групповой звонок"}: «${t.name}». Зову всех участников…`);
      setTimeout(() => GroupCall.start(t.id, video), 900);
      return true;
    }
    this.say(`${video ? "Видеозвонок" : "Звоню"}: ${t.name}…`);
    setTimeout(() => Calls.start(t.id, video), 900);
    return true;
  },
  notFound(what, group) {
    if (group) {
      const groups = [...new Set(this.targets().filter((t) => t.kind === "chat").map((t) => t.name))];
      this.say(`Не нашёл группу «${what}». Ваши группы: ${groups.join(", ") || "нет"}.`);
      return;
    }
    const names = this.targets().filter((t) => t.kind === "user").map((t) => t.name).slice(0, 8);
    this.say(`Не нашёл «${what}» среди участников.${names.length ? " В семье есть: " + names.join(", ") + "." : ""}`);
  },
  cardEl(m) {
    const c = m.card;
    const box = h("div", { class: `asst-card${c.state !== "pending" ? " done" : ""}` },
      h("div", { class: "who-to" }, c.kind === "chat" ? "👥" : "👤", c.kind === "chat" ? `в «${c.name}»` : c.name),
      h("div", { class: "draft" }, c.text));
    const last = this.history.filter((x) => x.card).at(-1) === m;
    if (c.state === "pending" && last && this.pending?.type === "confirm") {
      box.append(h("div", { class: "row" },
        h("button", { class: "btn", onclick: (e) => { e.stopPropagation(); this.history.push({ role: "user", content: "Отправить", at: Date.now() }); this.sendPending(); } }, "Отправить"),
        h("button", { class: "btn ghost", onclick: (e) => { e.stopPropagation(); const inp = $("#asstInput"); inp.value = c.text; inp.focus(); inp.dispatchEvent(new Event("input")); this.markCard("cancelled"); this.pending = { type: "dictate", target: { kind: c.kind, id: c.id, name: c.name } }; this.render(); } }, "Изменить"),
        h("button", { class: "btn ghost", onclick: (e) => { e.stopPropagation(); this.cancelPending(); } }, "Отмена")));
    } else {
      box.append(h("small", { style: { color: "var(--muted)" } }, c.state === "sent" ? "✓ Отправлено" : c.state === "cancelled" ? "Отменено" : ""));
    }
    return box;
  },
});

// ───────────── Озвучка ─────────────
const Voice2 = {
  // Порядок: голос телефона (Android) → голос браузера → голос из интернета.
  // Если голос телефона не отвечает или в нём нет русского языка — сразу переходим к запасному.
  native: null,          // null — ещё не знаем, true — работает, false — не работает на этом устройстве
  slow: 0, cur: "", gender: "female", onEnd: null, audio: null, queue: [],
  clean(text) { return String(text || "").replace(/https?:\/\/\S+/g, "").replace(/[*_#>`]/g, "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").slice(0, 1500).trim(); },
  mode() { return Assistant.settings.voiceEngine || "auto"; },
  speak(text, voiceId, onEnd) {
    const t = this.clean(text);
    this.stop();
    this.onEnd = onEnd || null;
    if (!t) { this.finish(); return; }
    const base = Assistant.preset(voiceId), clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const pa = clamp(+Assistant.settings.pitchAdj || 1, 0.6, 1.6), ra = clamp(+Assistant.settings.rateAdj || 1, 0.6, 1.6);     // ползунки «Тембр» и «Скорость»
    const pr = { ...base, pitch: clamp((base.pitch || 1) * pa, 0.4, 2.2), rate: clamp((base.rate || 1) * ra, 0.5, 2) };
    const gender = pr.gender;
    this.cur = t; this.gender = gender; this.pr = pr;
    const m = this.mode();
    if (m !== "online" && window.AndroidBridge?.speak && this.native !== false) {
      this.waiting = true;
      const sys = Assistant.settings.sysVoice || {};
      if (window.AndroidBridge.speak2) window.AndroidBridge.speak2(t, gender, pr.pitch || 1, pr.rate || 1, sys.name || "", sys.engine || "");
      else window.AndroidBridge.speak(t, gender);
      clearTimeout(this.fb);
      // голос телефона должен начать говорить за несколько секунд (первый раз — дольше: движок запускается)
      this.fb = setTimeout(() => {
        if (!this.waiting) return;
        this.waiting = false;
        if (++this.slow >= 2) this.native = false;
        try { window.AndroidBridge.stopSpeaking(); } catch { /* */ }
        if (m === "auto") this.online(t); else this.finish();
      }, this.native ? 3000 : 6500);
      return;
    }
    if (m !== "online" && this.browserVoice(t, gender)) return;
    if (m === "device" && !window.AndroidBridge?.speak) { this.online(t); return; }
    this.online(t);
  },
  // события от Android: start / done / fail
  onState(state, reason) {
    if (state === "start") { this.waiting = false; clearTimeout(this.fb); this.native = true; this.slow = 0; return; }
    if (state === "done") { this.finish(); return; }
    if (state === "fail") {
      const was = this.waiting; this.waiting = false; clearTimeout(this.fb);
      if (reason === "engine" || reason === "nolang") {
        this.native = false;
        if (reason === "nolang" && !this.hinted) { this.hinted = true; this.reason = reason;
          toast("В телефоне нет русского голоса — говорю голосом из интернета. Скачать голос: Ассистент → Настройки", 5000); }
      }
      if ((was || reason === "engine" || reason === "nolang") && this.cur && this.mode() !== "device") this.online(this.cur);
      else this.finish();
    }
  },
  browserVoice(t, gender) {
    const ss = window.speechSynthesis; if (!ss || window.AndroidBridge) return false;
    const v = this.pickVoice(gender);
    if (!v && !(ss.getVoices() || []).length) return false;
    try {
      ss.cancel();
      const u = new SpeechSynthesisUtterance(t); u.lang = "ru-RU";
      if (v) u.voice = v;
      const pr = this.pr || {};
      u.pitch = Math.max(0.1, Math.min(2, (v && this.isGender(v, gender) ? 1 : (gender === "male" ? 0.7 : 1.15)) * (pr.pitch || 1)));
      u.rate = pr.rate || 1;
      u.onend = () => this.finish();
      u.onerror = (e) => { if (e.error !== "interrupted" && e.error !== "canceled") this.online(t); };
      ss.speak(u);
      return true;
    } catch { return false; }
  },
  // голос из интернета: короткими фразами до 180 символов
  online(t) {
    const parts = [];
    for (const sent of t.replace(/\n+/g, ". ").split(/(?<=[.!?;:])\s+/)) {
      let x = sent.trim();
      while (x.length > 180) { const cut = x.lastIndexOf(" ", 180) > 60 ? x.lastIndexOf(" ", 180) : 180; parts.push(x.slice(0, cut)); x = x.slice(cut).trim(); }
      if (x) parts.push(x);
    }
    this.queue = parts; this.playNext();
  },
  playNext() {
    const q = this.queue.shift();
    if (!q) { this.finish(); return; }
    const url = (CFG.ttsUrl || "https://translate.google.com/translate_tts?ie=UTF-8&tl=ru&client=tw-ob&q=") + encodeURIComponent(q);
    const a = new Audio(url);
    // голос из интернета один (женский) — характер передаём высотой и скоростью
    const pr = this.pr || {};
    const k = Math.max(0.6, Math.min(1.6, (this.gender === "male" ? 0.86 : 1) * (pr.pitch || 1) * Math.sqrt(pr.rate || 1)));
    if (Math.abs(k - 1) > 0.02) { a.preservesPitch = false; a.mozPreservesPitch = false; a.webkitPreservesPitch = false; a.playbackRate = k; }
    this.audio = a;
    a.onended = () => { if (this.audio === a) this.playNext(); };
    a.onerror = () => {
      if (this.audio !== a) return;
      this.queue = []; this.audio = null;
      if (!this.netWarned) { this.netWarned = true; toast("Не получилось озвучить ответ: нет связи с сервером голоса", 4000); }
      this.finish();
    };
    a.play().catch(() => { if (this.audio === a) a.onerror(); });
  },
  finish() { const f = this.onEnd; this.onEnd = null; if (f) setTimeout(f, 250); },
  stop() {
    this.waiting = false; clearTimeout(this.fb); this.queue = []; this.onEnd = null;
    if (this.audio) { try { this.audio.pause(); } catch { /* */ } this.audio = null; }
    if (window.AndroidBridge?.stopSpeaking) window.AndroidBridge.stopSpeaking();
    try { window.speechSynthesis?.cancel(); } catch { /* */ }
  },
  isGender(v, g) {
    const n = v.name.toLowerCase();
    const male = /(male|муж|pavel|павел|dmitr|дмитр|yuri|юри|maxim|макс|ruslan|руслан|artem|артём|\bnikolai)/.test(n) && !/female/.test(n);
    const female = /(female|жен|irina|ирин|svetlana|светлан|milena|милен|alena|алён|elena|елен|anna|анна|google русский|katya|daria|dariya)/.test(n);
    return g === "male" ? male : female;
  },
  pickVoice(g) {
    const vs = (window.speechSynthesis?.getVoices() || []).filter((v) => /^ru/i.test(v.lang));
    return vs.find((v) => this.isGender(v, g)) || vs[0] || null;
  },
};
window.onTtsState = (st, reason) => Voice2.onState(st, reason);
try { window.speechSynthesis?.getVoices(); window.speechSynthesis && (window.speechSynthesis.onvoiceschanged = () => {}); } catch { /* */ }

// ───────────── Быстрые ответы без нейросети ─────────────
Object.assign(Assistant, {
  isWeather(t) { return /погод|температур|градус|дожд|снег|ветер|прогноз|холодно|тепло|зонт|одеться/i.test(t); },

  quick(text) {
    const t = text.toLowerCase().replace(/ё/g, "е").replace(/[?!.,]+/g, " ").replace(/\s+/g, " ").trim();
    const name = S.me?.name ? S.me.name.split(" ")[0] : "";
    const now = new Date();
    if (/^(привет|здравствуй|здравствуйте|добрый (день|вечер)|доброе утро|доброй ночи|хай|салам)( ассистент| джарвис| макс)?$/.test(t))
      return `Здравствуйте${name ? ", " + name : ""}! Чем помочь? Могу подсказать погоду, новости, курс валют, позвонить или написать кому-то из семьи.`;
    if (/(который|сколько) (сейчас )?(час|времени)|^время$|точное время|сколько время/.test(t))
      return `Сейчас ${now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}.`;
    if (/(какое|какая) (сегодня )?(число|дата)|какой (сегодня )?день( недели)?|сегодня какое число|какой сегодня день/.test(t))
      return `Сегодня ${now.toLocaleDateString("ru-RU", { weekday: "long" })}, ${now.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} ${now.getFullYear()} года.`;
    if (/^(спасибо|благодарю|спс|супер спасибо|большое спасибо)/.test(t)) return "Пожалуйста! Обращайтесь.";
    if (/^(как (у тебя )?дела|как ты|как жизнь)$/.test(t)) return "Всё отлично, готов помогать! Спросите о погоде, новостях или попросите позвонить кому-нибудь.";
    if (/^(что ты умеешь|кто ты|что умеешь|помощь|помоги|что ты можешь)$/.test(t))
      return "Я Макс, ваш помощник. Я умею: рассказать погоду и прогноз, свежие новости, курс доллара и евро, ответить на вопросы. А ещё — позвонить («Позвони маме»), начать видеочат («Видеочат с группой Друзья») отправить сообщение под диктовку («Напиши папе, что я задержусь»), вести список задач и напоминать («Напомни завтра в 9 позвонить бабушке», «Поручи маме купить хлеб», «Мои задачи»).";
    // арифметика: «сколько будет 25 умножить на 4», «посчитай 120/3»
    const m = t.match(/^(?:сколько будет|посчитай|вычисли|реши)?\s*(-?\d+(?:[.,]\d+)?)\s*(\+|плюс|-|минус|\*|×|x|х|умножить на|умноженное на|\/|:|разделить на|делить на|поделить на)\s*(-?\d+(?:[.,]\d+)?)$/);
    if (m && (/^(сколько будет|посчитай|вычисли|реши)/.test(t) || /[+\-*/×:]/.test(m[2]))) {
      const a = parseFloat(m[1].replace(",", ".")), b = parseFloat(m[3].replace(",", "."));
      const op = m[2];
      let r;
      if (/\+|плюс/.test(op)) r = a + b;
      else if (/^-$|минус/.test(op)) r = a - b;
      else if (/\*|×|x|х|умнож/.test(op)) r = a * b;
      else { if (b === 0) return "На ноль делить нельзя."; r = a / b; }
      return `${m[1]} ${op} ${m[3]} = ${String(Math.round(r * 1e6) / 1e6).replace(".", ",")}`;
    }
    return null;
  },

  async getJSON(url, ms = 6000) {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); }
    finally { clearTimeout(tm); }
  },

  // Погода и курсы — сразу из открытых источников, без ожидания нейросети
  async direct(text) {
    const low = text.toLowerCase();
    if (text.length > 90) return null;
    if (this.isWeather(text) && !/новост|курс/.test(low)) return this.weatherNow(text);
    if (/(курс|доллар|евро|юан|валют)/.test(low) && !/новост|погод/.test(low)) return this.rates(low);
    return null;
  },

  async weatherNow(text) {
    const WMO = { 0: "ясно", 1: "в основном ясно", 2: "переменная облачность", 3: "пасмурно", 45: "туман", 48: "изморозь", 51: "лёгкая морось", 53: "морось", 55: "сильная морось",
      61: "небольшой дождь", 63: "дождь", 65: "сильный дождь", 66: "ледяной дождь", 67: "ледяной дождь", 71: "небольшой снег", 73: "снег", 75: "сильный снег", 77: "снежная крупа",
      80: "ливень", 81: "ливни", 82: "сильные ливни", 85: "снегопад", 86: "сильный снегопад", 95: "гроза", 96: "гроза с градом", 99: "сильная гроза с градом" };
    const cm = text.match(/(?:^|[\s,])(?:в|во)\s+([А-ЯЁA-Z][а-яёa-z-]+(?:[\s-]+[А-ЯЁ][а-яё-]+)?)/);
    let city = cm ? cm[1] : (this.settings.city || null), lat, lon, place = "";
    if (city) {
      for (const q of [city, city.replace(/(е|и|у|ю|ом|ой)$/i, "")]) {
        const g = await this.getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=ru`).catch(() => null);
        if (g?.results?.length) { lat = g.results[0].latitude; lon = g.results[0].longitude; place = g.results[0].name; break; }
      }
      if (lat == null) return null;
    } else {
      const geo = await this.location();
      if (!geo) return null;
      lat = geo.lat; lon = geo.lon;
    }
    const w = await this.getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3&wind_speed_unit=ms`);
    const c = w.current, d = w.daily;
    const deg = (x) => `${Math.round(x) > 0 ? "+" : ""}${Math.round(x)}°`;
    const day = (i, n) => `${n} ${WMO[d.weather_code[i]] || ""}, от ${deg(d.temperature_2m_min[i])} до ${deg(d.temperature_2m_max[i])}${d.precipitation_probability_max[i] >= 40 ? `, осадки ${d.precipitation_probability_max[i]}%` : ""}.`;
    const where = place ? ` в городе ${place}` : "";
    if (/послезавтра/i.test(text)) return day(2, `Послезавтра${where}:`);
    if (/завтра/i.test(text)) return day(1, `Завтра${where}:`);
    const umb = d.precipitation_probability_max[0] >= 50 ? " Возьмите зонт." : "";
    return `Сейчас${where} ${deg(c.temperature_2m)}, ощущается как ${deg(c.apparent_temperature)}, ${WMO[c.weather_code] || ""}, ветер ${Math.round(c.wind_speed_10m)} м/с. ${day(0, "Сегодня")}${umb}`;
  },

  async rates(low) {
    const j = await this.getJSON("https://www.cbr-xml-daily.ru/daily_json.js");
    const v = j.Valute;
    const f = (k, n) => v[k] ? `${n} ${v[k].Value.toFixed(2).replace(".", ",")} ₽ (${v[k].Value >= v[k].Previous ? "+" : "−"}${Math.abs(v[k].Value - v[k].Previous).toFixed(2).replace(".", ",")})` : "";
    const want = [];
    if (/доллар|usd/.test(low)) want.push(["USD", "доллар"]);
    if (/евро|eur/.test(low)) want.push(["EUR", "евро"]);
    if (/юан|cny/.test(low)) want.push(["CNY", "юань"]);
    const list = want.length ? want : [["USD", "доллар"], ["EUR", "евро"], ["CNY", "юань"]];
    return `Курс ЦБ на ${new Date(j.Date).toLocaleDateString("ru-RU")}: ` + list.map(([k, n]) => f(k, n)).filter(Boolean).join(", ") + ".";
  },
});

// ───────────── Ассистент прямо в чате, голоса телефона, скачивание голосов ─────────────
Object.assign(Assistant, {
  // Кнопка рядом с микрофоном в любой переписке: ассистент открывается поверх чата.
  // «Позвони», «напиши ему…», «видеозвонок» без имени относятся к собеседнику открытого чата.
  openMini(opts) {
    if (!this.loaded) { this.load(); this.loaded = true; }
    const chatId = S.current;
    const c = S.chats.find((x) => x.id === chatId);
    this.mini = true; this.ctxChat = c || null;
    const msgs = h("div", { class: "messages asst-mini-msgs", id: "asstMsgs" });
    const ta = h("textarea", { rows: 1, placeholder: c ? `Спросите или скажите «напиши ${c.is_group ? "в группу" : "ему"}…»` : "Спросите что-нибудь…", id: "asstInput" });
    const mic = h("button", { class: "send", id: "asstMic", title: "Сказать голосом", html: I.mic });
    const update = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 110) + "px"; mic.innerHTML = ta.value.trim() ? I.send : I.mic; };
    const go = () => { const t = ta.value.trim(); if (!t) return; ta.value = ""; update(); this.ask(t); };
    ta.addEventListener("input", update);
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); go(); } });
    mic.onclick = () => { if (ta.value.trim()) go(); else this.listen(mic); };
    const close = sheet([
      h("div", { class: "asst-mini-head" }, h("div", { class: "avatar sm assistant-avatar", html: I.bot }),
        h("div", { class: "mid" }, h("b", null, "Мой ассистент"), h("small", { id: "asstSub" }, c ? `в чате «${chatTitle(c)}»` : "с выходом в интернет")),
        h("button", { class: "icon-btn", title: "Открыть полностью", html: I.chat, onclick: () => { this.closeMini(); this.open(); } })),
      msgs,
      h("div", { class: "composer" }, ta, mic),
    ], () => { this.mini = false; this.ctxChat = null; Voice2.stop(); });
    this.closeMini = () => { close(); };
    this.render(true);
    if (!opts?.noListen) setTimeout(() => this.listen(mic), 250);          // сразу слушаем — можно просто говорить
  },

  // команды без имени — для открытого чата
  contextCommand(text) {
    const c = this.ctxChat; if (!c) return null;
    const t = text.toLowerCase().replace(/ё/g, "е").replace(/[!?.]+$/, "").trim();
    const other = !c.is_group ? otherUser(c) : null;
    const target = c.is_group ? { kind: "chat", id: c.id, name: chatTitle(c) } : { kind: "user", id: other, name: S.profiles.get(other)?.name || chatTitle(c) };
    if (/^(позвони|набери|позвонить|звони)( ему| ей| им| сюда)?$/.test(t)) return { call: target, video: false };
    if (/^(видеозвонок|видео ?звонок|позвони по видео|видеочат)( ему| ей| им)?$/.test(t)) return { call: target, video: true };
    const m = text.match(/^(?:напиши|отправь|ответь|передай|скажи)(?:\s+(?:ему|ей|им|сюда|в чат|в этот чат|в группу))?(?:\s*[,:]?\s*(?:что|чтобы)?\s*)(.*)$/i);
    if (m && /^(напиши|отправь|ответь|передай|скажи)(\s+(ему|ей|им|сюда|в чат|в этот чат|в группу))?(\s|$|[,:])/i.test(text)) {
      const rest = m[1].trim();
      // «напиши маме …» с именем — пусть разбирает обычная команда
      if (rest && this.findTarget(rest.split(/\s+/).slice(0, 2), false) && !/^(ему|ей|им)\b/i.test(text.split(/\s+/)[1] || "")) return null;
      return { msg: target, text: rest };
    }
    return null;
  },

  // выбор конкретного голоса телефона (из установленных движков: Google, Samsung, RHVoice…)
  voicePicker(engine) {
    let close;
    const body = h("div", { class: "voice-list" }, h("p", { class: "empty-chat" }, "Загружаю голоса телефона…"));
    close = sheet([h("h3", null, "Голос телефона"), body,
      h("button", { class: "menu-item", onclick: () => { this.settings.sysVoice = null; this.save(); window.AndroidBridge?.resetVoice?.(); close(); toast("Голос выбирается автоматически"); } },
        h("span", { html: I.close }), "Выбирать автоматически")]);
    window.onTtsVoices = (data) => {
      window.onTtsVoices = null;
      body.innerHTML = "";
      const engines = data.engines || [];
      if (engines.length > 1) body.append(h("div", { class: "folders engine-tabs" }, engines.map((e) =>
        h("button", { class: e.name === data.engine ? "on" : "", onclick: () => { close(); window.AndroidBridge.resetVoice?.(); this.voicePicker(e.name); } }, e.label))));
      if (data.status === "nolang") body.append(h("p", { class: "sheet-note" }, "В этом движке нет русского языка. Выберите другой или скачайте голоса."));
      const voices = (data.voices || []).filter((v) => v.installed !== false || v.network);
      if (!voices.length && data.status !== "nolang") body.append(h("p", { class: "sheet-note" }, "Русских голосов не найдено. Нажмите «Скачать новые голоса»."));
      const cur = this.settings.sysVoice || {};
      voices.forEach((v, i) => {
        const label = `Голос ${i + 1}${v.gender === "male" ? " · мужской" : v.gender === "female" ? " · женский" : ""}${v.network ? " · через интернет" : ""}`;
        body.append(h("div", { class: `voice-row${cur.name === v.name && cur.engine === data.engine ? " on" : ""}` },
          h("button", { class: "icon-btn", title: "Послушать", html: I.speaker, onclick: () => {
            window.AndroidBridge.speak2("Здравствуйте! Так звучит этот голос.", v.gender || "female", 1, 1, v.name, data.engine);
          } }),
          h("div", { class: "mid" }, h("b", null, label), h("small", null, v.name)),
          h("button", { class: "btn small", onclick: () => {
            this.settings.sysVoice = { engine: data.engine, name: v.name, label }; this.save(); Voice2.native = null; Voice2.slow = 0;
            close(); toast("Голос выбран"); Voice2.speak("Готово. Теперь я говорю этим голосом.", this.settings.voice);
          } }, "Выбрать")));
      });
    };
    window.AndroidBridge.listVoices(engine || this.settings.sysVoice?.engine || "");
    setTimeout(() => { if (window.onTtsVoices) { window.onTtsVoices = null; body.innerHTML = ""; body.append(h("p", { class: "sheet-note" }, "Телефон не ответил. Попробуйте ещё раз.")); } }, 10000);
  },

  downloadVoices() {
    const b = window.AndroidBridge;
    sheet([
      h("h3", null, "Скачать голоса"),
      h("p", { class: "sheet-note" }, "Голоса ставятся как отдельное бесплатное приложение. После установки вернитесь сюда: «Голос телефона» → выберите движок и голос."),
      h("button", { class: "menu-item voice-dl", onclick: () => b.openStore("com.github.olga_yakovleva.rhvoice.android") }, h("span", { class: "vc-ico" }, "🎙"),
        h("span", null, "RHVoice — русские голоса", h("small", { class: "sub" }, "Бесплатно, без интернета: Александр, Артемий, Ирина, Анна, Елена и другие"))),
      h("button", { class: "menu-item voice-dl", onclick: () => b.openStore("com.google.android.tts") }, h("span", { class: "vc-ico" }, "🗣"),
        h("span", null, "Синтезатор речи Google", h("small", { class: "sub" }, "Несколько мужских и женских русских голосов"))),
      h("button", { class: "menu-item voice-dl", onclick: () => { b.resetVoice?.(); Voice2.native = null; b.openSettings?.("ttsData"); } }, h("span", { class: "vc-ico" }, "⬇️"),
        h("span", null, "Голосовые данные телефона", h("small", { class: "sub" }, "Докачать русский язык для уже установленного синтезатора"))),
      h("button", { class: "menu-item voice-dl", onclick: () => b.openSettings?.("tts") }, h("span", { class: "vc-ico" }, "⚙️"),
        h("span", null, "Настройки синтеза речи Android", h("small", { class: "sub" }, "Выбрать движок по умолчанию"))),
    ]);
  },
});

// ───────────── Встроено в телефон: плавающая кнопка, ярлык, плитка ─────────────
window.onOpenAgent = (text) => {
  try {
    if (typeof S === "undefined" || !S.me) { window.__agentPending = true; window.__agentText = text || ""; return; }       // ещё не вошли — откроем после входа
    if (Assistant.mini) Assistant.closeMini?.();
    // «Макс, позвони маме» — после имени идёт команда: выполняем сразу
    const m = String(text || "").match(/(?:^|[^а-яёa-z])(?:макс|мокс|маск|мэкс|max|mux)(?![а-яё])[\s,.!:—-]*([\s\S]*)$/i);
    const cmd = m ? m[1].trim() : "";
    if (cmd.length > 2) { Assistant.openMini({ noListen: true }); setTimeout(() => Assistant.ask(cmd, true), 350); }
    else Assistant.openMini();
  } catch { /* */ }
};
setInterval(() => {
  try {
    if (window.__agentPending && typeof S !== "undefined" && S.me) { window.__agentPending = false; const t = window.__agentText; window.__agentText = ""; window.onOpenAgent(t); return; }
    if (window.AndroidBridge?.takeLaunchAction?.() === true) window.onOpenAgent(window.AndroidBridge.takeLaunchText?.() || "");
  } catch { /* */ }
}, 1500);
