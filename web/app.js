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
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>',
  calls: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 013 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/></svg>',
  bellOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13.7 21a2 2 0 01-3.4 0M18.6 13A17 17 0 0118 8M6.3 6.3A6 6 0 006 8c0 7-3 9-3 9h14M18 8a6 6 0 00-9.3-5M2 2l20 20"/></svg>',
  pushpin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  forward: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 5l7 7-7 7M21 12H9a6 6 0 00-6 6v1"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  tick: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5l3.5 3.5L15 4.5"/></svg>',
  ticks: '<svg viewBox="0 0 22 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 9.5L5 13l8.5-8.5M10 12l1 1 8.5-8.5"/></svg>',
  callIn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 7L7 17M7 9v8h8"/></svg>',
  callOut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-5A8 8 0 1121 12z"/></svg>',
  story: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" stroke-dasharray="4 2.2"/><circle cx="12" cy="12" r="4.5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M16 7l3 3M18 5l2 2"/></svg>',
  screen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M9 10l3-3 3 3M12 7v6"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  invite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0114 0M19 8v6M16 11h6"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><circle cx="12" cy="13" r="4"/></svg>',
  gallery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 16l-5-5L5 21"/></svg>',
  circle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 5M22 9l-5 5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3a9 9 0 100 18c1.1 0 1.6-.9 1.3-1.8-.3-.9.2-1.9 1.2-1.9H17a4 4 0 004-4c0-5-4-10.3-9-10.3z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/></svg>',
  circleCam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M8 9.5h5.5a1 1 0 011 1v3a1 1 0 01-1 1H8a1 1 0 01-1-1v-3a1 1 0 011-1zM14.5 11.2l2.5-1.5v4.6l-2.5-1.5"/></svg>',
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
  const close = () => { if (!back.isConnected) return; back.remove(); onClose && onClose(); };
  back._close = close;
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

// ───────────── Оформление (цвет темы и светлая/тёмная) ─────────────
const THEMES = [
  ["strict", "Строгая", "#2F6FDB", "#2F6FDB"], ["coral", "Коралл", "#E8664F", "#F2A541"], ["ocean", "Океан", "#2F80ED", "#00B4D8"], ["forest", "Лес", "#23985B", "#8DBA2B"],
  ["lavender", "Лаванда", "#8B5CF6", "#EC4899"], ["sunset", "Закат", "#F06418", "#E5374B"], ["sky", "Небо", "#0EA5E9", "#6366F1"],
  ["rose", "Роза", "#E11D74", "#F59E0B"], ["graphite", "Графит", "#4B5A70", "#0EA5E9"],
];
const Theme = {
  get(k, d) { try { return localStorage.getItem("ui:" + k) || d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ui:" + k, v); } catch { /* */ } },
  apply() {
    const t = this.get("theme", "strict"), m = this.get("mode", "auto");
    const root = document.documentElement;
    if (t === "strict") delete root.dataset.theme; else root.dataset.theme = t;
    if (m === "auto") delete root.dataset.mode; else root.dataset.mode = m;
    // шапка теперь цвета панели — строка состояния в тон ей
    const color = (getComputedStyle(root).getPropertyValue("--panel") || "").trim() || "#FFFFFF";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
    try { window.AndroidBridge?.setBarColor?.(color); } catch { /* */ }
  },
  sheet() {
    let close;
    const cur = () => this.get("theme", "strict");
    const grid = h("div", { class: "theme-grid" }, THEMES.map(([id, name, c1, c2]) =>
      h("button", { class: `theme-sw${cur() === id ? " on" : ""}`, onclick: (e) => {
        this.set("theme", id); this.apply();
        grid.querySelectorAll(".theme-sw").forEach((b) => b.classList.toggle("on", b === e.currentTarget));
      } }, h("i", { style: { background: `linear-gradient(135deg, ${c1}, ${c2})` } }), name)));
    const mode = this.get("mode", "auto");
    const seg = (v, label) => h("button", { class: `seg${mode === v ? " on" : ""}`, onclick: (e) => {
      this.set("mode", v); this.apply();
      e.currentTarget.parentNode.querySelectorAll(".seg").forEach((b) => b.classList.toggle("on", b === e.currentTarget));
    } }, label);
    close = sheet([
      h("h3", null, "🎨 Оформление"),
      h("div", { class: "section-title", style: { padding: "0 4px 8px" } }, "Цвет"), grid,
      h("div", { class: "section-title", style: { padding: "0 4px 8px" } }, "Тема"),
      h("div", { class: "segmented" }, seg("auto", "Авто"), seg("light", "☀️ Светлая"), seg("dark", "🌙 Тёмная")),
      h("div", { class: "section-title", style: { padding: "0 4px 8px" } }, "Размер текста в чатах"),
      h("div", { class: "segmented fs-seg" }, ...[[14, "Мелкий"], [16, "Обычный"], [18, "Крупный"], [20, "Очень крупный"]].map(([v, l]) =>
        h("button", { class: `seg${(Prefs.get("fontSize") || 16) === v ? " on" : ""}`, onclick: (e) => {
          Prefs.set("fontSize", v); Prefs.apply();
          e.currentTarget.parentNode.querySelectorAll(".seg").forEach((b) => b.classList.toggle("on", b === e.currentTarget));
        } }, l))),
      h("label", { class: "toggle-row" }, h("input", { type: "checkbox", checked: Prefs.get("pattern"), onchange: (e) => { Prefs.set("pattern", e.target.checked); Prefs.apply(); } }), "Узор на фоне чатов"),
      h("button", { class: "btn wide", onclick: () => close() }, "Готово"),
    ]);
  },
};
Theme.apply();

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
  const inv = new URLSearchParams(location.search).get("invite");
  if (inv) { invite.value = inv.toUpperCase(); setTimeout(() => setMode("up"), 0); }
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
        /banned/i.test(m) ? "Доступ закрыт администратором семьи" :
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

// ───────────── Приглашения и «поделиться приложением» ─────────────
const APP_LINKS = {
  site: CFG.siteUrl || "https://archi041022-ui.github.io/family-chat/",
  apk: CFG.apkUrl || "https://github.com/archi041022-ui/family-chat/releases/latest/download/Semya.apk",
};
// ───────────── Приглашение через контакты телефона ─────────────
const Invite = {
  async fromContacts(code) {
    if (!code) { const r = await S.sb.rpc("get_invite_code"); code = r.data; }
    if (!code) { toast("Нет связи с сервером"); return; }
    if (window.AndroidBridge?.loadContacts) {
      // свой список контактов внутри приложения — без системного окна выбора
      let done = false, close = null;
      const list = h("div", { class: "contact-list" }, h("p", { class: "sheet-note" }, "Загружаю контакты…"));
      const search = h("input", { type: "search", placeholder: "Поиск по имени или номеру", class: "contact-search" });
      let all = [];
      const draw = () => {
        const q = search.value.trim().toLowerCase(), qd = q.replace(/\D/g, "");
        const rows = all.filter((c) => !q || c.name.toLowerCase().includes(q) || (qd && c.phone.replace(/\D/g, "").includes(qd))).slice(0, 60);
        list.replaceChildren(...(rows.length ? rows.map((c) => h("button", { class: "menu-item", onclick: () => { close?.(); setTimeout(() => this.send(c, code), 120); } },
          h("div", { class: "avatar sm", style: { background: colorFor(this.digits(c.phone)) } }, initials(c.name || "?")),
          h("span", null, c.name || "Без имени", h("small", { class: "sub" }, c.phone)))) : [h("p", { class: "sheet-note" }, q ? "Никого не нашли" : "В телефоне нет контактов с номерами")]));
      };
      search.addEventListener("input", draw);
      window.onContactsList = (arr, err) => {
        if (done) return; done = true; window.onContactsList = null;
        if (!arr) { close?.(); toast(err === "denied" ? "Нет доступа к контактам — введите номер вручную" : "Не удалось прочитать контакты", 3500); this.manual(code); return; }
        all = arr; draw();
      };
      close = sheet([h("h3", null, "Кого пригласить?"), search, list]);
      try { window.AndroidBridge.loadContacts(); } catch { done = true; close?.(); this.manual(code); }
      return;
    }
    if (window.AndroidBridge?.pickContact) {
      let done = false;
      const fin = (c) => { if (done) return; done = true; window.onContactPicked = null; Lock.ext = false; if (c) setTimeout(() => this.send(c, code), 150); };
      window.onContactPicked = fin;
      Lock.ext = true;
      setTimeout(() => { if (!done && document.visibilityState === "visible") fin(null); }, 120000);
      try { window.AndroidBridge.pickContact(); } catch { fin(null); toast("Не удалось открыть контакты"); }
      return;
    }
    // браузер Chrome на Android умеет выбирать контакты сам
    if (navigator.contacts?.select) {
      try {
        const [c] = await navigator.contacts.select(["name", "tel"], { multiple: false });
        if (c?.tel?.length) { this.send({ name: (c.name || [])[0] || "", phone: c.tel[0] }, code); return; }
      } catch { /* отменили */ return; }
    }
    this.manual(code);
  },
  manual(code) {
    let close;
    const phone = h("input", { type: "tel", placeholder: "+7 900 000-00-00" });
    close = sheet([h("h3", null, "Кого пригласить?"), h("p", { class: "sheet-note" }, "Этот браузер не умеет открывать контакты. Введите номер телефона:"),
      h("label", { class: "field" }, phone),
      h("button", { class: "btn wide", onclick: () => { if (phone.value.replace(/\D/g, "").length < 10) { toast("Введите номер полностью"); return; } close(); this.send({ name: "", phone: phone.value }, code); } }, "Дальше")]);
  },
  digits(phone) {
    let d = String(phone).replace(/\D/g, "");
    if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
    if (d.length === 10) d = "7" + d;
    return d;
  },
  send(c, code) {
    let close;
    const first = (c.name || "").split(" ")[0];
    const text = (first ? `${first}, привет! ` : "Привет! ") + inviteText(code).replace(/^Привет! /, "");
    const d = this.digits(c.phone);
    const go = (fn) => () => { close(); fn(); };
    const open = (url) => { Lock.ext = true; if (window.AndroidBridge?.openUrl) window.AndroidBridge.openUrl(url); else window.open(url, "_blank", "noopener"); };
    close = sheet([
      h("div", { class: "sheet-head" }, h("div", { class: "avatar sm", style: { background: colorFor(d) } }, initials(c.name || "?")),
        h("div", null, h("b", null, c.name || "Новый контакт"), h("small", { style: { display: "block", color: "var(--muted)" } }, c.phone))),
      h("p", { class: "sheet-note" }, "Как отправить приглашение?"),
      h("button", { class: "menu-item", onclick: go(() => {
        Lock.ext = true;
        if (window.AndroidBridge?.sendSms) window.AndroidBridge.sendSms(c.phone, text);
        else location.href = `sms:${c.phone}?body=${encodeURIComponent(text)}`;
      }) }, h("span", { class: "tg-ico", style: { background: "#2EAD6B" }, html: I.chat }), "SMS"),
      h("button", { class: "menu-item", onclick: go(() => open(`https://wa.me/${d}?text=${encodeURIComponent(text)}`)) }, h("span", { class: "tg-ico", style: { background: "#25D366" }, html: I.phone }), "WhatsApp"),
      h("button", { class: "menu-item", onclick: go(() => { copyText(text, "Текст скопирован — вставьте его в Telegram"); open(`https://t.me/+${d}`); }) }, h("span", { class: "tg-ico", style: { background: "#2AABEE" }, html: I.send }), "Telegram (откроется чат, текст вставьте)"),
      h("button", { class: "menu-item", onclick: go(() => { copyText(text, "Текст приглашения скопирован"); shareTextOut(text); }) }, h("span", { class: "tg-ico", style: { background: "#6C7A89" }, html: I.share }), "Другое приложение"),
    ]);
    S.lastInvite = { c, text };
  },
};
const inviteLink = (code) => `${APP_LINKS.site}?invite=${encodeURIComponent(code)}`;
function inviteText(code) {
  return `Привет! Присоединяйся к нашему семейному мессенджеру «${CFG.appName || "Семья"}» 💬\n\n` +
    `📱 Android — скачай приложение: ${APP_LINKS.apk}\n` +
    `🌐 Любой телефон или компьютер — открой сайт: ${inviteLink(code)}\n\n` +
    `🔑 Код приглашения: ${code}\n\n` +
    `Ссылку открывай в Chrome или Яндекс Браузере. Нажми «Регистрация», придумай логин и пароль.`;
}
async function shareTextOut(text) {
  try {
    if (window.AndroidBridge?.shareText) { Lock.ext = true; window.AndroidBridge.shareText(text); return; }
    if (navigator.share) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text); toast("Скопировано — вставьте в любой мессенджер");
  } catch (e) { if (e?.name !== "AbortError") { try { await navigator.clipboard.writeText(text); toast("Скопировано"); } catch { toast("Не удалось поделиться"); } } }
}
async function copyText(text, msg = "Скопировано") {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { const t = h("textarea", { style: { position: "fixed", opacity: 0 } }, text); document.body.append(t); t.select(); try { document.execCommand("copy"); toast(msg); } catch { toast("Не удалось скопировать"); } t.remove(); }
}
function qrImage(text) {
  if (typeof window.qrcode !== "function") return null;
  try { const q = window.qrcode(0, "M"); q.addData(text); q.make(); return h("img", { class: "qr", src: q.createDataURL(6, 2), alt: "QR-код приглашения" }); }
  catch { return null; }
}
async function renderInvite() {
  const box = $("#tabInvite"); if (!box) return;
  box.innerHTML = "";
  box.append(h("button", { class: "tg-back", onclick: () => showTab("settings") }, h("span", { html: I.back }), "Настройки"));
  const { data: code } = await S.sb.rpc("get_invite_code");
  if (!code) { box.append(h("p", { class: "empty-chat" }, "Не удалось получить код приглашения. Проверьте интернет.")); return; }
  const count = S.profiles.size;
  const qr = qrImage(inviteLink(code));
  box.append(
    h("div", { class: "invite-hero" },
      h("div", { class: "invite-emoji" }, "👨‍👩‍👧‍👦"),
      h("h2", null, "Пригласите родных"),
      h("p", null, `Сейчас в семье ${count} ${plural(count, "человек", "человека", "человек")}. Отправьте приглашение — по нему можно скачать приложение и зарегистрироваться.`)),
    h("div", { class: "section-title" }, "Код приглашения"),
    h("button", { class: "invite-code", title: "Скопировать", onclick: () => copyText(code, "Код скопирован") }, code, h("small", null, "нажмите, чтобы скопировать")),
    h("div", { class: "invite-actions" },
      h("button", { class: "btn wide", onclick: () => Invite.fromContacts(code) }, h("span", { html: I.user }), "Выбрать из контактов телефона"),
      h("button", { class: "btn wide", onclick: () => shareTextOut(inviteText(code)) }, h("span", { html: I.share }), "Поделиться приглашением"),
      h("button", { class: "btn wide ghost", onclick: () => copyText(inviteText(code), "Приглашение скопировано") }, h("span", { html: I.copy }), "Скопировать текст")),
    qr ? h("div", { class: "section-title" }, "QR-код — покажите с экрана") : null,
    qr ? h("div", { class: "qr-wrap" }, qr, h("small", null, "Наведите камеру телефона — откроется сайт с уже вписанным кодом")) : null,
    h("div", { class: "section-title" }, "Поделиться приложением"),
    h("div", { class: "invite-links" },
      h("div", { class: "invite-link" },
        h("div", { class: "mid" }, h("b", null, "🤖 Приложение для Android"), h("small", null, APP_LINKS.apk)),
        h("button", { class: "icon-btn", title: "Поделиться", html: I.share, onclick: () => shareTextOut(`Приложение «${CFG.appName || "Семья"}» для Android: ${APP_LINKS.apk}\nКод приглашения: ${code}`) }),
        h("button", { class: "icon-btn", title: "Скопировать", html: I.copy, onclick: () => copyText(APP_LINKS.apk, "Ссылка скопирована") })),
      h("div", { class: "invite-link" },
        h("div", { class: "mid" }, h("b", null, "🌐 Сайт — iPhone и компьютер"), h("small", null, inviteLink(code))),
        h("button", { class: "icon-btn", title: "Поделиться", html: I.share, onclick: () => shareTextOut(`«${CFG.appName || "Семья"}» в браузере: ${inviteLink(code)}\nКод приглашения: ${code}`) }),
        h("button", { class: "icon-btn", title: "Скопировать", html: I.copy, onclick: () => copyText(inviteLink(code), "Ссылка скопирована") }))),
    h("div", { class: "section-title" }, "Как подключиться"),
    h("ol", { class: "invite-steps" },
      h("li", null, "Откройте ссылку в Chrome или Яндекс Браузере (не внутри МАКСа)."),
      h("li", null, "На Android скачайте и установите файл, на iPhone — «Поделиться» → «На экран Домой»."),
      h("li", null, "Нажмите «Регистрация», придумайте логин и пароль, введите код приглашения.")),
    S.isAdmin ? h("button", { class: "menu-item", onclick: () => changeInviteCode(code) }, h("span", { html: I.key }), "Сменить код приглашения") : null,
  );
}
function changeInviteCode(current) {
  let close;
  const inp = h("input", { value: current, autocapitalize: "characters", maxlength: 20 });
  const err = h("p", { class: "error" });
  close = sheet([
    h("h3", null, "Новый код приглашения"),
    h("p", { class: "sheet-note" }, "Старый код перестанет работать. Те, кто уже в семье, ничего не заметят."),
    h("label", { class: "field" }, inp), err,
    h("button", { class: "btn wide", onclick: async () => {
      const { data } = await S.sb.rpc("set_invite_code", { code: inp.value });
      if (data !== "OK") { err.textContent = data === "BAD_CODE" ? "От 4 до 20 букв, цифр или дефисов" : "Менять код может только администратор"; return; }
      close(); toast("Код изменён"); renderInvite();
    } }, "Сохранить"),
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
  if (!S.isAdmin) return;
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
  if (!me) { await S.sb.auth.signOut(); showAuth(); toast("Аккаунт не найден — возможно, его удалил администратор семьи", 5000); return; }
  if (me.banned) { await S.sb.auth.signOut(); showAuth(); toast("Доступ закрыт администратором семьи", 5000); return; }
  S.me = me; S.sessionEmail = user.email || "";
  Prefs.apply();
  if (Lock.enabled()) Lock.show();
  await Privacy.load();
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
  Welcome.maybeShow(user);
  Updates.start(); Burn.start();
  Tasks.start();
  Joins.load();
  Push.setup();
  const hashChat = location.hash.slice(1);
  if (hashChat && S.chats.find((c) => c.id === hashChat)) openChat(hashChat);
}

// ───────────── Загрузка данных ─────────────
async function loadProfiles() {
  const { data } = await S.sb.from("profiles").select("*");
  for (const p of data || []) S.profiles.set(p.id, Privacy.mask(p));           // скрываем то, что человек не разрешил видеть
  await signUrls((data || []).map((p) => S.profiles.get(p.id)?.avatar_path).filter(Boolean));
}
async function loadChats() {
  const [{ data: chats, error: e1 }, { data: mem, error: e2 }, { data: recent, error: e3 }] = await Promise.all([
    S.sb.from("chats").select("*").order("last_message_at", { ascending: false }),
    S.sb.from("chat_members").select("*"),
    S.sb.from("messages").select("id,chat_id,user_id,body,media_type,deleted,created_at").order("created_at", { ascending: false }).limit(600),
  ]);
  if (e1 || e2 || e3 || !chats) return;            // сеть пропала — оставляем прежний список, а не стираем его
  S.chats = chats || [];
  if (S.chats.some((c) => c.burn_after)) Burn.start();
  await signUrls(S.chats.map((c) => c.avatar_path).filter(Boolean));
  S.members.clear();
  for (const m of mem || []) { if (!S.members.has(m.chat_id)) S.members.set(m.chat_id, []); S.members.get(m.chat_id).push(m); }
  S.lastByChat.clear(); S.unread.clear();
  S.callLog = (recent || []).filter((m) => Tg.isCallMsg(m) && !m.deleted);
  setTimeout(() => Tg.updateCallsBadge(), 0);
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
  const tab = (id, icon, label, badge) => h("button", { id: `tabBtn${id}`, class: id === "Chats" ? "on" : "", onclick: () => showTab(id.toLowerCase()) },
    h("span", { html: icon }), label, badge ? h("i", { class: "tab-badge hidden", id: badge }) : null);
  app.append(
    h("aside", { class: "side", id: "side" },
      h("div", { class: "topbar" },
        h("button", { class: "icon-btn top-search-btn", title: "Поиск", onclick: () => TopSearch.open(), html: I.search }),   // поиск — значком слева
        h("div", { class: "title" }, h("b", { id: "sideTitle" }, CFG.appName || "Семья"), h("small", { id: "conn" }, "в сети")),
        h("div", { class: "top-search hidden", id: "topSearch" },
          h("button", { class: "icon-btn", title: "Закрыть поиск", onclick: () => TopSearch.close(), html: I.back }),
          h("input", { id: "chatSearch", placeholder: "Поиск по чатам и людям", oninput: (e) => { S.filter = e.target.value.toLowerCase(); renderChatList(); } }))),
      h("div", { class: "tab-body", id: "tabChats" },
        h("div", { id: "storyStrip", class: "story-top" }),                         // истории — вверху, как в Telegram
        h("div", { class: "folders", id: "folders" }),
        h("div", { class: "chat-list", id: "chatList" }, h("div", { id: "chatItems" })),
        h("button", { class: "fab", title: "Новый чат", onclick: newChatSheet, html: I.pen })),
      h("div", { class: "tab-body hidden", id: "tabMenu" }),
      h("div", { class: "tab-body hidden", id: "tabContacts" }),
      h("div", { class: "tab-body hidden", id: "tabCalls" }),
      h("div", { class: "tab-body hidden", id: "tabStories" }),
      h("div", { class: "tab-body hidden", id: "tabSettings" }),
      h("div", { class: "tab-body hidden", id: "tabInvite" }),
      h("nav", { class: "bottom-tabs" },
        tab("Menu", MI.grid, "Меню", "storiesBadge"),                               // всё, что не настройки (как в VK)
        tab("Chats", I.chat, "Чаты", "chatsBadge"),
        tab("Contacts", I.user, "Контакты"),
        tab("Calls", I.calls, "Звонки", "callsBadge"))),                       // настройки — в «Меню»
    h("div", { class: "placeholder", id: "placeholder" }, "Выберите чат слева"));
  Pull.attach($("#chatList"), async () => { await Promise.all([resync(), Stories.load().then(() => Stories.renderAll()), Tasks.load(), Joins.load(), loadProfiles()]); renderChatList(); });
  Pull.attach($("#tabContacts"), async () => { await loadProfiles(); Tg.renderContacts(); });
  Pull.attach($("#tabCalls"), async () => { await loadChats(); Tg.renderCalls(); });
  Pull.attach($("#tabStories"), async () => { await Stories.refreshAndRender(); });
  renderChatList();
  Stories.renderAll();
  StoryTop.attach($("#chatList"), $("#storyStrip"));
  AsstFab.init();
  S.tab = S.tab || "chats";
  TabSwipe.attach($("#side"));
  // В браузере «назад» (кнопка или свайп) сначала закрывает окна внутри мессенджера, а не уходит со страницы
  if (!window.__popBound) {
    window.__popBound = true;
    if (!window.AndroidBridge) history.pushState({ guard: 1 }, "");
    window.addEventListener("popstate", () => {
      if (window.AndroidBridge) return;
      if (window.handleBack()) history.pushState({ guard: 1 }, "");
      else toast("Нажмите «назад» ещё раз, чтобы выйти");
    });
    window.addEventListener("hashchange", () => {
      const id = location.hash.slice(1);
      if (id && id !== S.current && S.chats.some((c) => c.id === id)) openChat(id);
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
  if (Saved.is(c.id)) return h("div", { class: `avatar ${size} saved-av` }, "🔖");
  if (!c.is_group) { const o = otherUser(c); if (o) return avatarEl(o, size); }
  const gu = c.avatar_path && S.urls.get(c.avatar_path);
  if (gu) return h("div", { class: `avatar ${size}`, style: { background: `center/cover url("${gu}")` } });
  return h("div", { class: `avatar ${size}`, style: { background: c.id === FAMILY_CHAT ? "var(--accent)" : colorFor(c.id) } },
    c.id === FAMILY_CHAT ? "🏠" : initials(c.title));
}
function previewText(m) {
  if (!m) return "Нет сообщений";
  if (m.deleted) return "Сообщение удалено";
  const who = m.user_id === S.me.id ? "Вы: " : "";
  if (m.media_type === "location") return who + "📍 Геолокация";
  if (Stickers.isSticker(m)) return who + "🎟 Стикер";
  const kind = { image: "📷 Фото", video: "🎬 Видео", audio: "🎤 Голосовое", file: "📎 Файл", video_note: "⭕ Видеосообщение" }[m.media_type];
  const body = Tg.text(m.body);
  return who + (kind ? kind + (body ? " · " + body : "") : (body || ""));
}

function renderChatList() {
  const list = $("#chatItems"); if (!list) return;
  list.innerHTML = "";
  Tg.renderFolders();
  const ub = Updates.banner(); if (ub) list.append(ub);
  const f = S.folder || "all";
  const totalUnread = [...S.unread.entries()].filter(([id]) => !Prefs.muted(id)).reduce((a, [, b]) => a + b, 0);
  const cb = $("#chatsBadge"); if (cb) { cb.textContent = totalUnread > 99 ? "99+" : totalUnread; cb.classList.toggle("hidden", !totalUnread); }
  const time = (c) => new Date(S.lastByChat.get(c.id)?.created_at || c.last_message_at || 0).getTime();
  // все члены семьи всегда в списке: у кого ещё нет переписки — показываем «Нажмите, чтобы написать»
  const withDm = new Set(S.chats.filter((c) => !c.is_group).map(otherUser));
  const people = [...S.profiles.values()].filter((p) => p.id !== S.me.id && !p.banned && !withDm.has(p.id));
  const rows = [...S.chats.filter((c) => { const o = !c.is_group && otherUser(c); return !(o && S.profiles.get(o)?.banned); }).map((c) => ({ c, t: time(c) })),
    ...people.map((p) => ({ p, t: 0 }))];
  rows.sort((a, b) => {
    const pa = a.c && Prefs.pinned(a.c.id) ? 1 : 0, pb = b.c && Prefs.pinned(b.c.id) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    if (a.t !== b.t) return b.t - a.t;
    const na = a.c ? chatTitle(a.c) : a.p.name, nb = b.c ? chatTitle(b.c) : b.p.name;
    return na.localeCompare(nb, "ru");
  });
  for (const r of rows) {
    if (r.p) {
      if (f === "groups" || f === "unread") continue;
      if (S.filter && !r.p.name.toLowerCase().includes(S.filter)) continue;
      list.append(h("button", { class: "chat-item", "data-user": r.p.id, onclick: () => openDm(r.p.id) },
        avatarEl(r.p.id),
        h("div", { class: "mid" },
          h("div", { class: "row" }, h("span", { class: "name" }, r.p.name, EStatus.badge(r.p.id)), h("span", { class: "time" }, "")),
          h("div", { class: "row" }, h("span", { class: "last" }, S.online.has(r.p.id) ? "в сети · нажмите, чтобы написать" : "Нажмите, чтобы написать")))));
      continue;
    }
    const c = r.c;
    const title = chatTitle(c);
    const unread = S.unread.get(c.id) || 0;
    const reqs = Joins.toMe(c.id).length;
    if (f === "personal" && c.is_group) continue;
    if (f === "groups" && !c.is_group) continue;
    if (f === "unread" && !unread) continue;
    if (S.filter && !title.toLowerCase().includes(S.filter)) continue;
    const last = S.lastByChat.get(c.id);
    const typing = Tg.typingText(c.id);
    const muted = Prefs.muted(c.id), pinned = Prefs.pinned(c.id);
    let tick = null;
    if (last && last.user_id === S.me.id && !last.deleted) {
      const others = (S.members.get(c.id) || []).filter((x) => x.user_id !== S.me.id);
      const read = others.some((x) => Privacy.readOk(x.user_id) && new Date(x.last_read_at) >= new Date(last.created_at));
      tick = h("span", { class: `list-tick${read ? " read" : ""}`, html: read ? I.ticks : I.tick });
    }
    const item = h("button", { class: `chat-item${S.current === c.id ? " on" : ""}${pinned ? " pinned" : ""}`, "data-chat": c.id, onclick: () => openChat(c.id) },
      chatAvatar(c),
      h("div", { class: "mid" },
        h("div", { class: "row" }, h("span", { class: "name" }, c.is_channel ? h("span", { class: "ch-ico" }, "📢") : null, title,
          !c.is_group ? EStatus.badge(otherUser(c)) : null, c.protected ? h("span", { class: "prot-ico", title: "Защищённый чат" }, "🛡") : null,
          muted ? h("span", { class: "muted-ico", html: I.bellOff }) : null), tick, h("span", { class: "time" }, last ? fmtListTime(last.created_at) : "")),
        h("div", { class: "row" },
          typing ? h("span", { class: "last typing-text" }, typing) : h("span", { class: "last" }, previewText(last)),
          reqs ? h("span", { class: "req-badge", title: "Заявки на вступление" }, "🙋" + reqs) : null,
          unread ? h("span", { class: `badge${muted ? " muted" : ""}` }, unread > 99 ? "99+" : unread) : pinned ? h("span", { class: "pin-ico", html: I.pushpin }) : null)));
    Tg.chatRowGestures(item, c);
    list.append(item);
  }
  if (list.children.length <= (S.filter ? 0 : 1)) list.append(h("p", { class: "empty-chat" }, S.filter ? "Ничего не найдено" : f === "unread" ? "Все сообщения прочитаны 👍" : "Здесь пока пусто"));
}

// ───────────── Открытый чат ─────────────
async function openChat(chatId) {
  if (S.current === chatId) return;
  const c = S.chats.find((x) => x.id === chatId); if (!c) return;
  Voice.cancel?.();
  S.current = chatId; S.replyTo = null; S.assistantOpen = false; S.editing = null; S.tasksOpen = false;
  if (location.hash.slice(1) !== chatId) history.replaceState(history.state, "", "#" + chatId);
  app.classList.add("in-chat");
  $("#placeholder")?.remove(); $("#chatView")?.remove();
  const other = !c.is_group ? otherUser(c) : null;
  const sub = h("small", { id: "chatSub" });
  const view = h("section", { class: "chat", id: "chatView" },
    h("div", { class: "topbar" },
      h("button", { class: "icon-btn back-btn", onclick: () => closeChat(), html: I.back }),
      chatAvatar(c, "sm"),
      h("div", { class: "title", onclick: () => chatInfo(c) }, h("b", null, c.is_channel ? "📢 " : "", chatTitle(c), !c.is_group ? EStatus.badge(otherUser(c)) : null, c.protected ? h("span", { class: "prot-ico" }, " 🛡") : null, c.burn_after ? h("span", { class: "burn-ico", title: "Исчезающие сообщения" }, "⏳") : null), sub),
      other ? h("button", { class: "icon-btn", title: "Аудиозвонок", onclick: () => Calls.start(other, false), html: I.phone }) : null,
      other ? h("button", { class: "icon-btn", title: "Видеозвонок", onclick: () => Calls.start(other, true), html: I.video }) : null,
      c.is_group ? h("button", { class: "icon-btn", title: "Групповой звонок", onclick: () => GroupCall.start(c.id, false), html: I.phone }) : null,
      c.is_group ? h("button", { class: "icon-btn", title: "Видеочат", onclick: () => GroupCall.start(c.id, true), html: I.video }) : null,
      h("button", { class: "icon-btn", title: "Ещё", onclick: () => Tg.openChatMenu(c), html: I.more })),
    h("div", { class: "upload-bar", id: "upBar" }),
    h("div", { class: "messages", id: "msgs" }),
    h("div", { id: "replyBox" }),
    Channels.canPost(c) ? composer() : Channels.readerBar(c));
  app.append(view);
  SwipeBack.attach(view, () => closeChat(), { edge: 36 });                   // от левого края — назад к списку
  if (other && (!Privacy.can(other, "messages") || Privacy.blockedMe(other) || Privacy.isBlocked(other))) {
    const nm = S.profiles.get(other)?.name || "Пользователь";
    view.querySelector(".composer")?.replaceWith(h("div", { class: "pv-banner" }, Privacy.isBlocked(other)
      ? h("span", null, `🚫 ${nm} в вашем чёрном списке. `, h("button", { class: "link-btn", onclick: async () => { await Privacy.block(other, false); closeChat(); openChat(chatId); } }, "Разблокировать"))
      : `🔒 ${nm} ограничил(а) личные сообщения`));
  }
  if (c.is_channel) view.classList.add("channel");
  Protect.apply(c);
  Tg.scrollButton(view);
  Wallpaper.apply(chatId);
  if (Select.on) Select.stop();
  updateChatSub();
  renderChatList();
  if (c.is_group) GroupCall.watch(c.id);
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
  Voice.cancel?.();
  S.assistantOpen = false; S.tasksOpen = false;
  Protect.off();
  S.current = null; app.classList.remove("in-chat");
  $("#chatView")?.remove();
  if (!$("#placeholder")) app.append(h("div", { class: "placeholder", id: "placeholder" }, "Выберите чат слева"));
  if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
  renderChatList();
}
function updateChatSub() {
  const el = $("#chatSub"); if (!el || !S.current) return;
  const c = S.chats.find((x) => x.id === S.current);
  const typing = Tg.typingText(S.current);
  el.classList.toggle("typing-text", !!typing);
  if (typing) { el.textContent = typing; return; }
  if (c.is_channel) {
    const n = (S.members.get(c.id) || []).length;
    el.textContent = `${c.is_private ? "приватный канал" : "открытый канал"} · ${n} ${plural(n, "подписчик", "подписчика", "подписчиков")}`;
  } else if (c.is_group) {
    const n = (S.members.get(c.id) || []).length;
    const on = (S.members.get(c.id) || []).filter((m) => S.online.has(m.user_id) && m.user_id !== S.me.id).length;
    el.textContent = `${n} ${plural(n, "участник", "участника", "участников")}${on ? `, ${on} в сети` : ""}`;
  } else if (Saved.is(c.id)) {
    el.textContent = "заметки, ссылки и файлы для себя";
  } else {
    const o = otherUser(c);
    const st = S.profiles.get(o)?.status;
    el.textContent = (S.online.has(o) ? "в сети" : seenText(S.profiles.get(o))) + (st ? " · " + st : "");
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
  const list = (S.msgs.get(S.current) || []).filter((m) => !Select.isHidden(m));
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
    const el = messageEl(m, c, !sameRunPrev, !sameRunNext);
    FX.decorate(el, m);
    if (Select.on && Select.ids.has(m.id)) el.classList.add("selected");
    box.append(el);
  });
  if (toBottom || nearBottom) box.scrollTop = box.scrollHeight;
}

function messageEl(m, c, firstInRun, tail) {
  const out = m.user_id === S.me.id;
  const p = S.profiles.get(m.user_id);
  const isCall = m.body && m.body.startsWith("📞") && !m.media_type;
  const bubble = h("div", { class: `bubble${m.media_type && !m.deleted ? " media" : ""}${m.deleted ? " deleted" : ""}` });
  if (c.is_group && !c.is_channel && !out && firstInRun) bubble.append(h("div", { class: "who", style: { color: colorFor(m.user_id) } }, p?.name || "…", EStatus.badge(m.user_id, "sm")));
  if (m.reply_to && !m.deleted) {
    const r = (S.msgs.get(m.chat_id) || []).find((x) => x.id === m.reply_to);
    bubble.append(h("div", { class: "reply", onclick: () => jumpTo(m.reply_to) },
      h("b", null, r ? (S.profiles.get(r.user_id)?.name || "…") : "Сообщение"),
      h("span", null, r ? previewText({ ...r, user_id: null }) : "…")));
  }
  if (m.deleted) bubble.append(h("div", { class: "text" }, "Сообщение удалено"));
  else {
    const url = m.media_path && S.urls.get(m.media_path);
    if (Stickers.isSticker(m)) { bubble.classList.add("sticker-bubble"); bubble.append(h("img", { class: "sticker-img", src: url || "", loading: "lazy", alt: "Стикер", draggable: false })); }
    else if (m.media_type === "image") bubble.append(h("img", { class: "photo", src: url || "", loading: "lazy", alt: "Фото", onclick: () => lightbox(url) }));
    else if (m.media_type === "video") bubble.append(h("video", { src: url || "", controls: true, preload: "metadata", playsinline: true }));
    else if (m.media_type === "audio") bubble.append(h("audio", { src: url || "", controls: true, preload: "metadata", controlsList: "nodownload" }), Voice2Text.el(m));
    else if (m.media_type === "file") bubble.append(h("a", { class: "file", href: url || "#", target: "_blank", rel: "noopener", download: m.media_name || "" },
      h("span", { class: "icon-btn", html: I.file }), h("span", null, m.media_name || "Файл")));
    else if (m.media_type === "video_note") { bubble.classList.add("vnote-bubble"); bubble.append(videoNoteEl(url), Voice2Text.el(m)); }
    else if (m.media_type === "location") { const g = parseGeo(m.body); if (g) bubble.append(mapCard(g.lat, g.lon, g.acc)); }
    const fwd = Tg.forwardedFrom(m.body);
    if (fwd) bubble.insertBefore(h("div", { class: "fwd" }, "Переслано от ", h("b", null, fwd)), bubble.querySelector(".photo,video,audio,.file,.vnote,.map-card") || null);
    const clean = Tg.text(m.body);
    const big = !m.media_type && !fwd && !m.reply_to ? Emoji.only(clean) : null;
    if (m.body === WELCOME_MARK && !m.media_type) { bubble.classList.add("welcome-bubble"); bubble.append(Welcome.card(m), h("div", { class: "text" })); }
    else if (big) { bubble.classList.add("emoji-bubble"); bubble.append(Emoji.bigEl(big), h("div", { class: "text" })); }
    else if (clean && m.media_type !== "location") {
      bubble.append(h("div", { class: "text" }, linkify(clean)));
      const orig = Tg.original(m.body);
      if (orig) bubble.append(h("div", { class: "tr-orig" }, "🌐 ", orig));
      else if (!out && !m.pending && Tr.chat(c.id).in !== false && Tr.foreign(clean)) Tr.attach(bubble, m);
    }
    if (m.body === GC_MARK && !m.media_type && Date.now() - new Date(m.created_at) < 6 * 3600e3)
      bubble.append(h("button", { class: "btn gc-join", onclick: () => GroupCall.join(m.chat_id, true) }, "Присоединиться"));
  }
  const fxKind = Effects.of(m);
  const meta = h("span", { class: "meta" }, fxKind ? h("button", { class: "fx-mark", title: "Повторить эффект", onclick: (e) => { e.stopPropagation(); Effects.play(fxKind); } }, "✨") : null,
    Tg.edited(m.body) ? h("i", { class: "edited" }, "изменено ") : null, fmtTime(m.created_at));
  if (fxKind) Effects.maybePlay(m);
  if (out && !m.deleted) {
    const others = (S.members.get(m.chat_id) || []).filter((x) => x.user_id !== S.me.id);
    const read = others.some((x) => Privacy.readOk(x.user_id) && new Date(x.last_read_at) >= new Date(m.created_at));
    meta.append(h("button", { class: `ticks${read ? " read" : ""}`, title: read ? "Прочитано" : "Доставлено", onclick: (e) => { e.stopPropagation(); readersSheet(m); } }, read ? "✓✓" : "✓"));
  }
  if (m.pending) meta.textContent = "⏳";
  const textEl = bubble.querySelector(".text");
  (textEl || bubble).append(meta);
  const mod = Moderation.el(m, c); if (mod) { bubble.append(mod); bubble.classList.add("pending-approval"); }
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
    h("span", { class: "sel-tick", html: I.tick }),
    c.is_group && !out ? avatarEl(m.user_id, "sm") : null, bubble);
  row.addEventListener("click", (e) => { if (Select.on) { e.preventDefault(); e.stopPropagation(); Select.toggle(m); } }, true);
  if (!m.pending) { attachGestures(bubble, m); Tg.swipeReply(bubble, m); }
  if (Protect.on(c)) bubble.querySelectorAll("img,video,audio,a.file").forEach((x) => { x.addEventListener("contextmenu", (e) => e.preventDefault()); if (x.tagName === "VIDEO") { x.setAttribute("controlsList", "nodownload"); x.disablePictureInPicture = true; } if (x.tagName === "A") x.removeAttribute("download"); });
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
  const chat = S.chats.find((x) => x.id === m.chat_id);
  const prot = Protect.on(chat);
  if (!m.deleted) {
    items.push(h("div", { class: "emoji-row" }, EMOJI.map((e) => h("button", { class: mine.includes(e) ? "mine" : "", onclick: () => { close(); toggleReaction(m, e); } }, e))));
    items.push(h("button", { class: "menu-item", onclick: () => { close(); setReply(m); } }, h("span", { html: I.reply }), "Ответить"));
    if (m.body && !prot) items.push(h("button", { class: "menu-item", onclick: async () => { close(); try { await navigator.clipboard.writeText(Tg.text(m.body)); toast("Скопировано"); } catch { toast("Не удалось скопировать"); } } }, h("span", { html: I.copy }), "Копировать текст"));
    if (m.body && Tg.text(m.body) && !Tg.isCallMsg(m) && m.media_type !== "location") items.push(h("button", { class: "menu-item", onclick: async () => {
      close();
      try { const r = await Tr.translate(Tg.text(m.body)); sheet([h("h3", null, `🌐 Перевод (${Tr.langName(r.from)} → ${Tr.langName(Tr.target())})`), h("p", { class: "tr-sheet" }, r.text)]); }
      catch { toast("Перевод недоступен — нет связи"); }
    } }, h("span", null, "🌐"), "Перевести"));
    if (m.user_id === S.me.id && m.body && (!m.media_type || ["image", "video", "file"].includes(m.media_type)) && !Tg.isCallMsg(m) && m.body !== WELCOME_MARK && !String(m.id).startsWith("tmp-"))
      items.push(h("button", { class: "menu-item", onclick: () => { close(); Tg.startEdit(m); } }, h("span", { html: I.pen }), "Изменить"));
    if (!prot && !String(m.id).startsWith("tmp-") && (m.body || m.media_path) && m.media_type !== "location")
      items.push(h("button", { class: "menu-item", onclick: () => { close(); Tg.forward(m); } }, h("span", { html: I.forward }), "Переслать"));
    if (!prot && (m.body || (m.media_path && S.urls.get(m.media_path)))) items.push(h("button", { class: "menu-item", onclick: () => { close(); shareOut(m); } }, h("span", { html: I.share }), "Поделиться"));
    if (!prot && !String(m.id).startsWith("tmp-") && !Saved.is(m.chat_id) && m.media_type !== "location") items.push(h("button", { class: "menu-item", onclick: () => { close(); Saved.add(m); } }, h("span", null, "🔖"), "В избранное"));
    if (!prot) items.push(...Stickers.menuItems(m, () => close()));
    if (prot) items.push(h("div", { class: "sheet-note prot-note" }, "🛡 Защищённый чат: копирование, пересылка и сохранение запрещены"));
    if (!prot && m.media_path && S.urls.get(m.media_path)) items.push(h("a", { class: "menu-item", href: S.urls.get(m.media_path), target: "_blank", rel: "noopener", download: m.media_name || "", onclick: () => close() }, h("span", { html: I.download }), "Сохранить файл"));
    if (!String(m.id).startsWith("tmp-")) items.push(h("button", { class: "menu-item", onclick: () => { close(); Select.start(m); } }, h("span", { html: I.ticks }), "Выбрать несколько"));
    if (m.user_id === S.me.id) items.push(h("button", { class: "menu-item danger", onclick: () => { close(); deleteMessage(m); } }, h("span", { html: I.trash }), "Удалить у всех"));
    items.push(h("button", { class: "menu-item danger", onclick: () => { close(); Select.remove([m], false); } }, h("span", { html: I.trash }), "Удалить у меня"));
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
  await FX.dust(document.querySelector(`#msgs .msg[data-id="${m.id}"] .bubble`));
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
  const lb = h("div", { class: "lightbox", onclick: () => lb.remove(), oncontextmenu: (e) => { if (Protect.on(S.chats.find((c) => c.id === S.current))) e.preventDefault(); } },
    h("img", { src: url, alt: "" }), h("button", { class: "icon-btn close", html: I.close }));
  document.body.append(lb);
}

async function markRead(chatId) {
  const mine = myMember(chatId);
  // время берём не раньше последнего сообщения: часы телефона могут отставать от сервера
  const lastMsg = (S.msgs.get(chatId) || []).at(-1)?.created_at;
  const now = new Date(Math.max(Date.now(), lastMsg ? new Date(lastMsg).getTime() : 0)).toISOString();
  if (mine) mine.last_read_at = now;
  S.unread.delete(chatId); renderChatList();
  await S.sb.from("chat_members").update({ last_read_at: now }).match({ chat_id: chatId, user_id: S.me.id });
  Live.broadcast("read", { chat_id: chatId, user_id: S.me.id, at: now });
  if (S.chats.some((c) => c.burn_after)) Burn.soon();
}

// ───────────── Поле ввода ─────────────
function composer() {
  const ta = h("textarea", { rows: 1, placeholder: "Сообщение", id: "input" });
  const file = h("input", { type: "file", multiple: true, class: "hidden", accept: "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" });
  const action = h("button", { class: "send", title: "Голосовое", html: I.mic });
  const vnBtn = h("button", { class: "vn-btn", title: "Видеосообщение (кружок)", html: I.circleCam, onclick: () => VideoNote.open() });
  const asstBtn = h("button", { class: "vn-btn asst-btn", title: "Мой ассистент", html: I.bot, onclick: () => Assistant.openMini() });
  const emojiBtn = h("button", { class: "icon-btn emoji-btn", title: "Эмодзи, стикеры и GIF", onclick: () => Emoji.panel(ta) }, "😊");
  const wrap = h("div", { class: "composer" },
    h("button", { class: "icon-btn", title: "Фото, видео, файл", onclick: () => attachMenu(file), html: I.clip }), file, emojiBtn, ta, asstBtn, vnBtn, action);
  const update = () => {
    ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
    const has = ta.value.trim().length > 0;
    action.innerHTML = has ? I.send : I.mic; action.title = has ? "Отправить" : "Голосовое";
    vnBtn.classList.toggle("hidden", has); asstBtn.classList.toggle("hidden", has);
  };
  ta.addEventListener("input", () => { update(); if (ta.value.trim()) Tg.sendTyping(); });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); sendText(ta, update); }
    if (e.key === "Escape" && S.editing) Tg.cancelEdit();
  });
  let pressT = null, longFired = false;
  const startPress = () => { longFired = false; clearTimeout(pressT); if (!ta.value.trim() || S.editing) return; pressT = setTimeout(() => { longFired = true; navigator.vibrate?.(15); Effects.picker((k) => sendText(ta, update, k)); }, 500); };
  const endPress = () => clearTimeout(pressT);
  action.addEventListener("touchstart", startPress, { passive: true }); action.addEventListener("touchend", endPress); action.addEventListener("touchmove", endPress, { passive: true });
  action.addEventListener("mousedown", startPress); action.addEventListener("mouseup", endPress); action.addEventListener("mouseleave", endPress);
  action.addEventListener("contextmenu", (e) => { e.preventDefault(); if (ta.value.trim() && !S.editing) { longFired = true; Effects.picker((k) => sendText(ta, update, k)); } });
  action.addEventListener("click", () => { if (longFired) { longFired = false; return; } if (ta.value.trim()) sendText(ta, update); else Voice.start(wrap); });
  file.addEventListener("change", async () => { const files = [...file.files]; file.value = ""; for (const f of files) await sendFile(f); });
  // вставка картинки из буфера
  ta.addEventListener("paste", (e) => {
    const f = [...(e.clipboardData?.files || [])][0];
    if (f) { e.preventDefault(); sendFile(f); }
  });
  return wrap;
}

// меню скрепки: галерея, камера, запись видео, файл
function attachMenu(fileInput) {
  let close;
  const pick = (accept, capture) => {
    close();
    fileInput.accept = accept;
    if (capture) fileInput.setAttribute("capture", capture); else fileInput.removeAttribute("capture");
    fileInput.click();
  };
  close = sheet([
    h("h3", null, "Отправить"),
    h("button", { class: "menu-item", onclick: () => pick("image/*,video/*") }, h("span", { html: I.gallery }), "Фото или видео из галереи"),
    h("button", { class: "menu-item", onclick: () => { close(); Camera.open("photo"); } }, h("span", { html: I.camera }), "Сделать фото"),
    h("button", { class: "menu-item", onclick: () => { close(); Camera.open("doc"); } }, h("span", null, "📄"), "Сканер документов → PDF"),
    h("button", { class: "menu-item", onclick: () => { close(); VideoRec.open(); } }, h("span", { html: I.video }), "Записать видео"),
    h("button", { class: "menu-item", onclick: () => { close(); VideoEditor.open({ chat: S.current }); } }, h("span", null, "🎬"), "Видеоредактор"),
    h("button", { class: "menu-item", onclick: () => { close(); VideoNote.open(); } }, h("span", { html: I.circle }), "Видеосообщение (кружок)"),
    h("button", { class: "menu-item", onclick: () => { close(); sendLocation(); } }, h("span", { html: I.pin }), "Моя геолокация"),
    h("button", { class: "menu-item", onclick: () => pick("*/*") }, h("span", { html: I.file }), "Файл или документ"),
  ]);
}

// ───────────── Запись видео в приложении ─────────────
const VideoRec = {
  MAX_SEC: 180,
  async open() {
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) { toast("Запись видео не поддерживается на этом устройстве"); return; }
    if (Calls.pc || Calls.ui || GroupCall.active) { toast("Сначала завершите звонок"); return; }
    this.facing = this.facing || "environment";
    const chatId = S.current; if (!chatId) return;
    const preview = h("video", { class: "vr-preview", autoplay: true, playsinline: true, muted: true });
    preview.muted = true;
    const time = h("div", { class: "vr-time" }, "0:00");
    const recBtn = h("button", { class: "vr-rec", title: "Начать запись" }, h("i"));
    const flip = h("button", { class: "icon-btn vr-flip", title: "Сменить камеру", html: I.flip });
    const closeBtn = h("button", { class: "icon-btn vr-close", title: "Закрыть", html: I.close });
    const hint = h("div", { class: "vr-hint" }, "Нажмите кнопку, чтобы начать запись");
    const root = h("div", { class: "video-rec" }, preview, h("div", { class: "vr-top" }, closeBtn, time, flip), hint, h("div", { class: "vr-bottom" }, recBtn));
    document.body.append(root);
    let stream = null, rec = null, chunks = [], t0 = 0, tick = null, done = false;
    const stopStream = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; };
    const startCam = async () => {
      stopStream();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: this.facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        preview.srcObject = stream; preview.classList.toggle("mirror", this.facing === "user");
      } catch { toast("Нет доступа к камере или микрофону"); finish(); }
    };
    const finish = () => {
      done = true; clearInterval(tick);
      try { if (rec && rec.state !== "inactive") rec.stop(); } catch { /* */ }
      stopStream(); root.remove();
      VideoRec.close = null;
    };
    this.close = () => { if (rec && rec.state === "recording") { rec.onstop = null; } finish(); };
    closeBtn.onclick = () => this.close();
    flip.onclick = async () => { if (rec?.state === "recording") return; this.facing = this.facing === "user" ? "environment" : "user"; await startCam(); };
    recBtn.onclick = () => {
      if (!stream) return;
      if (rec?.state === "recording") { rec.stop(); return; }
      const types = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      try { rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 1_500_000, audioBitsPerSecond: 96_000 }); }
      catch { rec = new MediaRecorder(stream); }
      chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        clearInterval(tick);
        if (done) return;
        const type = (rec.mimeType || mime || "video/webm").split(";")[0];
        const blob = new Blob(chunks, { type });
        stopStream();
        if ((Date.now() - t0) < 800 || !blob.size) { toast("Слишком короткое видео"); finish(); return; }
        review(blob, type);
      };
      rec.start(1000); t0 = Date.now();
      root.classList.add("is-rec"); hint.textContent = "Идёт запись — нажмите ещё раз, чтобы остановить";
      tick = setInterval(() => {
        const sec = (Date.now() - t0) / 1000; time.textContent = fmtDur(sec);
        if (sec >= this.MAX_SEC) rec.stop();
      }, 250);
    };
    const review = (blob, type) => {
      root.classList.remove("is-rec"); root.classList.add("review");
      const url = URL.createObjectURL(blob);
      const player = h("video", { class: "vr-preview", src: url, controls: true, playsinline: true, autoplay: true });
      preview.replaceWith(player);
      const caption = h("input", { class: "vr-caption", placeholder: "Подпись (необязательно)", maxlength: 500 });
      const sizeMb = (blob.size / 1048576).toFixed(1);
      hint.textContent = `${fmtDur((Date.now() - t0) / 1000)} · ${sizeMb} МБ`;
      const bottom = root.querySelector(".vr-bottom"); bottom.innerHTML = "";
      bottom.append(
        h("button", { class: "btn ghost", onclick: () => { URL.revokeObjectURL(url); finish(); VideoRec.open(); } }, "Переснять"),
        caption,
        h("button", { class: "send", title: "Отправить", html: I.send, onclick: async () => {
          if (blob.size > 50 * 1048576) { toast("Видео больше 50 МБ — запишите покороче"); return; }
          const ext = type.includes("mp4") ? "mp4" : "webm";
          const name = `Видео ${new Date().toLocaleString("ru-RU").replace(/[/:]/g, "-")}.${ext}`;
          const text = caption.value.trim();
          URL.revokeObjectURL(url); finish();
          if (S.current !== chatId) { S.current = null; await openChat(chatId); }
          if (text) { const inp = $("#input"); if (inp) inp.value = text; }
          toast("Отправляю видео…");
          await sendFile(new File([blob], name, { type }));
        } }));
    };
    await startCam();
  },
};

// ───────────── Кнопка/жест «Назад» ─────────────
// Возвращает true, если «назад» обработано внутри приложения (значит, выходить не нужно).
window.handleBack = function () {
  const lb = document.querySelector(".lightbox"); if (lb) { lb.remove(); return true; }
  const wl = document.querySelector(".welcome .wl-go"); if (wl) { wl.click(); return true; }
  if (Select.on) { Select.stop(); return true; }
  if (VideoRec.close) { VideoRec.close(); return true; }
  if (VideoNote.close) { VideoNote.close(); return true; }
  if (Stories.closeViewer) { Stories.closeViewer(); return true; }
  if (Calls.ui || GroupCall.ui || GroupCall.inviteUi) return true;   // во время звонка жест ничего не закрывает
  const sh = [...document.querySelectorAll(".sheet-back")].pop(); if (sh) { sh._close ? sh._close() : sh.remove(); return true; }
  if (VideoEditor.root) { VideoEditor.back(); return true; }
  if (S.current || S.assistantOpen) { closeChat(true); return true; }
  if ($("#tabChats")?.classList.contains("hidden")) { showTab("chats"); return true; }
  return false;
};

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

async function sendText(ta, update, effect) {
  let body = ta.value.trim(); if (!body) return;
  ta.value = ""; update();
  if (S.editing) { await Tg.saveEdit(body); return; }
  if (Prefs.get("inAppSound")) beep([1046], 0.06);
  const chatId = S.current;
  if (Tr.chat(chatId).out) body = await Tr.outgoing(chatId, body);
  if (effect) { body += "\u2062fx:" + effect; Effects.play(effect); }
  const sent = await postMessage({ body }, chatId);
  if (sent && effect) Effects.markPlayed(sent.id);
}

async function postMessage(fields, chatId = S.current) {
  const temp = { id: "tmp-" + Math.random().toString(36).slice(2), chat_id: chatId, user_id: S.me.id, created_at: new Date().toISOString(),
    pending: true, reply_to: S.replyTo?.id || null, ...fields };
  FX.add(temp.id);
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
    const pm = String(error.message || "");
    toast(/PRIVACY_VOICE/.test(pm) ? "🔒 Получатель ограничил голосовые сообщения" : /PRIVACY/.test(pm) ? "🔒 Получатель ограничил личные сообщения" : "Не отправлено. Проверьте интернет."); return null;
  }
  FX.carry(temp.id, data.id);
  if (list.some((x) => x.id === data.id)) { if (i >= 0) list.splice(i, 1); } // уже пришло по realtime
  else if (i >= 0) list[i] = data;
  S.lastByChat.set(chatId, data);
  if (S.current === chatId) renderMessages(true);
  renderChatList();
  return data;
}

async function sendFile(f, opts = {}) {
  const chatId = S.current; if (!chatId) return;
  if (f.size > 50 * 1024 * 1024) { toast("Файл больше 50 МБ — слишком большой"); return; }
  let type = opts.asType || (f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : f.type.startsWith("audio/") ? "audio" : "file");
  let blob = f, ext = (f.name.split(".").pop() || "bin").toLowerCase();
  if (type === "image" && !/gif|svg/.test(f.type) && !opts.sticker) {
    try { blob = await compressImage(f); ext = "jpg"; } catch { /* отправим как есть */ }
  }
  const path = `${chatId}/${crypto.randomUUID()}.${ext.replace(/[^a-z0-9]/g, "").slice(0, 6) || "bin"}`;
  const bar = $("#upBar"); if (bar) bar.style.width = "30%";
  const { error } = await S.sb.storage.from("media").upload(path, blob, { contentType: blob.type || f.type || "application/octet-stream", upsert: false });
  if (bar) bar.style.width = "100%";
  setTimeout(() => { if (bar) bar.style.width = "0"; }, 400);
  if (error) { toast("Не удалось загрузить файл: " + (error.message || "")); return; }
  await signUrls([path]);
  const caption = opts.sticker ? null : $("#input")?.value.trim();
  const withCaption = caption && (type === "image" || type === "video");
  if (withCaption) { $("#input").value = ""; $("#input").dispatchEvent(new Event("input")); }
  await postMessage({ media_path: path, media_type: type, media_name: f.name.slice(0, 120), body: opts.sticker ? STICKER_MARK : withCaption ? caption : null });
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
    const finish = () => { clearInterval(tick); stream.getTracks().forEach((t) => t.stop()); Voice.cancel = null; wrap.innerHTML = ""; wrap.append(...saved); };
    Voice.cancel = () => { cancelled = true; try { if (rec.state !== "inactive") rec.stop(); else finish(); } catch { finish(); } };   // ушли из чата — микрофон выключаем
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
  const people = [...S.profiles.values()].filter((p) => p.id !== S.me.id && !p.banned).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  close = sheet([
    h("h3", null, "Новый чат"),
    h("button", { class: "menu-item", onclick: () => { close(); newGroupSheet(); } }, h("span", { html: I.group }), "Создать группу"),
    h("button", { class: "menu-item", onclick: () => { close(); Channels.create(); } }, h("span", null, "📢"), "Создать канал"),
    h("button", { class: "menu-item", onclick: () => { close(); Joins.directory(); } }, h("span", { html: I.search }), "Найти группы и каналы"),
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
  return Groups.create();
}
function oldNewGroupSheet() {
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
  if (!c.is_group) { const o = otherUser(c); if (o) { Tg.profileView(o); return; } }
  if (c.is_group) { Groups.info(c); return; }
  const mem = (S.members.get(c.id) || []).map((m) => S.profiles.get(m.user_id)).filter(Boolean);
  let close;
  close = sheet([
    h("div", { class: "profile-card" }, chatAvatar(c, "lg"), h("h3", null, chatTitle(c))),
    c.is_group ? h("p", { style: { color: "var(--muted)", margin: "0 6px 6px" } }, `Участники (${mem.length})`) : null,
    ...(c.is_group ? mem : []).map((p) => h("button", { class: "menu-item", onclick: () => { close(); Tg.profileView(p.id); } },
      avatarEl(p.id, "sm"), h("span", null, p.name + (p.id === S.me.id ? " (вы)" : ""), p.family_role ? h("small", { class: "sub" }, p.family_role) : null))),
  ]);
}
const FAMILY_ROLES = ["Папа", "Мама", "Сын", "Дочь", "Дедушка", "Бабушка", "Брат", "Сестра", "Дядя", "Тётя", "Внук", "Внучка", "Муж", "Жена"];
function openProfile() {
  let close;
  const name = h("input", { value: S.me.name });
  const status = h("input", { value: S.me.status || "", maxlength: 100, placeholder: "Например: На работе до 18:00" });
  const role = h("input", { value: S.me.family_role || "", maxlength: 40, placeholder: "Например: Папа" });
  const bio = h("textarea", { rows: 3, maxlength: 500, placeholder: "Пара слов о себе: увлечения, работа, любимое блюдо…" }); bio.value = S.me.bio || "";
  const bday = h("input", { type: "date", value: S.me.birthday || "", max: new Date().toISOString().slice(0, 10) });
  const city = h("input", { value: S.me.city || "", maxlength: 80, placeholder: "Например: Казань" });
  const phone = h("input", { type: "tel", value: S.me.phone || "", maxlength: 30, placeholder: "+7 …" });
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
      close(); buildShell(); showTab(S.tab || "chats"); if (S.current) { const id = S.current; S.current = null; openChat(id); }
      toast("Фото обновлено"); Live.broadcast("profile", {});
    } catch { toast("Не удалось загрузить фото"); }
  };
  close = sheet([
    h("div", { class: "profile-card" }, av, pic, h("small", { style: { color: "var(--muted)" } }, "Нажмите на фото, чтобы сменить")),
    h("label", { class: "field" }, h("span", null, "Имя"), name),
    h("label", { class: "field" }, h("span", null, "Статус"), status),
    h("div", { class: "status-presets" }, STATUS_PRESETS.map((t) => h("button", { type: "button", onclick: () => { status.value = t; } }, t)),
      h("button", { type: "button", onclick: () => { status.value = ""; } }, "✕ Без статуса")),
    h("div", { class: "section-title", style: { padding: "12px 4px 6px" } }, "О себе"),
    h("label", { class: "field" }, h("span", null, "Кто вы в семье"), role),
    h("div", { class: "status-presets" }, FAMILY_ROLES.map((t) => h("button", { type: "button", onclick: () => { role.value = t; } }, t))),
    h("label", { class: "field" }, h("span", null, "О себе"), bio),
    h("label", { class: "field" }, h("span", null, "День рождения"), bday),
    h("label", { class: "field" }, h("span", null, "Город"), city),
    h("label", { class: "field" }, h("span", null, "Телефон (видят только члены семьи)"), phone),
    h("button", { class: "btn wide", onclick: async () => {
      const n = name.value.trim(); if (!n) return;
      const st = status.value.trim().slice(0, 100) || null;
      const base = { name: n.slice(0, 60), status: st, status_at: st ? new Date().toISOString() : null };
      const info = { family_role: role.value.trim().slice(0, 40) || null, bio: bio.value.trim().slice(0, 500) || null,
        birthday: bday.value || null, city: city.value.trim().slice(0, 80) || null, phone: phone.value.trim().slice(0, 30) || null };
      let { error } = await S.sb.from("profiles").update({ ...base, ...info }).eq("id", S.me.id);
      let infoSaved = !error;
      if (error) {   // сервер ещё без полей анкеты — сохраняем хотя бы имя и статус
        ({ error } = await S.sb.from("profiles").update(base).eq("id", S.me.id));
        if (!error) toast("Имя и статус сохранены. Анкета заработает после обновления сервера.", 4500);
      }
      if (error) { toast("Не удалось сохранить"); return; }
      Object.assign(S.me, base, infoSaved ? info : {});
      S.profiles.set(S.me.id, S.me); close(); if (infoSaved) toast("Сохранено"); renderChatList(); Live.broadcast("profile", {});
      if (S.tab === "settings") Tg.renderSettings();
    } }, "Сохранить"),
  ]);
}

// ───────────── Мгновенная доставка ─────────────
const Live = { channel: null, presence: null, active: true, bgTimer: null,
  broadcast(event, payload) { this.presence?.send({ type: "broadcast", event, payload }); },
  // «в сети» — только пока приложение открыто на экране. Соединение в фоне остаётся (звонки, оповещения),
  // но в присутствии отмечаем active: false — у родных вы показываетесь «был(а) …».
  setActive(on) {
    clearTimeout(this.bgTimer);
    if (this.active === on) return;
    this.active = on;
    this.presence?.track({ at: Date.now(), active: on }).catch?.(() => {});
    if (S.me) S.sb.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", S.me.id).then(() => {});
  },
  // свернули — через пару секунд (чтобы не мигать при выборе фото, разрешениях и т. п.)
  background() { clearTimeout(this.bgTimer); this.bgTimer = setTimeout(() => this.setActive(false), 2500); },
  async leave() { clearTimeout(this.bgTimer); try { await this.presence?.untrack(); } catch { /* */ } },
};
// кто «в сети»: есть отметка присутствия не в фоне (у старых версий приложения отметки нет — считаем в сети)
const onlineFrom = (state) => new Set(Object.entries(state || {}).filter(([k, metas]) => (metas || []).some((m) => m.active !== false) && Privacy.can(k, "last_seen")).map(([k]) => k));
function subscribe() {
  Live.channel = S.sb.channel("db-changes")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onNewMessage(p.new))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (p) => onUpdatedMessage(p.new, p.old))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => {
      // сообщение отклонено при одобрении — убираем у автора
      const id = p.old?.id; if (!id) return;
      for (const [cid, list] of S.msgs) { const i = list.findIndex((x) => x.id === id); if (i >= 0) { list.splice(i, 1); if (S.current === cid) renderMessages(false); if (list.length === i && S.lastByChat.get(cid)?.id === id) { S.lastByChat.delete(cid); renderChatList(); } } }
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions" }, (p) => onReaction(p.new, true))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_members" }, (p) => onMemberRead(p.new))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "reactions" }, (p) => onReaction(p.old, false))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "stories" }, (p) => Stories.onNew(p.new))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "stories" }, (p) => Stories.onDeleted(p.old))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (p) => onProfileChange(p.new))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks" }, (p) => Tasks.onChange({ new: p.new, eventType: "INSERT" }))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks" }, (p) => Tasks.onChange({ new: p.new, eventType: "UPDATE" }))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks" }, (p) => Tasks.onChange({ old: p.old, eventType: "DELETE" }))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "join_requests" }, (p) => Joins.onChange({ new: p.new, eventType: "INSERT" }))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "join_requests" }, (p) => Joins.onChange({ old: p.old, eventType: "DELETE" }))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notices" }, () => Push.soon())
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_gifts" }, (p) => Gifts.onNew(p.new))
    .subscribe((status) => {
      const el = $("#conn"); if (el) el.textContent = status === "SUBSCRIBED" ? "в сети" : "подключение…";
      if (status === "SUBSCRIBED" && S.resync) { S.resync = false; resync(); }
      if (status === "SUBSCRIBED") Push.soon(2000);
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") S.resync = true;
    });
  Live.presence = S.sb.channel("family-presence", { config: { presence: { key: S.me.id } } })
    .on("presence", { event: "sync" }, () => {
      S.online = onlineFrom(Live.presence.presenceState());
      if ([...S.online].some((u) => !S.profiles.has(u))) loadProfiles().then(renderChatList);
      renderChatList(); updateChatSub(); Tg.refreshPresence();
    })
    .on("broadcast", { event: "read" }, ({ payload }) => {
      const m = (S.members.get(payload.chat_id) || []).find((x) => x.user_id === payload.user_id);
      if (payload?.user_id) onMemberRead({ chat_id: payload.chat_id, user_id: payload.user_id, last_read_at: payload.at });
    })
    .on("broadcast", { event: "profile" }, async () => { await loadProfiles(); renderChatList(); })
    .on("broadcast", { event: "typing" }, ({ payload }) => Tg.onTyping(payload))
    .on("broadcast", { event: "joinreq" }, () => Joins.load())
    .on("broadcast", { event: "privacy" }, () => Privacy.refresh())
    .on("broadcast", { event: "chats" }, async () => {
      const before = new Set(S.chats.map((c) => c.id));
      await loadChats(); renderChatList(); Joins.checkAccepted(before);
      if (S.current && !S.chats.some((c) => c.id === S.current)) { closeChat(); toast("Вас больше нет в этой группе"); }
      else if (S.current) updateChatSub();
    })
    .subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      Live.active = appVisible();          // служба Android запускает страницу и в фоне — тогда сразу «не в сети»
      await Live.presence.track({ at: Date.now(), active: Live.active });
    });
  // при возврате в приложение — догружаем пропущенное
  document.addEventListener("visibilitychange", () => {
    if (window.AndroidBridge) return; // в приложении это сообщает сам Android
    if (document.visibilityState === "visible") window.onAppForeground(); else window.onAppBackground();
  });
  window.onAppForeground = () => {
    Live.setActive(true); Lock.onFg(); Theme.apply();
    // тяжёлое — чуть позже и по отдельности, чтобы возврат из контактов/«Поделиться» не подвешивал экран
    const safe = (f) => { try { const r = f(); if (r?.catch) r.catch(() => {}); } catch {} };
    setTimeout(() => {
      safe(resync); safe(() => Updates.maybeCheck()); safe(() => Tasks.tick());
      safe(() => Stories.load().then(() => Stories.renderAll()));
      safe(() => { if (S.current) markRead(S.current); }); safe(() => Push.soon(500)); safe(() => Burn.sweep());
    }, 350);
  };
  window.onAppBackground = () => { Lock.onBg(); Live.background(); VideoEditor.onBackground(); S.sb.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", S.me.id).then(() => {}); };

}
function onProfileChange(np) {
  if (np.id === S.me?.id && np.banned) {
    Live.leave().finally(() => Push.logout()).finally(() => S.sb.auth.signOut()).finally(() => { window.AndroidBridge?.loggedOut?.(); location.hash = ""; location.reload(); });
    return;
  }
  const old = S.profiles.get(np.id) || {};
  S.profiles.set(np.id, Privacy.mask({ ...old, ...np }));
  if (np.id === S.me.id) Object.assign(S.me, np);
  if (np.avatar_path && !S.urls.has(np.avatar_path)) signUrls([np.avatar_path]).then(renderChatList);
  renderChatList(); updateChatSub(); Stories.renderAll(); Tg.refreshPresence();
}
const appVisible = () => (window.AndroidBridge?.isForeground ? window.AndroidBridge.isForeground() : document.visibilityState === "visible");
const TABS = { menu: "Меню", chats: "Чаты", contacts: "Контакты", calls: "Звонки", stories: "Истории и статусы", settings: "Настройки", invite: "Пригласить" };
function showTab(t) {
  if (t === "menu" && S.tab === "menu") {                         // повторное нажатие «Меню» — закрыть
    const m = $("#tabMenu"); m?.classList.add("closing");
    setTimeout(() => { m?.classList.remove("closing"); if (S.tab === "menu") showTab(S.prevTab && S.prevTab !== "menu" ? S.prevTab : "chats"); }, 160);
    return;
  }
  if (t === "menu" && S.tab !== "menu") S.prevTab = S.tab;
  if (t !== "chats") TopSearch.close?.();
  for (const k of Object.keys(TABS)) {
    const id = k[0].toUpperCase() + k.slice(1);
    $(`#tab${id}`)?.classList.toggle("hidden", t !== k);
    $(`#tabBtn${id}`)?.classList.toggle("on", t === k || ((t === "invite" || t === "stories" || t === "settings") && k === "menu"));
  }
  S.tab = t;
  const st = $("#sideTitle"); if (st) st.textContent = t === "chats" ? (CFG.appName || "Семья") : TABS[t];
  if (t === "stories") Stories.refreshAndRender();
  if (t === "invite") renderInvite();
  if (t === "contacts") Tg.renderContacts();
  if (t === "calls") Tg.renderCalls();
  if (t === "settings") Tg.renderSettings();
  if (t === "menu") Menu.render();
}
// собеседник прочитал чат (приходит с сервера, даже если «вещание» уснуло)
function onMemberRead(row) {
  if (!row || row.user_id === S.me?.id || !row.last_read_at) return;
  const m = (S.members.get(row.chat_id) || []).find((x) => x.user_id === row.user_id);
  if (!m) return;
  const was = m.last_read_at ? new Date(m.last_read_at).getTime() : 0, now = new Date(row.last_read_at).getTime();
  if (now <= was) return;
  m.last_read_at = row.last_read_at;
  // перерисовываем, только если прочитали что-то из МОИХ сообщений (иначе галочки не меняются)
  const mineRead = (S.msgs.get(row.chat_id) || []).some((x) => x.user_id === S.me.id && new Date(x.created_at).getTime() > was && new Date(x.created_at).getTime() <= now);
  if (!mineRead) return;
  if (S.current === row.chat_id) renderMessages(false);
  renderChatList();
}
// кто прочитал моё сообщение (по нажатию на галочки)
function readersSheet(m) {
  const others = (S.members.get(m.chat_id) || []).filter((x) => x.user_id !== S.me.id);
  const seen = others.filter((x) => Privacy.readOk(x.user_id) && new Date(x.last_read_at) >= new Date(m.created_at));
  const rest = others.filter((x) => !seen.includes(x));
  const row = (x, ok) => h("div", { class: "member-row" }, h("div", { class: "menu-item" }, avatarEl(x.user_id, "sm"),
    h("span", null, S.profiles.get(x.user_id)?.name || "Участник", h("small", { class: "sub" }, ok ? "прочитано ✓✓" : Privacy.readOk(x.user_id) ? "ещё не прочитано" : "отметки скрыты"))));
  sheet([h("h3", null, seen.length ? "Прочитано" : "Ещё не прочитано"), ...seen.map((x) => row(x, true)), ...rest.map((x) => row(x, false))]);
}
async function resync() {
  await loadChats(); renderChatList();
  if (S.current) { S.msgs.delete(S.current); await loadMessages(S.current); renderMessages(true); }
}
async function onNewMessage(m) {
  if (!S.chats.find((c) => c.id === m.chat_id)) { await loadProfiles(); await loadChats(); renderChatList(); }
  Tg.typing.get(m.chat_id)?.delete(m.user_id);
  if (m.approved === false && m.user_id !== S.me.id) {
    const ch = S.chats.find((x) => x.id === m.chat_id);
    toast(`⏳ Новое сообщение ждёт одобрения в «${ch ? chatTitle(ch) : "чате"}»`, 4500);
  }
  if (m.body === WELCOME_MARK && m.user_id !== S.me.id) Welcome.celebrate(m);
  // оповещение по этому сообщению уже могло прийти с сервера — не повторяем
  const dup = Push.shown.has(m.id); Push.mark(m.id);
  if (Tg.isCallMsg(m) && !(S.callLog || []).some((x) => x.id === m.id)) {
    (S.callLog = S.callLog || []).unshift(m);
    Tg.updateCallsBadge(); if (S.tab === "calls") Tg.renderCalls();
  }
  S.lastByChat.set(m.chat_id, m);
  if (m.media_path) await signUrls([m.media_path]);
  if (!S.profiles.has(m.user_id)) await loadProfiles();
  const list = S.msgs.get(m.chat_id);
  if (list && !list.some((x) => x.id === m.id)) {
    const pend = m.user_id === S.me.id && list.find((x) => x.pending && x.body == m.body && x.media_path == m.media_path);
    if (pend) { FX.carry(pend.id, m.id); list.splice(list.indexOf(pend), 1, m); } else { let k = list.length; while (k > 0 && !list[k - 1].pending && new Date(list[k - 1].created_at) > new Date(m.created_at)) k--; list.splice(k, 0, m); if (m.user_id !== S.me.id) FX.add(m.id); }
    S.reacts.set(m.id, S.reacts.get(m.id) || []);
  }
  if (S.current === m.chat_id && appVisible()) {
    renderMessages(m.user_id === S.me.id);
    if (m.user_id !== S.me.id) markRead(m.chat_id);
  } else if (m.user_id !== S.me.id) {
    S.unread.set(m.chat_id, (S.unread.get(m.chat_id) || 0) + 1);
    if (!dup) notify(m);
  }
  renderChatList();
}
function onUpdatedMessage(m, old) {
  const list = S.msgs.get(m.chat_id);
  // сообщение одобрили (было approved=false, стало true) — у остальных оно появляется впервые. Обычная правка — не «новое».
  if (old && old.approved === false && m.approved === true && (!list || !list.some((x) => x.id === m.id)) && !m.deleted) {
    if (!S.lastByChat.get(m.chat_id) || S.lastByChat.get(m.chat_id).id !== m.id) { onNewMessage(m); return; }
  }
  if (!list) return;
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
  if (Prefs.muted(m.chat_id)) return;
  if (Prefs.get("sound")) Snd.message();
  if (Prefs.get("vibrate") && appVisible()) navigator.vibrate?.(60);
  if (window.AndroidBridge?.notify) {
    const c = S.chats.find((x) => x.id === m.chat_id);
    const text = Prefs.get("preview") ? (c?.is_group ? (S.profiles.get(m.user_id)?.name || "") + ": " : "") + previewText({ ...m, user_id: null }) : "Новое сообщение";
    window.AndroidBridge.notify(c ? chatTitle(c) : "Новое сообщение", text, m.chat_id);
  } else if (!appVisible() && "Notification" in window && Notification.permission === "granted") {
    try { new Notification(S.profiles.get(m.user_id)?.name || "Новое сообщение", { body: previewText({ ...m, user_id: null }), icon: "icon-192.png" }); } catch { /* */ }
  }
}
document.addEventListener("click", function askNotify() {
  document.removeEventListener("click", askNotify);
  if ("Notification" in window && Notification.permission === "default" && !window.AndroidBridge) Notification.requestPermission().catch(() => {});
}, { once: true });

// ───────────── Серверы для звонков ─────────────
// STUN помогает соединиться напрямую. Если напрямую нельзя (мобильный интернет, разные операторы),
// звонок идёт через TURN-ретранслятор. Логин для общего ретранслятора Open Relay вычисляется
// по его открытому ключу (схема TURN REST API) и действует сутки.
const Ice = {
  list: null, until: 0, custom: null,
  STUN: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478", "stun:stun.sipnet.net:3478", "stun:stun.nextcloud.com:443"],
  // свой сервер звонков, который задал администратор (самый надёжный вариант)
  async admin() {
    try { const { data } = await Promise.race([S.sb.rpc("get_turn"), new Promise((r) => setTimeout(() => r({}), 3000))]); this.custom = data && data.url ? data : null; } catch { /* без него */ }
    return this.custom;
  },
  async get() {
    if (this.list && Date.now() < this.until) return this.list;
    const list = [];
    const own = await this.admin();
    if (own) {
      const urls = [own.url]; if (/^turn:/i.test(own.url) && !/transport=/i.test(own.url)) urls.push(own.url + "?transport=tcp");
      list.push(own.username || own.credential ? { urls, username: own.username, credential: own.credential } : { urls });
    }
    const base = (CFG.iceServers || []).length ? CFG.iceServers : [];
    list.push(...base, { urls: this.STUN });
    const relay = CFG.turnRelay === false ? null : (CFG.turnRelay || { host: "staticauth.openrelay.metered.ca", secret: "openrelayprojectsecret" });
    if (relay && crypto?.subtle) {
      try {
        const username = `${Math.floor(Date.now() / 1000) + 86400}:semya`;
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(relay.secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
        const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username));
        const credential = btoa(String.fromCharCode(...new Uint8Array(sig)));
        list.push({ urls: [`turn:${relay.host}:80`, `turn:${relay.host}:80?transport=tcp`, `turn:${relay.host}:443`, `turns:${relay.host}:443?transport=tcp`], username, credential });
      } catch { /* без ретранслятора — только напрямую */ }
    }
    // общий бесплатный ретранслятор с открытыми данными для входа (запасной)
    list.push({ urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turn:openrelay.metered.ca:443?transport=tcp", "turns:openrelay.metered.ca:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject" });
    this.list = list; this.until = Date.now() + 30 * 60e3;
    return list;
  },
  now() { return this.list || [{ urls: this.STUN }]; },
  // проверка: достучались ли до серверов звонков (relay — значит через ретранслятор звонок пройдёт даже в строгой сети)
  async test(ms = 7000) {
    const servers = await this.get();
    const pc = new RTCPeerConnection({ iceServers: servers });
    const seen = { host: 0, srflx: 0, relay: 0 };
    pc.createDataChannel("t");
    pc.onicecandidate = (e) => { const t = e.candidate?.type; if (t && seen[t] !== undefined) seen[t]++; };
    try { await pc.setLocalDescription(await pc.createOffer()); } catch { pc.close(); return { ...seen, error: true }; }
    await new Promise((res) => { const t = setTimeout(res, ms); pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === "complete") { clearTimeout(t); res(); } }; });
    pc.close();
    return seen;
  },
  async adminSheet() {
    if (!S.isAdmin) return;
    const { data: on } = await S.sb.rpc("turn_status");
    const url = h("input", { placeholder: "turn:адрес:3478", autocomplete: "off", spellcheck: false });
    const user = h("input", { placeholder: "Логин", autocomplete: "off" });
    const pass = h("input", { placeholder: "Пароль", autocomplete: "off", spellcheck: false });
    const out = h("div", { class: "health" }, h("span", null, "•"), h("span", null, "Нажмите «Проверить связь»"));
    let close;
    close = sheet([h("h3", null, "📞 Сервер звонков"),
      h("div", { class: `health${on ? " ok" : ""}` }, h("span", null, on ? "✓" : "•"), h("span", null, on ? "Свой сервер подключён" : "Свой сервер не задан — используются общие бесплатные")),
      h("p", { class: "sheet-note" }, "Если звонки пишут «сеть блокирует звонок», нужен свой TURN-сервер. Бесплатный: metered.ca (Open Relay / TURN) или Cloudflare Realtime TURN — зарегистрируйтесь, скопируйте адрес, логин и пароль и вставьте сюда. Данные хранятся на сервере и видны только приложению семьи."),
      h("label", { class: "field" }, url), h("label", { class: "field" }, user), h("label", { class: "field" }, pass),
      h("button", { class: "btn wide", onclick: async () => {
        const { data } = await S.sb.rpc("set_turn", { cfg: { url: url.value.trim(), username: user.value.trim(), credential: pass.value.trim() } });
        if (data === "OK") { Ice.list = null; await Ice.get(); toast("✅ Сервер звонков сохранён"); close(); }
        else toast(data === "BAD_URL" ? "Адрес должен начинаться с turn: или turns:" : "Не удалось сохранить");
      } }, "Сохранить"),
      h("button", { class: "btn ghost wide", onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true; out.lastChild.textContent = "Проверяю…";
        Ice.list = null; const r = await Ice.test(); b.disabled = false;
        const ok = r.relay > 0;
        out.className = `health ${ok ? "ok" : r.srflx > 0 ? "" : "bad"}`; out.firstChild.textContent = ok ? "✓" : "•";
        out.lastChild.textContent = ok ? "Ретранслятор доступен — звонки пройдут в любой сети" : r.srflx > 0 ? "Прямая связь возможна, но ретранслятор недоступен — в строгих сетях звонок не соединится" : "Серверы звонков недоступны — звонки не пройдут. Задайте свой TURN-сервер";
      } }, "Проверить связь"),
      out,
      on ? h("button", { class: "menu-item danger", onclick: async () => { await S.sb.rpc("set_turn", { cfg: null }); Ice.list = null; toast("Свой сервер отключён"); close(); } }, "Отключить свой сервер") : null]);
  },
};

// Входящий звонок из уведомления Android: «Ответить» / «Отклонить»
window.answerIncoming = () => { S.autoAnswerUntil = Date.now() + 40000; Calls.tryAutoAnswer(); };
window.declineIncoming = () => {
  S.autoAnswerUntil = 0;
  if (Calls.role === "callee" && Calls.ui && !Calls.pc) Calls.decline();
  else if (window.GroupCall?.inviteUi) GroupCall.closeInvite();
};
// Вызывается Android каждые 20 секунд: если соединение с сервером уснуло — будим его
window.__keepAlive = (urgent) => {
  const rt = S.sb?.realtime; if (!rt || !S.me) return;
  try {
    if (typeof rt.isConnected === "function" && !rt.isConnected()) { rt.connect(); S.resync = true; }
    else if (typeof rt.sendHeartbeat === "function") rt.sendHeartbeat();
    // страница на связи — фоновая служба не дублирует; раз в минуту забираем оповещения сами
    if (typeof rt.isConnected !== "function" || rt.isConnected()) window.AndroidBridge?.pushAlive?.();
    if ((S.kaTicks = (S.kaTicks || 0) + 1) % 3 === 0) Push.claim();
  } catch { /* */ }
  if (urgent) setTimeout(() => Calls.tryAutoAnswer(), 500);
  try { if (typeof Tasks !== "undefined") Tasks.tick(); } catch { /* */ }
};

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
    const pc = new RTCPeerConnection({ iceServers: Ice.now() });
    this.remote = new MediaStream();
    pc.ontrack = (e) => {
      const tracks = e.streams[0] ? e.streams[0].getTracks() : [e.track];
      tracks.forEach((t) => { if (!this.remote.getTracks().includes(t)) this.remote.addTrack(t); t.onunmute = t.onmute = () => this.attach(); });
      this.attach();
    };
    pc.onicecandidate = (e) => { if (e.candidate) this.send(this.peer, { kind: "ice", candidate: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected" && this.relay) { this.relayStop(); this.setStatus("00:00"); toast("Связь наладилась — звонок идёт напрямую", 2500); }
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
        if (!this.connected && this.relayStart(true)) return;               // прямая связь не вышла — идём через сервер
        toast(this.connected ? "Связь потеряна" : S.isAdmin ? "Связь не установилась. Меню → Администратор → «Сервер звонков»" : "Связь не установилась: сеть блокирует звонок. Скажите администратору — он настроит сервер звонков", 4000); this.hangup(true, "failed");
      }
    };
    this.local.getTracks().forEach((t) => pc.addTrack(t, this.local));
    return pc;
  },

  async start(userId, video) {
    if (this.pc || this.ui) { toast("Вы уже в звонке"); return; }
    if (!Privacy.can(userId, "calls")) { toast(`${S.profiles.get(userId)?.name || "Пользователь"} ограничил(а) звонки`); return; }
    if (!window.RTCPeerConnection || !navigator.mediaDevices) { toast("Звонки не поддерживаются на этом устройстве"); return; }
    this.peer = userId; this.video = video; this.role = "caller"; this.callId = crypto.randomUUID(); this.connected = false;
    const cid0 = this.callId;
    let got0;
    try { got0 = await this.media(video); }
    catch { toast(video ? "Нет доступа к камере или микрофону" : "Нет доступа к микрофону"); if (this.callId === cid0) this.reset(); return; }
    if (this.callId !== cid0) { got0?.getTracks?.().forEach((t) => t.stop()); return; }
    this.local = got0;
    window.AndroidBridge?.callState?.(true, !!video);
    this.showUi("Вызов…");
    this.ringback();
    await Ice.get();
    if (this.peer !== userId || !this.local || this.callId !== cid0) return;
    this.pc = this.makePc();
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    const callId = this.callId;
    await this.send(userId, { kind: "offer", sdp: offer.sdp, video, name: S.me.name });
    if (this.callId !== callId || !this.pc) return;                    // за время отправки вызов уже отменили
    S.sb.rpc("wake_call", { targets: [userId], video: !!video }).then(() => {}, () => {});   // разбудить телефон, если приложение выгружено
    // Повторяем вызов каждые 3 секунды, пока не ответят: если телефон собеседника спал и только
    // проснулся, он всё равно получит звонок — уже со всеми адресами соединения внутри.
    clearInterval(this.resendTimer);
    this.resendTimer = setInterval(() => {
      if (this.callId !== callId || this.answered || !this.pc) { clearInterval(this.resendTimer); return; }
      this.send(userId, { kind: "offer", sdp: this.pc.localDescription?.sdp || offer.sdp, video, name: S.me.name, resend: true }).catch(() => {});
    }, 3000);
    this.ringTimer = setTimeout(() => { if (!this.connected && !this.answered) { toast("Не отвечает"); this.hangup(true, "noanswer"); } }, 50000);
  },

  async onSignal(p) {
    if (p.to !== S.me.id) return;
    if (p.kind === "offer") {
      if (p.callId && p.callId === this.callId) return;                 // повтор того же вызова
      if (p.callId && this.ended?.has(p.callId)) return;                // уже отклонён или завершён
      if (!Privacy.allows(p.from, "calls")) { this.send(p.from, { kind: "privacy", callId: p.callId }).catch?.(() => {}); return; }   // мои правила: этому человеку звонить нельзя
      if (this.pc || this.ui) { this.send(p.from, { kind: "busy", callId: p.callId }); return; }
      this.peer = p.from; this.video = !!p.video; this.callId = p.callId; this.role = "callee"; this.offer = p.sdp; this.pendingIce = []; this.connected = false;
      if (!S.profiles.has(p.from)) await loadProfiles();
      this.showIncoming();
      return;
    }
    if (p.callId !== this.callId) return;
    switch (p.kind) {
      case "answer":
        if (this.answered) return;
        this.answered = true; clearInterval(this.resendTimer);
        clearTimeout(this.ringTimer); this.stopRing(); this.setStatus("Соединение…");
        this.armRelay();
        this.ringTimer = setTimeout(() => { if (!this.connected) { toast("Связь не установилась. Проверьте интернет и попробуйте ещё раз.", 4000); this.hangup(true, "failed"); } }, 40000);
        await this.pc.setRemoteDescription({ type: "answer", sdp: p.sdp });
        for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
        break;
      case "ice":
        if (this.pc?.remoteDescription) await this.pc.addIceCandidate(p.candidate).catch(() => {});
        else this.pendingIce.push(p.candidate);
        break;
      case "relay-on": this.relayStart(false); break;
      case "rl": CallRelay.play(p); break;
      case "decline": toast("Звонок отклонён"); this.hangup(false, "declined"); break;
      case "busy": toast("Абонент занят"); this.hangup(false, "busy"); break;
      case "privacy": this.hangup(false, "privacy"); toast("Пользователь ограничил звонки"); break;
      case "hangup": this.hangup(false, "remote"); break;
      case "video": this.ui?.classList.toggle("has-video", !!p.on && this.hasRemoteVideo()); break;
      case "react": CallReact.show(this.ui, String(p.emoji || "").slice(0, 8), S.profiles.get(this.peer)?.name?.split(" ")[0]); break;
      case "screen":
        this.ui?.classList.toggle("remote-screen", !!p.on);
        if (p.on) toast(`${S.profiles.get(this.peer)?.name || "Собеседник"} показывает экран`);
        break;
    }
  },

  async accept() {
    if (this.pc || this.accepting) return;
    this.accepting = true; setTimeout(() => { this.accepting = false; }, 3000);
    clearTimeout(this.ringTimer); this.stopRing(); window.AndroidBridge?.cancelCall?.();
    const cid = this.callId;
    let got;
    try { got = await this.media(this.video); }
    catch {
      try { got = await this.media(false); this.video = false; }
      catch { toast("Нет доступа к микрофону"); if (this.callId === cid) this.decline(); return; }
    }
    if (this.callId !== cid || !this.offer) { got?.getTracks?.().forEach((t) => t.stop()); return; }   // пока шёл запрос доступа, звонок уже сбросили
    this.local = got;
    window.AndroidBridge?.callState?.(true, !!this.video);
    this.showUi("Соединение…");
    await Ice.get();
    if (!this.local || this.callId !== cid) return;
    this.pc = this.makePc();
    await this.pc.setRemoteDescription({ type: "offer", sdp: this.offer });
    for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.send(this.peer, { kind: "answer", sdp: answer.sdp });
    this.armRelay();
  },
  // если за 8 секунд прямая связь не появилась — переключаемся на «звонок через сервер»
  armRelay() {
    const cid = this.callId; clearTimeout(this.relayTimer);
    this.relayTimer = setTimeout(() => { if (this.callId === cid && !this.connected) this.relayStart(true); }, 8000);
  },
  relayStart(notify) {
    if (this.relay) return true;
    if (!this.callId || !this.peer || !this.local) return false;
    const peer = this.peer, cid = this.callId;
    this.local.getVideoTracks().forEach((t) => { t.stop(); this.local.removeTrack(t); });
    this.video = false; this.ui?.classList.remove("has-video");
    const ok = CallRelay.start(this.local, (m) => { this.send(peer, { ...m, callId: cid }).catch?.(() => {}); });
    if (!ok) return false;
    this.relay = true;
    if (notify) this.send(peer, { kind: "relay-on" }).catch?.(() => {});
    clearTimeout(this.ringTimer); this.stopRing();
    if (!this.connected) { this.connected = true; this.startedAt = Date.now(); this.timer(); }
    this.setStatus("Звонок через сервер · только голос"); this.ui?.classList.add("relayed");
    toast("Прямая связь недоступна — голос идёт через сервер (только звук, небольшая задержка)", 4500);
    return true;
  },
  relayStop() {
    if (!this.relay) return;
    this.relay = false; CallRelay.stop(); this.ui?.classList.remove("relayed");
  },
  decline() { this.send(this.peer, { kind: "decline" }); this.logMissed = false; this.reset(); },
  tryAutoAnswer() {
    if (!(S.autoAnswerUntil > Date.now())) return;
    if (this.role === "callee" && this.ui && !this.pc && this.offer) { S.autoAnswerUntil = 0; this.accept(); return; }
    if (window.GroupCall?.inviteUi && GroupCall.pendingInvite) { S.autoAnswerUntil = 0; const p = GroupCall.pendingInvite; GroupCall.join(p.chatId, !!p.video); }
  },

  async hangup(notifyPeer, reason) {
    if (notifyPeer && this.peer) this.send(this.peer, { kind: "hangup" });
    const dur = this.connected ? (Date.now() - this.startedAt) / 1000 : 0;
    const wasCaller = this.role === "caller", peer = this.peer, video = this.video;
    this.reset();
    if (wasCaller && peer && reason !== "privacy" && Privacy.can(peer, "messages")) { // запись о звонке в переписке
      const { data: id } = await S.sb.rpc("get_or_create_dm", { other: peer });
      if (id) {
        if (!S.chats.find((c) => c.id === id)) { await loadChats(); renderChatList(); }
        const kind = video ? "Видеозвонок" : "Звонок";
        await postMessage({ body: dur ? `📞 ${kind}, ${fmtDur(dur)}` : `📞 ${kind}: ${reason === "declined" ? "отклонён" : reason === "busy" ? "занято" : "без ответа"}` }, id);
      }
    }
  },
  reset() {
    if (this.callId) { this.ended = this.ended || new Set(); this.ended.add(this.callId); }
    clearInterval(this.resendTimer); this.answered = false; this.accepting = false;
    if (this.screen) this.stopScreen(true);
    if (this.ui || this.pc) { window.AndroidBridge?.callState?.(false, false); window.AndroidBridge?.cancelCall?.(); }
    clearTimeout(this.ringTimer); clearTimeout(this.videoOffTimer); clearInterval(this.tick); this.stopRing();
    this.pc?.close(); this.pc = null;
    this.local?.getTracks().forEach((t) => t.stop()); this.local = null; this.remote = null;
    clearTimeout(this.restartTimer); this.restarts = 0; clearTimeout(this.relayTimer); this.relayStop();
    this.ui?.remove(); this.ui = null; this.peer = null; this.callId = null; this.connected = false; this.pendingIce = [];
  },

  // ── интерфейс звонка
  showIncoming() {
    VideoEditor.onBackground();                         // звонок — музыка и видео редактора на паузу
    const p = S.profiles.get(this.peer);
    this.ui?.remove();
    this.ui = h("div", { class: "call ringing" },
      h("div", { class: "who" }, avatarEl(this.peer, "xl"), h("b", null, p?.name || "Звонок"), h("span", null, this.video ? "Видеозвонок…" : "Аудиозвонок…")),
      h("div", { class: "controls" },
        h("div", { class: "cbtn-wrap" }, h("button", { class: "cbtn red", html: I.hang, onclick: () => this.decline() }), "Отклонить"),
        h("div", { class: "cbtn-wrap" }, h("button", { class: "cbtn green", html: this.video ? I.video : I.phone, onclick: () => this.accept() }), "Ответить")));
    callBackdrop(this.ui, this.peer);
    document.body.append(this.ui);
    this.ringtone();
    const photo = p?.avatar_path ? S.urls.get(p.avatar_path) || null : null;
    if (window.AndroidBridge?.incomingCall3) window.AndroidBridge.incomingCall3(p?.name || "Звонок", !!this.video, photo);
    else if (window.AndroidBridge?.incomingCall2) window.AndroidBridge.incomingCall2(p?.name || "Звонок", !!this.video);
    else if (window.AndroidBridge?.incomingCall) window.AndroidBridge.incomingCall(p?.name || "Звонок");
    else if (!appVisible() && "Notification" in window && Notification.permission === "granted") {
      try { new Notification(p?.name || "Звонок", { body: this.video ? "Входящий видеозвонок" : "Входящий звонок", icon: "icon-192.png", requireInteraction: true }); } catch { /* */ }
    }
    // если позвонивший сдался, пока мы не ответили
    clearTimeout(this.ringTimer);
    this.ringTimer = setTimeout(() => { if (this.role === "callee" && !this.pc) { this.logMissed = true; this.reset(); } }, 55000);
    this.tryAutoAnswer();
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
      h("button", { class: "call-min", title: "Свернуть звонок", onclick: (e) => { e.stopPropagation(); MiniCall.toggle(this.ui); }, html: I.down }),
      h("div", { class: "who" }, avatarEl(this.peer, "xl"), h("b", null, p?.name || ""), h("span", { class: "status" }, status)),
      h("div", { class: "controls" },
        h("div", { class: "cbtn-wrap" }, micBtn, "Микрофон"),
        h("div", { class: "cbtn-wrap" }, camBtn, "Камера"),
        h("div", { class: "cbtn-wrap" }, flipBtn, "Повернуть"),
        canShare ? h("div", { class: "cbtn-wrap" }, scrBtn, "Экран") : null,
        CallReact.button((emoji) => this.send(this.peer, { kind: "react", emoji })),
        h("div", { class: "cbtn-wrap" }, h("button", { class: "cbtn red", html: I.hang, onclick: () => this.hangup(true, "local") }), "Завершить")));
    callBackdrop(this.ui, this.peer);
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
  timer() { clearInterval(this.tick); this.tick = setInterval(() => this.setStatus(fmtDur((Date.now() - this.startedAt) / 1000) + (this.relay ? " · через сервер" : "")), 1000); },

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
    if (window.AndroidBridge?.ringStart) { window.AndroidBridge.ringStart(); this.ringNative = true; return; }
    Snd.loop("ring").then((custom) => {
      if (custom) { navigator.vibrate?.([400, 200, 400]); return; }
      const play = () => { beep([660, 880, 660, 880], 0.18); navigator.vibrate?.([400, 200, 400]); };
      play(); this.ring = setInterval(play, 2000);
    });
  },
  ringback() {
    this.stopRing();
    const play = () => beep([440, 480], 0.5);
    play(); this.ring = setInterval(play, 3000);
  },
  stopRing() {
    clearInterval(this.ring); this.ring = null; navigator.vibrate?.(0); Snd.stopLoop();
    // мелодию телефона останавливаем всегда: её мог запустить и сам Android (уведомление о звонке)
    this.ringNative = false; try { window.AndroidBridge?.ringStop?.(); } catch { /* */ }
  },
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
