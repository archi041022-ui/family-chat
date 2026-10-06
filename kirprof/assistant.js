/* Голосовой ассистент: понимает команды по-русски (без внешних ИИ-сервисов), ведёт по сайту, собирает и отправляет заявку. */
"use strict";
const AS = { pending: null, last: null, open: false, speak: true, rec: null, listening: false };
const NUMW = { один: 1, одну: 1, одна: 1, одного: 1, два: 2, две: 2, пару: 2, пара: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8 };
const STEMS = [["corner", /углов/], ["sofa", /диван|софа|кушетк/], ["arm", /кресл/], ["chair", /стул/], ["pouf", /пуф|банкетк/], ["bed", /изголов|кроват/]];
const MATW = [[0, /рогожк/], [1, /велюр/], [2, /шенил/], [3, /жаккард/], [4, /экокож/], [5, /натуральн\w* кож|кожа|кожи|кожу/]];
const NAVW = [
  ["contacts", /карт|маршрут|добрать|добраться|проехать|контакт|адрес|где наход|как найти/],
  ["cabinet", /кабинет|скидк|купон|сертификат|войти|вход|регистрац|бонус/],
  ["reviews", /отзыв/],
  ["services", /калькулятор|услуг|каталог|прайс|цены|расценк/],
  ["cart", /корзин|заявк|мой заказ/],
  ["home", /главн|домой|в начало|сначала/],
];
const NAVSAY = { contacts: "Открыл контакты и карту. Могу построить маршрут: нажмите «от меня» или введите адрес.", cabinet: "Открыл личный кабинет.", reviews: "Открыл отзывы.", services: "Открыл услуги.", cart: "Открыл заявку.", home: "Открыл главную." };
const norm = s => String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[«»"]/g, " ");

function say(text, who = "bot", acts) {
  const box = $("#aMsgs"), d = document.createElement("div"); d.className = "am " + who; d.textContent = text;
  if (acts && acts.length) { const a = document.createElement("div"); a.className = "acts"; acts.forEach(([t, f]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = t; b.onclick = () => { a.remove(); f(); }; a.appendChild(b); }); d.appendChild(a); }
  box.appendChild(d); box.scrollTop = box.scrollHeight;
  if (who === "bot") speakText(text);
  return d;
}
function chips(list) {
  const c = $("#aChips"); c.innerHTML = "";
  list.forEach(t => { const b = document.createElement("button"); b.type = "button"; b.textContent = t; b.onclick = () => handle(t); c.appendChild(b); });
}
const CHIPS_MAIN = ["Что ты умеешь?", "Собери заказ", "Сколько стоит диван", "Как добраться", "Мои скидки"];

/* ───── голос ───── */
function ruVoices() { return ("speechSynthesis" in window ? speechSynthesis.getVoices() : []).filter(v => /^ru/i.test(v.lang)); }
function fillVoices() {
  const sel = $("#aVoice"), vs = ruVoices(), saved = store("kp_voice");
  sel.innerHTML = "";
  if (!vs.length) { sel.add(new Option("Голос по умолчанию", "")); $("#aSetNote").textContent = "На этом устройстве нет русских голосов. Установите голос в настройках системы."; return; }
  vs.forEach(v => sel.add(new Option(v.name + (v.localService ? "" : " (онлайн)"), v.voiceURI)));
  if (saved && vs.some(v => v.voiceURI === saved)) sel.value = saved;
  $("#aSetNote").textContent = "Доступно голосов: " + vs.length + ". Выбор запоминается.";
}
function speakText(t) {
  if (!AS.speak || !("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(t).replace(/₽/g, " рублей").replace(/\n+/g, ". ")); u.lang = "ru-RU";
    const v = ruVoices().find(x => x.voiceURI === $("#aVoice").value); if (v) u.voice = v;
    u.rate = +$("#aRate").value || 1; speechSynthesis.speak(u);
  } catch (e) { /* без озвучки */ }
}
function setSpeak(on) { AS.speak = on; store("kp_speak", on ? "1" : "0"); $("#aSpeak").setAttribute("aria-pressed", on); if (!on && "speechSynthesis" in window) speechSynthesis.cancel(); }
function initVoice() {
  AS.speak = store("kp_speak") !== "0"; $("#aSpeak").setAttribute("aria-pressed", AS.speak);
  const r = +store("kp_rate"); if (r >= .7 && r <= 1.4) $("#aRate").value = r;
  if ("speechSynthesis" in window) { fillVoices(); speechSynthesis.addEventListener && speechSynthesis.addEventListener("voiceschanged", fillVoices); }
  else { $("#aSpeak").hidden = true; $("#aSetNote").textContent = "Озвучка не поддерживается этим браузером."; }
  $("#aSpeak").onclick = () => setSpeak(!AS.speak);
  $("#aGear").onclick = () => { $("#aSet").hidden = !$("#aSet").hidden; };
  $("#aVoice").onchange = () => { store("kp_voice", $("#aVoice").value); speakText("Здравствуйте, я помощник мастерской."); };
  $("#aRate").onchange = () => { store("kp_rate", $("#aRate").value); };
  $("#aTest").onclick = () => { const was = AS.speak; AS.speak = true; speakText("Здравствуйте. Я помогу выбрать услугу и оформить заявку."); AS.speak = was; };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $("#aMic").hidden = true; return; }
  $("#aMic").onclick = () => {
    if (AS.listening && AS.rec) { AS.rec.stop(); return; }
    try {
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      const r = new SR(); r.lang = "ru-RU"; r.interimResults = false; r.maxAlternatives = 1; AS.rec = r;
      r.onstart = () => { AS.listening = true; $("#aMic").classList.add("rec"); $("#aText").placeholder = "Слушаю…"; };
      r.onend = () => { AS.listening = false; $("#aMic").classList.remove("rec"); $("#aText").placeholder = "Скажите или напишите команду"; };
      r.onerror = e => { say(e.error === "not-allowed" ? "Нет доступа к микрофону. Разрешите его в браузере или пишите текстом." : "Не расслышал. Нажмите на микрофон и повторите."); };
      r.onresult = e => { const t = e.results[0][0].transcript; handle(t); };
      r.start();
    } catch (e) { say("Не получилось включить микрофон. Пишите текстом."); }
  };
}

/* ───── разбор речи ───── */
function amountOf(t) {
  let m = t.match(/(\d[\d\s]*(?:[.,]\d+)?)\s*(тысяч\w*|тыс\.?|к(?![а-яa-z0-9]))/);
  if (m) return Math.round(parseFloat(m[1].replace(/\s/g, "").replace(",", ".")) * 1000);
  m = t.match(/(\d[\d\s]{2,})\s*(?:руб|р(?![а-яa-z0-9])|₽)?/); if (m) { const n = parseInt(m[1].replace(/\s/g, ""), 10); if (n >= 500) return n; }
  m = t.match(/(\d{3,})/); return m ? parseInt(m[1], 10) : 0;
}
function qtyBefore(t, idx) {
  const head = t.slice(Math.max(0, idx - 24), idx).trim().split(/\s+/).slice(-2);
  for (let i = head.length - 1; i >= 0; i--) { const w = head[i]; if (/^\d{1,2}$/.test(w)) return +w; if (NUMW[w]) return NUMW[w]; }
  const after = t.slice(idx).match(/^\S+\s*(?:x|х|×)\s*(\d{1,2})/); if (after) return +after[1];
  return 1;
}
function findItems(t) {
  const out = [], used = new Set();
  STEMS.forEach(([id, re]) => {
    const g = new RegExp(re.source, "g"); let m;
    while ((m = g.exec(t))) {
      if (id === "sofa" && out.some(o => o.id === "corner" && Math.abs(o.at - m.index) < 14)) continue;
      if (used.has(m.index)) continue; used.add(m.index);
      out.push({ id, at: m.index, q: qtyBefore(t, m.index) });
    }
  });
  // "угловой диван": убрать диван, стоящий рядом с угловым
  return out.sort((a, b) => a.at - b.at).filter((o, i, arr) => !(o.id === "sofa" && arr.some(x => x.id === "corner" && Math.abs(x.at - o.at) < 14)));
}
function findOpts(t, id) {
  const o = { id, mat: 0, size: 1, own: false, foam: false, frame: false, spring: false, deliv: false };
  MATW.forEach(([i, re]) => { if (re.test(t)) o.mat = i; });
  if (/(свою|своя|моя|мою|своей|свой) ткан|ткань (своя|заказчика)|без ткани/.test(t)) o.own = true;
  if (/маленьк|малый|малого|двухмест|2-?мест/.test(t)) o.size = 0;
  if (/больш|угловой|угловог|от 250|трехмест/.test(t) || id === "corner") o.size = 2;
  if (/стандарт|средн/.test(t)) o.size = 1;
  o.foam = /поролон|набивк/.test(t); o.frame = /каркас/.test(t); o.spring = /пружин/.test(t); o.deliv = /доставк|привез|вывоз/.test(t);
  return o;
}
function lineFor(it, t) {
  const hasMat = MATW.some(([, re]) => re.test(t)), o = findOpts(t, it.id);
  if (!hasMat && !/своя|свою|моя|мою|свой|своей|размер|больш|маленьк|поролон|каркас|пружин|доставк/.test(t)) {
    return { k: "i" + it.id, t: ITEMS.find(i => i.id === it.id).t + " (" + FABRICS[fab].n + ")", p: ITEMS.find(i => i.id === it.id).p };
  }
  const v = calcValue(o);
  return { k: "a" + it.id + "-" + [o.mat, o.size, +o.own, +o.foam, +o.frame, +o.spring, +o.deliv].join(""), t: v.label, p: Math.round(v.total) };
}
function cartSay() {
  if (!cart.length) return "В заявке пока пусто.";
  const t = totals();
  return "В заявке:\n" + cart.map(l => "• " + l.t + " × " + l.q + " — " + fmt(Math.round(l.p) * l.q)).join("\n") + "\nСумма " + fmt(t.sum) + (t.disc ? ", скидка " + fmt(t.disc) : "") + (t.cert ? ", сертификат " + fmt(t.cert) : "") + ". К оплате " + fmt(t.final) + ".";
}
function suggestBudget(budget) {
  const base = ITEMS.map(i => ({ id: i.id, t: i.t, p: Math.round(calcValue({ id: i.id }).total) }));
  const max = base.map(b => Math.min(b.id === "chair" ? 8 : 2, Math.floor(budget / b.p)));
  let best = null;
  (function rec(i, cnt, sum) {
    if (i === base.length) { if (sum > 0 && (!best || sum > best.sum || (sum === best.sum && cnt.reduce((a, c) => a + c, 0) < best.n))) best = { cnt: cnt.slice(), sum, n: cnt.reduce((a, c) => a + c, 0) }; return; }
    for (let c = 0; c <= max[i]; c++) { if (sum + c * base[i].p > budget) break; cnt[i] = c; rec(i + 1, cnt, sum + c * base[i].p); }
    cnt[i] = 0;
  })(0, [], 0);
  return best && { base, best };
}
function nameOf(t0) { const m = String(t0).match(/(?:меня зовут|имя|зовут)\s+([А-Яа-яЁёA-Za-z\- ]{2,30})/i); return m ? m[1].trim().replace(/\s+(телефон|номер|почта).*$/i, "") : ""; }
function phoneOf(t0) { const m = String(t0).match(/(\+?\d[\d\s\-()]{9,}\d)/); return m && m[1].replace(/\D/g, "").length >= 10 ? m[1].trim() : ""; }
const YES = /^(да|давай|ок|окей|отправляй|отправь|подтверждаю|верно|конечно|угу|согласен|согласна|хорошо)(?![а-яa-z0-9])/, NO = /^(нет|не надо|отмена|отмени|стоп|не нужно|неа)(?![а-яa-z0-9])/;

/* ───── оформление и отправка ───── */
function orderForm() { return { name: $("#fName").value.trim(), phone: $("#fPhone").value.trim(), email: $("#fMail").value.trim(), address: $("#fAddr").value.trim(), comment: $("#fNote").value.trim() }; }
async function checkoutStep(ctx) {
  const f = orderForm();
  if (ctx.name) f.name = ctx.name; if (ctx.phone) f.phone = ctx.phone;
  if (!f.name && KP.me) f.name = KP.me.name || ""; if (!f.phone && KP.me && KP.me.phone) f.phone = KP.me.phone;
  if (!cart.length) { AS.pending = null; say("Заявка пустая. Скажите, что перетянуть, например «добавь два стула и диван».", "bot"); chips(CHIPS_MAIN); return; }
  if (!f.name) { AS.pending = { step: "name", ctx: { ...ctx } }; say("Как вас зовут?"); return; }
  if (f.phone.replace(/\D/g, "").length < 10) { AS.pending = { step: "phone", ctx: { ...ctx, name: f.name } }; say("Назовите телефон, чтобы мастер мог позвонить."); return; }
  $("#fName").value = f.name; $("#fPhone").value = f.phone;
  AS.pending = { step: "confirm", ctx: { ...ctx, name: f.name, phone: f.phone } };
  say(cartSay() + "\n\nИмя: " + f.name + ", телефон: " + f.phone + ".\nОтправить заявку мастерской? Скажите «да» или «нет».", "bot", [["Да, отправить", () => handle("да")], ["Нет", () => handle("нет")]]);
}
async function doSend(ctx) {
  const f = orderForm(); f.name = ctx.name || f.name; f.phone = ctx.phone || f.phone; AS.pending = null;
  try {
    const r = await submitOrder(f);
    go("cart", true); say("Готово. Заявка №" + r.num + " отправлена. К оплате ориентировочно " + fmt(r.final) + ". Мастерская свяжется с вами по телефону " + f.phone + ".");
    chips(["Как добраться", "Мои скидки"]);
  } catch (e) { say((ORDER_ERR[e.code] || "Не удалось отправить. Проверьте интернет и повторите.") + " Заявка осталась в корзине.", "bot", [["Повторить", () => handle("отправь заказ")]]); }
}

/* ───── главный обработчик ───── */
async function handle(raw) {
  const text = String(raw || "").trim(); if (!text) return;
  say(text, "me"); $("#aText").value = "";
  const t = norm(text).replace(/[!?.,;]+/g, " ").replace(/\s+/g, " ").trim();
  if (/^(стоп|хватит|замолчи|тихо|помолчи)$/.test(t)) { if ("speechSynthesis" in window) speechSynthesis.cancel(); AS.pending = null; return; }
  if (/^(закрой|закрыть|выйди|пока|до свидания|спасибо пока)( ассистент\w*)?$/.test(t)) { closeAsst(); return; }
  const P = AS.pending;
  if (P) {
    if (NO.test(t) || /(отмен|передумал)/.test(t)) { AS.pending = null; say("Хорошо, отменил. Заявка осталась в корзине."); chips(CHIPS_MAIN); return; }
    if (P.step === "name") { const nm = nameOf(text) || text.replace(/^(это|я)\s+/i, "").trim(); if (nm.length < 2 || /\d/.test(nm)) { say("Назовите, пожалуйста, имя."); return; } return checkoutStep({ ...P.ctx, name: nm.slice(0, 40) }); }
    if (P.step === "phone") { const ph = phoneOf(text) || (text.replace(/\D/g, "").length >= 10 ? text : ""); if (!ph) { say("Не понял номер. Назовите цифрами, не меньше десяти."); return; } return checkoutStep({ ...P.ctx, phone: ph }); }
    if (P.step === "confirm") { if (YES.test(t)) return doSend(P.ctx); say("Скажите «да», чтобы отправить, или «нет», чтобы отменить."); return; }
    if (P.step === "addcalc") { if (YES.test(t)) { addLine(AS.last.line); AS.pending = null; say("Добавил в заявку.\n" + cartSay(), "bot", [["Оформить заказ", () => handle("оформи заказ")]]); return; } AS.pending = null; }
    if (P.step === "addbudget") { if (YES.test(t)) { P.items.forEach(([l, q]) => addLine(l, q)); AS.pending = null; say("Добавил.\n" + cartSay(), "bot", [["Оформить заказ", () => handle("оформи заказ")]]); return; } AS.pending = null; }
  }
  // оформление
  if (/(оформи|оформить|отправ|подтверди|заверши|закончи)\w* ?(заказ|заявк)?/.test(t) && /(оформ|отправ|подтверд|заверш|закон)/.test(t) && /(заказ|заявк|все|это|корзин)/.test(t)) {
    go("cart"); return checkoutStep({ name: nameOf(text), phone: phoneOf(text) });
  }
  // промокод
  const pm = text.match(/(?:промокод|промо-код|купон|код|сертификат)\w*\s+([A-Za-zА-Яа-я0-9\-]{4,24})/i);
  if (pm && /примен|введи|использ|вставь|добав|код/.test(t) && /[A-Za-z0-9\-]/.test(pm[1])) {
    try { const r = await applyPromo(pm[1]); say(r.kind === "certificate" ? "Сертификат применён, остаток " + fmt(r.balance) + "." : "Промокод применён: скидка " + r.percent + "%.\n" + cartSay()); go("cart"); }
    catch (e) { say(PROMO_ERR[e.code] || "Не удалось проверить код."); }
    return;
  }
  // бюджет
  if (/бюджет|на сумму|в пределах|не дороже|не больше|уложить|до \d|на \d/.test(t) && amountOf(t) >= 1000 && !/добав|закаж/.test(t.replace(/на сумму|уложить/g, ""))) {
    const b = amountOf(t), s = suggestBudget(b);
    if (!s) { say("За " + fmt(b) + " ничего не получится: самая небольшая услуга, перетяжка стула, стоит около " + fmt(calcValue({ id: "chair" }).total) + "."); return; }
    const items = [], parts = [];
    s.best.cnt.forEach((c, i) => { if (c) { const it = ITEMS[i]; items.push([{ k: "i" + it.id, t: it.t + " (" + FABRICS[fab].n + ")", p: s.base[i].p }, c]); parts.push(it.t.toLowerCase() + " × " + c + " — " + fmt(s.base[i].p * c)); } });
    AS.pending = { step: "addbudget", items };
    say("На " + fmt(b) + " могу предложить:\n• " + parts.join("\n• ") + "\nИтого около " + fmt(s.best.sum) + " при рогожке и стандартном размере. Добавить в заявку?", "bot", [["Да, добавить", () => handle("да")], ["Нет", () => handle("нет")]]);
    return;
  }
  // очистить / убрать
  if (/(очисти|очистить|удали все|убери все|опусти|сбрось)\w* ?(корзин|заявк|все)?/.test(t) && /(корзин|заявк|все)/.test(t) && /(очист|удали|убери|сброс)/.test(t)) { clearCart(); say("Заявка очищена."); return; }
  const its = findItems(t);
  if (/(убери|удали|выкини|без)(?![а-яa-z0-9])/.test(t) && its.length) {
    let n = 0; its.forEach(o => { cart.filter(l => l.k.includes(o.id)).forEach(l => { removeLine(l.k); n++; }); });
    say(n ? "Убрал.\n" + cartSay() : "Этого нет в заявке."); return;
  }
  // сумма / что в корзине
  if (/(что в (корзин|заявк)|покажи (корзин|заявк)|сколько (получилось|всего|выйдет|к оплате)|итого|общая сумма|посчитай (все|заказ|корзин)|сумма заказ)/.test(t)) { say(cartSay(), "bot", cart.length ? [["Оформить заказ", () => handle("оформи заказ")]] : null); return; }
  const wantsPrice = /сколько (стоит|будет|выйдет|возьмете|берете)|рассчитай|посчитай|расчет|стоимост|цена|цену|почем/.test(t);
  const wantsAdd = /добав|закаж|заказать|хочу|нужн|нужен|надо|собери|положи|возьми|перетян|обить|обив|оформи/.test(t);
  if (its.length && wantsPrice && !wantsAdd) {
    const o = findOpts(t, its[0].id), v = calcValue(o);
    $("#cType").value = o.id; $("#cMat").value = o.mat; $("#cSize").value = o.size; $("#cOwn").value = o.own ? "1" : "0";
    $("#xFoam").checked = o.foam; $("#xFrame").checked = o.frame; $("#xSpring").checked = o.spring; $("#xDeliv").checked = o.deliv; calc();
    const q = its[0].q, line = { k: "c" + Date.now(), t: "Расчёт: " + v.label, p: Math.round(v.total) };
    AS.last = { line, q };
    say(v.it.t + ", " + v.m.n.toLowerCase() + (v.small ? "" : ", " + v.s.n.split(" (")[0].toLowerCase()) + (q > 1 ? " × " + q : "") + ": около " + fmt(v.total * q) + ". Работа " + fmt(v.work) + (o.own ? ", ткань ваша" : ", ткань около " + fmt(v.mat)) + (v.ex ? ", допработы " + fmt(v.ex) : "") + ". Добавить в заявку?", "bot", [["Да, добавить", () => handle("да")], ["Нет", () => handle("нет")]]);
    AS.last.line.q = q; AS.pending = { step: "addcalc" };
    return;
  }
  if (its.length && (wantsAdd || !wantsPrice)) {
    its.forEach(o => addLine(lineFor(o, t), o.q));
    go("cart", true);
    say("Добавил в заявку.\n" + cartSay(), "bot", [["Оформить заказ", () => handle("оформи заказ")], ["Добавить ещё", () => say("Что ещё добавить?")]]);
    chips(["Оформи заказ", "Покажи сумму", "Применить промокод"]); return;
  }
  // навигация
  if (/(открой|покажи|перейди|зайди|перейти|давай|хочу|где|как|на |в )/.test(" " + t) || t.split(" ").length <= 3) {
    for (const [tab, re] of NAVW) if (re.test(t)) {
      if (tab === "services" && /калькулятор|рассчитат/.test(t)) { go("services", true, "calc"); say("Открыл калькулятор. Можно сказать, например, «сколько стоит угловой диван из велюра»."); return; }
      go(tab, true); say(NAVSAY[tab]); if (tab === "contacts" && /маршрут|добраться|проехать/.test(t)) setTimeout(() => { const r = $("#routeMe"); if (r) r.focus(); }, 400);
      return;
    }
  }
  // совет по выбору
  if (/(посоветуй|помоги|что выбрать|какую ткань|какая ткань|подскажи|выбор|выбрать|подобрать)/.test(t)) {
    let a = "Подскажу по ткани.\n• Дети и животные: экокожа или микровелюр. Легко мыть, когти не затягивают нитки.\n• Каждый день и много людей: жаккард или шенилл, они плотные и долго не вытираются.\n• Уют и мягкость: велюр.\n• Бюджетно: рогожка.\n• Максимум на годы: натуральная кожа, но дороже в 2 раза.";
    if (/дет|ребен|малыш/.test(t)) a = "С детьми лучше экокожа или микровелюр: пятна вытираются влажной тряпкой.";
    else if (/кошк|собак|животн|кот(?![а-яa-z0-9])|питомц/.test(t)) a = "С животными берите микровелюр или экокожу: когти не цепляются, шерсть легко убирается.";
    else if (/кухн/.test(t)) a = "Для кухни подойдёт экокожа: не впитывает запахи и легко моется.";
    say(a + "\nСкажите, что перетягиваем и какой бюджет, соберу заказ.", "bot", [["Собери заказ на 20 тысяч", () => handle("собери заказ на 20 тысяч")]]); chips(CHIPS_MAIN); return;
  }
  if (/(собери|собрать|составь|подбери).*(заказ|заявк)|^(собери|помоги)(?![а-яa-z0-9])/.test(t)) {
    say("Скажите, что нужно перетянуть и в каком количестве, например «диван и два кресла», или назовите бюджет: «собери заказ на 25 тысяч».", "bot"); chips(["Диван и два кресла", "Заказ на 25 тысяч", "Шесть стульев"]); return;
  }
  if (/(что (ты )?умеешь|что можешь|помощь|команды|как пользоваться|как тебя)/.test(t)) {
    say("Я умею:\n• открывать разделы: услуги, отзывы, заявка, кабинет, контакты;\n• считать стоимость: «сколько стоит диван из велюра»;\n• собирать заказ: «добавь два стула и кресло» или «собери заказ на 25 тысяч»;\n• применять промокод: «примени код ОСЕНЬ10»;\n• оформить и отправить заявку: «оформи заказ»;\n• показать дорогу: «как добраться».", "bot"); chips(CHIPS_MAIN); return;
  }
  if (/^(привет|здравствуй|добрый|доброе|добрый день|хай|салют)/.test(t)) { say("Здравствуйте! Чем помочь: рассчитать стоимость, собрать и отправить заказ или показать дорогу?"); chips(CHIPS_MAIN); return; }
  if (/^(спасибо|благодарю)/.test(t)) { say("Пожалуйста. Обращайтесь."); return; }
  say("Не уверен, что понял. Могу открыть раздел, посчитать цену, собрать заказ или показать дорогу.", "bot"); chips(CHIPS_MAIN);
}

function openAsst() {
  AS.open = true; $("#asst").hidden = false; $("#afab").setAttribute("aria-expanded", true);
  if (!$("#aMsgs").children.length) { say("Здравствуйте! Я помощник КИРПРОФ. Помогу выбрать услугу, посчитать стоимость, собрать и отправить заявку. Говорите или пишите."); chips(CHIPS_MAIN); }
  setTimeout(() => $("#aText").focus(), 50);
}
function closeAsst() { AS.open = false; $("#asst").hidden = true; if ("speechSynthesis" in window) speechSynthesis.cancel(); if (AS.rec && AS.listening) try { AS.rec.stop(); } catch (e) { /* уже остановлено */ } $("#afab").focus(); }
function initAssistant() {
  initVoice();
  $("#afab").onclick = openAsst; $("#aClose").onclick = closeAsst;
  $("#asst").addEventListener("click", e => { if (e.target === $("#asst")) closeAsst(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && AS.open) closeAsst(); });
  $("#aForm").addEventListener("submit", e => { e.preventDefault(); handle($("#aText").value); });
  window.KPAsst = { handle, AS, openAsst, closeAsst, suggestBudget, findItems };
}
