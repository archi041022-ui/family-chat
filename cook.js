/* v4.8: «Макс» рассказывает рецепты по шагам. Рецепт ищется в интернете: сначала в русской кулинарной книге Викиучебника,
   если там нет — через нейросеть. Дальше голосом: «дальше», «повтори», «назад», «ингредиенты», «таймер на 10 минут», «стоп».
   Пока идёт рецепт, имя «Макс» перед командой говорить не нужно. */
"use strict";

const Cook = {
  active: null,          // { title, ing[], steps[], i, source }
  timers: [],

  // ───────── Что просят ─────────
  /** «рецепт борща», «как приготовить блины», «расскажи как испечь пирог» → название блюда или null */
  dishFrom(raw) {
    const low = String(raw || "").toLowerCase().replace(/ё/g, "е").replace(/[?!.]+$/g, "").replace(/\s+/g, " ").trim();
    let m = low.match(/^(?:(?:пожалуйста\s+)?(?:расскажи|подскажи|дай|покажи|найди|скажи|объясни|давай|хочу|нужен|мне нужен|мне нужно|можешь рассказать))?\s*(?:мне\s+)?(?:пошаговый\s+|подробный\s+)?рецепт\s+(?:приготовления\s+)?(.+)$/);
    if (!m) m = low.match(/^(?:(?:расскажи|подскажи|объясни|скажи|покажи|подробно расскажи)\s+(?:мне\s+)?)?как\s+(?:мне\s+)?(?:правильно\s+)?(?:приготовить|готовить|испечь|печь|сварить|варить|пожарить|жарить|потушить|тушить|запечь|замариновать|засолить|заквасить|замесить|приготовить)\s+(.+)$/);
    if (!m) m = low.match(/^(?:приготовь|научи(?:\s+меня)?\s+готовить|давай приготовим|хочу приготовить|хочу испечь|буду готовить|хочу сварить|хочу пожарить)\s+(.+)$/);
    if (!m) return null;
    let dish = m[1].replace(/\s*(?:по шагам|пошагово|подробно|для меня|пожалуйста|с нуля|дома)\s*$/g, "").replace(/^(?:мне|нам)\s+/, "").trim();
    if (!dish || dish.split(/\s+/).length > 6) return null;
    if (/(?:заметк|звонок|звонк|групп|канал|настройк|скриншот|сканер|тему|фон|пароль|аккаунт|сообщени|историю|приложени)/.test(dish)) return null;
    return dish;
  },
  looksLikeCmd(raw) { return !!this.control(this.low(raw)); },
  low(raw) { return String(raw || "").toLowerCase().replace(/ё/g, "е").replace(/[.,!?]+/g, " ").replace(/\s+/g, " ").trim(); },

  // ───────── Поиск рецепта ─────────
  cleanWiki(s) {
    for (let k = 0; k < 4; k++) s = s.replace(/\{\{[^{}]*\}\}/g, "");
    return s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")
      .replace(/\[\[(?:Файл|File|Изображение|Image|Категория|Category)[^\]]*\]\]/gi, "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
      .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, "$1").replace(/'{2,}/g, "").replace(/&nbsp;/g, " ");
  },
  /** Разбор статьи Викиучебника: заголовки «== Ингредиенты ==», списки «*» и «#». */
  parseWiki(title, wikitext) {
    const txt = this.cleanWiki(String(wikitext || ""));
    const parts = txt.split(/^=+\s*(.*?)\s*=+\s*$/m);              // [вступление, заголовок, текст, заголовок, текст …]
    const sec = [];
    for (let i = 1; i < parts.length; i += 2) sec.push([parts[i].toLowerCase(), parts[i + 1] || ""]);
    const lines = (t) => t.split("\n").map((l) => l.replace(/^[\s*#:;•-]+/, "").replace(/^\d+[.)]\s*/, "").trim()).filter((l) => l.length > 1);
    const ing = [], steps = [];
    for (const [h2, body] of sec) {
      if (/ингредиент|состав|продукт|что нужно|потребуется/.test(h2)) ing.push(...lines(body));
      else if (/приготовлен|способ|процесс|рецепт|как готовить|технолог|порядок|действ/.test(h2)) {
        const bl = body.split("\n").filter((l) => /^\s*[#*]|^\s*\d+[.)]/.test(l));
        if (bl.length >= 2) steps.push(...lines(bl.join("\n")));
        else for (const para of body.split(/\n\s*\n/)) { const t = lines(para).join(" "); if (t.length > 15) steps.push(...t.split(/(?<=[.!])\s+(?=[А-ЯЁ])/).reduce((acc, s) => { if (acc.length && acc[acc.length - 1].length < 60) acc[acc.length - 1] += " " + s; else acc.push(s); return acc; }, [])); }
      }
    }
    if (steps.length < 3 || ing.length < 2) return null;
    return { title: title.replace(/^Кулинарная книга\/?/i, "").replace(/^Рецепт[ы]?\/?/i, "") || title, ing: ing.slice(0, 40), steps: steps.slice(0, 40), source: "Викиучебник, кулинарная книга" };
  },
  async getJSON(url, ms = 9000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); }
  },
  async fromWiki(dish) {
    const api = "https://ru.wikibooks.org/w/api.php?format=json&formatversion=2&origin=*&action=query";
    const words = dish.split(/\s+/).map((w) => w.slice(0, Math.max(3, w.length - 2))).filter((w) => w.length > 2);
    const s = await this.getJSON(`${api}&list=search&srlimit=6&srnamespace=0&srsearch=${encodeURIComponent(dish + " кулинарная книга")}`);
    const hits = (s.query?.search || []).map((x) => x.title).filter((t) => words.every((w) => t.toLowerCase().includes(w)) || words.some((w) => t.toLowerCase().includes(w)));
    for (const title of hits.slice(0, 3)) {
      const p = await this.getJSON(`${api}&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(title)}`);
      const text = p.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
      const r = this.parseWiki(title, text);
      if (r) return r;
    }
    return null;
  },
  /** Нейросеть: просим строгий формат и разбираем. */
  parseText(dish, txt) {
    txt = String(txt || "").replace(/\*\*/g, "").replace(/^#+\s*/gm, "");
    const ing = [], steps = []; let title = dish, mode = "";
    for (const line of txt.split("\n")) {
      const l = line.trim(); if (!l) continue;
      let m;
      if ((m = l.match(/^название\s*[:\-—]\s*(.+)$/i))) { title = m[1].trim(); continue; }
      if (/^ингредиенты\s*:?\s*$/i.test(l)) { mode = "i"; continue; }
      if (/^(?:шаги|приготовление|способ приготовления)\s*:?\s*$/i.test(l)) { mode = "s"; continue; }
      if (mode === "i") { const t = l.replace(/^[-•*\d.)\s]+/, "").trim(); if (t) ing.push(t); }
      else if (mode === "s") { const t = l.replace(/^\s*(?:шаг\s*)?\d+\s*[.):-]\s*/i, "").replace(/^[-•*]\s*/, "").trim(); if (t) steps.push(t); }
    }
    if (steps.length < 3) return null;
    return { title: title.charAt(0).toUpperCase() + title.slice(1), ing: ing.slice(0, 40), steps: steps.slice(0, 40), source: "интернет (нейросеть)" };
  },
  async fromLLM(dish) {
    const system = "Ты — опытный повар. Дай точный проверенный рецепт на русском языке в строго таком формате без markdown и без вступлений:\nНАЗВАНИЕ: ...\nИНГРЕДИЕНТЫ:\n- продукт и количество\nШАГИ:\n1. короткое действие (с временем и температурой)\n2. ...\nКаждый шаг — одно-два предложения, чтобы его можно было зачитать вслух.";
    const user = `Рецепт: ${dish}`;
    const msgs = [{ role: "system", content: system }, { role: "user", content: user }];
    const tries = [
      () => fetch("https://text.pollinations.ai/openai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "openai", messages: msgs, private: true }) }).then(async (r) => { if (!r.ok) throw new Error(r.status); return (await r.json()).choices?.[0]?.message?.content; }),
      () => fetch("https://text.pollinations.ai/openai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "mistral", messages: msgs, private: true }) }).then(async (r) => { if (!r.ok) throw new Error(r.status); return (await r.json()).choices?.[0]?.message?.content; }),
      () => fetch(`https://text.pollinations.ai/${encodeURIComponent(user)}?model=openai&private=true&system=${encodeURIComponent(system)}`).then(async (r) => { if (!r.ok) throw new Error(r.status); return r.text(); }),
    ];
    for (const go of tries) {
      try {
        const txt = await Promise.race([go(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 20000))]);
        const r = this.parseText(dish, txt); if (r) return r;
      } catch { /* следующий способ */ }
    }
    return null;
  },
  async find(dish) {
    const [w, l] = await Promise.allSettled([this.fromWiki(dish), this.fromLLM(dish)]);
    return (w.status === "fulfilled" && w.value) || (l.status === "fulfilled" && l.value) || null;
  },

  // ───────── Ведение рецепта ─────────
  say(t) { return Maks.reply(t); },
  numWords: { пять: 5, десять: 10, пятнадцать: 15, двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, один: 1, одну: 1, две: 2, два: 2, три: 3, четыре: 4, шесть: 6, семь: 7, восемь: 8, девять: 9 },
  ingText() { const a = this.active; return a.ing.length ? "Понадобится: " + a.ing.join("; ") + "." : "Список продуктов в рецепте не указан."; },
  async start(dish) {
    this.say(`Ищу рецепт: ${dish}. Минуту.`);
    let r = null;
    try { r = await this.find(dish); } catch { r = null; }
    if (!r) return this.say(`Не нашёл рецепт «${dish}». Проверьте интернет или назовите блюдо иначе, например «рецепт борща».`);
    this.active = { ...r, i: -1 };
    this.showSheet();
    const first = r.ing.slice(0, 8).join(", ");
    return this.say(`Рецепт: ${r.title}. ${r.ing.length ? "Понадобится: " + first + (r.ing.length > 8 ? " и другое — полный список на экране" : "") + ". " : ""}Всего ${r.steps.length} ${Maks.plural(r.steps.length, "шаг", "шага", "шагов")}. Скажите «дальше», когда будете готовы.`);
  },
  step(i) {
    const a = this.active; if (!a) return false;
    if (i >= a.steps.length) { const t = a.title; this.end(); return this.say(`Это был последний шаг. Приятного аппетита! Блюдо: ${t}.`); }
    a.i = Math.max(0, i); this.showSheet();
    const last = a.i === a.steps.length - 1;
    return this.say(`Шаг ${a.i + 1} из ${a.steps.length}. ${a.steps[a.i]}${last ? " Это последний шаг." : ""}`);
  },
  end() { this.active = null; try { this.closeUi?.(); } catch { /* */ } this.ui = null; },
  /** Команды управления; возвращает название действия или null. */
  control(low) {
    if (!this.active) return null;
    if (/^(?:макс )?(?:дальше|далее|следующ\S*(?: шаг)?|продолжай|продолжить|что дальше|готово|сделал\S*|поехали|начинаем|начнем)$/.test(low)) return "next";
    if (/^(?:повтори\S*|еще раз|ещe раз|не расслышал\S*|что ты сказал\S*)$/.test(low)) return "repeat";
    if (/^(?:назад|предыдущ\S*(?: шаг)?|вернись)$/.test(low)) return "prev";
    if (/^(?:сначала|с начала|заново)$/.test(low)) return "restart";
    if (/ингредиент|что нужно|что понадоб|список продукт|состав|какие продукт/.test(low)) return "ing";
    if (/^(?:шаг\s*)?(\d+)(?:\s*-?\s*й)?(?: шаг)?$|^(?:перейди|иди|открой|давай) (?:на |к )?(?:шаг\s*)?\d+/.test(low)) return "jump";
    if (/сколько (?:еще )?шаг/.test(low)) return "count";
    if (/^(?:стоп|хватит|закончи\S*|выйди из рецепта|отмена рецепта|все спасибо|закрой рецепт|отмени рецепт)$/.test(low)) return "end";
    return null;
  },
  timerFrom(low) {
    const m = low.match(/(?:поставь|запусти|засеки|включи|сделай)?\s*таймер\s+(?:на\s+)?(\S+)\s*(секунд\S*|минут\S*|час\S*)/);
    if (!m) return null;
    const n = /^\d+$/.test(m[1]) ? +m[1] : this.numWords[m[1]];
    if (!n) return null;
    const unit = /час/.test(m[2]) ? 3600 : /секунд/.test(m[2]) ? 1 : 60;
    return { n, unit, sec: n * unit, label: `${n} ${/час/.test(m[2]) ? "час." : /секунд/.test(m[2]) ? "сек." : "мин."}` };
  },
  timer(t) {
    const id = setTimeout(() => { this.timers = this.timers.filter((x) => x !== id); this.say(`Таймер на ${t.label} сработал!`); try { navigator.vibrate?.([300, 150, 300, 150, 300]); } catch { /* */ } }, t.sec * 1000);
    this.timers.push(id);
    return this.say(`Поставил таймер на ${t.label}`);
  },
  async command(raw) {
    const low = this.low(Maks.strip(raw));
    if (!low) return false;
    const tm = this.timerFrom(low);
    if (tm) return this.timer(tm);
    const act = this.control(low);
    if (act) {
      const a = this.active;
      if (act === "next") return this.step(a.i + 1);
      if (act === "repeat") return a.i < 0 ? this.say(this.ingText()) : this.step(a.i);
      if (act === "prev") return a.i <= 0 ? this.say(this.ingText()) : this.step(a.i - 1);
      if (act === "restart") { a.i = -1; this.showSheet(); return this.say(`С начала. ${this.ingText()} Скажите «дальше».`); }
      if (act === "ing") return this.say(this.ingText());
      if (act === "count") return this.say(a.i < 0 ? `Всего ${a.steps.length} шагов.` : `Сейчас шаг ${a.i + 1} из ${a.steps.length}. Осталось ${a.steps.length - a.i - 1}.`);
      if (act === "jump") { const n = +(low.match(/\d+/) || [0])[0]; return n >= 1 && n <= a.steps.length ? this.step(n - 1) : this.say(`В рецепте шагов: ${a.steps.length}.`); }
      if (act === "end") { this.end(); return this.say("Хорошо, рецепт закрыл."); }
    }
    const dish = this.dishFrom(Maks.strip(raw));
    if (dish) { this.start(dish); return true; }
    return false;
  },

  // ───────── Окно рецепта ─────────
  showSheet() {
    const a = this.active; if (!a) return;
    if (this.ui && document.body.contains(this.ui)) {                      // окно уже открыто — только подсветка шага
      [...this.ui.children].forEach((li, i) => { li.className = i === a.i ? "now" : i < a.i ? "done" : ""; });
      this.ui.querySelector("li.now")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const list = h("ol", { class: "cook-steps" }, a.steps.map((s, i) => h("li", { class: i === a.i ? "now" : i < a.i ? "done" : "", onclick: () => this.step(i) }, s)));
    this.ui = list;
    this.closeUi = sheet([
      h("h3", null, "🍳 " + a.title),
      h("p", { class: "sheet-note" }, "Источник: " + a.source + ". Проверяйте время и температуру."),
      h("div", { class: "list-caption" }, "Ингредиенты"),
      h("ul", { class: "cook-ing" }, a.ing.map((x) => h("li", null, x))),
      h("div", { class: "list-caption" }, "Шаги"), list,
      h("div", { style: { display: "flex", gap: "8px", marginTop: "10px" } },
        h("button", { class: "btn small ghost", onclick: () => (this.active && this.active.i > 0 ? this.step(this.active.i - 1) : this.active && this.say(this.ingText())) }, "← Назад"),
        h("button", { class: "btn small ghost", onclick: () => this.active && (this.active.i < 0 ? this.say(this.ingText()) : this.step(this.active.i)) }, "Повторить"),
        h("button", { class: "btn small", onclick: () => this.active && this.step(this.active.i + 1) }, "Дальше →")),
    ], () => { this.ui = null; this.closeUi = null; });
  },
};

(() => {
  const orig = Maks.command.bind(Maks);
  Maks.command = async (raw) => { try { if (await Cook.command(raw)) return true; } catch { /* дальше обычный разбор */ } return orig(raw); };
})();
