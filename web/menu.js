/* Меню (как в VK): все разделы и сервисы в одном месте, в настройках — только настройки.
   Плавающий значок ассистента, жест «назад» и лента историй сверху (как в Telegram). */
"use strict";

const MI = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5.5A1.5 1.5 0 015.5 4H8M16 4h2.5A1.5 1.5 0 0120 5.5V8M20 16v2.5a1.5 1.5 0 01-1.5 1.5H16M8 20H5.5A1.5 1.5 0 014 18.5V16"/><path d="M8 9h8M8 12h8M8 15h5"/></svg>',
  megaphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4a1 1 0 001 1h2l6 4V5L7 9H5a1 1 0 00-1 1z"/><path d="M17 9a4 4 0 010 6"/></svg>',
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
};

const Menu = {
  render() {
    const box = $("#tabMenu"); if (!box) return;
    box.innerHTML = "";
    const tile = (bg, icon, label, onclick, badge) => h("button", { class: "mn-tile", onclick },
      h("span", { class: "mn-ico", style: { background: bg }, html: icon }), h("span", { class: "mn-lbl" }, label),
      badge ? h("i", { class: "mn-badge" }, badge > 99 ? "99+" : String(badge)) : null);
    const section = (title, ...tiles) => h("section", { class: "mn-sec" }, h("div", { class: "mn-cap" }, title), h("div", { class: "mn-grid" }, ...tiles.filter(Boolean)));
    const tasks = Tasks.active().length, unseen = Stories.order().unseen.length;
    box.append(
      h("button", { class: "mn-profile", onclick: () => showTab("settings") }, avatarEl(S.me.id, "lg"),
        h("div", { class: "mid" }, h("b", null, S.me.name), h("small", null, "Профиль и настройки")), h("span", { class: "chev", html: MI.chev })),
      section("Сервисы",
        tile("#4F6BED", I.bot, "Ассистент", () => Assistant.open()),
        tile("#2E9E62", I.ticks, "Мои задачи", () => Tasks.open(), tasks),
        tile("#D9466F", MI.film, "Видеоредактор", () => VideoEditor.open()),
        tile("#D98A1E", MI.scan, "Сканер → PDF", () => Camera.open("doc")),
        tile("#8A57D6", I.story, "Истории и статусы", () => showTab("stories"), unseen),
        tile("#14919B", I.video, "Видеочат семьи", () => GroupCall.start(FAMILY_CHAT, true))),
      section("Общение",
        tile("#3E7BE6", MI.compass, "Группы и каналы", () => Joins.directory()),
        tile("#3E7BE6", I.group, "Создать группу", () => newGroupSheet()),
        tile("#3E7BE6", MI.megaphone, "Создать канал", () => Channels.create()),
        tile("#2E9E62", I.invite, "Пригласить в семью", () => showTab("invite"))),
      S.isAdmin ? section("Администратор",
        tile("#5F6B7A", I.shield, "Участники", () => membersAdmin()),
        tile("#5F6B7A", I.key, "Сброс пароля", () => adminResetSheet()),
        tile("#5F6B7A", I.bell, "Мгновенные оповещения", () => FcmSetup.sheet())) : null,
      section("Приложение",
        tile("#5F6B7A", I.download, "Обновления", () => Updates.sheet(), Updates.latest ? 1 : 0),
        tile("#5F6B7A", I.info, "О приложении", () => Tg.aboutSheet()),
        tile("#5F6B7A", I.gear, "Настройки", () => showTab("settings"))),
    );
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
  attach(view, onBack, { both = false, edge = 0 } = {}) {
    let x0 = 0, y0 = 0, dx = 0, active = false, decided = false, horiz = false;
    const reset = () => { view.style.transition = "transform .2s, opacity .2s"; view.style.transform = ""; view.style.opacity = ""; setTimeout(() => { view.style.transition = ""; }, 220); };
    view.addEventListener("touchstart", (e) => {
      if (e.touches.length > 1) { active = false; return; }
      const t = e.touches[0];
      if (edge && t.clientX > edge) return;
      if (e.target.closest("input, textarea, [data-noswipe], .task-filters, .msg .bubble, .reactions")) return;
      x0 = t.clientX; y0 = t.clientY; dx = 0; active = true; decided = false; horiz = false;
    }, { passive: true });
    view.addEventListener("touchmove", (e) => {
      if (!active) return;
      const t = e.touches[0], ddx = t.clientX - x0, ddy = t.clientY - y0;
      if (!decided) {
        if (Math.abs(ddx) < 12 && Math.abs(ddy) < 12) return;
        decided = true; horiz = Math.abs(ddx) > Math.abs(ddy) * 1.5 && (both || ddx > 0);
        if (!horiz) { active = false; return; }
      }
      dx = both ? ddx : Math.max(0, ddx);
      view.style.transform = `translateX(${dx}px)`; view.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / innerWidth));
    }, { passive: true });
    const end = () => {
      if (!active) return; active = false;
      if (!horiz) return;
      if (Math.abs(dx) > 90) {
        view.style.transition = "transform .18s ease-in, opacity .18s";
        view.style.transform = `translateX(${dx > 0 ? 100 : -100}%)`; view.style.opacity = "0";
        setTimeout(() => onBack(), 170);
      } else reset();
    };
    view.addEventListener("touchend", end); view.addEventListener("touchcancel", end);
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
