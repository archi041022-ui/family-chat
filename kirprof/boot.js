/* Запуск сайта: порядок важен, ошибка одного модуля не должна ломать остальные. */
"use strict";
(function () {
  const run = f => { try { f(); } catch (e) { console.error(e); } };
  run(initFabrics); run(drawFilters); run(drawGrid); run(initCalc); run(initOrder); run(drawCart); run(initShop);
  run(initCabinet); run(initMap); run(initAssistant); run(initPager);
  run(() => { if (typeof loadReviews === "function") loadReviews(); });
  run(() => { if (KP.sess) refreshMe(); });
  run(() => { const h = location.hash.replace("#", ""); if (TABS.includes(h)) go(h, false); });
})();
