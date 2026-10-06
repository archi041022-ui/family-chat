/* v4.3: панель управления администратора. Видна только владельцу приложения; каждое действие сервер
   проверяет сам (is_admin), поэтому подделать вызов с другого аккаунта нельзя. */
"use strict";

const AdminPanel = {
  tab: "people", data: null, log: null, close: null, body: null,
  async open() {
    if (!S.isAdmin) return;
    await loadProfiles();
    this.tab = "people";
    const body = this.body = h("div", { class: "adm-body" });
    const tabs = h("div", { class: "folders adm-tabs" });
    const draw = () => {
      tabs.innerHTML = "";
      for (const [k, l] of [["people", "Люди"], ["chats", "Группы и каналы"], ["log", "Журнал"], ["rules", "Правила"]])
        tabs.append(h("button", { class: this.tab === k ? "on" : "", onclick: () => { this.tab = k; draw(); this.render(k === "log" || k === "chats"); } }, l));
    };
    draw();
    this.close = sheet([h("h3", null, "Панель администратора"), h("p", { class: "sheet-note" }, "Этот раздел видите только вы."), tabs, body]);
    await this.render(true);
  },
  async load() {
    const [ov, lg] = await Promise.all([S.sb.rpc("admin_overview"), S.sb.rpc("admin_log_list", { lim: 80 })]);
    if (ov.error || !ov.data) { toast(/NOT_ADMIN/.test(ov.error?.message || "") ? "Доступно только администратору" : "Панель не загрузилась. Проверьте интернет и обновление базы."); return false; }
    this.data = ov.data; this.log = lg.data || [];
    return true;
  },
  name(id) { return S.profiles.get(id)?.name || "Удалённый участник"; },
  when(t) { return t ? new Date(t).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""; },
  async render(reload) {
    if (!this.body?.isConnected) return;
    if (reload || !this.data) { this.body.innerHTML = ""; this.body.append(h("p", { class: "sheet-note" }, "Загрузка…")); if (!(await this.load())) { this.close?.(); return; } }
    const b = this.body; b.innerHTML = "";
    if (this.tab === "people") this.people(b); else if (this.tab === "chats") this.chats(b); else if (this.tab === "log") this.logView(b); else this.rules(b);
  },
  async setLimits(u, patch, row) {
    const next = { lim_create: u.lim_create, lim_media: u.lim_media, lim_readonly: u.lim_readonly, ...patch };
    const { data, error } = await S.sb.rpc("admin_set_limits", { target: u.id, l_create: next.lim_create, l_media: next.lim_media, l_readonly: next.lim_readonly });
    if (error || data !== "OK") { toast("Не получилось сохранить"); await this.render(true); return; }
    Object.assign(u, next); toast("Сохранено"); this.sumFor(u, row);
  },
  sumFor(u, row) { const s = row?.querySelector(".adm-lim"); if (s) s.textContent = this.limText(u); },
  limText(u) { return [u.lim_readonly ? "только чтение" : "", u.lim_media ? "без медиа" : "", u.lim_create ? "без создания чатов" : ""].filter(Boolean).join(" · ") || "без ограничений"; },
  people(b) {
    const users = this.data.users.filter((u) => u.id !== S.me.id);
    b.append(h("p", { class: "sheet-note" }, `Участников: ${users.length + 1}. Нажмите на человека, чтобы увидеть его активность и задать ограничения.`));
    for (const u of users) {
      const ctl = h("div", { class: "adm-ctl hidden" });
      const row = h("div", { class: `adm-user${u.banned ? " banned" : ""}` });
      const sw = (label, hint, key) => h("label", { class: "toggle-row switch" }, h("span", null, label, h("small", null, hint)),
        h("input", { type: "checkbox", checked: !!u[key], onchange: (e) => this.setLimits(u, { [key]: e.target.checked }, row) }));
      ctl.append(
        sw("Только чтение", "Не может писать нигде", "lim_readonly"),
        sw("Без фото, видео и файлов", "Текстовые сообщения доступны", "lim_media"),
        sw("Нельзя создавать группы и каналы", "Но состоять в них можно", "lim_create"),
        h("button", { class: "menu-item", onclick: () => { this.close?.(); memberActions(S.profiles.get(u.id) || { id: u.id, name: u.name, banned: u.banned }); } }, h("span", { html: I.shield }), "Блокировка, пароль, удаление"));
      row.append(h("button", { class: "adm-head", onclick: () => ctl.classList.toggle("hidden") },
        avatarEl(u.id, "sm"),
        h("div", { class: "mid" }, h("b", null, u.name || this.name(u.id), u.banned ? " ⛔" : ""),
          h("small", null, `групп ${u.groups} · каналов ${u.channels} · сообщений ${u.msgs}`),
          h("small", { class: "adm-lim" }, this.limText(u)))), ctl);
      b.append(row);
    }
    if (!users.length) b.append(h("p", { class: "empty-chat" }, "Других участников пока нет"));
  },
  chats(b) {
    const list = this.data.chats;
    b.append(h("p", { class: "sheet-note" }, `Всего групп и каналов: ${list.length}. Видно, кто что создал.`));
    for (const c of list) {
      b.append(h("div", { class: "admin-row" },
        h("span", { class: "adm-kind" }, c.family ? "🏠" : c.channel ? "📢" : "👥"),
        h("div", { class: "mid" }, h("b", null, c.title || "Без названия"),
          h("small", null, `${c.family ? "общий чат" : c.channel ? "канал" : "группа"}${c.private ? " · приватный" : ""} · создал(а): ${c.by ? this.name(c.by) : "—"} · ${this.when(c.at)}`),
          h("small", null, `участников ${c.members} · сообщений ${c.msgs}`)),
        c.family ? null : h("button", { class: "icon-btn", title: "Удалить", html: I.trash, onclick: () => {
          this.close?.();
          confirmSheet(`Удалить «${c.title || "чат"}»?`, "Вся переписка в нём будет удалена у всех. Отменить нельзя.", "Удалить", async () => {
            const { data } = await S.sb.rpc("admin_delete_chat", { cid: c.id });
            if (data === "OK") { toast("Удалено"); await loadChats(); renderChatList(); } else toast("Не получилось удалить");
            this.open();
          });
        } })));
    }
    if (!list.length) b.append(h("p", { class: "empty-chat" }, "Групп и каналов пока нет"));
  },
  logView(b) {
    const text = (e) => {
      const who = e.actor ? this.name(e.actor) : "Система";
      return { join: `👋 Новый участник: ${e.title}`, group: `👥 ${who} создал(а) группу «${e.title}»`, channel: `📢 ${who} создал(а) канал «${e.title}»`,
        limits: `🔒 Ограничения: ${e.title}`, setting: `⚙️ ${e.title}`, deleted: `🗑 Удалён чат «${e.title}»` }[e.kind] || e.title || e.kind;
    };
    if (!this.log.length) { b.append(h("p", { class: "empty-chat" }, "Событий пока нет")); return; }
    for (const e of this.log) b.append(h("div", { class: "adm-log" }, h("span", null, text(e)), h("small", null, this.when(e.at))));
  },
  rules(b) {
    b.append(
      h("label", { class: "toggle-row switch" }, h("span", null, "Группы и каналы создаёт только администратор", h("small", null, "Остальные участники не увидят кнопок создания")),
        h("input", { type: "checkbox", checked: !!this.data.create_admin_only, onchange: async (e) => {
          const { data } = await S.sb.rpc("admin_set_create_only", { on_: e.target.checked });
          if (data !== "OK") { e.target.checked = !e.target.checked; toast("Не получилось сохранить"); } else { this.data.create_admin_only = e.target.checked; toast("Сохранено"); }
        } })),
      h("p", { class: "sheet-note" }, "Личные ограничения (только чтение, без медиа, без создания чатов) задаются во вкладке «Люди». Сервер применяет их сам, обойти их из приложения нельзя."),
      h("button", { class: "menu-item", onclick: () => { this.close?.(); membersAdmin(); } }, h("span", { html: I.shield }), "Участники: блокировка и удаление"));
  },
};
