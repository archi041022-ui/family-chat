/* v2.5: панель «Ассистент · Задачи · Семья» сверху, обновление свайпом вниз, сообщения после одобрения,
   заявки на вступление в приватные группы и каналы, реакции во время видеозвонка. */
"use strict";

// ───────────── Панель быстрого доступа над списком чатов ─────────────
const QuickBar = {
  el() {
    const fam = S.chats.find((c) => c.id === FAMILY_CHAT);
    const famUnread = fam ? S.unread.get(fam.id) || 0 : 0;
    const tasks = Tasks.active().length;
    const overdue = Tasks.active().filter((t) => t.due_at && new Date(t.due_at) < new Date()).length;
    const pill = (cls, icon, label, badge, onclick, extra = {}) => h("button", { class: `chat-item quick-pill ${cls}`, onclick, ...extra },
      h("span", { class: "qp-ico" }, icon), h("span", { class: "name" }, label),
      badge ? h("i", { class: `qp-badge${extra.muted ? " muted" : ""}` }, badge > 99 ? "99+" : badge) : null);
    return h("div", { class: "quick-bar" },
      pill(`tasks-item${S.tasksOpen ? " on" : ""}`, "✅", "Задачи", overdue || tasks, () => Tasks.open(), { muted: !overdue }),
      fam ? pill(`family-pill${S.current === fam.id ? " on" : ""}`, "🏠", chatTitle(fam), famUnread, () => openChat(fam.id), { "data-chat": fam.id }) : null);
  },
};

// ───────────── Обновление свайпом сверху вниз ─────────────
const Pull = {
  attach(scroller, onRefresh) {
    if (!scroller || scroller._pull) return; scroller._pull = true;
    const ind = h("div", { class: "ptr" }, h("div", { class: "ptr-ball" }, h("span", null, "🏠")), h("small", null, "Потяните, чтобы обновить"));
    scroller.parentNode.insertBefore(ind, scroller);     // над списком, чтобы перерисовка списка его не стирала
    let y0 = null, dy = 0, busy = false;
    const set = (d) => {
      const k = Math.min(1, d / 80);
      ind.style.height = Math.min(110, d) + "px";
      ind.style.opacity = k;
      ind.querySelector(".ptr-ball").style.transform = `rotate(${d * 3}deg) scale(${0.6 + k * 0.5})`;
      ind.querySelector("small").textContent = d > 80 ? "Отпустите ✨" : "Потяните, чтобы обновить";
      ind.classList.toggle("ready", d > 80);
    };
    scroller.addEventListener("touchstart", (e) => { if (!busy && scroller.scrollTop <= 0) y0 = e.touches[0].clientY; else y0 = null; dy = 0; }, { passive: true });
    scroller.addEventListener("touchmove", (e) => {
      if (y0 == null || busy) return;
      dy = (e.touches[0].clientY - y0) * 0.55;
      if (dy <= 0) { set(0); return; }
      set(dy);
    }, { passive: true });
    scroller.addEventListener("touchend", async () => {
      if (y0 == null || busy) return; y0 = null;
      if (dy <= 80) { ind.classList.add("back"); set(0); setTimeout(() => ind.classList.remove("back"), 300); return; }
      busy = true; ind.classList.add("spin"); ind.style.height = "70px"; ind.querySelector("small").textContent = "Обновляю…";
      navigator.vibrate?.(12);
      const t0 = Date.now();
      try { await onRefresh(); } catch { /* */ }
      await new Promise((r) => setTimeout(r, Math.max(0, 700 - (Date.now() - t0))));
      ind.classList.remove("spin"); ind.classList.add("done"); ind.querySelector("small").textContent = "Готово ✓";
      ind.querySelector(".ptr-ball span").textContent = "✨";
      scroller.classList.add("refreshed");
      setTimeout(() => {
        ind.classList.add("back"); set(0);
        setTimeout(() => { ind.classList.remove("back", "done"); ind.querySelector(".ptr-ball span").textContent = "🏠"; scroller.classList.remove("refreshed"); busy = false; }, 350);
      }, 600);
    });
    // для проверки и для мыши
    scroller._refresh = async () => { await onRefresh(); };
  },
};

// ───────────── Сообщения после одобрения ─────────────
const Moderation = {
  isOwner(c) { return !!c && (c.created_by === S.me.id || S.isAdmin); },
  // плашка под сообщением, которое ждёт одобрения
  el(m, c) {
    if (m.approved !== false || m.deleted) return null;
    if (this.isOwner(c) && m.user_id !== S.me.id) {
      return h("div", { class: "mod-bar" },
        h("span", null, "⏳ Ждёт вашего одобрения"),
        h("button", { class: "btn small", onclick: (e) => { e.stopPropagation(); this.decide(m, true); } }, "✓ Опубликовать"),
        h("button", { class: "btn small ghost", onclick: (e) => { e.stopPropagation(); this.decide(m, false); } }, "✕"));
    }
    return h("div", { class: "mod-bar mine" }, "⏳ Опубликуется после одобрения");
  },
  async decide(m, ok) {
    const el = document.querySelector(`#msgs .msg[data-id="${m.id}"] .bubble`);
    if (!ok) await FX.dust(el);
    const { data, error } = await S.sb.rpc("moderate_message", { mid: m.id, ok });
    if (error || data !== "OK") { toast("Не получилось"); return; }
    const list = S.msgs.get(m.chat_id) || [];
    if (ok) { m.approved = true; FX.sparkle(el); toast("Опубликовано"); }
    else { const i = list.indexOf(m); if (i >= 0) list.splice(i, 1); toast("Отклонено"); }
    if (S.current === m.chat_id) renderMessages(false);
  },
  pendingCount(chatId) { return (S.msgs.get(chatId) || []).filter((m) => m.approved === false && m.user_id !== S.me.id).length; },
};

// ───────────── Заявки на вступление и каталог групп/каналов ─────────────
const Joins = {
  list: [],          // заявки: мои (я подал) и ко мне (в мои группы)
  mine: new Set(),   // группы, куда я подавал заявку (помним, даже когда заявку уже рассмотрели)
  async load() {
    const { data, error } = await S.sb.from("join_requests").select("*");
    if (!error) { this.list = data || []; this.list.filter((r) => r.user_id === S.me.id).forEach((r) => this.mine.add(r.chat_id)); }
    renderChatList();
    return this.list;
  },
  toMe(chatId) { return this.list.filter((r) => r.user_id !== S.me.id && (!chatId || r.chat_id === chatId) && Moderation.isOwner(S.chats.find((c) => c.id === r.chat_id))); },
  onChange(p) {
    if (p.eventType === "DELETE") {
      const o = p.old || {};
      this.list = this.list.filter((r) => !(r.chat_id === o.chat_id && r.user_id === o.user_id));
    } else if (p.new) {
      const r = p.new;
      if (!this.list.some((x) => x.chat_id === r.chat_id && x.user_id === r.user_id)) this.list.push(r);
      const c = S.chats.find((x) => x.id === r.chat_id);
      if (r.user_id !== S.me.id && c) {
        const who = S.profiles.get(r.user_id)?.name || "Кто-то";
        toast(`🙋 ${who} просит вступить в «${chatTitle(c)}»`, 5000);
      }
    }
    renderChatList();
  },
  async decide(c, uid, ok) {
    const { data } = await S.sb.rpc("decide_join", { cid: c.id, target: uid, ok });
    if (data !== "OK") { toast("Не получилось"); return false; }
    this.list = this.list.filter((r) => !(r.chat_id === c.id && r.user_id === uid));
    const who = S.profiles.get(uid)?.name || "Участник";
    if (ok) { toast(`${who} принят(а) ✓`); await Groups.refresh(c.id); postMessage({ body: `👋 ${who} теперь в ${c.is_channel ? "канале" : "группе"}` }, c.id); }
    else toast("Заявка отклонена");
    renderChatList();
    return true;
  },
  // блок заявок в карточке группы/канала
  block(c, close) {
    const reqs = this.toMe(c.id); if (!reqs.length) return null;
    return h("div", { class: "req-block" },
      h("div", { class: "section-title", style: { padding: "6px 4px 4px" } }, `🙋 Заявки на вступление (${reqs.length})`),
      ...reqs.map((r) => h("div", { class: "member-row" },
        h("button", { class: "menu-item", onclick: () => { close(); Tg.profileView(r.user_id); } }, avatarEl(r.user_id, "sm"),
          h("span", null, S.profiles.get(r.user_id)?.name || "…", h("small", { class: "sub" }, "хочет вступить"))),
        h("button", { class: "icon-btn ok", title: "Принять", html: I.tick, onclick: async () => { if (await this.decide(c, r.user_id, true)) { close(); Groups.info(S.chats.find((x) => x.id === c.id) || c); } } }),
        h("button", { class: "icon-btn", title: "Отклонить", html: I.close, onclick: async () => { if (await this.decide(c, r.user_id, false)) { close(); Groups.info(c); } } }))));
  },
  // каталог: открытые каналы — подписаться, приватные группы и каналы — подать заявку
  async directory() {
    let close;
    const list = h("div", null, h("p", { class: "empty-chat" }, "Ищу…"));
    close = sheet([h("h3", null, "🔎 Группы и каналы семьи"), list,
      h("div", { class: "dir-actions" },
        h("button", { class: "menu-item", onclick: () => { close(); Groups.create(); } }, h("span", { html: I.group }), "Создать группу"),
        h("button", { class: "menu-item", onclick: () => { close(); Channels.create(); } }, h("span", null, "📢"), "Создать канал"))]);
    const { data, error } = await S.sb.rpc("directory");
    list.innerHTML = "";
    if (error) { list.append(h("p", { class: "empty-chat" }, "Нет связи с сервером")); return; }
    if (!data?.length) { list.append(h("p", { class: "empty-chat" }, "Пока нет групп и каналов, в которые можно вступить.")); return; }
    await signUrls(data.map((c) => c.avatar_path).filter(Boolean));
    for (const c of data) {
      const open = c.is_channel && !c.is_private;
      const btn = h("button", { class: `btn small${c.requested ? " ghost" : ""}` }, open ? "Подписаться" : c.requested ? "Заявка отправлена" : "Подать заявку");
      btn.onclick = async () => {
        if (c.requested) {
          await S.sb.rpc("cancel_join", { cid: c.id }); c.requested = false; this.mine.delete(c.id);
          this.list = this.list.filter((r) => !(r.chat_id === c.id && r.user_id === S.me.id));
          btn.textContent = "Подать заявку"; btn.classList.remove("ghost"); toast("Заявка отозвана"); return;
        }
        const { data: r } = await S.sb.rpc("request_join", { cid: c.id });
        if (r === "JOINED") { close(); await Groups.refresh(c.id); openChat(c.id); toast("Вы подписались ✓"); return; }
        if (r === "REQUESTED") {
          c.requested = true; this.list.push({ chat_id: c.id, user_id: S.me.id }); this.mine.add(c.id);
          btn.textContent = "Заявка отправлена"; btn.classList.add("ghost");
          toast(`Заявка отправлена. ${c.owner_name || "Создатель"} получит уведомление`, 4500);
          Live.broadcast("joinreq", { chat_id: c.id }); return;
        }
        toast("Не получилось — возможно, группа стала закрытой");
      };
      list.append(h("div", { class: "contact-row dir-row" },
        chatAvatar({ ...c, is_group: true }, ""),
        h("div", { class: "mid" }, h("b", null, (c.is_channel ? "📢 " : "👥 ") + c.title),
          h("small", null, [open ? "🌐 открытый канал" : `🔒 по заявке · создатель: ${c.owner_name || "—"}`, `${c.members} ${plural(c.members, "участник", "участника", "участников")}`].join(" · ")),
          c.description ? h("small", null, c.description) : null),
        btn));
    }
  },
  // меня приняли — показать радостное уведомление
  checkAccepted(before) {
    for (const id of [...this.mine]) {
      if (!before.has(id) && S.chats.some((c) => c.id === id)) {
        const c = S.chats.find((x) => x.id === id);
        this.mine.delete(id);
        this.list = this.list.filter((x) => !(x.chat_id === id && x.user_id === S.me.id));
        toast(`🎉 Вас приняли в «${chatTitle(c)}»`, 5000);
      }
    }
  },
};

// ───────────── Настройки группы/канала для создателя ─────────────
const ChatSettings = {
  async set(c, settings) {
    const { data, error } = await S.sb.rpc("chat_settings2", { cid: c.id, settings });
    if (error || data !== "OK") { toast(data === "NOT_OWNER" ? "Менять может только создатель" : "Не получилось сохранить"); return false; }
    Object.assign(c, Object.fromEntries(Object.entries(settings).map(([k, v]) => [k === "private" ? "is_private" : k, v])));
    Groups.refresh(c.id);
    return true;
  },
  rows(c) {
    if (!Moderation.isOwner(c) || c.id === FAMILY_CHAT) return [];
    const sw = (label, hint, key, value, after) => h("label", { class: "toggle-row" }, h("span", null, label, hint ? h("small", null, hint) : null),
      h("input", { type: "checkbox", checked: !!value, onchange: async (e) => {
        const ok = await this.set(c, { [key]: e.target.checked });
        if (!ok) e.target.checked = !e.target.checked; else after?.(e.target.checked);
      } }));
    const rows = [];
    if (c.is_channel) {
      rows.push(sw("Открытый канал", "Любой член семьи найдёт его и подпишется сам", "private", !c.is_private, null));
      rows[0].querySelector("input").onchange = async (e) => { const ok = await this.set(c, { private: !e.target.checked }); if (!ok) e.target.checked = !e.target.checked; };
      rows.push(sw("Подписчики могут писать", "Иначе пишете только вы", "members_can_post", c.members_can_post));
    }
    rows.push(sw("Сообщения участников — после одобрения", "Вы проверяете и публикуете их сами", "moderated", c.moderated));
    if (!c.is_channel || c.is_private) rows.push(sw("Принимать заявки на вступление", "Группу видно в поиске, вступить можно с вашего одобрения", "listed", c.listed));
    return rows;
  },
};

// ───────────── Реакции во время видеозвонка ─────────────
const CALL_REACTIONS = ["❤️", "👍", "😂", "🎉", "🔥", "👏", "😮", "😢", "🥰", "🙏"];
const CallReact = {
  button(onSend) {
    const b = h("button", { class: "cbtn react-btn", title: "Реакция", onclick: (e) => {
      e.stopPropagation();
      const host = b.closest(".call"); if (!host) return;
      let bar = host.querySelector(".react-bar");
      if (bar) { bar.remove(); return; }
      bar = h("div", { class: "react-bar" }, CALL_REACTIONS.map((r) => h("button", { onclick: (ev) => { ev.stopPropagation(); onSend(r); this.show(host, r, "Вы"); } }, r)));
      host.append(bar);
      setTimeout(() => bar.isConnected && bar.remove(), 8000);
    } }, "😊");
    return h("div", { class: "cbtn-wrap" }, b, "Реакция");
  },
  // эмодзи взлетают по экрану звонка, у всех участников
  show(host, emoji, who) {
    if (!host) return;
    const layer = h("div", { class: "call-react-layer" });
    const big = h("div", { class: "call-react-big" }, emoji, who ? h("small", null, who) : null);
    layer.append(big);
    for (let i = 0; i < 14; i++) {
      const p = h("i", null, emoji);
      p.style.left = 10 + Math.random() * 80 + "%";
      p.style.fontSize = (22 + Math.random() * 26).toFixed(0) + "px";
      p.style.animationDelay = (Math.random() * 0.6).toFixed(2) + "s";
      p.style.setProperty("--dx", (Math.random() * 120 - 60).toFixed(0) + "px");
      layer.append(p);
    }
    if (emoji === "🎉") layer.append(Welcome.confetti(40));
    host.append(layer);
    navigator.vibrate?.(15);
    setTimeout(() => layer.remove(), 3200);
  },
};

// ───────── Надёжные оповещения ─────────
// Сервер сам записывает оповещение каждому получателю (сообщения, публикации, истории, реакции, задачи, заявки).
// Приложение забирает их сразу; если страница уснула, их забирает фоновая служба Android по ключу устройства.
// Каждое оповещение выдаётся один раз — повторов не бывает.
const Push = {
  shown: new Set(), timer: null, key: null, busy: false,
  get on() { return !!window.AndroidBridge?.pushKey; },
  /** уже показано по живому событию (сообщение пришло через realtime) */
  mark(ref) { if (!ref) return; this.shown.add(ref); if (this.shown.size > 3000) this.shown = new Set([...this.shown].slice(-1500)); },
  async setup() {
    if (!this.on || !S.me) return;
    try { this.key = window.AndroidBridge.pushKey(CFG.supabaseUrl, CFG.supabaseKey); } catch { this.key = null; }
    if (this.key) { try { await S.sb.rpc("register_device", { key: this.key }); } catch { /* повторим при следующем входе */ } }
    this.syncPrefs();
    FcmSetup.apply();
    this.soon(1500);
  },
  syncPrefs() {
    if (!this.on || !S.me) return;
    try {
      window.AndroidBridge.pushPrefs?.(JSON.stringify({ muted: Prefs.get("muted") || [], preview: Prefs.get("preview") !== false,
        stories: Prefs.get("nStories") !== false, reactions: Prefs.get("nReacts") !== false }));
    } catch { /* */ }
  },
  async logout() {
    try { if (this.key) await Promise.race([S.sb.rpc("unregister_device", { key: this.key }), new Promise((r) => setTimeout(r, 2500))]); } catch { /* */ }
    try { window.AndroidBridge?.pushReset?.(); } catch { /* */ }
    this.key = null;
  },
  soon(ms = 1200) { if (!this.on) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.claim(), ms); },
  async claim() {
    if (!this.on || !S.me || this.busy) return;
    this.busy = true;
    try {
      const { data } = await S.sb.rpc("claim_notices");
      for (const n of data || []) { try { this.show(n); } catch (e) { console.warn("notice", e); } }
    } catch { /* сеть — заберём позже */ } finally { this.busy = false; }
  },
  allowed(n) {
    if (Prefs.get("nStories") === false && (n.kind === "story" || n.kind === "story_react")) return false;
    if (Prefs.get("nReacts") === false && (n.kind === "reaction" || n.kind === "story_react")) return false;
    if (n.chat_id && Prefs.muted(n.chat_id) && (n.kind === "message" || n.kind === "reaction")) return false;
    return true;
  },
  show(n) {
    if (n.kind === "call" || n.kind === "test") return;   // служебные: только будят телефон
    if (n.kind === "message") { if (this.shown.has(n.ref)) return; this.mark(n.ref); }
    if (!this.allowed(n)) return;
    const visible = appVisible();
    if (visible) {
      // в открытом приложении сообщения, заявки и задачи и так видны — подсказываем только о новом
      if (n.kind === "story" || n.kind === "story_react" || n.kind === "reaction" || n.kind === "approved") toast(`${n.title}: ${n.body || ""}`, 4500);
      if (n.kind === "story") Stories.load?.().then(() => Stories.renderAll?.()).catch(() => {});
      return;
    }
    const text = n.kind === "message" && !Prefs.get("preview") ? "Новое сообщение" : (n.body || "");
    window.AndroidBridge.notify(n.title, text, n.chat_id || null);
  },
};

// ───────── Мгновенные оповещения (Firebase) ─────────
// Ключи Firebase загружает администратор семьи; приложение получает с сервера только открытую часть.
const FcmSetup = {
  async apply() {
    if (!window.AndroidBridge?.fcmInit || !S.me) return;
    try { const { data } = await S.sb.rpc("push_config"); window.AndroidBridge.fcmInit(data ? JSON.stringify(data) : null); } catch { /* */ }
  },
  phone() { try { return window.AndroidBridge?.fcmStatus ? JSON.parse(window.AndroidBridge.fcmStatus()) : null; } catch { return null; } },
  parseClient(g) {
    const pr = g?.project_info, cl = (g?.client || []).find((c) => c.client_info?.android_client_info?.package_name === "ru.family.chat");
    if (!pr || !cl) return null;
    const out = { app_id: cl.client_info.mobilesdk_app_id, api_key: cl.api_key?.[0]?.current_key, project_id: pr.project_id, sender_id: String(pr.project_number || "") };
    return Object.values(out).every(Boolean) ? out : null;
  },
  readJson(file) { return file.text().then((t) => JSON.parse(t)); },
  async sheet() {
    const box = h("div");
    let client = null, service = null;
    const draw = async () => {
      const { data: st } = await S.sb.rpc("push_status");
      const ph = this.phone();
      box.innerHTML = "";
      const row = (ok, text) => h("div", { class: `health${ok ? " ok" : " bad"}` }, h("span", null, ok ? "✓" : "•"), h("span", null, text));
      box.append(
        row(!!st?.configured, st?.configured ? `Firebase подключён (проект ${st.project})` : "Firebase ещё не подключён"),
        row((st?.people || 0) > 0, `Телефонов с мгновенными оповещениями: ${st?.devices || 0} (людей: ${st?.people || 0})`),
        ph ? row(!!ph.token, ph.token ? "Этот телефон получает мгновенные оповещения" : (st?.configured ? "Этот телефон ещё не получил адрес Firebase" + (ph.error ? ` (${ph.error})` : "") : "Этот телефон: ждёт подключения")) : null,
      );
      if (!S.isAdmin) { box.append(h("p", { class: "sheet-note" }, "Подключает администратор семьи. Остальным ничего делать не нужно — после подключения достаточно открыть приложение.")); return; }
      const pick = (label, onfile) => {
        const inp = h("input", { type: "file", accept: "*/*", style: { display: "none" }, onchange: async (e) => { const f = e.target.files[0]; if (f) await onfile(f); e.target.value = ""; } });
        return [h("button", { class: "menu-item", onclick: () => inp.click() }, h("span", { html: I.download }), label), inp];
      };
      const status = h("p", { class: "sheet-note" }, client && service ? "Оба файла выбраны — нажмите «Сохранить»." : "Выберите два файла из Firebase (как их получить — в инструкции).");
      box.append(
        h("h4", null, "Подключение"),
        ...pick(client ? `✓ google-services.json (${client.project_id})` : "1. Выбрать google-services.json", async (f) => {
          try { client = this.parseClient(await this.readJson(f)); } catch { client = null; }
          if (!client) toast("Это не тот файл: нужен google-services.json для приложения ru.family.chat", 5000);
          draw();
        }),
        ...pick(service ? `✓ Ключ сервисного аккаунта (${service.client_email.split("@")[0]})` : "2. Выбрать ключ сервисного аккаунта (.json)", async (f) => {
          try { const j = await this.readJson(f); service = j?.type === "service_account" && j.private_key && j.client_email ? j : null; } catch { service = null; }
          if (!service) toast("Это не тот файл: нужен ключ сервисного аккаунта Firebase (.json)", 5000);
          draw();
        }),
        status,
        h("button", { class: "btn wide", disabled: !(client && service), onclick: async () => {
          const { data } = await S.sb.rpc("set_push_config", { client, service });
          const msg = { OK: "✅ Firebase подключён", PROJECT_MISMATCH: "Файлы из разных проектов Firebase", BAD_CLIENT: "Неверный google-services.json", BAD_SERVICE: "Неверный ключ сервисного аккаунта", NOT_ADMIN: "Только для администратора" }[data] || "Не удалось сохранить";
          toast(msg, 4000);
          if (data === "OK") { client = service = null; await this.apply(); setTimeout(draw, 2500); }
        } }, "Сохранить"),
        st?.configured ? h("button", { class: "btn wide ghost", onclick: async () => {
          this.apply();
          const { data, error } = await S.sb.functions.invoke("push", { body: {} });
          if (error) return toast("Функция push на сервере не отвечает", 5000);
          if (data?.sent) toast("Сигнал отправлен — сейчас придёт уведомление «✅ Мгновенные оповещения работают»", 5000);
          else toast(data?.reason === "NO_DEVICES" ? "Этот телефон ещё не зарегистрирован — откройте приложение заново и повторите" : "Ошибка: " + (data?.errors?.[0] || data?.reason || "нет ответа"), 7000);
        } }, "Проверить на моём телефоне") : null,
        st?.configured ? h("button", { class: "menu-item danger", onclick: async () => { await S.sb.rpc("set_push_config", { client: null, service: null }); toast("Мгновенные оповещения отключены"); draw(); } }, "Отключить Firebase") : null,
      );
    };
    sheet([h("h3", null, "⚡ Мгновенные оповещения"),
      h("p", { class: "sheet-note" }, "Через Firebase телефон просыпается сразу, даже если приложение выгружено: сообщения, истории и звонки приходят мгновенно. Текст сообщений через Google не передаётся."),
      box]);
    draw();
  },
};
window.onPushTest = () => toast("✅ Мгновенные оповещения работают на этом телефоне", 5000);
