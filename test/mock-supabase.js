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
    if (table === "story_views") return row.viewer_id === u || db.stories.some((s) => s.id === row.story_id && s.user_id === u);
    return true;
  };
  const emit = (table, event, row) => { const msg = { table, event, row }; bc.postMessage(msg); dispatch(msg); };

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
        if (this.t === "story_views") {
          if (db.story_views.some((x) => x.story_id === r.story_id && x.viewer_id === u)) return { data: null, error: { code: "23505" } };
          Object.assign(r, { viewer_id: u, emoji: null, viewed_at: new Date().toISOString() });
        }
        if (!db[this.t]) db[this.t] = [];
        db[this.t].push(r); save(db); emit(this.t, "INSERT", r);
        return { data: this.one ? r : [r], error: null };
      }
      if (this.op === "update") {
        const rows = tb.filter((r) => this.f.every((f) => f(r)));
        rows.forEach((r) => { Object.assign(r, this.val); emit(this.t, "UPDATE", r); });
        save(db); return { data: rows, error: null };
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
            x.cb(msg.event === "DELETE" ? { old: msg.row } : { new: msg.row });
          }
        } else if (msg.channel === this.name) {
          if (msg.kind === "presence") { this.state[msg.key] = [{}]; for (const x of this.h) if (x.type === "presence") x.cb(); }
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
    async track() {
      const key = me()?.id;
      this.state[key] = [{}];
      const msg = { channel: this.name, kind: "presence", key }; bc.postMessage(msg);
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
            if ("moderated" in st) { c.moderated = st.moderated; if (!st.moderated) db.messages.filter((m) => m.chat_id === c.id && m.approved === false).forEach((m) => { m.approved = true; emit("messages", "UPDATE", m); }); }
            if ("listed" in st) c.listed = st.listed;
            save(db); return { data: "OK", error: null };
          }
          if (name === "moderate_message") {
            const m = db.messages.find((x) => x.id === args.mid); if (!m) return { data: "NO_MESSAGE", error: null };
            if (!chatOwner(m.chat_id)) return { data: "NOT_OWNER", error: null };
            if (args.ok) { m.approved = true; save(db); emit("messages", "UPDATE", m); }
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
            if (!db.join_requests.some((r) => r.chat_id === c.id && r.user_id === u)) { const r = { chat_id: c.id, user_id: u, created_at: new Date().toISOString() }; db.join_requests.push(r); save(db); emit("join_requests", "INSERT", r); }
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
            if (args.ok && !isMember(db, args.cid, args.target)) db.chat_members.push({ chat_id: args.cid, user_id: args.target, last_read_at: new Date(0).toISOString() });
            save(db); emit("join_requests", "DELETE", r); return { data: "OK", error: null };
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
            for (const x of [u, ...args.members]) db.chat_members.push({ chat_id: c.id, user_id: x, last_read_at: new Date(0).toISOString() });
            save(db); return { data: c.id, error: null };
          }
        },
        storage: { from: () => ({
          async upload(path, blob) {
            const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
            const db = load(); db.files[path] = url; save(db); return { data: { path }, error: null };
          },
          async remove() { return { data: [], error: null }; },
          async createSignedUrls(paths) { const db = load(); return { data: paths.map((p) => ({ path: p, signedUrl: db.files[p] })) }; },
        }) },
        channel: (name) => new Channel(name),
        functions: { async invoke(fn, { body }) {
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
    if (e.data.kind === "presence-req" && me()) bc.postMessage({ channel: "family-presence", kind: "presence", key: me().id });
  });
})();
