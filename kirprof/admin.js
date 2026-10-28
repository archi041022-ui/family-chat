/* Кабинет мастера КИРПРОФ: обзор, заявки, отзывы, клиенты, материалы, информация, инструменты.
   Права проверяются на сервере по входу; эта страница сама ничего не решает. */
"use strict";
const AD = { tab: "overview", list: null };
const ST = { new: "Новая", work: "В работе", done: "Выполнена", cancel: "Отменена" };
const KINDS = [["rog", "Рогожка"], ["vel", "Велюр"], ["chen", "Шенилл"], ["jac", "Жаккард"], ["eco", "Экокожа"], ["lea", "Натуральная кожа"], ["other", "Другое"]];
const TABS = [["overview", "Обзор"], ["orders", "Заявки"], ["reviews", "Отзывы"], ["users", "Клиенты"], ["materials", "Материалы"], ["info", "Информация"], ["tools", "Инструменты"]];
const AERR = { forbidden: "Нет прав. Войдите как разработчик.", bad_password: "Пароль не короче 8 символов.", not_found: "Клиент не найден.", bad_coupon: "Код не короче 3 знаков, скидка от 1 до 90%.", bad_amount: "Сумма не меньше 100 ₽.", too_big: "Слишком длинный текст.", http: "Нет связи. Попробуйте ещё раз." };

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
  const form = el("form", { class: "adm-form", novalidate: true },
    el("p", { class: "full note", text: "Кабинет мастера доступен разработчику и сотрудникам с правами. Войдите на сайте или введите секретный код." }),
    el("label", { class: "full" }, "Секретный код разработчика", code), err,
    el("div", { class: "full btns" }, el("button", { class: "btn small", type: "submit", text: "Войти" }), el("a", { class: "btn ghost small", href: "index.html", text: "На сайт" })));
  form.onsubmit = async e => {
    e.preventDefault(); err.textContent = "";
    try { const r = await rpc("kp_dev_login", { code: code.value }); if (r && r.error) { err.textContent = ({ bad_code: "Неверный код.", off: "Вход разработчика не включён.", locked_dev: "Подождите 15 минут." })[r.error] || "Не удалось войти."; return; }
      store("kp_devcode", code.value); store("kp_sess", r.token); KP.sess = r.token; start(); } catch (x) { err.textContent = "Нет связи."; }
  };
  $("#admMain").replaceChildren(el("h2", { text: "Вход" }), form);
}
async function start() {
  if (!KP.sess && store("kp_devcode")) { try { const d = await rpc("kp_dev_login", { code: store("kp_devcode") }); if (d && d.token) { KP.sess = d.token; store("kp_sess", d.token); } } catch (e) { /* без связи */ } }
  if (!KP.sess) { loginView(); return; }
  let ok = false;
  try { ok = await call("kp_admin_check"); } catch (e) { $("#admMain").replaceChildren(el("p", { class: "err", text: "Нет связи или база ещё не обновлена (нужна миграция 024)." })); return; }
  if (!ok && store("kp_devcode")) { try { const d = await rpc("kp_dev_login", { code: store("kp_devcode") }); if (d && d.token) { KP.sess = d.token; store("kp_sess", d.token); ok = await call("kp_admin_check"); } } catch (e) { /* */ } }
  if (!ok) { loginView("У этой учётной записи нет прав мастера."); return; }
  const nav = $("#admNav"); nav.hidden = false; nav.replaceChildren(...TABS.map(([id, n]) => el("button", { type: "button", role: "tab", "data-t": id, "aria-selected": id === AD.tab, text: n, onclick: () => show(id) })));
  show(location.hash.slice(1) && TABS.some(t => t[0] === location.hash.slice(1)) ? location.hash.slice(1) : "overview");
}
async function show(id) {
  AD.tab = id; location.hash = id;
  document.querySelectorAll("#admNav button").forEach(b => b.setAttribute("aria-selected", b.dataset.t === id));
  const main = $("#admMain"); main.replaceChildren(el("p", { class: "note", text: "Загрузка…" }));
  try { await VIEWS[id](main); } catch (e) { if (e.code === "forbidden") { loginView("Нет прав."); return; } main.replaceChildren(el("p", { class: "err", text: AERR[e.code] || "Не удалось загрузить. Проверьте связь." })); }
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
  async tools(main) {
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
    main.replaceChildren(el("h2", { text: "Инструменты" }), f1, f2, out, el("h2", { text: "Общие коды", style: "margin-top:14px" }), codes,
      el("p", { class: "note", text: "Новый пароль клиенту — в разделе «Клиенты». Список заявок в таблицу — в разделе «Заявки»." }));
    await load();
  },
};
ptrAttach(document.scrollingElement || document.documentElement, () => (AD.tab ? show(AD.tab) : null));
start();
