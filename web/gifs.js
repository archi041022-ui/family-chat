/* GIF в сообщениях: «Найти» (готовые анимации из интернета — скачать в «Мои» или сразу отправить),
   «Мои» (своя коллекция) и «＋ Добавить» (свой GIF из галереи). Поиск идёт через функцию gif на сервере.
   Реалистичные «живые» реакции — GIPHY: бесплатный ключ вставляет администратор (Меню → Администратор). */
"use strict";

const GIF_CATS = [
  ["🔥 Популярное", ""], ["👋 Привет", "hello"], ["😂 Смех", "laughing"], ["❤️ Любовь", "love"], ["😢 Грусть", "sad"],
  ["🎉 Ура", "celebrate"], ["👍 Да", "yes"], ["🙅 Нет", "no"], ["💃 Танец", "dance"], ["🙏 Спасибо", "thank you"],
  ["😮 Удивление", "wow"], ["😴 Спокойной ночи", "good night"], ["🎂 С днём рождения", "happy birthday"],
];
const GIF_MAX = 6 * 1024 * 1024;

const Gifs = {
  mine: null, state: { q: "", page: 1 },
  async loadMine() {
    const { data } = await S.sb.from("user_gifs").select("*").order("created_at", { ascending: false });
    this.mine = data || [];
    await signUrls(this.mine.map((x) => x.path));
    return this.mine;
  },
  // сервер → файл (в обход ограничений сайтов-источников)
  async fetchRemote(item) {
    const { data, error } = await S.sb.functions.invoke("gif", { body: { action: "get", url: item.url } });
    if (error || !data) throw new Error("get");
    const blob = data instanceof Blob ? data : new Blob([data], { type: "image/gif" });
    if (blob.size > GIF_MAX + 2 * 1024 * 1024) throw new Error("big");
    const type = /^image\//.test(blob.type) ? blob.type : "image/gif";
    return new File([blob], "anim." + (type.split("/")[1] || "gif").replace("jpeg", "jpg"), { type });
  },
  async sendFileNow(f, close) {
    close?.(); FX.sendAnim();
    await sendFile(f);
  },
  async sendRemote(item, close) {
    toast("Загружаю GIF…", 1500);
    try { await this.sendFileNow(await this.fetchRemote(item), close); }
    catch { toast("Не удалось загрузить GIF. Попробуйте другой."); }
  },
  async sendMine(g, close) {
    const url = S.urls.get(g.path); if (!url) return toast("GIF ещё загружается");
    try {
      const b = await (await fetch(url)).blob();
      await this.sendFileNow(new File([b], "anim." + (b.type.split("/")[1] || "gif"), { type: b.type || "image/gif" }), close);
    } catch { toast("Не удалось отправить GIF"); }
  },
  async save(f, title) {
    if (f.size > GIF_MAX) { toast("GIF больше 6 МБ — выберите поменьше"); return false; }
    const ext = (f.type.split("/")[1] || "gif").replace(/[^a-z0-9]/g, "").slice(0, 5) || "gif";
    const path = `gifs/${S.me.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await S.sb.storage.from("media").upload(path, f, { contentType: f.type || "image/gif" });
    if (error) { toast("Не удалось сохранить GIF"); return false; }
    const { error: e2 } = await S.sb.from("user_gifs").insert({ path, title: (title || "").slice(0, 120) || null });
    if (e2) { toast("Не удалось сохранить GIF"); return false; }
    this.mine = null; return true;
  },

  // ── вкладка GIF в панели эмодзи
  pane(close) {
    const box = h("div", { class: "gif-box" });
    const tabs = h("div", { class: "gif-tabs" });
    const body = h("div", { class: "gif-body" });
    let tab = "find", token = 0, saved = new Set();
    const mk = (k, label) => h("button", { "data-k": k, onclick: () => show(k) }, label);
    tabs.append(mk("mine", "⭐ Мои"), mk("find", "🔎 Найти"), mk("add", "＋ Добавить"));

    const grid = () => h("div", { class: "gif-grid" });

    const showMine = async () => {
      body.append(h("p", { class: "sheet-note" }, "Загрузка…"));
      const t = ++token; const list = await this.loadMine(); if (t !== token) return;
      body.innerHTML = "";
      if (!list.length) { body.append(h("p", { class: "sheet-note" }, "Здесь будут ваши GIF. Найдите понравившиеся во вкладке «Найти» и нажмите ⬇, или добавьте свои из галереи.")); return; }
      const g = grid();
      for (const it of list) {
        const cell = h("button", { class: "gif-cell", onclick: () => this.sendMine(it, close) }, h("img", { src: S.urls.get(it.path) || "", loading: "lazy", alt: "GIF" }));
        const del = h("i", { class: "gif-act", title: "Удалить", html: I.trash, onclick: async (e) => {
          e.stopPropagation();
          await S.sb.from("user_gifs").delete().eq("id", it.id); S.sb.storage.from("media").remove([it.path]);
          this.mine = null; cell.remove(); toast("GIF удалён из «Моих»");
        } });
        cell.append(del); g.append(cell);
      }
      body.append(g);
    };

    const showFind = async (q, page = 1, append = false) => {
      const t = ++token;
      if (!append) { body.innerHTML = ""; body.append(search, cats, h("p", { class: "sheet-note" }, "Ищу…")); }
      let res;
      try { res = (await S.sb.functions.invoke("gif", { body: { action: "search", q, page } })).data; } catch { res = null; }
      if (t !== token) return;
      body.innerHTML = ""; body.append(search, cats);
      this.state = { q, page };
      if (!res) { body.append(h("p", { class: "sheet-note" }, "Не удалось найти. Проверьте интернет.")); return; }
      if (!res.items?.length) body.append(h("p", { class: "sheet-note" }, "Ничего не найдено — попробуйте другое слово."));
      const g = grid();
      for (const it of res.items || []) {
        const cell = h("button", { class: "gif-cell", style: it.w && it.h ? { aspectRatio: `${it.w} / ${it.h}` } : {}, onclick: () => this.sendRemote(it, close) },
          h("img", { src: it.preview, loading: "lazy", alt: it.title || "GIF", draggable: false }));
        const dl = h("i", { class: "gif-act", title: "Скачать в «Мои GIF»", html: I.download, onclick: async (e) => {
          e.stopPropagation(); if (saved.has(it.id)) return toast("Уже в «Моих»");
          dl.classList.add("busy");
          try { const f = await this.fetchRemote(it); if (await this.save(f, it.title)) { saved.add(it.id); dl.classList.remove("busy"); dl.classList.add("done"); dl.textContent = "✓"; toast("✅ GIF скачан в «Мои»"); } else dl.classList.remove("busy"); }
          catch { dl.classList.remove("busy"); toast("Не удалось скачать GIF"); }
        } });
        cell.append(dl); g.append(cell);
      }
      body.append(g);
      if (res.items?.length >= 12) body.append(h("button", { class: "btn small ghost gif-more", onclick: () => this.more(q, page + 1, body, saved, close) }, "Показать ещё"));
      body.append(h("p", { class: "sheet-note gif-src" }, res.from === "giphy" ? "Источник: GIPHY" : "Источник: свободные GIF (Openverse)." + (S.isAdmin ? " Для живых реакций подключите GIPHY: Меню → Администратор." : "")));
    };

    const doSearch = () => showFind(input.value.trim(), 1);
    const input = h("input", { class: "gif-q", placeholder: "Найти GIF: привет, смех, танец…", enterkeyhint: "search" });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } });
    const search = h("div", { class: "gif-search" }, input, h("button", { class: "icon-btn", html: I.search, title: "Найти", onclick: doSearch }));
    const cats = h("div", { class: "gif-cats" }, GIF_CATS.map(([label, q]) => h("button", { onclick: () => { input.value = q; showFind(q, 1); } }, label)));

    const showAdd = () => {
      const file = h("input", { type: "file", accept: "image/gif,image/webp,image/png", class: "hidden" });
      file.onchange = async () => {
        const f = file.files[0]; file.value = ""; if (!f) return;
        if (f.size > GIF_MAX) return toast("GIF больше 6 МБ — выберите поменьше");
        if (await this.save(f, f.name.replace(/\.[^.]+$/, ""))) { toast("✅ GIF добавлен в «Мои»"); show("mine"); }
      };
      body.append(h("div", { class: "gif-pane" }, h("div", { class: "gif-hero" }, "🎞️"),
        h("p", null, "Добавьте свой GIF из галереи — он попадёт в «Мои» и будет под рукой в любом чате."),
        h("button", { class: "btn wide", onclick: () => file.click() }, "Выбрать GIF из галереи"), file,
        h("p", { class: "sheet-note" }, "До 6 МБ. Видео из галереи можно отправить через скрепку.")));
    };

    const show = async (k) => {
      tab = k; token++;
      tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.k === k));
      body.innerHTML = "";
      if (k === "mine") return showMine();
      if (k === "add") return showAdd();
      return showFind(this.state.q || "", 1);
    };
    box.append(tabs, body);
    show("find");
    return box;
  },
  // «Показать ещё»: подгружаем следующую страницу и добавляем в конец
  async more(q, page, body, saved, close) {
    let res; try { res = (await S.sb.functions.invoke("gif", { body: { action: "search", q, page } })).data; } catch { res = null; }
    const g = body.querySelector(".gif-grid"); const btn = body.querySelector(".gif-more");
    if (!res?.items?.length) { btn?.remove(); return toast("Больше ничего нет"); }
    this.state = { q, page };
    for (const it of res.items) {
      g.append(h("button", { class: "gif-cell", style: it.w && it.h ? { aspectRatio: `${it.w} / ${it.h}` } : {}, onclick: () => this.sendRemote(it, close) },
        h("img", { src: it.preview, loading: "lazy", alt: it.title || "GIF", draggable: false }),
        h("i", { class: "gif-act", title: "Скачать в «Мои GIF»", html: I.download, onclick: async (e) => {
          e.stopPropagation(); if (saved.has(it.id)) return toast("Уже в «Моих»");
          try { const f = await this.fetchRemote(it); if (await this.save(f, it.title)) { saved.add(it.id); toast("✅ GIF скачан в «Мои»"); } } catch { toast("Не удалось скачать GIF"); }
        } })));
    }
    if (res.items.length < 12) btn?.remove();
    if (btn) btn.onclick = () => this.more(q, page + 1, body, saved, close);
  },

  // ── администратор: ключ GIPHY (бесплатный, developers.giphy.com) — даёт настоящие «живые» GIF
  async adminSheet() {
    if (!S.isAdmin) return;
    const { data: on } = await S.sb.rpc("gif_status");
    const key = h("input", { class: "gif-q", placeholder: "Ключ GIPHY (API Key)", autocomplete: "off", spellcheck: false });
    let close;
    close = sheet([h("h3", null, "🎞 GIF: подключение GIPHY"),
      h("div", { class: `health${on ? " ok" : " bad"}` }, h("span", null, on ? "✓" : "•"), h("span", null, on ? "GIPHY подключён — в поиске живые GIF-реакции" : "GIPHY не подключён — работает поиск свободных GIF")),
      h("p", { class: "sheet-note" }, "1. Откройте developers.giphy.com и создайте бесплатный аккаунт.  2. «Create an App» → «API» → получите API Key.  3. Вставьте ключ сюда. Ключ хранится на сервере, участникам не показывается."),
      h("label", { class: "field" }, key),
      h("button", { class: "btn wide", onclick: async () => {
        const { data } = await S.sb.rpc("set_gif_key", { k: key.value.trim() });
        if (data === "OK") { toast("✅ Ключ сохранён"); close(); } else toast(data === "BAD_KEY" ? "Ключ выглядит неверно: только буквы и цифры, 16–64 знака" : "Не удалось сохранить");
      } }, "Сохранить ключ"),
      on ? h("button", { class: "menu-item danger", onclick: async () => { await S.sb.rpc("set_gif_key", { k: "" }); toast("Ключ удалён"); close(); } }, "Отключить GIPHY") : null]);
  },
};
