/* Общие настройки сайта и вызовы базы (Supabase). Ключ anon публичный: доступ к данным закрыт правилами в базе. */
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const KP = {
  SB: "https://roqpbkwpuvlavmiscoxs.supabase.co",
  KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvcXBia3dwdXZsYXZtaXNjb3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MDI4MjIsImV4cCI6MjEwNjQ3ODgyMn0.Uqpg7hmm7OWuTv1xMYp6Zw80RjI0BG9wPF8Ivav1LAw",
  /* Данные мастерской: замените на свои. Координаты нужны для карты и маршрута. */
  shop: {
    mail: "zakaz@kirprof.example",
    phone: "+7 (000) 000-00-00",
    addr: "г. Москва, ул. Мастерская, 1 (пример)",
    hours: "Пн–Сб, 9:00–19:00",
    lat: 55.7558, lon: 37.6176,
    demo: true,
  },
  tab: null,
  hooks: {},
  onTab(name, fn) { (this.hooks[name] = this.hooks[name] || []).push(fn); },
  fmt: n => Math.round(n).toLocaleString("ru-RU") + " ₽",
};
async function rpc(fn, args) {
  const r = await fetch(KP.SB + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: { apikey: KP.KEY, Authorization: "Bearer " + KP.KEY, "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* не JSON */ }
  if (!r.ok) { const e = new Error("rpc"); e.code = (j && j.message) || "http"; throw e; }
  return j;
}
/* Секретный код отзыва (этот браузер) и сессия личного кабинета */
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* без хранилища */ } return null; }
KP.sess = store("kp_sess") || "";
