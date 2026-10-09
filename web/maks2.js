/* v4.6: «Макс» умеет больше. Всё работает на телефоне, без нейросети:
   — создаёт группы, каналы и заметки по голосу (с подтверждением);
   — запоминает людей: что просили запомнить, как пишут (длина, эмодзи, время), с кем вы чаще общаетесь;
   — напоминает о пропущенных звонках и непрочитанных сообщениях;
   — «перезвони», «что я пропустил».
   Память хранится только на этом телефоне. Посмотреть: «что ты знаешь про маму», стереть: «забудь про маму» или «забудь всё». */
"use strict";

const MaksPlus = {
  await: null,           // ожидаемый ответ «да/нет» или текст
  lastRemind: 0, lastKey: "", sameCount: 0,

  // ───────── Память ─────────
  mem() {
    const m = Prefs.get("maks_mem");
    if (m && typeof m === "object" && m.people) return m;
    return { people: {}, facts: [], learnedAt: 0 };
  },
  saveMem(m) { Prefs.set("maks_mem", m); },
  person(m, id) {
    return (m.people[id] = m.people[id] || { facts: [], n: 0, words: 0, emoji: 0, q: 0, ex: 0, hours: new Array(24).fill(0), out: 0, calls: 0, missed: 0 });
  },
  /** Вызывается для каждого нового сообщения: считаем только манеру (длина, эмодзи, время), текст не сохраняется. */
  learn(m) {
    try {
      if (!m || m.deleted || !S.me) return;
      const t = new Date(m.created_at || Date.now()).getTime();
      const mem = this.mem();
      if (t <= (mem.learnedAt || 0)) return;
      mem.learnedAt = t;
      const c = S.chats.find((x) => x.id === m.chat_id);
      const mine = m.user_id === S.me.id;
      if (Tg.isCallMsg(m)) {
        const who = mine ? (c && !c.is_group ? otherUser(c) : null) : m.user_id;
        if (who) { const p = this.person(mem, who); p.calls++; if (!mine && /без ответа|отклонён/.test(m.body || "")) p.missed++; }
        this.saveMem(mem); return;
      }
      const body = String(m.body || "").trim();
      if (!body || body === WELCOME_MARK || body === GC_MARK) { this.saveMem(mem); return; }
      const id = mine ? (c && !c.is_group ? otherUser(c) : null) : m.user_id;
      if (!id) { this.saveMem(mem); return; }
      const p = this.person(mem, id);
      if (mine) { p.out++; this.saveMem(mem); return; }
      p.n++;
      p.words += body.split(/\s+/).filter(Boolean).length;
      if (/\p{Extended_Pictographic}/u.test(body)) p.emoji++;
      if (body.includes("?")) p.q++;
      if (body.includes("!")) p.ex++;
      p.hours[new Date(t).getHours()]++;
      this.saveMem(mem);
    } catch { /* обучение не должно мешать работе */ }
  },
  /** Описание манеры человека по накопленным данным. */
  style(p) {
    if (!p || p.n < 5) return "";
    const avg = p.words / p.n, parts = [];
    parts.push(avg <= 4 ? "пишет коротко" : avg >= 14 ? "пишет развёрнуто" : "пишет средними сообщениями");
    if (p.emoji / p.n > 0.3) parts.push("любит эмодзи");
    if (p.ex / p.n > 0.3) parts.push("часто пишет с восклицанием");
    if (p.q / p.n > 0.3) parts.push("часто задаёт вопросы");
    const part = (a, b) => p.hours.slice(a, b).reduce((x, y) => x + y, 0);
    const buckets = [["утром", part(5, 12)], ["днём", part(12, 18)], ["вечером", part(18, 23)], ["ночью", part(23, 24) + part(0, 5)]];
    const best = buckets.sort((a, b) => b[1] - a[1])[0];
    if (best[1] / p.n > 0.4) parts.push(`обычно на связи ${best[0]}`);
    return parts.join(", ");
  },
  describe(id) {
    const mem = this.mem(), p = mem.people[id], name = S.profiles.get(id)?.name || "этот человек";
    const out = [];
    const st = this.style(p); if (st) out.push(st);
    if (p?.facts?.length) out.push("помню: " + p.facts.map((f) => f.text).join("; "));
    if (p && (p.out || p.n)) out.push(`сообщений от него: ${p.n}, вам ему: ${p.out}`);
    if (p?.missed) out.push(`пропущенных звонков от него: ${p.missed}`);
    return out.length ? `${name}: ${out.join(". ")}.` : `Про «${name}» я пока ничего не знаю. Скажите: «Запомни, ${name} любит …».`;
  },

  // ───────── Заметки ─────────
  notes() { const n = Prefs.get("maks_notes"); return Array.isArray(n) ? n : []; },
  addNote(text) { const n = this.notes(); n.unshift({ id: Date.now().toString(36), text: text.slice(0, 2000), at: Date.now() }); Prefs.set("maks_notes", n.slice(0, 300)); },
  notesSheet() {
    let close; const box = h("div");
    const draw = () => {
      box.innerHTML = "";
      const list = this.notes();
      if (!list.length) box.append(h("p", { class: "empty-chat" }, "Заметок пока нет. Скажите: «Макс, создай заметку купить хлеб»."));
      for (const n of list) box.append(h("div", { class: "contact-row" }, h("div", { class: "mid" }, h("b", { style: { whiteSpace: "pre-wrap", fontWeight: 500 } }, n.text), h("small", null, new Date(n.at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))),
        h("button", { class: "icon-btn", title: "Удалить", html: I.trash, onclick: () => { Prefs.set("maks_notes", this.notes().filter((x) => x.id !== n.id)); draw(); } })));
    };
    const inp = h("input", { placeholder: "Новая заметка", maxlength: 2000 });
    const add = () => { if (!inp.value.trim()) return; this.addNote(inp.value.trim()); inp.value = ""; draw(); };
    inp.onkeydown = (e) => { if (e.key === "Enter") add(); };
    close = sheet([h("h3", null, "📝 Заметки"), h("div", { class: "field", style: { display: "flex", gap: "8px" } }, inp, h("button", { class: "btn", onclick: add }, "Добавить")), box]);
    draw();
  },
  memorySheet() {
    let close; const box = h("div");
    const draw = () => {
      box.innerHTML = "";
      const mem = this.mem(), ids = Object.keys(mem.people).filter((id) => S.profiles.has(id));
      if (mem.facts.length) box.append(h("div", { class: "list-caption" }, "О вас"), ...mem.facts.map((f) => h("div", { class: "contact-row" }, h("div", { class: "mid" }, h("b", { style: { fontWeight: 500 } }, f.text)),
        h("button", { class: "icon-btn", html: I.trash, title: "Забыть", onclick: () => { const m = this.mem(); m.facts = m.facts.filter((x) => x.id !== f.id); this.saveMem(m); draw(); } }))));
      for (const id of ids) {
        const p = mem.people[id], txt = this.describe(id);
        if (!p.facts.length && !this.style(p) && !p.out && !p.n) continue;
        box.append(h("div", { class: "contact-row" }, avatarEl(id, "sm"), h("div", { class: "mid" }, h("b", null, S.profiles.get(id).name), h("small", { style: { whiteSpace: "normal" } }, txt.replace(/^[^:]+:\s*/, ""))),
          h("button", { class: "icon-btn", html: I.trash, title: "Забыть", onclick: () => { const m = this.mem(); delete m.people[id]; this.saveMem(m); draw(); } })));
      }
      if (!box.children.length) box.append(h("p", { class: "empty-chat" }, "Пока ничего не запомнил. Скажите: «Макс, запомни, мама любит чай»."));
    };
    close = sheet([h("h3", null, "🧠 Что помнит Макс"), h("p", { class: "sheet-note" }, "Хранится только на этом телефоне. Макс считает лишь манеру переписки: длину, эмодзи, время. Тексты сообщений он не сохраняет."), box,
      h("button", { class: "menu-item danger", onclick: () => { Prefs.set("maks_mem", null); draw(); toast("Макс всё забыл"); } }, h("span", { html: I.trash }), "Забыть всё")]);
    draw();
  },

  // ───────── Помощники ─────────
  say(t) { return Maks.reply(t); },
  ask(label, fn) { this.await = { type: "confirm", fn, label, at: Date.now() }; return this.say(`${label} Скажите «да» или «нет».`); },
  list(names) { return names.length > 1 ? names.slice(0, -1).join(", ") + " и " + names.at(-1) : names[0] || ""; },
  /** Разбор имён участников: «с мамой и папой, Светой». */
  members(rest) {
    const ids = [], names = [], bad = [];
    for (const part of String(rest || "").split(/\s*(?:,|\sи\s|\sа также\s)\s*/).map((s) => s.trim()).filter(Boolean)) {
      const t = Assistant.findTarget(part.split(/\s+/), false);
      if (t && t.kind === "user") { if (!ids.includes(t.id)) { ids.push(t.id); names.push(t.name); } } else bad.push(part);
    }
    return { ids, names, bad };
  },
  titleCase(s) { s = String(s || "").trim().replace(/^["«']|["»']$/g, ""); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; },

  async createGroup(title, ids) {
    const { data: id, error } = await S.sb.rpc("create_group", { title, members: ids });
    if (error || !id) { return this.say(/LIMITED_CREATE/.test(error?.message || "") ? "Администратор запретил вам создавать группы." : "Не получилось создать группу."); }
    await loadChats(); Maks.leave(); openChat(id); return this.say(`Группа «${title}» создана.`);
  },
  async createChannel(title, ids, priv) {
    const { data: id, error } = await S.sb.rpc("create_channel", { title, description: "", private: priv, members: ids });
    if (error || !id) { return this.say(/LIMITED_CREATE/.test(error?.message || "") ? "Администратор запретил вам создавать каналы." : "Не получилось создать канал."); }
    await S.sb.rpc("chat_settings2", { cid: id, settings: { members_can_post: true, moderated: priv, listed: priv } });
    await Groups.refresh(id); Maks.leave(); openChat(id); return this.say(`Канал «${title}» создан.`);
  },

  // ───────── Команды ─────────
  async command(raw) {
    const text = Maks.clean(Maks.strip(raw));
    const low = text.toLowerCase().replace(/ё/g, "е");
    if (!low) return false;
    const a = this.await;
    if (a && Date.now() - a.at > 90000) this.await = null;
    if (this.await) {
      const w = this.await; this.await = null;
      if (w.type === "confirm") {
        if (/^(да|ага|угу|давай|конечно|верно|ок|окей|создавай|подтверждаю)(?![а-яё])/.test(low)) { await w.fn(); return true; }
        if (/^(нет|не надо|отмена|отмени|стоп|не нужно)(?![а-яё])/.test(low)) return this.say("Хорошо, отменил.");
      } else if (w.type === "text") {
        if (/^(отмена|отмени|не надо|стоп)$/.test(low)) return this.say("Отменил.");
        await w.fn(text); return true;
      }
    }
    let m;

    // заметки
    if ((m = text.match(/^(?:создай|сделай|добавь|запиши|новая|оставь)\s+(?:мне\s+)?(?:новую\s+)?заметк\S*(?:\s*[:,—-]\s*|\s+)?(.*)$/i))) {
      const body = (m[1] || "").replace(/^(?:что|о том что|про)\s+/i, "").trim();
      if (body) { this.addNote(this.titleCase(body)); return this.say("Заметка сохранена."); }
      this.await = { type: "text", at: Date.now(), fn: (t) => { this.addNote(this.titleCase(t)); this.say("Заметка сохранена."); } };
      return this.say("Что записать?");
    }
    if (/^(?:открой|покажи|мои|выведи)\s+(?:мои\s+)?заметки$|^заметки$/.test(low)) { Maks.leave(); this.notesSheet(); return this.say("Вот ваши заметки."); }
    if (/^(?:прочитай|зачитай|озвучь)\s+(?:мои\s+)?заметки$/.test(low)) {
      const n = this.notes().slice(0, 5);
      return this.say(n.length ? "Ваши заметки. " + n.map((x, i) => `${i + 1}. ${x.text}`).join(" ") : "Заметок пока нет.");
    }
    if (/^(?:удали|очисти|сотри)\s+(?:все\s+)?(?:мои\s+)?заметки$/.test(low)) return this.ask(`Удалить все заметки (${this.notes().length})?`, () => { Prefs.set("maks_notes", []); this.say("Заметки удалены."); });

    // группа / канал
    if ((m = text.match(/^(?:создай|сделай|создать|заведи|организуй)\s+(?:новую\s+|новый\s+)?(?:(открыт\S*|публичн\S*|закрыт\S*|приватн\S*)\s+)?(группу|группа|канал)\s*(.*)$/i))) {
      const isCh = /канал/i.test(m[2]);
      let rest = m[3].trim(), priv = !/^(?:открыт|публичн)/i.test(m[1] || "");
      if (isCh && /^(?:открыт\S*|публичн\S*)\s+/i.test(rest)) { priv = false; rest = rest.replace(/^\S+\s+/, ""); }
      let title = rest, who = "";
      const w = rest.match(/^(.*?)\s+(?:с|со|для|и добавь|добавь)\s+(.+)$/i);
      if (w) { title = w[1]; who = w[2]; }
      title = this.titleCase(title.replace(/^(?:под названием|называется|с названием|название)\s+/i, ""));
      const mem = this.members(who);
      if (mem.bad.length) return this.say(`Не нашёл участников: ${mem.bad.join(", ")}.`);
      const go = async (name) => {
        const ppl = mem.names.length ? ` Участники: ${this.list(mem.names)}.` : "";
        return this.ask(`Создать ${isCh ? (priv ? "закрытый канал" : "открытый канал") : "группу"} «${name}»?${ppl}`, () => (isCh ? this.createChannel(name, mem.ids, priv) : this.createGroup(name, mem.ids)));
      };
      if (!title) { this.await = { type: "text", at: Date.now(), fn: (t) => go(this.titleCase(t)) }; return this.say(`Как назвать ${isCh ? "канал" : "группу"}?`); }
      return go(title);
    }

    // память
    if ((m = text.match(/^запомни(?:,|\s)+(?:что\s+)?(?:про\s+|о\s+|насчет\s+)?(.+)$/i))) {
      const body = m[1].trim();
      const words = body.split(/\s+/);
      const t = Assistant.findTarget(words.map((x) => x.replace(/[,:—-]+$/, "")), false);
      const mem = this.mem();
      if (t && t.kind === "user" && words.length > t.used) {
        const fact = words.slice(t.used).join(" ").replace(/^[,:—-]+\s*/, "").replace(/^(?:что|это)\s+/i, "").trim();
        this.person(mem, t.id).facts.push({ id: Date.now().toString(36), text: fact.slice(0, 300), at: Date.now() });
        this.saveMem(mem); return this.say(`Запомнил про ${t.name}: ${fact}.`);
      }
      mem.facts.push({ id: Date.now().toString(36), text: this.titleCase(body).slice(0, 300), at: Date.now() });
      this.saveMem(mem); return this.say("Запомнил.");
    }
    if ((m = low.match(/^(?:что ты (?:знаешь|помнишь)|расскажи|что известно|какой характер|какой (?:у\s+)?(?:него|нее) характер)\s*(?:про|о|об|обо|у)?\s*(?:характере\s+)?(.*)$/)) && (m[1] || /что ты (?:знаешь|помнишь)$/.test(low))) {
      const rest = m[1].trim();
      if (!rest || /^(?:мне|меня|обо мне|про меня)$/.test(rest)) {
        const mem = this.mem(), top = Object.entries(mem.people).sort((x, y) => (y[1].out + y[1].n) - (x[1].out + x[1].n)).slice(0, 3).map(([id]) => S.profiles.get(id)?.name).filter(Boolean);
        const out = [];
        if (mem.facts.length) out.push("Помню о вас: " + mem.facts.map((f) => f.text).join("; ") + ".");
        if (top.length) out.push("Чаще всего вы общаетесь с: " + this.list(top) + ".");
        Maks.leave(); this.memorySheet();
        return this.say(out.join(" ") || "Пока я почти ничего не запомнил. Скажите: «Запомни, мама любит чай».");
      }
      const t = Assistant.findTarget(rest.split(/\s+/), false);
      if (t && t.kind === "user") return this.say(this.describe(t.id));
      return false;
    }
    if (/^(?:покажи|открой)\s+(?:память|что ты помнишь|что помнит макс)$/.test(low)) { Maks.leave(); this.memorySheet(); return this.say("Вот что я помню."); }
    if (/^забудь\s+(?:все|всё)$/.test(low)) return this.ask("Забыть всё, что я о людях запомнил?", () => { Prefs.set("maks_mem", null); this.say("Всё забыл."); });
    if ((m = low.match(/^забудь\s+(?:про|о|обо)\s+(.+)$/))) {
      const t = Assistant.findTarget(m[1].split(/\s+/), false);
      if (!t || t.kind !== "user") return this.say(`Не нашёл «${m[1]}».`);
      const mem = this.mem(); delete mem.people[t.id]; this.saveMem(mem); return this.say(`Забыл всё про ${t.name}.`);
    }

    // пропущенное и напоминания
    if (/^(?:что я пропустил\S*|есть пропущенн\S+|кто (?:мне )?звонил\S*|что пропущено|пропущенные(?: звонки)?)$/.test(low)) { this.remind(true); return true; }
    if (/^(?:не\s+)?напоминай(?:\s+мне)?\s+о\s+(?:пропущенн|звонк|сообщен)\S*.*$/.test(low)) {
      const off = /^не\s/.test(low); Prefs.set("maks_remind", !off);
      return this.say(off ? "Хорошо, напоминать о пропущенном не буду." : "Буду напоминать о пропущенных звонках и сообщениях.");
    }
    if ((m = low.match(/^(?:перезвони|перезвонить)(?:\s+(?:ему|ей|им|на пропущенный|тому кто звонил))?(?:\s+(.+))?$/))) {
      const rest = (m[1] || "").trim(); let t = null;
      if (rest && !/^(?:по видео|видео)$/.test(rest)) t = Assistant.findTarget(rest.split(/\s+/), false);
      if (!t) { const last = this.missedCalls()[0]; if (last) t = { kind: "user", id: last.user_id, name: S.profiles.get(last.user_id)?.name || "абонент" }; }
      if (!t) return this.say("Пропущенных звонков нет. Скажите, кому позвонить.");
      Maks.leave(); return Assistant.callTarget(t, /видео/.test(low)) !== false || true;
    }
    return false;
  },

  // ───────── Напоминания о пропущенном ─────────
  enabled() { return Prefs.get("maks_remind") !== false; },
  missedCalls() {
    const seen = S.missedSeen || +(localStorage.getItem("missedSeen:" + S.me?.id) || 0);
    return (S.callLog || []).filter((m) => m.user_id !== S.me.id && /без ответа|отклонён/.test(m.body || "") && new Date(m.created_at).getTime() > seen);
  },
  unreadList() {
    return [...S.unread.entries()].filter(([id, n]) => n > 0 && !Prefs.muted(id)).map(([id, n]) => [S.chats.find((c) => c.id === id), n]).filter(([c]) => c);
  },
  /** force — по просьбе пользователя (без ограничений), иначе — по расписанию. */
  remind(force) {
    try {
      if (!S.me || !S.sb) return;
      const calls = this.missedCalls(), unread = this.unreadList();
      const total = unread.reduce((x, [, n]) => x + n, 0);
      if (!calls.length && !total) { if (force) this.say("Ничего не пропущено. Всё в порядке."); return; }
      const key = calls.map((c) => c.id).join(",") + "|" + total;
      if (!force) {
        if (!this.enabled() || document.hidden || Media.playing() || Calls.ui || Calls.pc || (typeof GroupCall !== "undefined" && GroupCall.active)) return;
        const now = Date.now();
        if (key === this.lastKey) { if (now - this.lastRemind < 45 * 60e3 || this.sameCount >= 3) return; this.sameCount++; }
        else { if (now - this.lastRemind < 3 * 60e3) return; this.sameCount = 1; }
        this.lastKey = key; this.lastRemind = now;
      }
      const parts = [];
      if (calls.length) {
        const by = new Map(); for (const c of calls) by.set(c.user_id, (by.get(c.user_id) || 0) + 1);
        parts.push("Пропущенные звонки: " + [...by].slice(0, 3).map(([id, n]) => (S.profiles.get(id)?.name || "кто-то") + (n > 1 ? ` (${n})` : "")).join(", ") + ". Скажите «перезвони».");
      }
      if (total) {
        const nm = unread.slice(0, 3).map(([c, n]) => `${chatTitle(c)} (${n})`);
        parts.push(`Непрочитанных сообщений: ${total} — ${nm.join(", ")}.`);
      }
      const first = calls[0]?.user_id, hint = first ? this.style(this.mem().people[first]) : "";
      if (hint && /на связи/.test(hint)) parts.push(`${S.profiles.get(first)?.name}: ${hint.match(/обычно на связи \S+/)[0]}.`);
      this.say(parts.join(" "));
    } catch { /* напоминание не должно мешать */ }
  },
  start() {
    clearInterval(this.timer); this.timer = setInterval(() => this.remind(false), 60e3);
    setTimeout(() => this.remind(false), 9000);
  },
};

// подключаемся к Максу: наши команды идут первыми
(() => {
  const orig = Maks.command.bind(Maks);
  Maks.command = async (raw) => { try { if (await MaksPlus.command(raw)) return true; } catch { /* дальше обычный разбор */ } return orig(raw); };
  const init = Maks.init.bind(Maks);
  Maks.init = () => { init(); MaksPlus.start(); };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(() => MaksPlus.remind(false), 1500); });
})();
