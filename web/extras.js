/* Видео-кружочки, геолокация и управление участниками (для администратора). */
"use strict";

// ───────────── Видео-кружок: показ ─────────────
function videoNoteEl(url) {
  const v = h("video", { src: url || "", playsinline: true, muted: true, loop: true, autoplay: true, preload: "metadata" });
  v.muted = true;
  const ring = h("i", { class: "vnote-progress" });
  const icon = h("span", { class: "vnote-sound", html: I.mute });
  const box = h("div", { class: "vnote" }, v, ring, icon);
  // без звука крутится по кругу; касание — сначала и со звуком, ещё касание — пауза
  box.addEventListener("click", (e) => {
    e.stopPropagation();
    if (v.muted) { v.muted = false; v.loop = false; v.currentTime = 0; v.play().catch(() => {}); box.classList.add("playing"); icon.innerHTML = I.speaker; }
    else if (v.paused) { v.play().catch(() => {}); box.classList.add("playing"); }
    else { v.pause(); box.classList.remove("playing"); }
  });
  v.addEventListener("timeupdate", () => {
    if (!v.muted && v.duration && isFinite(v.duration)) ring.style.setProperty("--p", (v.currentTime / v.duration) * 100 + "%");
  });
  v.addEventListener("ended", () => {
    v.muted = true; v.loop = true; v.currentTime = 0; v.play().catch(() => {});
    box.classList.remove("playing"); icon.innerHTML = I.mute; ring.style.setProperty("--p", "0%");
  });
  return box;
}

// ───────────── Видео-кружок: запись ─────────────
const VideoNote = {
  MAX_SEC: 60,
  close: null,
  async open() {
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) { toast("Запись видео не поддерживается на этом устройстве"); return; }
    if (Calls.pc || Calls.ui || GroupCall.active) { toast("Сначала завершите звонок"); return; }
    const chatId = S.current; if (!chatId) return;
    this.facing = this.facing || "user";
    const preview = h("video", { autoplay: true, playsinline: true, muted: true });
    preview.muted = true;
    const circle = h("div", { class: "vn-circle" }, preview, h("i", { class: "vn-ring" }));
    const time = h("div", { class: "vn-time" }, "0:00");
    const hint = h("div", { class: "vn-hint" }, "Нажмите на кнопку — запись до 1 минуты");
    const rec = h("button", { class: "vr-rec", title: "Записать" }, h("i"));
    const cancel = h("button", { class: "icon-btn vn-cancel", title: "Отмена", html: I.close });
    const flip = h("button", { class: "icon-btn vn-flip", title: "Сменить камеру", html: I.flip });
    const root = h("div", { class: "vnote-rec" }, h("div", { class: "vn-top" }, cancel, time, flip), circle, hint, h("div", { class: "vn-bottom" }, rec));
    document.body.append(root);
    let stream = null, mr = null, chunks = [], t0 = 0, tick = null, cancelled = false;
    const stopStream = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; };
    const finish = () => {
      clearInterval(tick); stopStream(); root.remove(); VideoNote.close = null;
    };
    this.close = () => { cancelled = true; try { if (mr && mr.state !== "inactive") mr.stop(); } catch { /* */ } finish(); };
    cancel.onclick = () => this.close();
    const startCam = async () => {
      stopStream();
      try {
        const got = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: this.facing, width: { ideal: 640 }, height: { ideal: 640 }, aspectRatio: { ideal: 1 }, frameRate: { ideal: 30, max: 30 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled || !root.isConnected) { got.getTracks().forEach((t) => t.stop()); return; }   // закрыли, пока шёл запрос доступа — камеру не держим
        stream = got;
        preview.srcObject = stream; preview.classList.toggle("mirror", this.facing === "user");
      } catch { toast("Нет доступа к камере или микрофону"); finish(); }
    };
    flip.onclick = async () => { if (mr?.state === "recording") return; this.facing = this.facing === "user" ? "environment" : "user"; await startCam(); };
    rec.onclick = () => {
      if (!stream) return;
      if (mr?.state === "recording") { mr.stop(); return; }
      const types = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      try { mr = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 900_000, audioBitsPerSecond: 64_000 }); }
      catch { mr = new MediaRecorder(stream); }
      chunks = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = async () => {
        clearInterval(tick);
        if (cancelled) return;
        const type = (mr.mimeType || mime || "video/webm").split(";")[0];
        const blob = new Blob(chunks, { type });
        const dur = (Date.now() - t0) / 1000;
        finish();
        if (dur < 1 || !blob.size) { toast("Слишком короткое видео"); return; }
        if (S.current !== chatId) { S.current = null; await openChat(chatId); }
        toast("Отправляю видеосообщение…");
        const ext = type.includes("mp4") ? "mp4" : "webm";
        await sendFile(new File([blob], `Кружок.${ext}`, { type }), { asType: "video_note" });
      };
      mr.start(1000); t0 = Date.now();
      root.classList.add("is-rec"); hint.textContent = "Нажмите ещё раз, чтобы отправить";
      tick = setInterval(() => {
        const sec = (Date.now() - t0) / 1000;
        time.textContent = fmtDur(sec);
        circle.style.setProperty("--p", Math.min(100, (sec / this.MAX_SEC) * 100) + "%");
        if (sec >= this.MAX_SEC && mr.state === "recording") mr.stop();
      }, 200);
    };
    await startCam();
  },
};

// ───────────── Геолокация ─────────────
function parseGeo(body) {
  const m = String(body || "").match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*;\s*acc=(\d+))?/);
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, acc: m[3] ? +m[3] : null };
}
function mapCard(lat, lon, acc) {
  // карта из плиток OpenStreetMap: точка — в центре
  const Z = 16, T = 256, W = 260, H = 150;
  const n = 2 ** Z;
  const xf = ((lon + 180) / 360) * n;
  const yf = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  const px = xf * T, py = yf * T;
  const left = px - W / 2, top = py - H / 2;
  const tiles = h("div", { class: "map-tiles" });
  for (let tx = Math.floor(left / T); tx <= Math.floor((left + W) / T); tx++) {
    for (let ty = Math.floor(top / T); ty <= Math.floor((top + H) / T); ty++) {
      tiles.append(h("img", { src: `https://tile.openstreetmap.org/${Z}/${((tx % n) + n) % n}/${ty}.png`, alt: "", loading: "lazy",
        style: { left: `${tx * T - left}px`, top: `${ty * T - top}px` } }));
    }
  }
  const yandex = `https://yandex.ru/maps/?pt=${lon},${lat}&z=17&l=map`;
  const google = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  return h("div", { class: "map-card" },
    h("a", { class: "map-view", href: yandex, target: "_blank", rel: "noopener" }, tiles, h("i", { class: "map-pin", html: I.pin }), h("small", { class: "map-attr" }, "© OpenStreetMap")),
    h("div", { class: "map-info" },
      h("b", null, "📍 Геолокация"),
      h("small", null, `${lat.toFixed(5)}, ${lon.toFixed(5)}${acc ? ` · точность ±${acc} м` : ""}`),
      h("div", { class: "map-links" },
        h("a", { href: yandex, target: "_blank", rel: "noopener" }, "Яндекс Карты"),
        h("a", { href: google, target: "_blank", rel: "noopener" }, "Google Карты"))));
}
function getPosition(timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("unsupported")); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout, maximumAge: 30000 });
  });
}
async function sendLocation() {
  const chatId = S.current; if (!chatId) return;
  toast("Определяю местоположение…", 6000);
  let pos;
  try { pos = await getPosition(); }
  catch (e) {
    toast(e?.code === 1 ? "Нет разрешения на геолокацию — разрешите доступ к местоположению в настройках" :
      e?.message === "unsupported" ? "Геолокация не поддерживается" : "Не удалось определить местоположение. Включите GPS и попробуйте снова", 5000);
    return;
  }
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const { latitude: lat, longitude: lon, accuracy } = pos.coords;
  let close;
  close = sheet([
    h("h3", null, "Отправить геолокацию?"),
    mapCard(lat, lon, Math.round(accuracy)),
    h("button", { class: "btn wide", style: { marginTop: "12px" }, onclick: async () => {
      close();
      if (S.current !== chatId) { S.current = null; await openChat(chatId); }
      await postMessage({ media_type: "location", body: `${lat.toFixed(6)},${lon.toFixed(6)};acc=${Math.round(accuracy)}` });
    } }, "Отправить"),
  ]);
}

// ───────────── Управление участниками (администратор) ─────────────
async function membersAdmin() {
  if (!S.isAdmin) return;                                // только администратор (сервер проверяет ещё раз)
  await loadProfiles();
  let close;
  const people = [...S.profiles.values()].filter((p) => p.id !== S.me.id).sort((a, b) => (a.banned - b.banned) || a.name.localeCompare(b.name, "ru"));
  const rows = people.map((p) => h("div", { class: `admin-row${p.banned ? " banned" : ""}` },
    avatarEl(p.id, "sm"),
    h("div", { class: "mid" }, h("b", null, p.name), h("small", null, p.banned ? "⛔ В чёрном списке" : (S.online.has(p.id) ? "в сети" : seenText(p) || "участник"))),
    h("button", { class: "icon-btn", title: "Действия", html: I.gear, onclick: () => { close(); memberActions(p); } })));
  close = sheet([
    h("h3", null, "Управление участниками"),
    h("p", { class: "sheet-note" }, `В семье ${people.length + 1} ${plural(people.length + 1, "человек", "человека", "человек")}. Нажмите на шестерёнку, чтобы заблокировать или удалить участника.`),
    ...(rows.length ? rows : [h("p", { class: "empty-chat" }, "Других участников пока нет")]),
  ]);
}
async function memberActions(p) {
  let close;
  const act = async (fn, args, okText) => {
    const { data, error } = await S.sb.rpc(fn, args);
    if (error || data !== "OK") { toast(data === "NOT_ADMIN" ? "Это может только администратор" : data === "SELF" ? "Нельзя применить к себе" : "Не получилось, попробуйте ещё раз"); return false; }
    toast(okText); await loadProfiles(); renderChatList(); Stories.renderAll(); return true;
  };
  close = sheet([
    h("div", { class: "profile-card" }, avatarEl(p.id, "lg"), h("h3", null, p.name), p.banned ? h("small", { style: { color: "var(--danger)" } }, "⛔ В чёрном списке") : null),
    p.banned
      ? h("button", { class: "menu-item", onclick: async () => { if (await act("admin_set_ban", { target: p.id, ban: false }, `${p.name} разблокирован(а)`)) close(); } },
          h("span", { html: I.shield }), "Убрать из чёрного списка")
      : h("button", { class: "menu-item danger", onclick: () => { close(); confirmSheet(`Заблокировать ${p.name}?`,
          "Человек сразу потеряет доступ к перепискам и не сможет войти. Его сообщения останутся. Разблокировать можно в любой момент.",
          "Заблокировать", () => act("admin_set_ban", { target: p.id, ban: true }, `${p.name} в чёрном списке`)); } },
          h("span", { html: I.shield }), "Добавить в чёрный список"),
    h("button", { class: "menu-item", onclick: () => { close(); adminResetFor(p); } }, h("span", { html: I.key }), "Сбросить пароль"),
    h("button", { class: "menu-item danger", onclick: () => { close(); confirmSheet(`Удалить ${p.name} из семьи?`,
      "Аккаунт будет удалён навсегда вместе с его сообщениями и историями. Отменить это нельзя. Если человек может вернуться, лучше добавьте его в чёрный список.",
      "Удалить навсегда", async () => { if (await act("admin_delete_user", { target: p.id }, `${p.name} удалён(а) из семьи`)) { S.profiles.delete(p.id); await loadChats(); renderChatList(); } }); } },
      h("span", { html: I.trash }), "Удалить из семьи"),
    h("p", { class: "sheet-note", style: { marginTop: "10px" } }, "Чтобы удалённый или заблокированный не зарегистрировался заново, смените код приглашения во вкладке «Пригласить»."),
  ]);
}
function confirmSheet(title, text, okLabel, onOk) {
  let close;
  close = sheet([
    h("h3", null, title), h("p", { class: "sheet-note" }, text),
    h("div", { class: "confirm-row" },
      h("button", { class: "btn ghost", onclick: () => close() }, "Отмена"),
      h("button", { class: "btn danger", onclick: async (e) => { e.target.disabled = true; await onOk(); close(); } }, okLabel)),
  ]);
}
