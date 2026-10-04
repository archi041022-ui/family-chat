/* Камера в приложении и сканер документов: съёмка, поиск листа на фото, выравнивание,
   улучшение («как скан»), несколько страниц → PDF. Всё считается на телефоне. */
"use strict";

const DocScan = {
  // ── поиск листа: светлое пятно на более тёмном фоне → четыре угла
  detect(canvas) {
    const W = 360, k = W / Math.max(canvas.width, canvas.height);
    const w = Math.max(1, Math.round(canvas.width * k)), hgt = Math.max(1, Math.round(canvas.height * k));
    const c = document.createElement("canvas"); c.width = w; c.height = hgt;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(canvas, 0, 0, w, hgt);
    const d = x.getImageData(0, 0, w, hgt).data;
    const g = new Uint8Array(w * hgt); const hist = new Uint32Array(256);
    for (let i = 0; i < w * hgt; i++) { const v = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8; g[i] = v; hist[v]++; }
    // порог Оцу
    const total = w * hgt; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, thr = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue; const wF = total - wB; if (!wF) break;
      sumB += i * hist[i]; const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF); if (between > best) { best = between; thr = i; }
    }
    // самая большая светлая область (поиск в ширину)
    const seen = new Uint8Array(w * hgt); let bestPix = null;
    const q = new Int32Array(w * hgt);
    for (let s = 0; s < w * hgt; s++) {
      if (seen[s] || g[s] <= thr) continue;
      let head = 0, tail = 0; q[tail++] = s; seen[s] = 1; const pix = [];
      while (head < tail) {
        const p = q[head++]; pix.push(p);
        const px = p % w, py = (p / w) | 0;
        if (px > 0 && !seen[p - 1] && g[p - 1] > thr) { seen[p - 1] = 1; q[tail++] = p - 1; }
        if (px < w - 1 && !seen[p + 1] && g[p + 1] > thr) { seen[p + 1] = 1; q[tail++] = p + 1; }
        if (py > 0 && !seen[p - w] && g[p - w] > thr) { seen[p - w] = 1; q[tail++] = p - w; }
        if (py < hgt - 1 && !seen[p + w] && g[p + w] > thr) { seen[p + w] = 1; q[tail++] = p + w; }
      }
      if (!bestPix || pix.length > bestPix.length) bestPix = pix;
    }
    const inset = () => { const m = 0.08; return [[m, m], [1 - m, m], [1 - m, 1 - m], [m, 1 - m]].map(([a, b]) => [a * canvas.width, b * canvas.height]); };
    if (!bestPix || bestPix.length < total * 0.12 || bestPix.length > total * 0.97) return inset();
    let tl, tr, br, bl, mTL = Infinity, mTR = -Infinity, mBR = -Infinity, mBL = Infinity;
    for (const p of bestPix) {
      const px = p % w, py = (p / w) | 0;
      const s1 = px + py, s2 = px - py;
      if (s1 < mTL) { mTL = s1; tl = [px, py]; }
      if (s1 > mBR) { mBR = s1; br = [px, py]; }
      if (s2 > mTR) { mTR = s2; tr = [px, py]; }
      if (s2 < mBL) { mBL = s2; bl = [px, py]; }
    }
    return [tl, tr, br, bl].map(([a, b]) => [(a + 0.5) / k, (b + 0.5) / k]);
  },

  // ── гомография: прямоугольник результата → четырёхугольник на фото
  homography(src, dst) {
    const A = [], B = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
    }
    // метод Гаусса
    const n = 8;
    for (let i = 0; i < n; i++) {
      let max = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[max][i])) max = r;
      [A[i], A[max]] = [A[max], A[i]]; [B[i], B[max]] = [B[max], B[i]];
      for (let r = i + 1; r < n; r++) {
        const f = A[r][i] / A[i][i];
        for (let c2 = i; c2 < n; c2++) A[r][c2] -= f * A[i][c2];
        B[r] -= f * B[i];
      }
    }
    const xs = new Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = B[i]; for (let c2 = i + 1; c2 < n; c2++) s -= A[i][c2] * xs[c2]; xs[i] = s / A[i][i]; }
    return [...xs, 1];
  },

  // ── выравнивание листа (перспектива) — по строкам, чтобы не подвешивать экран
  async warp(canvas, quad, maxSide = 1600) {
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let ow = Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2]));
    let oh = Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]));
    const s = Math.min(1, maxSide / Math.max(ow, oh)); ow = Math.max(50, Math.round(ow * s)); oh = Math.max(50, Math.round(oh * s));
    const H = this.homography([[0, 0], [ow, 0], [ow, oh], [0, oh]], quad);
    const sw = canvas.width, sh = canvas.height;
    const sd = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
    const out = document.createElement("canvas"); out.width = ow; out.height = oh;
    const ox = out.getContext("2d"); const img = ox.createImageData(ow, oh); const od = img.data;
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        const den = H[6] * x + H[7] * y + H[8];
        const u = (H[0] * x + H[1] * y + H[2]) / den, v = (H[3] * x + H[4] * y + H[5]) / den;
        const x0 = Math.min(sw - 2, Math.max(0, u | 0)), y0 = Math.min(sh - 2, Math.max(0, v | 0));
        const fx = Math.min(1, Math.max(0, u - x0)), fy = Math.min(1, Math.max(0, v - y0));
        const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
        const o = (y * ow + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const a = sd[i00 + ch] + (sd[i10 + ch] - sd[i00 + ch]) * fx;
          const b = sd[i01 + ch] + (sd[i11 + ch] - sd[i01 + ch]) * fx;
          od[o + ch] = a + (b - a) * fy;
        }
        od[o + 3] = 255;
      }
      if (y % 120 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    ox.putImageData(img, 0, 0);
    return out;
  },

  // ── фильтры: «скан» (чёрно-белый, чистый фон), «улучшить» (контраст), оригинал
  filter(canvas, mode) {
    if (mode === "original") return canvas;
    const w = canvas.width, hgt = canvas.height;
    const out = document.createElement("canvas"); out.width = w; out.height = hgt;
    const ox = out.getContext("2d", { willReadFrequently: true }); ox.drawImage(canvas, 0, 0);
    const img = ox.getImageData(0, 0, w, hgt); const d = img.data;
    if (mode === "enhance") {
      // автоуровни по яркости + немного насыщенности
      const hist = new Uint32Array(256);
      for (let i = 0; i < d.length; i += 4) hist[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8]++;
      const n = w * hgt; let lo = 0, hi = 255, acc = 0;
      for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.01) { lo = i; break; } }
      acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.02) { hi = i; break; } }
      const k = 255 / Math.max(1, hi - lo);
      for (let i = 0; i < d.length; i += 4) {
        const l = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
        const lk = (l - lo) * k;
        for (let c = 0; c < 3; c++) { let v = (d[i + c] - lo) * k; v = v + (v - lk) * 0.25; d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v; }
      }
    } else {
      // «скан»: адаптивный порог по среднему в окрестности (интегральное изображение)
      const g = new Float32Array(w * hgt);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) g[p] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      const I = new Float64Array((w + 1) * (hgt + 1));
      for (let y = 1; y <= hgt; y++) { let row = 0; for (let x = 1; x <= w; x++) { row += g[(y - 1) * w + x - 1]; I[y * (w + 1) + x] = I[(y - 1) * (w + 1) + x] + row; } }
      const r = Math.max(8, Math.round(Math.max(w, hgt) / 40));
      for (let y = 0; y < hgt; y++) {
        const y1 = Math.max(0, y - r), y2 = Math.min(hgt, y + r + 1);
        for (let x = 0; x < w; x++) {
          const x1 = Math.max(0, x - r), x2 = Math.min(w, x + r + 1);
          const cnt = (x2 - x1) * (y2 - y1);
          const mean = (I[y2 * (w + 1) + x2] - I[y1 * (w + 1) + x2] - I[y2 * (w + 1) + x1] + I[y1 * (w + 1) + x1]) / cnt;
          const v = g[y * w + x];
          // мягкий порог: текст тёмный, фон белый, без «зубцов»
          const t = (v - (mean - 12)) * 6 + 128;
          const o = (y * w + x) * 4; const c = t < 0 ? 0 : t > 255 ? 255 : t;
          d[o] = d[o + 1] = d[o + 2] = c;
        }
      }
    }
    ox.putImageData(img, 0, 0);
    return out;
  },

  jpeg(canvas, q = 0.85) { return new Promise((r) => canvas.toBlob((b) => r(b), "image/jpeg", q)); },

  // ── PDF из JPEG-страниц (A4, без внешних библиотек)
  async pdf(canvases) {
    const enc = new TextEncoder();
    const parts = []; const offsets = []; let len = 0;
    const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; };
    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    const nPages = canvases.length;
    // объекты: 1 каталог, 2 список страниц, затем на каждую страницу: страница, картинка, содержимое
    const pageIds = canvases.map((_, i) => 3 + i * 3);
    const obj = (id, body) => { offsets[id] = len; push(`${id} 0 obj\n`); if (typeof body === "string") push(body); else body.forEach(push); push("\nendobj\n"); };
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => id + " 0 R").join(" ")}] /Count ${nPages} >>`);
    for (let i = 0; i < nPages; i++) {
      const cv = canvases[i];
      const jpg = new Uint8Array(await (await this.jpeg(cv, 0.82)).arrayBuffer());
      const PW = 595.28, PH = 841.89, M = 18;
      const sc = Math.min((PW - 2 * M) / cv.width, (PH - 2 * M) / cv.height);
      const dw = cv.width * sc, dh = cv.height * sc, dx = (PW - dw) / 2, dy = (PH - dh) / 2;
      const id = pageIds[i];
      obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im${i} ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
      obj(id + 1, [`<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, "\nendstream"]);
      const content = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /Im${i} Do Q`;
      obj(id + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    }
    const count = 3 + nPages * 3;
    const xref = len;
    let x = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let i = 1; i < count; i++) x += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    push(x);
    push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: "application/pdf" });
  },
};

// ───────────── Камера: фото и документы ─────────────
const Camera = {
  async open(mode = "photo") {
    if (!navigator.mediaDevices?.getUserMedia) { toast("Камера недоступна на этом устройстве"); return; }
    if (Calls.pc || Calls.ui || GroupCall.active) { toast("Сначала завершите звонок"); return; }
    if (this.el) return;                                      // камера уже открыта
    this.mode = mode; this.facing = "environment"; this.pages = this.pages || [];
    const video = h("video", { class: "cam-video", autoplay: true, playsinline: true, muted: true }); video.muted = true;
    const tabs = h("div", { class: "cam-tabs" },
      h("button", { "data-m": "photo", onclick: () => this.setMode("photo") }, "Фото"),
      h("button", { "data-m": "doc", onclick: () => this.setMode("doc") }, "Документ"));
    const gal = h("input", { type: "file", accept: "image/*", class: "hidden", onchange: async () => {
      const f = gal.files[0]; gal.value = ""; if (!f) return;
      const img = await createImageBitmap(f).catch(() => null); if (!img) { toast("Не удалось открыть фото"); return; }
      const c = document.createElement("canvas"); const k = Math.min(1, 2400 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      this.got(c);
    } });
    this.el = h("div", { class: "camera" }, video,
      h("div", { class: "cam-frame" }),
      h("div", { class: "cam-top" },
        h("button", { class: "icon-btn", title: "Закрыть", html: I.close, onclick: () => this.close() }),
        h("span", { class: "cam-pages" }),
        h("button", { class: "icon-btn", title: "Повернуть камеру", html: I.flip, onclick: () => { this.facing = this.facing === "user" ? "environment" : "user"; this.start(); } })),
      h("div", { class: "cam-bottom" }, tabs,
        h("div", { class: "cam-row" },
          h("button", { class: "icon-btn cam-gal", title: "Из галереи", html: I.gallery, onclick: () => gal.click() }), gal,
          h("button", { class: "cam-shutter", title: "Снять", onclick: () => this.shoot() }),
          h("button", { class: "cam-done hidden", onclick: () => this.finishDoc() }, "PDF"))));
    document.body.append(this.el);
    this.video = video;
    this.setMode(mode);
    await this.start();
  },
  setMode(m) {
    this.mode = m;
    this.el?.classList.toggle("doc", m === "doc");
    this.el?.querySelectorAll(".cam-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
    this.updatePages();
  },
  updatePages() {
    const n = this.pages.length;
    const p = this.el?.querySelector(".cam-pages"); if (p) p.textContent = this.mode === "doc" && n ? `Страниц: ${n}` : "";
    this.el?.querySelector(".cam-done")?.classList.toggle("hidden", !(this.mode === "doc" && n));
  },
  async start() {
    this.stream?.getTracks().forEach((t) => t.stop());
    try {
      const got = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      if (!this.el) { got.getTracks().forEach((t) => t.stop()); return; }       // закрыли, пока шёл запрос доступа
      this.stream = got;
      this.video.srcObject = this.stream; this.video.play().catch(() => {});
      this.video.classList.toggle("mirror", this.facing === "user");
    } catch { toast("Нет доступа к камере"); this.close(); }
  },
  close() {
    this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null;
    this.el?.remove(); this.el = null; this.pages = [];
    $(".scan-editor")?.remove();
  },
  shoot() {
    const v = this.video; if (!v?.videoWidth) return;
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    const x = c.getContext("2d");
    if (this.facing === "user") { x.translate(c.width, 0); x.scale(-1, 1); }
    x.drawImage(v, 0, 0);
    this.el.classList.add("flash"); setTimeout(() => this.el?.classList.remove("flash"), 250);
    navigator.vibrate?.(20);
    this.got(c);
  },
  got(c) { if (this.mode === "doc") this.editDoc(c); else this.previewPhoto(c); },
  // обычное фото: посмотреть и отправить
  previewPhoto(c) {
    const url = c.toDataURL("image/jpeg", 0.9);
    const ed = h("div", { class: "scan-editor" },
      h("img", { class: "scan-img", src: url }),
      h("div", { class: "scan-bar" },
        h("button", { class: "btn ghost", onclick: () => ed.remove() }, "Переснять"),
        h("button", { class: "btn", onclick: async () => {
          const blob = await DocScan.jpeg(c, 0.9); ed.remove(); this.close();
          if (!S.current) { toast("Откройте чат, чтобы отправить"); return; }
          FX.sendAnim(); await sendFile(new File([blob], `Фото_${Date.now()}.jpg`, { type: "image/jpeg" }));
        } }, "Отправить")));
    document.body.append(ed);
  },
  // документ: углы листа можно подвинуть, затем выравнивание и фильтр
  editDoc(c) {
    let quad = DocScan.detect(c);
    const img = h("img", { class: "scan-img", src: c.toDataURL("image/jpeg", 0.85) });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("class", "scan-quad");
    const wrap = h("div", { class: "scan-stage" }, img, svg);
    const draw = () => {
      if (!ed.isConnected && ed.dataset.shown) { removeEventListener("resize", draw); return; }   // окно закрыто — слушатель больше не нужен
      const r = img.getBoundingClientRect(); const k = r.width / c.width;
      svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`); svg.style.width = r.width + "px"; svg.style.height = r.height + "px";
      const pts = quad.map(([a, b]) => [a * k, b * k]);
      svg.innerHTML = `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" />` + pts.map((p, i) => `<circle data-i="${i}" cx="${p[0]}" cy="${p[1]}" r="16" />`).join("");
    };
    let drag = -1;
    const pos = (e) => { const r = img.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; const k = c.width / r.width;
      return [Math.min(c.width, Math.max(0, (t.clientX - r.left) * k)), Math.min(c.height, Math.max(0, (t.clientY - r.top) * k))]; };
    const down = (e) => { const p = pos(e); let best = 1e9; quad.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < best) { best = d; drag = i; } }); if (best > c.width * 0.25) drag = -1; };
    const move = (e) => { if (drag < 0) return; e.preventDefault(); quad[drag] = pos(e); draw(); };
    svg.addEventListener("pointerdown", (e) => { down(e); svg.setPointerCapture?.(e.pointerId); });
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", () => { drag = -1; });
    const ed = h("div", { class: "scan-editor" },
      h("div", { class: "scan-title" }, "Подвиньте углы по краям листа"), wrap,
      h("div", { class: "scan-bar" },
        h("button", { class: "btn ghost", onclick: () => ed.remove() }, "Переснять"),
        h("button", { class: "btn ghost", onclick: () => { quad = [[0, 0], [c.width, 0], [c.width, c.height], [0, c.height]]; draw(); } }, "Весь кадр"),
        h("button", { class: "btn", onclick: async (e) => {
          e.currentTarget.disabled = true; e.currentTarget.textContent = "Выравниваю…";
          const flat = await DocScan.warp(c, quad);
          ed.remove(); this.filterStep(flat);
        } }, "Дальше")));
    document.body.append(ed); ed.dataset.shown = "1";
    img.onload = draw; addEventListener("resize", draw);
    this.lastQuad = quad;
  },
  filterStep(flat) {
    let mode = "scan";
    const prev = h("img", { class: "scan-img" });
    const render = () => { prev.src = DocScan.filter(flat, mode).toDataURL("image/jpeg", 0.85); };
    const chips = h("div", { class: "folders scan-filters" }, [["scan", "Скан (ч/б)"], ["enhance", "Улучшить"], ["original", "Оригинал"]].map(([m, l]) =>
      h("button", { class: m === mode ? "on" : "", onclick: (e) => { mode = m; chips.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.currentTarget)); render(); } }, l)));
    const ed = h("div", { class: "scan-editor" }, h("div", { class: "scan-title" }, "Как сохранить страницу?"), h("div", { class: "scan-stage" }, prev), chips,
      h("div", { class: "scan-bar" },
        h("button", { class: "btn ghost", onclick: () => { this.pages.push(DocScan.filter(flat, mode)); ed.remove(); this.updatePages(); toast(`Страница ${this.pages.length} добавлена — снимите следующую`); } }, "+ Ещё страница"),
        h("button", { class: "btn", onclick: () => { this.pages.push(DocScan.filter(flat, mode)); ed.remove(); this.finishDoc(); } }, "Готово")));
    document.body.append(ed);
    render();
  },
  async finishDoc() {
    if (!this.pages.length) return;
    const pages = this.pages.slice();
    const name = `Скан_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "-")}_${new Date().toTimeString().slice(0, 5).replace(":", "-")}.pdf`;
    toast("Собираю PDF…");
    const pdf = await DocScan.pdf(pages);
    this.close();
    let close;
    close = sheet([
      h("h3", null, `📄 PDF готов · ${pages.length} ${plural(pages.length, "страница", "страницы", "страниц")}`),
      h("div", { class: "pdf-thumbs" }, pages.slice(0, 6).map((p) => h("img", { src: p.toDataURL("image/jpeg", 0.5) }))),
      S.current ? h("button", { class: "btn wide", onclick: async () => { close(); FX.sendAnim(); await sendFile(new File([pdf], name, { type: "application/pdf" })); } }, "Отправить в этот чат") : null,
      h("button", { class: "menu-item", onclick: () => { close(); pickChatAndSend([new File([pdf], name, { type: "application/pdf" })], ""); } }, h("span", { html: I.forward }), "Отправить в другой чат"),
      h("button", { class: "menu-item", onclick: () => saveBlob(pdf, name) }, h("span", { html: I.download }), "Сохранить на телефон"),
    ]);
    this.lastPdf = pdf;
  },
};

// сохранить файл: в приложении — в «Загрузки» телефона, в браузере — обычное скачивание
async function saveBlob(blob, name) {
  if (window.AndroidBridge?.saveFile) {
    const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
    const ok = window.AndroidBridge.saveFile(b64, name, blob.type || "application/octet-stream");
    toast(ok ? `Сохранено в «Загрузки»: ${name}` : "Не удалось сохранить файл");
    return;
  }
  const u = URL.createObjectURL(blob); const a = h("a", { href: u, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}
