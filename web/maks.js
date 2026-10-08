/* v4.5: ассистент «Макс». Откликается на имя, пока приложение открыто (по желанию, включается в настройках ассистента),
   открывает разделы и настройки, переключает оформление, находит чаты, рассказывает, что нового. Работает без нейросети и интернета. */
"use strict";

const Maks = {
  NAME: "Макс",
  listening: false, on: false, timer: 0, busy: false,

  // ───────── Что можно открыть голосом ─────────
  screens() {
    const tab = (t) => () => { this.leave(); showTab(t); };
    const sheetOnly = (fn) => () => fn();
    return [
      [/настройки ассистента|голос ассистента|голос макса|настройки макса/, "настройки ассистента", () => { if (!Assistant.loaded) { Assistant.load(); Assistant.loaded = true; } Assistant.settingsSheet(); }],
      [/конфиденциальн|приватност/, "конфиденциальность", sheetOnly(() => Privacy.sheet())],
      [/уведомлен|звуки уведомлен/, "уведомления", sheetOnly(() => Tg.notifSheet())],
      [/оформлен|цвет приложени|цвета|темы|тему/, "оформление", sheetOnly(() => Theme.sheet())],
      [/мелоди|рингтон/, "мелодии", sheetOnly(() => Snd.sheet())],
      [/смен(?:и|ить) пароль|пароль/, "смена пароля", sheetOnly(() => changePasswordSheet())],
      [/отпечат|вход по лицу|блокировк/, "вход по отпечатку", sheetOnly(() => Lock.sheet())],
      [/фон чат|обои/, "фон чатов", sheetOnly(() => Wallpaper.sheet(null))],
      [/данные и памят|память|кэш|очистить кэш/, "данные и память", sheetOnly(() => Tg.dataSheet())],
      [/профил|мой аккаунт|мои данные/, "профиль", sheetOnly(() => openProfile())],
      [/обновлен|новую версию/, "обновления", sheetOnly(() => Updates.sheet())],
      [/о приложении|версию приложения|версия приложения/, "о приложении", sheetOnly(() => Tg.aboutSheet())],
      [/видеоредактор|монтаж|редактор видео/, "видеоредактор", () => { this.leave(); VideoEditor.open(); }],
      [/сканер|скан документ/, "сканер документов", () => { this.leave(); Camera.open("doc"); }],
      [/фото в текст|текст с фото|текст с картинки|распозна\S* (?:текст|фото)|ocr/, "фото в текст", () => { this.leave(); Ocr.open(); }],
      [/рукопис/, "рукопись в текст (Claude)", () => { const u = "https://claude.ai/artifact/TMjFqbaBXai4QhsVFvT5PW"; Lock.ext = true; if (window.AndroidBridge?.openUrl) window.AndroidBridge.openUrl(u); else window.open(u, "_blank", "noopener"); }],
      [/подарки|подарок/, "подарки", () => { this.leave(); Gifts.open(); }],
      [/стикер/, "стикеры", sheetOnly(() => Stickers.store())],
      [/задач|напоминани/, "задачи", () => { this.leave(); Tasks.open(); }],
      [/групп(?:ы|у)? и канал|каталог групп|найти групп/, "группы и каналы", sheetOnly(() => Joins.directory())],
      [/созда(?:й|ть|ние) групп|новую групп|новая групп/, "создание группы", sheetOnly(() => newGroupSheet())],
      [/созда(?:й|ть|ние) канал|новый канал/, "создание канала", sheetOnly(() => Channels.create())],
      [/панел\S* (?:управлени|администратор)|админк|админ-панел/, "панель управления", () => { if (!S.isAdmin) return false; AdminPanel.open(); }],
      [/приглас|код приглашени/, "приглашение в семью", tab("invite")],
      [/истори|статус/, "истории", tab("stories")],
      [/журнал звонков|звонки|вызовы/, "звонки", tab("calls")],
      [/контакт|люди|участник/, "контакты", tab("contacts")],
      [/настройк/, "настройки", tab("settings")],
      [/меню/, "меню", tab("menu")],
      [/чаты|сообщения|переписк|главн|список чатов/, "чаты", tab("chats")],
    ];
  },

  /** Закрыть открытый чат или ассистента, чтобы показать раздел. */
  leave() {
    try { Assistant.closeMini?.(); } catch { /* */ }
    if (S.current || S.assistantOpen || S.tasksOpen) { try { closeChat(true); } catch { /* */ } }
  },

  /** Ответ: в окне ассистента — как обычное сообщение, иначе всплывающая подсказка и голос. */
  reply(text) {
    if (!Assistant.loaded) { Assistant.load(); Assistant.loaded = true; }
    const t = Assistant.persona(text);
    if (S.assistantOpen || Assistant.mini) { Assistant.say(t); return true; }
    Assistant.history.push({ role: "assistant", content: t, at: Date.now() }); Assistant.save();
    toast(t, 3500);
    if (Assistant.settings.speak) Voice2.speak(t, Assistant.settings.voice);
    return true;
  },

  clean(raw) {
    return String(raw || "").trim().replace(/[.!?]+$/, "").replace(/(^|\s)(пожалуйста|быстро|срочно)(?=[\s,]|$),?/gi, " ").replace(/\s+/g, " ").trim();
  },
  /** Убрать обращение: «Макс, открой настройки» → «открой настройки». */
  /** Распознавание часто слышит «Макс» как «Мокс», «Маск», «Max»: приводим к одному виду. */
  norm(raw) { return String(raw || "").replace(/(^|[^а-яёa-z])(?:макс|мокс|маск|мэкс|макc|max|mux)(?=[^а-яёa-z]|$)/gi, "$1Макс"); },
  strip(raw) { return this.norm(raw).replace(/^\s*(?:эй|привет|слушай|ок|окей|хей|ну|алло|привет,)?[\s,]*макс[\s,!.:-]*/i, "").trim(); },
  addressed(raw) { return /(^|[^а-яё])макс([^а-яё]|$)/i.test(this.norm(raw)); },

  // ───────── Команды ─────────
  /** true — команда выполнена (дальше ассистент ничего не делает) */
  async command(raw) {
    const text = this.clean(this.strip(raw));
    const low = text.toLowerCase().replace(/ё/g, "е");
    if (!low) return false;

    // оформление: тема, размер текста
    let m = low.match(/(?:включи|сделай|поставь|переключи|установи|хочу)\s+(?:мне\s+)?(темн|ночн|светл|дневн|автоматическ|авто)\w*\s*(?:тему|режим|оформление)?/);
    if (m && /тем|режим|оформлен/.test(low)) {
      const mode = /темн|ночн/.test(m[1]) ? "dark" : /светл|дневн/.test(m[1]) ? "light" : "auto";
      Theme.set("mode", mode); Theme.apply();
      return this.reply(mode === "dark" ? "Включил тёмную тему." : mode === "light" ? "Включил светлую тему." : "Тема теперь меняется автоматически.");
    }
    if (/^(?:сделай\s+)?(?:увеличь|больше|крупнее|покрупнее)\s+(?:шрифт|текст|буквы)/.test(low) || /^шрифт\s+(?:больше|крупнее)/.test(low)) return this.fontStep(1);
    if (/^(?:сделай\s+)?(?:уменьши|меньше|мельче|помельче)\s+(?:шрифт|текст|буквы)/.test(low) || /^шрифт\s+(?:меньше|мельче)/.test(low)) return this.fontStep(-1);

    // настройки ассистента
    m = low.match(/^(включи|выключи|отключи)\s+(озвучку|озвучивание|голос ответов|разговорный режим|режим разговора|плавающий значок|значок ассистента|режим макс|отклик на макс)/);
    if (m) {
      const val = m[1] === "включи"; const what = m[2];
      if (/озвуч|голос ответов/.test(what)) { Assistant.settings.speak = val; Assistant.save(); if (!val) Voice2.stop(); return this.reply(val ? "Озвучка включена." : "Озвучка выключена."); }
      if (/разговор/.test(what)) { Assistant.settings.handsfree = val; Assistant.save(); return this.reply(val ? "Разговорный режим включён." : "Разговорный режим выключен."); }
      if (/значок/.test(what)) { Prefs.set("asstFab", val); try { AsstFab.sync?.(); } catch { /* */ } return this.reply(val ? "Плавающий значок включён." : "Плавающий значок выключен."); }
      this.setWake(val); return this.reply(val ? "Теперь я отзываюсь на имя Макс, пока приложение открыто." : "Больше не слушаю обращение по имени.");
    }

    // что нового
    if (/^(что нового|есть (?:новые|непрочитанные)|сколько (?:у меня )?(?:непрочитанных|новых)(?: сообщений)?|покажи непрочитанные|непрочитанные)$/.test(low)) {
      const unread = [...S.unread.entries()].filter(([id]) => !Prefs.muted(id) && (S.unread.get(id) || 0) > 0);
      const total = unread.reduce((a, [, n]) => a + n, 0);
      if (!total) return this.reply("Новых сообщений нет.");
      const names = unread.slice(0, 3).map(([id]) => { const c = S.chats.find((x) => x.id === id); return c ? chatTitle(c) : null; }).filter(Boolean);
      this.leave(); showTab("chats"); S.folder = "unread"; try { renderChatList(); } catch { /* */ }
      return this.reply(`Непрочитанных сообщений: ${total}, в ${unread.length} ${this.plural(unread.length, "чате", "чатах", "чатах")}${names.length ? ": " + names.join(", ") : ""}. Показываю их.`);
    }

    // поиск по чатам
    m = low.match(/^(?:найди|поищи|ищи)\s+(?:в\s+(?:чатах|переписке|сообщениях)|среди\s+чатов)\s+(.+)$/);
    if (m) {
      this.leave(); showTab("chats"); TopSearch.open();
      const i = $("#chatSearch"); if (i) { i.value = m[1]; i.dispatchEvent(new Event("input")); }
      return this.reply(`Ищу «${m[1]}» в чатах.`);
    }

    // открыть чат
    m = low.match(/^(?:открой|покажи|перейди в|перейди к|зайди в|напиши в)\s+(?:чат|переписку|диалог|беседу)\s+(?:с\s+|со\s+|в\s+)?(.+)$/);
    if (m) {
      const t = Assistant.findTarget(m[1].split(/\s+/).filter(Boolean), false);
      if (!t) return this.reply(`Не нашёл «${m[1]}» среди чатов и участников.`);
      this.leave();
      if (t.kind === "chat") openChat(t.id); else openDm(t.id);
      return this.reply(`Открываю чат: ${t.name}.`);
    }

    // назад / закрыть
    if (/^(назад|вернись|закрой|закрой чат|выйди из чата|на главную|домой)$/.test(low)) {
      this.leave(); if (/главн|домой/.test(low)) showTab("chats");
      return this.reply("Готово.");
    }
    if (/^(выйди из аккаунта|выход из аккаунта|выйти из аккаунта|разлогинь меня)$/.test(low)) { Tg.logoutSheet(); return this.reply("Подтвердите выход на экране."); }
    if (/^(очисти|удали)\s+(?:историю|переписку)\s+(?:ассистента|с ассистентом|с максом)$/.test(low)) { Assistant.history = []; Assistant.save(); Assistant.render?.(); return this.reply("История разговора с ассистентом очищена."); }

    // открыть раздел или настройку
    m = low.match(/^(?:открой|открыть|покажи|показать|перейди|перейти|зайди|зайти|давай|хочу|мне нужн[ыоа]\w*|где(?: находятся| находится)?|как открыть|как зайти в|как найти|как попасть в|включи экран)\s+(?:в\s+|на\s+|к\s+|мне\s+)?(?:раздел\s+|вкладку\s+|пункт\s+|экран\s+|окно\s+)?(.+)$/);
    if (m) {
      const q = m[1], asking = /^(где|как)/.test(low);
      for (const [re, label, run] of this.screens()) {
        if (!re.test(q)) continue;
        if (run() === false) return this.reply("Этот раздел доступен только администратору.");
        return this.reply(asking ? `Это раздел «${label}»: открыл его для вас.` : `Открываю: ${label}.`);
      }
    }

    // справка
    if (/^(что ты умеешь в приложении|что можно (?:сказать|попросить)|какие (?:есть )?команды|помощь по приложению|чем ты управляешь|что ты можешь открыть|как тобой пользоваться)$/.test(low)) {
      return this.reply("Скажите, например: «открой настройки», «открой видеоредактор», «включи тёмную тему», «увеличь шрифт», «что нового», «открой чат с мамой», «найди в чатах отпуск», «позвони маме», «напомни завтра в 9 позвонить бабушке». Чтобы я откликался на имя Макс, включите это в настройках ассистента.");
    }
    return false;
  },

  plural(n, a, b, c) { n = Math.abs(n) % 100; const k = n % 10; return n > 10 && n < 20 ? c : k > 1 && k < 5 ? b : k === 1 ? a : c; },
  fontStep(d) {
    const steps = [14, 16, 18, 20], cur = Prefs.get("fontSize") || 16;
    const i = Math.max(0, steps.indexOf(cur)), j = Math.min(steps.length - 1, Math.max(0, i + d));
    if (j === i) return this.reply(d > 0 ? "Это уже самый крупный размер." : "Это уже самый мелкий размер.");
    Prefs.set("fontSize", steps[j]); Prefs.apply();
    return this.reply(d > 0 ? "Сделал шрифт крупнее." : "Сделал шрифт мельче.");
  },

  // ───────── Отклик на имя «Макс» ─────────
  enabled() { return !!Assistant.settings.wake; },
  setWake(v) {
    if (!Assistant.loaded) { Assistant.load(); Assistant.loaded = true; }
    Assistant.settings.wake = !!v; Assistant.save();
    if (v) this.start(); else this.stop();
  },
  start() {
    if (this.on) return;
    this.on = true; this.draw();
    window.AndroidBridge?.muteBeeps?.(true);
    this.loop();
  },
  stop() {
    this.on = false; clearTimeout(this.timer); this.draw();
    window.AndroidBridge?.muteBeeps?.(false);
    if (this.listening && window.onSpeechResult === this.handler) window.onSpeechResult = null;
    this.listening = false;
  },
  /** Слушаем только когда приложение на экране и никто не говорит: не мешаем звонкам, озвучке и ручному вводу. */
  canListen() {
    return this.on && !document.hidden && !Assistant.listening && !Assistant.busy && !this.busy
      && !(typeof Calls !== "undefined" && (Calls.pc || Calls.ui)) && !(typeof GroupCall !== "undefined" && GroupCall.active)
      && !VideoEditor.root && !document.querySelector(".camera, .video-rec, .vnote-rec, .lock-screen, .auth") && !Voice2.waiting && !Voice2.audio && !window.speechSynthesis?.speaking;
  },
  loop() {
    clearTimeout(this.timer);
    if (!this.on) return;
    if (!this.canListen() || this.listening) { this.timer = setTimeout(() => this.loop(), 1500); return; }
    if (window.AndroidBridge?.listen) {
      this.listening = true;
      this.handler = (text, err) => {
        window.onSpeechResult = null; this.listening = false;
        if (err === "permission") { toast("Разрешите доступ к микрофону, чтобы я слышал имя Макс"); this.setWake(false); return; }
        if (err === "unavailable") { toast("На телефоне нет службы распознавания речи"); this.setWake(false); return; }
        if (text) this.hear(text);
        this.timer = setTimeout(() => this.loop(), text ? 600 : err === "error" ? 1200 : 250);
      };
      window.onSpeechResult = this.handler;
      try { (window.AndroidBridge.listenWake || window.AndroidBridge.listen).call(window.AndroidBridge); } catch { this.listening = false; this.timer = setTimeout(() => this.loop(), 3000); }
      return;
    }
    // обычный браузер: нет службы распознавания — режим недоступен
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast("Голосовой режим не поддерживается в этом браузере"); this.setWake(false); return; }
    this.listening = true;
    const r = new SR(); r.lang = "ru-RU"; r.interimResults = false; r.maxAlternatives = 5; let got = null;
    r.onresult = (e) => { const alts = [...e.results[0]].map((a) => a.transcript); got = alts.find((a) => this.addressed(a)) || alts[0]; };
    r.onerror = () => {}; r.onend = () => { this.listening = false; if (got) this.hear(got); this.timer = setTimeout(() => this.loop(), 500); };
    try { r.start(); } catch { this.listening = false; this.timer = setTimeout(() => this.loop(), 3000); }
  },
  /** Услышали фразу: если в ней есть «Макс» — выполняем остальное как команду. Без обращения фраза игнорируется. */
  async hear(text) {
    if (!this.addressed(text)) return;
    const cmd = this.strip(text);
    if (!Assistant.loaded) { Assistant.load(); Assistant.loaded = true; }
    this.busy = true;
    try {
      if (!cmd) {                                              // «Макс!» — отвечаем и ждём команду
        this.reply("Слушаю.");
        setTimeout(async () => { this.busy = false; await this.oneShot(); }, 1500);
        return;
      }
      await this.run(cmd);
    } finally { if (!this.pendingShot) this.busy = false; }
  },
  /** Одна команда после «Слушаю». */
  oneShot() {
    return new Promise((res) => {
      if (!window.AndroidBridge?.listen) { res(); return; }
      this.listening = true;
      window.onSpeechResult = async (text) => {
        window.onSpeechResult = null; this.listening = false;
        if (text) await this.run(this.strip(text) || text); res();
      };
      try { window.AndroidBridge.listen(); } catch { this.listening = false; res(); }
    });
  },
  /** Выполнить команду: сначала навигация, остальное — обычный разбор ассистента. */
  async run(cmd) {
    if (!Assistant.loaded) { Assistant.load(); Assistant.loaded = true; }
    let done = false;
    try { done = await this.command(cmd); } catch { done = false; }
    if (done) return;
    if (!S.assistantOpen && !Assistant.mini) { this.leave(); Assistant.open(); }
    Assistant.ask(cmd, true);
  },

  /** Значок «слушаю Макса» на экране, чтобы всегда было видно, что микрофон включён. */
  draw() {
    let el = document.getElementById("maksDot");
    if (!this.on) { el?.remove(); return; }
    if (!el) {
      el = h("button", { id: "maksDot", class: "maks-dot", title: "Макс слушает. Нажмите, чтобы выключить.", onclick: () => { this.setWake(false); toast("Макс больше не слушает"); } }, "🎙 Макс");
      document.body.append(el);
    }
  },
  /** Вызывается после входа в аккаунт: восстановить режим. */
  init() {
    if (!Assistant.loaded) { Assistant.load(); Assistant.loaded = true; }
    if (this.enabled()) this.start();
  },
};
document.addEventListener("visibilitychange", () => {
  if (!Maks.on) return;
  window.AndroidBridge?.muteBeeps?.(!document.hidden);
  if (!document.hidden) Maks.loop();
});
