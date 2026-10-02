/* Интерфейс в стиле Telegram: папки чатов, закреп и «без звука», контакты, история звонков,
   настройки, «печатает…», редактирование и пересылка сообщений, поиск по чату. */
"use strict";

const EDIT_MARK = "⁣";                 // невидимый знак в конце текста — «сообщение изменено»
const FWD_RE = /^↪️ Переслано от ([^\n]+)\n?/;

// ───────────── Личные настройки (на этом устройстве) ─────────────
const Prefs = {
  data: null,
  key() { return `prefs:${S.me?.id || ""}`; },
  load() {
    if (this.data && this.uid === S.me?.id) return this.data;
    this.uid = S.me?.id;
    try { this.data = JSON.parse(localStorage.getItem(this.key()) || "{}"); } catch { this.data = {}; }
    this.data = Object.assign({ pinned: [], muted: [], sound: true, vibrate: true, preview: true, inAppSound: true, fontSize: 16, pattern: true, enterSend: false }, this.data);
    return this.data;
  },
  get(k) { return this.load()[k]; },
  set(k, v) { this.load()[k] = v; try { localStorage.setItem(this.key(), JSON.stringify(this.data)); } catch { /* */ } },
  pinned(id) { return this.load().pinned.includes(id); },
  muted(id) { return this.load().muted.includes(id); },
  toggle(list, id) {
    const a = this.load()[list]; const i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.push(id);
    this.set(list, a); return i < 0;
  },
  apply() {
    const d = this.load();
    document.documentElement.style.setProperty("--fs", (d.fontSize || 16) + "px");
    document.documentElement.classList.toggle("no-pattern", !d.pattern);
  },
};

const Tg = {
  typing: new Map(),          // chatId -> Map(userId -> время)

  // текст сообщения без служебных знаков
  text(body) { return body ? String(body).replace(EDIT_MARK, "").replace(FWD_RE, "") : body; },
  edited(body) { return !!body && String(body).endsWith(EDIT_MARK); },
  forwardedFrom(body) { const m = body && String(body).match(FWD_RE); return m ? m[1] : null; },

  // ── папки над списком чатов
  renderFolders() {
    const box = $("#folders"); if (!box) return;
    const f = S.folder || "all";
    const unread = [...S.unread.values()].filter(Boolean).length;
    const items = [["all", "Все"], ["personal", "Личные"], ["groups", "Группы"], ["unread", unread ? `Непрочитанные ${unread}` : "Непрочитанные"]];
    box.innerHTML = "";
    for (const [k, l] of items) box.append(h("button", { class: f === k ? "on" : "", onclick: () => { S.folder = k; renderChatList(); } }, l));
  },

  // ── «печатает…»
  typingText(chatId) {
    const m = this.typing.get(chatId); if (!m) return "";
    const now = Date.now(); const who = [];
    for (const [u, t] of m) { if (now - t < 5000 && u !== S.me.id) who.push(S.profiles.get(u)?.name?.split(" ")[0] || ""); else if (now - t >= 5000) m.delete(u); }
    if (!who.length) return "";
    const c = S.chats.find((x) => x.id === chatId);
    if (!c?.is_group) return "печатает…";
    return who.length === 1 ? `${who[0]} печатает…` : `${who.length} печатают…`;
  },
  onTyping(p) {
    if (!p || p.user_id === S.me?.id) return;
    if (!this.typing.has(p.chat_id)) this.typing.set(p.chat_id, new Map());
    this.typing.get(p.chat_id).set(p.user_id, Date.now());
    this.refreshTyping(p.chat_id);
    clearTimeout(this.tt); this.tt = setTimeout(() => this.refreshTyping(p.chat_id), 5200);
  },
  refreshTyping(chatId) {
    renderChatList();
    if (S.current === chatId) updateChatSub();
  },
  sendTyping() {
    if (!S.current || Date.now() - (this.lastTyping || 0) < 3000) return;
    this.lastTyping = Date.now();
    Live.broadcast("typing", { chat_id: S.current, user_id: S.me.id });
  },

  // ── долгое нажатие на чат: закрепить, без звука, прочитано
  chatRowGestures(el, c) {
    let timer = null, moved = false;
    el.addEventListener("contextmenu", (e) => { e.preventDefault(); this.chatMenu(c); });
    el.addEventListener("touchstart", () => { moved = false; timer = setTimeout(() => { timer = null; if (!moved) { navigator.vibrate?.(15); el._long = true; this.chatMenu(c); } }, 500); }, { passive: true });
    el.addEventListener("touchmove", () => { moved = true; clearTimeout(timer); }, { passive: true });
    el.addEventListener("touchend", () => clearTimeout(timer));
    el.addEventListener("click", (e) => { if (el._long) { el._long = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  },
  chatMenu(c) {
    let close;
    const other = !c.is_group ? otherUser(c) : null;
    const pinned = Prefs.pinned(c.id), muted = Prefs.muted(c.id), unread = S.unread.get(c.id) || 0;
    close = sheet([
      h("div", { class: "sheet-head" }, chatAvatar(c, "sm"), h("b", null, chatTitle(c))),
      h("button", { class: "menu-item", onclick: () => { close(); toast(Prefs.toggle("pinned", c.id) ? "Чат закреплён" : "Чат откреплён"); renderChatList(); } },
        h("span", { html: I.pushpin }), pinned ? "Открепить" : "Закрепить"),
      h("button", { class: "menu-item", onclick: () => { close(); toast(Prefs.toggle("muted", c.id) ? "Уведомления выключены" : "Уведомления включены"); renderChatList(); } },
        h("span", { html: muted ? I.bell : I.bellOff }), muted ? "Включить уведомления" : "Без звука"),
      unread ? h("button", { class: "menu-item", onclick: () => { close(); markRead(c.id); } }, h("span", { html: I.ticks }), "Отметить как прочитанное") : null,
      other ? h("button", { class: "menu-item", onclick: () => { close(); Calls.start(other, false); } }, h("span", { html: I.phone }), "Позвонить") : null,
      other ? h("button", { class: "menu-item", onclick: () => { close(); Calls.start(other, true); } }, h("span", { html: I.video }), "Видеозвонок") : null,
      c.is_group ? h("button", { class: "menu-item", onclick: () => { close(); GroupCall.start(c.id, true); } }, h("span", { html: I.video }), "Начать видеочат") : null,
    ]);
  },

  // ── меню «⋮» в открытом чате
  openChatMenu(c) {
    let close;
    const muted = Prefs.muted(c.id), pinned = Prefs.pinned(c.id);
    close = sheet([
      h("button", { class: "menu-item", onclick: () => { close(); this.searchInChat(c); } }, h("span", { html: I.search }), "Поиск по чату"),
      h("button", { class: "menu-item", onclick: () => { close(); toast(Prefs.toggle("muted", c.id) ? "Уведомления выключены" : "Уведомления включены"); renderChatList(); } },
        h("span", { html: muted ? I.bell : I.bellOff }), muted ? "Включить уведомления" : "Без звука"),
      h("button", { class: "menu-item", onclick: () => { close(); toast(Prefs.toggle("pinned", c.id) ? "Чат закреплён" : "Чат откреплён"); renderChatList(); } },
        h("span", { html: I.pushpin }), pinned ? "Открепить чат" : "Закрепить чат"),
      h("button", { class: "menu-item", onclick: () => { close(); this.mediaOfChat(c); } }, h("span", { html: I.gallery || I.clip }), "Фото, видео и файлы"),
      h("button", { class: "menu-item", onclick: () => { close(); chatInfo(c); } }, h("span", { html: I.info }), c.is_group ? "Информация о группе" : "Профиль"),
    ]);
  },

  // ── поиск по сообщениям чата
  searchInChat(c) {
    let close;
    const input = h("input", { placeholder: "Найти в переписке", autofocus: true });
    const results = h("div", { class: "search-results" });
    let timer;
    const run = async () => {
      const q = input.value.trim().toLowerCase();
      results.innerHTML = "";
      if (q.length < 2) return;
      const found = new Map();
      for (const m of S.msgs.get(c.id) || []) if (!m.deleted && m.body && this.text(m.body).toLowerCase().includes(q)) found.set(m.id, m);
      try {
        const { data } = await S.sb.from("messages").select("*").eq("chat_id", c.id).ilike("body", `%${q}%`).order("created_at", { ascending: false }).limit(60);
        for (const m of data || []) if (!m.deleted) found.set(m.id, m);
      } catch { /* только загруженные */ }
      const list = [...found.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      if (!list.length) { results.append(h("p", { class: "empty-chat" }, "Ничего не найдено")); return; }
      for (const m of list.slice(0, 60)) {
        const t = this.text(m.body); const i = t.toLowerCase().indexOf(q);
        const snip = (i > 30 ? "…" + t.slice(i - 25) : t).slice(0, 120);
        results.append(h("button", { class: "menu-item search-hit", onclick: async () => { close(); await this.jumpToMessage(c.id, m); } },
          avatarEl(m.user_id, "sm"),
          h("div", { class: "mid" }, h("b", null, S.profiles.get(m.user_id)?.name || ""), h("span", null, snip)),
          h("small", null, fmtListTime(m.created_at))));
      }
    };
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 250); });
    close = sheet([h("h3", null, "Поиск по чату"), h("label", { class: "field" }, input), results]);
    setTimeout(() => input.focus(), 50);
  },
  async jumpToMessage(chatId, m) {
    if (S.current !== chatId) await openChat(chatId);
    const list = S.msgs.get(chatId) || [];
    // догружаем историю, пока не найдём сообщение
    for (let i = 0; i < 20 && !list.some((x) => x.id === m.id); i++) {
      const more = await loadMessages(chatId, list[0]?.created_at);
      if (!more?.length) break;
    }
    renderMessages(false);
    setTimeout(() => jumpTo(m.id), 100);
  },
  async mediaOfChat(c) {
    let close;
    const grid = h("div", { class: "media-grid" }, h("p", { class: "empty-chat" }, "Загрузка…"));
    close = sheet([h("h3", null, "Фото, видео и файлы"), grid]);
    let rows = [];
    try {
      const { data } = await S.sb.from("messages").select("*").eq("chat_id", c.id).order("created_at", { ascending: false }).limit(300);
      rows = (data || []).filter((m) => m.media_path && !m.deleted);
    } catch { rows = (S.msgs.get(c.id) || []).filter((m) => m.media_path && !m.deleted); }
    await signUrls(rows.map((m) => m.media_path));
    grid.innerHTML = "";
    if (!rows.length) { grid.append(h("p", { class: "empty-chat" }, "Пока ничего не отправляли")); return; }
    for (const m of rows) {
      const url = S.urls.get(m.media_path);
      if (m.media_type === "image") grid.append(h("img", { src: url, loading: "lazy", onclick: () => lightbox(url) }));
      else if (m.media_type === "video" || m.media_type === "video_note") grid.append(h("video", { src: url, preload: "metadata", controls: true, playsinline: true }));
      else grid.append(h("a", { class: "media-file", href: url, target: "_blank", rel: "noopener", download: m.media_name || "" }, h("span", { html: m.media_type === "audio" ? I.mic : I.file }), m.media_name || "Файл"));
    }
  },

  // ── редактирование своего сообщения
  startEdit(m) {
    const ta = $("#input"); if (!ta) return;
    S.editing = m; clearReply();
    ta.value = this.text(m.body); ta.dispatchEvent(new Event("input")); ta.focus();
    const box = $("#replyBox"); box.innerHTML = "";
    box.append(h("div", { class: "replying editing" },
      h("span", { class: "icon-btn", html: I.pen, style: { color: "var(--accent)" } }),
      h("div", { class: "q" }, h("b", null, "Редактирование"), h("span", null, this.text(m.body).slice(0, 80))),
      h("button", { class: "icon-btn", title: "Отменить", html: I.close, onclick: () => this.cancelEdit() })));
  },
  cancelEdit() {
    S.editing = null;
    const box = $("#replyBox"); if (box) box.innerHTML = "";
    const ta = $("#input"); if (ta) { ta.value = ""; ta.dispatchEvent(new Event("input")); }
  },
  async saveEdit(text) {
    const m = S.editing; S.editing = null;
    const box = $("#replyBox"); if (box) box.innerHTML = "";
    if (!m || !text || text === this.text(m.body)) return;
    const fwd = this.forwardedFrom(m.body);
    const body = (fwd ? `↪️ Переслано от ${fwd}\n` : "") + text.slice(0, 7900) + EDIT_MARK;
    const old = m.body; m.body = body; rerenderMessage(m.id);
    const { error } = await S.sb.from("messages").update({ body }).eq("id", m.id);
    if (error) { m.body = old; rerenderMessage(m.id); toast("Не удалось изменить"); return; }
    if (S.lastByChat.get(m.chat_id)?.id === m.id) { S.lastByChat.get(m.chat_id).body = body; renderChatList(); }
  },

  // ── пересылка
  forward(m) {
    let close;
    const name = S.profiles.get(m.user_id)?.name || "участника";
    const fwdName = this.forwardedFrom(m.body) || name;
    const go = async (chatId, userId) => {
      close();
      if (!chatId) {
        const { data: id, error } = await S.sb.rpc("get_or_create_dm", { other: userId });
        if (error || !id) { toast("Не удалось открыть чат"); return; }
        if (!S.chats.find((c) => c.id === id)) await loadChats();
        chatId = id;
      }
      const head = `↪️ Переслано от ${fwdName}`;
      const text = this.text(m.body);
      try {
        if (m.media_path) {
          const url = S.urls.get(m.media_path); if (!url) throw new Error("no url");
          const blob = await (await fetch(url)).blob();
          const ext = (m.media_path.split(".").pop() || "bin").slice(0, 6);
          const path = `${chatId}/${crypto.randomUUID()}.${ext}`;
          const { error } = await S.sb.storage.from("media").upload(path, blob, { contentType: blob.type || "application/octet-stream" });
          if (error) throw error;
          await signUrls([path]);
          await postMessage({ media_path: path, media_type: m.media_type, media_name: m.media_name, body: head + (text ? "\n" + text : "") }, chatId);
        } else {
          await postMessage({ body: head + "\n" + (text || "") }, chatId);
        }
        toast("Переслано");
        if (S.current !== chatId) openChat(chatId);
      } catch { toast("Не удалось переслать"); }
    };
    const chats = [...S.chats].filter((c) => { const o = !c.is_group && otherUser(c); return !(o && S.profiles.get(o)?.banned); })
      .sort((a, b) => new Date(S.lastByChat.get(b.id)?.created_at || 0) - new Date(S.lastByChat.get(a.id)?.created_at || 0));
    const withDm = new Set(S.chats.filter((c) => !c.is_group).map(otherUser));
    const people = [...S.profiles.values()].filter((p) => p.id !== S.me.id && !p.banned && !withDm.has(p.id));
    close = sheet([
      h("h3", null, "Переслать в…"),
      ...chats.map((c) => h("button", { class: "menu-item", onclick: () => go(c.id) }, chatAvatar(c, "sm"), chatTitle(c))),
      ...people.map((p) => h("button", { class: "menu-item", onclick: () => go(null, p.id) }, avatarEl(p.id, "sm"), p.name)),
    ]);
  },

  // ── вкладка «Контакты»
  renderContacts() {
    const box = $("#tabContacts"); if (!box) return;
    box.innerHTML = "";
    const people = [...S.profiles.values()].filter((p) => p.id !== S.me.id && !p.banned);
    people.sort((a, b) => (S.online.has(b.id) - S.online.has(a.id)) || (new Date(b.last_seen || 0) - new Date(a.last_seen || 0)));
    box.append(
      h("div", { class: "search" }, h("input", { placeholder: "Поиск контактов", oninput: (e) => {
        const q = e.target.value.toLowerCase();
        box.querySelectorAll(".contact-row").forEach((r) => r.classList.toggle("hidden", !r.dataset.name.includes(q)));
      } })),
      h("button", { class: "menu-item tg-action", onclick: () => showTab("invite") }, h("span", { class: "tg-ico", style: { background: "#2EAD6B" }, html: I.invite }), "Пригласить в семью"),
      h("button", { class: "menu-item tg-action", onclick: () => newGroupSheet() }, h("span", { class: "tg-ico", style: { background: "#3D8BFD" }, html: I.group }), "Создать группу"),
      h("button", { class: "menu-item tg-action", onclick: () => Assistant.open() }, h("span", { class: "tg-ico", style: { background: "var(--accent)" }, html: I.bot }), "Мой ассистент"),
      h("div", { class: "list-caption" }, `Семья · ${people.length + 1} ${plural(people.length + 1, "человек", "человека", "человек")}`),
      h("div", { class: "contact-row me", "data-name": (S.me.name || "").toLowerCase() },
        avatarEl(S.me.id), h("div", { class: "mid" }, h("b", null, S.me.name + " (вы)"), h("small", null, S.me.status || "в сети"))));
    if (!people.length) box.append(h("p", { class: "empty-chat" }, "Пока никого нет. Пригласите семью — кнопка выше."));
    for (const p of people) {
      const on = S.online.has(p.id);
      box.append(h("div", { class: "contact-row", "data-name": p.name.toLowerCase(), onclick: () => openDm(p.id) },
        avatarEl(p.id),
        h("div", { class: "mid" }, h("b", null, p.name), h("small", { class: on ? "online" : "" }, (on ? "в сети" : lastSeen(p.last_seen) || "был(а) давно") + (p.status ? " · " + p.status : ""))),
        h("button", { class: "icon-btn", title: "Позвонить", html: I.phone, onclick: (e) => { e.stopPropagation(); Calls.start(p.id, false); } }),
        h("button", { class: "icon-btn", title: "Видеозвонок", html: I.video, onclick: (e) => { e.stopPropagation(); Calls.start(p.id, true); } })));
    }
  },

  // ── вкладка «Звонки»: история из записей о звонках в переписках
  callRows() {
    const rows = [];
    for (const m of S.callLog || []) {
      const c = S.chats.find((x) => x.id === m.chat_id); if (!c) continue;
      const group = c.is_group;
      const other = group ? null : otherUser(c);
      const out = m.user_id === S.me.id;
      const b = m.body || "";
      const video = /Видео/.test(b);
      const missed = !out && /без ответа|отклонён/.test(b);
      const dur = (b.match(/(\d+:\d\d)/) || [])[1];
      rows.push({ m, c, other, out, video, missed, dur, group });
    }
    return rows;
  },
  renderCalls() {
    const box = $("#tabCalls"); if (!box) return;
    box.innerHTML = "";
    S.missedSeen = Date.now(); try { localStorage.setItem("missedSeen:" + S.me.id, String(S.missedSeen)); } catch { /* */ }
    this.updateCallsBadge();
    const rows = this.callRows();
    box.append(h("button", { class: "menu-item tg-action", onclick: () => this.newCallSheet() }, h("span", { class: "tg-ico", style: { background: "#2EAD6B" }, html: I.phone }), "Новый звонок"));
    const fam = S.chats.find((c) => c.id === FAMILY_CHAT);
    if (fam) box.append(h("button", { class: "menu-item tg-action", onclick: () => GroupCall.start(FAMILY_CHAT, true) }, h("span", { class: "tg-ico", style: { background: "#9B5DE5" }, html: I.video }), "Видеочат с семьёй"));
    box.append(h("div", { class: "list-caption" }, "Недавние"));
    if (!rows.length) { box.append(h("p", { class: "empty-chat" }, "Звонков пока не было")); return; }
    for (const r of rows.slice(0, 100)) {
      const name = r.group ? chatTitle(r.c) : (S.profiles.get(r.other)?.name || "…");
      const label = r.group ? "Видеочат" : `${r.out ? "Исходящий" : r.missed ? "Пропущенный" : "Входящий"}${r.video ? " видеозвонок" : ""}${r.dur ? ", " + r.dur : ""}`;
      box.append(h("div", { class: `call-row${r.missed ? " missed" : ""}`, onclick: () => (r.group ? GroupCall.start(r.c.id, true) : openChat(r.c.id)) },
        r.group ? chatAvatar(r.c) : avatarEl(r.other),
        h("div", { class: "mid" }, h("b", null, name),
          h("small", null, h("span", { class: "dir", html: r.out ? I.callOut : I.callIn }), label)),
        h("small", { class: "when" }, fmtListTime(r.m.created_at)),
        h("button", { class: "icon-btn", title: r.video ? "Видеозвонок" : "Позвонить", html: r.video ? I.video : I.phone,
          onclick: (e) => { e.stopPropagation(); if (r.group) GroupCall.start(r.c.id, true); else Calls.start(r.other, r.video); } })));
    }
  },
  updateCallsBadge() {
    const seen = S.missedSeen || +(localStorage.getItem("missedSeen:" + S.me?.id) || 0);
    const n = this.callRows().filter((r) => r.missed && new Date(r.m.created_at).getTime() > seen).length;
    const b = $("#callsBadge"); if (b) { b.textContent = n; b.classList.toggle("hidden", !n); }
  },
  isCallMsg(m) { return !!m?.body && !m.media_type && (m.body.startsWith("📞") || m.body === GC_MARK); },
  newCallSheet() {
    let close;
    const people = [...S.profiles.values()].filter((p) => p.id !== S.me.id && !p.banned).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    close = sheet([
      h("h3", null, "Кому позвонить?"),
      ...people.map((p) => h("div", { class: "contact-row" }, avatarEl(p.id, "sm"), h("div", { class: "mid" }, h("b", null, p.name)),
        h("button", { class: "icon-btn", title: "Позвонить", html: I.phone, onclick: () => { close(); Calls.start(p.id, false); } }),
        h("button", { class: "icon-btn", title: "Видеозвонок", html: I.video, onclick: () => { close(); Calls.start(p.id, true); } }))),
      people.length ? null : h("p", { class: "empty-chat" }, "Пока некому звонить — пригласите семью."),
    ]);
  },

  // ── вкладка «Настройки»
  renderSettings() {
    const box = $("#tabSettings"); if (!box) return;
    box.innerHTML = "";
    const login = (S.sessionEmail || "").split("@")[0];
    const item = (color, icon, label, onclick, extra) => h("button", { class: `menu-item tg-set${extra?.danger ? " danger" : ""}`, onclick },
      h("span", { class: "tg-ico", style: { background: color }, html: icon }), h("span", { class: "lbl" }, label), extra?.value ? h("small", { class: "val" }, extra.value) : null);
    const group = (...kids) => h("div", { class: "set-group" }, ...kids.filter(Boolean));
    box.append(
      h("div", { class: "set-profile", onclick: () => openProfile() },
        avatarEl(S.me.id, "lg"),
        h("div", { class: "mid" }, h("b", null, S.me.name), h("small", null, (login ? "@" + login + " · " : "") + (S.me.status || "в сети"))),
        h("span", { class: "chev", html: I.pen })),
      group(
        item("#3D8BFD", I.user, "Изменить профиль", () => openProfile()),
        item("#F2A541", I.pushpin, "Статус", () => openProfile(), { value: S.me.status || "нет" })),
      group(
        item("#E0457B", I.bell, "Уведомления и звуки", () => this.notifSheet()),
        item("#2EAD6B", I.phone, "Звонки", () => this.callsSheet()),
        item("#6C7A89", I.lock, "Сменить пароль", () => changePasswordSheet()),
        item("#00A6A6", I.key, "Кодовое слово для восстановления", () => recoveryWordSheet()),
        item("#9B5DE5", I.palette, "Оформление и цвета", () => Theme.sheet()),
        item("#3D8BFD", I.data, "Данные и память", () => this.dataSheet())),
      group(
        item("#E8664F", I.bot, "Мой ассистент", () => { if (!Assistant.loaded) { Assistant.load(); Assistant.loaded = true; } Assistant.settingsSheet(); }),
        item("#2EAD6B", I.invite, "Пригласить в семью", () => showTab("invite"))),
      S.isAdmin ? group(
        item("#E8664F", I.shield, "Управление участниками", () => membersAdmin()),
        item("#6C7A89", I.group, "Сбросить пароль участнику", () => adminResetSheet())) : null,
      group(
        item("#3D8BFD", I.info, "О приложении", () => this.aboutSheet(), { value: this.version() }),
        item("#E5484D", I.logout, "Выйти", () => this.logoutSheet(), { danger: true })),
    );
  },
  version() { try { return window.AndroidBridge?.appVersion?.() || APP_VERSION; } catch { return APP_VERSION; } },
  toggle(label, key, hint, on) {
    return h("label", { class: "toggle-row" }, h("input", { type: "checkbox", checked: !!Prefs.get(key), onchange: (e) => { Prefs.set(key, e.target.checked); on?.(e.target.checked); } }),
      h("span", null, label, hint ? h("small", null, hint) : null));
  },
  notifSheet() {
    sheet([
      h("h3", null, "Уведомления и звуки"),
      this.toggle("Звук новых сообщений", "sound"),
      this.toggle("Вибрация", "vibrate"),
      this.toggle("Показывать текст сообщения", "preview", "Иначе в уведомлении будет «Новое сообщение»"),
      this.toggle("Звук отправки в открытом чате", "inAppSound"),
      window.AndroidBridge?.openSettings ? h("button", { class: "menu-item", onclick: () => window.AndroidBridge.openSettings("notifications") }, h("span", { html: I.gear }), "Системные настройки уведомлений") : null,
      h("p", { class: "sheet-note" }, "Отключить звук у отдельного чата: долгое нажатие на чат → «Без звука»."),
    ]);
  },
  callsSheet() {
    const rows = h("div");
    const draw = () => {
      rows.innerHTML = "";
      let st = null;
      try { st = window.AndroidBridge?.callHealth ? JSON.parse(window.AndroidBridge.callHealth()) : null; } catch { st = null; }
      if (!st) {
        rows.append(h("p", { class: "sheet-note" }, "В браузере звонки приходят, пока открыта вкладка с мессенджером. Для звонков при выключенном экране установите приложение для Android."));
        return;
      }
      const line = (ok, label, fixLabel, what) => h("div", { class: `health${ok ? " ok" : " bad"}` },
        h("span", { class: "st" }, ok ? "✓" : "!"), h("span", { class: "lbl" }, label),
        ok ? null : h("button", { class: "btn small", onclick: () => { window.AndroidBridge.openSettings(what); setTimeout(draw, 1500); } }, fixLabel));
      rows.append(
        line(st.notifications, "Уведомления разрешены", "Разрешить", "notifications"),
        line(st.fullScreen, "Звонок на весь экран при блокировке", "Разрешить", "fullScreen"),
        line(st.battery, "Без ограничений экономии батареи", "Снять", "battery"),
        line(st.service, "Работа в фоне включена", "Открыть", "app"),
        h("label", { class: "toggle-row" }, h("input", { type: "checkbox", checked: !!st.reliable, onchange: (e) => window.AndroidBridge.setReliable(e.target.checked) }),
          h("span", null, "Надёжные звонки", h("small", null, "Телефон не усыпляет связь с сервером — звонки доходят при выключенном экране. Немного больше расход батареи."))));
    };
    draw();
    sheet([
      h("h3", null, "Звонки"),
      rows,
      h("p", { class: "sheet-note" }, "На Samsung также проверьте: Настройки → Батарея → Ограничения фоновой работы → «Семья» не должна быть в «спящих» приложениях."),
    ]);
  },
  dataSheet() {
    sheet([
      h("h3", null, "Данные и память"),
      h("button", { class: "menu-item", onclick: () => { S.msgs.clear(); toast("Кэш сообщений очищен — переписки загрузятся заново"); } }, h("span", { html: I.trash }), "Очистить кэш сообщений"),
      h("button", { class: "menu-item", onclick: () => {
        if (!Assistant.loaded) { Assistant.load(); Assistant.loaded = true; }
        Assistant.history = []; Assistant.save(); toast("Переписка с ассистентом очищена");
      } }, h("span", { html: I.bot }), "Очистить переписку с ассистентом"),
      h("p", { class: "sheet-note" }, "Фото и видео хранятся на сервере семьи, на телефоне место не занимают."),
    ]);
  },
  aboutSheet() {
    sheet([
      h("div", { class: "profile-card" }, h("div", { class: "avatar lg", style: { background: "var(--hdr)" } }, "🏠"), h("h3", null, `${CFG.appName || "Семья"} ${this.version()}`)),
      h("p", { class: "sheet-note", style: { textAlign: "center" } }, "Семейный мессенджер: чаты, звонки и видеочаты, истории, ассистент."),
    ]);
  },
  logoutSheet() {
    let close;
    close = sheet([
      h("h3", null, "Выйти из аккаунта?"),
      h("button", { class: "menu-item danger", onclick: async () => {
        close(); await S.sb.auth.signOut(); window.AndroidBridge?.loggedOut?.(); location.hash = ""; location.reload();
      } }, h("span", { html: I.logout }), "Выйти"),
      h("button", { class: "menu-item", onclick: () => close() }, h("span", { html: I.close }), "Отмена"),
    ]);
  },

  // ── свайп влево по сообщению — ответить (как в Telegram)
  swipeReply(el, m) {
    let sx = 0, sy = 0, dx = 0, active = false, decided = false;
    const bubble = () => el.querySelector(".bubble") || el;
    el.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; active = true; decided = false; }, { passive: true });
    el.addEventListener("touchmove", (e) => {
      if (!active) return;
      const x = e.touches[0].clientX - sx, y = e.touches[0].clientY - sy;
      if (!decided) { if (Math.abs(x) < 8 && Math.abs(y) < 8) return; decided = true; if (Math.abs(y) > Math.abs(x) || x > 0) { active = false; return; } }
      dx = Math.max(-90, Math.min(0, x));
      bubble().style.transform = `translateX(${dx}px)`;
      el.classList.toggle("swipe-ready", dx < -60);
    }, { passive: true });
    const end = () => {
      if (!active) return; active = false;
      const b = bubble(); b.style.transition = "transform .18s"; b.style.transform = "";
      setTimeout(() => { b.style.transition = ""; }, 200);
      el.classList.remove("swipe-ready");
      if (dx < -60 && !m.deleted && !String(m.id).startsWith("tmp-")) { navigator.vibrate?.(12); setReply(m); $("#input")?.focus(); }
    };
    el.addEventListener("touchend", end); el.addEventListener("touchcancel", end);
  },

  // ── кнопка «вниз» в чате
  scrollButton(view) {
    const btn = h("button", { class: "to-bottom hidden", title: "Вниз", html: I.down, onclick: () => { const box = $("#msgs"); box?.scrollTo({ top: box.scrollHeight, behavior: "smooth" }); } });
    view.append(btn);
    const box = view.querySelector("#msgs");
    box.addEventListener("scroll", () => btn.classList.toggle("hidden", box.scrollHeight - box.scrollTop - box.clientHeight < 300), { passive: true });
  },
};

const APP_VERSION = "2.1";
