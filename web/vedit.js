/* Видеоредактор в стиле TikTok: съёмка частями или видео/фото из галереи, монтаж
   (обрезка, скорость, порядок, фильтры, текст, стикеры, музыка, эффекты) и публикация в статус. */
"use strict";

// ───────── Длительность в WebM ─────────
// MediaRecorder записывает WebM без длительности — проигрыватели думают, что видео «бесконечное».
// Дописываем элемент Duration в раздел Info (без перекодирования).
const WebmFix = {
  vint(b, i) {             // размер: [значение, длина], значение null — «неизвестный размер»
    const f = b[i]; let len = 1, m = 0x80;
    while (len <= 8 && !(f & m)) { len++; m >>= 1; }
    if (len > 8) return [null, 1];
    let v = f & (m - 1), allOnes = v === m - 1;
    for (let k = 1; k < len; k++) { v = v * 256 + b[i + k]; if (b[i + k] !== 0xff) allOnes = false; }
    return [allOnes ? null : v, len];
  },
  id(b, i) { const f = b[i]; let len = 1, m = 0x80; while (len <= 4 && !(f & m)) { len++; m >>= 1; } let v = 0; for (let k = 0; k < len; k++) v = v * 256 + b[i + k]; return [v, len]; },
  sizeBytes(v) {           // размер в 8 байтах (максимально совместимо)
    const out = new Uint8Array(8); out[0] = 0x01; let x = v;
    for (let k = 7; k >= 1; k--) { out[k] = x % 256; x = Math.floor(x / 256); }
    return out;
  },
  async fix(blob, ms) {
    try {
      const b = new Uint8Array(await blob.arrayBuffer());
      let i = 0;
      // EBML-заголовок
      let [id, il] = this.id(b, i); if (id !== 0x1A45DFA3) return blob;
      let [sz, sl] = this.vint(b, i + il); i += il + sl + sz;
      [id, il] = this.id(b, i); if (id !== 0x18538067) return blob;            // Segment
      [, sl] = this.vint(b, i + il); i += il + sl;
      for (let guard = 0; guard < 64 && i < b.length; guard++) {
        [id, il] = this.id(b, i); const [size, szl] = this.vint(b, i + il);
        if (id === 0x1549A966 && size != null) {                               // Info
          const start = i + il + szl, end = start + size;
          let scale = 1e6, durAt = -1, j = start;
          while (j < end) {
            const [cid, cl] = this.id(b, j); const [cs, csl] = this.vint(b, j + cl);
            if (cid === 0x2AD7B1) { let v = 0; for (let k = 0; k < cs; k++) v = v * 256 + b[j + cl + csl + k]; scale = v || 1e6; }
            if (cid === 0x4489) durAt = j;
            j += cl + csl + cs;
          }
          const dur = new Uint8Array(11); dur[0] = 0x44; dur[1] = 0x89; dur[2] = 0x88;
          new DataView(dur.buffer).setFloat64(3, ms * 1e6 / scale);
          let content = b.slice(start, end);
          if (durAt >= 0) {                                                      // уже есть — заменяем
            const [, cl] = this.id(b, durAt); const [cs, csl] = this.vint(b, durAt + cl);
            const a = durAt - start, z = a + cl + csl + cs;
            content = new Uint8Array([...content.slice(0, a), ...dur, ...content.slice(z)]);
          } else content = new Uint8Array([...content, ...dur]);
          const head = b.slice(0, i), idb = b.slice(i, i + il), tail = b.slice(end);
          return new Blob([head, idb, this.sizeBytes(content.length), content, tail], { type: blob.type || "video/webm" });
        }
        if (size == null) return blob;
        i += il + szl + size;
      }
    } catch { /* оставим как есть */ }
    return blob;
  },
};

const VE_FILTERS = [
  ["none", "Обычный", ""],
  ["vivid", "Яркий", "saturate(1.45) contrast(1.1)"],
  ["warm", "Тёплый", "sepia(0.25) saturate(1.3) hue-rotate(-10deg)"],
  ["cool", "Холодный", "saturate(1.1) hue-rotate(15deg) brightness(1.03)"],
  ["bw", "Ч/Б", "grayscale(1) contrast(1.15)"],
  ["vintage", "Ретро", "sepia(0.55) contrast(0.95) brightness(1.05) saturate(0.85)"],
  ["drama", "Драма", "contrast(1.35) saturate(0.8) brightness(0.92)"],
  ["soft", "Нежный", "brightness(1.08) saturate(0.9) contrast(0.9)"],
  ["neon", "Неон", "saturate(2) hue-rotate(290deg) contrast(1.1)"],
];
const VE_EFFECT_GROUPS = [
  ["Кадр", [["blurbg", "Размытый фон"], ["zoom", "Медленный зум"], ["pulse", "Пульс в ритм"], ["mirror", "Зеркало"], ["cinema", "Кинорамка"]]],
  ["Стиль", [["vignette", "Виньетка"], ["grain", "Плёнка"], ["vhs", "VHS-кассета"], ["glitch", "Глитч"], ["rainbow", "Радуга"], ["shake", "Тряска"], ["flash", "Вспышка на стыках"]]],
];
const VE_PARTICLES = [[null, "Нет"], ["hearts", "❤️ Сердечки"], ["snow", "❄️ Снег"], ["confetti", "🎊 Конфетти"], ["sparkles", "✨ Блёстки"]];
const VE_TRANSITIONS = [["none", "Без перехода"], ["fade", "Затемнение"], ["flash", "Вспышка"], ["zoom", "Наезд"], ["slide", "Сдвиг"], ["blur", "Размытие"], ["spin", "Поворот"]];
const VE_TEXT_ANIMS = [["none", "Без анимации"], ["pop", "Появление"], ["type", "Печать"], ["fade", "Проявление"], ["bob", "Покачивание"], ["pulse", "Пульс"]];
const VE_MOODS = [["happy", "😊 Весёлая"], ["calm piano", "🌿 Спокойная"], ["party dance", "🎉 Праздник"], ["children kids", "🧸 Детская"], ["romantic love", "💕 Романтика"], ["energetic rock", "⚡ Энергичная"], ["cinematic", "🎬 Кино"], ["acoustic guitar", "🎸 Гитара"]];
const VE_COLORS = ["#ffffff", "#000000", "#E8664F", "#F2A541", "#FFE14D", "#2EAD6B", "#3D8BFD", "#9B5DE5", "#E0457B"];
const VE_STICKERS = "😂 😍 🥰 😎 🤩 🥳 😜 😇 🤗 😭 😱 🔥 ✨ 🎉 ❤️ 💯 👍 👏 🙏 💪 👋 🌹 🌸 ☀️ 🌈 ⭐ 🎂 🎁 🐶 🐱 🦄 🍕 ☕ 🏖️ 🎵 📍".split(" ");
const VE_SPEEDS = [0.5, 1, 1.5, 2, 3];

const VideoEditor = {
  W: 540, H: 960, MAX: 60,
  st: null,

  supported() { return !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream); },

  /** opts: { chat } — из чата (по умолчанию «Отправить в этот чат»); без chat — для статуса */
  async open(opts = {}) {
    if (!this.supported()) { toast("Видеоредактор не поддерживается на этом устройстве"); return; }
    if (Calls.pc || Calls.ui || GroupCall.active) { toast("Сначала завершите звонок"); return; }
    this.close();
    this.st = { opts, clips: [], overlays: [], filter: "none", adj: { b: 100, c: 100, s: 100 }, effects: new Set(), transition: "fade", particles: null,
      music: null, musicVol: 0.8, origVol: 1, sel: 0 };
    this.root = h("div", { class: "ve-root" });
    this.pool = h("div", { class: "ve-pool" });                 // скрытые видео-элементы клипов
    this.root.append(this.pool);
    document.body.append(this.root);
    if (opts.files?.length) { await this.addFiles(opts.files); this.editor(); }
    else if (opts.pick) { this.pickFiles(() => this.editor()); this.camera(); }   // галерея поверх камеры: отмена — остаёмся снимать
    else this.camera();
  },
  /** Остановить весь звук редактора: клипы, музыку, предпросмотр результата. */
  silence() {
    try { this.player?.pause(); } catch { /* */ }
    for (const el of this.root?.querySelectorAll("video, audio") || []) { try { el.pause(); } catch { /* */ } }
    for (const el of document.querySelectorAll(".ve-result")) { try { el.pause(); } catch { /* */ } }
    try { this.st?.music?.el.pause(); } catch { /* */ }
    try { this.mlPreview?.pause(); } catch { /* */ }
  },
  /** Приложение свернули / пришёл звонок — ставим на паузу (монтаж сохраняется). */
  onBackground() { if (this.root) this.silence(); },
  close() {
    if (!this.root) return;
    this.silence();
    try { this.cam?.stop?.(); } catch { /* */ }
    // выгружаем все файлы: звук не может продолжиться после закрытия
    for (const el of this.root.querySelectorAll("video, audio")) { try { el.pause(); el.removeAttribute("src"); el.srcObject = null; el.load(); } catch { /* */ } }
    this.st?.clips.forEach((c) => { try { URL.revokeObjectURL(c.url); } catch { /* */ } });
    if (this.st?.music) { try { URL.revokeObjectURL(this.st.music.url); } catch { /* */ } }
    try { this.ac?.close(); } catch { /* */ }
    this.ac = null; this.player = null; this.cam = null; this.st = null;
    this.root.remove(); this.root = null;
  },
  /** «Назад»: из монтажа — к камере, из камеры — выход (с вопросом, если уже что-то снято) */
  back() {
    if (this.root?.querySelector(".ve-export")) return;                 // идёт сборка видео
    if (this.root?.querySelector(".ve-edit")) { this.player?.stop(); this.camera(); return; }
    this.confirmClose();
  },
  confirmClose() {
    if (!this.st?.clips.length) return this.close();
    let close;
    close = sheet([h("h3", null, "Выйти из редактора?"), h("p", { class: "sheet-note" }, "Смонтированное видео не сохранится."),
      h("button", { class: "menu-item danger", onclick: () => { close(); this.close(); } }, "Выйти без сохранения"),
      h("button", { class: "menu-item", onclick: () => close() }, "Продолжить монтаж")]);
  },
  total() { return this.st.clips.reduce((a, c) => a + this.len(c), 0); },
  len(c) { return Math.max(0.1, (c.out - c.in) / c.speed); },

  // ───────── Клипы ─────────
  async makeClip(blob, kind, knownSec, speed = 1) {
    const url = URL.createObjectURL(blob);
    let el, dur = knownSec || 3;
    if (kind === "video") {
      el = h("video", { src: url, playsinline: true, preload: "auto" }); el.muted = false; el.crossOrigin = "anonymous";
      this.pool.append(el);
      dur = await this.probe(el, knownSec);
      if (!dur) { el.remove(); URL.revokeObjectURL(url); return null; }
    } else {
      el = new Image(); el.src = url;
      try { await el.decode(); } catch { URL.revokeObjectURL(url); return null; }
    }
    const thumb = this.thumb(el);
    return { id: crypto.randomUUID(), blob, url, kind, el, dur, in: 0, out: kind === "video" ? Math.min(dur, this.MAX) : 3, speed, thumb };
  },
  probe(el, known) {
    return new Promise((res) => {
      let done = false; const fin = (v) => { if (done) return; done = true; clearTimeout(t); res(v); };
      const t = setTimeout(() => fin(known || (isFinite(el.duration) ? el.duration : 0)), 8000);
      el.addEventListener("error", () => fin(0), { once: true });
      el.addEventListener("loadedmetadata", () => {
        if (isFinite(el.duration) && el.duration > 0) { el.currentTime = 0; return fin(el.duration); }
        if (known) return fin(known);
        // WebM без длительности: перематываем в конец — браузер узнаёт настоящую длину
        el.addEventListener("durationchange", function f() { if (isFinite(el.duration)) { el.removeEventListener("durationchange", f); el.currentTime = 0; fin(el.duration); } });
        el.currentTime = 1e7;
      }, { once: true });
      el.load();
    });
  },
  thumb(el) {
    const c = document.createElement("canvas"); c.width = 72; c.height = 128;
    const draw = () => { try { this.cover(c.getContext("2d"), el, 72, 128, 1); } catch { /* */ } };
    if (el.tagName === "VIDEO") { const on = () => { draw(); el.removeEventListener("seeked", on); }; el.addEventListener("seeked", on); setTimeout(draw, 600); } else draw();
    return c;
  },
  async addFiles(files) {
    let n = 0;
    for (const f of files) {
      if (this.total() >= this.MAX) { toast(`Видео — до ${this.MAX} секунд`); break; }
      const kind = f.type.startsWith("video/") ? "video" : f.type.startsWith("image/") ? "image" : null;
      if (!kind) continue;
      const c = await this.makeClip(f, kind);
      if (c) { this.st.clips.push(c); n++; } else toast("Не удалось открыть: " + (f.name || "файл"));
    }
    this.fitMax();
    return n;
  },
  fitMax() {   // общая длина не больше минуты — подрезаем последний клип
    let over = this.total() - this.MAX;
    for (let k = this.st.clips.length - 1; k >= 0 && over > 0.01; k--) {
      const c = this.st.clips[k], cut = Math.min(over * c.speed, c.out - c.in - 0.5);
      if (cut > 0) { c.out -= cut; over -= cut / c.speed; }
    }
  },
  pickFiles(cb) {
    const inp = h("input", { type: "file", accept: "video/*,image/*", multiple: true, style: { display: "none" } });
    inp.onchange = async () => { const fs = [...inp.files]; inp.remove(); if (fs.length) { toast("Открываю…", 1200); await this.addFiles(fs); cb?.(); } };
    this.root.append(inp); inp.click();
  },

  // ───────── Камера ─────────
  async camera() {
    const st = this.st; this.player?.stop();
    const v = h("video", { autoplay: true, playsinline: true, muted: true, class: "ve-cam-video" }); v.muted = true;
    const bars = h("div", { class: "ve-segbar" });
    const timeLbl = h("div", { class: "ve-cam-time" }, "0:00");
    const rec = h("button", { class: "ve-rec", title: "Запись" }, h("i"));
    const count = h("div", { class: "ve-count hidden" });
    let facing = "user", speed = 1, timer = 0, stream = null, mr = null, segStart = 0, tick = null, recording = false;
    const segs = () => st.clips.filter((c) => c.fromCam);
    const used = () => this.total();
    const drawBars = () => {
      bars.innerHTML = "";
      for (const c of st.clips) bars.append(h("i", { style: { width: (this.len(c) / this.MAX * 100) + "%" } }));
      if (recording) bars.append(h("i", { class: "live", style: { width: (Math.min((Date.now() - segStart) / 1000 / speed, this.MAX - used()) / this.MAX * 100) + "%" } }));
      const t = used() + (recording ? (Date.now() - segStart) / 1000 / speed : 0);
      timeLbl.textContent = fmtDur(t);
      next.classList.toggle("hidden", !st.clips.length || recording);
      undo.classList.toggle("hidden", !segs().length || recording);
    };
    const start = async () => {
      stream?.getTracks().forEach((t) => t.stop());
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 30, max: 30 } },
          audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: true }); }
        catch { toast("Нет доступа к камере — можно выбрать видео из галереи", 4000); return; }
      }
      if (!v.isConnected) { stream.getTracks().forEach((t) => t.stop()); stream = null; return; }   // уже ушли в монтаж
      v.srcObject = stream; v.classList.toggle("mirror", facing === "user");
    };
    const stopRec = () => {
      if (!recording) return;
      recording = false; clearInterval(tick); rec.classList.remove("on");
      try { mr.stop(); } catch { /* */ }
    };
    const startRec = () => {
      if (recording || !stream) return;
      if (used() >= this.MAX - 0.3) { toast("Достигнут лимит — 1 минута"); return; }
      const chunks = [];
      const mime = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
      try { mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 3_000_000 } : undefined); } catch { toast("Запись не поддерживается"); return; }
      const recSpeed = speed;
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        const ms = Date.now() - segStart;
        if (ms < 400) { drawBars(); return; }
        const raw = new Blob(chunks, { type: mr.mimeType || "video/webm" });
        const blob = /webm/.test(raw.type) ? await WebmFix.fix(raw, ms) : raw;
        const c = await this.makeClip(blob, "video", ms / 1000, recSpeed);
        if (c) { c.fromCam = true; st.clips.push(c); this.fitMax(); }
        drawBars();
      };
      mr.start(250); recording = true; segStart = Date.now(); rec.classList.add("on");
      tick = setInterval(() => { drawBars(); if (used() + (Date.now() - segStart) / 1000 / speed >= this.MAX) stopRec(); }, 100);
      drawBars();
    };
    let downAt = 0;
    rec.onpointerdown = () => { downAt = Date.now(); if (!recording) withTimer(startRec); else stopRec(); };
    rec.onpointerup = () => { if (recording && Date.now() - downAt > 600 && !timer) stopRec(); };   // удержание — запись, пока держите
    const withTimer = (fn) => {
      if (!timer) return fn();
      let n = timer; count.classList.remove("hidden"); count.textContent = n;
      const it = setInterval(() => { n--; if (n <= 0) { clearInterval(it); count.classList.add("hidden"); fn(); } else count.textContent = n; }, 1000);
    };
    const side = (icon, label, onclick) => h("button", { class: "ve-side-btn", onclick }, h("span", { html: icon }), h("small", null, label));
    const speedBtn = side("⏩", "Скорость 1x", () => {
      speed = VE_SPEEDS[(VE_SPEEDS.indexOf(speed) + 1) % VE_SPEEDS.length];
      speedBtn.querySelector("small").textContent = `Скорость ${speed}x`;
    });
    speedBtn.querySelector("span").textContent = "⏩";
    const timerBtn = side("⏱", "Таймер выкл", () => {
      timer = timer === 0 ? 3 : timer === 3 ? 10 : 0;
      timerBtn.querySelector("small").textContent = timer ? `Таймер ${timer} с` : "Таймер выкл";
    });
    timerBtn.querySelector("span").textContent = "⏱";
    const flipBtn = side(I.flip, "Камера", () => { if (recording) return; facing = facing === "user" ? "environment" : "user"; start(); });
    const undo = h("button", { class: "ve-undo hidden", title: "Удалить последний фрагмент", onclick: () => {
      const last = [...st.clips].reverse().find((c) => c.fromCam); if (!last) return;
      st.clips.splice(st.clips.indexOf(last), 1); last.el.remove(); URL.revokeObjectURL(last.url); drawBars();
    } }, "⌫");
    const next = h("button", { class: "ve-next hidden", onclick: () => { stopRec(); setTimeout(() => this.editor(), 300); } }, "Далее ✓");
    const gallery = h("button", { class: "ve-gallery", onclick: () => this.pickFiles(() => { drawBars(); if (st.clips.length) this.editor(); }) }, h("span", { html: I.gallery }), h("small", null, "Галерея"));
    const screen = h("div", { class: "ve-cam" }, v, bars,
      h("div", { class: "ve-cam-top" }, h("button", { class: "icon-btn", html: I.close, onclick: () => this.confirmClose() }), timeLbl, h("span")),
      h("div", { class: "ve-side" }, flipBtn, speedBtn, timerBtn), count,
      h("div", { class: "ve-cam-bottom" }, gallery, rec, h("div", { class: "ve-cam-right" }, undo, next)),
      h("div", { class: "ve-cam-hint" }, "Нажмите — запись, ещё раз — пауза. Снимайте частями до 1 минуты"));
    this.show(screen);
    this.cam = { stop: () => { stopRec(); clearInterval(tick); stream?.getTracks().forEach((t) => t.stop()); stream = null; } };
    drawBars();
    await start();
  },
  show(screen) { [...this.root.children].forEach((c) => c !== this.pool && c.remove()); this.root.append(screen); },

  // ───────── Монтаж ─────────
  editor() {
    const st = this.st;
    this.cam?.stop(); this.cam = null;
    if (!st.clips.length) return this.camera();
    st.sel = Math.min(st.sel, st.clips.length - 1);
    const canvas = h("canvas", { class: "ve-canvas", width: this.W, height: this.H });
    const playBtn = h("button", { class: "ve-play", html: "▶" });
    const timeLbl = h("div", { class: "ve-time" });
    const timeline = h("div", { class: "ve-timeline" });
    const panel = h("div", { class: "ve-panel" });
    const tools = h("div", { class: "ve-tools" });
    const stage = h("div", { class: "ve-stage" }, canvas, playBtn, timeLbl);
    const top = h("div", { class: "ve-top" },
      h("button", { class: "icon-btn", html: I.back, onclick: () => { this.player.stop(); this.camera(); } }),
      h("b", null, "Монтаж"),
      h("button", { class: "ve-done", onclick: () => this.finish() }, "Готово"));
    this.show(h("div", { class: "ve-edit" }, top, stage, timeline, panel, tools));
    const p = this.player = new VEPlayer(this, canvas);
    p.onTime = (t) => { timeLbl.textContent = `${fmtDur(t)} / ${fmtDur(this.total())}`; head.style.left = (t / this.total() * 100) + "%"; };
    p.onState = (on) => { playBtn.innerHTML = on ? "" : "▶"; playBtn.classList.toggle("on", on); };
    let head;
    const drawTimeline = () => {
      timeline.innerHTML = "";
      const strip = h("div", { class: "ve-strip" });
      st.clips.forEach((c, i) => {
        const w = Math.max(44, this.len(c) * 22);
        const cell = h("button", { class: `ve-clip${i === st.sel ? " sel" : ""}`, style: { width: w + "px" }, onclick: () => { st.sel = i; drawTimeline(); p.seek(this.clipStart(i) + 0.01); tool(cur || "clip"); } },
          c.thumb, h("small", null, (c.speed !== 1 ? c.speed + "x · " : "") + fmtDur(this.len(c))));
        strip.append(cell);
      });
      strip.append(h("button", { class: "ve-add", title: "Добавить", onclick: () => this.addMore(() => { drawTimeline(); p.seek(p.t); }) }, "+"));
      head = h("i", { class: "ve-head" });
      const bar = h("div", { class: "ve-scrub" }, head);
      bar.onpointerdown = (e) => {
        const move = (ev) => { const r = bar.getBoundingClientRect(); p.seek(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * this.total()); };
        move(e); bar.setPointerCapture(e.pointerId); bar.onpointermove = move; bar.onpointerup = () => { bar.onpointermove = null; };
      };
      timeline.append(bar, strip);
      p.onTime(p.t);
    };
    this.redraw = () => { drawTimeline(); p.seek(Math.min(p.t, this.total() - 0.01)); };

    // инструменты
    let cur = null;
    const tool = (name) => {
      cur = name;
      [...tools.children].forEach((b) => b.classList.toggle("on", b.dataset.t === name));
      panel.innerHTML = ""; panel.append(...(this.panels[name]?.call(this, p) || []));
    };
    const T = [["clip", "✂️", "Обрезка"], ["speed", "⏩", "Скорость"], ["filters", "🎨", "Фильтры"], ["text", "Aa", "Текст"],
      ["stickers", "😊", "Стикеры"], ["music", "🎵", "Музыка"], ["effects", "✨", "Эффекты"], ["transitions", "🔀", "Переходы"], ["order", "↔️", "Порядок"]];
    for (const [k, ic, l] of T) tools.append(h("button", { "data-t": k, onclick: () => tool(k) }, h("span", null, ic), h("small", null, l)));
    this.tool = tool;
    drawTimeline(); tool("clip");
    p.seek(0);
    this.dragOverlays(canvas, p);
  },
  clipStart(i) { let t = 0; for (let k = 0; k < i; k++) t += this.len(this.st.clips[k]); return t; },
  addMore(done) {
    let close;
    close = sheet([h("h3", null, "Добавить"),
      h("button", { class: "menu-item", onclick: () => { close(); this.pickFiles(done); } }, h("span", { html: I.gallery }), "Видео или фото из галереи"),
      h("button", { class: "menu-item", onclick: () => { close(); this.player?.stop(); this.camera(); } }, h("span", { html: I.camera }), "Доснять на камеру")]);
  },

  panels: {
    clip(p) {
      const st = this.st, c = st.clips[st.sel]; if (!c) return [];
      const lbl = h("div", { class: "ve-row-lbl" });
      const max = c.kind === "video" ? c.dur : 15;
      const a = h("input", { type: "range", min: 0, max, step: 0.05, value: c.in });
      const b = h("input", { type: "range", min: 0, max, step: 0.05, value: c.out });
      const upd = (which) => {
        let x = +a.value, y = +b.value;
        if (y - x < 0.5) { if (which === "a") x = y - 0.5; else y = x + 0.5; }
        c.in = Math.max(0, x); c.out = Math.min(max, y);
        if (this.total() > this.MAX) c.out -= (this.total() - this.MAX) * c.speed;
        a.value = c.in; b.value = c.out;
        lbl.textContent = c.kind === "video" ? `Фрагмент: ${fmtDur(c.in)} — ${fmtDur(c.out)} (${(c.out - c.in).toFixed(1)} с)` : `Показ фото: ${(c.out - c.in).toFixed(1)} с`;
        p.seek(this.clipStart(st.sel) + (which === "b" ? this.len(c) - 0.05 : 0.01));
      };
      a.oninput = () => upd("a"); b.oninput = () => upd("b");
      b.onchange = a.onchange = () => this.redraw();
      upd();
      if (c.kind === "image") return [lbl, h("label", { class: "ve-range" }, "Длительность", b)];
      return [lbl, h("label", { class: "ve-range" }, "Начало", a), h("label", { class: "ve-range" }, "Конец", b),
        h("label", { class: "ve-check" }, h("input", { type: "checkbox", checked: !c.mute, onchange: (e) => { c.mute = !e.target.checked; p.applyVolumes(); } }), "Звук этого клипа")];
    },
    speed(p) {
      const st = this.st, c = st.clips[st.sel]; if (!c) return [];
      return [h("div", { class: "ve-row-lbl" }, "Скорость выбранного клипа"),
        h("div", { class: "ve-chips" }, VE_SPEEDS.map((s) => h("button", { class: c.speed === s ? "on" : "", onclick: () => {
          c.speed = s; this.fitMax(); this.redraw(); this.tool("speed");
        } }, s + "x")))];
    },
    filters(p) {
      const st = this.st;
      const row = h("div", { class: "ve-filters" }, VE_FILTERS.map(([k, name, css]) => {
        const c = st.clips[st.sel];
        const th = document.createElement("canvas"); th.width = 54; th.height = 72;
        try { const x = th.getContext("2d"); x.filter = css || "none"; VideoEditor.cover(x, c.el, 54, 72, 1); } catch { /* */ }
        return h("button", { class: st.filter === k ? "on" : "", onclick: () => { st.filter = k; p.redrawFrame(); this.tool("filters"); } }, th, h("small", null, name));
      }));
      const sl = (label, key) => h("label", { class: "ve-range" }, label, h("input", { type: "range", min: 50, max: 150, value: st.adj[key], oninput: (e) => { st.adj[key] = +e.target.value; p.redrawFrame(); } }));
      return [row, sl("Яркость", "b"), sl("Контраст", "c"), sl("Насыщенность", "s")];
    },
    text(p) {
      const st = this.st;
      const ta = h("input", { class: "ve-text-in", placeholder: "Текст на видео", maxlength: 80 });
      const add = h("button", { class: "btn", onclick: () => {
        const t = ta.value.trim(); if (!t) return toast("Напишите текст");
        st.overlays.push({ id: crypto.randomUUID(), type: "text", text: t, x: 0.5, y: 0.35 + Math.random() * 0.2, size: 46, color: "#ffffff", style: "shadow" });
        ta.value = ""; st.ovSel = st.overlays.at(-1).id; p.redrawFrame(); this.tool("text");
      } }, "Добавить");
      const out = [h("div", { class: "ve-text-row" }, ta, add)];
      const o = st.overlays.find((x) => x.id === st.ovSel && x.type === "text");
      if (o) {
        out.push(h("div", { class: "ve-row-lbl" }, `«${o.text}» — перетащите пальцем на видео`),
          h("div", { class: "ve-colors" }, VE_COLORS.map((c) => h("button", { class: o.color === c ? "on" : "", style: { background: c }, onclick: () => { o.color = c; p.redrawFrame(); this.tool("text"); } }))),
          h("div", { class: "ve-chips" }, [["shadow", "Обычный"], ["box", "С фоном"], ["outline", "Контур"], ["neon", "Неон"]].map(([k, l]) =>
            h("button", { class: o.style === k ? "on" : "", onclick: () => { o.style = k; p.redrawFrame(); this.tool("text"); } }, l))),
          h("label", { class: "ve-range" }, "Размер", h("input", { type: "range", min: 20, max: 110, value: o.size, oninput: (e) => { o.size = +e.target.value; p.redrawFrame(); } })),
          h("div", { class: "ve-chips wrap" }, VE_TEXT_ANIMS.map(([k, l]) => h("button", { class: (o.anim || "none") === k ? "on" : "", onclick: () => {
            o.anim = k; this.tool("text"); if (k !== "none") { p.seek(0); p.play(); clearTimeout(this.anT); this.anT = setTimeout(() => p.pause(), 1800); }
          } }, l))),
          h("button", { class: "menu-item danger", onclick: () => { st.overlays = st.overlays.filter((x) => x !== o); st.ovSel = null; p.redrawFrame(); this.tool("text"); } }, "Удалить текст"));
      } else if (st.overlays.some((x) => x.type === "text")) out.push(h("p", { class: "sheet-note" }, "Нажмите на текст на видео, чтобы изменить его."));
      return out;
    },
    stickers(p) {
      const st = this.st;
      const o = st.overlays.find((x) => x.id === st.ovSel && x.type === "sticker");
      const out = [h("div", { class: "ve-stickers" }, VE_STICKERS.map((e) => h("button", { onclick: () => {
        st.overlays.push({ id: crypto.randomUUID(), type: "sticker", text: e, x: 0.3 + Math.random() * 0.4, y: 0.55 + Math.random() * 0.2, size: 90 });
        st.ovSel = st.overlays.at(-1).id; p.redrawFrame(); this.tool("stickers");
      } }, e)))];
      if (o) out.push(h("label", { class: "ve-range" }, "Размер стикера", h("input", { type: "range", min: 40, max: 260, value: o.size, oninput: (e) => { o.size = +e.target.value; p.redrawFrame(); } })),
        h("button", { class: "menu-item danger", onclick: () => { st.overlays = st.overlays.filter((x) => x !== o); st.ovSel = null; p.redrawFrame(); this.tool("stickers"); } }, "Удалить стикер"));
      return out;
    },
    music(p) {
      const st = this.st;
      const inp = h("input", { type: "file", accept: "audio/*", style: { display: "none" }, onchange: async (e) => {
        const f = e.target.files[0]; if (!f) return;
        await this.useMusic(f, f.name.replace(/\.[^.]+$/, ""), null);
      } });
      const out = [inp,
        h("button", { class: "menu-item", onclick: () => this.musicOnline() }, h("span", null, "🌐"), "Найти музыку в интернете"),
        h("button", { class: "menu-item", onclick: () => inp.click() }, h("span", null, "📱"), "Выбрать музыку с телефона")];
      if (st.music) {
        out.push(h("div", { class: "ve-row-lbl ve-now" }, `🎵 ${st.music.name}${st.music.credit ? " · " + st.music.credit.license : ""}`),
          h("label", { class: "ve-range" }, "Начать музыку с", h("input", { type: "range", min: 0, max: Math.max(0, st.music.dur - 1), step: 0.5, value: st.music.offset, onchange: (e) => { st.music.offset = +e.target.value; p.seek(0); } })),
          h("label", { class: "ve-range" }, "Громкость музыки", h("input", { type: "range", min: 0, max: 100, value: st.musicVol * 100, oninput: (e) => { st.musicVol = e.target.value / 100; p.applyVolumes(); } })),
          h("button", { class: "menu-item danger", onclick: () => this.dropMusic() }, "Убрать музыку"));
      }
      out.push(h("label", { class: "ve-range" }, "Громкость звука видео", h("input", { type: "range", min: 0, max: 100, value: st.origVol * 100, oninput: (e) => { st.origVol = e.target.value / 100; p.applyVolumes(); } })));
      return out;
    },
    effects(p) {
      const st = this.st;
      const chip = (on, label, fn) => h("button", { class: on ? "on" : "", onclick: () => { fn(); p.redrawFrame(); this.tool("effects"); } }, label);
      return [
        ...VE_EFFECT_GROUPS.flatMap(([title, list]) => [h("div", { class: "ve-row-lbl" }, title),
          h("div", { class: "ve-chips wrap" }, list.map(([k, l]) => chip(st.effects.has(k), l, () => (st.effects.has(k) ? st.effects.delete(k) : st.effects.add(k)))))]),
        h("div", { class: "ve-row-lbl" }, "Частицы поверх видео"),
        h("div", { class: "ve-chips wrap" }, VE_PARTICLES.map(([k, l]) => chip(st.particles === k, l, () => { st.particles = k; }))),
        h("p", { class: "sheet-note" }, "Нажмите ▶ на видео, чтобы увидеть эффекты в движении."),
      ];
    },
    transitions(p) {
      const st = this.st;
      return [h("div", { class: "ve-row-lbl" }, st.clips.length > 1 ? "Переход между клипами" : "Переход (виден, когда клипов несколько)"),
        h("div", { class: "ve-chips wrap" }, VE_TRANSITIONS.map(([k, l]) => h("button", { class: (st.transition || "fade") === k ? "on" : "", onclick: () => {
          st.transition = k; this.tool("transitions");
          const b = st.clips.length > 1 ? this.clipStart(1) : 0; p.seek(Math.max(0, b - 0.6)); p.play();           // показать переход
          clearTimeout(this.trT); this.trT = setTimeout(() => p.pause(), 1300);
        } }, l)))];
    },
    order(p) {
      const st = this.st, i = st.sel, c = st.clips[i]; if (!c) return [];
      const mv = (d) => { const j = i + d; if (j < 0 || j >= st.clips.length) return; [st.clips[i], st.clips[j]] = [st.clips[j], st.clips[i]]; st.sel = j; this.redraw(); this.tool("order"); };
      return [h("div", { class: "ve-row-lbl" }, `Клип ${i + 1} из ${st.clips.length}`),
        h("div", { class: "ve-chips" },
          h("button", { onclick: () => mv(-1), disabled: i === 0 }, "← Раньше"),
          h("button", { onclick: () => mv(1), disabled: i === st.clips.length - 1 }, "Позже →"),
          h("button", { onclick: async () => {
            if (this.total() + this.len(c) > this.MAX) return toast("Будет длиннее минуты");
            const d = await this.makeClip(c.blob, c.kind, c.kind === "video" ? c.dur : null, c.speed);
            if (d) { Object.assign(d, { in: c.in, out: c.out, mute: c.mute }); st.clips.splice(i + 1, 0, d); this.redraw(); this.tool("order"); }
          } }, "Повторить")),
        h("button", { class: "menu-item danger", onclick: () => {
          st.clips.splice(i, 1); c.el.pause(); c.el.remove?.(); URL.revokeObjectURL(c.url);
          st.sel = Math.max(0, i - 1);
          if (!st.clips.length) { this.player.stop(); return this.camera(); }
          this.redraw(); this.tool("order");
        } }, "Удалить клип")];
    },
  },

  // перетаскивание текста и стикеров пальцем
  dragOverlays(canvas, p) {
    let drag = null;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    canvas.addEventListener("pointerdown", (e) => {
      const [x, y] = pos(e);
      const o = [...this.st.overlays].reverse().find((o) => o.box && x >= o.box[0] && x <= o.box[2] && y >= o.box[1] && y <= o.box[3]);
      if (!o) {                                   // касание мимо текста и стикеров: пауза / воспроизведение, как в TikTok
        if (this.st.ovSel) { this.st.ovSel = null; p.redrawFrame(); }
        else p.playing ? p.pause() : p.play();
        return;
      }
      e.preventDefault(); canvas.setPointerCapture(e.pointerId);
      drag = { o, dx: o.x - x, dy: o.y - y }; this.st.ovSel = o.id; p.redrawFrame();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return; const [x, y] = pos(e);
      drag.o.x = Math.max(0.05, Math.min(0.95, x + drag.dx)); drag.o.y = Math.max(0.05, Math.min(0.95, y + drag.dy)); p.redrawFrame();
    });
    const up = () => { if (!drag) return; const o = drag.o; drag = null; this.tool(o.type === "text" ? "text" : "stickers"); };   // панель — после отпускания
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  },

  contain(ctx, el, W, H, zoom = 1) {
    const iw = el.videoWidth || el.naturalWidth || el.width, ih = el.videoHeight || el.naturalHeight || el.height;
    if (!iw || !ih) return;
    const k = Math.min(W / iw, H / ih) * zoom, w = iw * k, hh = ih * k;
    ctx.drawImage(el, (W - w) / 2, (H - hh) / 2, w, hh);
  },
  cover(ctx, el, W, H, zoom = 1) {
    const iw = el.videoWidth || el.naturalWidth || el.width, ih = el.videoHeight || el.naturalHeight || el.height;
    if (!iw || !ih) return;
    const k = Math.max(W / iw, H / ih) * zoom, w = iw * k, hh = ih * k;
    ctx.drawImage(el, (W - w) / 2, (H - hh) / 2, w, hh);
  },

  // ───────── Музыка ─────────
  dropMusic() {
    const m = this.st?.music; if (!m) return;
    try { m.el.pause(); m.el.removeAttribute("src"); m.el.load(); m.el.remove(); } catch { /* */ }
    try { URL.revokeObjectURL(m.url); } catch { /* */ }
    this.st.music = null; this.tool?.("music");
  },
  /** Подключить музыку (файл с телефона или скачанную); credit — автор и лицензия для подписи */
  async useMusic(blob, name, credit) {
    const st = this.st, p = this.player; if (!st || !p) return false;
    this.dropMusic();
    const url = URL.createObjectURL(blob);
    const el = h("audio", { src: url, preload: "auto" }); this.pool.append(el);
    el.addEventListener("play", () => { if (!VideoEditor.root || !VideoEditor.player?.playing) el.pause(); });   // сама по себе музыка не играет
    await new Promise((r) => { el.onloadedmetadata = r; el.onerror = r; setTimeout(r, 6000); });
    if (!isFinite(el.duration) || !el.duration) { el.remove(); URL.revokeObjectURL(url); toast("Не удалось открыть музыку"); return false; }
    if (this.st !== st) { el.remove(); URL.revokeObjectURL(url); return false; }      // редактор уже закрыли
    st.music = { el, url, name, dur: el.duration, offset: 0, credit };
    p.connect(el, "music"); p.applyVolumes(); this.tool("music"); p.seek(0); p.play();
    return true;
  },
  async musicApi(body) {
    const { data, error } = await S.sb.functions.invoke("music", { body });
    if (error) throw error;
    return data;
  },
  /** Поиск свободной музыки (Creative Commons) и скачивание через сервер семьи */
  musicOnline() {
    let close, preview = null, cache = new Map(), gen = 0;   // gen: любое «стоп» отменяет превью, которое ещё грузится
    const list = h("div", { class: "ve-ml" });
    const q = h("input", { class: "ve-ml-q", placeholder: "Например: happy, piano, rock, лето…", maxlength: 60, onkeydown: (e) => { if (e.key === "Enter") run(q.value); } });
    const stopPreview = () => { gen++; if (preview) { preview.pause(); preview = null; this.mlPreview = null; } list.querySelectorAll(".ve-ml-play").forEach((b) => { b.textContent = "▶"; }); };
    const load = async (it) => {
      if (cache.has(it.url)) return cache.get(it.url);
      const data = await this.musicApi({ action: "get", url: it.url });
      if (!(data instanceof Blob) || data.size < 10000) throw new Error("bad");
      const blob = new Blob([data], { type: /\.ogg|format=ogg/i.test(it.url) ? "audio/ogg" : "audio/mpeg" });
      cache.set(it.url, blob); return blob;
    };
    const row = (it) => {
      const play = h("button", { class: "ve-ml-play", title: "Послушать" }, "▶");
      const add = h("button", { class: "ve-ml-add" }, "Добавить");
      play.onclick = async () => {
        if (play.textContent === "⏸") return stopPreview();
        stopPreview(); play.textContent = "…";
        const my = gen;
        const start = async (src) => {
          if (my !== gen) return false;
          const a = new Audio(src); preview = this.mlPreview = a;
          try { await a.play(); } catch (e) { if (preview === a) { preview = this.mlPreview = null; } throw e; }
          if (my !== gen) { a.pause(); return false; }                    // пока грузилось, нажали «стоп» или «Добавить»
          return true;
        };
        try {
          // послушать — сразу из интернета, без скачивания; если не вышло — через сервер семьи
          const direct = /^https:/.test(it.url) ? it.url : null;
          let ok;
          try { ok = await start(direct || URL.createObjectURL(await load(it))); }
          catch (e) { if (!direct || e?.name === "NotAllowedError" || my !== gen) throw e; ok = await start(URL.createObjectURL(await load(it))); }
          if (ok) { play.textContent = "⏸"; preview.onended = stopPreview; }
        } catch { if (my === gen) { play.textContent = "▶"; toast("Не удалось включить трек — попробуйте другой"); } }
      };
      add.onclick = async () => {
        add.disabled = true; add.textContent = "Скачиваю…"; stopPreview();
        try {
          const b = await load(it); stopPreview(); close();
          const ok = await this.useMusic(b, it.title, { title: it.title, artist: it.artist, license: it.license });
          if (ok) toast(`🎵 «${it.title}» добавлена`);
        } catch { add.disabled = false; add.textContent = "Добавить"; toast("Не удалось скачать трек — попробуйте другой"); }
      };
      return h("div", { class: "ve-ml-row" }, play,
        h("div", { class: "mid" }, h("b", null, it.title), h("small", null, [it.artist, it.duration ? fmtDur(it.duration) : "", it.license].filter(Boolean).join(" · "))), add);
    };
    let seq = 0;
    const run = async (text) => {
      const my = ++seq; stopPreview();
      list.innerHTML = ""; list.append(h("p", { class: "sheet-note" }, "Ищу музыку…"));
      try {
        const d = await this.musicApi({ action: "search", q: text });
        if (my !== seq) return;
        list.innerHTML = "";
        if (!d?.items?.length) { list.append(h("p", { class: "sheet-note" }, "Ничего не нашлось — попробуйте другое слово (лучше по-английски).")); return; }
        d.items.forEach((it) => list.append(row(it)));
      } catch { if (my === seq) { list.innerHTML = ""; list.append(h("p", { class: "sheet-note" }, "Нет связи с поиском музыки. Проверьте интернет и попробуйте ещё раз.")); } }
    };
    close = sheet([
      h("h3", null, "🌐 Музыка из интернета"),
      h("p", { class: "sheet-note" }, "Свободная музыка с лицензиями Creative Commons (Jamendo, ccMixter, Internet Archive). Автор трека добавится в подпись к статусу."),
      h("div", { class: "ve-ml-search" }, q, h("button", { class: "btn", onclick: () => run(q.value) }, "Найти")),
      h("div", { class: "ve-chips wrap ve-moods" }, VE_MOODS.map(([k, l]) => h("button", { onclick: (e) => { e.currentTarget.parentNode.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.currentTarget)); q.value = ""; run(k); } }, l))),
      list,
    ], () => stopPreview());
    run("happy");
  },

  // ───────── Сборка видео ─────────
  async finish() {
    const p = this.player; p.pause();
    if (!this.st.clips.length) return;
    const total = this.total();
    const over = h("div", { class: "ve-export" }, h("b", null, "Создаю видео…"), h("div", { class: "ve-prog" }, h("i")), h("small", null, "Не закрывайте приложение"));
    this.root.append(over);
    const bar = over.querySelector(".ve-prog i");
    try {
      const blob = await p.render((k) => { bar.style.width = Math.round(k * 100) + "%"; });
      over.remove();
      if (!blob || blob.size < 1000) { toast("Не удалось создать видео"); return; }
      if (blob.size > 50 * 1024 * 1024) { toast("Видео больше 50 МБ — сократите его"); return; }
      this.result = blob; this.publishSheet(blob, total);
    } catch (e) { over.remove(); console.warn("ve render", e); toast("Не удалось создать видео"); }
  },
  publishSheet(blob, total) {
    const url = URL.createObjectURL(blob);
    const name = `Видео_${new Date().toISOString().slice(0, 10)}.${/mp4/.test(blob.type) ? "mp4" : "webm"}`;
    const file = () => new File([blob], name, { type: blob.type || "video/webm" });
    const cap = h("input", { class: "ve-caption", maxlength: 200, placeholder: "Подпись к статусу (необязательно)" });
    let close;
    const done = () => { close(); URL.revokeObjectURL(url); this.close(); };
    close = sheet([
      h("h3", null, "Видео готово 🎬"),
      h("video", { class: "ve-result", src: url, controls: true, playsinline: true, autoplay: true, loop: true }),
      h("small", { class: "sheet-note" }, `${fmtDur(total)} · ${(blob.size / 1048576).toFixed(1)} МБ`),
      cap,
      h("button", { class: "btn wide", onclick: async () => {
        toast("Публикую в статус…");
        const path = `stories/${S.me.id}/${crypto.randomUUID()}.${/mp4/.test(blob.type) ? "mp4" : "webm"}`;
        const { error } = await S.sb.storage.from("media").upload(path, blob, { contentType: blob.type || "video/webm" });
        if (error) return toast("Не удалось загрузить: " + (error.message || ""));
        await signUrls([path]);
        const cr = this.st?.music?.credit, credit = cr ? `♪ ${cr.title}${cr.artist ? " — " + cr.artist : ""} (${cr.license})` : "";
        const body = [cap.value.trim(), credit].filter(Boolean).join("\n").slice(0, 500);
        await Stories.publish({ media_path: path, media_type: "video", body: body || null });
        done();
      } }, "Опубликовать в статус (24 часа)"),
      this.st.opts.chat ? h("button", { class: "menu-item", onclick: async () => { const chat = this.st.opts.chat; done(); if (S.current !== chat) await openChat(chat); FX.sendAnim(); await sendFile(file()); } }, h("span", { html: I.forward }), "Отправить в этот чат") : null,
      h("button", { class: "menu-item", onclick: () => { const f = file(); done(); pickChatAndSend([f], ""); } }, h("span", { html: I.forward }), "Отправить в чат"),
      h("button", { class: "menu-item", onclick: () => saveBlob(blob, name) }, h("span", { html: I.download }), "Сохранить на телефон"),
      h("button", { class: "menu-item", onclick: () => { close(); URL.revokeObjectURL(url); } }, h("span", { html: I.pen }), "Вернуться к монтажу"),
    ]);
  },
};

// ───────── Проигрыватель монтажа: предпросмотр и запись в файл ─────────
class VEPlayer {
  constructor(ed, canvas) {
    this.ed = ed; this.st = ed.st; this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.t = 0; this.playing = false; this.cur = -1; this.raf = 0; this.grain = null;
    this.onTime = () => {}; this.onState = () => {};
    this.gains = new Map();
    this.st.clips.forEach((c) => c.kind === "video" && this.prep(c));
  }
  audio() {
    if (this.ed.ac) return this.ed.ac;
    try {
      const ac = this.ed.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.ed.dest = ac.createMediaStreamDestination();
      return ac;
    } catch { return null; }
  }
  connect(el, kind) {
    if (el._veGain) return el._veGain;
    const ac = this.audio(); if (!ac) return null;
    try {
      const src = ac.createMediaElementSource(el), g = ac.createGain();
      src.connect(g); g.connect(ac.destination); g.connect(this.ed.dest);
      el._veGain = g; el._veKind = kind; return g;
    } catch { return null; }
  }
  applyVolumes() {
    for (const c of this.st.clips) if (c.kind === "video") {
      const v = c.mute ? 0 : this.st.origVol;
      if (c.el._veGain) c.el._veGain.gain.value = v; else c.el.volume = v;
    }
    const m = this.st.music; if (m) { if (m.el._veGain) m.el._veGain.gain.value = this.st.musicVol; else m.el.volume = this.st.musicVol; }
  }
  prep(c) { try { c.el.playbackRate = c.speed; } catch { /* */ } }
  at(t) {
    let acc = 0;
    for (let i = 0; i < this.st.clips.length; i++) {
      const c = this.st.clips[i], l = this.ed.len(c);
      if (t < acc + l || i === this.st.clips.length - 1) return { i, c, local: Math.max(0, Math.min(l, t - acc)), len: l, start: acc };
      acc += l;
    }
    return null;
  }
  seek(t) {
    const wasPlaying = this.playing; this.pause();
    this.t = Math.max(0, Math.min(t, Math.max(0, this.ed.total() - 0.001)));
    const a = this.at(this.t); if (!a) return;
    this.cur = a.i;
    if (a.c.kind === "video") {
      a.c.el.currentTime = a.c.in + a.local * a.c.speed;
      a.c.el.addEventListener("seeked", () => this.redrawFrame(), { once: true });
    }
    this.redrawFrame(); this.onTime(this.t);
    if (wasPlaying) this.play();
  }
  async play() {
    if (this.playing) return;
    const ac = this.audio(); if (ac?.state === "suspended") { try { await ac.resume(); } catch { /* */ } }
    for (const c of this.st.clips) if (c.kind === "video") this.connect(c.el, "clip");
    if (this.st.music) this.connect(this.st.music.el, "music");
    this.applyVolumes();
    if (this.t >= this.ed.total() - 0.05) this.t = 0;
    this.playing = true; this.onState(true);
    this.cur = -1; this.startClock = performance.now() - this.t * 1000;
    const m = this.st.music;
    if (m) { m.el.currentTime = Math.min(m.dur - 0.1, m.offset + this.t); m.el.play().catch(() => {}); }
    this.loop();
  }
  pause() {
    if (!this.playing) return;
    this.playing = false; cancelAnimationFrame(this.raf); clearTimeout(this.tmo);
    for (const c of this.st.clips) if (c.kind === "video") c.el.pause();
    this.st.music?.el.pause();
    this.onState(false);
  }
  stop() { this.pause(); }
  switchTo(a) {
    const prev = this.st.clips[this.cur];
    if (prev && prev !== a.c && prev.kind === "video") prev.el.pause();
    this.cur = a.i;
    if (a.c.kind === "video") {
      const want = a.c.in + a.local * a.c.speed;
      if (Math.abs(a.c.el.currentTime - want) > 0.15) a.c.el.currentTime = want;
      this.prep(a.c); a.c.el.play().catch(() => {});
    }
    // следующий клип заранее ставим на начало — стык без задержки
    const n = this.st.clips[a.i + 1];
    if (n && n.kind === "video" && n !== a.c && Math.abs(n.el.currentTime - n.in) > 0.1) n.el.currentTime = n.in;
  }
  loop() {
    if (!this.playing) return;
    const total = this.ed.total();
    this.t = (performance.now() - this.startClock) / 1000;
    if (this.t >= total) { this.t = total; this.draw(); this.pause(); this.onTime(total); this.onEnd?.(); return; }
    const a = this.at(this.t);
    if (a.i !== this.cur) this.switchTo(a);
    else if (a.c.kind === "video") {
      const el = a.c.el;
      if (el.currentTime >= a.c.out - 0.02) { if (!el.paused) el.pause(); }                 // дальше конца фрагмента не показываем
      else if (el.paused) el.play().catch(() => {});
    }
    this.draw(); this.onTime(this.t);
    // в фоне requestAnimationFrame засыпает — подстраховка таймером
    this.raf = requestAnimationFrame(() => { clearTimeout(this.tmo); this.loop(); });
    clearTimeout(this.tmo); this.tmo = setTimeout(() => { cancelAnimationFrame(this.raf); this.loop(); }, 60);
  }
  redrawFrame() { if (!this.playing) this.draw(); }
  filterCss() {
    const f = VE_FILTERS.find((x) => x[0] === this.st.filter)?.[2] || "";
    const { b, c, s } = this.st.adj;
    return (f + (b !== 100 ? ` brightness(${b / 100})` : "") + (c !== 100 ? ` contrast(${c / 100})` : "") + (s !== 100 ? ` saturate(${s / 100})` : "")).trim() || "none";
  }
  // псевдослучайное число по номеру — эффекты одинаковы в предпросмотре и в готовом видео
  rnd(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  draw() {
    const { ctx } = this, W = this.ed.W, H = this.ed.H, st = this.st, fx = st.effects, t = this.t;
    const live = this.playing || this.recording;
    ctx.save(); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const a = this.at(t);
    if (a) {
      const k = a.local / a.len, D = 0.35;
      const last = st.clips.length - 1;
      const inK = a.i > 0 && a.local < D ? 1 - a.local / D : 0;                 // начало клипа (стык с предыдущим)
      const outK = a.i < last && a.len - a.local < D ? 1 - (a.len - a.local) / D : 0;   // конец клипа (стык со следующим)
      const tr = st.transition || "fade";
      let zoom = (a.c.kind === "image" || fx.has("zoom")) ? 1 + 0.08 * k : 1;
      if (fx.has("pulse")) zoom *= 1 + 0.05 * Math.pow(Math.max(0, Math.cos(t * Math.PI * 4)), 6);   // «удар» 120 раз в минуту
      ctx.save();
      // переход: двигаем/масштабируем кадр у стыков
      const e = Math.max(inK, outK);
      if (tr === "zoom" && e) zoom *= 1 + 0.45 * e * e;
      if (tr === "slide" && e) ctx.translate(outK ? -W * outK * outK : W * inK * inK, 0);
      if (tr === "spin" && e) { ctx.translate(W / 2, H / 2); ctx.rotate((outK ? 1 : -1) * e * e * 0.6); ctx.scale(1 + e * 0.4, 1 + e * 0.4); ctx.translate(-W / 2, -H / 2); }
      if (fx.has("shake")) { ctx.translate(Math.sin(t * 41) * 5 + Math.sin(t * 13) * 3, Math.cos(t * 37) * 5); zoom *= 1.04; }
      let filter = this.filterCss();
      if (fx.has("rainbow")) filter = (filter === "none" ? "" : filter + " ") + `hue-rotate(${Math.round(t * 120) % 360}deg)`;
      if (tr === "blur" && e) filter = (filter === "none" ? "" : filter + " ") + `blur(${(e * 14).toFixed(1)}px)`;
      try {
        if (fx.has("blurbg")) {                                                // размытый фон: горизонтальное видео целиком
          ctx.filter = (filter === "none" ? "" : filter + " ") + "blur(22px) brightness(.7)";
          VideoEditor.cover(ctx, a.c.el, W, H, 1.15);
          ctx.filter = filter; VideoEditor.contain(ctx, a.c.el, W, H, zoom);
        } else { ctx.filter = filter; VideoEditor.cover(ctx, a.c.el, W, H, zoom); }
      } catch { /* кадр ещё не готов */ }
      ctx.filter = "none";
      ctx.restore();
      if (fx.has("mirror")) { ctx.save(); ctx.setTransform(-1, 0, 0, 1, W, 0); ctx.drawImage(this.canvas, 0, 0, W / 2, H, 0, 0, W / 2, H); ctx.restore(); }
      // переходы через цвет
      const first = a.i === 0 && a.local < 0.4, end = a.i === last && a.len - a.local < 0.4;
      if (tr === "fade") {
        const f = Math.max(inK, outK, first ? 1 - a.local / 0.4 : 0, end ? 1 - (a.len - a.local) / 0.4 : 0);
        if (f > 0) { ctx.fillStyle = `rgba(0,0,0,${(f * 0.92).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
      }
      if (tr === "flash" && (inK || outK)) { ctx.fillStyle = `rgba(255,255,255,${(Math.max(inK, outK) * 0.9).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
      if (fx.has("flash") && tr !== "flash" && a.i > 0 && a.local < 0.18) { ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - a.local / 0.18)})`; ctx.fillRect(0, 0, W, H); }
    }
    if (fx.has("glitch") && live) {                                           // глитч: сдвиг полос и двоение
      const seg = Math.floor(t * 5);
      if (this.rnd(seg) > 0.45 && (t * 5) % 1 < 0.35) {
        for (let i = 0; i < 6; i++) {
          const y = this.rnd(seg * 7 + i) * H, hh = 8 + this.rnd(seg * 11 + i) * 46, dx = (this.rnd(seg * 13 + i) - 0.5) * 70;
          ctx.drawImage(this.canvas, 0, y, W, hh, dx, y, W, hh);
        }
        ctx.save(); ctx.globalAlpha = 0.3; ctx.globalCompositeOperation = "screen"; ctx.drawImage(this.canvas, 7, 0); ctx.restore();
      }
    }
    if (fx.has("vhs")) {
      if (!this.lines) { this.lines = document.createElement("canvas"); this.lines.width = 4; this.lines.height = 4; const l = this.lines.getContext("2d"); l.fillStyle = "rgba(0,0,0,.22)"; l.fillRect(0, 0, 4, 1); }
      ctx.fillStyle = ctx.createPattern(this.lines, "repeat"); ctx.fillRect(0, 0, W, H);
      const band = ((t * 0.35) % 1) * H; ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fillRect(0, band, W, 26);
      ctx.save(); ctx.font = "700 26px ui-monospace, Menlo, Consolas, monospace"; ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
      ctx.fillText("▶ PLAY", 26, 56); ctx.fillText(fmtDur(t).padStart(5, "0"), W - 110, 56); ctx.restore();
    }
    if (fx.has("vignette")) {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.7);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.65)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (fx.has("grain")) {
      if (!this.grain) { this.grain = document.createElement("canvas"); this.grain.width = 180; this.grain.height = 320; }
      const gx = this.grain.getContext("2d"), img = gx.createImageData(180, 320);
      for (let q = 0; q < img.data.length; q += 4) { const v = Math.random() * 255; img.data[q] = img.data[q + 1] = img.data[q + 2] = v; img.data[q + 3] = 28; }
      gx.putImageData(img, 0, 0); ctx.drawImage(this.grain, 0, 0, W, H);
      ctx.fillStyle = "rgba(255,200,120,0.06)"; ctx.fillRect(0, 0, W, H);
    }
    if (fx.has("cinema")) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H * 0.11); ctx.fillRect(0, H * 0.89, W, H * 0.11); }
    if (st.particles) this.drawParticles(st.particles, t);
    for (const o of st.overlays) this.drawOverlay(o, o.id === st.ovSel && !this.recording);
    ctx.restore();
  }
  drawParticles(kind, t) {
    const { ctx } = this, W = this.ed.W, H = this.ed.H;
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const N = kind === "snow" ? 60 : kind === "confetti" ? 46 : 18;
    for (let i = 0; i < N; i++) {
      const r1 = this.rnd(i + 1), r2 = this.rnd(i + 101), r3 = this.rnd(i + 201);
      if (kind === "hearts") {                                                    // сердечки поднимаются
        const sp = 70 + r2 * 90, y = H + 40 - ((t * sp + r3 * (H + 80)) % (H + 80)), x = r1 * W + Math.sin(t * 2 + i) * 18;
        ctx.globalAlpha = Math.min(1, (H + 40 - y) / 200) * 0.9; ctx.font = `${22 + r3 * 24}px system-ui`; ctx.fillText(["❤️", "💖", "💕"][i % 3], x, y);
      } else if (kind === "snow") {                                               // снег падает
        const sp = 40 + r2 * 80, y = ((t * sp + r3 * (H + 20)) % (H + 20)) - 10, x = (r1 * W + Math.sin(t * 1.3 + i) * 20 + W) % W;
        ctx.globalAlpha = 0.55 + r3 * 0.4; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, 1.5 + r2 * 3.5, 0, Math.PI * 2); ctx.fill();
      } else if (kind === "confetti") {                                           // конфетти кружится
        const sp = 110 + r2 * 140, y = ((t * sp + r3 * (H + 30)) % (H + 30)) - 15, x = (r1 * W + Math.sin(t * 2.2 + i) * 30 + W) % W;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * (2 + r3 * 4) + i); ctx.fillStyle = VE_COLORS[2 + (i % 7)];
        ctx.fillRect(-5, -2.5, 10, 5); ctx.restore();
      } else if (kind === "sparkles") {                                           // блёстки мерцают
        const ph = Math.sin(t * (2 + r2 * 3) + i * 2);
        if (ph < 0.2) continue;
        ctx.globalAlpha = ph; ctx.font = `${16 + r3 * 22}px system-ui`;
        ctx.fillText("✨", r1 * W, this.rnd(i + 301 + Math.floor((t * (2 + r2 * 3) + i * 2) / (Math.PI * 2))) * H);
      }
    }
    ctx.restore();
  }
  drawOverlay(o, selected) {
    const { ctx } = this, W = this.ed.W, H = this.ed.H;
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `${o.type === "sticker" ? "" : "800 "}${o.size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    const x = o.x * W, y = o.y * H, w = ctx.measureText(o.text).width, hh = o.size * 1.2;
    // анимация (в предпросмотре на паузе текст виден целиком — удобно править)
    const t = this.t, anim = (this.playing || this.recording) ? o.anim || "none" : "none";
    let shown = o.text;
    if (anim !== "none") {
      ctx.translate(x, y);
      if (anim === "pop") { const p = Math.min(1, t / 0.45), s = p < 1 ? 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2) : 1; ctx.scale(Math.max(0.01, s), Math.max(0.01, s)); }
      if (anim === "bob") ctx.translate(0, Math.sin(t * 3) * 8);
      if (anim === "pulse") { const s = 1 + 0.07 * Math.sin(t * 6); ctx.scale(s, s); }
      if (anim === "fade") ctx.globalAlpha = Math.min(1, t / 0.8);
      if (anim === "type") shown = o.text.slice(0, Math.floor(t * 14));
      ctx.translate(-x, -y);
    }
    if (o.type === "text") {
      const pad = o.size * 0.35;
      if (o.style === "box") {
        ctx.fillStyle = o.color === "#ffffff" ? "#000000cc" : o.color;
        this.round(x - w / 2 - pad, y - hh / 2 - pad * 0.4, w + pad * 2, hh + pad * 0.8, o.size * 0.3); ctx.fill();
        ctx.fillStyle = o.color === "#ffffff" || o.color === "#FFE14D" ? "#fff" : (o.color === "#000000" ? "#fff" : "#fff");
      } else ctx.fillStyle = o.color;
      if (o.style === "outline") { ctx.lineWidth = Math.max(3, o.size / 9); ctx.strokeStyle = o.color === "#000000" ? "#fff" : "#000"; ctx.lineJoin = "round"; ctx.strokeText(shown, x, y); }
      if (o.style === "shadow") { ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = o.size / 5; ctx.shadowOffsetY = 2; }
      if (o.style === "neon") { ctx.shadowColor = o.color; ctx.shadowBlur = o.size / 2.2; ctx.fillStyle = "#fff"; ctx.fillText(shown, x, y); ctx.fillStyle = o.color; }
      ctx.fillText(shown, x, y);
    } else ctx.fillText(o.text, x, y);
    o.box = [(x - w / 2 - 12) / W, (y - hh / 2 - 12) / H, (x + w / 2 + 12) / W, (y + hh / 2 + 12) / H];
    if (selected) {
      ctx.shadowColor = "transparent"; ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.strokeStyle = "#fff";
      ctx.strokeRect(x - w / 2 - 12, y - hh / 2 - 12, w + 24, hh + 24);
    }
    ctx.restore();
  }
  round(x, y, w, h, r) { const c = this.ctx; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  /** Запись монтажа в файл: в реальном времени, со звуком клипов и музыкой. */
  render(onProgress) {
    return new Promise(async (resolve, reject) => {
      this.pause();
      this.audio();
      for (const c of this.st.clips) if (c.kind === "video") this.connect(c.el, "clip");
      if (this.st.music) this.connect(this.st.music.el, "music");
      const stream = this.canvas.captureStream(30);
      for (const tr of this.ed.dest?.stream.getAudioTracks() || []) stream.addTrack(tr);
      const mime = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
      let mr;
      try { mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 }); }
      catch (e) { reject(e); return; }
      const chunks = []; const total = this.ed.total();
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        this.recording = false; stream.getVideoTracks().forEach((t) => t.stop());
        const raw = new Blob(chunks, { type: (mr.mimeType || "video/webm").split(";")[0] });
        resolve(/webm/.test(raw.type) ? await WebmFix.fix(raw, total * 1000) : raw);
      };
      this.recording = true;
      this.t = 0; this.cur = -1;
      // ставим первый клип на начало и ждём кадр
      const f = this.st.clips[0];
      if (f.kind === "video") { f.el.currentTime = f.in; await new Promise((r) => { f.el.addEventListener("seeked", r, { once: true }); setTimeout(r, 1500); }); }
      this.draw();
      const prog = setInterval(() => onProgress(Math.min(1, this.t / total)), 200);
      this.onEnd = () => { clearInterval(prog); onProgress(1); this.onEnd = null; setTimeout(() => { try { mr.stop(); } catch { resolve(null); } }, 150); };
      mr.start(500);
      await this.play();
    });
  }
}
