// Тестовая подмена Supabase: база в localStorage, «realtime» через BroadcastChannel.
// Нужна только для проверки интерфейса в браузере, в приложение не входит.
(function () {
  const DB_KEY = "mockdb";
  const bc = new BroadcastChannel("mock-rt");
  const FAMILY = "00000000-0000-0000-0000-000000000001";
  const load = () => JSON.parse(localStorage.getItem(DB_KEY) || "null") || {
    users: [], profiles: [], chats: [{ id: FAMILY, title: "Семья", is_group: true, dm_key: null, last_message_at: new Date().toISOString() }],
    chat_members: [], messages: [], reactions: [], files: {},
  };
  const save = (db) => localStorage.setItem(DB_KEY, JSON.stringify(db));
  const uid = () => crypto.randomUUID();
  const me = () => JSON.parse(sessionStorage.getItem("mocksess") || "null");
  const isMember = (db, c, u) => db.chat_members.some((m) => m.chat_id === c && m.user_id === u);
  const visible = (db, table, row, u) => {
    if (table === "profiles") return true;
    if (table === "chats") return isMember(db, row.id, u);
    if (table === "chat_members") return isMember(db, row.chat_id, u);
    if (table === "messages") return isMember(db, row.chat_id, u);
    if (table === "reactions") return isMember(db, row.chat_id, u);
    return true;
  };
  const emit = (table, event, row) => { const msg = { table, event, row }; bc.postMessage(msg); dispatch(msg); };

  class Q {
    constructor(table) { this.t = table; this.f = []; this.op = "select"; this.ord = null; this.lim = null; this.one = null; this.ret = false; }
    select() { if (this.op !== "select") this.ret = true; return this; }
    eq(k, v) { this.f.push((r) => r[k] === v); return this; }
    lt(k, v) { this.f.push((r) => r[k] < v); return this; }
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
      const db = load(), u = me()?.id, tb = db[this.t];
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
          Object.assign(r, { id: uid(), user_id: u, created_at: new Date().toISOString(), deleted: false, body: r.body ?? null,
            media_path: r.media_path ?? null, media_type: r.media_type ?? null, media_name: r.media_name ?? null, reply_to: r.reply_to ?? null });
          const c = db.chats.find((x) => x.id === r.chat_id); c.last_message_at = r.created_at;
        }
        if (this.t === "reactions") {
          const m = db.messages.find((x) => x.id === r.message_id);
          r.user_id = u; r.chat_id = m.chat_id;
          if (db.reactions.some((x) => x.message_id === r.message_id && x.user_id === u && x.emoji === r.emoji)) return { data: null, error: { code: "23505" } };
        }
        tb.push(r); save(db); emit(this.t, "INSERT", r);
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
          async signInWithPassword({ email }) {
            const u = load().users.find((x) => x.email === email);
            if (!u) return { data: {}, error: { message: "Invalid login credentials" } };
            sessionStorage.setItem("mocksess", JSON.stringify(u)); return { data: { user: u, session: {} }, error: null };
          },
          async signUp({ email, options }) {
            const db = load();
            if (options.data.invite !== "SEMYA-4825") return { data: {}, error: { message: "Database error saving new user" } };
            if (db.users.some((x) => x.email === email)) return { data: {}, error: { message: "User already registered" } };
            const u = { id: uid(), email }; db.users.push(u);
            db.profiles.push({ id: u.id, name: options.data.name, avatar_path: null, last_seen: new Date().toISOString() });
            db.chat_members.push({ chat_id: FAMILY, user_id: u.id, last_read_at: new Date(0).toISOString() });
            save(db); sessionStorage.setItem("mocksess", JSON.stringify(u));
            return { data: { user: u, session: {} }, error: null };
          },
          async signOut() { sessionStorage.removeItem("mocksess"); },
        },
        from: (t) => new Q(t),
        async rpc(name, args) {
          const db = load(), u = me().id;
          if (name === "get_or_create_dm") {
            const k = [u, args.other].sort().join(":");
            let c = db.chats.find((x) => x.dm_key === k);
            if (!c) { c = { id: uid(), is_group: false, dm_key: k, title: null, last_message_at: new Date().toISOString() }; db.chats.push(c); }
            for (const x of [u, args.other]) if (!isMember(db, c.id, x)) db.chat_members.push({ chat_id: c.id, user_id: x, last_read_at: new Date(0).toISOString() });
            save(db); return { data: c.id, error: null };
          }
          if (name === "create_group") {
            const c = { id: uid(), is_group: true, title: args.title, last_message_at: new Date().toISOString() }; db.chats.push(c);
            for (const x of [u, ...args.members]) db.chat_members.push({ chat_id: c.id, user_id: x, last_read_at: new Date(0).toISOString() });
            save(db); return { data: c.id, error: null };
          }
        },
        storage: { from: () => ({
          async upload(path, blob) {
            const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
            const db = load(); db.files[path] = url; save(db); return { data: { path }, error: null };
          },
          async createSignedUrls(paths) { const db = load(); return { data: paths.map((p) => ({ path: p, signedUrl: db.files[p] })) }; },
        }) },
        channel: (name) => new Channel(name),
      };
    },
  };
  // ответ на запрос присутствия
  bc.addEventListener("message", (e) => {
    if (e.data.kind === "presence-req" && me()) bc.postMessage({ channel: "family-presence", kind: "presence", key: me().id });
  });
})();
