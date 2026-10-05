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
    this.data = Object.assign({ pinned: [], muted: [], sound: true, vibrate: true, preview: true, inAppSound: true, fontSize: 16, pattern: true, enterSend: false, nStories: true, nReacts: true, asstFab: true }, this.data);
    return this.data;
  },
  get(k) { return this.load()[k]; },
  set(k, v) {
    this.load()[k] = v; try { localStorage.setItem(this.key(), JSON.stringify(this.data)); } catch { /* */ }
    if (["muted", "preview", "nStories", "nReacts"].includes(k) && typeof Push !== "undefined") Push.syncPrefs();
  },
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
  text(body) { return body ? String(body).replace("\u2061st", "").replace(/\u2062fx:[a-z]+/, "").replace(EDIT_MARK, "").replace(FWD_RE, "").split("\u2064")[0] : body; },
  original(body) { const i = body ? String(body).indexOf("\u2064") : -1; return i >= 0 ? String(body).slice(i + 1).replace(/\u2062fx:[a-z]+/, "").replace(EDIT_MARK, "") : null; },
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
    this.tts = this.tts || new Map(); clearTimeout(this.tts.get(p.chat_id)); this.tts.set(p.chat_id, setTimeout(() => this.refreshTyping(p.chat_id), 5200));
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
      h("button", { class: "menu-item", onclick: () => { close(); Wallpaper.sheet(c.id); } }, h("span", { html: I.palette }), "Фон чата"),
      h("button", { class: "menu-item", onclick: () => { close(); Tr.sheet(c); } }, h("span", null, "🌐"), h("span", null, "Перевод сообщений", h("small", { class: "sub" }, Tr.chat(c.id).out ? `мои → ${Tr.langName(Tr.chat(c.id).out)}` : "входящие — автоматически"))),
      Protect.canChange(c) ? h("button", { class: "menu-item", onclick: () => { close(); Protect.toggle(c); } }, h("span", null, "🛡"), c.protected ? "Снять защиту содержимого" : "Защитить от копирования и снимков") : null,
      h("button", { class: "menu-item", onclick: () => { close(); Select.start(null); toast("Нажимайте на сообщения, чтобы выбрать"); } }, h("span", { html: I.ticks }), "Выбрать сообщения"),
      h("button", { class: "menu-item danger", onclick: () => { close(); Select.clearHistory(c); } }, h("span", { html: I.trash }), "Очистить историю"),
      h("button", { class: "menu-item", onclick: () => { close(); chatInfo(c); } }, h("span", { html: I.info }), c.is_group ? "Информация о группе" : "Профиль"),
    ]);
  },

  // ── поиск по сообщениям чата
  searchInChat(c) {
    let close;
    const input = h("input", { placeholder: "Найти в переписке", autofocus: true });
    const results = h("div", { class: "search-results" });
    let timer, runId = 0;
    const run = async () => {
      const q = input.value.trim().toLowerCase();
      const my = ++runId;
      results.innerHTML = "";
      if (q.length < 2) return;
      const found = new Map();
      for (const m of S.msgs.get(c.id) || []) if (!m.deleted && m.body && this.text(m.body).toLowerCase().includes(q)) found.set(m.id, m);
      try {
        const { data } = await S.sb.from("messages").select("*").eq("chat_id", c.id).ilike("body", `%${q}%`).order("created_at", { ascending: false }).limit(60);
        for (const m of data || []) if (!m.deleted) found.set(m.id, m);
      } catch { /* только загруженные */ }
      if (my !== runId) return;                       // пока ждали ответ, запрос уже изменился
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
    // догружаем историю, пока не найдём сообщение (список каждый раз читаем заново — loadMessages кладёт новый массив)
    for (let i = 0; i < 20 && !(S.msgs.get(chatId) || []).some((x) => x.id === m.id); i++) {
      const more = await loadMessages(chatId, (S.msgs.get(chatId) || [])[0]?.created_at);
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
    if (Protect.on(S.chats.find((c) => c.id === m.chat_id))) { toast("🛡 Пересылка из защищённого чата запрещена"); return; }
    let close;
    const name = Privacy.can(m.user_id, "forwards") ? (S.profiles.get(m.user_id)?.name || "участника") : "Скрытый пользователь";
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
      h("button", { class: "menu-item tg-action", onclick: () => Invite.fromContacts() }, h("span", { class: "tg-ico", style: { background: "#F2A541" }, html: I.user }), "Пригласить из контактов телефона"),
      h("button", { class: "menu-item tg-action", onclick: () => showTab("invite") }, h("span", { class: "tg-ico", style: { background: "#2EAD6B" }, html: I.invite }), "Пригласить в семью"),
      h("button", { class: "menu-item tg-action", onclick: () => newGroupSheet() }, h("span", { class: "tg-ico", style: { background: "#3D8BFD" }, html: I.group }), "Создать группу"),
      h("button", { class: "menu-item tg-action", onclick: () => Assistant.open() }, h("span", { class: "tg-ico", style: { background: "var(--accent)" }, html: I.bot }), "Мой ассистент"),
      h("div", { class: "list-caption" }, `Семья · ${people.length + 1} ${plural(people.length + 1, "человек", "человека", "человек")}`),
      h("div", { class: "contact-row me", "data-name": (S.me.name || "").toLowerCase() },
        avatarEl(S.me.id), h("div", { class: "mid" }, h("b", null, S.me.name + " (вы)"), h("small", null, S.me.status || "в сети"))));
    if (!people.length) box.append(h("p", { class: "empty-chat" }, "Пока никого нет. Пригласите семью — кнопка выше."));
    // ближайшие дни рождения
    const soon = [S.me, ...people].map((p) => ({ p, d: this.daysToBirthday(p.birthday) })).filter((x) => x.d != null && x.d <= 14).sort((a, b) => a.d - b.d);
    if (soon.length) box.insertBefore(h("div", { class: "bday-banner" }, soon.map(({ p, d }) =>
      h("div", { onclick: () => this.profileView(p.id) }, d === 0 ? "🎂 " : "🎁 ", h("b", null, p.id === S.me.id ? "У вас" : p.name),
        d === 0 ? " — день рождения сегодня!" : ` — день рождения через ${d} ${plural(d, "день", "дня", "дней")}`))),
      box.querySelector(".list-caption"));
    for (const p of people) {
      const on = S.online.has(p.id);
      box.append(h("div", { class: "contact-row", "data-name": p.name.toLowerCase(), "data-uid": p.id, onclick: () => openDm(p.id) },
        avatarEl(p.id, "", { onclick: (e) => { e.stopPropagation(); this.profileView(p.id); } }),
        h("div", { class: "mid" }, h("b", null, p.name, EStatus.badge(p.id), p.family_role ? h("span", { class: "role-chip" }, p.family_role) : null),
          h("small", { class: `cstat${on ? " online" : ""}` }, this.presenceText(p))),
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
  presenceText(p) { const on = S.online.has(p.id); return (on ? "в сети" : seenText(p) || "был(а) давно") + (p.status ? " · " + p.status : ""); },
  // «в сети» / «был(а) …» в контактах обновляем на месте, не перерисовывая список
  refreshPresence() {
    for (const row of document.querySelectorAll("#tabContacts .contact-row[data-uid]")) {
      const p = S.profiles.get(row.dataset.uid), s = row.querySelector(".cstat"); if (!p || !s) continue;
      s.textContent = this.presenceText(p); s.classList.toggle("online", S.online.has(p.id));
    }
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
        h("div", { class: "mid" }, h("b", null, S.me.name, EStatus.badge(S.me.id)), h("small", null, (login ? "@" + login + " · " : "") + (S.me.status || "в сети"))),
        h("span", { class: "chev", html: I.pen })),
      group(
        item("#3D8BFD", I.user, "Изменить профиль", () => openProfile()),
        item("#F2A541", I.pushpin, "Статус", () => openProfile(), { value: S.me.status || "нет" }),
        item("#9B5DE5", I.palette, "Эмодзи-статус", () => EStatus.sheet(), { value: EStatus.of(S.me.id) || "нет" })),
      group(
        item("#3E4A5A", I.lock, "Конфиденциальность", () => Privacy.sheet()),
        item("#E0457B", I.bell, "Уведомления и звуки", () => this.notifSheet()),
        item("#2EAD6B", I.phone, "Звонки", () => this.callsSheet()),
        item("#2EAD6B", I.lock, "Вход по отпечатку", () => Lock.sheet(), { value: Lock.enabled() ? "вкл" : "выкл" }),
        item("#6C7A89", I.lock, "Сменить пароль", () => changePasswordSheet()),
        item("#00A6A6", I.key, "Кодовое слово для восстановления", () => recoveryWordSheet()),
        item("#9B5DE5", I.palette, "Оформление и цвета", () => Theme.sheet()),
        item("#F2A541", I.gallery || I.clip, "Фон чатов", () => Wallpaper.sheet(null)),
        item("#E0457B", I.bell, "Мелодии", () => Snd.sheet(), { value: Snd.title("ring") }),
        item("#3D8BFD", I.data, "Данные и память", () => this.dataSheet())),
      group(
        item("#4F6BED", I.bot, "Ассистент: голос и поведение", () => { if (!Assistant.loaded) { Assistant.load(); Assistant.loaded = true; } Assistant.settingsSheet(); }),
        h("div", { class: "set-toggle" }, this.toggle("Плавающий значок ассистента", "asstFab", "Маленький значок поверх экрана, можно двигать пальцем", () => AsstFab.sync()))),
      h("p", { class: "set-note" }, "Ассистент, задачи, видеоредактор, приглашения, обновления — в разделе «Меню» (внизу слева)."),
      group(
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
      this.toggle("Новые истории семьи", "nStories", "Оповещение, когда кто-то выложил историю"),
      this.toggle("Реакции на мои сообщения и истории", "nReacts"),
      this.toggle("Звук отправки в открытом чате", "inAppSound"),
      h("button", { class: "menu-item", onclick: () => Snd.sheet() }, h("span", { html: I.bell }), h("span", null, "Мелодии звонка и уведомлений", h("small", { class: "sub" }, `Звонок: ${Snd.title("ring")} · Сообщения: ${Snd.title("msg")}`))),
      S.isAdmin ? h("button", { class: "menu-item", onclick: () => FcmSetup.sheet() }, h("span", { html: I.bell }), "⚡ Мгновенные оповещения (администратор)") : null,
      window.AndroidBridge?.openSettings ? h("button", { class: "menu-item", onclick: () => window.AndroidBridge.openSettings?.("notifications") }, h("span", { html: I.gear }), "Системные настройки уведомлений") : null,
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
        ok ? null : h("button", { class: "btn small", onclick: () => { window.AndroidBridge.openSettings?.(what); setTimeout(draw, 1500); } }, fixLabel));
      rows.append(
        line(st.notifications, "Уведомления разрешены", "Разрешить", "notifications"),
        line(st.overlay !== false, "Показ поверх других приложений (включает экран при звонке)", "Разрешить", "overlay"),
        line(st.fullScreen, "Звонок на весь экран при блокировке", "Разрешить", "fullScreen"),
        line(st.battery, "Без ограничений экономии батареи", "Снять", "battery"),
        line(st.service, "Работа в фоне включена", "Открыть", "app"),
        h("label", { class: "toggle-row" }, h("input", { type: "checkbox", checked: !!st.reliable, onchange: (e) => window.AndroidBridge.setReliable?.(e.target.checked) }),
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
      h("label", { class: "toggle-row" }, h("span", null, "Расшифровывать голосовые сами", h("small", null, "Входящие голосовые и кружки превращаются в текст прямо на телефоне")),
        h("input", { type: "checkbox", checked: Prefs.get("sttAuto") !== false, onchange: (e) => Prefs.set("sttAuto", e.target.checked) })),
      h("button", { class: "menu-item", onclick: async () => { try { await caches.delete("stt-v1"); STT.model = null; STT.loading = null; toast("Модель распознавания речи удалена (≈45 МБ)"); } catch { /* */ } } }, h("span", { html: I.trash }), "Удалить модель распознавания речи"),
      h("button", { class: "menu-item", onclick: () => { S.msgs.clear(); if (S.current) loadMessages(S.current).then(() => renderMessages(false)); toast("Кэш сообщений очищен — переписки загрузятся заново"); } }, h("span", { html: I.trash }), "Очистить кэш сообщений"),
      h("button", { class: "menu-item", onclick: () => {
        if (!Assistant.loaded) { Assistant.load(); Assistant.loaded = true; }
        Assistant.history = []; Assistant.save(); toast("Переписка с ассистентом очищена");
      } }, h("span", { html: I.bot }), "Очистить переписку с ассистентом"),
      h("p", { class: "sheet-note" }, "Фото и видео хранятся на сервере семьи, на телефоне место не занимают."),
    ]);
  },
  aboutSheet() { Updates.sheet(); },
  logoutSheet() {
    let close;
    close = sheet([
      h("h3", null, "Выйти из аккаунта?"),
      h("button", { class: "menu-item danger", onclick: async () => {
        close(); await Live.leave(); await Push.logout(); await S.sb.auth.signOut(); window.AndroidBridge?.loggedOut?.(); location.hash = ""; location.reload();
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

const APP_VERSION = "3.4";

// ───────────── Карточка участника «О себе» ─────────────
Object.assign(Tg, {
  daysToBirthday(b) {
    if (!b) return null;
    const [y, m, d] = String(b).split("-").map(Number); if (!m || !d) return null;
    const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let next = new Date(now.getFullYear(), m - 1, d);
    if (next < today) next = new Date(now.getFullYear() + 1, m - 1, d);
    return Math.round((next - today) / 864e5);
  },
  fmtBirthday(b) {
    const [y, m, d] = String(b).split("-").map(Number);
    const date = new Date(2000, m - 1, d).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    const now = new Date();
    let age = now.getFullYear() - y; if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
    const days = this.daysToBirthday(b);
    return `${date}${y > 1900 ? `, ${age} ${plural(age, "год", "года", "лет")}` : ""}${days === 0 ? " — сегодня! 🎂" : days <= 30 ? ` · через ${days} ${plural(days, "день", "дня", "дней")}` : ""}`;
  },
  profileView(uid) {
    const p = S.profiles.get(uid); if (!p) return;
    const me = uid === S.me.id;
    const on = S.online.has(uid);
    let close; const slot = h("div", { class: "pv-gifts-slot" });
    const row = (icon, label, value, onclick) => value ? h("div", { class: `info-row${onclick ? " link" : ""}`, onclick },
      h("span", { class: "info-ico" }, icon), h("div", null, h("div", { class: "info-val" }, value), h("small", null, label))) : null;
    const since = p.created_at ? new Date(p.created_at).toLocaleDateString("ru-RU", { month: "long", year: "numeric" }) : "";
    const act = (icon, label, fn) => h("button", { class: "pv-act", onclick: () => { close(); fn(); } }, h("span", { html: icon }), label);
    const info = [
      row("👪", "Кто в семье", p.family_role),
      row("💬", "О себе", p.bio),
      row("🎂", "День рождения", p.birthday ? this.fmtBirthday(p.birthday) : null),
      row("📍", "Город", p.city),
      row("📱", "Телефон", p.phone, p.phone && !me ? () => { const u = "tel:" + p.phone.replace(/[^+\d]/g, ""); if (window.AndroidBridge?.openUrl) window.AndroidBridge.openUrl(u); else location.href = u; } : null),
      row("📝", "Статус", p.status),
      row("🏠", "В семье с", since),
    ].filter(Boolean);
    close = sheet([
      h("div", { class: "pv-head" }, avatarEl(uid, "xl", p.avatar_path && S.urls.get(p.avatar_path) ? { onclick: () => lightbox(S.urls.get(p.avatar_path)) } : {}),
        h("h2", null, p.name, EStatus.badge(uid, "lg")), h("small", { class: on ? "online" : "" }, me ? "это вы" : on ? "в сети" : seenText(p) || "был(а) давно")),
      me ? h("div", { class: "pv-actions" }, act(I.pen, "Изменить", () => openProfile()))
        : h("div", { class: "pv-actions" },
          act(I.chat, "Написать", () => openDm(uid)),
          act(I.phone, "Позвонить", () => Calls.start(uid, false)),
          act(I.video, "Видео", () => Calls.start(uid, true)),
          act("<span class='pv-emo'>🎁</span>", "Подарок", () => Privacy.can(uid, "gifts") ? Gifts.compose(uid) : toast(`${p.name} не принимает подарки`))),
      info.length > 2 || p.bio || p.family_role ? h("div", { class: "pv-info" }, info)
        : h("div", { class: "pv-info" }, info, h("p", { class: "sheet-note", style: { textAlign: "center", margin: "8px" } },
          me ? "Расскажите о себе: нажмите «Изменить» и заполните анкету." : "Пока ничего не рассказал(а) о себе.")),
      slot,
      me ? null : h("button", { class: `menu-item${Privacy.isBlocked(uid) ? "" : " danger"}`, onclick: async () => { close(); await Privacy.block(uid, !Privacy.isBlocked(uid)); } },
        h("span", null, "🚫"), Privacy.isBlocked(uid) ? "Разблокировать" : "Заблокировать"),
    ]);
    Gifts.section(uid).then((el) => slot.replaceWith(el)).catch(() => {});
  },
});

// ───────────── Обновления приложения ─────────────
// Каждый телефон сам проверяет, вышла ли новая сборка (GitHub Releases), и напоминает о ней.
const Updates = {
  own: null, latest: null, last: 0,
  repo() { return CFG.updateRepo || "archi041022-ui/family-chat"; },
  async ownBuild() {
    if (this.own) return this.own;
    try { const r = await fetch("build.json", { cache: "no-store" }); this.own = r.ok ? await r.json() : { build: 0 }; }
    catch { this.own = { build: 0 }; }
    if (!this.own.version) this.own.version = APP_VERSION;
    return this.own;
  },
  start() {
    clearInterval(this.timer);
    // после установки сборка уже новее ожидавшейся — гасим подсветку сразу, не дожидаясь проверки
    this.ownBuild().then((own) => {
      let pend = 0; try { pend = +(localStorage.getItem("updPending") || 0); } catch { /* */ }
      if (pend && own.build && own.build >= pend) { try { localStorage.removeItem("updPending"); } catch { /* */ } window.AndroidBridge?.updateClear?.(); }
      else if (pend && own.build) setTimeout(() => document.querySelector("#tabBtnMenu")?.classList.add("upd-glow"), 1500);   // обновление ещё не поставлено — подсветка с первой секунды
    });
    setTimeout(() => this.check(false), 5000);
    this.timer = setInterval(() => this.check(false), 6 * 3600e3);
  },
  maybeCheck() { this.resume(); if (Date.now() - this.last > 6 * 3600e3) this.check(false); },
  async check(manual) {
    this.last = Date.now();
    const own = await this.ownBuild();
    let found = null;
    try {
      if (!window.AndroidBridge) {
        // сайт обновляется сам — достаточно перезагрузить страницу
        const r = await fetch("build.json?t=" + Date.now(), { cache: "no-store" });
        const j = r.ok ? await r.json() : null;
        if (j && own.build && j.build > own.build) found = { build: j.build, version: j.version || "", web: true };
      } else {
        const r = await fetch(`https://api.github.com/repos/${this.repo()}/releases/latest`, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
        if (!r.ok) throw new Error(r.status);
        const j = await r.json();
        const build = +((j.tag_name || "").match(/(\d+)/) || [])[1] || 0;
        const apk = (j.assets || []).find((a) => /\.apk$/i.test(a.name));
        const ver = ((j.body || "").match(/v(\d+\.\d+(?:\.\d+)?)/) || [])[1] || "";
        if (own.build && build > own.build && apk)
          found = { build, version: ver, url: apk.browser_download_url, notes: (j.body || "").replace(/\n*Co-Authored-By:[\s\S]*$/i, "").replace(/\n*Claude-Session:[\s\S]*$/i, "").trim(), date: j.published_at };
      }
    } catch (e) {
      if (manual) toast("Не удалось проверить обновления. Проверьте интернет.");
      return null;
    }
    this.latest = found;
    this.paint();
    if (found) { this.announce(); this.auto(); }
    else if (manual) toast(own.build ? "У вас последняя версия ✓" : "Проверка доступна в установленном приложении");
    renderChatList();
    return found;
  },
  // Пока обновление не установлено: значок «Меню» подсвечен, плитка «Обновить» пульсирует, а на Android — постоянное
  // уведомление и точка на значке приложения. Всё гаснет само, когда стоит сборка не старше последней.
  paint() {
    const f = this.latest;
    document.querySelector("#tabBtnMenu")?.classList.toggle("upd-glow", !!f);
    try {
      if (f) { localStorage.setItem("updPending", String(f.build)); window.AndroidBridge?.updateNotice?.(f.version || ""); }
      else { localStorage.removeItem("updPending"); window.AndroidBridge?.updateClear?.(); }
    } catch { /* */ }
    if (S.tab === "menu") Menu.render();
  },
  announce() {
    const f = this.latest; if (!f) return;
    let seen = 0; try { seen = +(localStorage.getItem("updNotified") || 0); } catch { /* */ }
    if (Prefs.get("updRemind") === false || seen >= f.build) return;
    try { localStorage.setItem("updNotified", String(f.build)); } catch { /* */ }
    const title = `Вышло обновление${f.version ? " " + f.version : ""}`;
    if (window.AndroidBridge?.notify && !appVisible()) window.AndroidBridge.notify(`${CFG.appName || "Семья"}: ${title.toLowerCase()}`, "Откройте приложение и нажмите «Обновить»", null);
    else toast(`🎉 ${title}! Нажмите на полосу вверху списка чатов`, 5000);
  },
  banner() {
    const f = this.latest; if (!f || Prefs.get("updRemind") === false) return null;
    return h("div", { class: "upd-banner", onclick: () => this.sheet() },
      h("span", { class: "upd-ico" }, "🎉"),
      h("div", { class: "mid" }, h("b", null, `Доступна новая версия${f.version ? " " + f.version : ""}`), h("small", null, f.web ? "Нажмите, чтобы обновить страницу" : "Нажмите, чтобы скачать и установить")),
      h("button", { class: "btn small", onclick: (e) => { e.stopPropagation(); this.install(); } }, h("span", { html: I.download }), "Обновить"),
      h("div", { class: "upd-progress hidden" }, h("div", { class: "track" }, h("i")), h("small", null, "")));
  },
  // Скачать и установить. В приложении Android — само скачивает и открывает установку.
  install() {
    const f = this.latest;
    if (!f || f.web) { location.reload(); return; }
    const b = window.AndroidBridge;
    if (b?.downloadUpdate) {
      if (this.progress >= 0 && this.progress < 100) { toast("Обновление уже скачивается…"); return; }
      this.progress = 0; this.drawProgress();
      try { localStorage.setItem("updStarted", String(f.build)); } catch { /* */ }
      b.downloadUpdate(f.url);
      return;
    }
    if (b?.openUrl) b.openUrl(f.url); else window.open(f.url, "_blank", "noopener");
    toast("Скачивается обновление. Откройте файл и нажмите «Установить» — переписки сохранятся.", 6000);
  },
  onProgress(p) {
    this.progress = p;
    if (p === -1) { toast("Не удалось скачать обновление. Проверьте интернет и попробуйте ещё раз.", 4500); this.progress = null; }
    if (p === 100) toast("Обновление скачано — подтвердите установку", 4000);
    if (p === 101) { this.needPerm = true; this.progress = null; toast("Разрешите «Семье» устанавливать обновления и вернитесь в приложение", 6000); }
    this.drawProgress();
  },
  drawProgress() {
    const p = this.progress;
    document.querySelectorAll(".upd-progress").forEach((el) => {
      el.classList.toggle("hidden", p == null || p < 0 || p > 100);
      const bar = el.querySelector("i"); if (bar) bar.style.width = Math.max(3, Math.min(100, p || 0)) + "%";
      const t = el.querySelector("small"); if (t) t.textContent = p >= 100 ? "Скачано — открываю установку" : `Скачивание… ${p || 0}%`;
    });
  },
  // вернулись из настроек «Установка неизвестных приложений» — продолжаем установку
  resume() {
    if (this.needPerm && window.AndroidBridge?.canInstallUpdates?.()) { this.needPerm = false; window.AndroidBridge.installUpdate(); }
  },
  // автообновление: новая версия скачивается сама, остаётся только подтвердить установку
  auto() {
    const f = this.latest; if (!f || Prefs.get("autoUpdate") === false) return;
    if (f.web) {
      const busy = Calls.ui || GroupCall.active || ($("#input")?.value || "").trim() || $(".recording") || $(".sheet-back") || $("#veRoot, .ve-root") || Voice.cancel;
      if (!busy) location.reload();
      return;
    }
    if (!window.AndroidBridge?.downloadUpdate) return;
    let started = 0; try { started = +(localStorage.getItem("updStarted") || 0); } catch { /* */ }
    if (started >= f.build) return;          // эту версию уже скачивали — не повторяем без спроса
    this.install();
  },
  async sheet() {
    const own = await this.ownBuild();
    const body = h("div");
    const draw = () => {
      body.innerHTML = "";
      const f = this.latest;
      const ver = own.version || APP_VERSION;
      body.append(
        h("div", { class: "about-head" }, h("div", { class: "about-logo" }, "🏠"),
          h("b", null, `${CFG.appName || "Семья"} ${ver}`), h("small", null, own.build ? `сборка ${own.build}` : "семейный мессенджер")),
        h("label", { class: "toggle-row switch" },
          h("span", null, "Автообновление", h("small", null, window.AndroidBridge ? "Новая версия скачивается сама — останется нажать «Установить»" : "Сайт сам перезагрузится на новую версию")),
          h("input", { type: "checkbox", checked: Prefs.get("autoUpdate") !== false, onchange: (e) => { Prefs.set("autoUpdate", e.target.checked); if (e.target.checked) this.auto(); } })),
        h("div", { class: "section-title", style: { padding: "12px 4px 6px" } }, "Скачать обновления"),
        h("button", { class: `upd-dl${f ? " has" : ""}`, onclick: async (e) => {
          if (this.latest) { this.install(); return; }
          const sm = e.currentTarget.querySelector("small"); if (sm) sm.textContent = "Проверяю…";
          await this.check(true); draw();
        } },
          h("span", { class: "upd-arrow", html: I.download }),
          h("span", { class: "mid" },
            h("b", null, f ? `Скачать версию ${f.version || "сборки " + f.build}` : "Проверить и скачать обновления"),
            h("small", null, f ? (f.web ? "Нажмите, чтобы обновить сайт" : "Нажмите — скачается и откроется установка") : `У вас версия ${ver}`))),
        h("div", { class: "upd-progress hidden" }, h("div", { class: "track" }, h("i")), h("small", null, "")),
        f?.notes ? h("div", { class: "upd-new" }, h("b", null, "Что нового"), h("p", null, f.notes)) : null,
        h("label", { class: "toggle-row switch" },
          h("span", null, "Напоминать об обновлениях", h("small", null, "Приложение проверяет новые версии несколько раз в день")),
          h("input", { type: "checkbox", checked: Prefs.get("updRemind") !== false, onchange: (e) => { Prefs.set("updRemind", e.target.checked); renderChatList(); } })));
      this.drawProgress();
    };
    draw();
    sheet([h("h3", null, "О приложении"), body]);
  },
};
window.onUpdateProgress = (p) => Updates.onProgress(p);

// ───────────── Приветствие нового участника ─────────────
const WELCOME_MARK = "👋 Я теперь в «Семье»!";
const Welcome = {
  maybeShow(user) {
    if (window.__noWelcome) return;
    const key = "welcomed:" + S.me.id;
    let done = false; try { done = !!localStorage.getItem(key); localStorage.setItem(key, "1"); } catch { /* */ }
    if (done) return;
    const created = new Date(S.me.created_at || user?.created_at || 0).getTime();
    if (!created || Date.now() - created > 20 * 60e3) return;      // только для только что зарегистрированных
    this.show();
    if ((S.members.get(FAMILY_CHAT) || []).some((m) => m.user_id === S.me.id)) setTimeout(() => postMessage({ body: WELCOME_MARK }, FAMILY_CHAT).catch(() => {}), 1200);
  },
  confetti(n = 70) {
    const box = h("div", { class: "confetti" });
    const colors = ["#E8664F", "#F2A541", "#2EAD6B", "#3D8BFD", "#9B5DE5", "#E0457B", "#00A6A6", "#FFD23F"];
    for (let i = 0; i < n; i++) {
      const p = h("i");
      p.style.left = Math.random() * 100 + "%";
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 1.2).toFixed(2) + "s";
      p.style.animationDuration = (2.4 + Math.random() * 2).toFixed(2) + "s";
      p.style.setProperty("--dx", (Math.random() * 160 - 80).toFixed(0) + "px");
      p.style.setProperty("--rot", (Math.random() * 720 - 360).toFixed(0) + "deg");
      if (i % 3 === 0) p.style.borderRadius = "50%";
      box.append(p);
    }
    return box;
  },
  show() {
    const first = (S.me.name || "").split(" ")[0];
    const slides = [
      ["💬", "Чаты и группы", "Пишите родным, отправляйте фото, видео, голосовые и кружочки."],
      ["📹", "Звонки и видеочат", "Звоните одному человеку или собирайте всю семью в видеочате."],
      ["🤖", "Мой ассистент", "Погода, новости, курс валют. Скажите: «Позвони маме» — и он наберёт."],
    ];
    let i = 0;
    const dots = h("div", { class: "wl-dots" }, slides.map((_, k) => h("i", { class: k === 0 ? "on" : "" })));
    const card = h("div", { class: "wl-card" });
    const showSlide = () => {
      const [ico, t, d] = slides[i];
      card.innerHTML = ""; card.classList.remove("in"); void card.offsetWidth; card.classList.add("in");
      card.append(h("div", { class: "wl-ico" }, ico), h("b", null, t), h("p", null, d));
      dots.querySelectorAll("i").forEach((x, k) => x.classList.toggle("on", k === i));
    };
    const title = h("h1", { class: "wl-title" }, [...`Добро пожаловать в семью${first ? ", " + first : ""}!`].map((ch, k) =>
      h("span", { style: { animationDelay: (0.6 + k * 0.035).toFixed(2) + "s" } }, ch === " " ? "\u00a0" : ch)));
    const el = h("div", { class: "welcome" }, this.confetti(),
      h("div", { class: "wl-house" }, "🏠"),
      h("div", { class: "wl-hearts" }, ...["❤️", "💛", "💚", "💙", "💜"].map((x, k) => h("span", { style: { animationDelay: k * 0.4 + "s", left: 12 + k * 18 + "%" } }, x))),
      title,
      h("p", { class: "wl-sub" }, "Теперь вы с нами — на связи всей семьёй 🤗"),
      card, dots,
      h("button", { class: "btn wl-go", onclick: () => { clearInterval(timer); el.classList.add("out"); setTimeout(() => el.remove(), 500); } }, "Начать общение 🎉"));
    document.body.append(el);
    setTimeout(showSlide, 1600);
    const timer = setInterval(() => { i = (i + 1) % slides.length; showSlide(); }, 3200);
    navigator.vibrate?.([30, 60, 30]);
  },
  // карточка в общем чате: «Мама теперь с нами!»
  card(m) {
    const p = S.profiles.get(m.user_id);
    const mine = m.user_id === S.me.id;
    return h("div", { class: "welcome-card" },
      h("div", { class: "wc-wave" }, "👋"),
      h("b", null, `${p?.name || "Новый участник"} теперь с нами!`),
      h("small", null, mine ? "Вы присоединились к семье" : "Новый участник семьи 🎉"),
      mine ? null : h("button", { class: "btn small", onclick: (e) => {
        e.stopPropagation();
        postMessage({ body: `Привет, ${(p?.name || "").split(" ")[0] || "дорогой"}! Добро пожаловать в семью! 🤗` }, m.chat_id);
      } }, "Поздороваться 👋"));
  },
  // у остальных — салют, когда приходит приветствие нового участника
  celebrate(m) {
    if (Date.now() - new Date(m.created_at).getTime() > 5 * 60e3) return;
    const c = this.confetti(50); c.classList.add("burst");
    document.body.append(c); setTimeout(() => c.remove(), 4500);
    toast(`🎉 ${S.profiles.get(m.user_id)?.name || "Новый участник"} присоединился(-ась) к семье!`, 4000);
  },
};
