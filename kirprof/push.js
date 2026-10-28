/* Уведомления при закрытом приложении: сайт отдаёт приложению, за чем следить. Сам по себе в браузере ничего не делает. */
"use strict";
function pushSync() {
  try {
    if (!window.KirprofBridge || !KirprofBridge.setPush) return;
    KirprofBridge.setPush(JSON.stringify({ sb: KP.SB, key: KP.KEY, tok: KP.sess || "", ck: store("kp_ck") || "", seen: +store("kp_ck_seen") || 0, adm: store("kp_adm") || "" }));
  } catch (e) { /* не в приложении */ }
}

/* Поделиться приложением: в приложении ссылка на последнюю сборку и сайт, в браузере ссылка на эту страницу */
async function shareApp() {
  try {
    if (window.KirprofBridge && KirprofBridge.shareApp) { KirprofBridge.shareApp(); return; }
    const url = location.origin + location.pathname.replace(/[^/]*$/, ""), text = "КИРПРОФ: перетяжка и обивка мягкой мебели. Примерка ткани на вашу мебель и расчёт цены онлайн.";
    if (navigator.share) { await navigator.share({ title: "КИРПРОФ", text, url }); return; }
    await navigator.clipboard.writeText(text + " " + url); const b = document.querySelector("[data-share]"); if (b) { const t = b.textContent; b.textContent = "Ссылка скопирована"; setTimeout(() => { b.textContent = t; }, 2500); }
  } catch (e) { /* отменили */ }
}
document.addEventListener("click", e => { if (e.target.closest("[data-share]")) shareApp(); });
