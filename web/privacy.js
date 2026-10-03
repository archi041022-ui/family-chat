/* Конфиденциальность (как в Telegram): кто видит время захода, фото, «О себе», день рождения, телефон,
   кто может звонить, писать, отправлять голосовые, приглашать в группы, дарить подарки; чёрный список.
   Свои правила видит только владелец; про других сервер сообщает лишь «мне можно / нельзя». */
"use strict";

const PRIVACY_KEYS = [
  ["phone", "Номер телефона", "Кто видит мой номер телефона", "📱"],
  ["last_seen", "Время захода и «в сети»", "Кто видит, когда я был(а) в сети. Остальные увидят «был(а) недавно».", "🕒"],
  ["photo", "Фотография профиля", "Кто видит фото моего профиля", "🖼"],
  ["bio", "О себе", "Кто видит «О себе» и город в моём профиле", "💬"],
  ["birthday", "Дата рождения", "Кто видит мой день рождения", "🎂"],
  ["gifts", "Подарки — кто может дарить", "Кто может дарить мне подарки", "🎁"],
  ["gifts_show", "Подарки в профиле — кто видит", "Кто видит полученные мной подарки в профиле", "🏅"],
  ["forwards", "Пересылка сообщений", "Чьё имя будет видно, когда мои сообщения пересылают. Остальным — «Скрытый пользователь».", "↪️"],
  ["calls", "Звонки", "Кто может мне звонить", "📞"],
  ["voice", "Голосовые и видеосообщения", "Кто может отправлять мне голосовые и кружки", "🎤"],
  ["messages", "Личные сообщения", "Кто может писать мне в личные сообщения", "✉️"],
  ["groups", "Приглашения в группы и каналы", "Кто может добавлять меня в группы и каналы", "👥"],
];

const Privacy = {
  mine: {}, blocked: [], view: new Map(), loaded: false,

  async load() {
    if (!S.me) return;
    try {
      const [{ data: g }, { data: v }] = await Promise.all([S.sb.rpc("privacy_get"), S.sb.rpc("privacy_view")]);
      this.mine = g?.data || {}; this.blocked = g?.blocked || [];
      this.view = new Map((v || []).map((x) => [x.user_id, x.r || {}]));
      this.loaded = true;
    } catch { /* без сервера — всё разрешено */ }
  },
  // разрешил ли мне человек uid (по его правилам)
  can(uid, key) { if (!uid || uid === S.me?.id) return true; const r = this.view.get(uid); return !r || r[key] !== false; },
  blockedMe(uid) { return !!this.view.get(uid)?.blocked_me; },
  isBlocked(uid) { return this.blocked.includes(uid); },
  // разрешаю ли Я человеку uid (мои правила — проверка на моей стороне, например для входящих звонков)
  allows(uid, key) {
    if (!uid || uid === S.me?.id) return true;
    if (this.isBlocked(uid)) return false;
    const r = this.mine[key]; if (!r) return true;
    return r.mode === "nobody" ? (r.allow || []).includes(uid) : !(r.deny || []).includes(uid);
  },
  // отметки о прочтении: если я свои скрыл — не вижу и чужие (как в Telegram)
  readOk(uid) { return this.mine.read !== false && this.can(uid, "read"); },

  // скрываем у профиля то, что человек не разрешил мне видеть
  mask(p) {
    if (!p || p.id === S.me?.id || !this.view.has(p.id)) return p;
    const q = { ...p };
    if (!this.can(p.id, "photo")) q.avatar_path = null;
    if (!this.can(p.id, "last_seen")) { q.last_seen = null; q._seenHidden = true; }
    if (!this.can(p.id, "bio")) { q.bio = null; q.city = null; }
    if (!this.can(p.id, "birthday")) q.birthday = null;
    if (!this.can(p.id, "phone")) q.phone = null;
    return q;
  },
  async refresh() {
    await this.load(); await loadProfiles();
    try { if (Live.presence) S.online = onlineFrom(Live.presence.presenceState()); } catch { /* */ }   // «в сети» — с учётом новых правил
    renderChatList(); updateChatSub(); Stories.renderAll(); Tg.refreshPresence?.();
    if (S.tab === "contacts") Tg.renderContacts();
  },
  async save() {
    const { data, error } = await S.sb.rpc("privacy_save", { data: this.mine });
    if (error || data !== "OK") { toast("Не удалось сохранить"); return false; }
    Live.broadcast("privacy", {});
    return true;
  },
  async block(uid, on) {
    const { data } = await S.sb.rpc("block_user", { target: uid, block: on });
    if (data !== "OK") { toast("Не удалось"); return; }
    this.blocked = on ? [...new Set([...this.blocked, uid])] : this.blocked.filter((x) => x !== uid);
    Live.broadcast("privacy", {});
    toast(on ? `🚫 ${S.profiles.get(uid)?.name || "Пользователь"} в чёрном списке` : "Убран(а) из чёрного списка");
  },

  // ── экраны
  summary(key) {
    const r = this.mine[key]; if (!r) return "Все";
    if (r.mode === "nobody") return "Никто" + ((r.allow || []).length ? ` (+${r.allow.length})` : "");
    return "Все" + ((r.deny || []).length ? ` (−${r.deny.length})` : "");
  },
  sheet() {
    let close;
    const box = h("div", { class: "pv-sheet" });
    const draw = () => {
      box.innerHTML = "";
      const row = (icon, label, value, fn) => h("button", { class: "menu-item tg-set", onclick: fn },
        h("span", { class: "pv-ico" }, icon), h("span", { class: "lbl" }, label), value != null ? h("small", { class: "val" }, value) : null);
      const people = [...S.profiles.values()].filter((p) => p.id !== S.me.id);
      box.append(
        h("div", { class: "set-cap" }, "Безопасность"),
        h("div", { class: "set-group" },
          row("🚫", "Чёрный список", String(this.blocked.length || "нет"), () => this.blockedSheet(draw)),
          row("🔐", "Код-пароль и отпечаток", Lock.enabled() ? "вкл" : "выкл", () => Lock.sheet()),
          row("🗝", "Кодовое слово для восстановления", null, () => recoveryWordSheet())),
        h("div", { class: "set-cap" }, "Конфиденциальность"),
        h("div", { class: "set-group" }, PRIVACY_KEYS.map(([k, l, , ic]) => row(ic, l, this.summary(k), () => this.ruleSheet(k, draw)))),
        h("div", { class: "set-group pv-flags" },
          h("label", { class: "toggle-row" }, h("input", { type: "checkbox", checked: this.mine.read !== false, onchange: async (e) => {
            this.mine.read = e.target.checked; if (await this.save()) toast(e.target.checked ? "Отметки о прочтении включены" : "Отметки о прочтении выключены");
          } }), h("span", null, "Отметки о прочтении", h("small", null, "Если выключить, другие не увидят, что вы прочитали, — и вы не увидите их отметки"))),
          h("label", { class: "toggle-row" }, h("input", { type: "checkbox", checked: Prefs.get("preview") !== false, onchange: (e) => Prefs.set("preview", e.target.checked) }),
            h("span", null, "Текст сообщений в уведомлениях", h("small", null, "Если выключить, на экране блокировки будет только «Новое сообщение»")))),
        h("p", { class: "sheet-note" }, people.length ? "Исключения можно задать для каждого правила: «Всегда разрешать» или «Никогда не разрешать»." : ""),
      );
    };
    close = sheet([h("h3", null, "🔒 Конфиденциальность"), box]);
    draw();
  },
  ruleSheet(key, done) {
    const [, label, hint] = PRIVACY_KEYS.find((x) => x[0] === key);
    const r = JSON.parse(JSON.stringify(this.mine[key] || { mode: "all", allow: [], deny: [] }));
    r.allow = r.allow || []; r.deny = r.deny || [];
    let close;
    const box = h("div");
    const people = [...S.profiles.values()].filter((p) => p.id !== S.me.id && !p.banned).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const draw = () => {
      box.innerHTML = "";
      const radio = (mode, text) => h("label", { class: "pv-radio" }, h("input", { type: "radio", name: "pvmode", checked: r.mode === mode, onchange: () => { r.mode = mode; draw(); } }), text);
      const list = r.mode === "nobody" ? r.allow : r.deny;
      box.append(
        h("p", { class: "sheet-note" }, hint),
        h("div", { class: "set-group pv-modes" }, radio("all", "Все в семье"), radio("nobody", "Никто")),
        h("div", { class: "set-cap" }, r.mode === "nobody" ? "Всегда разрешать" : "Никогда не разрешать"),
        h("div", { class: "set-group" }, people.length ? people.map((p) => h("label", { class: "pv-person" },
          h("input", { type: "checkbox", checked: list.includes(p.id), onchange: (e) => {
            const arr = r.mode === "nobody" ? r.allow : r.deny, i = arr.indexOf(p.id);
            if (e.target.checked && i < 0) arr.push(p.id); if (!e.target.checked && i >= 0) arr.splice(i, 1);
          } }), avatarEl(p.id, "sm"), h("span", null, p.name))) : h("p", { class: "sheet-note" }, "В семье пока никого нет")));
    };
    close = sheet([h("h3", null, label), box,
      h("button", { class: "btn wide", onclick: async () => {
        this.mine[key] = { mode: r.mode, allow: r.mode === "nobody" ? r.allow : [], deny: r.mode === "all" ? r.deny : [] };
        if (await this.save()) { toast("Сохранено"); close(); done?.(); }
      } }, "Сохранить")]);
    draw();
  },
  blockedSheet(done) {
    let close;
    const box = h("div");
    const draw = () => {
      box.innerHTML = "";
      const list = this.blocked.map((id) => S.profiles.get(id)).filter(Boolean);
      if (!list.length) box.append(h("p", { class: "sheet-note" }, "Чёрный список пуст. Заблокированные не могут писать вам, звонить, дарить подарки и не видят ваш профиль и время захода."));
      for (const p of list) box.append(h("div", { class: "pv-person" }, avatarEl(p.id, "sm"), h("span", null, p.name),
        h("button", { class: "btn ghost small", onclick: async () => { await this.block(p.id, false); draw(); done?.(); } }, "Разблокировать")));
      const others = [...S.profiles.values()].filter((p) => p.id !== S.me.id && !this.isBlocked(p.id));
      if (others.length) box.append(h("button", { class: "menu-item", onclick: () => {
        let c2;
        c2 = sheet([h("h3", null, "Заблокировать"), ...others.map((p) => h("button", { class: "menu-item", onclick: async () => { c2(); await this.block(p.id, true); draw(); done?.(); } }, avatarEl(p.id, "sm"), p.name))]);
      } }, h("span", null, "➕"), "Заблокировать пользователя"));
    };
    close = sheet([h("h3", null, "🚫 Чёрный список"), box]);
    draw();
  },
};
const seenText = (p) => (p?._seenHidden ? "был(а) недавно" : lastSeen(p?.last_seen));
