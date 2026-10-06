/* Личный кабинет: вход и регистрация, уровень лояльности, купоны, сертификаты, история заявок. */
"use strict";
const AUTH_ERR = {
  bad_email: "Проверьте адрес почты.", bad_password: "Пароль должен быть не короче 8 символов.", bad_name: "Укажите имя.",
  exists: "Эта почта уже зарегистрирована. Нажмите «Вход».", limit: "Сейчас слишком много регистраций. Попробуйте позже.",
  bad_login: "Неверная почта или пароль.", locked: "Слишком много неудачных попыток. Подождите 10 минут.", http: "Нет связи. Попробуйте ещё раз.",
};
const CODE_ERR = { not_found: "Такого кода нет. Проверьте написание.", not_yours: "Этот код привязан к другому клиенту.", public_code: "Это общий промокод: введите его в заявке.", auth: "Войдите в кабинет.", http: "Нет связи. Попробуйте ещё раз." };
const LEVELS = { 1: "Постоянный клиент, скидка 3%", 3: "Серебро, скидка 5%", 5: "Золото, скидка 7%" };
let authMode = "in", certAmt = 5000;

function dateRu(ts) { return ts ? new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : ""; }
function setMode(m) {
  authMode = m;
  $("#segIn").setAttribute("aria-selected", m === "in"); $("#segUp").setAttribute("aria-selected", m === "up");
  $("#aNameL").hidden = m === "in"; $("#aSend").textContent = m === "in" ? "Войти" : "Зарегистрироваться";
  $("#aPass").autocomplete = m === "in" ? "current-password" : "new-password";
  $("#aNote").textContent = m === "in" ? "Пароль хранится в зашифрованном виде и виден только вам." : "Пароль не короче 8 символов. После регистрации вы получите скидку 5% на первый заказ.";
  $("#aErr").textContent = "";
}
function drawCabinet() {
  const me = KP.me;
  $("#cabOut").hidden = !!me; $("#cabIn").hidden = !me;
  $("#cabSub").textContent = me ? "Здравствуйте, " + me.name + ". Здесь ваши скидки, купоны и сертификаты." : "Войдите, чтобы видеть свои скидки, купоны и подарочные сертификаты.";
  if (!me) return;
  const lv = me.level || {}, nxt = lv.next;
  $("#lvName").textContent = lv.name || "Клиент"; $("#lvPct").textContent = (lv.percent || 0) + "%";
  $("#lvBar").style.width = (nxt ? Math.min(100, Math.round(me.done / nxt * 100)) : 100) + "%";
  $("#lvNote").textContent = "Выполнено заказов: " + me.done + (nxt ? ". До уровня «" + LEVELS[nxt] + "» осталось " + (nxt - me.done) + "." : ". Максимальный уровень.");
  const ul = $("#codes"); ul.innerHTML = "";
  if (!me.codes.length) { const li = document.createElement("li"); li.className = "note"; li.textContent = "Пока кодов нет. Сертификат можно добавить по его коду."; ul.appendChild(li); }
  me.codes.forEach(c => {
    const li = document.createElement("li"); li.className = "cd" + (c.kind === "certificate" ? " cert" : "");
    const t = document.createElement("div"), code = document.createElement("div"), sm = document.createElement("small"), row = document.createElement("div"), b = document.createElement("button");
    t.className = "row"; const nm = document.createElement("b"); nm.style.fontWeight = "500";
    nm.textContent = c.kind === "certificate" ? "Подарочный сертификат" : (c.note || "Скидка " + c.percent + "%");
    const bd = document.createElement("span"); bd.className = "badge" + (c.kind === "certificate" ? "" : " teal");
    bd.textContent = c.kind === "certificate" ? fmt(c.balance) : "−" + c.percent + "%"; t.append(nm, bd);
    code.className = "code"; code.textContent = c.code;
    sm.textContent = (c.kind === "certificate" ? "Остаток " + fmt(c.balance) + (c.amount ? " из " + fmt(c.amount) : "") : "") + (c.until ? (c.kind === "certificate" ? ". " : "") + "Действует до " + dateRu(c.until) : "");
    row.className = "row"; b.type = "button"; b.className = "btn ghost small"; b.textContent = "Применить в заявке";
    b.onclick = async () => { try { await applyPromo(c.code); go("cart"); } catch (e) { $("#codeErr").textContent = PROMO_ERR[e.code] || "Не удалось применить код."; } };
    row.append(sm, b); li.append(t, code, row); ul.appendChild(li);
  });
  const h = $("#hist"); h.innerHTML = "";
  if (!me.orders.length) { const li = document.createElement("li"); li.className = "st"; li.textContent = "Заявок пока нет."; h.appendChild(li); }
  me.orders.forEach(o => {
    const li = document.createElement("li"), a = document.createElement("span"), s = document.createElement("span");
    a.textContent = "№" + o.num + " от " + dateRu(o.ts) + ", " + fmt(o.final);
    s.className = "st" + (o.status === "done" ? " done" : ""); s.textContent = o.status === "done" ? "Выполнена" : "В работе"; li.append(a, s); h.appendChild(li);
  });
  if (document.activeElement !== $("#pName")) $("#pName").value = me.name || "";
  if (document.activeElement !== $("#pPhone")) $("#pPhone").value = me.phone || "";
  $("#pMail").textContent = "Почта для входа: " + me.email;
}
async function refreshMe() {
  if (!KP.sess) { KP.me = null; drawCabinet(); drawCart(); return null; }
  try {
    const r = await rpc("kp_me", { tok: KP.sess });
    if (!r) { KP.sess = ""; store("kp_sess", null); KP.me = null; } else KP.me = r;
  } catch (e) { /* нет связи: оставляем как было */ }
  drawCabinet(); drawCart(); prefillOrder(); return KP.me;
}
function setSession(tok) { KP.sess = tok; store("kp_sess", tok); }
async function logout() {
  const t = KP.sess; setSession(""); store("kp_sess", null); KP.me = null; KP.promo = null; $("#promo").value = ""; drawCabinet(); drawCart();
  if (t) { try { await rpc("kp_logout", { tok: t }); } catch (e) { /* сессия истечёт сама */ } }
}
function initCabinet() {
  $("#segIn").onclick = () => setMode("in"); $("#segUp").onclick = () => setMode("up");
  $("#authForm").addEventListener("submit", async e => {
    e.preventDefault(); const err = $("#aErr"); err.textContent = "";
    const em = $("#aMail").value.trim(), pw = $("#aPass").value, nm = $("#aName").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(em)) { err.textContent = AUTH_ERR.bad_email; $("#aMail").focus(); return; }
    if (authMode === "up" && !nm) { err.textContent = AUTH_ERR.bad_name; $("#aName").focus(); return; }
    if (authMode === "up" && pw.length < 8) { err.textContent = AUTH_ERR.bad_password; $("#aPass").focus(); return; }
    if (!pw) { err.textContent = "Введите пароль."; $("#aPass").focus(); return; }
    const b = $("#aSend"); b.disabled = true;
    try {
      const r = authMode === "in" ? await rpc("kp_login", { em, pw }) : await rpc("kp_register", { em, pw, nm });
      if (r && r.error) throw Object.assign(new Error("x"), { code: r.error });
      setSession(r.token); $("#aPass").value = ""; await refreshMe();
    } catch (x) { err.textContent = AUTH_ERR[x.code] || "Не удалось выполнить. Попробуйте ещё раз."; }
    b.disabled = false;
  });
  $("#addCodeBtn").onclick = async () => {
    const er = $("#codeErr"); er.textContent = "";
    try { await rpc("kp_code_add", { tok: KP.sess, cd: $("#addCode").value }); $("#addCode").value = ""; await refreshMe(); }
    catch (e) { er.textContent = CODE_ERR[e.code] || "Не удалось добавить код."; }
  };
  const am = $("#amts");
  [3000, 5000, 10000, 15000].forEach(v => { const b = document.createElement("button"); b.type = "button"; b.textContent = fmt(v); b.setAttribute("aria-pressed", v === certAmt); b.onclick = () => { certAmt = v; [...am.children].forEach(x => x.setAttribute("aria-pressed", x === b)); }; am.appendChild(b); });
  $("#certAdd").onclick = () => { addLine({ k: "cert" + certAmt, t: "Подарочный сертификат на " + fmt(certAmt), p: certAmt }); go("cart"); };
  $("#profForm").addEventListener("submit", async e => {
    e.preventDefault(); const er = $("#pErr"); er.textContent = "";
    try { await rpc("kp_profile_save", { tok: KP.sess, nm: $("#pName").value, ph: $("#pPhone").value }); await refreshMe(); er.textContent = "Сохранено."; }
    catch (x) { er.textContent = x.code === "bad_name" ? "Укажите имя." : "Не удалось сохранить."; }
  });
  $("#logout").onclick = logout;
  KP.onTab("cabinet", refreshMe);
  setMode("in"); drawCabinet();
}
