/* Расшифровка голосовых сообщений прямо на телефоне (без отправки записи в интернет).
   Движок Vosk (Apache 2.0) + русская модель vosk-model-small-ru (≈45 МБ, скачивается один раз и хранится в памяти телефона). */
"use strict";

const STT = {
  model: null, loading: null, progress: 0,
  libUrl: "vendor/vosk.js",
  modelUrl() {
    if (window.CHAT_CONFIG?.sttModelUrl) return window.CHAT_CONFIG.sttModelUrl;
    // в приложении модель берём с сайта семьи, на сайте — с него же
    const site = (typeof APP_LINKS !== "undefined" && APP_LINKS.site) || "./";
    return (location.hostname === "appassets.androidplatform.net" ? site.replace(/\/?$/, "/") : new URL("./", location.href).href) + "models/vosk-ru.tar.gz";
  },
  async loadLib() {
    if (window.Vosk) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script"); s.src = this.libUrl;
      s.onload = resolve; s.onerror = () => reject(new Error("lib"));
      document.head.append(s);
    });
  },
  async cached() {
    try { return !!(await (await caches.open("stt-v1")).match(this.modelUrl())); } catch { return false; }
  },
  // модель: из памяти телефона, иначе скачиваем (с прогрессом) и сохраняем
  async modelBlobUrl(onProgress) {
    const url = this.modelUrl();
    let cache = null;
    try { cache = await caches.open("stt-v1"); } catch { /* без кэша */ }
    let resp = cache ? await cache.match(url) : null;
    if (!resp) {
      const r = await fetch(url);
      if (!r.ok) throw new Error("model " + r.status);
      const total = +r.headers.get("content-length") || 46e6;
      const reader = r.body.getReader(); const chunks = []; let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); got += value.length;
        this.progress = Math.min(99, Math.round((got / total) * 100)); onProgress?.(this.progress);
      }
      const blob = new Blob(chunks, { type: "application/gzip" });
      if (cache) { try { await cache.put(url, new Response(blob)); } catch { /* мало места — без кэша */ } }
      resp = new Response(blob);
    }
    onProgress?.(100);
    return URL.createObjectURL(await resp.blob());
  },
  ready(onProgress) {
    if (this.model) return Promise.resolve(this.model);
    if (!this.loading) {
      this.loading = (async () => {
        await this.loadLib();
        const u = await this.modelBlobUrl(onProgress);
        this.model = await window.Vosk.createModel(u);
        return this.model;
      })().catch((e) => { this.loading = null; throw e; });
    }
    return this.loading;
  },
  // любое аудио (webm/opus, m4a, mp3, видео-кружок) → 16 кГц моно
  async decode(blob) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    let audio;
    try { audio = await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { try { ctx.close(); } catch { /* */ } }
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * 16000)), 16000);
    const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
    return off.startRendering();
  },
  async transcribe(blob, onProgress) {
    const model = await this.ready(onProgress);
    const pcm = await this.decode(blob);
    const rec = new model.KaldiRecognizer(16000);
    const parts = [];
    return new Promise((resolve) => {
      let finalAsked = false, quiet = null, limit = null;
      const finish = () => {
        clearTimeout(quiet); clearTimeout(limit);
        try { rec.remove(); } catch { /* */ }
        let t = parts.join(" ").replace(/\s+/g, " ").trim();
        if (t) t = t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".");
        resolve(t);
      };
      rec.on("result", (m) => {
        const t = m?.result?.text; if (t) parts.push(t);
        if (finalAsked) { clearTimeout(quiet); quiet = setTimeout(finish, 700); }
      });
      const data = pcm.getChannelData(0);
      const step = 8000;
      for (let i = 0; i < data.length; i += step) {
        const n = Math.min(step, data.length - i);
        const b = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: 16000 });
        b.copyToChannel(data.subarray(i, i + n), 0);
        rec.acceptWaveform(b);
      }
      rec.retrieveFinalResult();
      finalAsked = true;
      quiet = setTimeout(finish, 2500);
      limit = setTimeout(finish, 20000 + pcm.duration * 2000);
    });
  },
};
