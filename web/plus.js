/* v2.4: вход по отпечатку, расшифровка голосовых, перевод сообщений, каналы, эмодзи-статус,
   защита содержимого, эффекты сообщений, список задач с напоминаниями. */
"use strict";

const TR_MARK = "⁤";            // текст до знака — перевод, после — оригинал
const FX_RE = /⁢fx:([a-z]+)/;   // эффект сообщения

// ───────────── 1. Вход по отпечатку пальца / лицу / ПИН-коду телефона ─────────────
const Lock = {
  bgAt: 0, busy: false,
  enabled() { return Prefs.get("bioLock") === true && this.avail(); },
  avail() { try { return !!window.AndroidBridge?.lockAvailable?.(); } catch { return false; } },
  delay() { const d = Prefs.get("lockDelay"); return d == null ? 30 : d; },
  show() {
    if (!this.enabled() || $(".lock-screen")) return;
    const el = h("div", { class: "lock-screen" },
      h("div", { class: "lock-logo" }, "🏠"),
      h("h2", null, CFG.appName || "Семья"),
      h("p", null, "Приложение защищено"),
      h("button", { class: "lock-btn", onclick: () => this.prompt() }, h("span", { class: "fp" }, "👆"), "Разблокировать"));
    document.body.append(el);
    setTimeout(() => this.prompt(), 250);
  },
  prompt() {
    if (this.busy) return;
    this.busy = true;
    window.onUnlock = (ok, reason) => {
      window.onUnlock = null;
      setTimeout(() => { this.busy = false; }, 800);
      if (ok) {
        const el = $(".lock-screen");
        if (el) { el.classList.add("out"); setTimeout(() => el.remove(), 400); }
        this.bgAt = 0;
      } else if (reason === "no_lock") toast("На телефоне не задан отпечаток или ПИН-код — защита отключена", 4500);
    };
    try { window.AndroidBridge.unlock(); } catch { this.busy = false; }
  },
  onBg() { if (!this.busy && !this.bgAt) this.bgAt = Date.now(); },
  onFg() {
    if (this.busy) return;
    if (this.enabled() && this.bgAt && Date.now() - this.bgAt >= this.delay() * 1000) this.show();
    this.bgAt = 0;
  },
  sheet() {
    let close;
    const avail = this.avail();
    const draw = () => h("div", null,
      h("label", { class: "toggle-row" }, h("span", null, "Вход по отпечатку или лицу", h("small", null, "При открытии «Семьи» телефон попросит отпечаток, лицо или ПИН-код")),
        h("input", { type: "checkbox", checked: Prefs.get("bioLock") === true, disabled: !avail, onchange: (e) => {
          const on = e.target.checked; e.target.checked = !on;
          // включаем только после успешной проверки — чтобы не заблокировать себя
          window.onUnlock = (ok) => {
            window.onUnlock = null; this.busy = false;
            if (ok) { Prefs.set("bioLock", on); e.target.checked = on; toast(on ? "Вход по отпечатку включён" : "Вход по отпечатку выключен"); }
          };
          this.busy = true; window.AndroidBridge.unlock();
        } })),
      h("div", { class: "section-title", style: { padding: "10px 4px 6px" } }, "Блокировать, если приложение свёрнуто"),
      h("div", { class: "segmented" }, ...[[0, "Сразу"], [30, "30 сек"], [300, "5 мин"], [3600, "1 час"]].map(([v, l]) =>
        h("button", { class: `seg${this.delay() === v ? " on" : ""}`, onclick: (e) => {
          Prefs.set("lockDelay", v); e.currentTarget.parentNode.querySelectorAll(".seg").forEach((b) => b.classList.toggle("on", b === e.currentTarget));
        } }, l))),
      avail ? null : h("p", { class: "sheet-note" }, window.AndroidBridge ? "На телефоне не настроены отпечаток или ПИН-код. Задайте их в настройках телефона → «Безопасность»." : "Вход по отпечатку работает в приложении для Android."));
    close = sheet([h("h3", null, "🔐 Вход по отпечатку"), draw()]);
  },
};

// ───────────── 2. Расшифровка голосовых сообщений ─────────────
const Voice2Text = {
  mem: new Map(), busy: new Set(),
  key(id) { return "stt:" + id; },
  auto() { return Prefs.get("sttAuto") !== false; },
  async get(id) {
    if (this.mem.has(id)) return this.mem.get(id);
    const t = await Store.get(this.key(id));
    if (t != null) this.mem.set(id, t);
    return t;
  },
  // блок под голосовым / кружком
  el(m) {
    const box = h("div", { class: "stt" });
    const draw = (state, text) => {
      box.innerHTML = "";
      if (state === "text") box.append(h("div", { class: "stt-text" }, text || "(не удалось разобрать речь)"));
      else if (state === "busy") box.append(h("div", { class: "stt-busy" }, h("i"), h("i"), h("i"), h("span", null, text || "Расшифровываю…")));
      else box.append(h("button", { class: "stt-btn", title: "Расшифровать в текст", onclick: (e) => { e.stopPropagation(); this.run(m, draw, true); } }, "Аа → текст"));
    };
    draw("btn");
    this.get(m.id).then(async (t) => {
      if (t != null) { draw("text", t); return; }
      if (this.busy.has(m.id)) { draw("busy"); return; }
      // входящие расшифровываются сами, если модель уже скачана
      if (m.user_id !== S.me.id && this.auto() && Date.now() - new Date(m.created_at) < 3 * 864e5 && await STT.cached()) this.run(m, draw, false);
    });
    return box;
  },
  async run(m, draw, manual) {
    if (this.busy.has(m.id)) return;
    if (manual && !(await STT.cached()) && !STT.model) {
      const ok = await this.askDownload(); if (!ok) return;
    }
    this.busy.add(m.id); draw("busy");
    try {
      const url = S.urls.get(m.media_path); if (!url) throw new Error("no url");
      const blob = await (await fetch(url)).blob();
      const text = await STT.transcribe(blob, (p) => draw("busy", p < 100 ? `Загружаю распознавание речи… ${p}%` : "Расшифровываю…"));
      this.mem.set(m.id, text); Store.set(this.key(m.id), text);
      draw("text", text);
    } catch {
      draw("btn"); if (manual) toast("Не получилось расшифровать. Проверьте интернет при первом запуске.");
    } finally { this.busy.delete(m.id); }
  },
  askDownload() {
    return new Promise((resolve) => {
      let close, answered = false;
      const done = (v) => { answered = true; close(); resolve(v); };
      close = sheet([
        h("h3", null, "Расшифровка голосовых"),
        h("p", { class: "sheet-note" }, "Для расшифровки нужно один раз скачать модель распознавания русской речи (около 45 МБ). Дальше всё работает прямо на телефоне, без интернета, записи никуда не отправляются."),
        h("button", { class: "btn wide", onclick: () => done(true) }, "Скачать и расшифровать"),
        h("button", { class: "menu-item", onclick: () => done(false) }, h("span", { html: I.close }), "Не сейчас"),
      ], () => { if (!answered) resolve(false); });
    });
  },
};

// ───────────── 3. Перевод сообщений на лету ─────────────
const LANGS = [["ru", "Русский"], ["en", "English"], ["de", "Deutsch"], ["fr", "Français"], ["es", "Español"], ["it", "Italiano"], ["tr", "Türkçe"],
  ["uk", "Українська"], ["kk", "Қазақша"], ["uz", "Oʻzbekcha"], ["tt", "Татарча"], ["zh-CN", "中文"], ["ar", "العربية"], ["pl", "Polski"]];
const Tr = {
  mem: new Map(),
  target() { return Prefs.get("trTo") || "ru"; },
  chat(chatId) { return (Prefs.get("tr") || {})[chatId] || {}; },
  setChat(chatId, v) { const all = Prefs.get("tr") || {}; all[chatId] = { ...this.chat(chatId), ...v }; Prefs.set("tr", all); },
  // похоже ли на текст на другом языке (не на языке перевода)
  foreign(text) {
    const t = String(text || "").replace(/https?:\/\/\S+/g, "").replace(/[\p{Extended_Pictographic}\d\s\p{P}]/gu, "");
    if (t.length < 3) return false;
    const cyr = (t.match(/[а-яё]/gi) || []).length / t.length;
    const to = this.target();
    if (to === "ru" || to === "uk") return cyr < 0.5 || (to === "ru" && /[іїєґ]/i.test(t));
    return cyr > 0.3 || !/^[a-z]+$/i.test(t);
  },
  async translate(text, to = this.target()) {
    const key = to + "|" + text;
    if (this.mem.has(key)) return this.mem.get(key);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text.slice(0, 4500))}`;
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      const out = { text: (j[0] || []).map((x) => x[0]).join(""), from: j[2] || "" };
      this.mem.set(key, out);
      return out;
    } finally { clearTimeout(tm); }
  },
  langName(code) { return (LANGS.find((l) => l[0] === code) || [code, code])[1]; },
  // перевод под чужим сообщением
  attach(bubble, m) {
    const text = Tg.text(m.body); if (!text) return;
    const box = h("div", { class: "tr-box" });
    bubble.querySelector(".text")?.after(box);
    box.append(h("span", { class: "tr-wait" }, "🌐 перевожу…"));
    this.translate(text).then((r) => {
      if (!r.text || r.from === this.target() || r.text.trim() === text.trim()) { box.remove(); return; }
      box.innerHTML = "";
      box.append(h("div", { class: "tr-text" }, r.text), h("small", null, `🌐 перевод с языка: ${this.langName(r.from)}`));
    }).catch(() => box.remove());
  },
  // перед отправкой: свой текст → язык собеседника
  async outgoing(chatId, text) {
    const to = this.chat(chatId).out; if (!to) return text;
    try {
      const r = await this.translate(text, to);
      if (!r.text || r.from === to) return text;
      return r.text + TR_MARK + text;
    } catch { toast("Перевод недоступен — отправлено как есть"); return text; }
  },
  sheet(c) {
    let close;
    const cur = this.chat(c.id);
    const sel = (value, onChange, withNone) => {
      const s = h("select", { onchange: (e) => onChange(e.target.value) },
        withNone ? h("option", { value: "" }, "Не переводить") : null,
        LANGS.map(([code, name]) => h("option", { value: code, selected: code === value }, name)));
      if (!value && withNone) s.value = "";
      return s;
    };
    close = sheet([
      h("h3", null, "🌐 Перевод в этом чате"),
      h("label", { class: "toggle-row" }, h("span", null, "Переводить входящие сообщения", h("small", null, "Сообщения на другом языке сразу получают перевод под текстом")),
        h("input", { type: "checkbox", checked: cur.in !== false, onchange: (e) => { this.setChat(c.id, { in: e.target.checked }); renderMessages(false); } })),
      h("label", { class: "field" }, h("span", null, "Переводить на язык"), sel(this.target(), (v) => { Prefs.set("trTo", v); renderMessages(false); })),
      h("label", { class: "field" }, h("span", null, "Мои сообщения отправлять на языке"), sel(cur.out || "", (v) => { this.setChat(c.id, { out: v }); toast(v ? `Ваши сообщения будут переводиться: ${this.langName(v)}` : "Перевод своих сообщений выключен"); }, true)),
      h("p", { class: "sheet-note" }, "Собеседник увидит перевод, а под ним — ваш оригинал. Перевод — Google Переводчик."),
    ]);
  },
};

// ───────────── 4. Каналы ─────────────
const Channels = {
  canPost(c) { return !c?.is_channel || c.members_can_post || c.created_by === S.me.id || S.isAdmin; },
  create() {
    let close, photo = null, priv = true;
    const title = h("input", { placeholder: "Название канала", maxlength: 80 });
    const desc = h("textarea", { rows: 2, maxlength: 300, placeholder: "О чём канал (необязательно)" });
    const pic = h("input", { type: "file", accept: "image/*", class: "hidden" });
    const av = h("button", { class: "group-photo-pick", title: "Фото канала", onclick: () => pic.click() }, "📢");
    pic.onchange = () => { photo = pic.files[0] || null; if (photo) { av.textContent = ""; av.style.background = `center/cover url("${URL.createObjectURL(photo)}")`; } };
    const people = [...S.profiles.values()].filter((p) => p.id !== S.me.id && !p.banned).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const picks = people.map((p) => h("label", null, h("input", { type: "checkbox", value: p.id }), avatarEl(p.id, "sm"), p.name));
    const pickBox = h("div", null, h("div", { class: "section-title", style: { padding: "4px 4px 6px" } }, "Подписчики"), h("div", { class: "people-pick" }, picks));
    const note = h("p", { class: "sheet-note" });
    const kind = h("div", { class: "segmented" },
      h("button", { class: "seg on", onclick: (e) => setKind(true, e.currentTarget) }, "🔒 Приватный"),
      h("button", { class: "seg", onclick: (e) => setKind(false, e.currentTarget) }, "🌐 Открытый"));
    const setKind = (p, btn) => {
      priv = p; kind.querySelectorAll(".seg").forEach((b) => b.classList.toggle("on", b === btn));
      note.textContent = p ? "Вступить можно по заявке с вашего одобрения. Сообщения подписчиков публикуются после вашего одобрения." : "Любой член семьи найдёт канал и подпишется сам. Писать могут все подписчики.";
    };
    setKind(true, kind.firstChild);
    close = sheet([
      h("h3", null, "Новый канал"),
      h("div", { class: "group-create-head" }, av, pic, h("label", { class: "field", style: { flex: 1, margin: 0 } }, title)),
      h("label", { class: "field" }, desc),
      kind, note, pickBox,
      h("button", { class: "btn wide", style: { marginTop: "12px" }, onclick: async (e) => {
        if (!title.value.trim()) { toast("Введите название"); return; }
        const btn = e.currentTarget;
        const ids = picks.map((l) => l.querySelector("input")).filter((i) => i.checked).map((i) => i.value);
        btn.disabled = true;
        const { data: id, error } = await S.sb.rpc("create_channel", { title: title.value.trim(), description: desc.value.trim(), private: priv, members: ids });
        if (error || !id) { btn.disabled = false; toast("Не удалось создать канал"); return; }
        await S.sb.rpc("chat_settings2", { cid: id, settings: { members_can_post: true, moderated: priv, listed: priv } });
        try { if (photo) { const path = await Groups.uploadPhoto(id, photo); await S.sb.rpc("group_update", { cid: id, new_title: title.value.trim(), new_description: desc.value.trim(), new_avatar: path }); } }
        catch { toast("Фото не загрузилось — можно добавить позже"); }
        close(); await Groups.refresh(id); openChat(id); FX.sparkle($("#chatView .topbar"));
      } }, "Создать канал"),
    ]);
  },
  async discover() {
    let close;
    const list = h("div", null, h("p", { class: "empty-chat" }, "Ищу каналы…"));
    close = sheet([h("h3", null, "📢 Открытые каналы семьи"), list,
      h("button", { class: "menu-item", onclick: () => { close(); this.create(); } }, h("span", { html: I.plus }), "Создать свой канал")]);
    const { data, error } = await S.sb.rpc("public_channels");
    list.innerHTML = "";
    if (error) { list.append(h("p", { class: "empty-chat" }, "Нет связи с сервером")); return; }
    if (!data?.length) { list.append(h("p", { class: "empty-chat" }, "Открытых каналов, на которые вы не подписаны, пока нет.")); return; }
    await signUrls(data.map((c) => c.avatar_path).filter(Boolean));
    for (const c of data) {
      list.append(h("div", { class: "contact-row" },
        chatAvatar({ ...c, is_group: true }, ""),
        h("div", { class: "mid" }, h("b", null, "📢 " + c.title), h("small", null, (c.description ? c.description + " · " : "") + `${c.members} ${plural(c.members, "подписчик", "подписчика", "подписчиков")}`)),
        h("button", { class: "btn small", onclick: async () => {
          const { data: r } = await S.sb.rpc("channel_join", { cid: c.id });
          if (r !== "OK") { toast("Не получилось подписаться"); return; }
          close(); await Groups.refresh(c.id); openChat(c.id); toast("Вы подписались на канал");
        } }, "Подписаться")));
    }
  },
  // строка вместо поля ввода у подписчиков
  readerBar(c) {
    const muted = Prefs.muted(c.id);
    return h("div", { class: "channel-bar" },
      h("button", { class: "btn ghost", onclick: () => { Prefs.toggle("muted", c.id); renderChatList(); const id = c.id; S.current = null; openChat(id); } },
        h("span", { html: muted ? I.bell : I.bellOff }), muted ? "Включить уведомления" : "Без звука"),
      h("button", { class: "btn ghost", onclick: () => Groups.leave(c) }, "Покинуть канал"));
  },
};

// ───────────── 5. Эмодзи-статус рядом с именем ─────────────
const STATUS_EMOJI = "😊 😎 🥳 😴 🤒 🤔 😍 🤩 🙏 💪 ❤️ 🔥 ⭐ 🌟 ✨ 🎉 🎂 🎁 🏠 💼 🚗 ✈️ 🏖 ⛰ 🎣 ⚽ 🎮 🎧 📚 🍕 ☕ 🐶 🐱 🌸 🌈 ☀️ 🌙 ❄️ 🍀 👑 💎 🦄 🤖 👶 🎓 🏆 💤 📵".split(" ");
const EStatus = {
  of(uid) {
    const p = S.profiles.get(uid); if (!p?.emoji_status) return null;
    if (p.emoji_status_until && new Date(p.emoji_status_until) < new Date()) return null;
    return p.emoji_status;
  },
  badge(uid, size = "") {
    const e = this.of(uid); if (!e) return null;
    const img = h("img", { src: Emoji.anim(e), alt: e, class: "es-img", loading: "lazy" });
    img.onerror = () => img.replaceWith(h("span", { class: "es-txt" }, e));
    return h("span", { class: `estatus ${size}`, title: "Эмодзи-статус" }, img);
  },
  sheet() {
    let close, dur = 0;
    const durs = [[1, "1 час"], [8, "8 часов"], [24, "Сутки"], [168, "Неделя"], [0, "Всегда"]];
    const durBox = h("div", { class: "folders" }, durs.map(([v, l]) => h("button", { class: v === 0 ? "on" : "", onclick: (e) => {
      dur = v; durBox.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.currentTarget));
    } }, l)));
    const set = async (emoji) => {
      const until = emoji && dur ? new Date(Date.now() + dur * 3600e3).toISOString() : null;
      const { error } = await S.sb.from("profiles").update({ emoji_status: emoji, emoji_status_until: until }).eq("id", S.me.id);
      if (error) { toast("Не удалось сохранить — обновите приложение позже"); return; }
      Object.assign(S.me, { emoji_status: emoji, emoji_status_until: until }); S.profiles.set(S.me.id, S.me);
      close(); toast(emoji ? "Эмодзи-статус установлен" : "Эмодзи-статус убран");
      Live.broadcast("profile", {}); renderChatList(); if (S.tab === "settings") Tg.renderSettings();
    };
    const custom = h("input", { placeholder: "Свой эмодзи", maxlength: 8, class: "es-custom" });
    close = sheet([
      h("h3", null, "Эмодзи-статус"),
      h("p", { class: "sheet-note" }, "Будет виден рядом с вашим именем во всех чатах."),
      h("div", { class: "section-title", style: { padding: "0 4px 6px" } }, "На сколько"), durBox,
      h("div", { class: "sticker-grid es-grid" }, STATUS_EMOJI.map((e) => {
        const img = h("img", { src: Emoji.anim(e), alt: e, loading: "lazy" });
        img.onerror = () => img.replaceWith(h("span", { class: "st-fallback" }, e));
        return h("button", { onclick: () => set(e) }, img);
      })),
      h("div", { class: "es-custom-row" }, custom, h("button", { class: "btn small", onclick: () => { const v = custom.value.trim(); if (Emoji.only(v)?.length === 1) set(v); else toast("Введите один эмодзи"); } }, "Поставить")),
      this.of(S.me.id) ? h("button", { class: "menu-item danger", onclick: () => set(null) }, h("span", { html: I.close }), "Убрать эмодзи-статус") : null,
    ]);
  },
};

// ───────────── 6. Защита содержимого ─────────────
const Protect = {
  on(c) { return !!c?.protected; },
  apply(c) {
    const on = this.on(c);
    $("#chatView")?.classList.toggle("protected", on);
    try { window.AndroidBridge?.setSecure?.(on); } catch { /* */ }
  },
  off() { try { window.AndroidBridge?.setSecure?.(false); } catch { /* */ } },
  canChange(c) { return !c.is_group || c.created_by === S.me.id || S.isAdmin; },
  async toggle(c) {
    if (!this.canChange(c)) { toast("Менять защиту может только создатель"); return; }
    const next = !c.protected;
    const { data, error } = await S.sb.rpc("chat_settings", { cid: c.id, private: null, protect: next });
    if (error || data !== "OK") { toast("Не получилось изменить защиту"); return; }
    c.protected = next; Live.broadcast("chats", { chat_id: c.id });
    toast(next ? "🛡 Защита включена: копирование, пересылка, сохранение и снимки экрана запрещены" : "Защита выключена", 4500);
    const id = c.id; S.current = null; openChat(id);
  },
};

// ───────────── 7. Эффекты сообщений ─────────────
const EFFECTS = [
  ["confetti", "🎉", "Конфетти"], ["hearts", "❤️", "Сердечки"], ["fireworks", "🎆", "Салют"], ["likes", "👍", "Лайки"],
  ["fire", "🔥", "Огонь"], ["snow", "❄️", "Снег"], ["balloons", "🎈", "Шарики"], ["laugh", "😂", "Смех"], ["stars", "⭐", "Звёзды"],
];
const Effects = {
  of(m) { const r = m?.body && String(m.body).match(FX_RE); return r ? r[1] : null; },
  played() {
    if (!this._p || this._pu !== S.me?.id) {
      this._pu = S.me?.id;
      try { this._p = new Set(JSON.parse(localStorage.getItem("fxPlayed:" + this._pu) || "[]")); } catch { this._p = new Set(); }
    }
    return this._p;
  },
  markPlayed(id) { const s = this.played(); s.add(id); try { localStorage.setItem("fxPlayed:" + S.me?.id, JSON.stringify([...s].slice(-500))); } catch { /* */ } },
  play(kind) {
    const fx = EFFECTS.find((x) => x[0] === kind); if (!fx) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layer = h("div", { class: `fx-layer fx-${kind}` });
    const icons = { confetti: ["🎉", "🎊", "✨"], hearts: ["❤️", "💖", "💕", "💗"], fireworks: ["🎆", "🎇", "✨", "💥"], likes: ["👍", "👏", "💯"],
      fire: ["🔥", "🔥", "💥"], snow: ["❄️", "❄️", "⛄"], balloons: ["🎈", "🎈", "🎈", "🎁"], laugh: ["😂", "🤣", "😆"], stars: ["⭐", "🌟", "✨", "💫"] }[kind];
    const n = 36;
    for (let i = 0; i < n; i++) {
      const p = h("i", null, icons[i % icons.length]);
      p.style.left = Math.random() * 100 + "%";
      p.style.fontSize = (18 + Math.random() * 26).toFixed(0) + "px";
      p.style.animationDelay = (Math.random() * 1.1).toFixed(2) + "s";
      p.style.animationDuration = (1.8 + Math.random() * 1.6).toFixed(2) + "s";
      p.style.setProperty("--dx", (Math.random() * 140 - 70).toFixed(0) + "px");
      p.style.setProperty("--rot", (Math.random() * 540 - 270).toFixed(0) + "deg");
      layer.append(p);
    }
    if (kind === "confetti" || kind === "fireworks") layer.append(Welcome.confetti(60));
    document.body.append(layer);
    navigator.vibrate?.([20, 40, 20]);
    setTimeout(() => layer.remove(), 4200);
  },
  // при показе нового сообщения с эффектом — проиграть один раз
  maybePlay(m) {
    const k = this.of(m); if (!k || this.played().has(m.id) || String(m.id).startsWith("tmp-")) return;
    this.markPlayed(m.id);
    if (Date.now() - new Date(m.created_at) > 864e5) return;
    setTimeout(() => this.play(k), 200);
  },
  // выбор эффекта: долгое нажатие на «Отправить»
  picker(onPick) {
    let close;
    close = sheet([
      h("h3", null, "✨ Отправить с эффектом"),
      h("div", { class: "fx-grid" }, EFFECTS.map(([k, e, name]) => h("button", { onclick: () => { close(); onPick(k); } }, h("span", null, e), name))),
      h("p", { class: "sheet-note" }, "Эффект увидят все в чате, когда откроют сообщение. Подсказка: зажмите кнопку «Отправить»."),
    ]);
  },
};

// ───────────── 8. Список задач с напоминаниями ─────────────
const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"];
// «завтра в 18:00», «через 2 часа», «в пятницу утром», «15.10 в 9» → дата и текст без этих слов
function parseWhen(text) {
  let t = " " + String(text) + " ";
  let d = null, time = null;
  const now = new Date();
  const day0 = () => new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cut = (re) => { const m = t.match(re); if (m) t = t.replace(m[0], " "); return m; };
  let m;
  if ((m = cut(/\s+через\s+(\d+|полчаса|час|пару часов)\s*(минут[уы]?|мин|час(?:а|ов)?|д(?:ень|ня|ней))?(?=\s)/i))) {
    const n = /полчаса/i.test(m[1]) ? 30 : /пару/i.test(m[1]) ? 2 : /^час$/i.test(m[1]) ? 1 : +m[1];
    const unit = /полчаса/i.test(m[1]) ? "м" : /^час$|пару/i.test(m[1]) ? "ч" : (m[2] || "м").toLowerCase();
    const ms = unit.startsWith("ч") ? n * 3600e3 : unit.startsWith("д") ? n * 864e5 : n * 6e4;
    return { date: new Date(Date.now() + ms), rest: t.replace(/\s+/g, " ").trim() };
  }
  if (cut(/\s+послезавтра(?=\s)/i)) { d = day0(); d.setDate(d.getDate() + 2); }
  else if (cut(/\s+завтра(?=\s)/i)) { d = day0(); d.setDate(d.getDate() + 1); }
  else if (cut(/\s+сегодня(?=\s)/i)) d = day0();
  else if ((m = cut(/\s+во?\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)(?=\s)/i))) {
    const wd = WEEKDAYS.indexOf(m[1].toLowerCase()); d = day0();
    let add = (wd - d.getDay() + 7) % 7; if (add === 0) add = 7; d.setDate(d.getDate() + add);
  } else if ((m = cut(/\s+(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s)/))) {
    const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
    d = new Date(y, +m[2] - 1, +m[1]); if (!m[3] && d < day0()) d.setFullYear(y + 1);
  }
  if ((m = cut(/\s+(?:в|к|на)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:ч(?:ас(?:а|ов)?)?\.?)?\s*(утра|дня|вечера|ночи)?(?=\s)/i))) {
    let hh = +m[1]; const mm = +(m[2] || 0);
    if (/вечера|дня/i.test(m[3] || "") && hh < 12) hh += 12;
    if (/ночи/i.test(m[3] || "") && hh === 12) hh = 0;
    if (hh < 24 && mm < 60) time = [hh, mm];
  } else if ((m = cut(/\s+(утром|днём|днем|вечером|ночью)(?=\s)/i))) {
    time = { утром: [9, 0], днём: [13, 0], днем: [13, 0], вечером: [19, 0], ночью: [23, 0] }[m[1].toLowerCase()];
  }
  if (!d && !time) return { date: null, rest: t.trim() };
  if (!d) { d = day0(); }
  if (!time) time = [9, 0];
  d.setHours(time[0], time[1], 0, 0);
  if (d < now && !/сегодня/i.test(text) && d.toDateString() === now.toDateString()) d.setDate(d.getDate() + 1);   // «в 8» уже прошло — завтра
  return { date: d, rest: t.replace(/\s+/g, " ").trim() };
}
function fmtWhen(d) {
  if (!d) return "";
  d = new Date(d);
  const now = new Date(); const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - t0) / 864e5);
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return `сегодня в ${hm}`;
  if (days === 1) return `завтра в ${hm}`;
  if (days === 2) return `послезавтра в ${hm}`;
  if (days === -1) return `вчера в ${hm}`;
  return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} в ${hm}`;
}

const Tasks = {
  list: [], loaded: false, filter: "active",
  async load() {
    const { data, error } = await S.sb.from("tasks").select("*").order("created_at", { ascending: false });
    if (!error) { this.list = data || []; this.loaded = true; }
    this.badge(); return this.list;
  },
  start() {
    this.load();
    clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 30000);
    setTimeout(() => this.tick(), 4000);
  },
  onChange(p) {
    const row = p.new && Object.keys(p.new).length ? p.new : null, old = p.old;
    if (p.eventType === "DELETE" || (!row && old)) this.list = this.list.filter((t) => t.id !== old.id);
    else if (row) {
      const i = this.list.findIndex((t) => t.id === row.id);
      const isNew = i < 0;
      if (isNew) this.list.unshift(row); else this.list[i] = row;
      if (isNew && row.assignee_id === S.me.id && row.owner_id !== S.me.id) {
        const who = S.profiles.get(row.owner_id)?.name || "Кто-то";
        toast(`📝 ${who} поручил(а) вам: ${row.title}`, 5000);
      }
    }
    this.badge(); if (S.tasksOpen) this.render();
  },
  mine() { return this.list.filter((t) => t.owner_id === S.me.id || t.assignee_id === S.me.id || (t.chat_id && S.chats.some((c) => c.id === t.chat_id))); },
  active() { return this.mine().filter((t) => !t.done); },
  badge() { renderChatList(); },
  // напоминания: уведомление, когда подошёл срок
  tick() {
    if (!S.me) return;
    let seen; try { seen = new Set(JSON.parse(localStorage.getItem("taskReminded:" + S.me.id) || "[]")); } catch { seen = new Set(); }
    const now = Date.now(); let changed = false;
    for (const t of this.active()) {
      if (!t.remind || !t.due_at || seen.has(t.id + t.due_at)) continue;
      if ((t.assignee_id || t.owner_id) !== S.me.id && !(t.chat_id && !t.assignee_id)) continue;
      const due = new Date(t.due_at).getTime();
      if (due > now || now - due > 6 * 3600e3) continue;
      seen.add(t.id + t.due_at); changed = true;
      if (window.AndroidBridge?.notify) window.AndroidBridge.notify("⏰ Напоминание", t.title, null);
      else if ("Notification" in window && Notification.permission === "granted") { try { new Notification("⏰ Напоминание", { body: t.title, icon: "icon-192.png" }); } catch { /* */ } }
      if (appVisible()) { toast(`⏰ ${t.title}`, 6000); Snd.message(); }
    }
    if (changed) try { localStorage.setItem("taskReminded:" + S.me.id, JSON.stringify([...seen].slice(-300))); } catch { /* */ }
  },
  async add(fields) {
    const row = { title: fields.title.slice(0, 300), due_at: fields.due_at || null, remind: fields.remind !== false, assignee_id: fields.assignee_id || null, chat_id: fields.chat_id || null, note: fields.note || null };
    const { data, error } = await S.sb.from("tasks").insert(row).select().single();
    if (error) { toast("Не удалось добавить задачу"); return null; }
    if (!this.list.some((t) => t.id === data.id)) this.list.unshift(data);
    this.badge(); if (S.tasksOpen) this.render();
    return data;
  },
  async update(t, fields) {
    Object.assign(t, fields); if (S.tasksOpen) this.render();
    const { error } = await S.sb.from("tasks").update(fields).eq("id", t.id);
    if (error) toast("Не удалось сохранить");
    this.badge();
  },
  async remove(t) {
    const el = document.querySelector(`.task-row[data-id="${t.id}"]`);
    await FX.dust(el);
    this.list = this.list.filter((x) => x !== t); if (S.tasksOpen) this.render();
    const { error } = await S.sb.from("tasks").delete().eq("id", t.id);
    if (error) toast("Удалить может только автор задачи");
    this.badge();
  },
  async toggle(t, el) {
    const done = !t.done;
    if (done && el) { el.classList.add("checking"); FX.sparkle(el); }
    await new Promise((r) => setTimeout(r, done ? 350 : 0));
    this.update(t, { done });
    if (done && this.active().length === 0) Effects.play("confetti");
  },
  listItem() {
    const act = this.active();
    const overdue = act.filter((t) => t.due_at && new Date(t.due_at) < new Date()).length;
    const next = act.filter((t) => t.due_at).sort((a, b) => new Date(a.due_at) - new Date(b.due_at))[0];
    return h("button", { class: `chat-item tasks-item pinned${S.tasksOpen ? " on" : ""}`, onclick: () => this.open() },
      h("div", { class: "avatar tasks-avatar" }, "✅"),
      h("div", { class: "mid" },
        h("div", { class: "row" }, h("span", { class: "name" }, "Мои задачи")),
        h("div", { class: "row" }, h("span", { class: "last" }, act.length ? `${act.length} ${plural(act.length, "задача", "задачи", "задач")}${next ? " · ближайшая " + fmtWhen(next.due_at) : ""}` : "Список дел, напоминания, поручения семье"),
          overdue ? h("span", { class: "badge" }, overdue) : null)));
  },
  open() {
    S.current = null; S.assistantOpen = false; S.tasksOpen = true;
    Protect.off();
    app.classList.add("in-chat");
    $("#placeholder")?.remove(); $("#chatView")?.remove();
    const input = h("input", { id: "taskInput", placeholder: "Новая задача… (например: купить хлеб завтра в 18)" });
    const add = async () => {
      const v = input.value.trim(); if (!v) return;
      const p = parseWhen(v);
      input.value = "";
      const t = await this.add({ title: cap(p.rest || v), due_at: p.date?.toISOString() });
      if (t) { toast(t.due_at ? `Добавлено · ${fmtWhen(t.due_at)}` : "Добавлено"); }
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
    const view = h("section", { class: "chat tasks-view", id: "chatView" },
      h("div", { class: "topbar" },
        h("button", { class: "icon-btn back-btn", onclick: () => closeChat(), html: I.back }),
        h("div", { class: "avatar sm tasks-avatar" }, "✅"),
        h("div", { class: "title" }, h("b", null, "Мои задачи"), h("small", { id: "tasksSub" }, "")),
        h("button", { class: "icon-btn", title: "Попросить ассистента", html: I.bot, onclick: () => { Assistant.openMini(); setTimeout(() => { const i = $("#asstInput"); if (i && !i.value) { i.value = "Добавь задачу "; i.dispatchEvent(new Event("input")); } }, 300); } })),
      h("div", { class: "folders task-filters", id: "taskFilters" }),
      h("div", { class: "messages tasks-list", id: "tasksList" }),
      h("div", { class: "composer task-composer" }, input, h("button", { class: "send", title: "Добавить", html: I.plus, onclick: add })));
    app.append(view);
    SwipeBack.attach(view, () => closeChat(), { both: true });               // свайп вправо или влево — назад
    renderChatList();
    this.render();
    this.load().then(() => this.render());
  },
  render() {
    const box = $("#tasksList"); if (!box) return;
    const f = this.filter;
    const fl = $("#taskFilters");
    if (fl) {
      fl.innerHTML = "";
      for (const [k, l] of [["active", "Активные"], ["mine", "Мне"], ["given", "Поручил(а)"], ["family", "Семейные"], ["done", "Выполненные"]])
        fl.append(h("button", { class: f === k ? "on" : "", onclick: () => { this.filter = k; this.render(); } }, l));
    }
    let list = this.mine();
    if (f === "active") list = list.filter((t) => !t.done);
    if (f === "mine") list = list.filter((t) => !t.done && (t.assignee_id === S.me.id || (!t.assignee_id && t.owner_id === S.me.id)));
    if (f === "given") list = list.filter((t) => !t.done && t.owner_id === S.me.id && t.assignee_id && t.assignee_id !== S.me.id);
    if (f === "family") list = list.filter((t) => !t.done && t.chat_id);
    if (f === "done") list = list.filter((t) => t.done).sort((a, b) => new Date(b.done_at || 0) - new Date(a.done_at || 0));
    const sub = $("#tasksSub"); if (sub) { const n = this.active().length; sub.textContent = n ? `${n} ${plural(n, "активная", "активные", "активных")}` : "всё сделано"; }
    box.innerHTML = "";
    if (!list.length) {
      box.append(h("div", { class: "tasks-empty" }, h("div", null, f === "done" ? "📭" : "🎯"),
        h("b", null, f === "done" ? "Пока ничего не выполнено" : "Задач нет"),
        h("p", null, "Напишите задачу внизу или скажите ассистенту: «Напомни завтра в 9 позвонить бабушке»")));
      return;
    }
    const now = new Date(); const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const group = (t) => {
      if (t.done) return "Выполнено";
      if (!t.due_at) return "Без срока";
      const d = new Date(t.due_at).getTime();
      if (d < now.getTime()) return "Просрочено";
      if (d < t0 + 864e5) return "Сегодня";
      if (d < t0 + 2 * 864e5) return "Завтра";
      return "Позже";
    };
    const order = ["Просрочено", "Сегодня", "Завтра", "Позже", "Без срока", "Выполнено"];
    list.sort((a, b) => order.indexOf(group(a)) - order.indexOf(group(b)) || (new Date(a.due_at || 8.64e15) - new Date(b.due_at || 8.64e15)));
    let last = "";
    for (const t of list) {
      const g = group(t);
      if (g !== last) { box.append(h("div", { class: `task-group${g === "Просрочено" ? " late" : ""}` }, g)); last = g; }
      const chat = t.chat_id && S.chats.find((c) => c.id === t.chat_id);
      const who = t.assignee_id && t.assignee_id !== S.me.id ? S.profiles.get(t.assignee_id) : null;
      const from = t.assignee_id === S.me.id && t.owner_id !== S.me.id ? S.profiles.get(t.owner_id) : null;
      const row = h("div", { class: `task-row${t.done ? " done" : ""}${g === "Просрочено" ? " late" : ""}`, "data-id": t.id, onclick: () => this.edit(t) },
        h("button", { class: "task-check", title: t.done ? "Вернуть" : "Готово", html: I.tick, onclick: (e) => { e.stopPropagation(); this.toggle(t, row); } }),
        h("div", { class: "mid" },
          h("div", { class: "task-title" }, t.title),
          h("small", null, [t.due_at ? (t.remind ? "⏰ " : "") + fmtWhen(t.due_at) : "", chat ? "👪 " + chatTitle(chat) : "", who ? "→ " + who.name : "", from ? "от: " + from.name : ""].filter(Boolean).join(" · "))),
        who ? avatarEl(who.id, "sm") : null);
      box.append(row);
    }
  },
  edit(t) {
    let close;
    const mine = t.owner_id === S.me.id;
    const title = h("input", { value: t.title, maxlength: 300 });
    const note = h("textarea", { rows: 2, maxlength: 1000, placeholder: "Заметка" }); note.value = t.note || "";
    const pad = (n) => String(n).padStart(2, "0");
    const local = (d) => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const due = h("input", { type: "datetime-local", value: t.due_at ? local(t.due_at) : "" });
    const quick = h("div", { class: "folders" }, [["Сегодня 18:00", () => { const d = new Date(); d.setHours(18, 0, 0, 0); return d; }],
      ["Завтра 9:00", () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }],
      ["Через час", () => new Date(Date.now() + 3600e3)], ["Без срока", () => null]].map(([l, f]) =>
      h("button", { onclick: () => { const d = f(); due.value = d ? local(d) : ""; } }, l)));
    const remind = h("input", { type: "checkbox", checked: t.remind !== false });
    const people = [...S.profiles.values()].filter((p) => !p.banned);
    const assignee = h("select", null, h("option", { value: "" }, "Себе"),
      people.filter((p) => p.id !== S.me.id).map((p) => h("option", { value: p.id, selected: t.assignee_id === p.id }, p.name)));
    if (t.assignee_id === S.me.id) assignee.value = "";
    const groups = S.chats.filter((c) => c.is_group && !c.is_channel);
    const where = h("select", null, h("option", { value: "" }, "Личная"), groups.map((c) => h("option", { value: c.id, selected: t.chat_id === c.id }, "Общая: " + chatTitle(c))));
    close = sheet([
      h("h3", null, t.id ? "Задача" : "Новая задача"),
      h("label", { class: "field" }, h("span", null, "Что сделать"), title),
      h("label", { class: "field" }, note),
      h("label", { class: "field" }, h("span", null, "Когда"), due), quick,
      h("label", { class: "toggle-row" }, h("span", null, "Напомнить в это время"), remind),
      mine ? h("label", { class: "field" }, h("span", null, "Кому"), assignee) : null,
      mine ? h("label", { class: "field" }, h("span", null, "Список"), where) : null,
      h("button", { class: "btn wide", onclick: async () => {
        const v = title.value.trim(); if (!v) { toast("Введите задачу"); return; }
        const fields = { title: v, note: note.value.trim() || null, due_at: due.value ? new Date(due.value).toISOString() : null, remind: remind.checked };
        if (mine) { fields.assignee_id = assignee.value || null; fields.chat_id = where.value || null; }
        close(); await this.update(t, fields); toast("Сохранено");
      } }, "Сохранить"),
      h("button", { class: "menu-item", onclick: () => { close(); this.toggle(t); } }, h("span", { html: I.tick }), t.done ? "Вернуть в активные" : "Отметить выполненной"),
      mine ? h("button", { class: "menu-item danger", onclick: () => { close(); this.remove(t); } }, h("span", { html: I.trash }), "Удалить задачу") : null,
    ]);
  },
};
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// команды ассистента для задач: «добавь задачу…», «напомни…», «мои задачи», «выполнил…», «поручи маме…»
Object.assign(Assistant, {
  taskCommand(text) {
    const t = text.trim().replace(/[.!]+$/, "");
    const low = t.toLowerCase().replace(/ё/g, "е");
    if (this.pending?.type === "taskDue") {
      const p = parseWhen(" " + t);
      const task = Tasks.list.find((x) => x.id === this.pending.id);
      this.pending = null;
      if (p.date && task) { Tasks.update(task, { due_at: p.date.toISOString(), remind: true }); this.say(`Хорошо, напомню ${fmtWhen(p.date)}: «${task.title}».`); return true; }
      if (/^(не надо|нет|никогда|без срока)/.test(low)) { this.say("Хорошо, оставил без напоминания."); return true; }
    }
    if (/^(какие|покажи|мои|что у меня)\s*(у меня\s*)?(задачи|дела|планы)|что (мне )?(нужно|надо) (сделать|сегодня)|список (задач|дел)/.test(low)) {
      const act = Tasks.active();
      if (!act.length) { this.say(this.persona("Задач нет — всё сделано! 🎉")); return true; }
      const sorted = act.slice().sort((a, b) => new Date(a.due_at || 8.64e15) - new Date(b.due_at || 8.64e15)).slice(0, 7);
      this.say(this.persona(`У вас ${act.length} ${plural(act.length, "задача", "задачи", "задач")}: ` + sorted.map((x) => x.title + (x.due_at ? ` (${fmtWhen(x.due_at)})` : "")).join("; ") + "."));
      return true;
    }
    let m = t.match(/^(?:я\s+)?(?:выполнил[аи]?|сделал[аи]?|отметь(?: выполненной)?|закрой задачу|готово)\s+(.+)$/i);
    if (m) {
      const q = m[1].toLowerCase();
      const words = q.split(/\s+/).filter((w) => w.length > 2).map((w) => this.stem(w));
      const task = Tasks.active().map((x) => ({ x, score: words.filter((w) => x.title.toLowerCase().replace(/ё/g, "е").includes(w)).length })).sort((a, b) => b.score - a.score)[0];
      if (!task || !task.score) { this.say("Не нашёл такую задачу. Скажите «мои задачи», чтобы услышать список."); return true; }
      Tasks.toggle(task.x); this.say(this.persona(`Отлично! Задача «${task.x.title}» выполнена ✅`)); return true;
    }
    m = t.match(/^(?:пожалуйста[,\s]+)?(добавь|создай|запиши|поставь)\s+(?:мне\s+)?(?:задачу|дело|в (?:список|задачи)(?: задач)?|в список дел)\s*[:,]?\s*(.+)$/i)
      || t.match(/^(?:пожалуйста[,\s]+)?(напомни)(?:\s+мне)?\s+(.+)$/i)
      || t.match(/^(?:пожалуйста[,\s]+)?(поручи|попроси)\s+(.+)$/i);
    if (!m) return false;
    const verb = m[1].toLowerCase();
    let rest = m[2];
    let assignee = null;
    if (verb === "поручи" || verb === "попроси") {
      const words = rest.split(/\s+/);
      const target = this.findTarget(words.slice(0, 3), false);
      if (!target || target.kind !== "user") { this.say("Кому поручить? Скажите, например: «Поручи маме купить хлеб»."); return true; }
      assignee = target; rest = words.slice(target.used).join(" ");
    }
    const p = parseWhen(" " + rest + " ");
    const title = cap((p.rest || rest).replace(/^(о том,?\s*)?(что|чтобы)\s+/i, "").replace(/^(нужно|надо)\s+/i, "").trim());
    if (!title) { this.say("Что записать в задачу?"); return true; }
    Tasks.add({ title, due_at: p.date?.toISOString(), assignee_id: assignee?.id || null, remind: true }).then((task) => {
      if (!task) { this.say("Не получилось сохранить задачу. Проверьте интернет."); return; }
      if (assignee) this.say(this.persona(`Поручил: ${assignee.name} — «${title}»${p.date ? ", " + fmtWhen(p.date) : ""}. Ей(ему) придёт уведомление.`));
      else if (p.date) this.say(this.persona(`Записал: «${title}». Напомню ${fmtWhen(p.date)} ⏰`));
      else if (verb === "напомни") { this.pending = { type: "taskDue", id: task.id }; this.say(`Записал: «${title}». Когда напомнить? Например: «завтра в 9» или «через час».`); }
      else this.say(this.persona(`Добавил в задачи: «${title}» ✅`));
    });
    return true;
  },
});
