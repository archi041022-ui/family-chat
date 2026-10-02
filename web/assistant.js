/* Ассистент: погода, новости, курсы валют и ответы на вопросы. Голосовой ввод и озвучка мужским или женским голосом. */
"use strict";

const Assistant = {
  history: [],
  busy: false,
  geo: null,          // { lat, lon, at }
  settings: { voice: "female", speak: true, city: "" },

  key(k) { return `assistant:${k}:${S.me?.id || ""}`; },
  load() {
    try { this.history = JSON.parse(localStorage.getItem(this.key("h")) || "[]"); } catch { this.history = []; }
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(this.key("s")) || "{}")); } catch { /* */ }
  },
  save() {
    try { localStorage.setItem(this.key("h"), JSON.stringify(this.history.slice(-60))); } catch { /* */ }
    try { localStorage.setItem(this.key("s"), JSON.stringify(this.settings)); } catch { /* */ }
  },

  // пункт над списком чатов
  listItem() {
    return h("button", { class: `chat-item assistant-item${S.assistantOpen ? " on" : ""}`, onclick: () => this.open() },
      h("div", { class: "avatar assistant-avatar", html: I.bot }),
      h("div", { class: "mid" },
        h("div", { class: "row" }, h("span", { class: "name" }, "Ассистент")),
        h("div", { class: "row" }, h("span", { class: "last" }, "Погода, новости, курсы валют — просто спросите"))));
  },

  open() {
    if (!this.loaded) { this.load(); this.loaded = true; }
    S.current = null; S.assistantOpen = true;
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
        h("div", { class: "title" }, h("b", null, "Ассистент"), h("small", { id: "asstSub" }, "с выходом в интернет")),
        speakBtn,
        h("button", { class: "icon-btn", title: "Настройки", html: I.gear, onclick: () => this.settingsSheet() })),
      h("div", { class: "messages", id: "asstMsgs" }),
      h("div", { class: "asst-chips", id: "asstChips" },
        ["☀️ Погода сейчас", "🌦 Погода на завтра", "📰 Главные новости", "💵 Курс доллара", "😄 Расскажи анекдот"].map((t) =>
          h("button", { onclick: () => this.ask(t.replace(/^\S+\s/, "")) }, t))),
      this.composer());
    app.append(view);
    renderChatList();
    this.render(true);
  },

  composer() {
    const ta = h("textarea", { rows: 1, placeholder: "Спросите что-нибудь…", id: "asstInput" });
    const mic = h("button", { class: "send", title: "Сказать голосом", html: I.mic });
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
      if (!out) bubble.append(h("button", { class: "asst-say", title: "Прочитать вслух", html: I.speaker, onclick: (e) => { e.stopPropagation(); Voice2.speak(m.content, this.settings.voice); } }));
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

  async ask(text) {
    if (this.busy) return;
    Voice2.stop();
    this.history.push({ role: "user", content: text, at: Date.now() });
    this.busy = true; this.render(); this.save();
    let geo = null;
    if (/погод|температур|градус|дожд|снег|ветер|прогноз|холодно|тепло|зонт|одеться/i.test(text) && !/\s(в|во)\s+[А-ЯЁ]/.test(text) && !this.settings.city) geo = await this.location();
    let reply;
    try {
      const { data, error } = await S.sb.functions.invoke("assistant", {
        body: { messages: this.history.slice(-10).map(({ role, content }) => ({ role, content })), lat: geo?.lat, lon: geo?.lon, city: this.settings.city || undefined, name: S.me?.name },
      });
      if (error) throw error;
      reply = data?.reply || "Не получилось ответить, попробуйте ещё раз.";
    } catch {
      reply = "Нет связи с ассистентом. Проверьте интернет и попробуйте ещё раз.";
    }
    this.busy = false;
    this.history.push({ role: "assistant", content: reply, at: Date.now() });
    this.save(); this.render();
    if (this.settings.speak && S.assistantOpen) Voice2.speak(reply, this.settings.voice);
  },

  listen(btn) {
    Voice2.stop();
    const done = (text) => {
      btn.classList.remove("listening"); $("#asstSub") && ($("#asstSub").textContent = "с выходом в интернет");
      if (text) this.ask(text);
    };
    btn.classList.add("listening"); $("#asstSub") && ($("#asstSub").textContent = "слушаю…");
    if (window.AndroidBridge?.listen) {
      window.onSpeechResult = (text, err) => {
        window.onSpeechResult = null;
        if (!text && err) toast(err === "no_match" ? "Не расслышал, попробуйте ещё раз" : err === "permission" ? "Нет доступа к микрофону" : "Распознавание речи недоступно");
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
    const g = (v, label) => h("button", { class: `seg${this.settings.voice === v ? " on" : ""}`, onclick: (e) => {
      this.settings.voice = v; this.save();
      e.target.parentNode.querySelectorAll(".seg").forEach((b) => b.classList.toggle("on", b === e.target));
      Voice2.speak(v === "male" ? "Здравствуйте! Я буду говорить мужским голосом." : "Здравствуйте! Я буду говорить женским голосом.", v);
    } }, label);
    close = sheet([
      h("h3", null, "Настройки ассистента"),
      h("div", { class: "section-title", style: { padding: "4px 4px 6px" } }, "Голос"),
      h("div", { class: "segmented" }, g("female", "👩 Женский"), g("male", "👨 Мужской")),
      h("label", { class: "toggle-row" }, h("input", { type: "checkbox", checked: this.settings.speak, onchange: (e) => { this.settings.speak = e.target.checked; this.save(); } }), "Озвучивать ответы"),
      h("label", { class: "field", style: { marginTop: "10px" } }, h("span", null, "Город для погоды"), city),
      h("button", { class: "btn wide", onclick: () => { this.settings.city = city.value.trim(); this.save(); close(); toast("Сохранено"); } }, "Сохранить"),
      h("button", { class: "menu-item danger", style: { marginTop: "8px" }, onclick: () => { this.history = []; this.save(); this.render(); close(); } }, h("span", { html: I.trash }), "Очистить переписку с ассистентом"),
    ]);
  },
};

// ───────────── Озвучка ─────────────
const Voice2 = {
  speak(text, gender = "female") {
    const t = String(text || "").replace(/https?:\/\/\S+/g, "").replace(/[*_#>`]/g, "").slice(0, 1500);
    if (!t.trim()) return;
    if (window.AndroidBridge?.speak) { window.AndroidBridge.speak(t, gender); return; }
    const ss = window.speechSynthesis; if (!ss) return;
    ss.cancel();
    const u = new SpeechSynthesisUtterance(t); u.lang = "ru-RU";
    const v = this.pickVoice(gender);
    if (v) u.voice = v;
    // если у устройства нет голоса нужного пола — меняем высоту
    u.pitch = v && this.isGender(v, gender) ? 1 : (gender === "male" ? 0.7 : 1.15);
    u.rate = 1;
    ss.speak(u);
  },
  stop() {
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
try { window.speechSynthesis?.getVoices(); window.speechSynthesis && (window.speechSynthesis.onvoiceschanged = () => {}); } catch { /* */ }
