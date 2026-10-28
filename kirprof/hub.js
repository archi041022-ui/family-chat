/* Разделы мастерской в «Услугах»: материалы, изделия, интерьер, инструменты, чат с оператором, обратный звонок.
   Открываются поверх экрана; назад работает и кнопка «Назад» телефона. */
"use strict";
const HUB = { open: false, kind: null, poll: 0, last: 0, ck: null };
const HUB_ICO = {
  materials: '<path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 4v16M16 4v16" opacity=".5"/>',
  product: '<path d="M4 14V9a3 3 0 013-3h10a3 3 0 013 3v5"/><path d="M2 14h20v4H2zM5 18v2M19 18v2"/>',
  interior: '<path d="M3 20h18M6 20V10l6-6 6 6v10"/><path d="M10 20v-5h4v5"/>',
  tool: '<path d="M14 6a4 4 0 005 5l-9 9a2.1 2.1 0 01-3-3l9-9a4 4 0 00-2-2z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  call: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
};
const HUB_ITEMS = [
  ["materials", "Материалы", "Ткани, кожа, образцы"], ["product", "Изделия", "Наши работы"], ["interior", "Интерьер", "Мебель и решения"], ["tool", "Инструменты", "Фурнитура, комплектующие"],
  ["chat", "Чат с оператором", "Ответим онлайн"], ["call", "Обратный звонок", "Перезвоним сами"],
];
const HUB_TITLE = { materials: "Материалы", product: "Изделия", interior: "Интерьер", tool: "Инструменты", chat: "Чат с оператором", call: "Обратный звонок" };

function hubInit() {
  const grid = $("#hubGrid"); if (!grid) return;
  grid.replaceChildren(...HUB_ITEMS.map(([k, t, s]) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "hub-tile" + (k === "chat" || k === "call" ? " live" : ""); b.dataset.k = k;
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + HUB_ICO[k] + '</svg><b></b><span></span><i class="dot" hidden></i>';
    b.querySelector("b").textContent = t; b.querySelector("span").textContent = s; b.onclick = () => hubOpen(k); return b;
  }));
  $("#hubBack").onclick = hubClose;
  document.addEventListener("keydown", e => { if (e.key === "Escape" && HUB.open) hubClose(); });
  KP.onTab("services", hubDot);
  hubDot();
}
const hubKey = () => HUB.ck || (HUB.ck = store("kp_ck") || (() => { const a = new Uint8Array(16); crypto.getRandomValues(a); const k = Array.from(a, x => x.toString(16).padStart(2, "0")).join(""); store("kp_ck", k); return k; })());
/* точка на «Чате», если оператор ответил, пока вы были в другом месте */
async function hubDot() {
  try { const k = store("kp_ck"); if (!k) return; const r = await rpc("kp_chat_get", { ck: k, after: 0 }); const mx = Math.max(0, ...(r.items || []).filter(m => m.staff).map(m => m.id));
    const seen = +store("kp_ck_seen") || 0; document.querySelector('.hub-tile[data-k="chat"] .dot').hidden = !(mx > seen); } catch (e) { /* без связи */ }
}
function hubOpen(k, pre) {
  HUB.open = true; HUB.kind = k; clearInterval(HUB.poll);
  $("#hubTitle").textContent = HUB_TITLE[k]; $("#hubSheet").hidden = false; document.body.classList.add("hub-on");
  const body = $("#hubBody"); body.replaceChildren(); body.scrollTop = 0;
  (k === "chat" ? hubChat(body, pre) : k === "call" ? hubCall(body) : hubGallery(body, k)).catch(() => { body.replaceChildren(Object.assign(document.createElement("p"), { className: "note", textContent: "Не удалось загрузить. Проверьте связь." })); });
}
function hubClose() { HUB.open = false; clearInterval(HUB.poll); $("#hubSheet").hidden = true; document.body.classList.remove("hub-on"); hubDot(); }
const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

async function hubGallery(body, k) {
  body.append(h("p", "note", "Загрузка…"));
  const list = k === "materials" ? await rpc("kp_materials_list") : await rpc("kp_items_list", { k });
  const wrap = h("div", "hub-cards");
  if (!list.length) { body.replaceChildren(h("p", "note", "Пока пусто. Скоро здесь появятся позиции.")); return; }
  list.forEach(m => {
    const c = h("article", "hub-card"), title = m.title || m.name;
    const ph = h("div", "ph"); if (m.photo) { const im = new Image(); im.alt = title; im.src = m.photo; im.loading = "lazy"; ph.append(im); } else if (m.color) ph.style.background = m.color;
    const price = m.price ? (k === "materials" ? KP.fmt(m.price) + " за метр" : KP.fmt(m.price)) : "";
    c.append(ph, h("b", null, title), h("small", null, [m.article ? "арт. " + m.article : "", m.stock || "", price].filter(Boolean).join(" · ")), m.descr || m.note ? h("p", null, m.descr || m.note) : h("span"));
    const row = h("div", "btns");
    if (k === "materials") { const t = h("button", "btn small", "Примерить"); t.type = "button"; t.onclick = async () => { hubClose(); go("fit"); try { await FIT.pickCat(m); } catch (e) { /* фото нет */ } }; row.append(t); }
    const q = h("button", "btn ghost small", "Спросить"); q.type = "button"; q.onclick = () => hubOpen("chat", "Здравствуйте! Интересует: " + title); row.append(q);
    c.append(row); wrap.append(c);
  });
  body.replaceChildren(wrap);
}

async function hubChat(body, pre) {
  const ck = hubKey(); let nm = ""; try { nm = (KP.me && KP.me.name) || ""; } catch (e) { /* гость */ }
  const log = h("div", "chat-log", ""), err = h("div", "err"), ta = h("textarea"); ta.maxLength = 1000; ta.rows = 2; ta.placeholder = "Напишите сообщение"; ta.setAttribute("aria-label", "Сообщение оператору"); if (pre) ta.value = pre;
  const send = h("button", "btn small", "Отправить"); send.type = "button";
  const nameIn = h("input"); nameIn.placeholder = "Ваше имя"; nameIn.maxLength = 40; nameIn.value = nm || store("kp_ck_name") || ""; nameIn.setAttribute("aria-label", "Ваше имя");
  body.replaceChildren(h("p", "note", "Оператор отвечает в рабочее время. Можно закрыть чат: ответ дождётся вас здесь."), log, err, nameIn, ta, send);
  const shown = new Set();
  const add = m => { if (shown.has(m.id)) return; shown.add(m.id); const d = h("div", "msg" + (m.staff ? " staff" : "")); d.append(h("span", null, m.body), h("small", null, (m.staff ? (m.who || "Оператор") + " · " : "") + new Date(m.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }))); log.append(d); log.scrollTop = log.scrollHeight; HUB.last = Math.max(HUB.last, m.id); if (m.staff) store("kp_ck_seen", String(Math.max(+store("kp_ck_seen") || 0, m.id))); };
  const pull = async () => { const r = await rpc("kp_chat_get", { ck, after: HUB.last }); (r.items || []).forEach(add); };
  HUB.last = 0; await pull();
  if (!shown.size) log.append(h("div", "msg staff", "Здравствуйте! Чем помочь? Напишите вопрос про материалы, цену или сроки."));
  HUB.poll = setInterval(() => { if (HUB.open && HUB.kind === "chat") pull().catch(() => {}); }, 4000);
  send.onclick = async () => {
    err.textContent = ""; const t = ta.value.trim(); if (!t) return; send.disabled = true;
    try { store("kp_ck_name", nameIn.value.trim()); const r = await rpc("kp_chat_send", { ck, tok: KP.sess || "", nm: nameIn.value.trim(), tx: t });
      if (r && r.error) err.textContent = ({ too_fast: "Слишком часто. Подождите минуту.", busy: "Сейчас много обращений. Позвоните нам или закажите звонок.", bad_text: "Сообщение пустое или слишком длинное." })[r.error] || "Не удалось отправить.";
      else { ta.value = ""; await pull(); } } catch (e) { err.textContent = "Нет связи. Сообщение не отправлено."; } send.disabled = false;
  };
}

async function hubCall(body) {
  const nm = h("input"), ph = h("input"), when = h("select"), note = h("textarea"), err = h("div", "err"), ok = h("p", "ok-line"), btn = h("button", "btn", "Заказать звонок");
  nm.maxLength = 40; nm.autocomplete = "name"; ph.type = "tel"; ph.autocomplete = "tel"; ph.placeholder = "+7 900 000-00-00"; ph.maxLength = 30; note.maxLength = 300; note.rows = 3; btn.type = "button";
  ["Как можно скорее", "Сегодня днём", "Сегодня вечером", "Завтра утром"].forEach(t => when.append(Object.assign(h("option"), { value: t, textContent: t })));
  try { if (KP.me) { nm.value = KP.me.name || ""; ph.value = KP.me.phone || ""; } } catch (e) { /* гость */ }
  const lab = (t, e) => { const l = h("label", null, t); l.append(e); return l; };
  body.replaceChildren(h("p", "note", "Оставьте номер, и мы перезвоним. Звонок бесплатный."), lab("Имя", nm), lab("Телефон", ph), lab("Когда удобно", when), lab("О чём поговорить (необязательно)", note), err, ok, btn);
  btn.onclick = async () => {
    err.textContent = ""; ok.textContent = ""; btn.disabled = true;
    try { const r = await rpc("kp_callback_create", { tok: KP.sess || "", nm: nm.value, ph: ph.value, pf: when.value, nt: note.value });
      if (r && r.error) err.textContent = ({ bad_name: "Укажите имя.", bad_phone: "Проверьте номер телефона.", too_fast: "Заявка уже принята. Мы скоро перезвоним." })[r.error] || "Не удалось отправить.";
      else { ok.textContent = "Заявка принята. Мы перезвоним вам."; note.value = ""; } } catch (e) { err.textContent = "Нет связи. Попробуйте ещё раз."; } btn.disabled = false;
  };
}
