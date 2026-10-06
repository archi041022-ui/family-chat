/* Каталог, калькулятор, заявка и переключение разделов. */
"use strict";
const fmt = KP.fmt;
const FABRICS=[
  {n:"терракот, рогожка",c:"#9a4128"},{n:"изумруд, велюр",c:"#1f5c4c"},
  {n:"графит, микровелюр",c:"#4a5058"},{n:"песок, шенилл",c:"#c9b48e"},
  {n:"синий, жаккард",c:"#2c4a7a"},{n:"бордо, экокожа",c:"#6b1f2e"}
];
const MATS=[{n:"Рогожка",k:1},{n:"Велюр",k:1.2},{n:"Шенилл",k:1.1},{n:"Жаккард",k:1.3},{n:"Экокожа",k:1.4},{n:"Натуральная кожа",k:2.2}];
const SIZES=[{n:"Малый (1–2 места, до 120 см)",k:.85},{n:"Стандарт (2–3 места, до 200 см)",k:1},{n:"Большой (угловой, от 250 см)",k:1.5}];

const P={ /* силуэты мебели, цвет ткани берётся из --fab */
sofa:'<rect class="f" x="30" y="60" width="240" height="60" rx="14" fill="var(--fab)"/><rect class="f" x="40" y="30" width="220" height="48" rx="12" fill="var(--fab)"/><rect x="40" y="30" width="220" height="48" rx="12" fill="#000" opacity=".16"/><rect class="f" x="14" y="56" width="40" height="70" rx="14" fill="var(--fab)"/><rect class="f" x="246" y="56" width="40" height="70" rx="14" fill="var(--fab)"/><rect x="66" y="64" width="84" height="46" rx="8" fill="#fff" opacity=".12"/><rect x="152" y="64" width="84" height="46" rx="8" fill="#fff" opacity=".12"/><rect x="40" y="126" width="8" height="14" fill="#6b5a45"/><rect x="252" y="126" width="8" height="14" fill="#6b5a45"/>',
arm:'<rect class="f" x="80" y="26" width="140" height="70" rx="16" fill="var(--fab)"/><rect x="80" y="26" width="140" height="70" rx="16" fill="#000" opacity=".16"/><rect class="f" x="56" y="70" width="44" height="58" rx="14" fill="var(--fab)"/><rect class="f" x="200" y="70" width="44" height="58" rx="14" fill="var(--fab)"/><rect class="f" x="96" y="84" width="108" height="40" rx="10" fill="var(--fab)"/><rect x="104" y="90" width="92" height="28" rx="7" fill="#fff" opacity=".14"/><rect x="74" y="128" width="8" height="14" fill="#6b5a45"/><rect x="218" y="128" width="8" height="14" fill="#6b5a45"/>',
chair:'<rect class="f" x="104" y="20" width="92" height="68" rx="10" fill="var(--fab)"/><rect x="112" y="28" width="76" height="52" rx="6" fill="#fff" opacity=".13"/><rect class="f" x="96" y="92" width="108" height="26" rx="8" fill="var(--fab)"/><rect x="100" y="118" width="9" height="30" fill="#6b5a45"/><rect x="191" y="118" width="9" height="30" fill="#6b5a45"/><rect x="104" y="88" width="9" height="10" fill="#6b5a45"/><rect x="187" y="88" width="9" height="10" fill="#6b5a45"/>',
pouf:'<ellipse cx="150" cy="128" rx="70" ry="10" fill="#fff" opacity=".06"/><rect class="f" x="82" y="64" width="136" height="64" rx="22" fill="var(--fab)"/><ellipse class="f" cx="150" cy="66" rx="68" ry="20" fill="var(--fab)"/><ellipse cx="150" cy="66" rx="68" ry="20" fill="#fff" opacity=".14"/><circle cx="150" cy="66" r="3" fill="#000" opacity=".4"/>',
bed:'<rect class="f" x="30" y="20" width="240" height="62" rx="12" fill="var(--fab)"/><g fill="#000" opacity=".18"><rect x="44" y="30" width="64" height="42" rx="6"/><rect x="118" y="30" width="64" height="42" rx="6"/><rect x="192" y="30" width="64" height="42" rx="6"/></g><rect x="22" y="84" width="256" height="40" rx="8" fill="#2b2b2f"/><rect x="22" y="84" width="256" height="14" rx="6" fill="#fff" opacity=".1"/><rect x="26" y="124" width="9" height="16" fill="#6b5a45"/><rect x="265" y="124" width="9" height="16" fill="#6b5a45"/>',
corner:'<path class="f" d="M30 30h240v96h-70v-52H30z" fill="var(--fab)"/><path d="M30 30h240v26H30z" fill="#000" opacity=".16"/><path d="M42 62h150v18H42z" fill="#fff" opacity=".14"/><rect x="204" y="62" width="54" height="52" fill="#fff" opacity=".14"/><rect x="34" y="126" width="8" height="14" fill="#6b5a45"/><rect x="258" y="126" width="8" height="14" fill="#6b5a45"/>'
};
const svg=k=>'<svg viewBox="0 0 300 150" role="img" aria-label="Эскиз мебели" xmlns="http://www.w3.org/2000/svg">'+P[k]+'</svg>';

const ITEMS=[
 {id:"sofa",t:"Перетяжка дивана",cat:"Диваны",p:9500,d:"Новая ткань, подшивка, замена декоративных элементов."},
 {id:"corner",t:"Угловой диван и кухонный уголок",cat:"Диваны",p:14500,d:"Сложная раскладка, много швов, подбор ткани по размеру."},
 {id:"arm",t:"Обивка кресла",cat:"Кресла и стулья",p:5500,d:"Спинка, подлокотники и сиденье, при необходимости новый поролон."},
 {id:"chair",t:"Перетяжка стула",cat:"Кресла и стулья",p:1200,d:"Сиденье или спинка. Скидка от 4 стульев в заказе."},
 {id:"pouf",t:"Пуфы и банкетки",cat:"Прочее",p:2200,d:"Новая обивка и набивка, возможна стяжка пуговицами."},
 {id:"bed",t:"Мягкое изголовье кровати",cat:"Прочее",p:8000,d:"Каретная стяжка или гладкая панель, ткань на выбор."}
];

const CATS = ["Все", ...new Set(ITEMS.map(i => i.cat))];
const root = document.documentElement;
let fab = 0, cat = "Все";
const cart = [];                 // {k, t, p, q}
KP.me = null;                    // профиль вошедшего клиента
KP.promo = null;                 // применённый код {code, kind, percent, balance}

/* ───── ткань ───── */
function setFab(i) {
  fab = i; root.style.setProperty("--fab", FABRICS[i].c); $("#heroName").textContent = "Ткань: " + FABRICS[i].n;
  document.querySelectorAll(".sw").forEach((b, j) => b.setAttribute("aria-pressed", j === i)); store("kp_fab", String(i));
}
function initFabrics() {
  $("#heroSvg").innerHTML = svg("sofa");
  FABRICS.forEach((f, i) => { const b = document.createElement("button"); b.type = "button"; b.className = "sw"; b.style.backgroundColor = f.c; b.title = f.n; b.setAttribute("aria-label", f.n); b.onclick = () => setFab(i); $("#heroSw").appendChild(b); });
  const s = +store("kp_fab"); if (s >= 0 && s < FABRICS.length && store("kp_fab") !== null) fab = s;
  setFab(fab);
}

/* ───── каталог ───── */
function drawFilters() {
  const el = $("#filters"); el.innerHTML = "";
  CATS.forEach(c => { const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = c; b.setAttribute("aria-pressed", c === cat); b.onclick = () => { cat = c; drawFilters(); drawGrid(); }; el.appendChild(b); });
}
function drawGrid() {
  const g = $("#grid"); g.innerHTML = "";
  ITEMS.filter(i => cat === "Все" || i.cat === cat).forEach(i => {
    const c = document.createElement("article"); c.className = "card";
    c.innerHTML = '<div class="ph">' + svg(i.id) + '</div><div class="bd"><h3></h3><p></p><div class="row"><span class="price"><small>от</small>' + fmt(i.p) + '</span><button class="add" type="button">В заявку</button></div></div>';
    c.querySelector("h3").textContent = i.t; c.querySelector("p").textContent = i.d;
    c.querySelector(".add").onclick = () => addLine({ k: "i" + i.id, t: i.t + " (" + FABRICS[fab].n + ")", p: i.p });
    g.appendChild(c);
  });
}

/* ───── калькулятор ───── */
function calcValue(o) {
  const it = ITEMS.find(i => i.id === o.id) || ITEMS[0], m = MATS[o.mat == null ? 0 : o.mat], s = SIZES[o.size == null ? 1 : o.size];
  const small = ["chair", "pouf"].includes(it.id);
  const work = it.p * (small ? 1 : s.k), mat = o.own ? 0 : work * .55 * m.k;
  let ex = 0; if (o.foam) ex += work * .35; if (o.frame) ex += work * .3; if (o.spring) ex += work * .45; if (o.deliv) ex += 1500;
  return { it, m, s, small, work, mat, ex, total: work + mat + ex,
    label: it.t + ", " + m.n.toLowerCase() + ", " + (small ? "1 шт." : s.n.split(" (")[0].toLowerCase()) };
}
function calcOpts() {
  return { id: $("#cType").value, mat: +$("#cMat").value, size: +$("#cSize").value, own: $("#cOwn").value === "1",
    foam: $("#xFoam").checked, frame: $("#xFrame").checked, spring: $("#xSpring").checked, deliv: $("#xDeliv").checked };
}
function calc() {
  const v = calcValue(calcOpts());
  $("#cSum").textContent = fmt(v.total);
  $("#cNote").textContent = "Работа " + fmt(v.work) + (calcOpts().own ? ", ткань ваша" : ", ткань около " + fmt(v.mat)) + (v.ex ? ", допработы " + fmt(v.ex) : "");
  return { t: v.label, p: v.total };
}
function initCalc() {
  ITEMS.forEach(i => $("#cType").add(new Option(i.t, i.id)));
  MATS.forEach((m, i) => $("#cMat").add(new Option(m.n, i)));
  SIZES.forEach((m, i) => $("#cSize").add(new Option(m.n, i)));
  $("#cSize").value = 1;
  ["#cType", "#cMat", "#cSize", "#cOwn", "#xFoam", "#xFrame", "#xSpring", "#xDeliv"].forEach(s => $(s).addEventListener("change", calc));
  calc();
  $("#cAdd").onclick = () => { const r = calc(); addLine({ k: "c" + Date.now(), t: "Расчёт: " + r.t, p: r.p }); };
}

/* ───── заявка ───── */
const PROMO_ERR = { not_found: "Такого кода нет. Проверьте написание.", expired: "Срок действия кода истёк.", not_yours: "Этот код привязан к другому клиенту.", used: "Код уже использован.", http: "Нет связи. Попробуйте ещё раз." };
const ORDER_ERR = { bad_name: "Укажите имя.", bad_phone: "Укажите телефон полностью.", bad_email: "Проверьте адрес почты.", bad_items: "Проверьте состав заявки.", limit: "Сейчас слишком много заявок. Попробуйте позже.", ...PROMO_ERR };
function cartSum() { return cart.reduce((a, l) => a + Math.round(l.p) * l.q, 0); }
function totals() {
  const sum = cartSum(), loy = KP.me ? (KP.me.level.percent || 0) : 0;
  const cp = KP.promo && KP.promo.kind === "coupon" ? (KP.promo.percent || 0) : 0, pct = Math.max(loy, cp);
  const disc = Math.floor(sum * pct / 100), afterDisc = sum - disc;
  const cert = KP.promo && KP.promo.kind === "certificate" ? Math.min(KP.promo.balance || 0, afterDisc) : 0;
  return { sum, loy, cp, pct, disc, cert, final: afterDisc - cert };
}
function addLine(l, qty = 1) {
  const e = cart.find(x => x.k === l.k); if (e) e.q += qty; else cart.push({ ...l, q: qty });
  drawCart();
  const b = $("#cnt"); if (b.animate) b.animate([{ transform: "scale(1)" }, { transform: "scale(1.4)" }, { transform: "scale(1)" }], { duration: 260 });
}
function removeLine(k) { const i = cart.findIndex(x => x.k === k); if (i >= 0) { cart.splice(i, 1); drawCart(); return true; } return false; }
function clearCart() { cart.length = 0; drawCart(); }
function drawCart() {
  const ul = $("#lines"); ul.innerHTML = "";
  if (!cart.length) ul.innerHTML = '<li class="empty" style="border:0">Пока пусто. Добавьте услугу из каталога, расчёт или попросите ассистента.</li>';
  cart.forEach((l, i) => {
    const li = document.createElement("li");
    li.innerHTML = '<span></span><span class="q"><button type="button" aria-label="Меньше">−</button><b>' + l.q + '</b><button type="button" aria-label="Больше">+</button></span>';
    li.firstChild.textContent = l.t + " — " + fmt(Math.round(l.p) * l.q);
    const [m, p] = li.querySelectorAll("button");
    m.onclick = () => { l.q--; if (l.q < 1) cart.splice(i, 1); drawCart(); }; p.onclick = () => { l.q++; drawCart(); };
    ul.appendChild(li);
  });
  const t = totals(), rows = $("#sumrows"); rows.innerHTML = "";
  const row = (a, b, cls) => { const d = document.createElement("div"); if (cls) d.className = cls; const x = document.createElement("span"), y = document.createElement("span"); x.textContent = a; y.textContent = b; d.append(x, y); rows.appendChild(d); return d; };
  if (t.disc > 0) row("Скидка " + t.pct + (t.pct === t.loy && t.loy > t.cp ? "% (ваш уровень)" : "% (промокод)"), "−" + fmt(t.disc), "g");
  if (t.cert > 0) row("Подарочный сертификат", "−" + fmt(t.cert), "g");
  if (KP.promo) { const d = row("Код " + KP.promo.code, ""); const b = document.createElement("button"); b.type = "button"; b.className = "link"; b.textContent = "Убрать"; b.onclick = () => { KP.promo = null; $("#promo").value = ""; drawCart(); }; d.lastChild.appendChild(b); }
  $("#orderSum").textContent = fmt(t.final);
  const n = cart.reduce((a, l) => a + l.q, 0); $("#cnt").textContent = n; $("#cnt").dataset.n = n;
  $("#doneBox").classList.remove("on");
}
async function applyPromo(code) {
  code = String(code || "").trim().toUpperCase(); if (!code) throw Object.assign(new Error("x"), { code: "not_found" });
  const r = await rpc("kp_code_check", { tok: KP.sess || null, cd: code });
  KP.promo = { code, kind: r.kind, percent: r.percent, balance: r.balance }; $("#promo").value = code; drawCart(); return KP.promo;
}
function orderText(f, res) {
  const rows = cart.map((l, i) => (i + 1) + ". " + l.t + " × " + l.q + " — " + fmt(Math.round(l.p) * l.q)).join("\n");
  return "Заявка №" + res.num + " на перетяжку мебели\n\nЧто нужно:\n" + rows + "\nСумма: " + fmt(res.total) + (res.discount ? "\nСкидка: −" + fmt(res.discount) : "") + (res.cert ? "\nСертификат: −" + fmt(res.cert) : "") + "\nК оплате ориентировочно: " + fmt(res.final) +
    "\n\nИмя: " + f.name + "\nТелефон: " + f.phone + (f.email ? "\nПочта: " + f.email : "") + (f.address ? "\nАдрес: " + f.address : "") + (f.comment ? "\nКомментарий: " + f.comment : "");
}
/* Отправка заявки мастерской (сохраняется на сервере). Возвращает ответ сервера. */
async function submitOrder(f) {
  if (!cart.length) throw Object.assign(new Error("x"), { code: "bad_items" });
  const items = cart.map(l => ({ t: l.t.slice(0, 200), q: l.q, p: Math.round(l.p) }));
  const res = await rpc("kp_order_create", { tok: KP.sess || null, nm: f.name, ph: f.phone, em: f.email || null, ad: f.address || null, cm: f.comment || null, items, cd: KP.promo ? KP.promo.code : null });
  const text = orderText(f, res);
  clearCart(); KP.promo = null; $("#promo").value = ""; drawCart();
  $("#doneTitle").textContent = "Заявка №" + res.num + " отправлена";
  $("#doneText").textContent = "К оплате ориентировочно " + fmt(res.final) + (res.discount ? ", скидка " + fmt(res.discount) : "") + (res.cert ? ", сертификатом списано " + fmt(res.cert) : "") + ".";
  $("#txt").textContent = text;
  $("#mailto").href = "mailto:" + KP.shop.mail + "?subject=" + encodeURIComponent("Заявка №" + res.num) + "&body=" + encodeURIComponent(text);
  $("#doneBox").classList.add("on");
  if (typeof refreshMe === "function" && KP.sess) refreshMe();
  return res;
}
function initOrder() {
  $("#promoBtn").onclick = async () => {
    const er = $("#promoErr"); er.textContent = "";
    try { await applyPromo($("#promo").value); } catch (e) { er.textContent = PROMO_ERR[e.code] || "Не удалось проверить код."; }
  };
  $("#form").addEventListener("submit", async e => {
    e.preventDefault(); const err = $("#err"); err.textContent = "";
    const f = { name: $("#fName").value.trim(), phone: $("#fPhone").value.trim(), email: $("#fMail").value.trim(), address: $("#fAddr").value.trim(), comment: $("#fNote").value.trim() };
    if (!cart.length) { err.textContent = "Добавьте в заявку хотя бы одну услугу."; return; }
    if (!f.name) { err.textContent = "Укажите имя."; $("#fName").focus(); return; }
    if (f.phone.replace(/\D/g, "").length < 10) { err.textContent = "Укажите телефон, чтобы мастер мог позвонить."; $("#fPhone").focus(); return; }
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) { err.textContent = "Проверьте адрес почты."; $("#fMail").focus(); return; }
    const b = $("#sendOrder"); b.disabled = true;
    try { await submitOrder(f); $("#doneBox").scrollIntoView({ behavior: "smooth", block: "nearest" }); }
    catch (x) { err.textContent = ORDER_ERR[x.code] || "Не удалось отправить. Проверьте интернет и попробуйте ещё раз."; }
    b.disabled = false;
  });
  $("#copy").onclick = async () => {
    const t = $("#txt").textContent, b = $("#copy");
    try { await navigator.clipboard.writeText(t); b.textContent = "Скопировано"; } catch (e) { b.textContent = "Не удалось скопировать"; }
    setTimeout(() => b.textContent = "Скопировать текст заявки", 2500);
  };
}
function prefillOrder() {
  if (!KP.me) return;
  if (!$("#fName").value) $("#fName").value = KP.me.name || "";
  if (!$("#fPhone").value && KP.me.phone) $("#fPhone").value = KP.me.phone;
  if (!$("#fMail").value) $("#fMail").value = KP.me.email || "";
}

/* ───── разделы как в приложении: свайп между экранами и нижняя панель ───── */
const TABS = ["home", "services", "reviews", "cart", "cabinet", "contacts"];
const pager = $("#pager"), tabs = [...document.querySelectorAll(".tb")];
let cur = 0;
function mark(i) {
  if (i === cur && tabs[i].getAttribute("aria-selected") === "true" && KP.tab) return;
  cur = i; KP.tab = TABS[i];
  tabs.forEach((t, j) => { t.setAttribute("aria-selected", j === i); t.tabIndex = j === i ? 0 : -1; });
  document.querySelectorAll(".panel-v").forEach((p, j) => p.setAttribute("aria-hidden", j !== i));
  (KP.hooks[TABS[i]] || []).forEach(fn => { try { fn(); } catch (e) { /* модуль не загрузился */ } });
}
function go(name, smooth = true, anchor) {
  const i = TABS.indexOf(name); if (i < 0) return;
  pager.scrollTo({ left: i * pager.clientWidth, behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" });
  mark(i);
  if (anchor) setTimeout(() => { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 350);
}
function initPager() {
  let tick = 0;
  pager.addEventListener("scroll", () => { cancelAnimationFrame(tick); tick = requestAnimationFrame(() => mark(Math.round(pager.scrollLeft / pager.clientWidth))); }, { passive: true });
  addEventListener("resize", () => pager.scrollTo({ left: cur * pager.clientWidth, behavior: "auto" }));
  tabs.forEach((t, i) => t.addEventListener("click", () => go(TABS[i])));
  document.querySelectorAll("[data-go]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); go(a.dataset.go, true, a.dataset.to); }));
  document.addEventListener("keydown", e => {
    if (e.target.closest("input,textarea,select") || e.altKey || e.ctrlKey || e.metaKey || !$("#asst").hidden) return;
    if (e.key === "ArrowRight") go(TABS[Math.min(cur + 1, TABS.length - 1)]);
    if (e.key === "ArrowLeft") go(TABS[Math.max(cur - 1, 0)]);
  });
  mark(0);
}
function initShop() {
  const s = KP.shop;
  $("#hdrPh").textContent = s.phone; $("#shopMail").textContent = s.mail; $("#shopMail2").textContent = s.mail;
  $("#shopPhone").textContent = s.phone; $("#shopAddr").textContent = s.addr; $("#shopHours").textContent = s.hours; $("#demoNote").hidden = !s.demo;
}
