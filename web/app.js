/* Семейный мессенджер: чаты, реакции, фото, видео, голосовые, звонки.
   Сервер — Supabase (база + хранилище + мгновенная доставка), звонки — WebRTC. */
"use strict";

const CFG = window.CHAT_CONFIG || {};
const FAMILY_CHAT = "00000000-0000-0000-0000-000000000001";
const EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🙏", "🎉"];
const PAGE = 50;
const STATUS_PRESETS = ["🏠 Дома", "💼 На работе", "🚗 В дороге", "😴 Сплю", "🍽 Обедаю", "📵 Не беспокоить", "🎉 Праздную"];
const COLORS = ["#E8664F", "#3D8BFD", "#2EAD6B", "#9B5DE5", "#F2A541", "#00A6A6", "#E0457B", "#6C7A89"];

// ───────────── Иконки ─────────────
const I = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.99.99 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0M12 17v4"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M9 9v1a3 3 0 005.1 2.1M15 9.3V5a3 3 0 00-5.9-.7M17 16.9A7 7 0 015 10m14 0a7 7 0 01-.1 1.2M12 17v4"/></svg>',
  clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11.1l-9.2 9.2a6 6 0 01-8.5-8.5l9.2-9.2a4 4 0 015.7 5.7l-9.2 9.2a2 2 0 01-2.8-2.8l8.5-8.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 013 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>',
  videoOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M17 13.5l4 4v-11l-4 4V7a1 1 0 00-1-1h-6M4 6a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 00.7-.3"/></svg>',
  flip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-3l-2-3H9L7 7H4a1 1 0 00-1 1v11a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1z"/><path d="M9 13a3 3 0 015-2.2M15 13a3 3 0 01-5 2.2M14 9v2h-2M10 17v-2h2"/></svg>',
  hang: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-1.6 0-3.1.3-4.6.7v3.1c0 .4-.2.7-.6.9-1 .5-1.9 1.1-2.7 1.8-.2.2-.4.3-.7.3s-.5-.1-.7-.3L.3 13.1A1 1 0 010 12.4c0-.3.1-.5.3-.7C3.3 8.8 7.4 7 12 7s8.7 1.8 11.7 4.7c.2.2.3.4.3.7 0 .3-.1.5-.3.7l-2.5 2.4c-.2.2-.4.3-.7.3s-.5-.1-.7-.3c-.8-.7-1.7-1.3-2.7-1.8-.3-.2-.6-.5-.6-.9V9.7C15.1 9.3 13.6 9 12 9z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>',
  reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17l-5-5 5-5"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  group: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0114 0M16 4a4 4 0 010 8M22 21a7 7 0 00-4-6.3"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-5A8 8 0 1121 12z"/></svg>',
  story: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" stroke-dasharray="4 2.2"/><circle cx="12" cy="12" r="4.5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M16 7l3 3M18 5l2 2"/></svg>',
  screen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M9 10l3-3 3 3M12 7v6"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
};

// ───────────── Помощники ─────────────
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}
const $ = (s, r = document) => r.querySelector(s);
const fmtTime = (d) => new Date(d).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
function fmtDay(d) {
  const x = new Date(d), now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (x.toDateString() === now.toDateString()) return "Сегодня";
  if (x.toDateString() === y.toDateString()) return "Вчера";
  return x.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: x.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
function fmtListTime(d) {
  const x = new Date(d), now = new Date();
  if (x.toDateString() === now.toDateString()) return fmtTime(d);
  if (now - x < 6 * 864e5) return x.toLocaleDateString("ru-RU", { weekday: "short" });
  return x.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}
const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function colorFor(id) { let n = 0; for (const c of String(id)) n = (n * 31 + c.charCodeAt(0)) >>> 0; return COLORS[n % COLORS.length]; }
function initials(name) { return (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase(); }
function toast(text, ms = 2600) {
  document.querySelectorAll(".toast").forEach((x) => x.remove());
  const t = h("div", { class: "toast" }, text); document.body.append(t); setTimeout(() => t.remove(), ms);
}
function linkify(text) {
  const frag = document.createDocumentFragment();
  const re = /(https?:\/\/[^\s<]+)/g; let last = 0, m;
  while ((m = re.exec(text))) {
    frag.append(text.slice(last, m.index));
    frag.append(h("a", { href: m[1], target: "_blank", rel: "noopener noreferrer" }, m[1]));
    last = m.index + m[1].length;
  }
  frag.append(text.slice(last));
  return frag;
}
function sheet(content, onClose) {
  const back = h("div", { class: "sheet-back" });
  const box = h("div", { class: "sheet" }, content);
  const close = () => { back.remove(); onClose && onClose(); };
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  back.append(box); document.body.append(back);
  return close;
}

// ───────────── Состояние ─────────────
const S = {
  sb: null, me: null, profiles: new Map(), chats: [], members: new Map(), // chatId -> [{user_id,last_read_at}]
  current: null, msgs: new Map(), reacts: new Map(), // messageId -> [{user_id,emoji}]
  hasMore: new Map(), urls: new Map(), online: new Set(), lastByChat: new Map(), unread: new Map(),
  replyTo: null, filter: "",
};
const app = $("#app");

// ───────────── Запуск ─────────────
(async function start() {
  if (!CFG.supabaseUrl || !CFG.supabaseKey || !window.supabase) {
    app.append(h("div", { class: "auth" },
      h("img", { class: "logo", src: "icon-192.png", alt: "" }),
      h("h1", null, CFG.appName || "Семья"),
      h("p", { class: "setup-note" }, !window.supabase
        ? "Нет связи с интернетом. Проверьте подключение и откройте приложение снова."
        : "Мессенджер ещё не подключён к серверу: укажите адрес и ключ Supabase в файле config.js.")));
    return;
  }
  S.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  const { data } = await S.sb.auth.getSession();
  if (data.session) await enter(data.session.user);
  else showAuth();
})();

// ───────────── Вход и регистрация ─────────────
function showAuth() {
  app.className = "app auth-mode"; app.innerHTML = "";
  let mode = "in";
  const err = h("p", { class: "error" });
  const login = h("input", { autocomplete: "username", autocapitalize: "none", placeholder: "например, papa или 79001234567" });
  const pass = h("input", { type: "password", autocomplete: "current-password", placeholder: "не меньше 6 символов" });
  const name = h("input", { autocomplete: "name", placeholder: "Как вас подписывать" });
  const invite = h("input", { autocapitalize: "characters", placeholder: "выдаёт создатель чата" });
  const word = h("input", { autocomplete: "off", placeholder: "например, кличка первого питомца" });
  const extra = h("div", { class: "hidden" },
    h("label", { class: "field" }, h("span", null, "Ваше имя"), name),
    h("label", { class: "field" }, h("span", null, "Код приглашения"), invite),
    h("label", { class: "field" }, h("span", null, "Кодовое слово — для восстановления пароля"), word));
  const forgot = h("button", { type: "button", class: "link-btn", onclick: () => forgotPassword(login.value) }, "Забыли пароль?");
  const go = h("button", { class: "btn wide", type: "submit" }, "Войти");
  const tIn = h("button", { type: "button", class: "on" }, "Вход");
  const tUp = h("button", { type: "button" }, "Регистрация");
  const setMode = (m) => {
    mode = m; tIn.classList.toggle("on", m === "in"); tUp.classList.toggle("on", m === "up");
    extra.classList.toggle("hidden", m === "in"); forgot.classList.toggle("hidden", m !== "in"); go.textContent = m === "in" ? "Войти" : "Создать аккаунт";
    pass.autocomplete = m === "in" ? "current-password" : "new-password"; err.textContent = "";
  };
  tIn.onclick = () => setMode("in"); tUp.onclick = () => setMode("up");
  const form = h("form", { class: "auth" },
    h("img", { class: "logo", src: "icon-192.png", alt: "" }),
    h("h1", null, CFG.appName || "Семья"),
    h("p", { class: "sub" }, "Только для своих"),
    h("div", { class: "tabs" }, tIn, tUp),
    h("label", { class: "field" }, h("span", null, "Логин"), login),
    h("label", { class: "field" }, h("span", null, "Пароль"), pass),
    extra, err, go, forgot);
  form.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = "";
    const l = login.value.trim().toLowerCase().replace(/^\+/, "");
    if (!/^[a-z0-9._-]{3,32}$/.test(l)) { err.textContent = "Логин: латинские буквы или цифры, от 3 символов"; return; }
    if (pass.value.length < 6) { err.textContent = "Пароль должен быть не короче 6 символов"; return; }
    const email = `${l}@${CFG.loginDomain || "family-chat.app"}`;
    go.disabled = true;
    try {
      let res;
      if (mode === "in") res = await S.sb.auth.signInWithPassword({ email, password: pass.value });
      else {
        if (!name.value.trim()) { err.textContent = "Укажите имя"; return; }
        if (word.value.trim() && word.value.trim().length < 3) { err.textContent = "Кодовое слово — не короче 3 букв"; return; }
        res = await S.sb.auth.signUp({ email, password: pass.value,
          options: { data: { name: name.value.trim(), invite: invite.value.trim() } } });
        if (!res.error && !res.data.session) {
          err.textContent = "Аккаунт создан, но сервер требует подтверждения почты. Создателю: отключите «Confirm email» в Supabase."; return;
        }
      }
      if (res.error) throw res.error;
      if (mode === "up" && word.value.trim()) await S.sb.rpc("set_recovery_word", { word: word.value.trim() });
      await enter(res.data.user);
    } catch (ex) {
      const m = String(ex.message || ex);
      err.textContent =
        /INVALID_INVITE|Database error saving new user/i.test(m) ? "Неверный код приглашения" :
        /Invalid login credentials/i.test(m) ? "Неверный логин или пароль" :
        /already registered|already exists/i.test(m) ? "Такой логин уже занят" :
        /Email not confirmed/i.test(m) ? "Почта не подтверждена. Создателю: отключите «Confirm email» в Supabase." :
        /fetch|network/i.test(m) ? "Нет связи с сервером" : m;
    } finally { go.disabled = false; }
  };
  app.append(form);
}

// ───────────── Поделиться ─────────────
const MIME_BY_TYPE = { image: "image/jpeg", video: "video/mp4", audio: "audio/webm", file: "application/octet-stream" };
function fileNameFor(m) {
  if (m.media_name) return m.media_name.replace(/[\\/:*?"<>|]/g, "_");
  const ext = (m.media_path || "").split(".").pop() || "bin";
  return `${{ image: "Фото", video: "Видео", audio: "Голосовое", file: "Файл" }[m.media_type] || "Файл"}.${ext}`;
}
async function shareOut(m) {
  const url = m.media_path && S.urls.get(m.media_path);
  const text = m.body || "";
  const ab = window.AndroidBridge;
  try {
    if (url && ab?.shareFile) { ab.shareFile(url, MIME_BY_TYPE[m.media_type] || "*/*", fileNameFor(m), text); toast("Готовлю файл…"); return; }
    if (!url && ab?.shareText) { ab.shareText(text); return; }
    if (url && navigator.canShare) {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], fileNameFor(m), { type: blob.type || MIME_BY_TYPE[m.media_type] });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: text || undefined }); return; }
    }
    if (navigator.share) { await navigator.share(url ? { url, text: text || undefined } : { text }); return; }
    await navigator.clipboard.writeText(url || text); toast(url ? "Ссылка на файл скопирована" : "Текст скопирован");
  } catch (e) { if (e?.name !== "AbortError") toast("Не удалось поделиться"); }
}

// Файлы, которыми поделились из других приложений («Поделиться» → «Семья»)
window.onSharedItems = async () => {
  if (!S.me || !window.AndroidBridge?.takeShared) return;
  let items;
  try { items = JSON.parse(window.AndroidBridge.takeShared() || "null"); } catch { items = null; }
  if (!items || (!items.files?.length && !items.text)) return;
  const files = [];
  for (const f of items.files || []) {
    try {
      const blob = await (await fetch(f.url)).blob();
      files.push(new File([blob], f.name || "Файл", { type: f.mime || blob.type || "application/octet-stream" }));
    } catch { /* пропускаем недоступный файл */ }
  }
  pickChatAndSend(files, items.text || "");
};
function pickChatAndSend(files, text) {
  let close;
  const what = [files.length ? `${files.length} ${plural(files.length, "файл", "файла", "файлов")}` : "", text ? "текст" : ""].filter(Boolean).join(" и ");
  const sorted = [...S.chats].sort((a, b) => new Date(S.lastByChat.get(b.id)?.created_at || b.last_message_at) - new Date(S.lastByChat.get(a.id)?.created_at || a.last_message_at));
  const previews = h("div", { class: "share-previews" }, files.slice(0, 6).map((f) =>
    f.type.startsWith("image/") ? h("img", { src: URL.createObjectURL(f), alt: "" }) : h("div", { class: "share-file" }, f.type.startsWith("video/") ? "🎬" : "📎", h("small", null, f.name))));
  close = sheet([
    h("h3", null, "Отправить " + (what || "")),
    files.length ? previews : null,
    text ? h("div", { class: "status-card" }, h("div", { class: "status-text" }, text.length > 200 ? text.slice(0, 200) + "…" : text)) : null,
    h("div", { class: "section-title" }, "Кому"),
    ...sorted.map((c) => h("button", { class: "menu-item", onclick: async () => {
      close();
      showTab("chats");
      S.current = null; await openChat(c.id);
      for (const f of files) await sendFile(f);
      if (text) await postMessage({ body: text.slice(0, 8000) });
      toast("Отправлено");
    } }, chatAvatar(c, "sm"), chatTitle(c))),
  ]);
}

// ───────────── Восстановление пароля ─────────────
const loginToEmail = (l) => `${l.trim().toLowerCase().replace(/^\+/, "")}@${CFG.loginDomain || "family-chat.app"}`;
function forgotPassword(prefill = "") {
  let close;
  const login = h("input", { value: prefill || "", autocapitalize: "none", placeholder: "ваш логин" });
  const word = h("input", { autocomplete: "off", placeholder: "кодовое слово" });
  const p1 = h("input", { type: "password", autocomplete: "new-password", placeholder: "не меньше 6 символов" });
  const p2 = h("input", { type: "password", autocomplete: "new-password", placeholder: "ещё раз" });
  const err = h("p", { class: "error" });
  const go = h("button", { class: "btn wide" }, "Сменить пароль");
  go.onclick = async () => {
    err.textContent = "";
    if (!/^[a-z0-9._-]{3,32}$/.test(login.value.trim().toLowerCase().replace(/^\+/, ""))) { err.textContent = "Введите логин"; return; }
    if (!word.value.trim()) { err.textContent = "Введите кодовое слово"; return; }
    if (p1.value.length < 6) { err.textContent = "Пароль должен быть не короче 6 символов"; return; }
    if (p1.value !== p2.value) { err.textContent = "Пароли не совпадают"; return; }
    go.disabled = true;
    const { data, error } = await S.sb.rpc("reset_password_with_word", { login_email: loginToEmail(login.value), word: word.value, new_password: p1.value });
    go.disabled = false;
    if (error) { err.textContent = "Нет связи с сервером"; return; }
    const msg = {
      OK: null,
      WRONG: "Неверный логин или кодовое слово",
      NO_WORD: "Для этого аккаунта кодовое слово не задано. Попросите администратора семьи сбросить пароль.",
      LOCKED: "Слишком много попыток. Попробуйте через час или попросите администратора семьи.",
      PASSWORD_TOO_SHORT: "Пароль должен быть не короче 6 символов",
    }[data];
    if (msg !== null) { err.textContent = msg || "Не получилось, попробуйте ещё раз"; return; }
    close(); toast("Пароль изменён — войдите с новым паролем", 4000);
    const f = $(".auth input[autocomplete=username]"); if (f) f.value = login.value.trim();
  };
  close = sheet([
    h("h3", null, "Восстановление пароля"),
    h("p", { class: "sheet-note" }, "Введите логин и кодовое слово, которое вы задали при регистрации или в профиле, и придумайте новый пароль."),
    h("label", { class: "field" }, h("span", null, "Логин"), login),
    h("label", { class: "field" }, h("span", null, "Кодовое слово"), word),
    h("label", { class: "field" }, h("span", null, "Новый пароль"), p1),
    h("label", { class: "field" }, h("span", null, "Повторите пароль"), p2),
    err, go,
    h("p", { class: "sheet-note" }, "Не помните кодовое слово? Администратор семьи может задать вам новый пароль: «Профиль» → «Сбросить пароль участнику»."),
  ]);
}

function changePasswordSheet() {
  let close;
  const p1 = h("input", { type: "password", autocomplete: "new-password", placeholder: "не меньше 6 символов" });
  const p2 = h("input", { type: "password", autocomplete: "new-password", placeholder: "ещё раз" });
  const err = h("p", { class: "error" });
  close = sheet([
    h("h3", null, "Новый пароль"),
    h("label", { class: "field" }, h("span", null, "Новый пароль"), p1),
    h("label", { class: "field" }, h("span", null, "Повторите"), p2), err,
    h("button", { class: "btn wide", onclick: async () => {
      if (p1.value.length < 6) { err.textContent = "Не короче 6 символов"; return; }
      if (p1.value !== p2.value) { err.textContent = "Пароли не совпадают"; return; }
      const { error } = await S.sb.auth.updateUser({ password: p1.value });
      if (error) { err.textContent = /different|same/i.test(error.message) ? "Новый пароль совпадает со старым" : "Не удалось сменить пароль"; return; }
      close(); toast("Пароль изменён");
    } }, "Сохранить"),
  ]);
}

async function recoveryWordSheet() {
  let close;
  const { data: has } = await S.sb.rpc("has_recovery_word");
  const w = h("input", { autocomplete: "off", placeholder: "например, кличка первого питомца" });
  const err = h("p", { class: "error" });
  close = sheet([
    h("h3", null, "Кодовое слово"),
    h("p", { class: "sheet-note" }, has ? "Кодовое слово уже задано. Можно заменить его новым." :
      "С ним вы сможете сами сменить пароль, если забудете его. Регистр букв не важен."),
    h("label", { class: "field" }, h("span", null, has ? "Новое кодовое слово" : "Кодовое слово"), w), err,
    h("button", { class: "btn wide", onclick: async () => {
      if (w.value.trim().length < 3) { err.textContent = "Не короче 3 букв"; return; }
      const { error } = await S.sb.rpc("set_recovery_word", { word: w.value.trim() });
      if (error) { err.textContent = "Не удалось сохранить"; return; }
      close(); toast("Кодовое слово сохранено");
    } }, "Сохранить"),
  ]);
}

function adminResetSheet() {
  let close;
  const people = [...S.profiles.values()].filter((p) => p.id !== S.me.id).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  close = sheet([
    h("h3", null, "Сбросить пароль участнику"),
    h("p", { class: "sheet-note" }, "Выберите, кому задать новый пароль. Потом сообщите его человеку лично — он сможет сменить пароль в профиле."),
    ...people.map((p) => h("button", { class: "menu-item", onclick: () => { close(); adminResetFor(p); } }, avatarEl(p.id, "sm"), p.name)),
    people.length ? null : h("p", { class: "empty-chat" }, "Других участников пока нет"),
  ]);
}
async function adminResetFor(p) {
  let close;
  const { data: login } = await S.sb.rpc("admin_user_login", { target: p.id });
  const gen = () => Math.random().toString(36).slice(2, 6) + "-" + Math.floor(1000 + Math.random() * 9000);
  const pw = h("input", { value: gen(), autocomplete: "off" });
  const err = h("p", { class: "error" });
  close = sheet([
    h("h3", null, p.name),
    h("p", { class: "sheet-note" }, login ? `Логин: ${login}` : ""),
    h("label", { class: "field" }, h("span", null, "Новый пароль"), pw), err,
    h("button", { class: "btn wide", onclick: async () => {
      if (pw.value.length < 6) { err.textContent = "Не короче 6 символов"; return; }
      const { data, error } = await S.sb.rpc("admin_reset_password", { target: p.id, new_password: pw.value });
      if (error || data !== "OK") { err.textContent = data === "NOT_ADMIN" ? "Сбрасывать пароли может только администратор" : "Не удалось"; return; }
      close();
      sheet([h("h3", null, "Пароль изменён"),
        h("p", { class: "sheet-note" }, `Сообщите ${p.name}:`),
        h("div", { class: "status-card" }, h("div", null, `Логин: ${login || "—"}`), h("div", null, `Пароль: ${pw.value}`))]);
    } }, "Задать пароль"),
  ]);
}

async function enter(user) {
  app.className = "app"; app.innerHTML = "";
  const { data: me } = await S.sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!me) { await S.sb.auth.signOut(); showAuth(); toast("Профиль не найден"); return; }
  S.me = me;
  await loadProfiles();
  await loadChats();
  await Stories.load();
  S.isAdmin = !!(await S.sb.rpc("is_admin")).data;
  buildShell();
  S.sb.rpc("has_recovery_word").then(({ data }) => {
    if (data === false && !localStorage.getItem("wordHint")) {
      try { localStorage.setItem("wordHint", "1"); } catch { /* */ }
      setTimeout(() => toast("Задайте кодовое слово в профиле — с ним можно восстановить пароль", 5000), 1500);
    }
  });
  subscribe();
  Calls.init();
  window.AndroidBridge?.loggedIn?.();
  setTimeout(() => window.onSharedItems(), 300);
  const hashChat = location.hash.slice(1);
  if (hashChat && S.chats.find((c) => c.id === hashChat)) openChat(hashChat);
}

// ───────────── Загрузка данных ─────────────
async function loadProfiles() {
  const { data } = await S.sb.from("profiles").select("*");
  for (const p of data || []) S.profiles.set(p.id, p);
  await signUrls((data || []).map((p) => p.avatar_path).filter(Boolean));
}
async function loadChats() {
  const [{ data: chats }, { data: mem }, { data: recent }] = await Promise.all([
    S.sb.from("chats").select("*").order("last_message_at", { ascending: false }),
    S.sb.from("chat_members").select("*"),
    S.sb.from("messages").select("id,chat_id,user_id,body,media_type,deleted,created_at").order("created_at", { ascending: false }).limit(600),
  ]);
  S.chats = chats || [];
  S.members.clear();
  for (const m of mem || []) { if (!S.members.has(m.chat_id)) S.members.set(m.chat_id, []); S.members.get(m.chat_id).push(m); }
  S.lastByChat.clear(); S.unread.clear();
  for (const m of recent || []) {
    if (!S.lastByChat.has(m.chat_id)) S.lastByChat.set(m.chat_id, m);
    const mine = myMember(m.chat_id);
    if (m.user_id !== S.me.id && mine && new Date(m.created_at) > new Date(mine.last_read_at))
      S.unread.set(m.chat_id, (S.unread.get(m.chat_id) || 0) + 1);
  }
}
const myMember = (chatId) => (S.members.get(chatId) || []).find((m) => m.user_id === S.me.id);
async function signUrls(paths) {
  const need = [...new Set(paths)].filter((p) => p && !S.urls.has(p));
  for (let i = 0; i < need.length; i += 100) {
    const { data } = await S.sb.storage.from("media").createSignedUrls(need.slice(i, i + 100), 60 * 60 * 24 * 7);
    for (const d of data || []) if (d.signedUrl) S.urls.set(d.path, d.signedUrl);
  }
}

// ───────────── Каркас ─────────────
function buildShell() {
  app.innerHTML = "";
  app.append(
    h("aside", { class: "side", id: "side" },
      h("div", { class: "topbar" },
        avatarEl(S.me.id, "sm", { onclick: openProfile, style: { cursor: "pointer" } }),
        h("div", { class: "title" }, h("b", null, CFG.appName || "Семья"), h("small", { id: "conn" }, "в сети")),
        h("button", { class: "icon-btn", title: "Профиль", onclick: openProfile, html: I.pen })),
      h("div", { class: "tab-body", id: "tabChats" },
        h("div", { class: "search" }, h("input", { placeholder: "Поиск", oninput: (e) => { S.filter = e.target.value.toLowerCase(); renderChatList(); } })),
        h("div", { class: "chat-list", id: "chatList" }, h("div", { id: "storyStrip" }), h("div", { id: "chatItems" })),
        h("button", { class: "fab", title: "Новый чат", onclick: newChatSheet, html: I.plus })),
      h("div", { class: "tab-body hidden", id: "tabStories" }),
      h("nav", { class: "bottom-tabs" },
        h("button", { class: "on", id: "tabBtnChats", onclick: () => showTab("chats") }, h("span", { html: I.chat }), "Чаты", h("i", { class: "tab-badge hidden", id: "chatsBadge" })),
        h("button", { id: "tabBtnStories", onclick: () => showTab("stories") }, h("span", { html: I.story }), "Истории", h("i", { class: "tab-badge hidden", id: "storiesBadge" })))),
    h("div", { class: "placeholder", id: "placeholder" }, "Выберите чат слева"));
  renderChatList();
  Stories.renderAll();
  if (!window.__popBound) {
    window.__popBound = true;
    window.addEventListener("popstate", () => {
      const id = location.hash.slice(1);
      if (!id && S.current) closeChat(true);
      else if (id && id !== S.current && S.chats.some((c) => c.id === id)) openChat(id);
    });
  }
}

function chatTitle(c) {
  if (c.is_group) return c.title || "Группа";
  const other = otherUser(c);
  return other ? (S.profiles.get(other)?.name || "Собеседник") : "Избранное";
}
const otherUser = (c) => (S.members.get(c.id) || []).map((m) => m.user_id).find((u) => u !== S.me.id);

function avatarEl(userId, size = "", extra = {}) {
  const p = S.profiles.get(userId);
  const url = p?.avatar_path && S.urls.get(p.avatar_path);
  const el = h("div", { class: `avatar ${size}`, ...extra, style: { background: url ? `center/cover url("${url}")` : colorFor(userId), ...(extra.style || {}) } },
    url ? "" : initials(p?.name));
  if (S.online.has(userId) && userId !== S.me?.id) el.append(h("i", { class: "dot" }));
  return el;
}
function chatAvatar(c, size = "") {
  if (!c.is_group) { const o = otherUser(c); if (o) return avatarEl(o, size); }
  return h("div", { class: `avatar ${size}`, style: { background: c.id === FAMILY_CHAT ? "var(--accent)" : colorFor(c.id) } },
    c.id === FAMILY_CHAT ? "🏠" : initials(c.title));
}
function previewText(m) {
  if (!m) return "Нет сообщений";
  if (m.deleted) return "Сообщение удалено";
  const who = m.user_id === S.me.id ? "Вы: " : "";
  const kind = { image: "📷 Фото", video: "🎬 Видео", audio: "🎤 Голосовое", file: "📎 Файл" }[m.media_type];
  return who + (kind ? kind + (m.body ? " · " + m.body : "") : (m.body || ""));
}

function renderChatList() {
  const list = $("#chatItems"); if (!list) return;
  list.innerHTML = "";
  const totalUnread = [...S.unread.values()].reduce((a, b) => a + b, 0);
  const cb = $("#chatsBadge"); if (cb) { cb.textContent = totalUnread > 99 ? "99+" : totalUnread; cb.classList.toggle("hidden", !totalUnread); }
  const sorted = [...S.chats].sort((a, b) => {
    const ta = S.lastByChat.get(a.id)?.created_at || a.last_message_at, tb = S.lastByChat.get(b.id)?.created_at || b.last_message_at;
    return new Date(tb) - new Date(ta);
  });
  for (const c of sorted) {
    const title = chatTitle(c);
    if (S.filter && !title.toLowerCase().includes(S.filter)) continue;
    const last = S.lastByChat.get(c.id), unread = S.unread.get(c.id) || 0;
    list.append(h("button", { class: `chat-item${S.current === c.id ? " on" : ""}`, onclick: () => openChat(c.id) },
      chatAvatar(c),
      h("div", { class: "mid" },
        h("div", { class: "row" }, h("span", { class: "name" }, title), h("span", { class: "time" }, last ? fmtListTime(last.created_at) : "")),
        h("div", { class: "row" }, h("span", { class: "last" }, previewText(last)), unread ? h("span", { class: "badge" }, unread > 99 ? "99+" : unread) : null))));
  }
  if (!list.children.length) list.append(h("p", { class: "empty-chat" }, S.filter ? "Ничего не найдено" : "Пока нет чатов"));
}

// ───────────── Открытый чат ─────────────
async function openChat(chatId) {
  if (S.current === chatId) return;
  S.current = chatId; S.replyTo = null;
  const c = S.chats.find((x) => x.id === chatId); if (!c) return;
  if (location.hash.slice(1) !== chatId) history.pushState(null, "", "#" + chatId);
  app.classList.add("in-chat");
  $("#placeholder")?.remove(); $("#chatView")?.remove();
  const other = !c.is_group ? otherUser(c) : null;
  const sub = h("small", { id: "chatSub" });
  const view = h("section", { class: "chat", id: "chatView" },
    h("div", { class: "topbar" },
      h("button", { class: "icon-btn back-btn", onclick: () => history.back(), html: I.back }),
      chatAvatar(c, "sm"),
      h("div", { class: "title", onclick: () => chatInfo(c) }, h("b", null, chatTitle(c)), sub),
      other ? h("button", { class: "icon-btn", title: "Аудиозвонок", onclick: () => Calls.start(other, false), html: I.phone }) : null,
      other ? h("button", { class: "icon-btn", title: "Видеозвонок", onclick: () => Calls.start(other, true), html: I.video }) : null),
    h("div", { class: "upload-bar", id: "upBar" }),
    h("div", { class: "messages", id: "msgs" }),
    h("div", { id: "replyBox" }),
    composer());
  app.append(view);
  updateChatSub();
  renderChatList();
  const [{ data: mem }] = await Promise.all([
    S.sb.from("chat_members").select("*").eq("chat_id", chatId),
    S.msgs.has(chatId) ? null : loadMessages(chatId),
  ]);
  if (mem) S.members.set(chatId, mem);
  if (mem?.some((m) => !S.profiles.has(m.user_id))) await loadProfiles();
  if (S.current !== chatId) return;
  updateChatSub();
  renderMessages(true);
  markRead(chatId);
  $("#msgs").addEventListener("scroll", onScrollTop);
}
function closeChat(fromPop) {
  S.current = null; app.classList.remove("in-chat");
  $("#chatView")?.remove();
  if (!$("#placeholder")) app.append(h("div", { class: "placeholder", id: "placeholder" }, "Выберите чат слева"));
  if (!fromPop && location.hash) history.back();
  renderChatList();
}
function updateChatSub() {
  const el = $("#chatSub"); if (!el || !S.current) return;
  const c = S.chats.find((x) => x.id === S.current);
  if (c.is_group) {
    const n = (S.members.get(c.id) || []).length;
    const on = (S.members.get(c.id) || []).filter((m) => S.online.has(m.user_id) && m.user_id !== S.me.id).length;
    el.textContent = `${n} ${plural(n, "участник", "участника", "участников")}${on ? `, ${on} в сети` : ""}`;
  } else {
    const o = otherUser(c);
    const st = S.profiles.get(o)?.status;
    el.textContent = (S.online.has(o) ? "в сети" : lastSeen(S.profiles.get(o)?.last_seen)) + (st ? " · " + st : "");
  }
}
function lastSeen(t) {
  if (!t) return "";
  const d = new Date(t), mins = (Date.now() - d) / 6e4;
  if (mins < 2) return "был(а) только что";
  if (mins < 60) return `был(а) ${Math.round(mins)} мин назад`;
  return `был(а) ${fmtDay(d).toLowerCase()} в ${fmtTime(d)}`;
}
const plural = (n, a, b, c) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);

async function loadMessages(chatId, before) {
  let q = S.sb.from("messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: false }).limit(PAGE);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) { toast("Не удалось загрузить сообщения"); return []; }
  const list = (data || []).reverse();
  const existing = S.msgs.get(chatId) || [];
  S.msgs.set(chatId, before ? [...list, ...existing] : list);
  S.hasMore.set(chatId, (data || []).length === PAGE);
  const ids = list.map((m) => m.id);
  if (ids.length) {
    const { data: rs } = await S.sb.from("reactions").select("message_id,user_id,emoji").in("message_id", ids);
    for (const id of ids) S.reacts.set(id, []);
    for (const r of rs || []) S.reacts.get(r.message_id)?.push(r);
  }
  await signUrls(list.map((m) => m.media_path));
  return list;
}
let loadingOlder = false;
async function onScrollTop(e) {
  const box = e.target;
  if (box.scrollTop > 80 || loadingOlder || !S.hasMore.get(S.current)) return;
  loadingOlder = true;
  const first = S.msgs.get(S.current)?.[0];
  const prevH = box.scrollHeight;
  await loadMessages(S.current, first?.created_at);
  renderMessages(false);
  box.scrollTop = box.scrollHeight - prevH;
  loadingOlder = false;
}

function renderMessages(toBottom) {
  const box = $("#msgs"); if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
  const list = S.msgs.get(S.current) || [];
  const c = S.chats.find((x) => x.id === S.current);
  box.innerHTML = "";
  if (S.hasMore.get(S.current)) box.append(h("div", { class: "load-more" }, "Прокрутите вверх для старых сообщений"));
  if (!list.length) box.append(h("div", { class: "empty-chat" }, "Здесь пока пусто.\nНапишите первым! 👋"));
  let lastDay = "";
  list.forEach((m, i) => {
    const day = new Date(m.created_at).toDateString();
    if (day !== lastDay) { box.append(h("div", { class: "day" }, fmtDay(m.created_at))); lastDay = day; }
    const prev = list[i - 1], next = list[i + 1];
    const sameRunPrev = prev && prev.user_id === m.user_id && new Date(prev.created_at).toDateString() === day && new Date(m.created_at) - new Date(prev.created_at) < 5 * 6e4;
    const sameRunNext = next && next.user_id === m.user_id && new Date(next.created_at).toDateString() === day && new Date(next.created_at) - new Date(m.created_at) < 5 * 6e4;
    box.append(messageEl(m, c, !sameRunPrev, !sameRunNext));
  });
  if (toBottom || nearBottom) box.scrollTop = box.scrollHeight;
}

function messageEl(m, c, firstInRun, tail) {
  const out = m.user_id === S.me.id;
  const p = S.profiles.get(m.user_id);
  const isCall = m.body && m.body.startsWith("📞") && !m.media_type;
  const bubble = h("div", { class: `bubble${m.media_type && !m.deleted ? " media" : ""}${m.deleted ? " deleted" : ""}` });
  if (c.is_group && !out && firstInRun) bubble.append(h("div", { class: "who", style: { color: colorFor(m.user_id) } }, p?.name || "…"));
  if (m.reply_to && !m.deleted) {
    const r = (S.msgs.get(m.chat_id) || []).find((x) => x.id === m.reply_to);
    bubble.append(h("div", { class: "reply", onclick: () => jumpTo(m.reply_to) },
      h("b", null, r ? (S.profiles.get(r.user_id)?.name || "…") : "Сообщение"),
      h("span", null, r ? previewText({ ...r, user_id: null }) : "…")));
  }
  if (m.deleted) bubble.append(h("div", { class: "text" }, "Сообщение удалено"));
  else {
    const url = m.media_path && S.urls.get(m.media_path);
    if (m.media_type === "image") bubble.append(h("img", { class: "photo", src: url || "", loading: "lazy", alt: "Фото", onclick: () => lightbox(url) }));
    else if (m.media_type === "video") bubble.append(h("video", { src: url || "", controls: true, preload: "metadata", playsinline: true }));
    else if (m.media_type === "audio") bubble.append(h("audio", { src: url || "", controls: true, preload: "metadata" }));
    else if (m.media_type === "file") bubble.append(h("a", { class: "file", href: url || "#", target: "_blank", rel: "noopener", download: m.media_name || "" },
      h("span", { class: "icon-btn", html: I.file }), h("span", null, m.media_name || "Файл")));
    if (m.body) bubble.append(h("div", { class: "text" }, linkify(m.body)));
  }
  const meta = h("span", { class: "meta" }, fmtTime(m.created_at));
  if (out && !m.deleted) {
    const others = (S.members.get(m.chat_id) || []).filter((x) => x.user_id !== S.me.id);
    const read = others.some((x) => new Date(x.last_read_at) >= new Date(m.created_at));
    meta.append(h("span", { class: "ticks", title: read ? "Прочитано" : "Доставлено" }, read ? "✓✓" : "✓"));
  }
  if (m.pending) meta.textContent = "⏳";
  const textEl = bubble.querySelector(".text");
  (textEl || bubble).append(meta);
  const rs = S.reacts.get(m.id) || [];
  if (rs.length && !m.deleted) {
    const counts = new Map();
    for (const r of rs) { const e = counts.get(r.emoji) || { n: 0, mine: false }; e.n++; if (r.user_id === S.me.id) e.mine = true; counts.set(r.emoji, e); }
    const row = h("div", { class: "reacts" });
    for (const [emoji, e] of counts) row.append(h("button", { class: `react${e.mine ? " mine" : ""}`, onclick: (ev) => { ev.stopPropagation(); toggleReaction(m, emoji); },
      title: rs.filter((r) => r.emoji === emoji).map((r) => S.profiles.get(r.user_id)?.name).join(", ") }, emoji, e.n > 1 ? h("span", null, e.n) : null));
    bubble.append(row);
  }
  const row = h("div", { class: `msg ${out ? "out" : "in"}${firstInRun ? " first-in-run" : ""}${tail ? " tail" : ""}${isCall ? " call-log" : ""}`, "data-id": m.id },
    c.is_group && !out ? avatarEl(m.user_id, "sm") : null, bubble);
  if (!m.pending) attachGestures(bubble, m);
  return row;
}

function attachGestures(el, m) {
  let timer = null, lastTap = 0, sx = 0, sy = 0;
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); messageMenu(m); });
  el.addEventListener("touchstart", (e) => {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    timer = setTimeout(() => { timer = null; navigator.vibrate?.(15); messageMenu(m); }, 450);
  }, { passive: true });
  el.addEventListener("touchmove", (e) => {
    if (timer && (Math.abs(e.touches[0].clientX - sx) > 10 || Math.abs(e.touches[0].clientY - sy) > 10)) { clearTimeout(timer); timer = null; }
  }, { passive: true });
  el.addEventListener("touchend", () => {
    if (timer) { clearTimeout(timer); timer = null; }
  });
  el.addEventListener("click", (e) => {
    if (e.target.closest("a,video,audio,img,.react,.reply")) return;
    const now = Date.now();
    if (now - lastTap < 320 && !m.deleted) { toggleReaction(m, "❤️"); lastTap = 0; } else lastTap = now;
  });
}

function messageMenu(m) {
  const mine = (S.reacts.get(m.id) || []).filter((r) => r.user_id === S.me.id).map((r) => r.emoji);
  let close;
  const items = [];
  if (!m.deleted) {
    items.push(h("div", { class: "emoji-row" }, EMOJI.map((e) => h("button", { class: mine.includes(e) ? "mine" : "", onclick: () => { close(); toggleReaction(m, e); } }, e))));
    items.push(h("button", { class: "menu-item", onclick: () => { close(); setReply(m); } }, h("span", { html: I.reply }), "Ответить"));
    if (m.body) items.push(h("button", { class: "menu-item", onclick: async () => { close(); try { await navigator.clipboard.writeText(m.body); toast("Скопировано"); } catch { toast("Не удалось скопировать"); } } }, h("span", { html: I.copy }), "Копировать текст"));
    if (m.body || (m.media_path && S.urls.get(m.media_path))) items.push(h("button", { class: "menu-item", onclick: () => { close(); shareOut(m); } }, h("span", { html: I.share }), "Поделиться"));
    if (m.media_path && S.urls.get(m.media_path)) items.push(h("a", { class: "menu-item", href: S.urls.get(m.media_path), target: "_blank", rel: "noopener", download: m.media_name || "", onclick: () => close() }, h("span", { html: I.download }), "Сохранить файл"));
    if (m.user_id === S.me.id) items.push(h("button", { class: "menu-item danger", onclick: () => { close(); deleteMessage(m); } }, h("span", { html: I.trash }), "Удалить у всех"));
  }
  if (items.length) close = sheet(items);
}

async function toggleReaction(m, emoji) {
  const list = S.reacts.get(m.id) || [];
  const had = list.find((r) => r.user_id === S.me.id && r.emoji === emoji);
  if (had) {
    S.reacts.set(m.id, list.filter((r) => r !== had)); rerenderMessage(m.id);
    const { error } = await S.sb.from("reactions").delete().match({ message_id: m.id, user_id: S.me.id, emoji });
    if (error) toast("Не удалось убрать реакцию");
  } else {
    S.reacts.set(m.id, [...list, { message_id: m.id, user_id: S.me.id, emoji }]); rerenderMessage(m.id);
    const { error } = await S.sb.from("reactions").insert({ message_id: m.id, emoji });
    if (error && error.code !== "23505") toast("Не удалось поставить реакцию");
  }
}
function rerenderMessage(id) {
  const old = document.querySelector(`.msg[data-id="${id}"]`); if (!old) return;
  const list = S.msgs.get(S.current) || []; const i = list.findIndex((x) => x.id === id); if (i < 0) return;
  const c = S.chats.find((x) => x.id === S.current);
  const fresh = messageEl(list[i], c, old.classList.contains("first-in-run"), old.classList.contains("tail"));
  old.replaceWith(fresh);
}
async function deleteMessage(m) {
  const { error } = await S.sb.from("messages").update({ deleted: true, body: null, media_path: null, media_type: null, media_name: null }).eq("id", m.id);
  if (error) toast("Не удалось удалить");
  else { Object.assign(m, { deleted: true, body: null, media_path: null, media_type: null }); rerenderMessage(m.id); }
}
function jumpTo(id) {
  const el = document.querySelector(`.msg[data-id="${id}"]`);
  if (!el) { toast("Сообщение выше — прокрутите вверх"); return; }
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
}
function lightbox(url) {
  if (!url) return;
  const lb = h("div", { class: "lightbox", onclick: () => lb.remove() },
    h("img", { src: url, alt: "" }), h("button", { class: "icon-btn close", html: I.close }));
  document.body.append(lb);
}

async function markRead(chatId) {
  const mine = myMember(chatId); const now = new Date().toISOString();
  if (mine) mine.last_read_at = now;
  S.unread.delete(chatId); renderChatList();
  await S.sb.from("chat_members").update({ last_read_at: now }).match({ chat_id: chatId, user_id: S.me.id });
  Live.broadcast("read", { chat_id: chatId, user_id: S.me.id, at: now });
}

// ───────────── Поле ввода ─────────────
function composer() {
  const ta = h("textarea", { rows: 1, placeholder: "Сообщение", id: "input" });
  const file = h("input", { type: "file", multiple: true, class: "hidden", accept: "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" });
  const action = h("button", { class: "send", title: "Голосовое", html: I.mic });
  const wrap = h("div", { class: "composer" },
    h("button", { class: "icon-btn", title: "Фото, видео, файл", onclick: () => file.click(), html: I.clip }), file, ta, action);
  const update = () => {
    ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
    const has = ta.value.trim().length > 0;
    action.innerHTML = has ? I.send : I.mic; action.title = has ? "Отправить" : "Голосовое";
  };
  ta.addEventListener("input", update);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); sendText(ta, update); }
  });
  action.addEventListener("click", () => { if (ta.value.trim()) sendText(ta, update); else Voice.start(wrap); });
  file.addEventListener("change", async () => { const files = [...file.files]; file.value = ""; for (const f of files) await sendFile(f); });
  // вставка картинки из буфера
  ta.addEventListener("paste", (e) => {
    const f = [...(e.clipboardData?.files || [])][0];
    if (f) { e.preventDefault(); sendFile(f); }
  });
  return wrap;
}

function setReply(m) {
  S.replyTo = m;
  const box = $("#replyBox"); if (!box) return;
  box.innerHTML = "";
  box.append(h("div", { class: "replying" },
    h("span", { class: "icon-btn", html: I.reply, style: { color: "var(--accent)" } }),
    h("div", { class: "q" }, h("b", null, S.profiles.get(m.user_id)?.name || ""), h("span", null, previewText({ ...m, user_id: null }))),
    h("button", { class: "icon-btn", html: I.close, onclick: clearReply })));
  $("#input")?.focus();
}
function clearReply() { S.replyTo = null; const b = $("#replyBox"); if (b) b.innerHTML = ""; }

async function sendText(ta, update) {
  const body = ta.value.trim(); if (!body) return;
  ta.value = ""; update();
  await postMessage({ body });
}

async function postMessage(fields, chatId = S.current) {
  const temp = { id: "tmp-" + Math.random().toString(36).slice(2), chat_id: chatId, user_id: S.me.id, created_at: new Date().toISOString(),
    pending: true, reply_to: S.replyTo?.id || null, ...fields };
  const reply = chatId === S.current ? (S.replyTo?.id || null) : null;
  if (chatId === S.current) clearReply();
  temp.reply_to = reply;
  S.msgs.get(chatId)?.push(temp); if (S.current === chatId) renderMessages(true);
  const { data, error } = await S.sb.from("messages").insert({ chat_id: chatId, reply_to: reply, ...fields }).select().single();
  const list = S.msgs.get(chatId) || [];
  const i = list.indexOf(temp);
  if (error) {
    if (i >= 0) list.splice(i, 1);
    if (S.current === chatId) renderMessages(false);
    toast("Не отправлено. Проверьте интернет."); return null;
  }
  if (list.some((x) => x.id === data.id)) { if (i >= 0) list.splice(i, 1); } // уже пришло по realtime
  else if (i >= 0) list[i] = data;
  S.lastByChat.set(chatId, data);
  if (S.current === chatId) renderMessages(true);
  renderChatList();
  return data;
}

async function sendFile(f) {
  const chatId = S.current; if (!chatId) return;
  if (f.size > 50 * 1024 * 1024) { toast("Файл больше 50 МБ — слишком большой"); return; }
  let type = f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : f.type.startsWith("audio/") ? "audio" : "file";
  let blob = f, ext = (f.name.split(".").pop() || "bin").toLowerCase();
  if (type === "image" && !/gif|svg/.test(f.type)) {
    try { blob = await compressImage(f); ext = "jpg"; } catch { /* отправим как есть */ }
  }
  const path = `${chatId}/${crypto.randomUUID()}.${ext.replace(/[^a-z0-9]/g, "").slice(0, 6) || "bin"}`;
  const bar = $("#upBar"); if (bar) bar.style.width = "30%";
  const { error } = await S.sb.storage.from("media").upload(path, blob, { contentType: blob.type || f.type || "application/octet-stream", upsert: false });
  if (bar) bar.style.width = "100%";
  setTimeout(() => { if (bar) bar.style.width = "0"; }, 400);
  if (error) { toast("Не удалось загрузить файл: " + (error.message || "")); return; }
  await signUrls([path]);
  const caption = $("#input")?.value.trim();
  if (caption && type !== "file") { $("#input").value = ""; $("#input").dispatchEvent(new Event("input")); }
  await postMessage({ media_path: path, media_type: type, media_name: f.name.slice(0, 120), body: caption && type !== "file" ? caption : null });
}

function compressImage(file, max = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      cv.toBlob((b) => (b ? resolve(b) : reject()), "image/jpeg", quality);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ───────────── Голосовые сообщения ─────────────
const Voice = {
  async start(wrap) {
    if (!window.MediaRecorder) { toast("Запись голоса не поддерживается"); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { toast("Нет доступа к микрофону"); return; }
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const t0 = Date.now();
    const time = h("span", null, "0:00");
    const tick = setInterval(() => (time.textContent = fmtDur((Date.now() - t0) / 1000)), 250);
    const saved = [...wrap.children];
    let cancelled = false;
    const finish = () => { clearInterval(tick); stream.getTracks().forEach((t) => t.stop()); wrap.innerHTML = ""; wrap.append(...saved); };
    rec.onstop = async () => {
      finish();
      if (cancelled || Date.now() - t0 < 700) return;
      const type = rec.mimeType || "audio/webm";
      const ext = type.includes("mp4") ? "m4a" : "webm";
      await sendFile(new File([new Blob(chunks, { type })], `Голосовое.${ext}`, { type }));
    };
    wrap.innerHTML = "";
    wrap.append(
      h("button", { class: "icon-btn", title: "Отменить", html: I.trash, onclick: () => { cancelled = true; rec.stop(); } }),
      h("div", { class: "recording" }, h("i", { class: "rec-dot" }), time, h("span", { style: { color: "var(--muted)", fontWeight: 400 } }, "Запись…")),
      h("button", { class: "send", title: "Отправить", html: I.send, onclick: () => rec.stop() }));
    rec.start();
  },
};

// ───────────── Новые чаты, профиль ─────────────
function newChatSheet() {
  let close;
  const people = [...S.profiles.values()].filter((p) => p.id !== S.me.id).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  close = sheet([
    h("h3", null, "Новый чат"),
    h("button", { class: "menu-item", onclick: () => { close(); newGroupSheet(); } }, h("span", { html: I.group }), "Создать группу"),
    ...people.map((p) => h("button", { class: "menu-item", onclick: async () => { close(); await openDm(p.id); } }, avatarEl(p.id, "sm"), p.name)),
    people.length ? null : h("p", { class: "empty-chat" }, "Пока никто больше не зарегистрировался. Поделитесь ссылкой и кодом приглашения."),
  ]);
}
async function openDm(userId) {
  const { data: id, error } = await S.sb.rpc("get_or_create_dm", { other: userId });
  if (error) { toast("Не удалось открыть чат"); return; }
  if (!S.chats.find((c) => c.id === id)) await loadChats();
  openChat(id);
}
function newGroupSheet() {
  let close;
  const title = h("input", { placeholder: "Название группы" });
  const picks = [...S.profiles.values()].filter((p) => p.id !== S.me.id).map((p) =>
    h("label", null, h("input", { type: "checkbox", value: p.id }), avatarEl(p.id, "sm"), p.name));
  close = sheet([
    h("h3", null, "Новая группа"),
    h("label", { class: "field" }, title),
    h("div", { class: "people-pick" }, picks),
    h("button", { class: "btn wide", style: { marginTop: "12px" }, onclick: async () => {
      const ids = picks.map((l) => l.querySelector("input")).filter((i) => i.checked).map((i) => i.value);
      if (!title.value.trim()) { toast("Введите название"); return; }
      const { data: id, error } = await S.sb.rpc("create_group", { title: title.value.trim(), members: ids });
      if (error) { toast("Не удалось создать группу"); return; }
      close(); await loadChats(); openChat(id);
    } }, "Создать"),
  ]);
}
function chatInfo(c) {
  const mem = (S.members.get(c.id) || []).map((m) => S.profiles.get(m.user_id)).filter(Boolean);
  let close;
  close = sheet([
    h("div", { class: "profile-card" }, chatAvatar(c, "lg"), h("h3", null, chatTitle(c))),
    c.is_group ? h("p", { style: { color: "var(--muted)", margin: "0 6px 6px" } }, `Участники (${mem.length})`) : null,
    ...(c.is_group ? mem : []).map((p) => h("button", { class: "menu-item", onclick: () => { close(); if (p.id !== S.me.id) openDm(p.id); } },
      avatarEl(p.id, "sm"), p.name + (p.id === S.me.id ? " (вы)" : ""))),
  ]);
}
function openProfile() {
  let close;
  const name = h("input", { value: S.me.name });
  const status = h("input", { value: S.me.status || "", maxlength: 100, placeholder: "Например: На работе до 18:00" });
  const pic = h("input", { type: "file", accept: "image/*", class: "hidden" });
  const av = avatarEl(S.me.id, "xl", { onclick: () => pic.click(), title: "Сменить фото" });
  pic.onchange = async () => {
    const f = pic.files[0]; if (!f) return;
    try {
      const blob = await compressImage(f, 400, 0.85);
      const path = `avatars/${S.me.id}-${Date.now()}.jpg`;
      const { error } = await S.sb.storage.from("media").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      await S.sb.from("profiles").update({ avatar_path: path }).eq("id", S.me.id);
      await signUrls([path]); S.me.avatar_path = path; S.profiles.set(S.me.id, S.me);
      close(); buildShell(); if (S.current) { const id = S.current; S.current = null; openChat(id); }
      toast("Фото обновлено"); Live.broadcast("profile", {});
    } catch { toast("Не удалось загрузить фото"); }
  };
  close = sheet([
    h("div", { class: "profile-card" }, av, pic, h("small", { style: { color: "var(--muted)" } }, "Нажмите на фото, чтобы сменить")),
    h("label", { class: "field" }, h("span", null, "Имя"), name),
    h("label", { class: "field" }, h("span", null, "Статус"), status),
    h("div", { class: "status-presets" }, STATUS_PRESETS.map((t) => h("button", { type: "button", onclick: () => { status.value = t; } }, t)),
      h("button", { type: "button", onclick: () => { status.value = ""; } }, "✕ Без статуса")),
    h("button", { class: "btn wide", onclick: async () => {
      const n = name.value.trim(); if (!n) return;
      const st = status.value.trim().slice(0, 100) || null;
      const { error } = await S.sb.from("profiles").update({ name: n.slice(0, 60), status: st, status_at: st ? new Date().toISOString() : null }).eq("id", S.me.id);
      S.me.status = st;
      if (error) { toast("Не удалось сохранить"); return; }
      S.me.name = n; S.profiles.set(S.me.id, S.me); close(); toast("Сохранено"); renderChatList(); Live.broadcast("profile", {});
    } }, "Сохранить"),
    h("button", { class: "menu-item", style: { marginTop: "8px" }, onclick: () => { close(); changePasswordSheet(); } }, h("span", { html: I.lock }), "Сменить пароль"),
    h("button", { class: "menu-item", onclick: () => { close(); recoveryWordSheet(); } }, h("span", { html: I.key }), "Кодовое слово для восстановления"),
    S.isAdmin ? h("button", { class: "menu-item", onclick: () => { close(); adminResetSheet(); } }, h("span", { html: I.group }), "Сбросить пароль участнику") : null,
    h("button", { class: "menu-item danger", onclick: async () => {
      await S.sb.auth.signOut(); window.AndroidBridge?.loggedOut?.(); location.hash = ""; location.reload();
    } }, h("span", { html: I.logout }), "Выйти"),
  ]);
}

// ───────────── Мгновенная доставка ─────────────
const Live = { channel: null, presence: null,
  broadcast(event, payload) { this.presence?.send({ type: "broadcast", event, payload }); },
};
function subscribe() {
  Live.channel = S.sb.channel("db-changes")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onNewMessage(p.new))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (p) => onUpdatedMessage(p.new))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions" }, (p) => onReaction(p.new, true))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "reactions" }, (p) => onReaction(p.old, false))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "stories" }, (p) => Stories.onNew(p.new))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "stories" }, (p) => Stories.onDeleted(p.old))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (p) => onProfileChange(p.new))
    .subscribe((status) => {
      const el = $("#conn"); if (el) el.textContent = status === "SUBSCRIBED" ? "в сети" : "подключение…";
      if (status === "SUBSCRIBED" && S.resync) { S.resync = false; resync(); }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") S.resync = true;
    });
  Live.presence = S.sb.channel("family-presence", { config: { presence: { key: S.me.id } } })
    .on("presence", { event: "sync" }, () => {
      S.online = new Set(Object.keys(Live.presence.presenceState()));
      if ([...S.online].some((u) => !S.profiles.has(u))) loadProfiles().then(renderChatList);
      renderChatList(); updateChatSub();
    })
    .on("broadcast", { event: "read" }, ({ payload }) => {
      const m = (S.members.get(payload.chat_id) || []).find((x) => x.user_id === payload.user_id);
      if (m) { m.last_read_at = payload.at; if (S.current === payload.chat_id) renderMessages(false); }
    })
    .on("broadcast", { event: "profile" }, async () => { await loadProfiles(); renderChatList(); })
    .subscribe(async (status) => { if (status === "SUBSCRIBED") await Live.presence.track({ at: Date.now() }); });
  // при возврате в приложение — догружаем пропущенное
  document.addEventListener("visibilitychange", () => {
    if (window.AndroidBridge) return; // в приложении это сообщает сам Android
    if (document.visibilityState === "visible") window.onAppForeground(); else window.onAppBackground();
  });
  window.onAppForeground = () => { resync(); Stories.load().then(() => Stories.renderAll()); if (S.current) markRead(S.current); };
  window.onAppBackground = () => { S.sb.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", S.me.id).then(() => {}); };

}
function onProfileChange(np) {
  const old = S.profiles.get(np.id) || {};
  S.profiles.set(np.id, { ...old, ...np });
  if (np.id === S.me.id) Object.assign(S.me, np);
  if (np.avatar_path && !S.urls.has(np.avatar_path)) signUrls([np.avatar_path]).then(renderChatList);
  renderChatList(); updateChatSub(); Stories.renderAll();
}
const appVisible = () => (window.AndroidBridge?.isForeground ? window.AndroidBridge.isForeground() : document.visibilityState === "visible");
function showTab(t) {
  $("#tabChats")?.classList.toggle("hidden", t !== "chats");
  $("#tabStories")?.classList.toggle("hidden", t !== "stories");
  $("#tabBtnChats")?.classList.toggle("on", t === "chats");
  $("#tabBtnStories")?.classList.toggle("on", t === "stories");
  if (t === "stories") Stories.refreshAndRender();
}
async function resync() {
  await loadChats(); renderChatList();
  if (S.current) { S.msgs.delete(S.current); await loadMessages(S.current); renderMessages(true); }
}
async function onNewMessage(m) {
  if (!S.chats.find((c) => c.id === m.chat_id)) { await loadProfiles(); await loadChats(); renderChatList(); }
  S.lastByChat.set(m.chat_id, m);
  if (m.media_path) await signUrls([m.media_path]);
  if (!S.profiles.has(m.user_id)) await loadProfiles();
  const list = S.msgs.get(m.chat_id);
  if (list && !list.some((x) => x.id === m.id)) {
    const pend = m.user_id === S.me.id && list.find((x) => x.pending && x.body == m.body && x.media_path == m.media_path);
    if (pend) list.splice(list.indexOf(pend), 1, m); else list.push(m);
    S.reacts.set(m.id, S.reacts.get(m.id) || []);
  }
  if (S.current === m.chat_id && appVisible()) {
    renderMessages(m.user_id === S.me.id);
    if (m.user_id !== S.me.id) markRead(m.chat_id);
  } else if (m.user_id !== S.me.id) {
    S.unread.set(m.chat_id, (S.unread.get(m.chat_id) || 0) + 1);
    notify(m);
  }
  renderChatList();
}
function onUpdatedMessage(m) {
  const list = S.msgs.get(m.chat_id); if (!list) return;
  const i = list.findIndex((x) => x.id === m.id); if (i < 0) return;
  list[i] = m; if (S.current === m.chat_id) rerenderMessage(m.id);
  if (S.lastByChat.get(m.chat_id)?.id === m.id) { S.lastByChat.set(m.chat_id, m); renderChatList(); }
}
function onReaction(r, added) {
  if (!r || !r.message_id) return;
  if (r.user_id === S.me.id) return; // свои уже показаны
  const list = S.reacts.get(r.message_id); if (!list) return;
  if (added) { if (!list.some((x) => x.user_id === r.user_id && x.emoji === r.emoji)) list.push(r); }
  else S.reacts.set(r.message_id, list.filter((x) => !(x.user_id === r.user_id && x.emoji === r.emoji)));
  if (S.msgs.get(S.current)?.some((x) => x.id === r.message_id)) rerenderMessage(r.message_id);
}

// звук и системное уведомление о новом сообщении
let audioCtx;
function beep(freqs = [880, 1320], dur = 0.09) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f; o.type = "sine"; o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * dur;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    });
  } catch { /* без звука */ }
}
function notify(m) {
  beep();
  if (window.AndroidBridge?.notify) {
    const c = S.chats.find((x) => x.id === m.chat_id);
    window.AndroidBridge.notify(c ? chatTitle(c) : "Новое сообщение", (c?.is_group ? (S.profiles.get(m.user_id)?.name || "") + ": " : "") + previewText({ ...m, user_id: null }), m.chat_id);
  } else if (!appVisible() && "Notification" in window && Notification.permission === "granted") {
    try { new Notification(S.profiles.get(m.user_id)?.name || "Новое сообщение", { body: previewText({ ...m, user_id: null }), icon: "icon-192.png" }); } catch { /* */ }
  }
}
document.addEventListener("click", function askNotify() {
  document.removeEventListener("click", askNotify);
  if ("Notification" in window && Notification.permission === "default" && !window.AndroidBridge) Notification.requestPermission().catch(() => {});
}, { once: true });

// ───────────── Звонки (WebRTC) ─────────────
const Calls = {
  pc: null, local: null, remote: null, peer: null, callId: null, video: false, role: null,
  pendingIce: [], ringTimer: null, startedAt: 0, ui: null, ring: null, chans: new Map(), facing: "user", connected: false,

  init() {
    const my = S.sb.channel(`call-${S.me.id}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "signal" }, ({ payload }) => this.onSignal(payload))
      .subscribe();
    this.chans.set(S.me.id, Promise.resolve(my));
  },
  channelFor(userId) {
    if (!this.chans.has(userId)) {
      this.chans.set(userId, new Promise((resolve) => {
        const ch = S.sb.channel(`call-${userId}`, { config: { broadcast: { self: false } } });
        ch.subscribe((st) => { if (st === "SUBSCRIBED") resolve(ch); });
        setTimeout(() => resolve(ch), 4000);
      }));
    }
    return this.chans.get(userId);
  },
  async send(to, payload) {
    const msg = { ...payload, to, from: S.me.id, callId: payload.callId || this.callId };
    const ch = await this.channelFor(to);
    await ch.send({ type: "broadcast", event: "signal", payload: msg });
  },

  async media(video) {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: video ? { facingMode: this.facing, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } } : false,
    });
  },
  makePc() {
    const pc = new RTCPeerConnection({ iceServers: CFG.iceServers || [{ urls: "stun:stun.l.google.com:19302" }] });
    this.remote = new MediaStream();
    pc.ontrack = (e) => {
      const tracks = e.streams[0] ? e.streams[0].getTracks() : [e.track];
      tracks.forEach((t) => { if (!this.remote.getTracks().includes(t)) this.remote.addTrack(t); t.onunmute = t.onmute = () => this.attach(); });
      this.attach();
    };
    pc.onicecandidate = (e) => { if (e.candidate) this.send(this.peer, { kind: "ice", candidate: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected" && !this.connected) {
        this.connected = true; this.startedAt = Date.now(); this.stopRing(); this.setStatus("00:00"); this.timer(); this.attach(); this.tuneSenders();
      }
      if (pc.connectionState === "connected" && this.connected) { this.reconnecting = false; clearTimeout(this.restartTimer); this.ui?.querySelector(".status")?.classList.remove("weak"); }
      // кратковременный обрыв (смена Wi-Fi/мобильной сети) — переподключаемся, не сбрасывая звонок
      if (pc.connectionState === "disconnected" && this.connected) {
        this.setStatus("Восстанавливаю связь…"); this.ui?.querySelector(".status")?.classList.add("weak");
        clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => { if (this.pc === pc && pc.connectionState !== "connected") this.restartIce(); }, 2500);
      }
      if (pc.connectionState === "failed") {
        if (this.connected && (this.restarts || 0) < 3) { this.restartIce(); return; }
        toast(this.connected ? "Связь потеряна" : "Связь не установилась: сеть блокирует звонок", 4000); this.hangup(true, "failed");
      }
    };
    this.local.getTracks().forEach((t) => pc.addTrack(t, this.local));
    return pc;
  },

  async start(userId, video) {
    if (this.pc || this.ui) { toast("Вы уже в звонке"); return; }
    if (!window.RTCPeerConnection || !navigator.mediaDevices) { toast("Звонки не поддерживаются на этом устройстве"); return; }
    this.peer = userId; this.video = video; this.role = "caller"; this.callId = crypto.randomUUID(); this.connected = false;
    try { this.local = await this.media(video); }
    catch { toast(video ? "Нет доступа к камере или микрофону" : "Нет доступа к микрофону"); this.reset(); return; }
    window.AndroidBridge?.callState?.(true, !!video);
    this.showUi("Вызов…");
    this.ringback();
    this.pc = this.makePc();
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.send(userId, { kind: "offer", sdp: offer.sdp, video, name: S.me.name });
    this.ringTimer = setTimeout(() => { if (!this.connected) { toast("Не отвечает"); this.hangup(true, "noanswer"); } }, 45000);
  },

  async onSignal(p) {
    if (p.to !== S.me.id) return;
    if (p.kind === "offer") {
      if (this.pc || this.ui) { this.send(p.from, { kind: "busy", callId: p.callId }); return; }
      this.peer = p.from; this.video = !!p.video; this.callId = p.callId; this.role = "callee"; this.offer = p.sdp; this.pendingIce = []; this.connected = false;
      if (!S.profiles.has(p.from)) await loadProfiles();
      this.showIncoming();
      return;
    }
    if (p.callId !== this.callId) return;
    switch (p.kind) {
      case "answer":
        clearTimeout(this.ringTimer); this.stopRing(); this.setStatus("Соединение…");
        await this.pc.setRemoteDescription({ type: "answer", sdp: p.sdp });
        for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
        break;
      case "ice":
        if (this.pc?.remoteDescription) await this.pc.addIceCandidate(p.candidate).catch(() => {});
        else this.pendingIce.push(p.candidate);
        break;
      case "decline": toast("Звонок отклонён"); this.hangup(false, "declined"); break;
      case "busy": toast("Абонент занят"); this.hangup(false, "busy"); break;
      case "hangup": this.hangup(false, "remote"); break;
      case "video": this.ui?.classList.toggle("has-video", !!p.on && this.hasRemoteVideo()); break;
      case "screen":
        this.ui?.classList.toggle("remote-screen", !!p.on);
        if (p.on) toast(`${S.profiles.get(this.peer)?.name || "Собеседник"} показывает экран`);
        break;
    }
  },

  async accept() {
    this.stopRing();
    try { this.local = await this.media(this.video); }
    catch {
      try { this.local = await this.media(false); this.video = false; }
      catch { toast("Нет доступа к микрофону"); this.decline(); return; }
    }
    window.AndroidBridge?.callState?.(true, !!this.video);
    this.showUi("Соединение…");
    this.pc = this.makePc();
    await this.pc.setRemoteDescription({ type: "offer", sdp: this.offer });
    for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.send(this.peer, { kind: "answer", sdp: answer.sdp });
  },
  decline() { this.send(this.peer, { kind: "decline" }); this.logMissed = false; this.reset(); },

  async hangup(notifyPeer, reason) {
    if (notifyPeer && this.peer) this.send(this.peer, { kind: "hangup" });
    const dur = this.connected ? (Date.now() - this.startedAt) / 1000 : 0;
    const wasCaller = this.role === "caller", peer = this.peer, video = this.video;
    this.reset();
    if (wasCaller && peer) { // запись о звонке в переписке
      const { data: id } = await S.sb.rpc("get_or_create_dm", { other: peer });
      if (id) {
        if (!S.chats.find((c) => c.id === id)) { await loadChats(); renderChatList(); }
        const kind = video ? "Видеозвонок" : "Звонок";
        await postMessage({ body: dur ? `📞 ${kind}, ${fmtDur(dur)}` : `📞 ${kind}: ${reason === "declined" ? "отклонён" : reason === "busy" ? "занято" : "без ответа"}` }, id);
      }
    }
  },
  reset() {
    if (this.screen) this.stopScreen(true);
    if (this.ui || this.pc) { window.AndroidBridge?.callState?.(false, false); window.AndroidBridge?.cancelCall?.(); }
    clearTimeout(this.ringTimer); clearTimeout(this.videoOffTimer); clearInterval(this.tick); this.stopRing();
    this.pc?.close(); this.pc = null;
    this.local?.getTracks().forEach((t) => t.stop()); this.local = null; this.remote = null;
    clearTimeout(this.restartTimer); this.restarts = 0;
    this.ui?.remove(); this.ui = null; this.peer = null; this.callId = null; this.connected = false; this.pendingIce = [];
  },

  // ── интерфейс звонка
  showIncoming() {
    const p = S.profiles.get(this.peer);
    this.ui?.remove();
    this.ui = h("div", { class: "call ringing" },
      h("div", { class: "who" }, avatarEl(this.peer, "xl"), h("b", null, p?.name || "Звонок"), h("span", null, this.video ? "Видеозвонок…" : "Аудиозвонок…")),
      h("div", { class: "controls" },
        h("div", { class: "cbtn-wrap" }, h("button", { class: "cbtn red", html: I.hang, onclick: () => this.decline() }), "Отклонить"),
        h("div", { class: "cbtn-wrap" }, h("button", { class: "cbtn green", html: this.video ? I.video : I.phone, onclick: () => this.accept() }), "Ответить")));
    document.body.append(this.ui);
    this.ringtone();
    if (window.AndroidBridge?.incomingCall) window.AndroidBridge.incomingCall(p?.name || "Звонок");
  },
  showUi(status) {
    const p = S.profiles.get(this.peer);
    this.ui?.remove();
    const remoteV = h("video", { class: "remote", autoplay: true, playsinline: true });
    const localV = h("video", { class: "local", autoplay: true, playsinline: true, muted: true });
    localV.muted = true;
    const micBtn = h("button", { class: "cbtn", html: I.mic });
    micBtn.onclick = () => { const t = this.local?.getAudioTracks()[0]; if (!t) return; t.enabled = !t.enabled; micBtn.classList.toggle("off", !t.enabled); micBtn.innerHTML = t.enabled ? I.mic : I.micOff; };
    const camBtn = h("button", { class: "cbtn", html: this.video ? I.video : I.videoOff });
    camBtn.onclick = () => this.toggleCamera(camBtn);
    const flipBtn = h("button", { class: "cbtn", html: I.flip, onclick: () => this.flip() });
    const scrBtn = h("button", { class: "cbtn scr-btn", html: I.screen, onclick: () => (this.screen ? this.stopScreen() : this.startScreen()) });
    const canShare = !!(window.AndroidBridge?.startScreenShare || navigator.mediaDevices?.getDisplayMedia);
    this.ui = h("div", { class: `call${this.role === "caller" ? " ringing" : ""}` }, remoteV, localV,
      h("div", { class: "who" }, avatarEl(this.peer, "xl"), h("b", null, p?.name || ""), h("span", { class: "status" }, status)),
      h("div", { class: "controls" },
        h("div", { class: "cbtn-wrap" }, micBtn, "Микрофон"),
        h("div", { class: "cbtn-wrap" }, camBtn, "Камера"),
        h("div", { class: "cbtn-wrap" }, flipBtn, "Повернуть"),
        canShare ? h("div", { class: "cbtn-wrap" }, scrBtn, "Экран") : null,
        h("div", { class: "cbtn-wrap" }, h("button", { class: "cbtn red", html: I.hang, onclick: () => this.hangup(true, "local") }), "Завершить")));
    document.body.append(this.ui);
    this.attach();
  },
  attach() {
    if (!this.ui) return;
    const lv = this.ui.querySelector("video.local"), rv = this.ui.querySelector("video.remote");
    if (lv && this.local) {
      if (lv.srcObject !== this.local) lv.srcObject = this.local;
      lv.classList.toggle("hidden", !this.local.getVideoTracks().some((t) => t.enabled && t.readyState === "live"));
    }
    if (rv && this.remote) {
      if (rv.srcObject !== this.remote) rv.srcObject = this.remote;
      if (rv.paused) rv.play?.().catch(() => {});
    }
    // видео собеседника: включаем сразу, а выключаем только если кадров нет дольше 2 секунд — без мигания
    const has = this.hasRemoteVideo();
    clearTimeout(this.videoOffTimer);
    if (has) this.ui.classList.add("has-video");
    else if (this.ui.classList.contains("has-video")) this.videoOffTimer = setTimeout(() => { if (!this.hasRemoteVideo()) this.ui?.classList.remove("has-video"); }, 2000);
    if (this.connected) this.ui.classList.remove("ringing");
  },
  // ровное качество: ограничиваем битрейт и частоту кадров, при плохой сети снижаем чёткость, а не плавность
  async tuneSenders() {
    if (!this.pc) return;
    for (const snd of this.pc.getSenders()) {
      if (snd.track?.kind !== "video") continue;
      try {
        const prm = snd.getParameters();
        if (!prm.encodings || !prm.encodings.length) prm.encodings = [{}];
        prm.encodings[0].maxBitrate = this.screen ? 1200000 : 800000;
        prm.encodings[0].maxFramerate = this.screen ? 10 : 24;
        prm.degradationPreference = this.screen ? "maintain-resolution" : "maintain-framerate";
        await snd.setParameters(prm);
      } catch { /* браузер не поддерживает — не страшно */ }
    }
  },
  hasRemoteVideo() { return !!this.remote?.getVideoTracks().some((t) => t.readyState === "live" && !t.muted); },
  setStatus(t) { const s = this.ui?.querySelector(".status"); if (s) s.textContent = t; if (this.connected) this.ui?.classList.remove("ringing"); },
  timer() { clearInterval(this.tick); this.tick = setInterval(() => this.setStatus(fmtDur((Date.now() - this.startedAt) / 1000)), 1000); },

  async toggleCamera(btn) {
    const vt = this.local?.getVideoTracks()[0];
    if (vt) {
      vt.enabled = !vt.enabled; btn.innerHTML = vt.enabled ? I.video : I.videoOff; btn.classList.toggle("off", !vt.enabled);
      this.send(this.peer, { kind: "video", on: vt.enabled }); this.attach(); return;
    }
    // включаем камеру во время аудиозвонка
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing } });
      const track = s.getVideoTracks()[0]; this.local.addTrack(track);
      const sender = this.pc.getSenders().find((x) => x.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
      else {
        this.pc.addTrack(track, this.local);
        const offer = await this.pc.createOffer(); await this.pc.setLocalDescription(offer);
        await this.send(this.peer, { kind: "reoffer", sdp: offer.sdp });
      }
      this.video = true; btn.innerHTML = I.video; btn.classList.remove("off"); this.send(this.peer, { kind: "video", on: true }); this.attach();
    } catch { toast("Камера недоступна"); }
  },
  async restartIce() {
    if (!this.pc || this.role !== "caller") return;      // перезапуск начинает звонящий, чтобы не было встречных предложений
    this.restarts = (this.restarts || 0) + 1;
    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      await this.send(this.peer, { kind: "reoffer", sdp: offer.sdp });
    } catch { /* следующая попытка по таймеру */ }
  },
  // ── демонстрация экрана
  async videoSend(track) {
    const sender = this.pc.getSenders().find((x) => x.track?.kind === "video") ||
      this.pc.getTransceivers().find((t) => t.receiver.track?.kind === "video" && t.sender && !t.sender.track && t.direction !== "recvonly")?.sender;
    if (sender) { await sender.replaceTrack(track); this.tuneSenders(); return; }
    this.pc.addTrack(track, this.local);
    const offer = await this.pc.createOffer(); await this.pc.setLocalDescription(offer);
    await this.send(this.peer, { kind: "reoffer", sdp: offer.sdp });
  },
  async startScreen() {
    if (!this.pc || !this.connected) { toast("Дождитесь соединения"); return; }
    let track;
    try {
      if (window.AndroidBridge?.startScreenShare) {
        // Android: кадры экрана приходят из приложения и рисуются на холсте
        const cv = document.createElement("canvas"); cv.width = 720; cv.height = 1280;
        const ctx = cv.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cv.width, cv.height);
        const stream = cv.captureStream(0); track = stream.getVideoTracks()[0];
        const img = new Image();
        img.onload = () => {
          if (cv.width !== img.naturalWidth || cv.height !== img.naturalHeight) { cv.width = img.naturalWidth; cv.height = img.naturalHeight; }
          ctx.drawImage(img, 0, 0); track.requestFrame?.();
        };
        window.onScreenFrame = (data) => { img.src = data; };
        window.onScreenShareStopped = () => { if (this.screen) this.stopScreen(); };
        if (!window.AndroidBridge.startScreenShare()) throw new Error("denied");
      } else {
        const ds = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
        track = ds.getVideoTracks()[0];
        track.onended = () => { if (this.screen) this.stopScreen(); };
      }
    } catch { toast("Демонстрация экрана недоступна"); return; }
    const cam = this.local?.getVideoTracks()[0] || null;
    this.screen = { track, cam, camWasOn: !!cam?.enabled };
    try { await this.videoSend(track); } catch { this.stopScreen(true); toast("Не удалось начать показ экрана"); return; }
    this.send(this.peer, { kind: "video", on: true });
    this.send(this.peer, { kind: "screen", on: true });
    this.ui?.classList.add("sharing");
    const b = this.ui?.querySelector(".scr-btn"); if (b) b.classList.add("off");
    this.ui?.append(h("div", { class: "share-banner" }, "Вы показываете свой экран",
      h("button", { onclick: () => this.stopScreen() }, "Остановить")));
  },
  async stopScreen(silent) {
    const sc = this.screen; if (!sc) return;
    this.screen = null;
    window.AndroidBridge?.stopScreenShare?.();
    window.onScreenFrame = null; window.onScreenShareStopped = null;
    try { sc.track.stop(); } catch { /* */ }
    if (!silent && this.pc) {
      try { await this.videoSend(sc.cam && sc.cam.readyState === "live" ? sc.cam : null); } catch { /* */ }
      this.send(this.peer, { kind: "screen", on: false });
      this.send(this.peer, { kind: "video", on: !!(sc.cam && sc.camWasOn) });
    }
    this.ui?.classList.remove("sharing");
    this.ui?.querySelector(".share-banner")?.remove();
    const b = this.ui?.querySelector(".scr-btn"); if (b) b.classList.remove("off");
    this.attach();
  },
  async flip() {
    const vt = this.local?.getVideoTracks()[0]; if (!vt) return;
    this.facing = this.facing === "user" ? "environment" : "user";
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing } });
      const nt = s.getVideoTracks()[0];
      const sender = this.pc.getSenders().find((x) => x.track === vt);
      await sender?.replaceTrack(nt);
      this.local.removeTrack(vt); vt.stop(); this.local.addTrack(nt);
      const lv = this.ui?.querySelector("video.local"); if (lv) lv.style.transform = this.facing === "user" ? "scaleX(-1)" : "none";
      this.attach();
    } catch { toast("Не удалось переключить камеру"); }
  },

  // ── звуки звонка
  ringtone() {
    this.stopRing();
    const play = () => { beep([660, 880, 660, 880], 0.18); navigator.vibrate?.([400, 200, 400]); };
    play(); this.ring = setInterval(play, 2000);
  },
  ringback() {
    this.stopRing();
    const play = () => beep([440, 480], 0.5);
    play(); this.ring = setInterval(play, 3000);
  },
  stopRing() { clearInterval(this.ring); this.ring = null; navigator.vibrate?.(0); },
};

// повторное предложение (камера включена посреди аудиозвонка)
const origSignal = Calls.onSignal.bind(Calls);
Calls.onSignal = async function (p) {
  if (p.to === S.me.id && p.callId === this.callId && this.pc) {
    if (p.kind === "reoffer") {
      await this.pc.setRemoteDescription({ type: "offer", sdp: p.sdp });
      const ans = await this.pc.createAnswer(); await this.pc.setLocalDescription(ans);
      await this.send(this.peer, { kind: "reanswer", sdp: ans.sdp }); return;
    }
    if (p.kind === "reanswer") { await this.pc.setRemoteDescription({ type: "answer", sdp: p.sdp }); return; }
  }
  return origSignal(p);
};
