/* v4.5: эффект разбитого стекла при удалении. Удар в случайную точку, трещины, осколки разлетаются и падают.
   Подменяет прежний «пепел» (FX.dust): все места удаления получают стекло. Работает для сообщений, видео, фото, задач и историй. */
"use strict";

const Shatter = {
  /** Скопировать внешний вид элемента вместе с потомками (стили считаются сейчас, поэтому клон не зависит от родителей). */
  snapshot(el) {
    const clone = el.cloneNode(true);
    const src = [el, ...el.querySelectorAll("*")], dst = [clone, ...clone.querySelectorAll("*")];
    const budget = src.length <= 260;
    for (let i = 0; i < src.length; i++) {
      const d = dst[i], s = src[i];
      if (!d || !s) continue;
      if (budget || i === 0) { try { const cs = getComputedStyle(s); let txt = cs.cssText; if (!txt) { txt = ""; for (let k = 0; k < cs.length; k++) txt += cs[k] + ":" + cs.getPropertyValue(cs[k]) + ";"; } d.style.cssText = txt; } catch { /* оставим как есть */ } }
      d.removeAttribute("id"); d.removeAttribute("onclick");
      if (s.tagName === "VIDEO") {                                   // видео заменяем кадром, чтобы осколки не декодировали поток
        let rep = null;
        try {
          const cv = document.createElement("canvas"), w = s.videoWidth || s.clientWidth, hh = s.videoHeight || s.clientHeight;
          if (w && hh) { cv.width = Math.min(w, 640); cv.height = Math.round(cv.width * hh / w); cv.getContext("2d").drawImage(s, 0, 0, cv.width, cv.height); rep = document.createElement("img"); rep.src = cv.toDataURL("image/jpeg", 0.7); }
        } catch { rep = null; }
        if (rep) { rep.style.cssText = d.style.cssText; d.replaceWith(rep); dst[i] = rep; }
        else { try { d.pause(); d.removeAttribute("autoplay"); } catch { /* */ } }
      }
    }
    clone.style.margin = "0"; clone.style.animation = "none"; clone.style.transition = "none"; clone.style.transform = "none"; clone.style.opacity = "1"; clone.style.visibility = "visible";
    return clone;
  },

  /** Короткий звон: шум с затуханием и несколько высоких «дзынь». */
  sound() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC || document.hidden) return;
      const ac = this.ac || (this.ac = new AC()); if (ac.state === "suspended") ac.resume().catch(() => {});
      const t0 = ac.currentTime, len = Math.floor(ac.sampleRate * 0.45), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      const src = ac.createBufferSource(); src.buffer = buf;
      const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3200;
      const g = ac.createGain(); g.gain.value = 0.28;
      src.connect(hp); hp.connect(g); g.connect(ac.destination); src.start(t0);
      for (let k = 0; k < 4; k++) {
        const o = ac.createOscillator(), og = ac.createGain(), st = t0 + 0.02 + Math.random() * 0.22;
        o.type = "sine"; o.frequency.value = 3800 + Math.random() * 4200;
        og.gain.setValueAtTime(0.0001, st); og.gain.exponentialRampToValueAtTime(0.06, st + 0.005); og.gain.exponentialRampToValueAtTime(0.0001, st + 0.16);
        o.connect(og); og.connect(ac.destination); o.start(st); o.stop(st + 0.2);
      }
    } catch { /* без звука */ }
  },

  /** Разбить элемент. Промис выполняется, когда стекло уже треснуло и осколки пошли вниз: удаление не ждёт конца полёта. */
  run(el) {
    return new Promise((resolve) => {
      let finished = false;
      const done = () => { if (!finished) { finished = true; resolve(); } };
      try {
        if (!el || !el.getBoundingClientRect) { done(); return; }
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) { done(); return; }
        const W = r.width, H = r.height, big = W * H > 90000, rays = big ? 6 : 9;
        const ix = W * (0.3 + Math.random() * 0.4), iy = H * (0.3 + Math.random() * 0.4);      // точка удара
        const TAU = Math.PI * 2, norm = (a) => ((a % TAU) + TAU) % TAU;
        const angs = [];
        for (let i = 0; i < rays; i++) angs.push(norm((i / rays) * TAU + (Math.random() - 0.5) * 0.55));
        for (const [cx, cy] of [[0, 0], [W, 0], [W, H], [0, H]]) angs.push(norm(Math.atan2(cy - iy, cx - ix)));
        angs.sort((a, b) => a - b);
        const edge = (a) => {
          const dx = Math.cos(a), dy = Math.sin(a);
          const tx = dx > 1e-9 ? (W - ix) / dx : dx < -1e-9 ? -ix / dx : Infinity, ty = dy > 1e-9 ? (H - iy) / dy : dy < -1e-9 ? -iy / dy : Infinity;
          const t = Math.min(tx, ty); return [ix + dx * t, iy + dy * t];
        };
        const ring = (a) => { const rr = Math.min(W, H) * (0.16 + Math.random() * 0.14); return [ix + Math.cos(a) * rr, iy + Math.sin(a) * rr]; };
        const E = angs.map(edge), R = angs.map(ring);
        const polys = [];
        for (let k = 0; k < angs.length; k++) {
          const n = (k + 1) % angs.length;
          polys.push([[ix, iy], R[k], R[n]]);                      // внутренний треугольник
          polys.push([R[k], E[k], E[n], R[n]]);                    // внешний осколок
        }
        const base = this.snapshot(el);
        const layer = document.createElement("div");
        layer.className = "shatter-layer"; layer.setAttribute("aria-hidden", "true");
        layer.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${W}px;height:${H}px;z-index:9999;pointer-events:none;`;

        // трещины и вспышка в точке удара
        const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
        svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
        svg.style.cssText = "position:absolute;left:0;top:0;overflow:visible;z-index:2";
        const lines = [];
        for (const [ex, ey] of E) {
          const steps = 4, pts = [[ix, iy]];
          for (let s = 1; s < steps; s++) { const f = s / steps; pts.push([ix + (ex - ix) * f + (Math.random() - 0.5) * 9, iy + (ey - iy) * f + (Math.random() - 0.5) * 9]); }
          pts.push([ex, ey]);
          const pl = document.createElementNS(NS, "polyline");
          pl.setAttribute("points", pts.map((p) => p.join(",")).join(" "));
          pl.setAttribute("fill", "none"); pl.setAttribute("stroke", "rgba(255,255,255,.95)"); pl.setAttribute("stroke-width", "1.4"); pl.setAttribute("stroke-linecap", "round");
          pl.style.filter = "drop-shadow(0 0 2px rgba(180,220,255,.9))";
          svg.append(pl); lines.push(pl);
        }
        const flash = document.createElement("i");
        flash.style.cssText = `position:absolute;left:${ix - 40}px;top:${iy - 40}px;width:80px;height:80px;border-radius:50%;background:radial-gradient(circle,#fff 0%,rgba(190,225,255,.7) 35%,rgba(255,255,255,0) 70%);z-index:3;`;
        layer.append(svg, flash);
        document.body.append(layer);
        el.style.visibility = "hidden";                                // оригинал прячем: вместо него стекло
        const CRACK = 170;
        for (const pl of lines) {
          const len = pl.getTotalLength ? pl.getTotalLength() : 100;
          pl.style.strokeDasharray = len; pl.style.strokeDashoffset = len;
          pl.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: CRACK, easing: "ease-out", fill: "forwards" });
        }
        flash.animate([{ opacity: 1, transform: "scale(.4)" }, { opacity: 0, transform: "scale(1.6)" }], { duration: 420, easing: "ease-out", fill: "forwards" });
        // «живое» стекло: исходный вид с трещинами, дрожит и разлетается
        const shards = [];
        const frag = document.createDocumentFragment();
        for (const poly of polys) {
          const c = base.cloneNode(true);
          const mx = poly.reduce((a, p) => a + p[0], 0) / poly.length, my = poly.reduce((a, p) => a + p[1], 0) / poly.length;
          c.style.position = "absolute"; c.style.left = "0px"; c.style.top = "0px"; c.style.width = W + "px"; c.style.height = H + "px"; c.style.boxSizing = "border-box";
          c.style.clipPath = `polygon(${poly.map((p) => p[0].toFixed(1) + "px " + p[1].toFixed(1) + "px").join(",")})`;
          c.style.willChange = "transform, opacity"; c.style.zIndex = "1";
          frag.append(c); shards.push({ c, mx, my });
        }
        layer.insertBefore(frag, svg);
        let longest = 0;
        shards.forEach(({ c, mx, my }) => {
          const vx = mx - ix, vy = my - iy, dist = Math.hypot(vx, vy) || 1, nx = vx / dist, ny = vy / dist;
          const speed = 50 + Math.random() * 110 + (1 - Math.min(1, dist / Math.max(W, H))) * 40;
          const dx = nx * speed + (Math.random() - 0.5) * 40, dy = ny * speed * 0.5 + 170 + Math.random() * 260;
          const rot = (Math.random() - 0.5) * 150, dur = 620 + Math.random() * 520, delay = CRACK + dist * 0.9 + Math.random() * 60;
          c.style.transformOrigin = `${mx}px ${my}px`;
          c.animate([
            { transform: "translate(0,0) rotate(0deg)", opacity: 1, offset: 0 },
            { transform: `translate(${(dx * 0.12).toFixed(1)}px,${(dy * 0.05).toFixed(1)}px) rotate(${(rot * 0.1).toFixed(1)}deg)`, opacity: 1, offset: 0.12 },
            { transform: `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`, opacity: 0, offset: 1 },
          ], { duration: dur, delay, easing: "cubic-bezier(.45,.05,.85,.6)", fill: "both" });
          longest = Math.max(longest, delay + dur);
        });
        // до разлёта осколки показываются неподвижными, поэтому «живой» вид сохраняется
        for (const s of shards) s.c.style.opacity = "1";
        this.sound(); try { navigator.vibrate?.([18, 24, 30]); } catch { /* */ }
        setTimeout(done, CRACK + 160);
        setTimeout(() => { layer.remove(); if (el.isConnected) el.style.visibility = ""; done(); }, longest + 150);   // удаление не удалось — элемент возвращается
      } catch { done(); }
    });
  },
};

// все места, где раньше «рассыпалось пеплом», теперь разбивают стекло
if (typeof FX !== "undefined") FX.dust = (el) => Shatter.run(el);
