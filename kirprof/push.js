/* Уведомления при закрытом приложении: сайт отдаёт приложению, за чем следить. Сам по себе в браузере ничего не делает. */
"use strict";
function pushSync() {
  try {
    if (!window.KirprofBridge || !KirprofBridge.setPush) return;
    KirprofBridge.setPush(JSON.stringify({ sb: KP.SB, key: KP.KEY, tok: KP.sess || "", ck: store("kp_ck") || "", seen: +store("kp_ck_seen") || 0, adm: store("kp_adm") || "" }));
  } catch (e) { /* не в приложении */ }
}
