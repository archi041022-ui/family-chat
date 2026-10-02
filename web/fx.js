/* v2.3: свои фоны чатов, мелодии, анимированные эмодзи и стикеры, выборочное удаление,
   анимации отправки и удаления, приватные группы, фон экрана звонка. */
"use strict";

// ───────────── Хранилище файлов на устройстве (фоны, мелодии) ─────────────
const Store = {
  db: null,
  open() {
    if (this.db) return this.db;
    this.db = new Promise((resolve) => {
      try {
        const r = indexedDB.open("semya-files", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("files");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
    return this.db;
  },
  async tx(mode, fn) {
    const db = await this.open(); if (!db) return null;
    return new Promise((resolve) => {
      try {
        const t = db.transaction("files", mode); const st = t.objectStore("files");
        const req = fn(st);
        t.oncomplete = () => resolve(req?.result ?? null);
        t.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  },
  get(k) { return this.tx("readonly", (s) => s.get(k)); },
  set(k, v) { return this.tx("readwrite", (s) => s.put(v, k)); },
  del(k) { return this.tx("readwrite", (s) => s.delete(k)); },
};

// ───────────── Фон чата: свой из галереи или готовый ─────────────
const WALLPAPERS = [
  ["none", "Без фона", ""],
  ["sunset", "Закат", "linear-gradient(160deg, #ffd3a5, #fd6585)"],
  ["sea", "Море", "linear-gradient(160deg, #a1c4fd, #c2e9fb)"],
  ["mint", "Мята", "linear-gradient(160deg, #d4fc79, #96e6a1)"],
  ["lilac", "Сирень", "linear-gradient(160deg, #e0c3fc, #8ec5fc)"],
  ["peach", "Персик", "linear-gradient(160deg, #fbd3e9, #bb377d33)"],
  ["night", "Ночь", "linear-gradient(160deg, #232526, #414345)"],
  ["forest", "Лес", "linear-gradient(160deg, #134e5e, #71b280)"],
  ["sky", "Небо", "radial-gradient(circle at 30% 20%, #fff6, transparent 40%), linear-gradient(160deg, #56ccf2, #2f80ed)"],
  ["candy", "Конфета", "linear-gradient(135deg, #fccb90, #d57eeb)"],
  ["hearts", "Сердечки", "radial-gradient(circle at 20% 30%, #ff9a9e55 0 6%, transparent 7%), radial-gradient(circle at 70% 70%, #fecfef77 0 8%, transparent 9%), linear-gradient(160deg, #ffecd2, #fcb69f)"],
  ["dark", "Графит", "linear-gradient(160deg, #1f1c2c, #928dab)"],
];
const Wallpaper = {
  urls: new Map(),
  key(chatId) { return `wp:${S.me?.id}:${chatId || "default"}`; },
  async resolve(chatId) {
    // своя картинка чата → готовый фон чата → общий фон для всех чатов
    for (const k of [chatId, "default"]) {
      const v = Prefs.get("wp_" + k);
      if (!v) continue;
      if (v === "photo") {
        const key = this.key(k);
        if (!this.urls.has(key)) { const blob = await Store.get(key); if (blob) this.urls.set(key, URL.createObjectURL(blob)); }
        const u = this.urls.get(key); if (u) return { css: `center / cover no-repeat url("${u}")`, photo: true };
      } else {
        const w = WALLPAPERS.find((x) => x[0] === v);
        if (w) return w[0] === "none" ? { css: "", none: true } : { css: w[2] };
      }
    }
    return null;
  },
  async apply(chatId) {
    const box = $("#msgs"); if (!box) return;
    const w = await this.resolve(chatId);
    if (S.current !== chatId) return;
    box.classList.toggle("has-wp", !!w?.css);
    box.classList.toggle("wp-photo", !!w?.photo);
    box.style.background = w?.css || "";
    if (w?.css) box.style.backgroundAttachment = "local";
  },
  sheet(chatId) {
    let close;
    const target = chatId || "default";
    const cur = Prefs.get("wp_" + target) || "";
    const pick = h("input", { type: "file", accept: "image/*", class: "hidden" });
    pick.onchange = async () => {
      const f = pick.files[0]; if (!f) return;
      try {
        const blob = await compressImage(f, 1600, 0.82);
        await Store.set(this.key(target), blob);
        this.urls.delete(this.key(target));
        Prefs.set("wp_" + target, "photo");
        close(); toast("Фон установлен"); if (S.current) this.apply(S.current);
      } catch { toast("Не удалось открыть фото"); }
    };
    const set = (id) => { Prefs.set("wp_" + target, id); close(); if (S.current) this.apply(S.current); };
    close = sheet([
      h("h3", null, chatId ? "Фон этого чата" : "Фон для всех чатов"),
      h("button", { class: "btn wide", onclick: () => pick.click() }, h("span", { html: I.gallery || I.clip }), "Выбрать фото из галереи"), pick,
      h("div", { class: "wp-grid" }, WALLPAPERS.map(([id, name, css]) =>
        h("button", { class: `wp-sw${cur === id ? " on" : ""}`, onclick: () => set(id) }, h("i", { style: { background: css || "var(--chat-bg)" } }), name))),
      chatId && Prefs.get("wp_" + target) ? h("button", { class: "menu-item", onclick: () => { Prefs.set("wp_" + target, ""); Store.del(this.key(target)); close(); this.apply(S.current); } },
        h("span", { html: I.close }), "Как во всех чатах") : null,
      !chatId ? null : h("p", { class: "sheet-note" }, "Фон хранится на этом телефоне и виден только вам."),
    ]);
  },
};

// ───────────── Мелодии (сайт и общий интерфейс настроек) ─────────────
const Snd = {
  loopAudio: null, urls: {},
  async url(kind) {
    if (this.urls[kind]) return this.urls[kind];
    if (!Prefs.get("snd_" + kind)) return null;
    const blob = await Store.get(`snd:${S.me?.id}:${kind}`);
    if (!blob) return null;
    this.urls[kind] = URL.createObjectURL(blob);
    return this.urls[kind];
  },
  async loop(kind) {
    const u = await this.url(kind); if (!u) return false;
    this.stopLoop();
    const a = new Audio(u); a.loop = true; this.loopAudio = a;
    a.play().catch(() => {});
    return true;
  },
  stopLoop() { if (this.loopAudio) { try { this.loopAudio.pause(); } catch { /* */ } this.loopAudio = null; } },
  async once(kind) {
    const u = await this.url(kind); if (!u) return false;
    const a = new Audio(u); a.play().catch(() => {}); setTimeout(() => a.pause(), 7000);
    return true;
  },
  // звук нового сообщения в открытом приложении
  message() {
    if (window.AndroidBridge?.playMessageSound) { window.AndroidBridge.playMessageSound(); return; }
    this.once("msg").then((ok) => { if (!ok) beep(); });
  },
  title(kind) {
    if (window.AndroidBridge?.soundTitle) { try { return window.AndroidBridge.soundTitle(kind); } catch { /* */ } }
    return Prefs.get("snd_" + kind) || "По умолчанию";
  },
  sheet() {
    let close;
    const rows = {};
    const row = (kind, label) => {
      const val = h("small", { class: "sub" }, this.title(kind));
      rows[kind] = val;
      const file = h("input", { type: "file", accept: "audio/*", class: "hidden" });
      file.onchange = async () => {
        const f = file.files[0]; if (!f) return;
        if (f.size > 15 * 1024 * 1024) { toast("Файл больше 15 МБ"); return; }
        await Store.set(`snd:${S.me?.id}:${kind}`, f);
        if (this.urls[kind]) URL.revokeObjectURL(this.urls[kind]); delete this.urls[kind];
        Prefs.set("snd_" + kind, f.name.replace(/\.[^.]+$/, "").slice(0, 60));
        val.textContent = this.title(kind); toast("Мелодия установлена");
      };
      const b = window.AndroidBridge;
      return h("div", { class: "snd-row" },
        h("div", { class: "snd-head" }, h("span", { class: "tg-ico", style: { background: kind === "ring" ? "#2EAD6B" : "#E0457B" }, html: kind === "ring" ? I.phone : I.bell }),
          h("span", null, label, val)),
        h("div", { class: "snd-btns" },
          b?.pickSound ? h("button", { class: "btn small ghost", onclick: () => b.pickSound(kind, "system") }, "Мелодии телефона") : null,
          h("button", { class: "btn small ghost", onclick: () => (b?.pickSound ? b.pickSound(kind, "file") : file.click()) }, "Свой файл"), file,
          h("button", { class: "btn small ghost", title: "Прослушать", onclick: () => { if (b?.previewSound) b.previewSound(kind); else this.once(kind).then((ok) => { if (!ok) kind === "ring" ? beep([660, 880, 660, 880], 0.18) : beep(); }); } }, "▶"),
          h("button", { class: "btn small ghost", title: "Сбросить", onclick: () => {
            if (b?.resetSound) b.resetSound(kind);
            Prefs.set("snd_" + kind, ""); Store.del(`snd:${S.me?.id}:${kind}`); delete this.urls[kind];
            val.textContent = this.title(kind); toast("Стандартная мелодия");
          } }, "↺")));
    };
    window.onSoundPicked = (kind, title) => { if (rows[kind]) rows[kind].textContent = title; toast("Мелодия установлена"); };
    close = sheet([
      h("h3", null, "Мелодии"),
      row("ring", "Мелодия звонка"),
      row("msg", "Звук уведомлений"),
      h("p", { class: "sheet-note" }, "Подойдёт любая мелодия из телефона или свой аудиофайл (MP3, M4A, OGG). В режиме «Без звука» телефон не звонит, в режиме «Вибрация» — только вибрирует."),
    ], () => { window.AndroidBridge?.stopPreview?.(); });
  },
};

// ───────────── Эмодзи и анимированные стикеры ─────────────
const EMOJI_SETS = [
  ["😀", "Смайлы", "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤐 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 🤡 👻 👽 🤖 💩"],
  ["👍", "Жесты", "👋 🤚 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 💪 🦾 👀 👅 👄 💋 🧠 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 👪 💑 💏"],
  ["❤️", "Сердца", "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 😻 💌 💐 🌹 🌷 🌸 🌺 🌻 🌼"],
  ["🐶", "Животные", "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦉 🐴 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🦖 🐙 🦀 🐠 🐬 🐳 🦈 🐊 🦒 🐘 🦔 🐾"],
  ["🍕", "Еда", "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥕 🌽 🥔 🥐 🍞 🧀 🥚 🍳 🥞 🥓 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🍝 🍜 🍲 🍣 🍤 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍯 ☕ 🍵 🥤 🍺 🍷 🥂"],
  ["🎉", "Праздники", "🎉 🎊 🎈 🎁 🎀 🎂 🕯️ 🎄 🎆 🎇 ✨ 🎃 🏆 🥇 🎯 🎮 🎲 🧸 🎵 🎶 🎤 🎧 📸 🎬 ⚽ 🏀 🏐 🎾 🏓 🎣 🚗 ✈️ 🚀 ⛵ 🏠 🏡 🌍 🌈 ☀️ ⛅ 🌧️ ❄️ ⛄ 🔥 💧 🌊 ⭐ 🌙"],
];
// анимированные стикеры (Noto Animated Emoji от Google, CC BY 4.0)
const STICKERS = "😂 🤣 😍 🥰 😘 😊 😎 🤩 🥳 😜 🤪 😇 🤗 🤔 😴 😭 😱 😡 🤯 🥺 😬 🙄 👍 👏 🙏 💪 👋 🤝 ❤️ 💔 🔥 ✨ 🎉 🎂 🎁 🌹 🌸 ☀️ 🌈 ⭐ 💯 👀 🐶 🐱 🦄 🐻 🐼 🤖 👻 💩 🍕 ☕".split(" ");

const Emoji = {
  only(text) {
    if (!text) return null;
    const t = String(text).trim();
    if (t.length > 24 || /[\p{L}\p{N}]/u.test(t.replace(/[\u{1F1E6}-\u{1F1FF}#*0-9]️?⃣?/gu, ""))) return null;
    const parts = [...new Intl.Segmenter("ru", { granularity: "grapheme" }).segment(t)].map((x) => x.segment).filter((x) => x.trim());
    if (!parts.length || parts.length > 3) return null;
    return parts.every((p) => /\p{Extended_Pictographic}/u.test(p)) ? parts : null;
  },
  code(e) { return [...e].map((c) => c.codePointAt(0).toString(16)).filter((c) => c !== "fe0f" && c !== "200d").join("_"); },
  anim(e) { return `https://fonts.gstatic.com/s/e/notoemoji/latest/${this.code(e)}/512.webp`; },
  // большое «живое» эмодзи в сообщении (если анимации нет — обычный крупный значок)
  bigEl(parts) {
    return h("div", { class: `big-emoji n${parts.length}` }, parts.map((e) => {
      const img = h("img", { src: this.anim(e), alt: e, loading: "lazy", draggable: false });
      img.onerror = () => img.replaceWith(h("span", null, e));
      return img;
    }));
  },
  recent() { return (Prefs.get("emojiRecent") || []).slice(0, 24); },
  remember(e) { const r = [e, ...this.recent().filter((x) => x !== e)].slice(0, 24); Prefs.set("emojiRecent", r); },
  panel(ta) {
    let close;
    const body = h("div", { class: "emoji-body" });
    const tabs = h("div", { class: "folders emoji-tabs" });
    const show = (k) => {
      tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.k === k));
      body.innerHTML = "";
      if (k === "stickers") {
        body.append(h("p", { class: "sheet-note" }, "Нажмите — отправится анимированный стикер"),
          h("div", { class: "sticker-grid" }, STICKERS.map((e) => {
            const img = h("img", { src: this.anim(e), alt: e, loading: "lazy" });
            img.onerror = () => img.replaceWith(h("span", { class: "st-fallback" }, e));
            return h("button", { onclick: () => { close(); this.remember(e); FX.sendAnim(); postMessage({ body: e }); } }, img);
          })));
        return;
      }
      if (k === "gif") {
        const file = h("input", { type: "file", accept: "image/gif,image/webp,video/mp4", class: "hidden" });
        file.onchange = async () => { const f = file.files[0]; if (!f) return; close(); FX.sendAnim(); await sendFile(f); };
        body.append(h("div", { class: "gif-pane" },
          h("div", { class: "gif-hero" }, "🎞️"),
          h("p", null, "Отправьте GIF-анимацию или короткое видео из галереи — оно будет проигрываться прямо в чате."),
          h("button", { class: "btn wide", onclick: () => file.click() }, "Выбрать GIF из галереи"), file));
        return;
      }
      const list = k === "recent" ? this.recent() : (EMOJI_SETS.find((x) => x[0] === k)?.[2] || "").split(" ");
      if (!list.length) { body.append(h("p", { class: "empty-chat" }, "Здесь появятся недавние эмодзи")); return; }
      body.append(h("div", { class: "emoji-grid" }, list.map((e) => h("button", { onclick: () => {
        this.remember(e);
        const s = ta.selectionStart ?? ta.value.length, en = ta.selectionEnd ?? ta.value.length;
        ta.value = ta.value.slice(0, s) + e + ta.value.slice(en);
        ta.dispatchEvent(new Event("input"));
        try { ta.setSelectionRange(s + e.length, s + e.length); } catch { /* */ }
      } }, e))));
    };
    const tab = (k, label) => h("button", { "data-k": k, onclick: () => show(k) }, label);
    tabs.append(tab("stickers", "✨ Стикеры"), tab("gif", "GIF"), tab("recent", "🕘"), ...EMOJI_SETS.map(([k]) => tab(k, k)));
    close = sheet([tabs, body]);
    show(this.recent().length ? "recent" : "stickers");
  },
};

// ───────────── Анимации: отправка, удаление, «рассыпание» ─────────────
const FX = {
  fresh: new Map(),      // id сообщения → время начала анимации появления
  add(id) { this.fresh.set(id, { t: Date.now(), sparkled: false }); },
  // сообщение получило настоящий id после отправки — анимация продолжается, а не начинается заново
  carry(from, to) { const v = this.fresh.get(from); if (v) { this.fresh.delete(from); this.fresh.set(to, v); } },
  decorate(el, m) {
    const v = this.fresh.get(m.id); if (!v) return;
    const age = Date.now() - v.t;
    if (age > 700) { this.fresh.delete(m.id); return; }
    const mine = m.user_id === S.me.id;
    el.classList.add(mine ? "just-sent" : "just-in");
    const b = el.querySelector(".bubble"); if (b && age > 0) b.style.animationDelay = `-${age}ms`;
    if (mine && !v.sparkled) { v.sparkled = true; requestAnimationFrame(() => setTimeout(() => this.sparkle(el.querySelector(".bubble")), 120)); }
  },
  sendAnim() { this.armed = Date.now(); },
  // «рассыпание» в пыль (как в Telegram) — затем вызывает done
  dust(el) {
    return new Promise((resolve) => {
      if (!el || !el.getBoundingClientRect || matchMedia("(prefers-reduced-motion: reduce)").matches) { resolve(); return; }
      const r = el.getBoundingClientRect();
      if (!r.width) { resolve(); return; }
      const bg = getComputedStyle(el).backgroundColor || "#999";
      const layer = h("div", { class: "dust-layer" });
      const n = Math.min(90, Math.max(30, Math.round((r.width * r.height) / 500)));
      for (let i = 0; i < n; i++) {
        const p = h("i");
        const x = Math.random() * r.width, y = Math.random() * r.height;
        p.style.left = r.left + x + "px"; p.style.top = r.top + y + "px";
        p.style.background = i % 4 === 0 ? "var(--accent)" : bg;
        const s = 3 + Math.random() * 5; p.style.width = p.style.height = s + "px";
        p.style.setProperty("--dx", (Math.random() * 120 - 30).toFixed(0) + "px");
        p.style.setProperty("--dy", (-40 - Math.random() * 90).toFixed(0) + "px");
        p.style.animationDelay = ((x / r.width) * 0.35).toFixed(2) + "s";
        layer.append(p);
      }
      document.body.append(layer);
      el.classList.add("dissolving");
      setTimeout(() => { layer.remove(); resolve(); }, 900);
    });
  },
  // искры при отправке
  sparkle(el) {
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const layer = h("div", { class: "spark-layer" });
    for (let i = 0; i < 10; i++) {
      const p = h("i", null, ["✨", "💫", "⭐"][i % 3]);
      p.style.left = r.left + r.width * Math.random() + "px"; p.style.top = r.top + r.height * Math.random() + "px";
      p.style.setProperty("--dx", (Math.random() * 80 - 40).toFixed(0) + "px");
      p.style.setProperty("--dy", (-30 - Math.random() * 50).toFixed(0) + "px");
      p.style.animationDelay = (Math.random() * 0.15).toFixed(2) + "s";
      layer.append(p);
    }
    document.body.append(layer); setTimeout(() => layer.remove(), 1100);
  },
};

// ───────────── Выбор нескольких сообщений и удаление ─────────────
const Select = {
  ids: new Set(), on: false,
  hiddenKey() { return "hidden:" + S.me?.id; },
  hidden() {
    if (!this._h || this._hu !== S.me?.id) {
      this._hu = S.me?.id;
      try { this._h = new Set(JSON.parse(localStorage.getItem(this.hiddenKey()) || "[]")); } catch { this._h = new Set(); }
    }
    return this._h;
  },
  hide(ids) {
    const s = this.hidden(); ids.forEach((id) => s.add(id));
    try { localStorage.setItem(this.hiddenKey(), JSON.stringify([...s].slice(-5000))); } catch { /* */ }
  },
  // сообщение скрыто «у меня» или история очищена
  isHidden(m) {
    if (this.hidden().has(m.id)) return true;
    const cl = Prefs.get("cleared") || {};
    return !!cl[m.chat_id] && new Date(m.created_at).getTime() <= cl[m.chat_id];
  },
  start(m) {
    this.on = true; this.ids = new Set(m ? [m.id] : []);
    $("#chatView")?.classList.add("selecting");
    this.bar(); this.mark();
  },
  stop() {
    this.on = false; this.ids.clear();
    $("#chatView")?.classList.remove("selecting");
    $("#selBar")?.remove(); this.mark();
  },
  toggle(m) {
    if (String(m.id).startsWith("tmp-")) return;
    if (this.ids.has(m.id)) this.ids.delete(m.id); else this.ids.add(m.id);
    if (!this.ids.size) { this.stop(); return; }
    this.bar(); this.mark();
  },
  mark() {
    document.querySelectorAll("#msgs .msg[data-id]").forEach((el) => el.classList.toggle("selected", this.ids.has(el.dataset.id)));
  },
  bar() {
    const view = $("#chatView"); if (!view) return;
    let b = $("#selBar");
    const n = this.ids.size;
    const label = `Выбрано: ${n}`;
    if (!b) {
      b = h("div", { class: "sel-bar", id: "selBar" },
        h("button", { class: "icon-btn", title: "Отменить", html: I.close, onclick: () => this.stop() }),
        h("b", { class: "sel-count" }, label),
        Protect.on(S.chats.find((c) => c.id === S.current)) ? null : h("button", { class: "icon-btn", title: "Копировать", html: I.copy, onclick: () => this.copy() }),
        Protect.on(S.chats.find((c) => c.id === S.current)) ? null : h("button", { class: "icon-btn", title: "Переслать", html: I.forward, onclick: () => this.forward() }),
        h("button", { class: "icon-btn danger", title: "Удалить", html: I.trash, onclick: () => this.askDelete() }));
      view.querySelector(".topbar")?.after(b);
    } else b.querySelector(".sel-count").textContent = label;
  },
  list() { return (S.msgs.get(S.current) || []).filter((m) => this.ids.has(m.id)); },
  async copy() {
    const t = this.list().filter((m) => m.body && !m.deleted).map((m) => Tg.text(m.body)).join("\n");
    if (t) await copyText(t, "Скопировано");
    this.stop();
  },
  forward() {
    const l = this.list();
    if (l.length !== 1) { toast("Пересылать можно по одному сообщению"); return; }
    this.stop(); Tg.forward(l[0]);
  },
  askDelete() {
    const l = this.list(); if (!l.length) return;
    const mine = l.filter((m) => m.user_id === S.me.id && !m.deleted);
    let close;
    const n = l.length;
    close = sheet([
      h("h3", null, `Удалить ${n} ${plural(n, "сообщение", "сообщения", "сообщений")}?`),
      mine.length ? h("button", { class: "menu-item danger", onclick: () => { close(); this.remove(l, true); } }, h("span", { html: I.trash }),
        mine.length === n ? "Удалить у всех" : `Удалить у всех мои (${mine.length}), остальные — у меня`) : null,
      h("button", { class: "menu-item", onclick: () => { close(); this.remove(l, false); } }, h("span", { html: I.trash }), "Удалить только у меня"),
      h("button", { class: "menu-item", onclick: () => close() }, h("span", { html: I.close }), "Отмена"),
    ]);
  },
  async remove(list, forAll) {
    const els = list.map((m) => document.querySelector(`#msgs .msg[data-id="${m.id}"] .bubble`)).filter(Boolean);
    this.stop();
    await Promise.all(els.map((el) => FX.dust(el)));
    const mine = forAll ? list.filter((m) => m.user_id === S.me.id && !m.deleted) : [];
    const others = list.filter((m) => !mine.includes(m));
    if (others.length) this.hide(others.map((m) => m.id));
    let failed = 0;
    for (const m of mine) {
      const { error } = await S.sb.from("messages").update({ deleted: true, body: null, media_path: null, media_type: null, media_name: null }).eq("id", m.id);
      if (error) failed++; else Object.assign(m, { deleted: true, body: null, media_path: null, media_type: null });
    }
    if (mine.length) this.hide(mine.filter((m) => m.deleted).map((m) => m.id));   // у себя убираем совсем, у других — «удалено»
    renderMessages(false); renderChatList();
    toast(failed ? "Часть сообщений не удалилась — проверьте интернет" : "Удалено");
  },
  clearHistory(c) {
    let close;
    close = sheet([
      h("h3", null, "Очистить историю?"),
      h("p", { class: "sheet-note" }, "Сообщения исчезнут только у вас. У остальных участников переписка останется."),
      h("button", { class: "menu-item danger", onclick: async () => {
        close();
        const els = [...document.querySelectorAll("#msgs .msg .bubble")].slice(-12);
        await Promise.all(els.map((el) => FX.dust(el)));
        const cl = Prefs.get("cleared") || {}; cl[c.id] = Date.now(); Prefs.set("cleared", cl);
        renderMessages(true); renderChatList(); toast("История очищена");
      } }, h("span", { html: I.trash }), "Очистить у меня"),
      h("button", { class: "menu-item", onclick: () => close() }, h("span", { html: I.close }), "Отмена"),
    ]);
  },
};

// ───────────── Приватные группы ─────────────
const Groups = {
  isOwner(c) { return !!c && c.is_group && (c.created_by === S.me.id || S.isAdmin); },
  async uploadPhoto(chatId, file) {
    const blob = await compressImage(file, 600, 0.85);
    const path = `${chatId}/group-${Date.now()}.jpg`;
    const { error } = await S.sb.storage.from("media").upload(path, blob, { contentType: "image/jpeg" });
    if (error) throw error;
    await signUrls([path]);
    return path;
  },
  async refresh(chatId) {
    await loadChats(); renderChatList();
    Live.broadcast("chats", { chat_id: chatId });
  },
  // создание: название, описание, фото, участники
  create() {
    let close, photo = null;
    const title = h("input", { placeholder: "Название группы", maxlength: 80 });
    const desc = h("textarea", { rows: 2, maxlength: 300, placeholder: "Описание (необязательно)" });
    const pic = h("input", { type: "file", accept: "image/*", class: "hidden" });
    const av = h("button", { class: "group-photo-pick", title: "Фото группы", onclick: () => pic.click() }, "📷");
    pic.onchange = () => { photo = pic.files[0] || null; if (photo) { av.textContent = ""; av.style.background = `center/cover url("${URL.createObjectURL(photo)}")`; } };
    const people = [...S.profiles.values()].filter((p) => p.id !== S.me.id && !p.banned).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const picks = people.map((p) => h("label", null, h("input", { type: "checkbox", value: p.id }), avatarEl(p.id, "sm"), p.name, p.family_role ? h("small", { class: "sub" }, " · " + p.family_role) : null));
    const listedBox = h("input", { type: "checkbox", checked: true });
    const modBox = h("input", { type: "checkbox" });
    close = sheet([
      h("h3", null, "Новая приватная группа"),
      h("div", { class: "group-create-head" }, av, pic, h("label", { class: "field", style: { flex: 1, margin: 0 } }, title)),
      h("label", { class: "field" }, desc),
      h("p", { class: "sheet-note" }, "🔒 Переписку видят только участники группы."),
      h("label", { class: "toggle-row" }, h("span", null, "Принимать заявки на вступление", h("small", null, "Группу видно в поиске, остальные могут попроситься — вы одобряете")), listedBox),
      h("label", { class: "toggle-row" }, h("span", null, "Сообщения участников — после одобрения", h("small", null, "Вы проверяете и публикуете их сами")), modBox),
      h("div", { class: "section-title", style: { padding: "4px 4px 6px" } }, "Участники"),
      h("div", { class: "people-pick" }, picks),
      h("button", { class: "btn wide", style: { marginTop: "12px" }, onclick: async (e) => {
        const ids = picks.map((l) => l.querySelector("input")).filter((i) => i.checked).map((i) => i.value);
        if (!title.value.trim()) { toast("Введите название"); return; }
        e.currentTarget.disabled = true;
        const { data: id, error } = await S.sb.rpc("create_group", { title: title.value.trim(), members: ids });
        if (error || !id) { e.currentTarget.disabled = false; toast("Не удалось создать группу"); return; }
        let avatar = null;
        try { if (photo) avatar = await this.uploadPhoto(id, photo); } catch { toast("Фото не загрузилось — можно добавить позже"); }
        if (desc.value.trim() || avatar) await S.sb.rpc("group_update", { cid: id, new_title: title.value.trim(), new_description: desc.value.trim(), new_avatar: avatar });
        if (listedBox.checked || modBox.checked) await S.sb.rpc("chat_settings2", { cid: id, settings: { listed: listedBox.checked, moderated: modBox.checked } });
        close(); await this.refresh(id); openChat(id);
        FX.sparkle($("#chatView .topbar"));
      } }, "Создать группу"),
    ]);
  },
  // карточка группы
  info(c) {
    let close;
    const owner = this.isOwner(c);
    const mem = (S.members.get(c.id) || []).map((m) => S.profiles.get(m.user_id)).filter(Boolean)
      .sort((a, b) => (b.id === c.created_by) - (a.id === c.created_by) || a.name.localeCompare(b.name, "ru"));
    const family = c.id === FAMILY_CHAT;
    close = sheet([
      h("div", { class: "pv-head" }, chatAvatar(c, "xl"), h("h2", null, chatTitle(c)),
        h("small", null, c.is_channel ? `${c.is_private ? "🔒 Приватный канал" : "🌐 Открытый канал"} · ${mem.length} ${plural(mem.length, "подписчик", "подписчика", "подписчиков")}`
          : `${family ? "Вся семья" : "🔒 Приватная группа"} · ${mem.length} ${plural(mem.length, "участник", "участника", "участников")}`)),
      c.description ? h("div", { class: "pv-info" }, h("div", { class: "info-row" }, h("span", { class: "info-ico" }, "📝"), h("div", null, h("div", { class: "info-val" }, c.description), h("small", null, "Описание")))) : null,
      h("div", { class: "pv-actions" },
        h("button", { class: "pv-act", onclick: () => { close(); GroupCall.start(c.id, true); } }, h("span", { html: I.video }), "Видеочат"),
        h("button", { class: "pv-act", onclick: () => { close(); Tg.mediaOfChat(c); } }, h("span", { html: I.gallery || I.clip }), "Медиа"),
        h("button", { class: "pv-act", onclick: () => { close(); Wallpaper.sheet(c.id); } }, h("span", { html: I.palette }), "Фон")),
      owner && !family ? h("button", { class: "menu-item", onclick: () => { close(); this.edit(c); } }, h("span", { html: I.pen }), "Изменить название, описание, фото") : null,
      owner ? h("button", { class: "menu-item", onclick: () => { close(); this.addMembers(c); } }, h("span", { html: I.invite }), c.is_channel ? "Добавить подписчиков" : "Добавить участников") : null,
      Joins.block(c, () => close()),
      ...ChatSettings.rows(c),
      Protect.canChange(c) ? h("label", { class: "toggle-row" }, h("span", null, "🛡 Защита содержимого", h("small", null, "Запрет копирования, пересылки, сохранения и снимков экрана")),
        h("input", { type: "checkbox", checked: !!c.protected, onchange: () => { close(); Protect.toggle(c); } })) : null,
      h("div", { class: "section-title", style: { padding: "8px 4px 4px" } }, "Участники"),
      ...mem.map((p) => h("div", { class: "member-row" },
        h("button", { class: "menu-item", onclick: () => { close(); Tg.profileView(p.id); } }, avatarEl(p.id, "sm"),
          h("span", null, p.name + (p.id === S.me.id ? " (вы)" : ""), h("small", { class: "sub" }, [p.id === c.created_by ? "создатель" : "", p.family_role || ""].filter(Boolean).join(" · ")))),
        owner && !family && p.id !== S.me.id ? h("button", { class: "icon-btn", title: "Убрать из группы", html: I.close, onclick: async () => {
          const { data } = await S.sb.rpc("group_remove_member", { cid: c.id, target: p.id });
          if (data !== "OK") { toast("Не получилось"); return; }
          close(); toast(`${p.name} больше не в группе`); await this.refresh(c.id); const fresh = S.chats.find((x) => x.id === c.id); if (fresh) this.info(fresh);
        } }) : null)),
      family ? null : h("button", { class: "menu-item danger", style: { marginTop: "8px" }, onclick: () => { close(); this.leave(c); } }, h("span", { html: I.logout }), c.is_channel ? "Покинуть канал" : "Выйти из группы"),
      c.created_by === S.me.id && !family ? h("button", { class: "menu-item danger", onclick: () => { close(); this.remove(c); } }, h("span", { html: I.trash }), c.is_channel ? "Удалить канал" : "Удалить группу") : null,
    ]);
  },
  edit(c) {
    let close, photo = null, removePhoto = false;
    const title = h("input", { value: c.title || "", maxlength: 80 });
    const desc = h("textarea", { rows: 3, maxlength: 300, placeholder: "Описание" }); desc.value = c.description || "";
    const pic = h("input", { type: "file", accept: "image/*", class: "hidden" });
    const av = h("div", { class: "group-photo-pick big", onclick: () => pic.click() }, chatAvatar(c, "lg"));
    pic.onchange = () => { photo = pic.files[0] || null; if (photo) { av.innerHTML = ""; av.style.background = `center/cover url("${URL.createObjectURL(photo)}")`; } };
    close = sheet([
      h("h3", null, "Изменить группу"),
      h("div", { class: "profile-card" }, av, pic, h("small", { style: { color: "var(--muted)" } }, "Нажмите, чтобы сменить фото")),
      c.avatar_path ? h("button", { class: "menu-item", onclick: (e) => { removePhoto = true; photo = null; e.currentTarget.remove(); av.innerHTML = ""; av.style.background = ""; av.append(h("div", { class: "avatar lg", style: { background: colorFor(c.id) } }, initials(c.title))); } }, h("span", { html: I.trash }), "Убрать фото") : null,
      h("label", { class: "field" }, h("span", null, "Название"), title),
      h("label", { class: "field" }, h("span", null, "Описание"), desc),
      h("button", { class: "btn wide", onclick: async (e) => {
        e.currentTarget.disabled = true;
        let avatar = removePhoto ? "" : null;
        try { if (photo) avatar = await this.uploadPhoto(c.id, photo); } catch { toast("Фото не загрузилось"); }
        const { data } = await S.sb.rpc("group_update", { cid: c.id, new_title: title.value, new_description: desc.value, new_avatar: avatar });
        if (data !== "OK") { e.currentTarget.disabled = false; toast("Изменять группу может только её создатель"); return; }
        close(); toast("Сохранено"); await this.refresh(c.id);
        if (S.current === c.id) { const id = c.id; S.current = null; openChat(id); }
      } }, "Сохранить"),
    ]);
  },
  addMembers(c) {
    let close;
    const inGroup = new Set((S.members.get(c.id) || []).map((m) => m.user_id));
    const people = [...S.profiles.values()].filter((p) => !inGroup.has(p.id) && !p.banned);
    const picks = people.map((p) => h("label", null, h("input", { type: "checkbox", value: p.id }), avatarEl(p.id, "sm"), p.name));
    close = sheet([
      h("h3", null, "Добавить в группу"),
      people.length ? h("div", { class: "people-pick" }, picks) : h("p", { class: "empty-chat" }, "Все члены семьи уже в группе"),
      people.length ? h("button", { class: "btn wide", style: { marginTop: "12px" }, onclick: async () => {
        const ids = picks.map((l) => l.querySelector("input")).filter((i) => i.checked).map((i) => i.value);
        if (!ids.length) { toast("Отметьте, кого добавить"); return; }
        const { data } = await S.sb.rpc("group_add_members", { cid: c.id, members: ids });
        if (data !== "OK") { toast("Добавлять может только создатель группы"); return; }
        close(); toast("Добавлено"); await this.refresh(c.id);
        const names = ids.map((id) => S.profiles.get(id)?.name).filter(Boolean).join(", ");
        postMessage({ body: `➕ ${S.me.name} добавил(а) в группу: ${names}` }, c.id);
      } }, "Добавить") : null,
    ]);
  },
  leave(c) {
    let close;
    close = sheet([
      h("h3", null, `Выйти из «${chatTitle(c)}»?`),
      h("p", { class: "sheet-note" }, c.created_by === S.me.id ? "Вы создатель — группа перейдёт к другому участнику." : "Вернуться можно, только если вас снова добавят."),
      h("button", { class: "menu-item danger", onclick: async () => {
        close();
        await postMessage({ body: `👋 ${S.me.name} вышел(-ла) из группы` }, c.id);
        const { data } = await S.sb.rpc("group_leave", { cid: c.id });
        if (data !== "OK") { toast("Не получилось выйти"); return; }
        if (S.current === c.id) closeChat();
        await this.refresh(c.id); toast("Вы вышли из группы");
      } }, h("span", { html: I.logout }), "Выйти"),
      h("button", { class: "menu-item", onclick: () => close() }, h("span", { html: I.close }), "Отмена"),
    ]);
  },
  remove(c) {
    let close;
    close = sheet([
      h("h3", null, `Удалить группу «${chatTitle(c)}»?`),
      h("p", { class: "sheet-note" }, "Группа и вся её переписка исчезнут у всех участников. Отменить нельзя."),
      h("button", { class: "menu-item danger", onclick: async () => {
        close();
        const { data } = await S.sb.rpc("group_delete", { cid: c.id });
        if (data !== "OK") { toast("Удалить может только создатель"); return; }
        if (S.current === c.id) closeChat();
        await this.refresh(c.id); toast("Группа удалена");
      } }, h("span", { html: I.trash }), "Удалить навсегда"),
      h("button", { class: "menu-item", onclick: () => close() }, h("span", { html: I.close }), "Отмена"),
    ]);
  },
};

// ───────────── Фон экрана звонка: фото собеседника или цвет темы ─────────────
function callBackdrop(el, userId, chat) {
  if (!el) return;
  let url = null;
  if (userId) { const p = S.profiles.get(userId); url = p?.avatar_path && S.urls.get(p.avatar_path); }
  if (!url && chat?.avatar_path) url = S.urls.get(chat.avatar_path);
  const bg = h("div", { class: `call-bg${url ? " photo" : ""}` });
  if (url) bg.style.backgroundImage = `url("${url}")`;
  // без фото — цвет оформления приложения
  el.prepend(bg);
}
