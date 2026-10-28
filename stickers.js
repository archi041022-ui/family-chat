/* Стикеры: анимированные наборы (Noto Animated Emoji, Google, CC BY 4.0) — добавить/скачать набор,
   избранные, свои стикеры из галереи (картинка, GIF, WebP), сохранить понравившийся стикер из чата. */
"use strict";

const STICKER_MARK = "⁡st";
const STICKER_PACKS = [
  ["emotions", "Эмоции", "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😜 🤪 😎 🥳 😏 😴 🤯 😭 😱 😡 🥺 🤗 🤔 🙄 😬 🤭"],
  ["love", "Любовь", "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💕 💞 💓 💗 💖 💘 💝 😘 🥰 😍 💋 🌹"],
  ["party", "Праздник", "🎉 🎊 🎂 🎁 🎈 🎆 🎇 ✨ 🥂 🍾 🎄 🎃 🏆 🥳 🎶"],
  ["animals", "Животные", "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🦄 🐔 🐧 🐦 🐢 🐬 🐳 🦋 🐝"],
  ["hands", "Жесты", "👍 👎 👏 🙌 👋 🤝 🙏 💪 ✌️ 🤞 👌 🤟 👀 💯 🔥 ⭐"],
  ["nature", "Еда и природа", "🍕 🍔 🍟 🌭 🍿 🍩 🍪 🍫 ☕ 🍵 🍉 🍓 🌈 ☀️ ⛄ ❄️ 🌸 🌻 🍀"],
].map(([id, name, list]) => ({ id, name, list: list.split(" ") }));

const Stickers = {
  mine: null,       // свои стикеры с сервера
  packs() { const p = Prefs.get("stickerPacks"); return Array.isArray(p) ? p : ["emotions", "love", "party"]; },
  favs() { const f = Prefs.get("stickerFav"); return Array.isArray(f) ? f : []; },
  isSticker(m) { return m?.body === STICKER_MARK && m.media_type === "image"; },

  async loadMine() {
    const { data } = await S.sb.from("user_stickers").select("*").order("created_at", { ascending: false });
    this.mine = data || [];
    await signUrls(this.mine.map((x) => x.path));
    return this.mine;
  },
  img(e, size = 64) {
    const im = h("img", { src: Emoji.anim(e), alt: e, loading: "lazy", width: size, height: size, draggable: false });
    im.onerror = () => im.replaceWith(h("span", { class: "st-fallback" }, e));
    return im;
  },
  sendEmoji(e, close) { close?.(); Emoji.remember(e); FX.sendAnim(); postMessage({ body: e }); },
  async sendMine(st, close) {
    close?.();
    const url = S.urls.get(st.path); if (!url) return toast("Стикер ещё загружается");
    try {
      const b = await (await fetch(url)).blob();
      FX.sendAnim();
      await sendFile(new File([b], "sticker." + (b.type.split("/")[1] || "webp"), { type: b.type || "image/webp" }), { sticker: true });
    } catch { toast("Не удалось отправить стикер"); }
  },

  // ── вкладка «Стикеры» в панели эмодзи
  pane(close) {
    const box = h("div", { class: "st-pane" });
    const tabs = h("div", { class: "st-tabs" });
    const body = h("div", { class: "st-body" });
    const groups = [["fav", "⭐"], ["mine", "🖼"], ...STICKER_PACKS.filter((p) => this.packs().includes(p.id)).map((p) => [p.id, p.list[0]])];
    const show = async (k) => {
      tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.k === k));
      body.innerHTML = "";
      if (k === "fav") {
        const f = this.favs();
        body.append(f.length ? h("div", { class: "sticker-grid" }, f.map((e) => h("button", { onclick: () => this.sendEmoji(e, close) }, this.img(e))))
          : h("p", { class: "sheet-note" }, "Избранные стикеры: удерживайте стикер в чате → «Добавить в избранные»."));
      } else if (k === "mine") {
        body.append(h("p", { class: "sheet-note" }, "Загрузка…"));
        const list = await this.loadMine(); body.innerHTML = "";
        body.append(h("div", { class: "sticker-grid" },
          h("button", { class: "st-add", onclick: () => this.create(() => show("mine")) }, "＋", h("small", null, "Свой стикер")),
          list.map((s) => h("button", { onclick: () => this.sendMine(s, close) }, h("img", { src: S.urls.get(s.path) || "", alt: s.emoji || "стикер", loading: "lazy" })))));
      } else {
        const p = STICKER_PACKS.find((x) => x.id === k);
        body.append(h("div", { class: "sticker-grid" }, p.list.map((e) => h("button", { onclick: () => this.sendEmoji(e, close) }, this.img(e)))));
      }
    };
    for (const [k, ic] of groups) tabs.append(h("button", { "data-k": k, onclick: () => show(k) }, ic));
    tabs.append(h("button", { class: "st-store-btn", title: "Наборы стикеров", onclick: () => { close?.(); this.store(); } }, "＋"));
    box.append(tabs, body);
    show(this.favs().length ? "fav" : groups[2]?.[0] || "mine");
    return box;
  },

  // ── «Наборы стикеров»: добавить / скачать / убрать
  store() {
    let close;
    const box = h("div");
    const draw = () => {
      box.innerHTML = "";
      for (const p of STICKER_PACKS) {
        const on = this.packs().includes(p.id);
        const btn = h("button", { class: `btn small${on ? " ghost" : ""}`, onclick: async () => {
          if (on) { Prefs.set("stickerPacks", this.packs().filter((x) => x !== p.id)); toast(`Набор «${p.name}» убран`); return draw(); }
          btn.disabled = true; btn.textContent = "Скачиваю…";
          await this.download(p, (k) => { btn.textContent = `Скачиваю ${Math.round(k * 100)}%`; });
          Prefs.set("stickerPacks", [...this.packs(), p.id]); toast(`✅ Набор «${p.name}» добавлен`); draw();
        } }, on ? "Убрать" : "Скачать");
        box.append(h("div", { class: "st-pack" }, h("div", { class: "st-pack-head" }, h("b", null, p.name), h("small", null, `${p.list.length} анимированных`), btn),
          h("div", { class: "st-pack-preview" }, p.list.slice(0, 6).map((e) => this.img(e, 44)))));
      }
      box.append(h("button", { class: "menu-item", onclick: () => this.create() }, h("span", null, "🖼"), "Создать свой стикер из фото или GIF"),
        h("p", { class: "sheet-note" }, "Анимированные стикеры — Noto Animated Emoji (Google, лицензия CC BY 4.0)."));
    };
    close = sheet([h("h3", null, "🎟 Наборы стикеров"), box]);
    draw();
  },
  // «скачать» набор — загрузить все анимации заранее (дальше открываются мгновенно, из кэша)
  async download(p, onProgress) {
    let done = 0;
    await Promise.all(p.list.map((e) => new Promise((r) => {
      const i = new Image(); let ok = false; const fin = () => { if (ok) return; ok = true; onProgress?.(++done / p.list.length); r(); };
      i.onload = fin; i.onerror = fin; setTimeout(fin, 15000); i.src = Emoji.anim(e);       // браузер сохранит анимацию в кэш
    })));
  },

  // ── свой стикер из галереи
  create(after) {
    const inp = h("input", { type: "file", accept: "image/*", style: { display: "none" } });
    inp.onchange = async () => {
      const f = inp.files[0]; inp.remove(); if (!f) return;
      if (f.size > 3 * 1024 * 1024) return toast("Файл больше 3 МБ — выберите поменьше");
      let blob = f, ext = (f.type.split("/")[1] || "webp").replace("jpeg", "jpg");
      if (!/gif|webp/.test(f.type)) {                         // фото — квадрат 512 с прозрачностью (PNG)
        try {
          const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
          const c = document.createElement("canvas"); c.width = c.height = 512; const x = c.getContext("2d");
          const k = Math.min(512 / img.width, 512 / img.height); x.drawImage(img, (512 - img.width * k) / 2, (512 - img.height * k) / 2, img.width * k, img.height * k);
          blob = await new Promise((r) => c.toBlob(r, "image/png")); ext = "png";
        } catch { /* как есть */ }
      }
      await this.saveBlob(blob, ext);
      after?.();
    };
    document.body.append(inp); inp.click();
  },
  async saveBlob(blob, ext, emoji = null) {
    const path = `stickers/${S.me.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await S.sb.storage.from("media").upload(path, blob, { contentType: blob.type || "image/" + ext });
    if (error) { toast("Не удалось сохранить стикер"); return false; }
    const { error: e2 } = await S.sb.from("user_stickers").insert({ path, emoji });
    if (e2) { toast("Не удалось сохранить стикер"); return false; }
    this.mine = null; toast("✅ Стикер добавлен в «Мои стикеры»"); return true;
  },
  // ── из меню сообщения: сохранить чужой стикер / анимированный эмодзи
  menuItems(m, close) {
    const items = [];
    const big = !m.media_type ? Emoji.only(Tg.text(m.body)) : null;
    if (big && big.length === 1) {
      const e = big[0], fav = this.favs().includes(e);
      items.push(h("button", { class: "menu-item", onclick: () => {
        close(); Prefs.set("stickerFav", fav ? this.favs().filter((x) => x !== e) : [e, ...this.favs()].slice(0, 40));
        toast(fav ? "Убрано из избранных стикеров" : "⭐ Добавлено в избранные стикеры");
      } }, h("span", null, "⭐"), fav ? "Убрать из избранных стикеров" : "Добавить в избранные стикеры"));
    }
    if (m.media_type === "image" && m.media_path && S.urls.get(m.media_path) && (this.isSticker(m) || /gif|webp|png$/i.test(m.media_path))) {
      items.push(h("button", { class: "menu-item", onclick: async () => {
        close();
        try { const b = await (await fetch(S.urls.get(m.media_path))).blob(); await this.saveBlob(b, (b.type.split("/")[1] || "webp").replace("jpeg", "jpg")); }
        catch { toast("Не удалось сохранить стикер"); }
      } }, h("span", null, "🎟"), "Добавить в мои стикеры"));
    }
    return items;
  },
};
