/* Кабинет мастера КИРПРОФ: обзор, заявки, отзывы, клиенты, материалы, информация, инструменты.
   Права проверяются на сервере по входу; эта страница сама ничего не решает. */
"use strict";
const AD = { tab: "overview", list: null };
const ST = { new: "Новая", work: "В работе", done: "Выполнена", cancel: "Отменена" };
const KINDS = [["rog", "Рогожка"], ["vel", "Велюр"], ["chen", "Шенилл"], ["jac", "Жаккард"], ["eco", "Экокожа"], ["lea", "Натуральная кожа"], ["other", "Другое"]];
/* [вкладка, название, нужное право]; "*" — любому сотруднику, "owner" — только владельцу */
const ALLTABS = [["overview", "Обзор", "*"], ["orders", "Заявки", "orders"], ["support", "Поддержка", "support"], ["reviews", "Отзывы", "reviews"], ["users", "Клиенты", "users"],
  ["materials", "Материалы", "catalog"], ["product", "Изделия", "catalog"], ["interior", "Интерьер", "catalog"], ["tool", "Инструменты", "catalog"],
  ["staff", "Сотрудники", "owner"], ["info", "Информация", "info"], ["codes", "Акции и коды", "codes"]];
let TABS = ALLTABS;
const PERMS = [["orders", "Заявки"], ["support", "Чат и звонки"], ["reviews", "Отзывы"], ["users", "Клиенты"], ["catalog", "Каталог: материалы, изделия, интерьер, инструменты"], ["info", "Информация о мастерской"], ["codes", "Промокоды и сертификаты"]];
const KIND_NAME = { product: "Изделие", interior: "Интерьер", tool: "Инструмент" };
const AERR = { forbidden: "Нет прав. Войдите как разработчик.", bad_password: "Пароль не короче 8 символов.", not_found: "Клиент не найден.", bad_coupon: "Код не короче 3 знаков, скидка от 1 до 90%.", bad_amount: "Сумма не меньше 100 ₽.", too_big: "Слишком длинный текст.", not_found: "Такого клиента нет. Пусть сначала зарегистрируется на сайте.", bad_perm: "Неизвестное право.", dev_only: "Владельца назначает только разработчик.", bad_text: "Сообщение пустое или слишком длинное.", http: "Нет связи. Попробуйте ещё раз." };

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.startsWith("on")) e[k] = v; else if (v === true) e.setAttribute(k, ""); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const call = (fn, args) => rpc(fn, Object.assign({ tok: KP.sess }, args || {}));
let toastT = 0;
function toast(t) { const n = $("#admToast"); n.textContent = t; n.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => n.classList.remove("on"), 3000); }
const fail = e => toast(AERR[e.code] || "Не удалось выполнить. Попробуйте ещё раз.");
const dt = ts => ts ? new Date(ts).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
function saveText(text, name, mime) {
  if (window.KirprofBridge && KirprofBridge.saveText) { KirprofBridge.saveText(text, name, mime); return; }
  const a = el("a", { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name }); document.body.append(a); a.click(); a.remove();
}

/* ───── вход и проверка прав ───── */
function loginView(msg) {
  const code = el("input", { type: "password", autocomplete: "off", "aria-label": "Секретный код разработчика" }), err = el("div", { class: "err", role: "alert", text: msg || "" });
  const em = el("input", { type: "email", autocomplete: "username", "aria-label": "Почта" }), pw = el("input", { type: "password", autocomplete: "current-password", "aria-label": "Пароль" }), err2 = el("div", { class: "err", role: "alert" });
  const form = el("form", { class: "adm-form", id: "devForm", novalidate: true },
    el("p", { class: "full note", text: "Разработчик входит по секретному коду." }),
    el("label", { class: "full" }, "Секретный код разработчика", code), err,
    el("div", { class: "full btns" }, el("button", { class: "btn small", type: "submit", text: "Войти" }), el("a", { class: "btn ghost small", href: "index.html", text: "На сайт" })));
  form.onsubmit = async e => {
    e.preventDefault(); err.textContent = "";
    try { const r = await rpc("kp_dev_login", { code: code.value }); if (r && r.error) { err.textContent = ({ bad_code: "Неверный код.", off: "Вход разработчика не включён.", locked_dev: "Подождите 15 минут." })[r.error] || "Не удалось войти."; return; }
      store("kp_devcode", code.value); store("kp_sess", r.token); KP.sess = r.token; start(); } catch (x) { err.textContent = "Нет связи."; }
  };
  const form2 = el("form", { class: "adm-form", id: "staffForm", novalidate: true },
    el("p", { class: "full note", text: "Владелец и сотрудники входят по почте и паролю от сайта." }),
    el("label", {}, "Почта", em), el("label", {}, "Пароль", pw), err2,
    el("div", { class: "full btns" }, el("button", { class: "btn small", type: "submit", text: "Войти" })));
  form2.onsubmit = async e => {
    e.preventDefault(); err2.textContent = "";
    try { const r = await rpc("kp_login", { em: em.value.trim().toLowerCase(), pw: pw.value }); if (r && r.error) { err2.textContent = "Неверная почта или пароль."; return; }
      store("kp_sess", r.token); KP.sess = r.token; start(); } catch (x) { err2.textContent = "Нет связи."; }
  };
  $("#admNav").hidden = true;
  $("#admMain").replaceChildren(el("h2", { text: "Вход" }), form2, el("h2", { text: "Вход разработчика", style: "margin-top:22px" }), form);
}
async function start() {
  if (!KP.sess && store("kp_devcode")) { try { const d = await rpc("kp_dev_login", { code: store("kp_devcode") }); if (d && d.token) { KP.sess = d.token; store("kp_sess", d.token); } } catch (e) { /* без связи */ } }
  if (!KP.sess) { loginView(); return; }
  let ok = false;
  try { ok = await call("kp_admin_check"); } catch (e) { $("#admMain").replaceChildren(el("p", { class: "err", text: "Нет связи или база ещё не обновлена (нужна миграция 024)." })); return; }
  if (!ok && store("kp_devcode")) { try { const d = await rpc("kp_dev_login", { code: store("kp_devcode") }); if (d && d.token) { KP.sess = d.token; store("kp_sess", d.token); ok = await call("kp_admin_check"); } } catch (e) { /* */ } }
  if (!ok) { loginView("У этой учётной записи нет прав мастера."); return; }
  AD.me = ok === true ? { owner: true, perms: [] } : ok;
  TABS = ALLTABS.filter(([, , p]) => p === "*" || (p === "owner" ? AD.me.owner : AD.me.owner || (AD.me.perms || []).includes(p)));
  const nav = $("#admNav"); nav.hidden = false; nav.replaceChildren(...TABS.map(([id, n]) => el("button", { type: "button", role: "tab", "data-t": id, "aria-selected": id === AD.tab, text: n, onclick: () => show(id) })));
  const w = $("#admWho"); if (w) { w.hidden = false; w.textContent = AD.me.dev ? "РАЗРАБОТЧИК" : AD.me.owner ? "ВЛАДЕЛЕЦ" : (AD.me.name || "СОТРУДНИК"); }
  badges(); clearInterval(AD.badgeT); AD.badgeT = setInterval(badges, 20000);
  let h = location.hash.slice(1); if (h === "tools") h = "codes";
  if (!TABS.some(t => t[0] === h)) h = "overview"; AD.tab = h;
  show(h);
}
/* красная цифра у «Поддержки»: непрочитанные чаты и новые звонки */
async function badges() {
  const b = document.querySelector('#admNav button[data-t="support"]'); if (!b) return;
  try { const c = await call("kp_adm_support_counts"); const n = (c.chats || 0) + (c.calls || 0); b.textContent = "Поддержка" + (n ? " · " + n : ""); b.classList.toggle("hot", n > 0); } catch (e) { /* без связи */ }
}
async function show(id) {
  AD.tab = id; location.hash = id; clearInterval(AD.chatT);
  document.querySelectorAll("#admNav button").forEach(b => b.setAttribute("aria-selected", b.dataset.t === id));
  const main = $("#admMain"); main.replaceChildren(el("p", { class: "note", text: "Загрузка…" }));
  try { await VIEWS[id](main); } catch (e) { if (e.code === "forbidden") { loginView("Нет прав."); return; } main.replaceChildren(el("p", { class: "err", text: AERR[e.code] || "Не удалось загрузить. Проверьте связь." })); }
}

/* фото: уменьшить и сжать, чтобы поместилось в базу */
async function shrink(file, max) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = el("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.85, out = c.toDataURL("image/jpeg", q); while (out.length > 230000 && q > 0.35) { q -= 0.1; out = c.toDataURL("image/jpeg", q); } return out;
}
/* общий раздел: изделия, интерьер, инструменты */
async function itemsView(main, kind, title, hint) {
  const form = el("form", { class: "adm-form", novalidate: true }), box = el("div"); let photo, editId = null;
  const f = { title: el("input", { maxlength: 80, required: true }), price: el("input", { type: "number", min: 0, max: 10000000, inputmode: "numeric", placeholder: "₽, можно пусто" }), descr: el("textarea", { maxlength: 600 }),
    active: el("input", { type: "checkbox", checked: true }), file: el("input", { type: "file", accept: "image/*" }) };
  const prev = el("div", { class: "mrow" }), err = el("div", { class: "err full", role: "alert" }), ttl = el("p", { class: "full sub2", style: "margin:0", text: "Новая позиция" });
  const reset = () => { editId = null; photo = undefined; form.reset(); f.active.checked = true; prev.replaceChildren(); ttl.textContent = "Новая позиция"; };
  f.file.onchange = async () => { const fl = f.file.files[0]; if (!fl) return; try { photo = await shrink(fl, 720); prev.replaceChildren(el("img", { src: photo, alt: "", style: "width:72px;height:72px;object-fit:cover" }), el("button", { class: "pill", type: "button", text: "Убрать фото", onclick: () => { photo = null; f.file.value = ""; prev.replaceChildren(); } })); } catch (e) { err.textContent = "Не удалось открыть фото."; } };
  form.append(ttl, el("p", { class: "full note", text: hint }), el("label", { class: "full" }, "Название", f.title), el("label", {}, "Цена", f.price), el("label", { class: "full" }, "Описание", f.descr),
    el("label", { class: "full" }, "Фото", f.file), prev, el("label", { class: "full", style: "display:flex;gap:8px;align-items:center" }, f.active, "Показывать клиентам"), err,
    el("div", { class: "full btns" }, el("button", { class: "btn small", type: "submit", text: "Сохранить" }), el("button", { class: "btn ghost small", type: "button", text: "Очистить", onclick: reset })));
  form.onsubmit = async e => { e.preventDefault(); err.textContent = ""; if (!f.title.value.trim()) { err.textContent = "Укажите название."; return; }
    const m = { id: editId, title: f.title.value, price: f.price.value, descr: f.descr.value, active: f.active.checked }; if (photo !== undefined) m.photo = photo;
    try { await call("kp_adm_item_save", { k: kind, m }); toast("Сохранено. Клиенты увидят сразу"); reset(); await load(); } catch (x) { err.textContent = AERR[x.code] || "Не удалось сохранить."; } };
  const load = async () => {
    const list = await call("kp_adm_items", { k: kind });
    box.replaceChildren(el("h2", { text: "Уже добавлено (" + list.length + ")", style: "margin-top:18px" }), ...(list.length ? list.map(m => {
      const del = el("button", { class: "pill bad", type: "button", text: "Удалить" });
      del.onclick = async () => { if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = "Точно удалить?"; return; } try { await call("kp_adm_item_delete", { iid: m.id }); toast("Удалено"); await load(); } catch (e) { fail(e); } };
      return el("article", { class: "card2" + (m.active ? "" : " off") }, el("div", { class: "mrow" }, m.photo ? el("img", { src: m.photo, alt: "" }) : el("div", { class: "sw2" }),
        el("div", { class: "grow" }, el("b", { text: m.title }), el("br"), el("small", { text: (m.price ? KP.fmt(m.price) : "без цены") + (m.active ? "" : " · скрыто") })),
        el("div", { class: "pills" }, el("button", { class: "pill", type: "button", text: "Изменить", onclick: () => { editId = m.id; photo = undefined; f.title.value = m.title; f.price.value = m.price || ""; f.descr.value = m.descr || ""; f.active.checked = m.active;
          prev.replaceChildren(m.photo ? el("img", { src: m.photo, alt: "", style: "width:72px;height:72px;object-fit:cover" }) : ""); ttl.textContent = "Изменить: " + m.title; scrollTo({ top: 0, behavior: "smooth" }); } }), del)));
    }) : [el("p", { class: "note", text: "Пока ничего. Добавьте первую позицию: она появится у клиентов в «Услугах»." })]));
  };
  main.replaceChildren(el("h2", { text: title }), form, box); await load();
}

const VIEWS = {
  /* ───── обзор ───── */
  async overview(main) {
    const s = await call("kp_adm_stats");
    const tile = (n, l, hot) => el("div", { class: "tile" + (hot ? " hot" : "") }, el("b", { text: n }), el("span", { text: l }));
    const mx = Math.max(1, ...s.days.map(d => d.n));
    main.replaceChildren(el("h2", { text: "Обзор" }),
      el("div", { class: "tiles" },
        tile(s.users, "Клиентов (+" + s.users7 + " за неделю)"), tile(s.orders, "Заявок всего"), tile(s.o_new, "Новых", s.o_new > 0), tile(s.o_work, "В работе"),
        tile(s.o_done, "Выполнено"), tile(s.o_cancel, "Отменено"), tile(KP.fmt(s.revenue), "Выручка (выполненные)"), tile(KP.fmt(s.pipeline), "В работе и новых на сумму"),
        tile(s.reviews + (s.reviews ? " · " + s.avg : ""), "Отзывов · средняя оценка"), tile(s.coupons, "Действующих промокодов"), tile(KP.fmt(s.cert_balance), "Остаток сертификатов"), tile(s.materials, "Материалов в каталоге")),
      el("h2", { text: "Заявки за 14 дней" }),
      el("div", { class: "bars", role: "img", "aria-label": "Заявки по дням" }, s.days.map(d => el("i", { style: "height:" + Math.max(2, Math.round(d.n / mx * 100)) + "%", title: d.d + ": " + d.n }, d.n ? el("u", { text: d.n }) : null, el("em", { text: d.d.slice(0, 2) })))));
  },

  /* ───── заявки ───── */
  async orders(main) {
    let flt = AD.ordFlt || null;
    const box = el("div"), chips = el("div", { class: "pills" });
    const load = async () => {
      const list = await call("kp_adm_orders", { st: flt, lim: 200 }); AD.orders = list;
      chips.replaceChildren(...[[null, "Все"], ["new", "Новые"], ["work", "В работе"], ["done", "Выполнены"], ["cancel", "Отменены"]].map(([v, n]) => el("button", { class: "pill", type: "button", "aria-pressed": flt === v, text: n, onclick: () => { flt = v; AD.ordFlt = v; load().catch(fail); } })));
      box.replaceChildren(...(list.length ? list.map(orderCard) : [el("p", { class: "note", text: "Заявок нет." })]));
    };
    const orderCard = o => {
      const sts = el("div", { class: "pills" }, ["new", "work", "done", "cancel"].map(k => el("button", { class: "pill" + (k === "cancel" ? " bad" : ""), type: "button", "aria-pressed": o.status === k, text: ST[k],
        onclick: async () => { try { await call("kp_adm_order_status", { n: o.num, st: k }); toast("Заявка №" + o.num + ": " + ST[k]); await load(); } catch (e) { fail(e); } } })));
      return el("article", { class: "card2" },
        el("div", { class: "row" }, el("b", { text: "№" + o.num + " · " + o.name }), el("small", { text: dt(o.ts) })),
        el("p", {}, el("a", { href: "tel:" + o.phone.replace(/[^\d+]/g, ""), text: o.phone }), o.email ? " · " + o.email : "", o.address ? " · " + o.address : ""),
        el("ul", { class: "items" }, (o.items || []).map(i => el("li", { text: i.t + " × " + i.q + " — " + KP.fmt(i.p * i.q) }))),
        o.comment ? el("p", { text: "Комментарий: " + o.comment }) : null,
        el("div", { class: "row" }, el("span", { text: "Итого " + KP.fmt(o.final) + (o.discount ? " (скидка " + KP.fmt(o.discount) + ")" : "") + (o.cert ? ", сертификат " + KP.fmt(o.cert) : "") + (o.code ? ", код " + o.code : "") })), sts);
    };
    main.replaceChildren(el("h2", { text: "Заявки" }), chips, box,
      el("div", { class: "btns", style: "margin-top:14px" }, el("button", { class: "btn ghost small", type: "button", text: "Скачать список (CSV)", onclick: async () => {
        try { const all = await call("kp_adm_orders", { st: null, lim: 1000 }); const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
          const rows = [["Номер", "Дата", "Имя", "Телефон", "Почта", "Адрес", "Состав", "Итого", "Скидка", "Сертификат", "К оплате", "Код", "Статус", "Комментарий"].map(q).join(";")];
          all.forEach(o => rows.push([o.num, o.ts, o.name, o.phone, o.email, o.address, (o.items || []).map(i => i.t + " x" + i.q).join(", "), o.total, o.discount, o.cert, o.final, o.code, ST[o.status] || o.status, o.comment].map(q).join(";")));
          saveText("﻿" + rows.join("\r\n"), "kirprof-zayavki.csv", "text/csv"); toast("Список заявок сохранён"); } catch (e) { fail(e); } } })));
    await load();
  },

  /* ───── отзывы ───── */
  async reviews(main) {
    const list = await call("kp_adm_reviews");
    main.replaceChildren(el("h2", { text: "Отзывы (" + list.length + ")" }), ...(list.length ? list.map(r => {
      const del = el("button", { class: "pill bad", type: "button", text: "Удалить" });
      del.onclick = async () => { if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = "Точно удалить?"; return; } try { await call("kp_adm_review_delete", { rid: r.id }); toast("Отзыв удалён"); show("reviews"); } catch (e) { fail(e); } };
      return el("article", { class: "card2" }, el("div", { class: "row" }, el("b", { text: r.name }), el("span", { class: "stars", text: "★".repeat(r.rating) + "☆".repeat(5 - r.rating) }), el("small", { text: dt(r.ts) })),
        el("p", { text: r.text }), r.pc ? el("small", { text: "Фото: " + r.pc }) : null, el("div", { class: "pills" }, del));
    }) : [el("p", { class: "note", text: "Отзывов пока нет." })]));
  },

  /* ───── клиенты ───── */
  async users(main) {
    const q = el("input", { type: "search", placeholder: "Поиск по имени, почте, телефону", "aria-label": "Поиск клиента", style: "width:100%;padding:10px;background:var(--bg);border:1px solid var(--line);color:var(--ink);margin-bottom:12px" });
    const box = el("div");
    const load = async () => {
      const list = await call("kp_adm_users", { q: q.value.trim() || null });
      box.replaceChildren(el("p", { class: "note", text: "Найдено: " + list.length }), ...list.map(u => {
        const pw = el("input", { type: "text", placeholder: "Новый пароль, 8+ знаков", style: "padding:8px;background:var(--bg);border:1px solid var(--line);color:var(--ink);min-width:0;flex:1" }), row = el("div", { class: "pills", hidden: true }, pw,
          el("button", { class: "pill", type: "button", text: "Сохранить", onclick: async () => { try { await call("kp_adm_user_password", { em: u.email, pw: pw.value }); pw.value = ""; row.hidden = true; toast("Пароль изменён, клиент войдёт с новым"); } catch (e) { fail(e); } } }));
        return el("article", { class: "card2" }, el("div", { class: "row" }, el("b", { text: u.name }), el("small", { text: "с " + dt(u.ts) })),
          el("p", { text: u.email + (u.phone ? " · " + u.phone : "") }), el("small", { text: "Заявок: " + u.orders + ", выполнено: " + u.done }),
          el("div", { class: "pills" }, el("button", { class: "pill", type: "button", text: "Новый пароль", onclick: () => { row.hidden = !row.hidden; } })), row);
      }));
    };
    let t = 0; q.oninput = () => { clearTimeout(t); t = setTimeout(() => load().catch(fail), 350); };
    main.replaceChildren(el("h2", { text: "Клиенты" }), q, box); await load();
  },

  /* ───── материалы ───── */
  async materials(main) {
    const form = el("form", { class: "adm-form", novalidate: true }), box = el("div");
    let photo = undefined, editId = null;
    const f = { name: el("input", { maxlength: 80, required: true }), kind: el("select", {}, KINDS.map(([v, n]) => el("option", { value: v, text: n }))), color: el("input", { type: "color", value: "#808080" }),
      article: el("input", { maxlength: 40 }), price: el("input", { type: "number", min: 0, max: 1000000, inputmode: "numeric", placeholder: "₽ за метр" }), stock: el("input", { maxlength: 40, placeholder: "например, 15 м" }),
      note: el("textarea", { maxlength: 400 }), active: el("input", { type: "checkbox", checked: true }), file: el("input", { type: "file", accept: "image/*" }) };
    const prev = el("div", { class: "mrow" });
    const err = el("div", { class: "err full", role: "alert" });
    const reset = () => { editId = null; photo = undefined; form.reset(); f.color.value = "#808080"; f.active.checked = true; prev.replaceChildren(); title.textContent = "Новый материал"; };
    const title = el("p", { class: "full sub2", style: "margin:0", text: "Новый материал" });
    f.file.onchange = async () => {
      const fl = f.file.files[0]; if (!fl) return;
      try { const bmp = await createImageBitmap(fl, { imageOrientation: "from-image" }); const k = Math.min(1, 320 / Math.max(bmp.width, bmp.height)), c = el("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); photo = c.toDataURL("image/jpeg", 0.82); prev.replaceChildren(el("img", { src: photo, alt: "", style: "width:56px;height:56px" }), el("button", { class: "pill", type: "button", text: "Убрать фото", onclick: () => { photo = null; f.file.value = ""; prev.replaceChildren(); } })); }
      catch (e) { err.textContent = "Не удалось открыть фото."; }
    };
    form.append(title,
      el("label", {}, "Название", f.name), el("label", {}, "Вид ткани", f.kind), el("label", {}, "Цвет (если нет фото)", f.color), el("label", {}, "Артикул", f.article),
      el("label", {}, "Цена", f.price), el("label", {}, "Остаток", f.stock), el("label", { class: "full" }, "Описание", f.note),
      el("label", { class: "full" }, "Фото образца (для примерки)", f.file), prev, el("label", { class: "full", style: "display:flex;gap:8px;align-items:center" }, f.active, "Показывать клиентам"), err,
      el("div", { class: "full btns" }, el("button", { class: "btn small", type: "submit", text: "Сохранить материал" }), el("button", { class: "btn ghost small", type: "button", text: "Очистить", onclick: reset })));
    form.onsubmit = async e => {
      e.preventDefault(); err.textContent = "";
      if (!f.name.value.trim()) { err.textContent = "Укажите название."; return; }
      const m = { id: editId, name: f.name.value, kind: f.kind.value, color: f.color.value, article: f.article.value, price: f.price.value, stock: f.stock.value, note: f.note.value, active: f.active.checked };
      if (photo !== undefined) m.photo = photo;
      try { await call("kp_adm_material_save", { m }); toast("Материал сохранён"); reset(); await load(); } catch (x) { err.textContent = AERR[x.code] || "Не удалось сохранить."; }
    };
    const load = async () => {
      const list = await call("kp_adm_materials");
      box.replaceChildren(el("h2", { text: "Каталог (" + list.length + ")", style: "margin-top:18px" }), ...(list.length ? list.map(m => {
        const del = el("button", { class: "pill bad", type: "button", text: "Удалить" });
        del.onclick = async () => { if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = "Точно удалить?"; return; } try { await call("kp_adm_material_delete", { mid: m.id }); toast("Материал удалён"); await load(); } catch (e) { fail(e); } };
        return el("article", { class: "card2" + (m.active ? "" : " off") }, el("div", { class: "mrow" },
          m.photo ? el("img", { src: m.photo, alt: "" }) : el("div", { class: "sw2", style: "background:" + m.color }),
          el("div", { class: "grow" }, el("b", { text: m.name }), el("br"), el("small", { text: (KINDS.find(k => k[0] === m.kind) || [0, ""])[1] + (m.article ? " · арт. " + m.article : "") + (m.price ? " · " + m.price + " ₽" : "") + (m.stock ? " · " + m.stock : "") + (m.active ? "" : " · скрыт") })),
          el("div", { class: "pills" }, el("button", { class: "pill", type: "button", text: "Изменить", onclick: () => {
            editId = m.id; photo = undefined; f.name.value = m.name; f.kind.value = m.kind; f.color.value = m.color; f.article.value = m.article || ""; f.price.value = m.price || ""; f.stock.value = m.stock || ""; f.note.value = m.note || ""; f.active.checked = m.active;
            prev.replaceChildren(m.photo ? el("img", { src: m.photo, alt: "", style: "width:56px;height:56px" }) : ""); title.textContent = "Изменить: " + m.name; scrollTo({ top: 0, behavior: "smooth" }); } }), del)));
      }) : [el("p", { class: "note", text: "Материалов пока нет. Добавьте первый: он появится у клиентов в «Примерке» как «Каталог мастерской»." })]));
    };
    main.replaceChildren(el("h2", { text: "Материалы" }), form, box); await load();
  },

  /* ───── поддержка: чат и обратные звонки ───── */
  async support(main) {
    const box = el("div"), calls = el("div");
    const openChat = async (c) => {
      clearInterval(AD.chatT);
      const log = el("div", { class: "chat-log" }), ta = el("textarea", { maxlength: 1000, rows: 2, placeholder: "Ответ клиенту", "aria-label": "Ответ клиенту" }), err = el("div", { class: "err", role: "alert" });
      let last = 0; const seen = new Set();
      const pull = async () => { const r = await call("kp_adm_chat_get", { cid: c.id, after: last });
        r.items.forEach(m => { if (seen.has(m.id)) return; seen.add(m.id); last = Math.max(last, m.id); log.append(el("div", { class: "msg" + (m.staff ? " mine" : "") }, el("span", { text: m.body }), el("small", { text: (m.staff ? (m.who || "Мы") : r.name) + " · " + dt(m.ts) }))); log.scrollTop = log.scrollHeight; }); return r; };
      const send = el("button", { class: "btn small", type: "button", text: "Отправить" });
      send.onclick = async () => { const t = ta.value.trim(); if (!t) return; send.disabled = true; err.textContent = ""; try { await call("kp_adm_chat_send", { cid: c.id, tx: t }); ta.value = ""; await pull(); } catch (x) { err.textContent = AERR[x.code] || "Не отправлено."; } send.disabled = false; };
      const r0 = await pull();
      const cl = el("button", { class: "pill", type: "button", text: r0.closed ? "Открыть снова" : "Закрыть обращение", onclick: async () => { try { await call("kp_adm_chat_close", { cid: c.id, cl: !r0.closed }); toast(r0.closed ? "Открыто" : "Закрыто"); show("support"); } catch (x) { fail(x); } } });
      main.replaceChildren(el("div", { class: "row" }, el("button", { class: "pill", type: "button", text: "← Все обращения", onclick: () => show("support") }), cl), el("h2", { text: r0.name, style: "margin-top:12px" }), log, err, ta, el("div", { class: "btns" }, send));
      AD.chatT = setInterval(() => { if (AD.tab === "support") pull().catch(() => {}); }, 4000);
    };
    const chats = await call("kp_adm_chats"), cbs = await call("kp_adm_callbacks");
    box.replaceChildren(...(chats.length ? chats.map(c => el("article", { class: "card2 clk" + (c.unread ? " unread" : ""), tabindex: 0, role: "button", onclick: () => openChat(c).catch(fail), onkeydown: e => { if (e.key === "Enter") openChat(c).catch(fail); } },
      el("div", { class: "row" }, el("b", { text: c.name + (c.unread ? " · новых: " + c.unread : "") }), el("small", { text: dt(c.ts) + (c.closed ? " · закрыт" : "") })), el("p", { text: c.last || "" }))) : [el("p", { class: "note", text: "Обращений в чате пока нет." })]));
    calls.replaceChildren(...(cbs.length ? cbs.map(c => {
      const done = c.status === "done";
      return el("article", { class: "card2" + (done ? " off" : "") }, el("div", { class: "row" }, el("b", { text: c.name }), el("small", { text: dt(c.ts) })),
        el("p", {}, el("a", { href: "tel:" + c.phone.replace(/[^\d+]/g, ""), text: c.phone }), c.pref ? " · " + c.pref : ""), c.note ? el("p", { text: c.note }) : null,
        el("div", { class: "pills" }, el("button", { class: "pill", type: "button", "aria-pressed": done, text: done ? "Перезвонили ✓" : "Отметить: перезвонили", onclick: async () => { try { await call("kp_adm_callback_status", { cid: c.id, st: done ? "new" : "done" }); show("support"); } catch (x) { fail(x); } } })));
    }) : [el("p", { class: "note", text: "Просьб перезвонить пока нет." })]));
    main.replaceChildren(el("h2", { text: "Чат с клиентами" }), box, el("h2", { text: "Обратный звонок", style: "margin-top:20px" }), calls);
    badges();
  },

  /* ───── изделия, интерьер, инструменты ───── */
  async product(main) { return itemsView(main, "product", "Изделия", "Фото готовых работ: покажите, что вы умеете."); },
  async interior(main) { return itemsView(main, "interior", "Интерьер", "Мебель и решения для интерьера."); },
  async tool(main) { return itemsView(main, "tool", "Инструменты", "Фурнитура, комплектующие и инструменты, которые вы продаёте или используете."); },

  /* ───── сотрудники ───── */
  async staff(main) {
    const list = await call("kp_adm_staff");
    const em = el("input", { type: "email", placeholder: "Почта, с которой человек зарегистрирован на сайте", "aria-label": "Почта сотрудника" }), err = el("div", { class: "err", role: "alert" });
    const checks = (sel) => PERMS.map(([k, n]) => { const c = el("input", { type: "checkbox", value: k, checked: sel.includes(k) }); return el("label", { class: "chk" }, c, n); });
    const addBoxes = checks(["support"]);
    const read = bx => bx.map(l => l.firstChild).filter(c => c.checked).map(c => c.value);
    const add = el("form", { class: "adm-form", novalidate: true }, el("p", { class: "full sub2", style: "margin:0", text: "Добавить сотрудника" }), el("label", { class: "full" }, "Почта", em),
      el("div", { class: "full" }, el("p", { class: "note", text: "Что разрешено:" }), ...addBoxes), err, el("div", { class: "full btns" }, el("button", { class: "btn small", type: "submit", text: "Дать доступ" })));
    add.onsubmit = async e => { e.preventDefault(); err.textContent = ""; const p = read(addBoxes); if (!p.length) { err.textContent = "Отметьте хотя бы одно право."; return; }
      try { await call("kp_adm_staff_set", { em: em.value, pr: p }); toast("Доступ выдан"); show("staff"); } catch (x) { err.textContent = AERR[x.code] || "Не удалось."; } };
    const cards = list.map(u => {
      if (u.dev) return el("article", { class: "card2" }, el("div", { class: "row" }, el("b", { text: u.name }), el("small", { text: "Разработчик" })), el("p", { class: "note", text: "Полный доступ. Вход по секретному коду." }));
      const bx = checks(u.perms || []); const card = el("article", { class: "card2" });
      const save = el("button", { class: "pill", type: "button", text: "Сохранить права", onclick: async () => { try { await call("kp_adm_staff_set", { em: u.email, pr: read(bx) }); toast("Сохранено"); } catch (x) { fail(x); } } });
      const rm = el("button", { class: "pill bad", type: "button", text: "Убрать доступ" });
      rm.onclick = async () => { if (!rm.dataset.sure) { rm.dataset.sure = 1; rm.textContent = "Точно убрать?"; return; } try { await call("kp_adm_staff_set", { em: u.email, pr: [], own: AD.me.dev ? false : null }); toast("Доступ убран"); show("staff"); } catch (x) { fail(x); } };
      card.append(el("div", { class: "row" }, el("b", { text: u.name }), el("small", { text: u.owner ? "Владелец" : "Сотрудник" })), el("p", { text: u.email }));
      if (u.owner) card.append(el("p", { class: "note", text: "Владелец: полный доступ ко всему." }));
      else card.append(el("div", {}, ...bx));
      const row = el("div", { class: "pills" }); if (!u.owner) row.append(save);
      if (AD.me.dev) row.append(el("button", { class: "pill", type: "button", text: u.owner ? "Снять владельца" : "Сделать владельцем", onclick: async () => { try { await call("kp_adm_staff_set", { em: u.email, pr: u.perms || [], own: !u.owner }); toast("Готово"); show("staff"); } catch (x) { fail(x); } } }));
      row.append(rm); card.append(row); return card;
    });
    main.replaceChildren(el("h2", { text: "Сотрудники" }), el("p", { class: "note", text: "Человек сначала регистрируется на сайте, затем вы даёте ему права. Он входит в этот кабинет по той же почте и паролю и видит только разрешённые разделы." }), add,
      el("h2", { text: "Кто имеет доступ", style: "margin-top:18px" }), ...cards,
      AD.me.dev ? el("p", { class: "note", text: "Чтобы передать приложение другому человеку: зарегистрируйте его на сайте, нажмите «Сделать владельцем». Он получит полный доступ, включая выдачу прав сотрудникам." }) : null);
  },

  /* ───── информация ───── */
  async info(main) {
    const st = (await rpc("kp_settings_get")) || {}, sh = Object.assign({}, KP.shop, st.shop || {});
    const f = { phone: el("input", { value: sh.phone || "", maxlength: 40 }), mail: el("input", { type: "email", value: sh.mail || "", maxlength: 120 }), addr: el("input", { value: sh.addr || "", maxlength: 200 }),
      hours: el("input", { value: sh.hours || "", maxlength: 100 }), lat: el("input", { value: sh.lat || "", inputmode: "decimal" }), lon: el("input", { value: sh.lon || "", inputmode: "decimal" }),
      banner: el("textarea", { maxlength: 300, placeholder: "Например: Осенняя скидка 10% по промокоду OSEN10" }), about: el("textarea", { maxlength: 1500, style: "min-height:120px" }) };
    f.banner.value = typeof st.banner === "string" ? st.banner : ""; f.about.value = typeof st.about === "string" ? st.about : "";
    const err = el("div", { class: "err full", role: "alert" });
    const form = el("form", { class: "adm-form", novalidate: true }, el("p", { class: "full sub2", style: "margin:0", text: "Контакты мастерской" }),
      el("label", {}, "Телефон", f.phone), el("label", {}, "Почта для заказов", f.mail), el("label", { class: "full" }, "Адрес", f.addr), el("label", { class: "full" }, "Часы работы", f.hours),
      el("label", {}, "Широта (для карты)", f.lat), el("label", {}, "Долгота (для карты)", f.lon),
      el("p", { class: "full sub2", style: "margin:6px 0 0", text: "Объявление на главной" }), el("label", { class: "full" }, "Текст (пусто — не показывать)", f.banner),
      el("p", { class: "full sub2", style: "margin:6px 0 0", text: "О мастерской (в разделе «Контакты»)" }), el("label", { class: "full" }, "Текст", f.about), err,
      el("div", { class: "full btns" }, el("button", { class: "btn small", type: "submit", text: "Сохранить" })));
    form.onsubmit = async e => {
      e.preventDefault(); err.textContent = "";
      const lat = parseFloat(String(f.lat.value).replace(",", ".")), lon = parseFloat(String(f.lon.value).replace(",", "."));
      if ((f.lat.value || f.lon.value) && !(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) { err.textContent = "Проверьте координаты: широта и долгота числами, например 55.7558 и 37.6176."; return; }
      const shop = { phone: f.phone.value.trim(), mail: f.mail.value.trim(), addr: f.addr.value.trim(), hours: f.hours.value.trim() }; if (!isNaN(lat) && !isNaN(lon)) { shop.lat = lat; shop.lon = lon; }
      try { await call("kp_adm_setting_set", { k: "shop", v: shop }); await call("kp_adm_setting_set", { k: "banner", v: f.banner.value.trim() }); await call("kp_adm_setting_set", { k: "about", v: f.about.value.trim() }); toast("Сохранено. На сайте обновится сразу"); }
      catch (x) { err.textContent = AERR[x.code] || "Не удалось сохранить."; }
    };
    main.replaceChildren(el("h2", { text: "Информация" }), form);
  },

  /* ───── инструменты ───── */
  async codes(main) {
    const codes = el("div"), cerr = el("div", { class: "err full", role: "alert" }), serr = el("div", { class: "err full", role: "alert" }), out = el("p", { class: "full note" });
    const cd = el("input", { maxlength: 30, placeholder: "ОСЕНЬ10", style: "text-transform:uppercase" }), pct = el("input", { type: "number", min: 1, max: 90, value: 10 }), uses = el("input", { type: "number", min: 1, placeholder: "без лимита" }), days = el("input", { type: "number", min: 1, max: 365, value: 30 });
    const amt = el("input", { type: "number", min: 100, step: 100, value: 5000 });
    const load = async () => {
      const list = await call("kp_adm_codes");
      codes.replaceChildren(...(list.length ? list.map(c => el("article", { class: "card2" }, el("div", { class: "row" }, el("b", { text: c.code }), el("span", { text: c.kind === "certificate" ? "Сертификат, остаток " + KP.fmt(c.balance) + " из " + KP.fmt(c.amount) : "Промокод −" + c.percent + "%" + (c.uses != null ? ", осталось " + c.uses : "") })),
        c.until ? el("small", { text: "До " + new Date(c.until).toLocaleDateString("ru-RU") }) : null)) : [el("p", { class: "note", text: "Кодов пока нет." })]));
    };
    const mint = (form, err, fn) => async e => { e.preventDefault(); err.textContent = ""; out.textContent = ""; try { const r = await fn(); out.textContent = "Готово. Код: " + r.code; toast("Код создан: " + r.code); await load(); } catch (x) { err.textContent = AERR[x.code] || "Не удалось создать."; } };
    const f1 = el("form", { class: "adm-form", novalidate: true }, el("p", { class: "full sub2", style: "margin:0", text: "Новый промокод" }), el("label", {}, "Код", cd), el("label", {}, "Скидка, %", pct), el("label", {}, "Сколько раз можно", uses), el("label", {}, "Действует дней", days), cerr,
      el("div", { class: "full btns" }, el("button", { class: "btn small", type: "submit", text: "Создать промокод" })));
    f1.onsubmit = mint(f1, cerr, () => call("kp_adm_mint", { kind: "coupon", val: +pct.value, cd: cd.value, uses: uses.value ? +uses.value : null, days: +days.value || 30 }));
    const f2 = el("form", { class: "adm-form", novalidate: true }, el("p", { class: "full sub2", style: "margin:0", text: "Подарочный сертификат" }), el("label", {}, "Сумма, ₽", amt), serr,
      el("div", { class: "full btns" }, el("button", { class: "btn small", type: "submit", text: "Выпустить сертификат" })));
    f2.onsubmit = mint(f2, serr, () => call("kp_adm_mint", { kind: "certificate", val: +amt.value }));
    main.replaceChildren(el("h2", { text: "Акции и коды" }), f1, f2, out, el("h2", { text: "Общие коды", style: "margin-top:14px" }), codes,
      el("p", { class: "note", text: "Новый пароль клиенту — в разделе «Клиенты». Список заявок в таблицу — в разделе «Заявки»." }));
    await load();
  },
};
ptrAttach(document.scrollingElement || document.documentElement, () => (AD.tab ? show(AD.tab) : null));
start();
