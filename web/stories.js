/* Истории: фото, видео или текст на 24 часа, с отметками «кто посмотрел» и ответами. */
"use strict";

const STORY_BG = ["#E8664F", "#3D8BFD", "#2EAD6B", "#9B5DE5", "#F2A541", "#E0457B", "#1F1C1A"];
const STORY_SECONDS = 6;

const Stories = {
  list: [],          // живые истории, по возрастанию времени
  seen: new Set(),   // id историй, которые я уже смотрел
  views: new Map(),  // id моей истории -> [{viewer_id, emoji, viewed_at}]

  async load() {
    const now = new Date().toISOString();
    const [{ data: st }, { data: mine }] = await Promise.all([
      S.sb.from("stories").select("*").gt("expires_at", now).order("created_at", { ascending: true }),
      S.sb.from("story_views").select("story_id,viewer_id,emoji,viewed_at"),
    ]);
    this.list = st || [];
    this.seen = new Set();
    this.views = new Map();
    for (const v of mine || []) {
      if (v.viewer_id === S.me.id) this.seen.add(v.story_id);
      else { if (!this.views.has(v.story_id)) this.views.set(v.story_id, []); this.views.get(v.story_id).push(v); }
    }
    await signUrls(this.list.map((x) => x.media_path).filter(Boolean));
  },

  byUser() {
    const m = new Map();
    for (const s of this.list) { if (!m.has(s.user_id)) m.set(s.user_id, []); m.get(s.user_id).push(s); }
    return m;
  },
  hasUnseen(uid) { return (this.byUser().get(uid) || []).some((s) => !this.seen.has(s.id)); },
  // порядок: я, затем непросмотренные (свежие сверху), затем просмотренные
  order() {
    const g = this.byUser();
    const others = [...g.keys()].filter((u) => u !== S.me.id);
    const last = (u) => new Date(g.get(u).at(-1).created_at);
    const unseen = others.filter((u) => this.hasUnseen(u)).sort((a, b) => last(b) - last(a));
    const seen = others.filter((u) => !this.hasUnseen(u)).sort((a, b) => last(b) - last(a));
    return { g, unseen, seen };
  },

  ringAvatar(uid, size, label) {
    const g = this.byUser();
    const has = g.has(uid), unseen = this.hasUnseen(uid);
    const wrap = h("button", { class: `story-ring${has ? (unseen ? " unseen" : " seen") : ""}`, title: label || "" }, avatarEl(uid, size));
    return wrap;
  },

  renderAll() { this.renderStrip(); this.renderTab(); this.updateBadge(); },
  async refreshAndRender() { await this.refreshViews(); this.renderAll(); },
  updateBadge() {
    const { unseen } = this.order();
    const b = $("#storiesBadge"); if (!b) return;
    b.textContent = unseen.length; b.classList.toggle("hidden", !unseen.length);
  },

  // лента кружков над списком чатов
  renderStrip() {
    const box = $("#storyStrip"); if (!box) return;
    box.innerHTML = "";
    const { g, unseen, seen } = this.order();
    const strip = h("div", { class: "story-strip" });
    const meHas = g.has(S.me.id);
    const me = this.ringAvatar(S.me.id, "", "Моя история");
    me.onclick = () => (meHas ? this.open(S.me.id) : this.create());
    if (!meHas) me.append(h("i", { class: "story-plus", html: I.plus }));
    strip.append(h("div", { class: "story-cell" }, me, h("span", null, "Моя история")));
    for (const u of [...unseen, ...seen]) {
      const r = this.ringAvatar(u, "", S.profiles.get(u)?.name);
      r.onclick = () => this.open(u);
      strip.append(h("div", { class: "story-cell" }, r, h("span", null, (S.profiles.get(u)?.name || "").split(" ")[0])));
    }
    if (unseen.length + seen.length + (meHas ? 1 : 0) === 0 && !S.filter) {
      strip.append(h("div", { class: "story-hint" }, "Поделитесь моментом дня — история исчезнет через 24 часа"));
    }
    box.append(strip);
  },

  // раздел «Истории»: мой статус, моя история, истории и статусы семьи
  renderTab() {
    const box = $("#tabStories"); if (!box) return;
    box.innerHTML = "";
    const { g, unseen, seen } = this.order();
    const mine = g.get(S.me.id) || [];
    const myViews = mine.reduce((n, s) => n + (this.views.get(s.id) || []).length, 0);
    box.append(
      h("div", { class: "section-title" }, "Мой статус"),
      h("button", { class: "status-card", onclick: openProfile },
        h("div", { class: "status-text" }, S.me.status || "Статус не указан — нажмите, чтобы добавить"),
        S.me.status_at ? h("small", null, "обновлён " + fmtListTime(S.me.status_at)) : null),
      h("div", { class: "section-title" }, "Моя история"),
      h("div", { class: "story-row" },
        (() => { const r = this.ringAvatar(S.me.id, ""); r.onclick = () => (mine.length ? this.open(S.me.id) : this.create()); return r; })(),
        h("div", { class: "mid", onclick: () => (mine.length ? this.open(S.me.id) : this.create()) },
          h("b", null, mine.length ? `${mine.length} ${plural(mine.length, "история", "истории", "историй")}` : "Добавить историю"),
          h("small", null, mine.length ? `👁 ${myViews} ${plural(myViews, "просмотр", "просмотра", "просмотров")} · ${fmtListTime(mine.at(-1).created_at)}` : "Фото, видео или текст на 24 часа")),
        h("button", { class: "icon-btn add-story", title: "Новая история", html: I.plus, onclick: () => this.create() })));
    const section = (title, users) => {
      if (!users.length) return;
      box.append(h("div", { class: "section-title" }, title));
      for (const u of users) {
        const p = S.profiles.get(u); const last = g.get(u).at(-1);
        const r = this.ringAvatar(u, ""); r.onclick = () => this.open(u);
        box.append(h("div", { class: "story-row", onclick: () => this.open(u) }, r,
          h("div", { class: "mid" }, h("b", null, p?.name || "…"), h("small", null, fmtListTime(last.created_at) + (p?.status ? " · " + p.status : "")))));
      }
    };
    section("Новые", unseen);
    section("Просмотренные", seen);
    // статусы всех, у кого он есть
    const withStatus = [...S.profiles.values()].filter((p) => p.id !== S.me.id && p.status).sort((a, b) => new Date(b.status_at || 0) - new Date(a.status_at || 0));
    if (withStatus.length) {
      box.append(h("div", { class: "section-title" }, "Статусы семьи"));
      for (const p of withStatus) {
        box.append(h("div", { class: "story-row", onclick: () => openDm(p.id) }, avatarEl(p.id, "sm"),
          h("div", { class: "mid" }, h("b", null, p.name), h("small", null, p.status + (p.status_at ? " · " + fmtListTime(p.status_at) : "")))));
      }
    }
    if (!unseen.length && !seen.length && !withStatus.length) box.append(h("p", { class: "empty-chat" }, "У родных пока нет историй и статусов"));
  },

  // ───────── Создание ─────────
  create() {
    let close;
    const file = h("input", { type: "file", accept: "image/*,video/*", class: "hidden" });
    file.onchange = async () => {
      const f = file.files[0]; if (!f) return;
      close(); await this.publishMedia(f);
    };
    close = sheet([
      h("h3", null, "Новая история"),
      h("button", { class: "menu-item", onclick: () => file.click() }, h("span", { html: I.clip }), "Фото или видео из галереи"),
      h("button", { class: "menu-item", onclick: () => { close(); this.textEditor(); } }, h("span", { html: I.pen }), "Текст на цветном фоне"),
      file,
    ]);
  },
  textEditor() {
    let bg = STORY_BG[0], close;
    const ta = h("textarea", { class: "story-text-input", maxlength: 500, placeholder: "Напишите что-нибудь…" });
    const prev = h("div", { class: "story-text-preview", style: { background: bg } }, ta);
    const colors = h("div", { class: "story-colors" }, STORY_BG.map((c) => h("button", { style: { background: c }, onclick: () => { bg = c; prev.style.background = c; } })));
    close = sheet([
      h("h3", null, "Текстовая история"), prev, colors,
      h("button", { class: "btn wide", onclick: async () => {
        const t = ta.value.trim(); if (!t) { toast("Напишите текст"); return; }
        close(); await this.publish({ body: t, bg });
      } }, "Опубликовать на 24 часа"),
    ]);
    setTimeout(() => ta.focus(), 100);
  },
  async publishMedia(f) {
    const isVideo = f.type.startsWith("video/");
    if (!isVideo && !f.type.startsWith("image/")) { toast("Нужно фото или видео"); return; }
    if (f.size > 50 * 1024 * 1024) { toast("Файл больше 50 МБ"); return; }
    let blob = f, ext = (f.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    if (!isVideo && !/gif/.test(f.type)) { try { blob = await compressImage(f, 1600, 0.85); ext = "jpg"; } catch { /* как есть */ } }
    toast("Публикую историю…");
    const path = `stories/${S.me.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await S.sb.storage.from("media").upload(path, blob, { contentType: blob.type || f.type });
    if (error) { toast("Не удалось загрузить: " + (error.message || "")); return; }
    await signUrls([path]);
    await this.publish({ media_path: path, media_type: isVideo ? "video" : "image" });
  },
  async publish(fields) {
    const { data, error } = await S.sb.from("stories").insert(fields).select().single();
    if (error) { toast("Не удалось опубликовать"); return; }
    if (!this.list.some((x) => x.id === data.id)) this.list.push(data);
    this.renderAll(); toast("История опубликована на 24 часа");
  },

  // ───────── Обновления в реальном времени ─────────
  async onNew(st) {
    if (this.list.some((x) => x.id === st.id)) return;
    if (st.media_path) await signUrls([st.media_path]);
    if (!S.profiles.has(st.user_id)) await loadProfiles();
    this.list.push(st); this.renderAll();
  },
  onDeleted(old) {
    if (!old?.id) return;
    this.list = this.list.filter((x) => x.id !== old.id); this.renderAll();
  },

  // ───────── Просмотр ─────────
  async refreshViews() {
    const ids = this.list.filter((x) => x.user_id === S.me.id).map((x) => x.id);
    if (!ids.length) return;
    const { data } = await S.sb.from("story_views").select("story_id,viewer_id,emoji,viewed_at").in("story_id", ids);
    for (const id of ids) this.views.set(id, []);
    for (const v of data || []) if (v.viewer_id !== S.me.id) this.views.get(v.story_id)?.push(v);
  },
  async open(uid) {
    if (uid === S.me.id) await this.refreshViews();
    const { unseen, seen } = this.order();
    const queue = uid === S.me.id ? [S.me.id] : [uid, ...[...unseen, ...seen].filter((u) => u !== uid)];
    this.viewer(queue, 0);
  },
  viewer(queue, qi) {
    const g = this.byUser();
    const uid = queue[qi]; const items = g.get(uid) || [];
    if (!items.length) return;
    let idx = Math.max(0, items.findIndex((s) => !this.seen.has(s.id)));
    if (uid === S.me.id) idx = 0;
    let timer = null, started = 0, elapsed = 0, paused = false, dur = STORY_SECONDS * 1000, raf = 0;
    const mine = uid === S.me.id;
    const bars = h("div", { class: "sv-bars" }, items.map(() => h("i", null, h("b"))));
    const stage = h("div", { class: "sv-stage" });
    const footer = h("div", { class: "sv-footer" });
    const head = h("div", { class: "sv-head" }, avatarEl(uid, "sm"),
      h("div", { class: "mid" }, h("b", null, mine ? "Моя история" : (S.profiles.get(uid)?.name || "")), h("small", { class: "sv-time" })),
      mine ? h("button", { class: "icon-btn", title: "Удалить", html: I.trash, onclick: (e) => { e.stopPropagation(); remove(); } }) : null,
      h("button", { class: "icon-btn", title: "Закрыть", html: I.close, onclick: (e) => { e.stopPropagation(); end(); } }));
    const root = h("div", { class: "story-viewer" }, bars, head, stage, footer,
      h("button", { class: "sv-prev", "aria-label": "Назад", onclick: () => go(-1) }),
      h("button", { class: "sv-next", "aria-label": "Дальше", onclick: () => go(1) }));
    document.body.append(root);

    const tick = () => {
      if (!paused) {
        const p = Math.min(1, (elapsed + (Date.now() - started)) / dur);
        const bar = bars.children[idx]?.firstChild; if (bar) bar.style.width = p * 100 + "%";
        if (p >= 1) { go(1); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    const pause = () => { if (paused) return; paused = true; elapsed += Date.now() - started; stage.querySelector("video")?.pause(); };
    const resume = () => { if (!paused) return; paused = false; started = Date.now(); stage.querySelector("video")?.play().catch(() => {}); };
    root.addEventListener("pointerdown", (e) => { if (!e.target.closest(".sv-footer,.sv-head")) pause(); });
    root.addEventListener("pointerup", () => resume());

    const show = () => {
      cancelAnimationFrame(raf);
      const s = items[idx];
      [...bars.children].forEach((b, i) => (b.firstChild.style.width = i < idx ? "100%" : "0%"));
      head.querySelector(".sv-time").textContent = fmtListTime(s.created_at);
      stage.innerHTML = ""; elapsed = 0; paused = false; dur = STORY_SECONDS * 1000;
      if (s.media_type === "image") stage.append(h("img", { src: S.urls.get(s.media_path) || "", alt: "" }));
      else if (s.media_type === "video") {
        const v = h("video", { src: S.urls.get(s.media_path) || "", autoplay: true, playsinline: true });
        v.onloadedmetadata = () => { if (isFinite(v.duration) && v.duration > 0) dur = Math.min(v.duration, 60) * 1000; };
        stage.append(v);
      } else stage.append(h("div", { class: "sv-text", style: { background: s.bg || STORY_BG[0] } }, s.body));
      if (s.body && s.media_type) stage.append(h("div", { class: "sv-caption" }, s.body));
      renderFooter(s);
      started = Date.now(); raf = requestAnimationFrame(tick);
      if (!mine) markSeen(s);
    };
    const renderFooter = (s) => {
      footer.innerHTML = "";
      if (mine) {
        const vs = this.views.get(s.id) || [];
        footer.append(h("button", { class: "sv-views", onclick: () => { pause(); viewersSheet(s, vs); } },
          h("span", { html: I.eye }), `${vs.length} ${plural(vs.length, "просмотр", "просмотра", "просмотров")}`,
          vs.some((v) => v.emoji) ? h("span", null, " · " + vs.filter((v) => v.emoji).map((v) => v.emoji).join("")) : null));
      } else {
        const input = h("input", { placeholder: "Ответить…", onfocus: pause, onblur: resume });
        const send = async () => {
          const t = input.value.trim(); if (!t) return;
          input.value = ""; await reply(s, `💬 Ответ на вашу историю: ${t}`); toast("Ответ отправлен");
        };
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
        footer.append(h("div", { class: "sv-reply" }, input, h("button", { class: "send", html: I.send, onclick: send })),
          h("div", { class: "sv-quick" }, ["❤️", "😂", "😮", "😢", "👏", "🔥"].map((e) => h("button", { onclick: () => react(s, e) }, e))));
      }
    };
    const markSeen = async (s) => {
      if (this.seen.has(s.id)) return;
      this.seen.add(s.id);
      const { error } = await S.sb.from("story_views").insert({ story_id: s.id });
      if (error && error.code !== "23505") this.seen.delete(s.id);
    };
    const react = async (s, e) => {
      await S.sb.from("story_views").update({ emoji: e }).match({ story_id: s.id, viewer_id: S.me.id });
      const fly = h("div", { class: "sv-fly" }, e); root.append(fly); setTimeout(() => fly.remove(), 900);
      await reply(s, `${e} на вашу историю`);
    };
    const reply = async (s, text) => {
      const { data: chatId } = await S.sb.rpc("get_or_create_dm", { other: s.user_id });
      if (!chatId) return;
      if (!S.chats.find((c) => c.id === chatId)) { await loadChats(); renderChatList(); }
      await postMessage({ body: text, media_path: s.media_path || null, media_type: s.media_type || null }, chatId);
    };
    const viewersSheet = (s, vs) => {
      sheet([
        h("h3", null, `Просмотры (${vs.length})`),
        ...(vs.length ? vs.sort((a, b) => new Date(b.viewed_at) - new Date(a.viewed_at)).map((v) => h("div", { class: "menu-item" }, avatarEl(v.viewer_id, "sm"),
          h("span", { style: { flex: 1 } }, S.profiles.get(v.viewer_id)?.name || "…"), h("span", null, (v.emoji || "") + " " + fmtTime(v.viewed_at))))
          : [h("p", { class: "empty-chat" }, "Пока никто не посмотрел")]),
      ], resume);
    };
    const remove = async () => {
      const s = items[idx];
      const { error } = await S.sb.from("stories").delete().eq("id", s.id);
      if (error) { toast("Не удалось удалить"); return; }
      if (s.media_path) S.sb.storage.from("media").remove([s.media_path]).catch(() => {});
      this.list = this.list.filter((x) => x.id !== s.id);
      items.splice(idx, 1); bars.children[idx]?.remove();
      toast("История удалена");
      if (!items.length) { end(); return; }
      idx = Math.min(idx, items.length - 1); show();
    };
    const go = (d) => {
      idx += d;
      if (idx < 0) { if (qi > 0) { end(false); this.viewer(queue, qi - 1); return; } idx = 0; }
      if (idx >= items.length) { end(false); if (qi + 1 < queue.length) this.viewer(queue, qi + 1); else this.renderAll(); return; }
      show();
    };
    const end = (render = true) => {
      cancelAnimationFrame(raf); root.remove();
      document.removeEventListener("keydown", keys);
      if (render) this.renderAll();
    };
    const keys = (e) => { if (e.key === "Escape") end(); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    document.addEventListener("keydown", keys);
    show();
  },
};
