/* Подарки (как в Telegram): анимированные подарки за звёзды, подпись, «скрыть моё имя», лимитированные,
   витрина в профиле (скрыть, закрепить, обменять на звёзды), ежедневный бонус. Проверки — на сервере. */
"use strict";

const Gifts = {
  home: null,
  anim(emoji) { return Emoji.anim(emoji); },
  icon(emoji, size = 56, cls = "") {
    const img = h("img", { class: `gift-img ${cls}`, src: this.anim(emoji), alt: emoji, width: size, height: size, draggable: false });
    img.onerror = () => img.replaceWith(h("span", { class: `gift-emo ${cls}`, style: { fontSize: size * 0.8 + "px" } }, emoji));
    return img;
  },
  async load() {
    const { data, error } = await S.sb.rpc("gifts_home");
    if (error || !data) { toast("Подарки сейчас недоступны"); return null; }
    this.home = data; return data;
  },

  // ── главный экран «Подарки»
  async open() {
    const d = await this.load(); if (!d) return;
    let close;
    const box = h("div");
    const draw = async () => {
      const mine = (await S.sb.rpc("gifts_of", { uid: S.me.id })).data || [];
      box.innerHTML = "";
      box.append(
        h("div", { class: "gift-wallet" }, h("div", null, h("b", null, `⭐ ${this.home.balance}`), h("small", null, "ваши звёзды")),
          this.home.bonus ? h("button", { class: "btn small", onclick: async () => {
            const { data: b } = await S.sb.rpc("claim_bonus");
            if (b != null && b >= 0) { this.home.balance = b; this.home.bonus = false; toast("⭐ +20 звёзд — ежедневный бонус"); Effects.play("stars"); draw(); }
          } }, "+20 ⭐ бонус дня") : h("small", { class: "gift-bonus-done" }, "бонус дня получен ✓")),
        h("button", { class: "btn wide", onclick: () => this.pickPerson() }, "🎁 Подарить подарок"),
        h("div", { class: "set-cap" }, `Мои подарки · ${mine.length}`),
        mine.length ? h("div", { class: "gift-grid" }, mine.map((g) => this.cell(g, () => this.detail(g, S.me.id, draw))))
          : h("p", { class: "sheet-note" }, "Пока подарков нет. Подарки от родных появятся здесь и в вашем профиле."),
        h("p", { class: "sheet-note" }, "Звёзды: 100 при старте и +20 каждый день. Полученный подарок можно обменять на 80% его цены. Кто может дарить и видеть подарки — в «Конфиденциальности»."));
    };
    close = sheet([h("h3", null, "🎁 Подарки"), box]);
    draw();
  },
  cell(g, onclick) {
    return h("button", { class: `gift-cell${g.hidden ? " hidden-gift" : ""}${g.pinned ? " pinned" : ""}`, onclick },
      this.icon(g.emoji, 54, "float"), h("small", null, g.anonymous && !g.from_name ? "Тайный даритель" : (g.from_name || "Тайный даритель")),
      g.limited ? h("i", { class: "gift-ltd" }, "лимит") : null, g.pinned ? h("i", { class: "gift-pin" }, "📌") : null);
  },
  detail(g, owner, after) {
    let close;
    const mine = owner === S.me.id;
    close = sheet([
      h("div", { class: "gift-detail" }, this.icon(g.emoji, 120, "float big"), h("h3", null, g.name),
        h("small", null, (g.from_name ? `от ${g.from_name}` : "от тайного дарителя") + " · " + new Date(g.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })),
        g.message ? h("p", { class: "gift-msg" }, `«${g.message}»`) : null,
        h("small", { class: "gift-price" }, `${g.price} ⭐${g.limited ? " · лимитированный" : ""}`)),
      mine ? h("button", { class: "menu-item", onclick: async () => { await S.sb.rpc("gift_update", { gid: g.id, hide: !g.hidden, pin: null }); close(); after?.(); } },
        h("span", null, g.hidden ? "👁" : "🙈"), g.hidden ? "Показывать в профиле" : "Скрыть из профиля") : null,
      mine ? h("button", { class: "menu-item", onclick: async () => { await S.sb.rpc("gift_update", { gid: g.id, hide: null, pin: !g.pinned }); close(); after?.(); } },
        h("span", null, "📌"), g.pinned ? "Открепить" : "Закрепить первым") : null,
      mine ? h("button", { class: "menu-item", onclick: async () => {
        let c2;
        c2 = sheet([h("h3", null, "Обменять на звёзды?"), h("p", { class: "sheet-note" }, `Подарок исчезнет из профиля, а вы получите ${g.convert} ⭐.`),
          h("button", { class: "btn wide", onclick: async () => {
            const { data: b } = await S.sb.rpc("gift_convert", { gid: g.id });
            c2(); close();
            if (b != null && b >= 0) { if (this.home) this.home.balance = b; toast(`⭐ +${g.convert} звёзд`); after?.(); } else toast("Не удалось обменять");
          } }, `Обменять на ${g.convert} ⭐`)]);
      } }, h("span", null, "⭐"), `Обменять на ${g.convert} ⭐`) : null,
      g.from && g.from !== S.me.id && mine ? h("button", { class: "menu-item", onclick: () => { close(); this.compose(g.from); } }, h("span", null, "🎁"), "Подарить в ответ") : null,
    ]);
  },
  pickPerson() {
    let close;
    const people = [...S.profiles.values()].filter((p) => p.id !== S.me.id && !p.banned).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    close = sheet([h("h3", null, "Кому подарить?"),
      ...people.map((p) => {
        const ok = Privacy.can(p.id, "gifts");
        return h("button", { class: `menu-item${ok ? "" : " disabled"}`, onclick: () => { if (!ok) return toast(`${p.name} ограничил(а) получение подарков`); close(); this.compose(p.id); } },
          avatarEl(p.id, "sm"), h("span", null, p.name, ok ? null : h("small", { class: "sub" }, "не принимает подарки")));
      }),
      people.length ? null : h("p", { class: "sheet-note" }, "В семье пока никого нет")]);
  },
  // каталог и отправка
  async compose(to) {
    if (!this.home) { if (!(await this.load())) return; }
    const p = S.profiles.get(to);
    let close, pick = null;
    const msg = h("input", { class: "gift-msg-in", maxlength: 200, placeholder: "Подпись к подарку (необязательно)" });
    const anon = h("input", { type: "checkbox" });
    const send = h("button", { class: "btn wide", disabled: true }, "Выберите подарок");
    const cats = [...new Set(this.home.catalog.map((g) => g.category))];
    const grid = h("div", { class: "gift-catalog" }, cats.map((c) => [h("div", { class: "set-cap" }, c),
      h("div", { class: "gift-grid" }, this.home.catalog.filter((g) => g.category === c).map((g) => {
        const sold = g.left === 0;
        const b = h("button", { class: `gift-cell${sold ? " sold" : ""}`, onclick: () => {
          if (sold) return toast("Этот подарок закончился");
          pick = g; grid.querySelectorAll(".gift-cell").forEach((x) => x.classList.toggle("on", x === b));
          const can = this.home.balance >= g.price;
          send.disabled = !can; send.textContent = can ? `Подарить «${g.name}» за ${g.price} ⭐` : `Не хватает звёзд (${this.home.balance} из ${g.price})`;
        } }, this.icon(g.emoji, 48, "float"), h("small", null, g.name), h("b", { class: "gift-cost" }, `${g.price} ⭐`),
          g.total ? h("i", { class: "gift-ltd" }, sold ? "закончился" : `осталось ${g.left} из ${g.total}`) : null);
        return b;
      }))]).flat());
    send.onclick = async () => {
      if (!pick) return;
      send.disabled = true;
      const { data } = await S.sb.rpc("send_gift", { target: to, gift: pick.id, msg: msg.value.trim() || null, anon: anon.checked });
      const text = { OK: null, NO_STARS: "Не хватает звёзд", SOLD_OUT: "Этот подарок только что закончился", PRIVACY: `${p?.name || "Пользователь"} не принимает подарки`, NO_USER: "Пользователь не найден" }[data];
      if (data !== "OK") { toast(text || "Не удалось подарить"); send.disabled = false; return; }
      this.home.balance -= pick.price; if (pick.left != null) pick.left--;
      close(); this.celebrate(pick.emoji, `Вы подарили «${pick.name}» — ${p?.name || ""}`);
    };
    close = sheet([h("h3", null, `Подарок для ${p?.name || ""}`), h("small", { class: "sheet-note" }, `У вас ⭐ ${this.home.balance}`), grid, msg,
      h("label", { class: "toggle-row" }, anon, h("span", null, "Скрыть моё имя", h("small", null, "Ваше имя увидит только получатель"))), send]);
  },
  celebrate(emoji, text) {
    const ov = h("div", { class: "gift-reveal" }, h("div", { class: "gift-rays" }), this.icon(emoji, 180, "pop"), h("b", null, text));
    ov.onclick = () => ov.remove();
    document.body.append(ov);
    try { Effects.play("confetti"); } catch { /* */ }
    setTimeout(() => ov.remove(), 3200);
  },
  // пришёл подарок — красивое уведомление в приложении
  async onNew(row) {
    if (!row || row.to_user !== S.me?.id) return;
    if (!this.home) await this.load();
    const t = (this.home?.catalog || []).find((g) => g.id === row.gift_id);
    const from = row.anonymous ? "Тайный даритель" : (S.profiles.get(row.from_user)?.name || "Кто-то");
    const emoji = t?.emoji || "🎁";
    if (appVisible()) this.celebrate(emoji, `${from} дарит вам ${t ? "«" + t.name + "»" : "подарок"}!`);
  },
  // витрина подарков в профиле человека
  async section(uid) {
    const box = h("div", { class: "pv-gifts" });
    const { data } = await S.sb.rpc("gifts_of", { uid });
    const list = data || [];
    if (list.length) box.append(h("div", { class: "set-cap" }, `Подарки · ${list.length}`),
      h("div", { class: "gift-grid" }, list.slice(0, 12).map((g) => this.cell(g, () => this.detail(g, uid)))));
    return box;
  },
};
