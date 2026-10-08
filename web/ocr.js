/* v4.7: «Фото → текст» прямо в приложении (движок Tesseract, Apache 2.0, русский словарь). Работает без Claude и без аккаунтов.
   Движок и словарь (≈15 МБ) скачиваются один раз с сайта семьи и дальше хранятся в памяти телефона.
   Печатный текст читает хорошо, рукописный — заметно хуже: для сложного почерка рядом остаётся плитка через Claude. */
"use strict";

const Ocr = {
  worker: null, loading: null, busy: false,
  libUrl: "vendor/tesseract.min.js",
  workerUrl: "vendor/tesseract-worker.min.js",
  /** Откуда брать тяжёлые файлы: в приложении — с сайта семьи, на сайте — оттуда же. */
  base() {
    if (window.CHAT_CONFIG?.ocrBase) return window.CHAT_CONFIG.ocrBase;
    const site = (typeof APP_LINKS !== "undefined" && APP_LINKS.site) || "./";
    return (location.hostname === "appassets.androidplatform.net" ? site.replace(/\/?$/, "/") : new URL("./", location.href).href) + "models/ocr/";
  },
  abs(p) { return new URL(p, location.href).href; },
  async loadLib() {
    if (window.Tesseract) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script"); s.src = this.libUrl;
      s.onload = resolve; s.onerror = () => reject(new Error("lib"));
      document.head.append(s);
    });
  },
  /** Подготовка снимка: размер, оттенки серого, выравнивание неровного освещения (бумага, тени). */
  async prepare(blob) {
    let bmp;
    try { bmp = await createImageBitmap(blob, { imageOrientation: "from-image" }); }
    catch {
      bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); });
    }
    const w0 = bmp.width, h0 = bmp.height, long = Math.max(w0, h0);
    const k = long > 2400 ? 2400 / long : long < 1400 ? Math.min(2, 1400 / long) : 1;
    const W = Math.round(w0 * k), H = Math.round(h0 * k);
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    cx.fillStyle = "#fff"; cx.fillRect(0, 0, W, H); cx.drawImage(bmp, 0, 0, W, H);
    const img = cx.getImageData(0, 0, W, H), d = img.data, n = W * H;
    const g = new Uint8Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    // порог по среднему яркости вокруг каждой точки (интегральное изображение)
    const I = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
    const r = Math.max(12, Math.round(Math.min(W, H) / 40));
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
        const sum = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
        const mean = sum / ((x1 - x0) * (y1 - y0));
        const v = g[y * W + x] < mean * 0.9 ? 0 : 255;
        const j = (y * W + x) * 4; d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    if (bmp.close) bmp.close();
    return cv;
  },
  async engine(onStatus) {
    if (this.worker) return this.worker;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      onStatus?.("Загружаю движок распознавания…");
      await this.loadLib();
      const base = this.base();
      const w = await window.Tesseract.createWorker("rus", 1, {
        workerPath: this.abs(this.workerUrl),
        corePath: base + "core",
        langPath: base + "lang",
        logger: (m) => {
          if (m.status === "recognizing text") onStatus?.(`Читаю текст… ${Math.round((m.progress || 0) * 100)}%`);
          else if (/loading language/.test(m.status || "")) onStatus?.("Загружаю русский словарь (один раз)…");
        },
      });
      await w.setParameters({ preserve_interword_spaces: "1", user_defined_dpi: "300" });
      this.worker = w; return w;
    })();
    try { return await this.loading; } finally { this.loading = null; }
  },
  /** Главная функция: картинка → текст. */
  async recognize(blob, onStatus) {
    onStatus?.("Готовлю снимок…");
    const cv = await this.prepare(blob);
    const w = await this.engine(onStatus);
    const { data } = await w.recognize(cv);
    return (data.text || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  },

  // ───────── Окно в приложении ─────────
  open() {
    let close;
    const status = h("p", { class: "sheet-note" }, "Сфотографируйте страницу или выберите снимок из галереи.");
    const out = h("textarea", { rows: 9, class: "hidden", placeholder: "Здесь появится текст", style: { width: "100%" } });
    const actions = h("div", { class: "hidden", style: { display: "none", gap: "8px", flexWrap: "wrap", marginTop: "8px" } });
    const mkInput = (capture) => { const i = h("input", { type: "file", accept: "image/*", class: "hidden" }); if (capture) i.setAttribute("capture", "environment"); i.onchange = () => i.files[0] && run(i.files[0]); return i; };
    const cam = mkInput(true), gal = mkInput(false);
    const run = async (file) => {
      if (this.busy) return; this.busy = true;
      out.classList.add("hidden"); actions.style.display = "none";
      try {
        const text = await this.recognize(file, (t) => { status.textContent = t; });
        out.value = text; out.classList.remove("hidden"); actions.style.display = "flex";
        status.textContent = text ? "Готово. Проверьте текст и поправьте ошибки." : "Текст не найден. Попробуйте снять ближе и при хорошем свете.";
      } catch (e) {
        status.textContent = "Не удалось распознать. Нужен интернет при первом запуске: движок скачивается один раз.";
      } finally { this.busy = false; }
    };
    const act = (label, fn) => h("button", { class: "btn small", onclick: fn }, label);
    actions.append(
      act("Копировать", async () => { try { await navigator.clipboard.writeText(out.value); toast("Текст скопирован"); } catch { out.select(); toast("Выделите и скопируйте вручную"); } }),
      act("В заметку", () => { if (typeof MaksPlus !== "undefined") { MaksPlus.addNote(out.value); toast("Сохранено в заметки"); } }),
      act("Поделиться", () => { if (window.AndroidBridge?.shareText) window.AndroidBridge.shareText(out.value); else navigator.share?.({ text: out.value }).catch(() => {}); }));
    close = sheet([
      h("h3", null, "Фото → текст"),
      h("button", { class: "btn wide", onclick: () => cam.click() }, h("span", { html: I.camera || I.gallery || I.clip }), "Сфотографировать"),
      h("button", { class: "menu-item", onclick: () => gal.click() }, h("span", { html: I.gallery || I.clip }), "Выбрать из галереи"), cam, gal,
      status, out, actions,
      h("p", { class: "sheet-note" }, "Печатный текст читается хорошо. Рукописный — хуже: для сложного почерка есть плитка «Рукопись → текст (Claude)»."),
    ]);
    return close;
  },
};
