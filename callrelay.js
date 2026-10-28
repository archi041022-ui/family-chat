/* Звонок «через сервер»: если прямое соединение (WebRTC) не устанавливается — сеть режет звонки —
   голос идёт кусочками через то же соединение с сервером, по которому работает чат.
   Только звук, небольшая задержка; видео в этом режиме отключается. */
"use strict";

const CallRelay = {
  RATE: 16000, CHUNK: 3200,                       // 16 кГц, кусок = 0,2 с
  ctx: null, src: null, proc: null, mute: null, on: false, next: 0, rx: 0, tx: 0, seq: 0,

  // µ-law: 16 бит → 8 бит (вдвое меньше трафика, голос почти не страдает)
  enc(f32) {
    const out = new Uint8Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      let s = Math.max(-1, Math.min(1, f32[i])), sign = s < 0 ? 0x80 : 0;
      s = Math.abs(s); const m = Math.log(1 + 255 * s) / Math.log(256);
      out[i] = ~(sign | Math.min(127, Math.round(m * 127))) & 0xff;
    }
    return out;
  },
  dec(u8) {
    const out = new Float32Array(u8.length);
    for (let i = 0; i < u8.length; i++) {
      const b = ~u8[i] & 0xff, sign = b & 0x80 ? -1 : 1, m = (b & 0x7f) / 127;
      out[i] = sign * (Math.pow(256, m) - 1) / 255;
    }
    return out;
  },
  b64(u8) { let s = ""; for (let i = 0; i < u8.length; i += 0x2000) s += String.fromCharCode(...u8.subarray(i, i + 0x2000)); return btoa(s); },
  unb64(t) { const s = atob(t), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },

  start(stream, send) {
    if (this.on) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC || !stream) return false;
    try {
      this.ctx = new AC({ sampleRate: this.RATE });
      this.ctx.resume?.().catch(() => {});
      this.src = this.ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      this.proc = this.ctx.createScriptProcessor(4096, 1, 1);
      this.mute = this.ctx.createGain(); this.mute.gain.value = 0;     // чтобы узел работал, но свой голос не звучал
      let buf = new Float32Array(0);
      this.proc.onaudioprocess = (e) => {
        const d = e.inputBuffer.getChannelData(0);
        const joined = new Float32Array(buf.length + d.length); joined.set(buf); joined.set(d, buf.length); buf = joined;
        while (buf.length >= this.CHUNK) {
          const chunk = buf.subarray(0, this.CHUNK); buf = buf.slice(this.CHUNK);
          // «усыпление» вкладки не должно копить очередь
          this.tx++; send({ kind: "rl", n: this.seq++, d: this.b64(this.enc(chunk)) });
        }
      };
      this.src.connect(this.proc); this.proc.connect(this.mute); this.mute.connect(this.ctx.destination);
      this.next = 0; this.on = true;
      return true;
    } catch { this.stop(); return false; }
  },
  play(p) {
    if (!this.on || !this.ctx || !p?.d) return;
    try {
      const f = this.dec(this.unb64(p.d)); this.rx++;
      const b = this.ctx.createBuffer(1, f.length, this.RATE); b.copyToChannel(f, 0);
      const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination);
      const now = this.ctx.currentTime;
      if (this.next < now + 0.03) this.next = now + 0.25;              // небольшой запас на дрожание сети
      if (this.next > now + 1.5) this.next = now + 0.25;               // накопилась задержка — догоняем
      s.start(this.next); this.next += b.duration;
    } catch { /* повреждённый кусок пропускаем */ }
  },
  stop() {
    try { this.proc && (this.proc.onaudioprocess = null); this.src?.disconnect(); this.proc?.disconnect(); this.mute?.disconnect(); this.ctx?.close(); } catch { /* */ }
    this.ctx = this.src = this.proc = this.mute = null; this.on = false; this.next = 0; this.seq = 0;
  },
};
