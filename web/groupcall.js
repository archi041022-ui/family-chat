// ───────────── Групповой видеочат ─────────────
// Каждый участник соединён с каждым напрямую (WebRTC mesh), до 8 человек.
// Сигналы идут через канал комнаты gcall-<chatId>; приглашения — через личные каналы call-<userId>.
// Кто из пары начинает соединение, решает сравнение id — поэтому встречных предложений не бывает.
const GC_MARK = "📹 Групповой видеочат";

const GroupCall = {
  MAX: 8,
  active: false, chatId: null, ui: null, local: null, video: true, facing: "user",
  peers: new Map(),        // userId -> участник
  rooms: new Map(),        // chatId -> { ch: Promise<channel>, handlers: Set }
  seen: new Map(),         // chatId -> Map(userId -> время последнего сигнала) — для плашки «идёт видеочат»
  watched: new Set(), early: new Map(), inviteUi: null,

  // ── канал комнаты: один на чат, общий для звонка и плашки
  room(chatId) {
    let r = this.rooms.get(chatId);
    if (!r) {
      r = { handlers: new Set() };
      r.ch = new Promise((resolve) => {
        const ch = S.sb.channel(`gcall-${chatId}`, { config: { broadcast: { self: false } } })
          .on("broadcast", { event: "gc" }, ({ payload }) => r.handlers.forEach((f) => { try { f(payload); } catch (e) { console.warn("gc", e); } }));
        ch.subscribe((st) => { if (st === "SUBSCRIBED") resolve(ch); });
        setTimeout(() => resolve(ch), 4000);
      });
      this.rooms.set(chatId, r);
    }
    return r;
  },
  async emit(payload, chatId = this.chatId) {
    if (!chatId) return;
    try {
      const ch = await this.room(chatId).ch;
      await ch.send({ type: "broadcast", event: "gc", payload: { ...payload, from: S.me.id, name: S.me.name } });
    } catch (e) { console.warn("gc send", e); }
  },

  // ── кто сейчас в видеочате (для плашки в группе)
  watch(chatId) {
    if (!this.watched.has(chatId)) {
      this.watched.add(chatId);
      this.room(chatId).handlers.add((p) => this.track(chatId, p));
    }
    this.room(chatId).ch.then(() => this.emit({ kind: "probe" }, chatId));
    this.renderBanner();
  },
  track(chatId, p) {
    if (p.from === S.me.id) return;
    if (!this.seen.has(chatId)) this.seen.set(chatId, new Map());
    const m = this.seen.get(chatId);
    if (p.kind === "leave") m.delete(p.from);
    else if (["join", "here", "ping"].includes(p.kind)) m.set(p.from, Date.now());
    this.renderBanner();
  },
  liveCount(chatId) {
    const m = this.seen.get(chatId); if (!m) return 0;
    let n = 0; const now = Date.now();
    for (const [id, t] of m) { if (now - t < 12000) n++; else m.delete(id); }
    return n;
  },
  renderBanner() {
    const view = $("#chatView"); if (!view) return;
    const c = S.chats.find((x) => x.id === S.current);
    let b = $("#gcBanner");
    const n = c?.is_group && !(this.active && this.chatId === c.id) ? this.liveCount(c.id) : 0;
    if (!n) { b?.remove(); return; }
    const text = `📹 Идёт видеочат · ${n} ${plural(n, "участник", "участника", "участников")}`;
    if (!b) {
      b = h("div", { class: "gc-banner", id: "gcBanner" }, h("span", null, text),
        h("button", { class: "btn", onclick: () => this.join(c.id, true) }, "Присоединиться"));
      view.querySelector(".topbar")?.after(b);
    } else b.firstChild.textContent = text;
  },

  // ── начать / присоединиться / выйти
  start(chatId, video = true) {
    const busy = this.liveCount(chatId) > 0;           // видеочат уже идёт — просто входим, без нового приглашения
    return this.join(chatId, video, { invite: !busy });
  },
  vconstraints() { return { facingMode: this.facing, width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 20, max: 24 } }; },
  async join(chatId, video = true, opts = {}) {
    if (this.active) { if (this.chatId !== chatId) toast("Вы уже в видеочате"); return; }
    if (Calls.pc || Calls.ui) { toast("Сначала завершите звонок"); return; }
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) { toast("Звонки не поддерживаются на этом устройстве"); return; }
    this.closeInvite();
    this.active = true; this.chatId = chatId; this.video = video; this.startedAt = 0;
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    try { this.local = await navigator.mediaDevices.getUserMedia({ audio, video: video ? this.vconstraints() : false }); }
    catch {
      try { this.local = await navigator.mediaDevices.getUserMedia({ audio, video: false }); this.video = false; if (video) toast("Камера недоступна — вы в видеочате со звуком"); }
      catch { toast("Нет доступа к микрофону"); this.active = false; this.chatId = null; return; }
    }
    if (!this.active || this.chatId !== chatId) { this.local.getTracks().forEach((t) => t.stop()); return; }
    window.AndroidBridge?.callState?.(true, !!this.video);
    this.showUi();
    await Ice.get();
    if (!this.handler) { this.handler = (p) => this.onRoom(p); }
    this.room(chatId).handlers.add(this.handler);
    await this.room(chatId).ch;
    if (!this.active || this.chatId !== chatId) return;
    this.emit({ kind: "join", video: this.camOn(), mic: this.micOn() });
    this.pingTimer = setInterval(() => { this.emit({ kind: "ping", video: this.camOn(), mic: this.micOn() }); this.prune(); }, 4000);
    this.tick = setInterval(() => this.status(), 1000);
    if (opts.invite) this.invite(chatId);
    this.renderBanner();
  },
  async invite(chatId = this.chatId) {
    const ids = (S.members.get(chatId) || []).map((m) => m.user_id).filter((u) => u !== S.me.id && !S.profiles.get(u)?.banned);
    for (const u of ids) Calls.send(u, { kind: "ginvite", chatId, video: this.video, name: S.me.name, callId: "g-" + chatId }).catch(() => {});
    if (!this.invited) { this.invited = true; await postMessage({ body: GC_MARK }, chatId).catch(() => {}); }
    else toast("Приглашение отправлено");
  },
  leave() {
    if (!this.active) return;
    const chatId = this.chatId;
    this.emit({ kind: "leave" }, chatId);
    clearInterval(this.pingTimer); clearInterval(this.tick);
    for (const id of [...this.peers.keys()]) this.drop(id, true);
    this.local?.getTracks().forEach((t) => t.stop()); this.local = null;
    this.room(chatId).handlers.delete(this.handler);
    this.ui?.remove(); this.ui = null;
    window.AndroidBridge?.callState?.(false, false); window.AndroidBridge?.cancelCall?.();
    this.active = false; this.chatId = null; this.invited = false; this.early.clear();
    this.seen.get(chatId)?.clear();
    this.emit({ kind: "probe" }, chatId);               // узнать, остался ли кто-то — для плашки
    this.renderBanner();
  },

  // ── сигналы комнаты
  onRoom(p) {
    if (!this.active || p.from === S.me.id) return;
    if (p.to && p.to !== S.me.id) return;
    switch (p.kind) {
      case "join": {
        const old = this.peers.get(p.from);
        if (old && old.pc.connectionState !== "connected") this.drop(p.from, true);   // переподключился после обрыва
        this.emit({ kind: "here", to: p.from, video: this.camOn(), mic: this.micOn() });
        this.touch(p); break;
      }
      case "here": case "ping": this.touch(p); break;
      case "probe": this.emit({ kind: "ping", video: this.camOn(), mic: this.micOn() }); break;
      case "leave": this.drop(p.from); break;
      case "offer": {
        let peer = this.peers.get(p.from);
        if (!peer) { if (this.peers.size >= this.MAX - 1) return; peer = this.addPeer(p.from, p, true); }
        this.chain(peer, async () => {
          await peer.pc.setRemoteDescription({ type: "offer", sdp: p.sdp });
          await this.flushIce(peer);
          const ans = await peer.pc.createAnswer(); await peer.pc.setLocalDescription(ans);
          this.emit({ kind: "answer", to: peer.id, sdp: ans.sdp });
        });
        break;
      }
      case "answer": {
        const peer = this.peers.get(p.from); if (!peer) return;
        this.chain(peer, async () => {
          if (peer.pc.signalingState !== "have-local-offer") return;
          await peer.pc.setRemoteDescription({ type: "answer", sdp: p.sdp });
          await this.flushIce(peer);
          if (peer.needNego) { peer.needNego = false; this.negotiate(peer); }
        });
        break;
      }
      case "ice": {
        const peer = this.peers.get(p.from);
        if (!peer) { if (!this.early.has(p.from)) this.early.set(p.from, []); this.early.get(p.from).push(p.candidate); return; }
        this.chain(peer, async () => {
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(p.candidate).catch(() => {});
          else peer.ice.push(p.candidate);
        });
        break;
      }
      case "react": CallReact.show(this.ui, String(p.emoji || "").slice(0, 8), (p.name || "").split(" ")[0]); break;
            case "renego": { const peer = this.peers.get(p.from); if (peer?.offerer) this.negotiate(peer); break; }
    }
  },
  chain(peer, fn) { peer.q = peer.q.then(fn).catch((e) => console.warn("gc", e)); return peer.q; },
  async flushIce(peer) { for (const c of peer.ice.splice(0)) await peer.pc.addIceCandidate(c).catch(() => {}); },

  touch(p) {
    let peer = this.peers.get(p.from);
    if (!peer) {
      if (this.peers.size >= this.MAX - 1) { if (!this.fullWarned) { this.fullWarned = true; toast(`В видеочате не больше ${this.MAX} человек`); } return; }
      peer = this.addPeer(p.from, p, false);
    }
    peer.seen = Date.now();
    if (p.name) peer.name = p.name;
    if ("video" in p) peer.camOn = !!p.video;
    if ("mic" in p) peer.mic = p.mic !== false;
    this.updateTile(peer);
  },
  addPeer(id, p, fromOffer) {
    const pc = new RTCPeerConnection({ iceServers: Ice.now() });
    const peer = { id, pc, stream: new MediaStream(), ice: this.early.get(id) || [], seen: Date.now(), name: p?.name || S.profiles.get(id)?.name || "",
      camOn: p && "video" in p ? !!p.video : true, mic: true, offerer: S.me.id < id, restarts: 0, connected: false, q: Promise.resolve() };
    this.early.delete(id);
    this.peers.set(id, peer);
    this.local.getTracks().forEach((t) => pc.addTrack(t, this.local));
    // видеоканал есть всегда — чтобы видеть других, даже если у меня камера выключена, и включить её позже
    if (peer.offerer && !this.local.getVideoTracks().length) pc.addTransceiver("video", { direction: "sendrecv" });
    pc.ontrack = (e) => {
      if (!peer.stream.getTracks().includes(e.track)) peer.stream.addTrack(e.track);
      e.track.onunmute = e.track.onmute = e.track.onended = () => this.updateTile(peer);
      this.updateTile(peer);
    };
    pc.onicecandidate = (e) => { if (e.candidate) this.emit({ kind: "ice", to: id, candidate: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") {
        peer.connected = true; peer.restarts = 0; clearTimeout(peer.rt); this.tune(pc);
        if (!this.startedAt) this.startedAt = Date.now();
      }
      if ((st === "failed" || st === "disconnected") && peer.offerer) {
        clearTimeout(peer.rt);
        peer.rt = setTimeout(() => {
          if (this.peers.get(id) === peer && pc.connectionState !== "connected" && peer.restarts < 3) { peer.restarts++; this.negotiate(peer, true); }
        }, st === "failed" ? 300 : 2500);
      }
      this.updateTile(peer); this.status();
    };
    this.renderTiles();
    if (peer.offerer && !fromOffer) this.negotiate(peer);
    return peer;
  },
  negotiate(peer, restart) {
    return this.chain(peer, async () => {
      if (this.peers.get(peer.id) !== peer) return;
      if (peer.pc.signalingState !== "stable" && !restart) { peer.needNego = true; return; }
      const offer = await peer.pc.createOffer(restart ? { iceRestart: true } : undefined);
      await peer.pc.setLocalDescription(offer);
      this.emit({ kind: "offer", to: peer.id, sdp: offer.sdp });
    });
  },
  drop(id, silent) {
    const peer = this.peers.get(id); if (!peer) return;
    clearTimeout(peer.rt); clearTimeout(peer.offT);
    try { peer.pc.close(); } catch { /* */ }
    this.peers.delete(id);
    peer.tile?.remove();
    if (!silent && this.active) { toast(`${peer.name || "Участник"} вышел из видеочата`); this.renderTiles(); this.status(); }
  },
  // участник пропал без «до свидания» (сел телефон, пропала сеть)
  prune() {
    const now = Date.now();
    for (const peer of [...this.peers.values()]) {
      const silentFor = now - peer.seen;
      if ((silentFor > 30000 && peer.pc.connectionState !== "connected") || silentFor > 120000) this.drop(peer.id);
    }
  },
  async tune(pc) {
    for (const snd of pc.getSenders()) {
      if (snd.track?.kind !== "video") continue;
      try {
        const prm = snd.getParameters();
        if (!prm.encodings || !prm.encodings.length) prm.encodings = [{}];
        prm.encodings[0].maxBitrate = 450000; prm.encodings[0].maxFramerate = 20;
        prm.degradationPreference = "maintain-framerate";
        await snd.setParameters(prm);
      } catch { /* не поддерживается — не страшно */ }
    }
  },

  // ── интерфейс
  camOn() { return !!this.local?.getVideoTracks().some((t) => t.enabled && t.readyState === "live"); },
  micOn() { return !!this.local?.getAudioTracks().some((t) => t.enabled); },
  showUi() {
    const c = S.chats.find((x) => x.id === this.chatId);
    this.ui?.remove();
    const micBtn = h("button", { class: "cbtn", html: I.mic });
    micBtn.onclick = () => {
      const t = this.local?.getAudioTracks()[0]; if (!t) return;
      t.enabled = !t.enabled; micBtn.classList.toggle("off", !t.enabled); micBtn.innerHTML = t.enabled ? I.mic : I.micOff;
      this.updateLocal(); this.emit({ kind: "ping", video: this.camOn(), mic: this.micOn() });
    };
    const camBtn = h("button", { class: `cbtn${this.video ? "" : " off"}`, html: this.video ? I.video : I.videoOff });
    camBtn.onclick = () => this.toggleCam(camBtn);
    this.grid = h("div", { class: "grid" });
    this.localTile = h("div", { class: "tile me" },
      h("video", { autoplay: true, playsinline: true, muted: true }), avatarEl(S.me.id, "lg"),
      h("div", { class: "name" }, h("span", { class: "mic-off", html: I.micOff }), "Вы"));
    this.localTile.querySelector("video").muted = true;
    this.grid.append(this.localTile);
    this.ui = h("div", { class: "call gcall" },
      h("div", { class: "g-head" }, h("b", null, c ? chatTitle(c) : "Видеочат"), h("span", { class: "status" }, "Ожидание участников…")),
      this.grid,
      h("div", { class: "controls" },
        h("div", { class: "cbtn-wrap" }, micBtn, "Микрофон"),
        h("div", { class: "cbtn-wrap" }, camBtn, "Камера"),
        h("div", { class: "cbtn-wrap" }, h("button", { class: "cbtn", html: I.flip, onclick: () => this.flip() }), "Повернуть"),
        h("div", { class: "cbtn-wrap" }, h("button", { class: "cbtn", html: I.group, onclick: () => this.invite() }), "Позвать"),
        CallReact.button((emoji) => this.emit({ kind: "react", emoji })),
        h("div", { class: "cbtn-wrap" }, h("button", { class: "cbtn red", html: I.hang, onclick: () => this.leave() }), "Выйти")));
    callBackdrop(this.ui, null, c);
    document.body.append(this.ui);
    this.updateLocal(); this.renderTiles();
  },
  renderTiles() {
    if (!this.grid) return;
    for (const peer of this.peers.values()) {
      if (!peer.tile) {
        const v = h("video", { autoplay: true, playsinline: true });
        peer.tile = h("div", { class: "tile wait", "data-uid": peer.id }, v, avatarEl(peer.id, "lg"),
          h("div", { class: "name" }, h("span", { class: "mic-off", html: I.micOff }), h("span", { class: "nm" }, peer.name || S.profiles.get(peer.id)?.name || "Участник")),
          h("div", { class: "conn" }, "Соединение…"));
      }
      if (peer.tile.parentNode !== this.grid) this.grid.append(peer.tile);
      this.updateTile(peer);
    }
    const n = this.peers.size + 1;
    const wide = innerWidth > innerHeight * 1.1;
    const cols = n === 1 ? 1 : wide ? Math.ceil(Math.sqrt(n)) : n === 2 ? 1 : 2;
    const rows = Math.ceil(n / cols);
    this.grid.style.setProperty("--cols", cols); this.grid.style.setProperty("--rows", rows);
    this.grid.classList.toggle("solo", n === 1);
    const tiles = [...this.grid.children];
    tiles.forEach((t, i) => t.classList.toggle("span2", cols === 2 && n % 2 === 1 && i === tiles.length - 1));
  },
  updateTile(peer) {
    const t = peer.tile; if (!t) return;
    const v = t.querySelector("video");
    if (v.srcObject !== peer.stream) v.srcObject = peer.stream;
    if (v.paused) v.play?.().catch(() => {});
    const nm = t.querySelector(".nm"); if (nm && peer.name && nm.textContent !== peer.name) nm.textContent = peer.name;
    t.classList.toggle("wait", !peer.connected);
    t.classList.toggle("muted", peer.mic === false);
    // видео включаем сразу, выключаем через 1,5 с без кадров — без мигания
    const has = peer.camOn !== false && peer.stream.getVideoTracks().some((x) => x.readyState === "live" && !x.muted);
    clearTimeout(peer.offT);
    if (has) t.classList.add("has-video");
    else if (t.classList.contains("has-video")) peer.offT = setTimeout(() => {
      if (!(peer.camOn !== false && peer.stream.getVideoTracks().some((x) => x.readyState === "live" && !x.muted))) t.classList.remove("has-video");
    }, 1500);
  },
  updateLocal() {
    const t = this.localTile; if (!t || !this.local) return;
    const v = t.querySelector("video");
    if (v.srcObject !== this.local) v.srcObject = this.local;
    if (v.paused) v.play?.().catch(() => {});
    t.classList.toggle("has-video", this.camOn());
    t.classList.toggle("muted", !this.micOn());
    t.classList.toggle("back", this.facing !== "user");
  },
  status() {
    const s = this.ui?.querySelector(".status"); if (!s) return;
    const live = [...this.peers.values()].filter((p) => p.connected).length;
    if (!this.peers.size) s.textContent = "Ожидание участников…";
    else if (!live) s.textContent = "Соединение…";
    else s.textContent = `${live + 1} ${plural(live + 1, "участник", "участника", "участников")}${this.startedAt ? " · " + fmtDur((Date.now() - this.startedAt) / 1000) : ""}`;
  },
  async toggleCam(btn) {
    let vt = this.local?.getVideoTracks()[0];
    if (vt && vt.readyState === "live") vt.enabled = !vt.enabled;
    else {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: this.vconstraints() });
        if (vt) { this.local.removeTrack(vt); }
        vt = s.getVideoTracks()[0]; this.local.addTrack(vt); this.video = true;
        for (const peer of this.peers.values()) await this.sendVideo(peer, vt);
        window.AndroidBridge?.callState?.(true, true);
      } catch { toast("Камера недоступна"); return; }
    }
    const on = this.camOn();
    btn.innerHTML = on ? I.video : I.videoOff; btn.classList.toggle("off", !on);
    this.updateLocal(); this.emit({ kind: "ping", video: on, mic: this.micOn() });
  },
  async sendVideo(peer, track) {
    const pc = peer.pc;
    const tr = pc.getTransceivers().find((t) => !t.stopped && (t.sender.track?.kind === "video" || t.receiver.track?.kind === "video"));
    if (tr) {
      await tr.sender.replaceTrack(track);
      if (tr.direction === "recvonly" || tr.direction === "inactive") { tr.direction = "sendrecv"; this.renego(peer); }
    } else { pc.addTrack(track, this.local); this.renego(peer); }
    this.tune(pc);
  },
  renego(peer) { if (peer.offerer) this.negotiate(peer); else this.emit({ kind: "renego", to: peer.id }); },
  async flip() {
    const vt = this.local?.getVideoTracks()[0]; if (!vt || !vt.enabled) { toast("Сначала включите камеру"); return; }
    this.facing = this.facing === "user" ? "environment" : "user";
    try {
      vt.stop();                                         // на телефонах две камеры сразу не открываются
      const s = await navigator.mediaDevices.getUserMedia({ video: this.vconstraints() });
      const nt = s.getVideoTracks()[0];
      for (const peer of this.peers.values()) {
        const snd = peer.pc.getSenders().find((x) => x.track === vt || x.track?.kind === "video");
        await snd?.replaceTrack(nt);
      }
      this.local.removeTrack(vt); this.local.addTrack(nt);
      this.updateLocal();
    } catch { toast("Не удалось переключить камеру"); }
  },

  // ── приглашение
  async onInvite(p) {
    if (this.active || Calls.pc || Calls.ui || this.inviteUi) return;
    let c = S.chats.find((x) => x.id === p.chatId);
    if (!c) { await loadChats(); renderChatList(); c = S.chats.find((x) => x.id === p.chatId); }
    if (!c) return;
    const title = chatTitle(c);
    this.inviteUi = h("div", { class: "call ringing gc-invite" },
      h("div", { class: "who" }, chatAvatar(c, "xl"), h("b", null, title),
        h("span", null, `${p.name || "Участник"} зовёт в ${p.video ? "видеочат" : "групповой звонок"}`)),
      h("div", { class: "controls" },
        h("div", { class: "cbtn-wrap" }, h("button", { class: "cbtn red", html: I.hang, onclick: () => this.closeInvite() }), "Отклонить"),
        h("div", { class: "cbtn-wrap" }, h("button", { class: "cbtn green", html: p.video ? I.video : I.phone, onclick: () => this.join(p.chatId, !!p.video) }), "Войти")));
    callBackdrop(this.inviteUi, null, c);
    document.body.append(this.inviteUi);
    Calls.ringtone();
    this.pendingInvite = p;
    if (window.AndroidBridge?.incomingCall2) window.AndroidBridge.incomingCall2(`${title}: ${p.name || ""} зовёт`, !!p.video);
    else window.AndroidBridge?.incomingCall?.(`${title}: видеочат`);
    Calls.tryAutoAnswer();
    clearTimeout(this.inviteTimer);
    this.inviteTimer = setTimeout(() => this.closeInvite(), 40000);
  },
  closeInvite() {
    clearTimeout(this.inviteTimer);
    if (!this.inviteUi) return;
    this.inviteUi.remove(); this.inviteUi = null; this.pendingInvite = null;
    Calls.stopRing(); window.AndroidBridge?.cancelCall?.();
  },
};

// подключаемся к звонкам один-на-один: приглашения и «занято»
addEventListener("DOMContentLoaded", function hookCalls() {
  const prevSignal = Calls.onSignal;
  Calls.onSignal = async function (p) {
    if (p.to !== S.me.id) return;
    if (p.kind === "ginvite") { GroupCall.onInvite(p); return; }
    if (p.kind === "offer" && (GroupCall.active || GroupCall.inviteUi)) { this.send(p.from, { kind: "busy", callId: p.callId }); return; }
    return prevSignal.call(this, p);
  };
  const prevStart = Calls.start;
  Calls.start = function (...a) {
    if (GroupCall.active) { toast("Сначала выйдите из видеочата"); return; }
    return prevStart.apply(this, a);
  };
  setInterval(() => GroupCall.renderBanner(), 3000);
  addEventListener("resize", () => { if (GroupCall.active) GroupCall.renderTiles(); });
});
