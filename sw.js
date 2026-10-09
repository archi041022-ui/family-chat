// Служба оповещений «Семьи»: показывает оповещение, когда приходит push от сервера,
// даже если приложение закрыто (iPhone с экрана «Домой», Chrome, Firefox).
// Текст приходит зашифрованным и расшифровывается самим устройством.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { try { d = { b: e.data.text() }; } catch { /* */ } }
  const call = d.k === "call";
  e.waitUntil(self.registration.showNotification(d.t || "Семья", {
    body: d.b || "Новое в «Семье»",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: d.c ? "chat-" + d.c : (d.k || "semya"),   // новое сообщение в том же чате заменяет прежнее
    renotify: true,
    requireInteraction: call,
    data: { c: d.c || "" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const chat = (e.notification.data && e.notification.data.c) || "";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of all) {
      if ("focus" in w) { await w.focus(); w.postMessage({ type: "open", chat }); return; }
    }
    await self.clients.openWindow("./" + (chat ? "?chat=" + encodeURIComponent(chat) : ""));
  })());
});
