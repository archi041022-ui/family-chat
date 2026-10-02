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
    for (const m of this.history) if (m.card?.state === "pending") m.card.state = "cancelled";
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
        ["📞 Позвони…", "📹 Видеочат с семьёй", "✉️ Напиши…", "☀️ Погода сейчас", "📰 Главные новости", "💵 Курс доллара", "😄 Расскажи анекдот"].map((t) =>
          h("button", { onclick: () => {
            const q = t.replace(/^\S+\s/, "");
            if (q.endsWith("…")) { const inp = $("#asstInput"); inp.value = q.replace("…", " "); inp.focus(); inp.dispatchEvent(new Event("input")); }
            else this.ask(q);
          } }, t))),
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
      if (m.card) bubble.append(this.cardEl(m));
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
    // звонки и сообщения выполняются прямо в приложении, без интернета-нейросети
    try { if (await this.command(text)) return; } catch { /* обычный вопрос */ }
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

// ───────────── Команды: «позвони маме», «напиши папе что…» ─────────────
Object.assign(Assistant, {
  pending: null,     // { type: "dictate" | "confirm", target, text, msgIndex }

  say(text, extra = {}) {
    const m = { role: "assistant", content: text, at: Date.now(), ...extra };
    this.history.push(m); this.save(); this.render();
    if (this.settings.speak && S.assistantOpen) Voice2.speak(text, this.settings.voice);
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
    const text = raw.trim().replace(/[.!]+$/, "").replace(/(^|\s)(пожалуйста|срочно|быстро)(?=[\s,]|$),?/gi, " ").replace(/\s+/g, " ").trim();
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
        t = cur ? { kind: "chat", id: cur.id, name: chatTitle(cur) } : { kind: "chat", id: FAMILY_CHAT, name: chatTitle(S.chats.find((c) => c.id === FAMILY_CHAT) || { title: "Семья", is_group: true }) };
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
      let body = words.slice(t.used).join(" ").replace(/^[,:—-]+\s*/, "").replace(/^(что|чтобы|текст|сообщение)\s+/i, "").trim();
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
