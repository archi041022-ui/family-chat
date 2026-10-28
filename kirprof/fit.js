/* Примерка материала: клиент загружает фото своей мебели (или берёт образец), отмечает обивку и видит её в выбранной ткани.
   Рисунок ткани строится кодом (рогожка, велюр, шенилл, жаккард, экокожа, кожа) или берётся с фото образца. Свет и тени остаются от исходного снимка. */
"use strict";
const FIT = {
  T: 256,
  types: [
    { id: "rog", n: "Рогожка", gloss: 0 }, { id: "vel", n: "Велюр", gloss: 0.25 }, { id: "chen", n: "Шенилл", gloss: 0 },
    { id: "jac", n: "Жаккард", gloss: 0.1 }, { id: "eco", n: "Экокожа", gloss: 0.8 }, { id: "lea", n: "Натуральная кожа", gloss: 1 },
  ],
  colors: [["Графит", "#4a5058"], ["Песок", "#c9b48e"], ["Терракот", "#9a4128"], ["Изумруд", "#1f5c4c"], ["Синий", "#2c4a7a"], ["Бордо", "#6b1f2e"],
    ["Молочный", "#e8e0d0"], ["Горчичный", "#c79a2e"], ["Серо-голубой", "#7d97a8"], ["Шоколад", "#4a3326"], ["Оливковый", "#6b7040"], ["Пудровый", "#d9a9a1"]],
  st: { type: 0, color: 1, custom: null, tool: "wand", tol: 24, brush: 18, scale: 100, rot: 0, inten: 100, sample: null },
  W: 0, H: 0, base: null, luma: null, mask: null, soft: null, tex: null, texName: "", undo: [], showOrig: false, raf: 0, cache: {},

  /* ───── рисунок ткани ───── */
  hash(x, y, s) { let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967295; },
  vn(x, y, per, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const m = a => ((a % per) + per) % per, h = this.hash.bind(this);
    const a = h(m(xi), m(yi), s), b = h(m(xi + 1), m(yi), s), c = h(m(xi), m(yi + 1), s), d = h(m(xi + 1), m(yi + 1), s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  },
  /** Множитель яркости рисунка в точке (x, y) тайла 256×256: около 1, тайл бесшовный. */
  mod(type, x, y) {
    const px = (this.hash(x, y, 7) - 0.5), TAU = Math.PI * 2;
    switch (type) {
      case "rog": {
        const cx = x >> 2, cy = y >> 2, lx = (x & 3) / 3, ly = (y & 3) / 3, hor = (cx + cy) & 1;
        const th = hor ? 0.84 + 0.3 * Math.sin(Math.PI * ly) : 0.84 + 0.3 * Math.sin(Math.PI * lx);
        return th + (this.hash(cx, cy, 3) - 0.5) * 0.12 + px * 0.08;
      }
      case "vel": return 1 + (this.vn(x / 2, y / 2, 128, 5) - 0.5) * 0.16 + (this.vn(x / 16, y / 16, 16, 9) - 0.5) * 0.1 + px * 0.05;
      case "chen": {
        const n = 0.5 * this.vn(x / 16, y / 16, 16, 1) + 0.3 * this.vn(x / 8, y / 8, 32, 2) + 0.2 * this.vn(x / 4, y / 4, 64, 3);
        return 0.72 + n * 0.56 + px * 0.1;
      }
      case "jac": {
        const cx = x >> 1, cy = y >> 1, w = ((cx + cy) & 1) ? 0.95 : 1.04;
        const f = Math.sin(TAU * x / 64) * Math.sin(TAU * y / 64) + 0.55 * Math.cos(TAU * (x + y) / 128) + 0.35 * Math.cos(TAU * (x - y) / 64);
        const t = Math.min(1, Math.max(0, (f - 0.15) / 0.5));
        return w + t * t * (3 - 2 * t) * 0.2 + px * 0.05;
      }
      case "eco": { const g = Math.abs(this.vn(x / 4, y / 4, 64, 11) - 0.5) * 2, s = Math.min(1, Math.max(0, (g - 0.08) / 0.4)); return 0.8 + s * s * (3 - 2 * s) * 0.36 + px * 0.05; }
      default: { const g = Math.abs(this.vn(x / 6.4, y / 6.4, 40, 13) - 0.5) * 2, s = Math.min(1, Math.max(0, (g - 0.1) / 0.45)); return 0.76 + s * s * (3 - 2 * s) * 0.36 + (this.vn(x / 32, y / 32, 8, 17) - 0.5) * 0.18 + px * 0.04; }
    }
  },
  hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; },
  makeTex(ti, ci) { return this.makeTexHex(this.types[ti].id, this.colors[ci][1]); },
  makeTexHex(ty, hex) {
    const key = ty + ":" + hex; if (this.cache[key]) return this.cache[key];
    const T = this.T, id = new ImageData(T, T), d = id.data, [r, g, b] = this.hex(hex);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const m = this.mod(ty, x, y), i = (y * T + x) * 4;
      d[i] = Math.min(255, r * m); d[i + 1] = Math.min(255, g * m); d[i + 2] = Math.min(255, b * m); d[i + 3] = 255;
    }
    return (this.cache[key] = { data: id, T });
  },
  /** Ткань с фото: серединка снимка, отражённая в стороны, чтобы не было швов. */
  customTex(img) {
    const s = Math.min(img.width, img.height), h = 256, c = document.createElement("canvas"); c.width = c.height = h;
    c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, h, h);
    const big = document.createElement("canvas"); big.width = big.height = h * 2; const g = big.getContext("2d");
    g.drawImage(c, 0, 0); g.save(); g.scale(-1, 1); g.drawImage(c, -h * 2, 0); g.restore();
    g.save(); g.scale(1, -1); g.drawImage(c, 0, -h * 2); g.restore(); g.save(); g.scale(-1, -1); g.drawImage(c, -h * 2, -h * 2); g.restore();
    return { data: g.getImageData(0, 0, h * 2, h * 2), T: h * 2 };
  },
  curTex() { return this.st.custom || this.makeTex(Math.max(0, this.st.type), this.st.color); },
  matName() {
    const m = this.st.cat; if (m) return m.name + (m.article ? ", арт. " + m.article : "") + (m.price ? ", " + m.price + " ₽" : "");
    if (this.st.type === -1 && !this.st.custom) return "выберите материал из каталога";
    return this.st.custom ? "своя ткань (по фото образца)" : this.types[this.st.type].n.toLowerCase() + ", " + this.colors[this.st.color][0].toLowerCase();
  },
  /** Материал из каталога мастерской: фото образца или рисунок по виду и цвету. */
  async pickCat(m) {
    this.st.cat = m;
    if (m.photo) {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = m.photo; });
      this.st.custom = this.customTex(img);
    } else { this.st.custom = this.makeTexHex(["rog", "vel", "chen", "jac", "eco", "lea"].includes(m.kind) ? m.kind : "vel", m.color); }
    this.st.catGloss = (this.types.find(t => t.id === m.kind) || { gloss: 0 }).gloss;
  },

  /* ───── фото ───── */
  async load(src) {
    const cv = $("#fitCv"); let bmp;
    try { bmp = await createImageBitmap(src, { imageOrientation: "from-image" }); }
    catch (e) { bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(src); }); }
    const k = Math.min(1, 960 / Math.max(bmp.width, bmp.height)), W = Math.max(8, Math.round(bmp.width * k)), H = Math.max(8, Math.round(bmp.height * k));
    cv.width = W; cv.height = H; const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, W, H); if (bmp.close) bmp.close();
    this.base = g.getImageData(0, 0, W, H); this.W = W; this.H = H;
    this.luma = new Float32Array(W * H); const b = this.base.data;
    for (let i = 0, j = 0; i < W * H; i++, j += 4) this.luma[i] = (b[j] * 0.299 + b[j + 1] * 0.587 + b[j + 2] * 0.114) / 255;
    this.mask = new Uint8Array(W * H); this.soft = new Uint8Array(W * H); this.undo = [];
    $("#fitEmpty").hidden = true; $("#fitTools").hidden = false; $("#fitSide").classList.remove("off");
    this.softAndRender(); this.hint("Нажмите на обивку: выделится вся ткань одного цвета. Что не попало в выделение — дорисуйте кистью.");
  },
  sample(id) {
    const it = ITEMS.find(x => x.id === id); this.st.sample = it ? it.t : null;
    const svgTxt = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 160"><rect width="300" height="160" fill="#f3f0ea"/><rect y="132" width="300" height="28" fill="#d9d3c7"/><ellipse cx="150" cy="140" rx="120" ry="7" fill="#000" opacity=".12"/>' + P[id].replace(/var\(--fab\)/g, "#a39d90") + "</svg>";
    return new Promise((res, rej) => {
      const i = new Image(); i.onerror = rej;
      i.onload = () => { const c = document.createElement("canvas"); c.width = 900; c.height = 480; c.getContext("2d").drawImage(i, 0, 0, 900, 480); c.toBlob(bl => this.load(bl).then(res, rej), "image/png"); };
      i.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgTxt);
    });
  },

  /* ───── выделение ───── */
  push() { this.undo.push(this.mask.slice()); if (this.undo.length > 15) this.undo.shift(); },
  wand(sx, sy) {
    const { W, H } = this, d = this.base.data, m = this.mask; this.push();
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.max(0, sy - 2); y <= Math.min(H - 1, sy + 2); y++) for (let x = Math.max(0, sx - 2); x <= Math.min(W - 1, sx + 2); x++) { const i = (y * W + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    r /= n; g /= n; b /= n;
    const lim = (this.st.tol * 2.2) ** 2, seen = new Uint8Array(W * H), st = [sy * W + sx];
    const ok = p => { const i = p * 4, dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b; return dr * dr + dg * dg + db * db <= lim; };
    while (st.length) {
      const p = st.pop(); if (seen[p]) continue; const y = (p / W) | 0; let x0 = p % W, x1 = x0;
      if (!ok(p)) { seen[p] = 1; continue; }
      while (x0 > 0 && !seen[y * W + x0 - 1] && ok(y * W + x0 - 1)) x0--;
      while (x1 < W - 1 && !seen[y * W + x1 + 1] && ok(y * W + x1 + 1)) x1++;
      for (let x = x0; x <= x1; x++) {
        const q = y * W + x; seen[q] = 1; m[q] = 255;
        if (y > 0 && !seen[q - W]) st.push(q - W); if (y < H - 1 && !seen[q + W]) st.push(q + W);
      }
    }
  },
  paint(cx, cy, add) {
    const { W, H } = this, r = this.st.brush, m = this.mask, r2 = r * r;
    for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) m[y * W + x] = add ? 255 : 0;
  },
  /** Мягкий край выделения (размытие 3×3 дважды), чтобы граница ткани не была зубчатой. */
  softAndRender() {
    const { W, H } = this, m = this.mask, t = new Uint8Array(W * H), o = this.soft;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, c = 0; for (let k = -1; k <= 1; k++) { const xx = x + k; if (xx >= 0 && xx < W) { s += m[y * W + xx]; c++; } } t[y * W + x] = s / c; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, c = 0; for (let k = -1; k <= 1; k++) { const yy = y + k; if (yy >= 0 && yy < H) { s += t[yy * W + x]; c++; } } o[y * W + x] = s / c; }
    let n = 0, sl = 0; for (let i = 0; i < W * H; i++) if (m[i] > 127) { n++; sl += this.luma[i]; }
    this.area = n; this.lm = n ? Math.max(0.08, sl / n) : 0.5;
    this.draw();
  },

  /* ───── показ результата ───── */
  draw() { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.render()); },
  render() {
    if (!this.base) return;
    const { W, H } = this, cv = $("#fitCv"), g = cv.getContext("2d"), out = new ImageData(W, H), o = out.data, b = this.base.data, soft = this.soft, luma = this.luma;
    const tex = this.area && !this.showOrig ? this.curTex() : null, td = tex ? tex.data.data : null, T = tex ? tex.T : 1;
    const th = this.st.rot * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th), k = 100 / this.st.scale, inten = this.st.inten / 100;
    const gloss = this.st.cat ? (this.st.cat.photo ? 0.3 : this.st.catGloss) : this.st.custom ? 0.3 : (this.types[this.st.type] || { gloss: 0 }).gloss, lm = this.lm;
    for (let y = 0, p = 0; y < H; y++) for (let x = 0; x < W; x++, p++) {
      const i = p * 4, a = soft[p];
      if (!a) { o[i] = b[i]; o[i + 1] = b[i + 1]; o[i + 2] = b[i + 2]; o[i + 3] = 255; continue; }
      if (!tex) {                                         // пока ткань не выбрана — показываем выделение бирюзой
        const t = a / 255 * (this.showOrig ? 0 : 0.45);
        o[i] = b[i] * (1 - t) + 116 * t; o[i + 1] = b[i + 1] * (1 - t) + 189 * t; o[i + 2] = b[i + 2] * (1 - t) + 179 * t; o[i + 3] = 255; continue;
      }
      const u = ((x * cs + y * sn) * k) | 0, v = ((-x * sn + y * cs) * k) | 0, tx = ((u % T) + T) % T, ty = ((v % T) + T) % T, q = (ty * T + tx) * 4;
      let ratio = luma[p] / lm; if (ratio < 0.2) ratio = 0.2; else if (ratio > 2) ratio = 2;
      const sh = Math.pow(ratio, 0.95), hl = ratio > 1.2 ? (ratio - 1.2) * 70 * gloss : 0, w = a / 255 * inten;
      const r = Math.min(255, td[q] * sh + hl), gg = Math.min(255, td[q + 1] * sh + hl), bb = Math.min(255, td[q + 2] * sh + hl);
      o[i] = b[i] + (r - b[i]) * w; o[i + 1] = b[i + 1] + (gg - b[i + 1]) * w; o[i + 2] = b[i + 2] + (bb - b[i + 2]) * w; o[i + 3] = 255;
    }
    g.putImageData(out, 0, 0); this.last = out;
  },
  hint(t) { $("#fitHint").textContent = t; },

  /* ───── сохранить и заказать ───── */
  async save() {
    if (!this.base) return;
    const c = document.createElement("canvas"); c.width = this.W; c.height = this.H; const g = c.getContext("2d");
    g.drawImage($("#fitCv"), 0, 0);
    g.font = "600 " + Math.max(14, this.W / 40) + "px sans-serif"; g.textAlign = "right"; g.fillStyle = "rgba(255,255,255,.85)"; g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 4;
    g.fillText("КИРПРОФ · " + this.matName(), this.W - 12, this.H - 12);
    const url = c.toDataURL("image/jpeg", 0.92), name = "kirprof-primerka.jpg";
    if (window.KirprofBridge && KirprofBridge.saveImage) { KirprofBridge.saveImage(url, name); return; }
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  },
  order() {
    const line = "Хочу обить в материале: " + this.matName() + (this.st.sample ? " (" + this.st.sample.toLowerCase() + ")" : "") + ". Примерка в приложении.";
    const n = $("#fNote"); n.value = (n.value ? n.value.replace(/Хочу обить в материале:[^\n]*\n?/g, "").trim() + "\n" : "") + line;
    go("cart");
  },
};

function initFit() {
  const F = FIT, cv = $("#fitCv");
  /* выбор мебели */
  const pick = (cap) => { const i = $("#fitFile"); if (cap) i.setAttribute("capture", "environment"); else i.removeAttribute("capture"); i.click(); };
  $("#fitCam").onclick = () => pick(true); $("#fitGal").onclick = () => pick(false);
  $("#fitFile").onchange = async e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; F.st.sample = null; try { await F.load(f); } catch (x) { F.hint("Не удалось открыть снимок. Попробуйте другой."); } };
  $("#fitSamples").innerHTML = ""; ["sofa", "arm", "chair", "pouf", "bed", "corner"].forEach(id => {
    const it = ITEMS.find(x => x.id === id); if (!it) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = it.t.replace(/^(Перетяжка|Обивка) /, "").replace(/^./, c => c.toUpperCase()); b.onclick = () => F.sample(id); $("#fitSamples").appendChild(b);
  });
  /* инструменты */
  const modes = [["wand", "Палочка"], ["brush", "Кисть"], ["erase", "Ластик"]];
  modes.forEach(([id, n]) => { const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.dataset.tool = id; b.textContent = n; b.onclick = () => setTool(id); $("#fitModes").appendChild(b); });
  const setTool = id => {
    F.st.tool = id; document.querySelectorAll("#fitModes .chip").forEach(b => b.setAttribute("aria-pressed", b.dataset.tool === id));
    const wand = id === "wand"; $("#fitRngL").firstChild.textContent = wand ? "Допуск цвета " : "Размер кисти "; const r = $("#fitRng"); r.min = wand ? 5 : 3; r.max = wand ? 80 : 60; r.value = wand ? F.st.tol : F.st.brush;
  };
  $("#fitRng").oninput = e => { if (F.st.tool === "wand") F.st.tol = +e.target.value; else F.st.brush = +e.target.value; };
  setTool("wand");
  $("#fitUndo").onclick = () => { const m = F.undo.pop(); if (m) { F.mask = m; F.softAndRender(); } };
  $("#fitClear").onclick = () => { if (!F.base) return; F.push(); F.mask.fill(0); F.softAndRender(); F.hint("Выделение сброшено. Нажмите на обивку."); };
  /* касание холста */
  let drawing = false, moved = false;
  const pos = e => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(F.W - 1, Math.round((e.clientX - r.left) * F.W / r.width))), Math.max(0, Math.min(F.H - 1, Math.round((e.clientY - r.top) * F.H / r.height)))]; };
  cv.addEventListener("pointerdown", e => {
    if (!F.base) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); const [x, y] = pos(e);
    if (F.st.tool === "wand") { F.wand(x, y); F.softAndRender(); F.hint(F.area < 200 ? "Выделилось мало. Увеличьте допуск или обведите обивку кистью." : "Готово. Выберите материал справа, лишнее уберите ластиком."); return; }
    F.push(); drawing = true; F.paint(x, y, F.st.tool === "brush"); F.softAndRender();
  });
  cv.addEventListener("pointermove", e => { if (!drawing) return; const [x, y] = pos(e); F.paint(x, y, F.st.tool === "brush"); F.softAndRender(); });
  const end = () => { drawing = false; };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  const hold = on => () => { F.showOrig = on; F.draw(); };
  const cmp = $("#fitCmp"); cmp.addEventListener("pointerdown", hold(true)); ["pointerup", "pointerleave", "pointercancel"].forEach(ev => cmp.addEventListener(ev, hold(false)));
  /* материалы */
  const thumb = (tex) => { const k = document.createElement("canvas"); k.width = k.height = 44; const tmp = document.createElement("canvas"); tmp.width = tmp.height = tex.T;
    tmp.getContext("2d").putImageData(tex.data, 0, 0); k.getContext("2d").drawImage(tmp, 0, 0, 44, 44); return k; };
  const drawSw = () => {
    const box = $("#fitSw"); box.innerHTML = "";
    if (F.st.type === -1) {                                       // каталог мастерской
      F.catalog.forEach(m => {
        const b = document.createElement("button"); b.type = "button"; b.className = "fsw"; b.title = m.name; b.setAttribute("aria-label", m.name);
        if (m.photo) { const im = document.createElement("img"); im.src = m.photo; im.alt = ""; im.style.cssText = "width:100%;height:100%;object-fit:cover;display:block"; b.appendChild(im); }
        else b.appendChild(thumb(F.makeTexHex(["rog", "vel", "chen", "jac", "eco", "lea"].includes(m.kind) ? m.kind : "vel", m.color)));
        b.setAttribute("aria-pressed", !!F.st.cat && F.st.cat.id === m.id);
        b.onclick = async () => { try { await F.pickCat(m); } catch (x) { F.hint("Не удалось открыть фото материала."); return; } drawSw(); label(); F.draw(); }; box.appendChild(b);
      });
      return;
    }
    F.colors.forEach((c, i) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "fsw"; b.title = c[0]; b.setAttribute("aria-label", c[0]);
      b.appendChild(thumb(F.makeTex(F.st.type, i))); b.setAttribute("aria-pressed", !F.st.custom && F.st.color === i);
      b.onclick = () => { F.st.custom = null; F.st.cat = null; F.st.color = i; drawSw(); label(); F.draw(); }; box.appendChild(b);
    });
  };
  const label = () => { $("#fitMat").textContent = "Материал: " + F.matName() + (F.st.cat && F.st.cat.stock ? ". В наличии: " + F.st.cat.stock : ""); };
  const selTypes = () => document.querySelectorAll("#fitTypes .chip").forEach(x => x.setAttribute("aria-pressed", +x.dataset.t === F.st.type));
  F.types.forEach((t, i) => { const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.dataset.t = i; b.textContent = t.n; b.setAttribute("aria-pressed", i === F.st.type);
    b.onclick = () => { F.st.type = i; F.st.custom = null; F.st.cat = null; selTypes(); drawSw(); label(); F.draw(); }; $("#fitTypes").appendChild(b); });
  /* каталог мастерской появляется, если владелец добавил материалы */
  F.catalog = [];
  F.refreshCat = () => rpc("kp_materials_list").then(list => {
    if (!Array.isArray(list)) return; F.catalog = list;
    let b = $("#fitCatChip");
    if (!list.length) { if (b) { b.remove(); if (F.st.type === -1) { F.st.type = 0; F.st.cat = null; F.st.custom = null; selTypes(); } } }
    else if (!b) {
      b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.dataset.t = -1; b.id = "fitCatChip"; b.textContent = "Каталог мастерской"; b.setAttribute("aria-pressed", false);
      b.onclick = () => { F.st.type = -1; F.st.custom = null; F.st.cat = null; selTypes(); drawSw(); label(); F.draw(); };
      $("#fitTypes").appendChild(b);
    }
    if (F.st.cat && !list.some(m => m.id === F.st.cat.id)) { F.st.cat = null; F.st.custom = null; }
    drawSw(); label(); F.draw();
  }).catch(() => { /* каталога нет */ });
  F.refreshCat();
  $("#fitOwn").onclick = () => $("#fitFab").click();
  $("#fitFab").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      let bmp; try { bmp = await createImageBitmap(f, { imageOrientation: "from-image" }); } catch (x) { bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(f); }); }
      F.st.cat = null; F.st.custom = F.customTex(bmp); drawSw(); label(); F.draw();
    } catch (x) { F.hint("Не удалось открыть фото ткани."); }
  };
  [["fitScale", "scale"], ["fitRot", "rot"], ["fitInt", "inten"]].forEach(([id, k]) => { $("#" + id).oninput = e => { F.st[k] = +e.target.value; $("#" + id + "V").textContent = e.target.value + (k === "rot" ? "°" : "%"); F.draw(); }; });
  $("#fitSave").onclick = () => F.save(); $("#fitOrder").onclick = () => F.order();
  drawSw(); label();
  $("#fitSide").classList.add("off"); $("#fitTools").hidden = true;
}
