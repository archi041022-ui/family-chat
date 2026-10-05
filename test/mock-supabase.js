// Тестовая подмена Supabase: база в localStorage, «realtime» через BroadcastChannel.
// Нужна только для проверки интерфейса в браузере, в приложение не входит.
(function () {
  const DB_KEY = "mockdb";
  const bc = new BroadcastChannel("mock-rt");
  const FAMILY = "00000000-0000-0000-0000-000000000001";
  const load = () => JSON.parse(localStorage.getItem(DB_KEY) || "null") || {
    users: [], profiles: [], chats: [{ id: FAMILY, title: "Семья", is_group: true, dm_key: null, last_message_at: new Date().toISOString() }],
    chat_members: [], messages: [], reactions: [], stories: [], story_views: [], files: {},
  };
  const save = (db) => localStorage.setItem(DB_KEY, JSON.stringify(db));
  const uid = () => crypto.randomUUID();
  const me = () => JSON.parse(sessionStorage.getItem("mocksess") || "null");
  const isMember = (db, c, u) => db.chat_members.some((m) => m.chat_id === c && m.user_id === u);
  const visible = (db, table, row, u) => {
    if (table === "profiles") return true;
    if (table === "chats") return isMember(db, row.id, u);
    if (table === "chat_members") return isMember(db, row.chat_id, u);
    if (table === "messages") {
      if (!isMember(db, row.chat_id, u)) return false;
      if (row.approved !== false || row.user_id === u) return true;
      const ch = db.chats.find((x) => x.id === row.chat_id);
      return ch && (ch.created_by === u || db.admin === u);
    }
    if (table === "join_requests") { const ch = db.chats.find((x) => x.id === row.chat_id); return row.user_id === u || (ch && (ch.created_by === u || db.admin === u)); }
    if (table === "reactions") return isMember(db, row.chat_id, u);
    if (table === "notices") return row.user_id === u;
    if (table === "user_stickers" || table === "user_gifs") return row.user_id === u;
    if (table === "user_gifts") return row.to_user === u;
    if (table === "story_views") return row.viewer_id === u || db.stories.some((s) => s.id === row.story_id && s.user_id === u);
    return true;
  };
  const emit = (table, event, row, old) => { const msg = { table, event, row, old }; bc.postMessage(msg); dispatch(msg); };
  // серверные оповещения (как триггеры 010_notices.sql)
  const ntext = (m) => {
    const t = String(m.body || "").replace(/\u2063/g, "").replace(/\u2062fx:[a-z]+/g, "").replace(/^↪️ Переслано от [^\n]*\n?/, "").split("\u2064")[0].trim();
    const k = { image: "📷 Фото", video: "🎬 Видео", audio: "🎤 Голосовое", file: "📎 Файл", video_note: "⭕ Видеосообщение" }[m.media_type];
    if (m.media_type === "location") return "📍 Геолокация";
    return (k ? k + (t ? " · " : "") : "") + t;
  };
  const pname = (db, id) => db.profiles.find((p) => p.id === id)?.name || "Кто-то";
  const addNotice = (db, n) => { db.notices = db.notices || []; db.nseq = (db.nseq || 0) + 1; const r = { id: db.nseq, created_at: new Date().toISOString(), chat_id: null, ref: null, actor: null, body: null, ...n }; db.notices.push(r); return r; };
  const noticesFor = (db, table, r, old) => {
    const out = [];
    if (table === "messages" && !r.deleted) {
      const c = db.chats.find((x) => x.id === r.chat_id); if (!c) return out;
      const who = pname(db, r.user_id), ttl = c.is_group ? (c.title || "Группа") : who, txt = ntext(r) || "Новое сообщение";
      const members = db.chat_members.filter((m) => m.chat_id === c.id && m.user_id !== r.user_id).map((m) => m.user_id);
      if (!old && r.approved !== false) for (const x of members) out.push(addNotice(db, { user_id: x, kind: "message", chat_id: c.id, ref: r.id, actor: r.user_id, title: ttl, body: c.is_group && (!c.is_channel || r.user_id !== c.created_by) ? who + ": " + txt : txt }));
      else if (!old) for (const x of members.filter((x) => x === c.created_by || x === db.admin)) out.push(addNotice(db, { user_id: x, kind: "pending", chat_id: c.id, ref: r.id, actor: r.user_id, title: "⏳ На одобрение: " + ttl, body: who + ": " + txt }));
      else if (old.approved === false && r.approved) {
        for (const x of members.filter((x) => x !== me()?.id)) out.push(addNotice(db, { user_id: x, kind: "message", chat_id: c.id, ref: r.id, actor: r.user_id, title: ttl, body: c.is_channel ? txt : who + ": " + txt }));
        out.push(addNotice(db, { user_id: r.user_id, kind: "approved", chat_id: c.id, ref: r.id, actor: me()?.id, title: "✅ Опубликовано в «" + ttl + "»", body: txt }));
      }
    }
    if (table === "stories" && !old) for (const p of db.profiles.filter((p) => p.id !== r.user_id && !p.banned))
      out.push(addNotice(db, { user_id: p.id, kind: "story", ref: r.id, actor: r.user_id, title: "📸 " + pname(db, r.user_id) + " — новая история", body: (r.body || "").slice(0, 120) || (r.media_type === "video" ? "🎬 Видео" : "📷 Фото") }));
    if (table === "story_views" && r.emoji && r.emoji !== old?.emoji) {
      const st = db.stories.find((x) => x.id === r.story_id);
      if (st && st.user_id !== r.viewer_id) out.push(addNotice(db, { user_id: st.user_id, kind: "story_react", ref: st.id, actor: r.viewer_id, title: pname(db, r.viewer_id), body: r.emoji + " — реакция на вашу историю" }));
    }
    if (table === "reactions" && !old) {
      const m = db.messages.find((x) => x.id === r.message_id);
      if (m && m.user_id !== r.user_id && !m.deleted) out.push(addNotice(db, { user_id: m.user_id, kind: "reaction", chat_id: m.chat_id, ref: m.id, actor: r.user_id, title: pname(db, r.user_id), body: r.emoji + " к вашему сообщению: " + (ntext(m) || "…").slice(0, 80) }));
    }
    if (table === "tasks" && r.assignee_id && r.assignee_id !== r.owner_id && (!old || old.assignee_id !== r.assignee_id))
      out.push(addNotice(db, { user_id: r.assignee_id, kind: "task", chat_id: r.chat_id, ref: r.id, actor: r.owner_id, title: "📝 Новая задача от: " + pname(db, r.owner_id), body: r.title }));
    if (table === "join_requests" && !old) {
      const c = db.chats.find((x) => x.id === r.chat_id);
      if (c) for (const x of db.chat_members.filter((m) => m.chat_id === c.id && m.user_id !== r.user_id && (m.user_id === c.created_by || m.user_id === db.admin)).map((m) => m.user_id))
        out.push(addNotice(db, { user_id: x, kind: "join", chat_id: c.id, ref: c.id, actor: r.user_id, title: "🙋 Заявка: " + (c.title || "группа"), body: pname(db, r.user_id) + " просит вступить" }));
    }
    return out;
  };
  const pvAllowed = (db, owner, viewer, key) => {
    if (!owner || !viewer || owner === viewer) return true;
    if ((db.blocks || []).some((b) => b.user_id === owner && b.blocked_id === viewer)) return false;
    const r = (db.privacy || {})[owner]?.[key]; if (!r) return true;
    return r.mode === "nobody" ? (r.allow || []).includes(viewer) : !(r.deny || []).includes(viewer);
  };
  const GIFTS = [["heart", "❤️", "Сердце", 15, null, "Любовь"], ["rose", "🌹", "Роза", 25, null, "Любовь"], ["cake", "🎂", "Торт", 50, null, "Праздник"],
    ["teddy", "🧸", "Мишка", 50, null, "Милое"], ["crown", "👑", "Корона", 500, 5, "Особое"], ["gem", "💎", "Бриллиант", 1000, 3, "Особое"], ["rocket", "🚀", "Ракета", 30, 1, "Особое"]];
  const wallet = (db, u) => { db.wallets = db.wallets || {}; return (db.wallets[u] = db.wallets[u] || { balance: 100, bonus_day: null }); };
  const emitNotices = (list) => list.forEach((n) => emit("notices", "INSERT", n));
  window.__mockDevicePull = (key) => {   // как фоновая служба Android: забрать по ключу устройства
    const db = load(); const d = (db.devices || []).find((x) => x.key === key); if (!d) return [];
    const mine = (db.notices || []).filter((n) => n.user_id === d.user_id); db.notices = (db.notices || []).filter((n) => n.user_id !== d.user_id); save(db); return mine;
  };

  class Q {
    constructor(table) { this.t = table; this.f = []; this.op = "select"; this.ord = null; this.lim = null; this.one = null; this.ret = false; }
    select() { if (this.op !== "select") this.ret = true; return this; }
    eq(k, v) { this.f.push((r) => r[k] === v); return this; }
    lt(k, v) { this.f.push((r) => r[k] < v); return this; }
    gt(k, v) { this.f.push((r) => r[k] > v); return this; }
    ilike(k, pat) { const q = pat.replace(/%/g, "").toLowerCase(); this.f.push((r) => String(r[k] || "").toLowerCase().includes(q)); return this; }
    in(k, vs) { this.f.push((r) => vs.includes(r[k])); return this; }
    match(o) { for (const [k, v] of Object.entries(o)) this.eq(k, v); return this; }
    order(k, o) { this.ord = [k, o?.ascending !== false]; return this; }
    limit(n) { this.lim = n; return this; }
    single() { this.one = "single"; return this; }
    maybeSingle() { this.one = "maybe"; return this; }
    insert(row) { this.op = "insert"; this.row = row; return this; }
    update(v) { this.op = "update"; this.val = v; return this; }
    delete() { this.op = "delete"; return this; }
    then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
    run() {
      const db = load(), u = me()?.id, tb = db[this.t] || (db[this.t] = []);
      if (this.op === "select") {
        let rows = tb.filter((r) => visible(db, this.t, r, u)).filter((r) => this.f.every((f) => f(r)));
        if (this.ord) rows.sort((a, b) => (a[this.ord[0]] < b[this.ord[0]] ? -1 : 1) * (this.ord[1] ? 1 : -1));
        if (this.lim) rows = rows.slice(0, this.lim);
        if (this.one) return { data: rows[0] || null, error: null };
        return { data: rows, error: null };
      }
      if (this.op === "insert") {
        const r = { ...this.row };
        if (this.t === "messages") {
          if (!isMember(db, r.chat_id, u)) return { data: null, error: { message: "rls" } };
          const ch = db.chats.find((x) => x.id === r.chat_id);
          const owner = ch && (ch.created_by === u || db.admin === u);
          if (ch?.is_channel && !ch.members_can_post && !owner) return { data: null, error: { message: "rls" } };
          if (ch && !ch.is_group && !String(ch.dm_key || "").startsWith("saved:")) {
            const other = db.chat_members.find((m) => m.chat_id === ch.id && m.user_id !== u)?.user_id;
            if (other && !pvAllowed(db, other, u, "messages")) return { data: null, error: { message: "PRIVACY_MESSAGES" } };
            if (other && ["audio", "video_note"].includes(r.media_type) && !pvAllowed(db, other, u, "voice")) return { data: null, error: { message: "PRIVACY_VOICE" } };
          }
          r.approved = !(ch?.moderated) || owner;
          Object.assign(r, { id: uid(), user_id: u, created_at: new Date().toISOString(), deleted: false, body: r.body ?? null,
            media_path: r.media_path ?? null, media_type: r.media_type ?? null, media_name: r.media_name ?? null, reply_to: r.reply_to ?? null });
          const c = db.chats.find((x) => x.id === r.chat_id); c.last_message_at = r.created_at;
        }
        if (this.t === "reactions") {
          const m = db.messages.find((x) => x.id === r.message_id);
          r.user_id = u; r.chat_id = m.chat_id;
          if (db.reactions.some((x) => x.message_id === r.message_id && x.user_id === u && x.emoji === r.emoji)) return { data: null, error: { code: "23505" } };
        }
        if (this.t === "tasks") Object.assign(r, { id: uid(), owner_id: u, created_at: new Date().toISOString(), done: false, done_at: null,
          remind: r.remind !== false, chat_id: r.chat_id ?? null, assignee_id: r.assignee_id ?? null, due_at: r.due_at ?? null, note: r.note ?? null });
        if (this.t === "stories") Object.assign(r, { id: uid(), user_id: u, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 864e5).toISOString(), body: r.body ?? null, media_path: r.media_path ?? null, media_type: r.media_type ?? null, bg: r.bg ?? null });
        if (this.t === "user_stickers") { if (!String(r.path || "").startsWith(`stickers/${u}/`)) return { data: null, error: { message: "rls" } }; Object.assign(r, { id: uid(), user_id: u, created_at: new Date().toISOString(), emoji: r.emoji ?? null }); }
        if (this.t === "user_gifs") { if (!String(r.path || "").startsWith(`gifs/${u}/`)) return { data: null, error: { message: "rls" } }; Object.assign(r, { id: uid(), user_id: u, created_at: new Date().toISOString(), title: r.title ?? null }); }
        if (this.t === "story_views") {
          if (db.story_views.some((x) => x.story_id === r.story_id && x.viewer_id === u)) return { data: null, error: { code: "23505" } };
          Object.assign(r, { viewer_id: u, emoji: null, viewed_at: new Date().toISOString() });
        }
        if (!db[this.t]) db[this.t] = [];
        db[this.t].push(r); const nn = noticesFor(db, this.t, r, null); save(db); emit(this.t, "INSERT", r); emitNotices(nn);
        return { data: this.one ? r : [r], error: null };
      }
      if (this.op === "update") {
        const rows = tb.filter((r) => this.f.every((f) => f(r)));
        const nn = [];
        rows.forEach((r) => { const before = { ...r }; Object.assign(r, this.val); nn.push(...noticesFor(db, this.t, r, before)); emit(this.t, "UPDATE", r, before); });
        save(db); emitNotices(nn); return { data: rows, error: null };
      }
      if (this.op === "delete") {
        const rows = tb.filter((r) => this.f.every((f) => f(r)));
        db[this.t] = tb.filter((r) => !rows.includes(r)); save(db);
        rows.forEach((r) => emit(this.t, "DELETE", r));
        return { data: rows, error: null };
      }
    }
  }

  const listeners = new Set();
  function dispatch(msg) { listeners.forEach((l) => l(msg)); }
  bc.onmessage = (e) => dispatch(e.data);

  class Channel {
    constructor(name) { this.name = name; this.h = []; this.state = {}; }
    on(type, filter, cb) { this.h.push({ type, filter, cb }); return this; }
    subscribe(cb) {
      this.l = (msg) => {
        const u = me()?.id;
        if (msg.table) {
          const db = load();
          for (const x of this.h) if (x.type === "postgres_changes" && x.filter.table === msg.table && x.filter.event === msg.event) {
            if (msg.event !== "DELETE" && !visible(db, msg.table, msg.row, u)) continue;
            x.cb(msg.event === "DELETE" ? { old: msg.row } : { new: msg.row, old: msg.old });
          }
        } else if (msg.channel === this.name) {
          if (msg.kind === "presence") { this.state[msg.key] = [msg.meta || {}]; for (const x of this.h) if (x.type === "presence") x.cb(); }
          if (msg.kind === "presence-leave") { delete this.state[msg.key]; for (const x of this.h) if (x.type === "presence") x.cb(); }
          if (msg.kind === "broadcast" && msg.sender !== sessionId)
            for (const x of this.h) if (x.type === "broadcast" && x.filter.event === msg.event) x.cb({ payload: msg.payload });
        }
      };
      listeners.add(this.l);
      setTimeout(() => cb && cb("SUBSCRIBED"), 10);
      return this;
    }
    async send({ event, payload }) { const msg = { channel: this.name, kind: "broadcast", event, payload, sender: sessionId }; bc.postMessage(msg); dispatch(msg); return "ok"; }
    presenceState() { return this.state; }
    async untrack() { const key = me()?.id; window.__presMeta = null; delete this.state[key]; bc.postMessage({ channel: this.name, kind: "presence-leave", key }); }
    async track(meta) {
      const key = me()?.id;
      window.__presMeta = meta || {};
      this.state[key] = [window.__presMeta];
      const msg = { channel: this.name, kind: "presence", key, meta: window.__presMeta }; bc.postMessage(msg);
      for (const x of this.h) if (x.type === "presence") x.cb();
      bc.postMessage({ channel: this.name, kind: "presence-req" });
    }
  }
  const sessionId = uid();

  window.supabase = {
    createClient() {
      return {
        auth: {
          async getSession() { const s = me(); return { data: { session: s ? { user: s } : null } }; },
          async signInWithPassword({ email, password }) {
            const u = load().users.find((x) => x.email === email);
            if (u && load().profiles.find((x) => x.id === u.id)?.banned) return { data: {}, error: { message: "User is banned" } };
            if (!u || (u.password && u.password !== password)) return { data: {}, error: { message: "Invalid login credentials" } };
            sessionStorage.setItem("mocksess", JSON.stringify(u)); return { data: { user: u, session: {} }, error: null };
          },
          async signUp({ email, options }) {
            const db = load();
            if (options.data.invite !== "SEMYA-4825") return { data: {}, error: { message: "Database error saving new user" } };
            if (db.users.some((x) => x.email === email)) return { data: {}, error: { message: "User already registered" } };
            const u = { id: uid(), email, password: arguments[0].password }; db.users.push(u);
            if (!db.admin) db.admin = u.id;
            db.profiles.push({ id: u.id, name: options.data.name, avatar_path: null, last_seen: new Date().toISOString(), created_at: new Date().toISOString() });
            db.chat_members.push({ chat_id: FAMILY, user_id: u.id, last_read_at: new Date(0).toISOString() });
            save(db); sessionStorage.setItem("mocksess", JSON.stringify(u));
            return { data: { user: u, session: {} }, error: null };
          },
          async signOut() { sessionStorage.removeItem("mocksess"); },
          async updateUser({ password }) { const db = load(); db.users.find((x) => x.id === me().id).password = password; save(db); return { data: {}, error: null }; },
        },
        from: (t) => new Q(t),
        async rpc(name, args) {
          const db = load(), u = me()?.id;
          db.words = db.words || {};
          if (name === "admin_set_ban") {
            if (db.admin !== u) return { data: "NOT_ADMIN", error: null };
            const pr = db.profiles.find((x) => x.id === args.target); if (!pr) return { data: "NO_USER", error: null };
            pr.banned = args.ban; save(db); emit("profiles", "UPDATE", pr); return { data: "OK", error: null };
          }
          if (name === "admin_delete_user") {
            if (db.admin !== u) return { data: "NOT_ADMIN", error: null };
            db.users = db.users.filter((x) => x.id !== args.target); db.profiles = db.profiles.filter((x) => x.id !== args.target);
            db.messages = db.messages.filter((x) => x.user_id !== args.target); db.chat_members = db.chat_members.filter((x) => x.user_id !== args.target);
            save(db); return { data: "OK", error: null };
          }
          if (name === "get_invite_code") return { data: u ? (db.invite || "SEMYA-4825") : null, error: null };
          if (name === "set_invite_code") { if (db.admin !== u) return { data: "NOT_ADMIN", error: null }; db.invite = args.code.toUpperCase(); save(db); return { data: "OK", error: null }; }
          if (name === "set_recovery_word") { db.words[u] = args.word.trim().toLowerCase(); save(db); return { data: null, error: null }; }
          if (name === "has_recovery_word") return { data: !!db.words[u], error: null };
          if (name === "gif_status") return { data: db.admin === u && !!db.giphy_key, error: null };
          if (name === "set_gif_key") { if (db.admin !== u) return { data: "NOT_ADMIN", error: null }; const k = String(args.k || "").trim(); if (!k) delete db.giphy_key; else if (!/^[A-Za-z0-9]{16,64}$/.test(k)) return { data: "BAD_KEY", error: null }; else db.giphy_key = k; save(db); return { data: "OK", error: null }; }
          if (name === "is_admin") return { data: db.admin === u, error: null };
          if (name === "admin_user_login") return { data: db.admin === u ? db.users.find((x) => x.id === args.target)?.email.split("@")[0] : null, error: null };
          if (name === "admin_reset_password") {
            if (db.admin !== u) return { data: "NOT_ADMIN", error: null };
            db.users.find((x) => x.id === args.target).password = args.new_password; save(db); return { data: "OK", error: null };
          }
          if (name === "reset_password_with_word") {
            const usr = db.users.find((x) => x.email === args.login_email.toLowerCase());
            if (!usr) return { data: "WRONG", error: null };
            if (!db.words[usr.id]) return { data: "NO_WORD", error: null };
            if (db.words[usr.id] !== args.word.trim().toLowerCase()) return { data: "WRONG", error: null };
            usr.password = args.new_password; save(db); return { data: "OK", error: null };
          }
          if (name === "get_or_create_dm") {
            const k = [u, args.other].sort().join(":");
            let c = db.chats.find((x) => x.dm_key === k);
            if (!c) { c = { id: uid(), is_group: false, dm_key: k, title: null, last_message_at: new Date().toISOString() }; db.chats.push(c); }
            for (const x of [u, args.other]) if (!isMember(db, c.id, x)) db.chat_members.push({ chat_id: c.id, user_id: x, last_read_at: new Date(0).toISOString() });
            save(db); return { data: c.id, error: null };
          }
          const owner = (cid) => { const c = db.chats.find((x) => x.id === cid); return c && c.is_group && (c.created_by === u || db.admin === u); };
          if (name === "group_update") {
            if (!owner(args.cid)) return { data: "NOT_OWNER", error: null };
            const c = db.chats.find((x) => x.id === args.cid);
            if (args.new_title && args.new_title.trim()) c.title = args.new_title.trim().slice(0, 80);
            c.description = (args.new_description || "").trim() || null;
            if (args.new_avatar !== null && args.new_avatar !== undefined) c.avatar_path = args.new_avatar || null;
            save(db); return { data: "OK", error: null };
          }
          if (name === "group_add_members") {
            if (!owner(args.cid)) return { data: "NOT_OWNER", error: null };
            for (const m of args.members) if (!isMember(db, args.cid, m)) db.chat_members.push({ chat_id: args.cid, user_id: m, last_read_at: new Date(0).toISOString() });
            save(db); return { data: "OK", error: null };
          }
          if (name === "group_remove_member") {
            if (args.cid === FAMILY) return { data: "FAMILY", error: null };
            if (!owner(args.cid)) return { data: "NOT_OWNER", error: null };
            db.chat_members = db.chat_members.filter((m) => !(m.chat_id === args.cid && m.user_id === args.target)); save(db); return { data: "OK", error: null };
          }
          if (name === "group_leave") {
            if (args.cid === FAMILY) return { data: "FAMILY", error: null };
            db.chat_members = db.chat_members.filter((m) => !(m.chat_id === args.cid && m.user_id === u));
            const c = db.chats.find((x) => x.id === args.cid);
            if (c && c.created_by === u) { const heir = db.chat_members.find((m) => m.chat_id === args.cid); if (heir) c.created_by = heir.user_id; else db.chats = db.chats.filter((x) => x !== c); }
            save(db); return { data: "OK", error: null };
          }
          if (name === "group_delete") {
            const c = db.chats.find((x) => x.id === args.cid);
            if (args.cid === FAMILY || !c || c.created_by !== u) return { data: "NOT_OWNER", error: null };
            db.chats = db.chats.filter((x) => x !== c); db.chat_members = db.chat_members.filter((m) => m.chat_id !== args.cid); save(db); return { data: "OK", error: null };
          }
          const chatOwner = (cid) => { const c = db.chats.find((x) => x.id === cid); return !!c && (c.created_by === u || db.admin === u); };
          db.join_requests = db.join_requests || [];
          if (name === "chat_settings2") {
            const c = db.chats.find((x) => x.id === args.cid);
            if (!c || !isMember(db, c.id, u)) return { data: "NO_CHAT", error: null };
            if (c.is_group && !chatOwner(c.id)) return { data: "NOT_OWNER", error: null };
            const st = args.settings || {};
            if ("private" in st && c.is_channel) c.is_private = st.private;
            if ("protected" in st) c.protected = st.protected;
            if ("members_can_post" in st && c.is_channel) c.members_can_post = st.members_can_post;
            if ("moderated" in st) { c.moderated = st.moderated; if (!st.moderated) db.messages.filter((m) => m.chat_id === c.id && m.approved === false).forEach((m) => { const b0 = { ...m }; m.approved = true; emit("messages", "UPDATE", m, b0); }); }
            if ("listed" in st) c.listed = st.listed;
            save(db); return { data: "OK", error: null };
          }
          if (name === "get_turn") return { data: db.turn || null, error: null };
          if (name === "turn_status") return { data: db.admin === u && !!db.turn, error: null };
          if (name === "set_turn") {
            if (db.admin !== u) return { data: "NOT_ADMIN", error: null };
            if (args.cfg == null) { delete db.turn; save(db); return { data: "OK", error: null }; }
            if (!/^(turns?|stuns?):[\w.-]+(:\d+)?(\?transport=(udp|tcp))?$/i.test(args.cfg.url || "")) return { data: "BAD_URL", error: null };
            db.turn = args.cfg; save(db); return { data: "OK", error: null };
          }
          if (name === "set_burn") {
            const c = db.chats.find((x) => x.id === args.cid);
            if (!c || !isMember(db, c.id, u)) return { data: "NO_CHAT", error: null };
            if (c.is_group && !chatOwner(c.id)) return { data: "NOT_OWNER", error: null };
            c.burn_after = args.secs; c.burn_since = args.secs == null ? null : new Date().toISOString(); db.burn = db.burn || {};
            if (args.secs == null) for (const m of db.messages) delete db.burn[m.id];
            save(db); return { data: "OK", error: null };
          }
          if (name === "burn_sweep") {
            db.burn = db.burn || {}; let n = 0; const now = Date.now();
            for (const m of db.messages.slice()) {
              const c = db.chats.find((x) => x.id === m.chat_id); if (!c || !c.burn_after || !isMember(db, c.id, u)) continue;
              if (m.created_at < c.burn_since) continue;
              const others = db.chat_members.filter((x) => x.chat_id === c.id && x.user_id !== m.user_id);
              if (!others.length || others.some((x) => x.last_read_at < m.created_at)) continue;
              if (!db.burn[m.id]) db.burn[m.id] = now + c.burn_after * 1000;
              if (db.burn[m.id] <= now) { db.messages = db.messages.filter((x) => x !== m); delete db.burn[m.id]; emit("messages", "DELETE", m); n++; }
            }
            save(db); return { data: n, error: null };
          }
          if (name === "moderate_message") {
            const m = db.messages.find((x) => x.id === args.mid); if (!m) return { data: "NO_MESSAGE", error: null };
            if (!chatOwner(m.chat_id)) return { data: "NOT_OWNER", error: null };
            if (args.ok) { const before = { ...m }; m.approved = true; const nn = noticesFor(db, "messages", m, before); save(db); emit("messages", "UPDATE", m, before); emitNotices(nn); }
            else { db.messages = db.messages.filter((x) => x !== m); save(db); emit("messages", "DELETE", m); }
            return { data: "OK", error: null };
          }
          if (name === "directory") {
            return { data: db.chats.filter((c) => c.is_group && c.id !== FAMILY && ((c.is_channel && !c.is_private) || c.listed) && !isMember(db, c.id, u)).map((c) => ({
              id: c.id, title: c.title, description: c.description || null, avatar_path: c.avatar_path || null, is_channel: !!c.is_channel, is_private: c.is_private !== false,
              members: db.chat_members.filter((m) => m.chat_id === c.id).length, requested: db.join_requests.some((r) => r.chat_id === c.id && r.user_id === u),
              owner_name: db.profiles.find((p) => p.id === c.created_by)?.name || null })), error: null };
          }
          if (name === "request_join") {
            const c = db.chats.find((x) => x.id === args.cid); if (!c || !c.is_group) return { data: "NO_CHAT", error: null };
            if (isMember(db, c.id, u)) return { data: "MEMBER", error: null };
            if (c.is_channel && !c.is_private) { db.chat_members.push({ chat_id: c.id, user_id: u, last_read_at: new Date(0).toISOString() }); save(db); return { data: "JOINED", error: null }; }
            if (!c.listed) return { data: "PRIVATE", error: null };
            if (!db.join_requests.some((r) => r.chat_id === c.id && r.user_id === u)) { const r = { chat_id: c.id, user_id: u, created_at: new Date().toISOString() }; db.join_requests.push(r); const nn = noticesFor(db, "join_requests", r, null); save(db); emit("join_requests", "INSERT", r); emitNotices(nn); }
            return { data: "REQUESTED", error: null };
          }
          if (name === "cancel_join") {
            const r = db.join_requests.find((x) => x.chat_id === args.cid && x.user_id === u);
            db.join_requests = db.join_requests.filter((x) => x !== r); save(db); if (r) emit("join_requests", "DELETE", r); return { data: "OK", error: null };
          }
          if (name === "decide_join") {
            if (!chatOwner(args.cid)) return { data: "NOT_OWNER", error: null };
            const r = db.join_requests.find((x) => x.chat_id === args.cid && x.user_id === args.target); if (!r) return { data: "NO_REQUEST", error: null };
            db.join_requests = db.join_requests.filter((x) => x !== r);
            let nn = [];
            if (args.ok && !isMember(db, args.cid, args.target)) db.chat_members.push({ chat_id: args.cid, user_id: args.target, last_read_at: new Date(0).toISOString() });
            if (args.ok) nn = [addNotice(db, { user_id: args.target, kind: "joined", chat_id: args.cid, ref: args.cid, actor: u, title: "🎉 Заявка одобрена", body: "Вас приняли в «" + (db.chats.find((x) => x.id === args.cid)?.title || "группу") + "»" })];
            save(db); emit("join_requests", "DELETE", r); emitNotices(nn); return { data: "OK", error: null };
          }
          if (name === "privacy_get") return { data: { data: (db.privacy || {})[u] || {}, blocked: (db.blocks || []).filter((b) => b.user_id === u).map((b) => b.blocked_id) }, error: null };
          if (name === "privacy_save") { db.privacy = db.privacy || {}; db.privacy[u] = JSON.parse(JSON.stringify(args.data || {})); save(db); return { data: "OK", error: null }; }
          if (name === "block_user") {
            db.blocks = (db.blocks || []).filter((b) => !(b.user_id === u && b.blocked_id === args.target));
            if (args.block) db.blocks.push({ user_id: u, blocked_id: args.target, created_at: new Date().toISOString() });
            save(db); return { data: "OK", error: null };
          }
          if (name === "privacy_view") return { data: db.profiles.filter((p) => p.id !== u).map((p) => ({ user_id: p.id, r: Object.fromEntries(
            ["last_seen", "photo", "bio", "birthday", "phone", "forwards", "calls", "voice", "messages", "groups", "gifts", "gifts_show"].map((k) => [k, pvAllowed(db, p.id, u, k)])
              .concat([["read", (db.privacy || {})[p.id]?.read !== false], ["blocked_me", (db.blocks || []).some((b) => b.user_id === p.id && b.blocked_id === u)]])) })), error: null };
          if (name === "saved_chat") {
            let c = db.chats.find((x) => x.dm_key === "saved:" + u);
            if (!c) { c = { id: uid(), is_group: false, dm_key: "saved:" + u, title: "Избранное", created_by: u, last_message_at: new Date().toISOString() }; db.chats.push(c); db.chat_members.push({ chat_id: c.id, user_id: u, last_read_at: new Date().toISOString() }); save(db); }
            return { data: c.id, error: null };
          }
          if (name === "gifts_home") {
            const w = wallet(db, u); save(db); const today = new Date().toISOString().slice(0, 10);
            return { data: { balance: w.balance, bonus: w.bonus_day !== today, catalog: GIFTS.map(([id, emoji, nm, price, total, category]) => ({ id, emoji, name: nm, price, total, category,
              left: total == null ? null : Math.max(0, total - (db.user_gifts || []).filter((g) => g.gift_id === id).length) })) }, error: null };
          }
          if (name === "claim_bonus") { const w = wallet(db, u), today = new Date().toISOString().slice(0, 10); if (w.bonus_day === today) return { data: -1, error: null }; w.bonus_day = today; w.balance += 20; save(db); return { data: w.balance, error: null }; }
          if (name === "send_gift") {
            const t = GIFTS.find((g) => g[0] === args.gift); if (!t) return { data: "NO_GIFT", error: null };
            if (!args.target || args.target === u) return { data: "BAD", error: null };
            if (!pvAllowed(db, args.target, u, "gifts")) return { data: "PRIVACY", error: null };
            db.user_gifts = db.user_gifts || [];
            if (t[4] != null && db.user_gifts.filter((g) => g.gift_id === t[0]).length >= t[4]) return { data: "SOLD_OUT", error: null };
            const w = wallet(db, u); if (w.balance < t[3]) return { data: "NO_STARS", error: null };
            w.balance -= t[3];
            const g = { id: uid(), gift_id: t[0], from_user: u, to_user: args.target, message: args.msg || null, anonymous: !!args.anon, hidden: false, pinned: false, converted: false, price: t[3], created_at: new Date().toISOString() };
            db.user_gifts.push(g);
            const nn = [addNotice(db, { user_id: args.target, kind: "gift", actor: args.anon ? null : u, title: "🎁 Вам подарок!", body: (args.anon ? "Тайный даритель" : pname(db, u)) + ` дарит вам «${t[2]}» ${t[1]}` })];
            save(db); emit("user_gifts", "INSERT", g); emitNotices(nn); return { data: "OK", error: null };
          }
          if (name === "gifts_of") {
            const list = (db.user_gifts || []).filter((g) => g.to_user === args.uid && !g.converted && (args.uid === u || (!g.hidden && pvAllowed(db, args.uid, u, "gifts_show"))));
            return { data: list.sort((a, b) => (b.pinned - a.pinned) || (b.created_at > a.created_at ? 1 : -1)).map((g) => { const t = GIFTS.find((x) => x[0] === g.gift_id); const hideFrom = g.anonymous && args.uid !== u;
              return { id: g.id, gift_id: g.gift_id, emoji: t[1], name: t[2], price: g.price, message: hideFrom ? null : g.message, from: hideFrom ? null : g.from_user, from_name: hideFrom ? null : pname(db, g.from_user),
                anonymous: g.anonymous, hidden: g.hidden, pinned: g.pinned, created_at: g.created_at, limited: t[4] != null, convert: Math.floor(g.price * 8 / 10) }; }), error: null };
          }
          if (name === "gift_update") { const g = (db.user_gifts || []).find((x) => x.id === args.gid && x.to_user === u); if (!g) return { data: "NO_GIFT", error: null };
            if (args.hide != null) g.hidden = args.hide; if (args.pin != null) g.pinned = args.pin; save(db); return { data: "OK", error: null }; }
          if (name === "gift_convert") { const g = (db.user_gifts || []).find((x) => x.id === args.gid && x.to_user === u && !x.converted); if (!g) return { data: -1, error: null };
            g.converted = true; g.hidden = true; const w = wallet(db, u); w.balance += Math.floor(g.price * 8 / 10); save(db); return { data: w.balance, error: null }; }
          if (name === "claim_notices") {
            const mine = (db.notices || []).filter((n) => n.user_id === u); db.notices = (db.notices || []).filter((n) => n.user_id !== u); save(db);
            return { data: mine, error: null };
          }
          if (name === "register_device") {
            if (!u) return { data: "NO_AUTH", error: null }; if (!args.key || args.key.length < 32) return { data: "BAD_KEY", error: null };
            db.devices = (db.devices || []).filter((d) => d.key !== args.key); db.devices.push({ key: args.key, user_id: u }); save(db); return { data: "OK", error: null };
          }
          if (name === "unregister_device") { db.devices = (db.devices || []).filter((d) => !(d.key === args.key && d.user_id === u)); save(db); return { data: "OK", error: null }; }
          if (name === "push_config") return { data: db.fcm?.client || null, error: null };
          if (name === "push_status") return { data: { configured: !!db.fcm, project: db.fcm?.client.project_id || null, devices: (db.devices || []).filter((d) => d.token).length, people: new Set((db.devices || []).filter((d) => d.token).map((d) => d.user_id)).size, mine: 0 }, error: null };
          if (name === "set_push_config") {
            if (db.admin !== u) return { data: "NOT_ADMIN", error: null };
            if (!args.client && !args.service) { delete db.fcm; save(db); return { data: "OFF", error: null }; }
            if (args.service?.project_id !== args.client?.project_id) return { data: "PROJECT_MISMATCH", error: null };
            db.fcm = { client: args.client, service: args.service }; save(db); return { data: "OK", error: null };
          }
          if (name === "wake_call") {
            const nn = (args.targets || []).filter((t) => t !== u).map((t) => addNotice(db, { user_id: t, kind: "call", actor: u, title: pname(db, u), body: args.video ? "Входящий видеозвонок" : "Входящий звонок" }));
            db.wakes = (db.wakes || 0) + nn.length; save(db); emitNotices(nn); return { data: "OK", error: null };
          }
          if (name === "create_channel") {
            const c = { id: uid(), is_group: true, is_channel: true, is_private: args.private !== false, protected: false, title: args.title, description: args.description || null, created_by: u, last_message_at: new Date().toISOString() };
            db.chats.push(c);
            for (const x of [u, ...(args.members || [])]) if (!isMember(db, c.id, x)) db.chat_members.push({ chat_id: c.id, user_id: x, last_read_at: new Date(0).toISOString() });
            save(db); return { data: c.id, error: null };
          }
          if (name === "public_channels") {
            return { data: db.chats.filter((c) => c.is_channel && !c.is_private && !isMember(db, c.id, u)).map((c) => ({ id: c.id, title: c.title, description: c.description, avatar_path: c.avatar_path || null, members: db.chat_members.filter((m) => m.chat_id === c.id).length })), error: null };
          }
          if (name === "channel_join") {
            const c = db.chats.find((x) => x.id === args.cid);
            if (!c || !c.is_channel || c.is_private) return { data: "PRIVATE", error: null };
            if (!isMember(db, c.id, u)) db.chat_members.push({ chat_id: c.id, user_id: u, last_read_at: new Date(0).toISOString() });
            save(db); return { data: "OK", error: null };
          }
          if (name === "chat_settings") {
            const c = db.chats.find((x) => x.id === args.cid);
            if (!c || !isMember(db, c.id, u)) return { data: "NO_CHAT", error: null };
            if (c.is_group && c.created_by !== u && db.admin !== u) return { data: "NOT_OWNER", error: null };
            if (c.is_channel && args.private !== null && args.private !== undefined) c.is_private = args.private;
            if (args.protect !== null && args.protect !== undefined) c.protected = args.protect;
            save(db); return { data: "OK", error: null };
          }
          if (name === "create_group") {
            const c = { id: uid(), is_group: true, title: args.title, created_by: u, last_message_at: new Date().toISOString() }; db.chats.push(c);
            for (const x of [u, ...args.members]) if (x === u || pvAllowed(db, x, u, "groups")) db.chat_members.push({ chat_id: c.id, user_id: x, last_read_at: new Date(0).toISOString() });
            save(db); return { data: c.id, error: null };
          }
        },
        storage: { from: () => ({
          async upload(path, blob) {
            const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
            const db = load();
            if (blob.size > 400000) { db.files[path] = URL.createObjectURL(blob); window.__bigFiles = (window.__bigFiles || {}); window.__bigFiles[path] = blob; }   // большие файлы — в памяти страницы
            else db.files[path] = url;
            save(db); return { data: { path }, error: null };
          },
          async remove() { return { data: [], error: null }; },
          async createSignedUrls(paths) { const db = load(); return { data: paths.map((p) => ({ path: p, signedUrl: db.files[p] })) }; },
        }) },
        channel: (name) => new Channel(name),
        functions: { async invoke(fn, { body }) {
          if (fn === "music") {          // как функция сервера music: поиск и скачивание (тональный WAV на 6 с)
            window.__musicCalls = (window.__musicCalls || []); window.__musicCalls.push(body);
            if (body.action === "search") return { data: { from: "openverse", items: [
              { id: "ov:1", title: "Happy Morning", artist: "Test Band", duration: 125, license: "CC BY 4.0", source: "jamendo", url: "https://prod-1.storage.jamendo.com/?trackid=1&format=mp32" },
              { id: "ov:2", title: "Calm Piano", artist: "Pianist", duration: 98, license: "CC BY-SA 3.0", source: "ccmixter", url: "https://ccmixter.org/content/x.mp3" }] }, error: null };
            if (body.action === "get") {
              const sr = 22050, n = sr * 6, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
              const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
              w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
              v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
              for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / sr * 2 * Math.PI * 523) * 8000, true);
              await new Promise((r) => setTimeout(r, 200));
              return { data: new Blob([buf], { type: "application/octet-stream" }), error: null };
            }
          }
          if (fn === "gif") {            // как функция сервера gif: поиск и скачивание
            window.__gifCalls = (window.__gifCalls || []); window.__gifCalls.push(body);
            if (body.action === "search") return { data: { from: window.__giphyOn ? "giphy" : "openverse", giphy: !!window.__giphyOn, items: Array.from({ length: 14 }, (_, i) => ({
              id: "ov:" + body.q + i, title: "GIF " + i, preview: "https://media.test/p" + i + ".gif", url: "https://media.test/f" + i + ".gif", w: 200, h: 150 + (i % 3) * 30, source: "Openverse" })) }, error: null };
            if (body.action === "get") {
              const g = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));
              return { data: new Blob([g], { type: "image/gif" }), error: null };
            }
          }
          if (fn === "push") { window.__pushTests = (window.__pushTests || 0) + 1; return { data: { ok: true, sent: 1 }, error: null }; }
          await new Promise((r) => setTimeout(r, 300));
          const last = body.messages.at(-1).content;
          window.__asstCalls = (window.__asstCalls || 0) + 1; window.__asstLast = body;
          return { data: { reply: /погод/i.test(last) ? `Погода сейчас: +7°C, небольшой дождь${body.lat ? " (по геолокации)" : ""}.` : "Тестовый ответ на: " + last }, error: null };
        } },
      };
    },
  };
  // ответ на запрос присутствия
  bc.addEventListener("message", (e) => {
    if (e.data.kind === "presence-req" && me() && window.__presMeta !== null) bc.postMessage({ channel: "family-presence", kind: "presence", key: me().id, meta: window.__presMeta || {} });
  });
})();
