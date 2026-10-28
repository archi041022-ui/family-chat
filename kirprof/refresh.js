/* Потяни вниз, чтобы обновить: работает в каждом разделе сайта и в кабинете мастера.
   Тянем от верха раздела: появляется кружок, отпустили после порога — данные раздела загружаются заново,
   а приложение заодно проверяет, не вышла ли новая версия. */
"use strict";
const PTR = { busy: false, el: null };
function ptrEl() {
  if (PTR.el) return PTR.el;
  const e = document.createElement("div"); e.className = "ptr"; e.setAttribute("aria-hidden", "true");
  e.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 11-2.6-5.9M20 4v5h-5"/></svg>'; document.body.appendChild(e); return (PTR.el = e);
}
function ptrDraw(p) { const e = ptrEl(); e.style.opacity = Math.min(1, p / 50); e.style.transform = "translate(-50%," + (p - 36) + "px) rotate(" + (p * 4) + "deg)"; e.classList.remove("spin"); }
function ptrHide() { const e = ptrEl(); e.classList.remove("spin"); e.style.opacity = 0; e.style.transform = "translate(-50%,-40px)"; }
async function ptrRun(fn) {
  if (PTR.busy) return; PTR.busy = true;
  const e = ptrEl(); e.style.opacity = 1; e.style.transform = "translate(-50%,24px)"; e.classList.add("spin");
  try { try { if (window.KirprofBridge && KirprofBridge.checkUpdate) KirprofBridge.checkUpdate(false); } catch (x) { /* не в приложении */ }
    await Promise.all([Promise.resolve().then(fn).catch(() => {}), new Promise(r => setTimeout(r, 800))]); } finally { ptrHide(); PTR.busy = false; }
}
function ptrAttach(scroller, onRefresh) {
  let y0 = 0, x0 = 0, pull = 0, on = false;
  scroller.addEventListener("touchstart", ev => {
    if (PTR.busy || ev.touches.length !== 1 || scroller.scrollTop > 0 || ev.target.closest("canvas,input,textarea,select,.leaflet-container,.devbox,.asst")) { on = false; return; }
    y0 = ev.touches[0].clientY; x0 = ev.touches[0].clientX; on = true; pull = 0;
  }, { passive: true });
  scroller.addEventListener("touchmove", ev => {
    if (!on) return;
    const dy = ev.touches[0].clientY - y0, dx = ev.touches[0].clientX - x0;
    if (pull === 0 && Math.abs(dx) > Math.abs(dy)) { on = false; return; }          // это свайп между разделами
    if (scroller.scrollTop > 0 || dy <= 0) { if (pull) { pull = 0; ptrHide(); } if (dy <= 0) on = dy === 0 ? on : false; return; }
    pull = Math.min(110, dy * 0.5); if (ev.cancelable) ev.preventDefault(); ptrDraw(pull);
  }, { passive: false });
  const end = () => { if (!on) return; on = false; if (pull >= 55) ptrRun(onRefresh); else ptrHide(); pull = 0; };
  scroller.addEventListener("touchend", end); scroller.addEventListener("touchcancel", end);
}
/* Сайт: у каждого раздела свои данные */
function initPtr() {
  const handlers = {
    home: () => loadSettings(), services: () => loadSettings(), fit: () => FIT.refreshCat && FIT.refreshCat(),
    reviews: () => loadReviews(), cart: () => refreshMe(), cabinet: () => refreshMe(), contacts: () => loadSettings(),
  };
  document.querySelectorAll(".panel-v").forEach(p => ptrAttach(p, () => { const h = handlers[KP.tab]; return h && h(); }));
  /* версия приложения и ручная проверка обновлений (только внутри приложения) */
  if (window.KirprofBridge && KirprofBridge.appVersion) {
    const v = $("#appVer"); if (v) { v.hidden = false; $("#appVerTxt").textContent = "Приложение, версия " + KirprofBridge.appVersion(); $("#appUpd").onclick = () => KirprofBridge.checkUpdate(true); }
  }
}
