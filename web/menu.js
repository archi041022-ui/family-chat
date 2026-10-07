/* Меню (как в VK): все разделы и сервисы в одном месте, в настройках — только настройки.
   Плавающий значок ассистента, жест «назад» и лента историй сверху (как в Telegram). */
"use strict";

const MI = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5.5A1.5 1.5 0 015.5 4H8M16 4h2.5A1.5 1.5 0 0120 5.5V8M20 16v2.5a1.5 1.5 0 01-1.5 1.5H16M8 20H5.5A1.5 1.5 0 014 18.5V16"/><path d="M8 9h8M8 12h8M8 15h5"/></svg>',
  megaphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4a1 1 0 001 1h2l6 4V5L7 9H5a1 1 0 00-1 1z"/><path d="M17 9a4 4 0 010 6"/></svg>',
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8S10.5 3.5 8 4.5 9 8 12 8zM12 8s1.5-4.5 4-3.5S15 8 12 8z"/></svg>',
  sticker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2h6.5z"/><path d="M12.5 20c0-4.5 3-7.5 7.5-7.5"/><path d="M9 10h.01M15 10h.01M9 14.5s1 1.5 3 1.5"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5h11a1 1 0 011 1v16l-6.5-4-6.5 4v-16a1 1 0 011-1z"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-4.5v-6h-5v6H5a1 1 0 01-1-1z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
};

const Menu = {
  render() {
    const box = $("#tabMenu"); if (!box) return;
    box.innerHTML = "";
    const tile = (bg, icon, label, onclick, badge, glow) => {
      const ico = h("span", { class: "mn-ico", html: icon }); ico.style.setProperty("--c", bg);      // свой цвет у каждого значка
      return h("button", { class: `mn-tile${glow ? " glow" : ""}`, onclick }, ico, h("span", { class: "mn-lbl" }, label),
        badge ? h("i", { class: "mn-badge" }, badge > 99 ? "99+" : String(badge)) : null, h("span", { class: "mn-chev", html: MI.chev }));
    };
    const section = (title, ...tiles) => h("section", { class: "mn-sec" }, h("div", { class: "mn-cap" }, title), h("div", { class: "mn-grid" }, ...tiles.filter(Boolean)));
    const tasks = Tasks.active().length, unseen = Stories.order().unseen.length, canCreate = S.isAdmin || !S.me.lim_create;
    box.append(...[                                    // пустые разделы (например, «Администратор») не выводим
      h("button", { class: "mn-profile", onclick: () => showTab("settings") }, avatarEl(S.me.id, "lg"),
        h("div", { class: "mid" }, h("b", null, S.me.name), h("small", null, "Профиль и настройки")), h("span", { class: "chev", html: MI.chev })),
      section("Сервисы",
        tile("#4F6BED", I.bot, "Ассистент", () => Assistant.open()),
        tile("#2E9E62", I.ticks, "Мои задачи", () => Tasks.open(), tasks),
        tile("#E5A00D", MI.gift, "Подарки", () => Gifts.open()),
        tile("#D9466F", MI.sticker, "Стикеры", () => Stickers.store()),
        tile("#D9466F", MI.film, "Видеоредактор", () => VideoEditor.open()),
        tile("#D98A1E", MI.scan, "Сканер → PDF", () => Camera.open("doc")),
        tile("#D98A1E", MI.scan, "Рукопись → текст", () => { const u = "https://claude.ai/artifact/TMjFqbaBXai4QhsVFvT5PW"; Lock.ext = true; if (window.AndroidBridge?.openUrl) window.AndroidBridge.openUrl(u); else window.open(u, "_blank", "noopener"); }),
        tile("#8A57D6", I.story, "Истории и статусы", () => showTab("stories"), unseen),
        ),
      section("Общение",
        tile("#3E7BE6", MI.compass, "Группы и каналы", () => Joins.directory()),
        canCreate ? tile("#3E7BE6", I.group, "Создать группу", () => newGroupSheet()) : null,
        canCreate ? tile("#3E7BE6", MI.megaphone, "Создать канал", () => Channels.create()) : null,
        tile("#2E9E62", I.invite, "Пригласить в семью", () => showTab("invite"))),
      S.isAdmin ? section("Администратор",
        tile("#C0392B", I.shield, "Панель управления", () => AdminPanel.open()),
        tile("#5F6B7A", I.shield, "Участники", () => membersAdmin()),
        tile("#5F6B7A", I.key, "Сброс пароля", () => adminResetSheet()),
        tile("#5F6B7A", I.bell, "Мгновенные оповещения", () => FcmSetup.sheet()),
        tile("#5F6B7A", MI.film, "GIF: ключ GIPHY", () => Gifs.adminSheet()),
        tile("#5F6B7A", I.phone, "Сервер звонков", () => Ice.adminSheet())) : null,
      section("Настройки",
        tile("#5F6B7A", I.gear, "Настройки", () => showTab("settings")),
        tile("#3E4A5A", MI.lock, "Конфиденциальность", () => Privacy.sheet()),
        tile("#5F6B7A", I.bell, "Уведомления", () => Tg.notifSheet()),
        window.AndroidBridge ? null : tile("#E0457B", I.bell, "Оповещения на устройстве", () => WebPush.sheet())),
      section("Приложение",
        tile(Updates.latest ? "#E5603A" : "#5F6B7A", I.download, Updates.latest ? "Обновить" : "Обновления", () => Updates.sheet(), Updates.latest ? 1 : 0, !!Updates.latest),
        tile("#5F6B7A", I.info, "О приложении", () => Tg.aboutSheet())),
    ].filter(Boolean));
  },
};

// ───────── Плавающий ассистент ─────────
// Маленький значок у края экрана: перетаскивается пальцем, прилипает к краю, в покое полупрозрачный.
const AsstFab = {
  el: null, SIZE: 42,
  enabled() { return Prefs.get("asstFab") !== false; },
  init() {
    if (this.el || !S.me) return;
    const el = this.el = h("button", { class: "asst-fab assistant-item", title: "Ассистент", "aria-label": "Ассистент", html: I.bot });
    document.body.append(el);
    let pos = null; try { pos = JSON.parse(localStorage.getItem("asstFab") || "null"); } catch { /* */ }
    this.pos = pos || { side: "right", y: 0.5 };
    this.place();
    let sx = 0, sy = 0, ox = 0, oy = 0, drag = false, down = false;
    el.addEventListener("pointerdown", (e) => {
      down = true; drag = false; sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
      el.setPointerCapture(e.pointerId); this.wake();
    });
    el.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!drag && Math.hypot(dx, dy) < 7) return;
      drag = true; el.classList.add("dragging");
      const [x, y] = this.clamp(ox + dx, oy + dy);
      el.style.left = x + "px"; el.style.top = y + "px"; el.style.right = "auto";
    });
    const up = (e) => {
      if (!down) return; down = false; el.classList.remove("dragging");
      if (!drag) { Assistant.open(); return; }
      const r = el.getBoundingClientRect();
      this.pos = { side: r.left + this.SIZE / 2 < innerWidth / 2 ? "left" : "right", y: Math.max(0, Math.min(1, r.top / innerHeight)) };
      try { localStorage.setItem("asstFab", JSON.stringify(this.pos)); } catch { /* */ }
      this.place(); this.wake();
    };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    addEventListener("resize", () => this.place());
    setInterval(() => this.sync(), 400);
    this.sync(); this.wake();
  },
  clamp(x, y) {
    const top = 70, bottom = innerHeight - this.SIZE - 84;
    return [Math.max(6, Math.min(innerWidth - this.SIZE - 6, x)), Math.max(top, Math.min(bottom, y))];
  },
  place() {
    if (!this.el) return;
    const [x, y] = this.clamp(this.pos.side === "left" ? 8 : innerWidth - this.SIZE - 8, this.pos.y * innerHeight);
    this.el.style.left = x + "px"; this.el.style.top = y + "px"; this.el.style.right = "auto";
  },
  wake() { this.el?.classList.remove("idle"); clearTimeout(this.idleT); this.idleT = setTimeout(() => this.el?.classList.add("idle"), 2500); },
  // прячем, когда значок мешает: открыт ассистент, звонок, история, камера, редактор, клавиатура
  sync() {
    if (!this.el) return;
    const kb = window.visualViewport && window.visualViewport.height < innerHeight * 0.72;
    const busy = !S.me || !this.enabled() || S.assistantOpen || kb ||
      document.querySelector(".call, .story-viewer, .ve-root, .camera, .video-rec, .vnote-rec, .lightbox, .welcome, .lock-screen, .auth, .sheet-back");
    this.el.classList.toggle("hidden", !!busy);
  },
};

// ───────── Жест «назад» ─────────
// Ведите пальцем по экрану — экран уезжает вслед за пальцем; отпустили дальше 90 px — закрывается.
const SwipeBack = {
  EASE: "cubic-bezier(.22,.8,.3,1)",
  attach(view, onBack, { both = false, edge = 0 } = {}) {
    let x0 = 0, y0 = 0, dx = 0, active = false, decided = false, horiz = false, raf = 0, t0 = 0, lastX = 0, lastT = 0, vx = 0;
    const paint = () => {
      raf = 0;
      view.style.transform = `translate3d(${dx}px,0,0)`; view.style.opacity = String(1 - Math.min(0.45, Math.abs(dx) / innerWidth * 0.7));
    };
    const reset = () => {
      view.style.transition = `transform .26s ${this.EASE}, opacity .26s ${this.EASE}`; view.style.transform = ""; view.style.opacity = "";
      setTimeout(() => { view.style.transition = ""; view.style.willChange = ""; }, 280);
    };
    view.addEventListener("touchstart", (e) => {
      if (e.touches.length > 1) { active = false; return; }
      const t = e.touches[0];
      if (edge && t.clientX > edge) return;
      if (e.target.closest("input, textarea, [data-noswipe], .task-filters, .msg .bubble, .reactions")) return;
      x0 = t.clientX; y0 = t.clientY; dx = 0; vx = 0; active = true; decided = false; horiz = false; lastX = x0; lastT = t0 = performance.now();
    }, { passive: true });
    view.addEventListener("touchmove", (e) => {
      if (!active) return;
      const t = e.touches[0], ddx = t.clientX - x0, ddy = t.clientY - y0;
      if (!decided) {
        if (Math.abs(ddx) < 10 && Math.abs(ddy) < 10) return;
        decided = true; horiz = Math.abs(ddx) > Math.abs(ddy) * 1.5 && (both || ddx > 0);
        if (!horiz) { active = false; return; }
        x0 = t.clientX; view.style.transition = "none"; view.style.willChange = "transform, opacity";   // отсчёт с места, где жест распознан: без рывка
        lastX = x0; return;
      }
      const now = performance.now(), cx = t.clientX - x0;
      if (now - lastT > 0) vx = 0.8 * vx + 0.2 * ((t.clientX - lastX) / (now - lastT));    // скорость, px/мс (сглаженная)
      lastX = t.clientX; lastT = now;
      dx = both ? cx : Math.max(0, cx);
      if (!raf) raf = requestAnimationFrame(paint);
    }, { passive: true });
    const end = () => {
      if (!active) return; active = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (!horiz) return;
      const fast = Math.abs(vx) > 0.6 && Math.abs(dx) > 60 && (both || vx > 0);        // быстрый «бросок» тоже закрывает
      if (Math.abs(dx) > Math.min(110, innerWidth * 0.3) || fast) {
        const dir = both && dx < 0 ? -1 : 1;
        view.style.transition = `transform .22s ${this.EASE}, opacity .22s ${this.EASE}`;
        view.style.transform = `translate3d(${dir * 100}%,0,0)`; view.style.opacity = "0";
        setTimeout(() => onBack(), 200);
      } else reset();
    };
    view.addEventListener("touchend", end); view.addEventListener("touchcancel", end);
  },
};

// ───────── Свайп между разделами главного экрана: Меню ↔ Чаты ↔ Контакты ↔ Звонки ─────────
const TabSwipe = {
  ORDER: ["menu", "chats", "contacts", "calls"],
  // внутри горизонтально прокручиваемых элементов (истории, папки, чипы) жест принадлежит им
  inScroller(el, root) {
    for (let n = el; n && n !== root; n = n.parentElement) {
      if (n.matches?.("input, textarea, select, [data-noswipe], .story-top, .folders, .task-filters, .asst-fab")) return true;
      if (n.scrollWidth > n.clientWidth + 4) { const ox = getComputedStyle(n).overflowX; if (ox === "auto" || ox === "scroll") return true; }
    }
    return false;
  },
  blocked() {
    return !!(document.querySelector(".sheet-back, .call:not(.mini), .ve-root, .camera, .video-rec, .vnote-rec, .lightbox, .story-viewer, .scan-editor, .gift-reveal, .welcome, .lock-screen, .auth") || $(".topbar.searching"));
  },
  FOLDERS: ["all", "personal", "groups", "unread"],
  /** Внутри раздела «Чаты» свайп листает папки: Все ↔ Личные ↔ Группы ↔ Непрочитанные; с краёв — к соседним разделам. */
  folderStep(dir) {
    if ((S.tab || "chats") !== "chats") return null;
    const k = this.FOLDERS.indexOf(S.folder || "all"), n = k + dir;
    return n >= 0 && n < this.FOLDERS.length ? this.FOLDERS[n] : null;
  },
  go(dir) {
    const f = this.folderStep(dir);
    if (f) {
      S.folder = f; renderChatList();
      const list = $("#chatItems"); if (list) { list.classList.remove("slide-l", "slide-r"); void list.offsetWidth; list.classList.add(dir > 0 ? "slide-l" : "slide-r"); setTimeout(() => list.classList.remove("slide-l", "slide-r"), 260); }
      return true;
    }
    const i = this.ORDER.indexOf(S.tab || "chats"); if (i < 0) return false;
    const to = this.ORDER[i + dir]; if (!to) return false;
    showTab(to);
    const body = $("#tab" + to[0].toUpperCase() + to.slice(1));
    if (body) { body.classList.remove("slide-l", "slide-r"); void body.offsetWidth; body.classList.add(dir > 0 ? "slide-l" : "slide-r"); setTimeout(() => body.classList.remove("slide-l", "slide-r"), 260); }
    return true;
  },
  attach(root) {
    if (!root || root._tabSwipe) return; root._tabSwipe = true;
    let x0 = 0, y0 = 0, t0 = 0, active = false, decided = false, horiz = false, dx = 0, body = null, raf = 0, can = false, vx = 0, lx = 0, lt = 0;
    const EASE = "cubic-bezier(.22,.8,.3,1)";
    // палец ведёт содержимое почти один в один; на краю (дальше листать некуда) — с сопротивлением
    const paint = () => { raf = 0; if (!body) return; const k = can ? 0.92 : 0.22; body.style.transform = `translate3d(${dx * k}px,0,0)`; body.style.opacity = String(1 - Math.min(0.45, Math.abs(dx) / innerWidth * 0.7)); };
    root.addEventListener("touchstart", (e) => {
      active = false;
      if (e.touches.length > 1 || this.ORDER.indexOf(S.tab || "chats") < 0 || this.blocked()) return;
      if (this.inScroller(e.target, root)) return;
      const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; t0 = lt = Date.now(); lx = x0; vx = 0; dx = 0; active = true; decided = false; horiz = false;
      const cur = S.tab || "chats"; body = $("#tab" + cur[0].toUpperCase() + cur.slice(1));
      if (body) { body.getAnimations?.().forEach((an) => an.cancel()); body.classList.remove("slide-l", "slide-r"); }
    }, { passive: true });
    root.addEventListener("touchmove", (e) => {
      if (!active) return;
      const t = e.touches[0], ddx = t.clientX - x0, ddy = t.clientY - y0;
      if (!decided) {
        if (Math.abs(ddx) < 10 && Math.abs(ddy) < 10) return;
        decided = true; horiz = Math.abs(ddx) > Math.abs(ddy) * 1.5;
        if (!horiz) { active = false; return; }
        x0 = t.clientX; lx = x0; if (body) { body.style.transition = "none"; body.style.willChange = "transform, opacity"; }   // без рывка в начале жеста
        return;
      }
      const now = Date.now(); dx = t.clientX - x0;
      if (now > lt) { vx = vx * 0.3 + ((t.clientX - lx) / (now - lt)) * 0.7; lx = t.clientX; lt = now; }   // сглаженная скорость, px/мс
      const i = this.ORDER.indexOf(S.tab || "chats"); can = !!(this.folderStep(dx < 0 ? 1 : -1) || this.ORDER[i + (dx < 0 ? 1 : -1)]);
      if (!raf) raf = requestAnimationFrame(paint);
    }, { passive: true });
    const end = () => {
      if (!active) return; active = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      const b = body; if (!b) return;
      const settle = () => { b.style.transition = ""; b.style.transform = ""; b.style.opacity = ""; b.style.willChange = ""; };
      const dir = dx < 0 ? 1 : -1;
      const commit = horiz && can && (Math.abs(dx) > Math.min(72, innerWidth * 0.18) || (Math.abs(vx) > 0.3 && Math.abs(dx) > 26));
      if (!commit) {                                           // вернуть на место мягко
        b.style.transition = `transform .26s ${EASE}, opacity .26s`; b.style.transform = "translate3d(0,0,0)"; b.style.opacity = "";
        setTimeout(settle, 280); return;
      }
      // дотолкнуть уходящий экран по инерции и сразу показать следующий, без «отскока назад»
      const left = Math.max(120, Math.min(220, (innerWidth - Math.abs(dx)) / Math.max(0.6, Math.abs(vx) + 0.4)));
      b.style.transition = `transform ${Math.round(left) * 0.9}ms ease-out, opacity ${Math.round(left) * 0.9}ms ease-out`;
      b.style.transform = `translate3d(${-dir * innerWidth * 0.5}px,0,0)`; b.style.opacity = "0";
      setTimeout(() => { settle(); this.go(dir); }, Math.round(left) * 0.9);
    };
    root.addEventListener("touchend", end); root.addEventListener("touchcancel", end);
  },
};

// лента историй вверху: при прокрутке списка сворачивается, наверху — снова видна
const StoryTop = {
  attach(list, strip) {
    if (!list || !strip || list._storyTop) return; list._storyTop = true;
    let last = 0;
    list.addEventListener("scroll", () => {
      const y = list.scrollTop;
      if (y > 40 && y > last) strip.classList.add("collapsed");
      else if (y < 8) strip.classList.remove("collapsed");
      last = y;
    }, { passive: true });
  },
};


// ───────── Поиск значком в левом верхнем углу ─────────
const TopSearch = {
  open() {
    showTab("chats");
    const box = $("#topSearch"); if (!box) return;
    box.classList.remove("hidden"); box.parentNode.classList.add("searching");
    const i = $("#chatSearch"); setTimeout(() => i?.focus(), 30);
  },
  close() {
    const box = $("#topSearch"); if (!box || box.classList.contains("hidden")) return;
    box.classList.add("hidden"); box.parentNode.classList.remove("searching");
    const i = $("#chatSearch"); if (i && i.value) { i.value = ""; S.filter = ""; renderChatList(); }
  },
};

// ───────── Избранное: сохранённые сообщения (чат с самим собой) ─────────
const Saved = {
  id: null,
  is(chatId) { const c = S.chats.find((x) => x.id === chatId); return !!c && String(c.dm_key || "").startsWith("saved:"); },
  async ensure() {
    const c = S.chats.find((x) => String(x.dm_key || "") === "saved:" + S.me.id);
    if (c) return (this.id = c.id);
    const { data, error } = await S.sb.rpc("saved_chat");
    if (error || !data) { toast("Не удалось открыть «Избранное»"); return null; }
    await loadChats(); renderChatList(); return (this.id = data);
  },
  async open() { const id = await this.ensure(); if (id) openChat(id); },
  async add(m) {
    const id = await this.ensure(); if (!id) return;
    const author = S.profiles.get(m.user_id)?.name;
    const head = m.user_id !== S.me.id && author ? `↪️ Переслано от ${Privacy.can(m.user_id, "forwards") ? author : "Скрытый пользователь"}\n` : "";
    const text = m.body ? Tg.text(m.body) : "";
    const body = Stickers.isSticker(m) ? STICKER_MARK : (head + (text || "")).trim() || null;
    const r = await postMessage({ body, media_path: m.media_path || null, media_type: m.media_type || null, media_name: m.media_name || null }, id);
    if (r) toast("🔖 Сохранено в «Избранное»");
  },
};

// ───────── Голосовые по очереди ─────────
// Одновременно играет только одно голосовое (или кружок); когда оно закончилось — включается следующее.
const VoiceQueue = {
  init() {
    if (this.on) return; this.on = true;
    document.addEventListener("play", (e) => {
      const el = e.target;
      if (!(el instanceof HTMLMediaElement) || !el.closest(".messages")) return;
      for (const x of document.querySelectorAll(".messages audio, .messages video")) if (x !== el && !x.paused) x.pause();
    }, true);
    document.addEventListener("ended", (e) => {
      const el = e.target;
      if (!(el instanceof HTMLAudioElement) || !el.closest(".messages")) return;
      const all = [...document.querySelectorAll(".messages audio")];
      const next = all[all.indexOf(el) + 1];
      if (next) { try { next.currentTime = 0; } catch { /* */ } next.play().catch(() => {}); next.closest(".msg")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    }, true);
  },
};
VoiceQueue.init();

// ───────── Свернуть звонок ─────────
// В приложении — маленькое окно поверх чатов (можно двигать, нажать — развернуть).
// На Android при выходе из приложения во время видеозвонка — окно «картинка в картинке».
const MiniCall = {
  toggle(ui) {
    if (!ui) return;
    const mini = !ui.classList.contains("mini");
    ui.classList.toggle("mini", mini);
    if (mini) {
      ui.style.left = ""; ui.style.top = "";
      if (!ui._miniBound) {
        ui._miniBound = true;
        let sx, sy, ox, oy, moved = false, down = false;
        ui.addEventListener("pointerdown", (e) => {
          if (!ui.classList.contains("mini")) return;
          down = true; moved = false; sx = e.clientX; sy = e.clientY; const r = ui.getBoundingClientRect(); ox = r.left; oy = r.top;
        });
        ui.addEventListener("pointermove", (e) => {
          if (!down || !ui.classList.contains("mini")) return;
          const dx = e.clientX - sx, dy = e.clientY - sy; if (!moved && Math.hypot(dx, dy) < 8) return;
          moved = true; ui.style.left = Math.max(4, Math.min(innerWidth - ui.offsetWidth - 4, ox + dx)) + "px"; ui.style.top = Math.max(4, Math.min(innerHeight - ui.offsetHeight - 4, oy + dy)) + "px"; ui.style.right = "auto"; ui.style.bottom = "auto";
        });
        ui.addEventListener("pointerup", (e) => {
          if (!down) return; down = false;
          if (ui.classList.contains("mini") && !moved && !e.target.closest(".cbtn.red")) MiniCall.toggle(ui);    // нажали — развернуть
        });
      }
    } else { ui.style.left = ui.style.top = ui.style.right = ui.style.bottom = ""; }
  },
  // Android: переход в «картинку в картинке» и обратно
  onPip(on) { document.body.classList.toggle("pip", !!on); },
};
window.onPip = (on) => MiniCall.onPip(on);
