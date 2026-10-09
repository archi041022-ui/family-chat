// Ассистент «Семьи»: погода, новости, курсы валют и ответы на вопросы.
// Supabase → Edge Functions → assistant. Вызывается только вошедшими участниками.
// Данные берутся из открытых бесплатных источников без ключей:
//   погода — Open-Meteo, новости — RSS РИА Новости и Lenta.ru, курсы — ЦБ РФ (cbr-xml-daily),
//   ответы — бесплатная нейросеть Pollinations (если она недоступна, ассистент отвечает по данным сам).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Msg = { role: "user" | "assistant"; content: string };

const WMO: Record<number, string> = {
  0: "ясно", 1: "преимущественно ясно", 2: "переменная облачность", 3: "пасмурно", 45: "туман", 48: "изморозь",
  51: "лёгкая морось", 53: "морось", 55: "сильная морось", 61: "небольшой дождь", 63: "дождь", 65: "сильный дождь",
  66: "ледяной дождь", 67: "сильный ледяной дождь", 71: "небольшой снег", 73: "снег", 75: "сильный снег", 77: "снежная крупа",
  80: "ливень", 81: "ливни", 82: "сильные ливни", 85: "снегопад", 86: "сильный снегопад", 95: "гроза", 96: "гроза с градом", 99: "сильная гроза с градом",
};

async function getJSON(url: string, ms = 8000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "FamilyChatAssistant/1.0" } }); if (!r.ok) throw new Error(String(r.status)); return await r.json(); }
  finally { clearTimeout(t); }
}
async function getText(url: string, ms = 8000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "FamilyChatAssistant/1.0" } }); if (!r.ok) throw new Error(String(r.status)); return await r.text(); }
  finally { clearTimeout(t); }
}

// город из вопроса: «погода в Казани», «в Сочи завтра»
function cityFrom(text: string): string | null {
  const m = text.match(/(?:^|[\s,])(?:в|во|по)\s+([А-ЯЁA-Z][а-яёa-z-]+(?:[\s-]+[А-ЯЁ][а-яё-]+)?)/);
  return m ? m[1] : null;
}

async function weather(text: string, lat?: number, lon?: number, cityHint?: string) {
  let place = "";
  const city = cityFrom(text) || cityHint || null;
  if (city) {
    const stem = city.replace(/(е|и|у|ю|ом|ой)$/i, "");
    for (const q of [city, stem]) {
      try {
        const g = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=ru`);
        if (g.results?.length) { lat = g.results[0].latitude; lon = g.results[0].longitude; place = g.results[0].name; break; }
      } catch { /* */ }
    }
  }
  if (lat == null || lon == null) { lat = 55.7558; lon = 37.6173; place = place || "Москва"; }
  const w = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,precipitation` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3&wind_speed_unit=ms`);
  const c = w.current, d = w.daily;
  const days = ["Сегодня", "Завтра", "Послезавтра"].map((n, i) =>
    `${n}: ${WMO[d.weather_code[i]] ?? "—"}, от ${Math.round(d.temperature_2m_min[i])} до ${Math.round(d.temperature_2m_max[i])}°C, вероятность осадков ${d.precipitation_probability_max[i] ?? 0}%`);
  return `Погода${place ? " (" + place + ")" : " (по вашему местоположению)"} сейчас: ${Math.round(c.temperature_2m)}°C, ощущается как ${Math.round(c.apparent_temperature)}°C, ` +
    `${WMO[c.weather_code] ?? ""}, ветер ${Math.round(c.wind_speed_10m)} м/с, влажность ${c.relative_humidity_2m}%.\n${days.join("\n")}`;
}

function rssTitles(xml: string, n: number) {
  const items = [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>[\s\S]*?<\/item>/g)].map((m) => m[1].trim());
  return items.slice(0, n).map((t) => t.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
}
async function news(text: string) {
  const feeds: [string, string][] = /спорт/i.test(text) ? [["https://lenta.ru/rss/news/sport", "Lenta.ru"]]
    : /экономик|финанс|бизнес/i.test(text) ? [["https://lenta.ru/rss/news/economics", "Lenta.ru"]]
    : [["https://ria.ru/export/rss2/archive/index.xml", "РИА Новости"], ["https://lenta.ru/rss/news", "Lenta.ru"]];
  const out: string[] = [];
  for (const [url, name] of feeds) {
    try { const titles = rssTitles(await getText(url), 7); if (titles.length) out.push(`${name}:\n- ` + titles.join("\n- ")); } catch { /* */ }
  }
  return out.length ? "Свежие заголовки новостей:\n" + out.join("\n") : "";
}

async function rates() {
  const j = await getJSON("https://www.cbr-xml-daily.ru/daily_json.js");
  const v = j.Valute;
  const f = (k: string) => v[k] ? `${k}: ${v[k].Value.toFixed(2)} ₽ (${v[k].Value >= v[k].Previous ? "+" : ""}${(v[k].Value - v[k].Previous).toFixed(2)})` : "";
  return `Курсы ЦБ РФ на ${new Date(j.Date).toLocaleDateString("ru-RU")}: ` + ["USD", "EUR", "CNY"].map(f).filter(Boolean).join(", ");
}

async function askLLM(messages: Msg[], context: string, name: string) {
  const now = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "full", timeStyle: "short" });
  const system = `Ты — дружелюбный голосовой помощник семейного мессенджера «Семья». Собеседника зовут ${name || "друг"}. ` +
    `Сейчас ${now} (Москва). Отвечай по-русски, коротко и по делу (2–5 предложений), без markdown-разметки, потому что ответ может зачитываться вслух. ` +
    `Если ниже даны свежие данные (погода, новости, курсы), опирайся только на них и не выдумывай. Если данных нет, а вопрос про свежие события — честно скажи, что не знаешь точно.` +
    (context ? `\n\nСвежие данные из интернета:\n${context}` : "");
  const body = { model: "openai", messages: [{ role: "system", content: system }, ...messages.slice(-10)], private: true };
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch("https://text.pollinations.ai/openai", {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", "User-Agent": "FamilyChatAssistant/1.0" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("llm " + r.status);
    const j = await r.json();
    const txt = j.choices?.[0]?.message?.content?.trim();
    if (!txt) throw new Error("empty");
    return txt.replace(/\*\*/g, "").replace(/^#+\s*/gm, "");
  } finally { clearTimeout(t); }
}

// Пускаем только вошедших участников семьи (а не любого, у кого есть публичный ключ)
// Подпись токена проверяет сервер Supabase (getUser), а не мы «на глаз» — подделать нельзя.
import { createClient } from "jsr:@supabase/supabase-js@2";
const authSb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
async function isMember(req: Request) {
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data } = await authSb.auth.getUser(token);
    return !!data?.user;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await isMember(req))) return new Response(JSON.stringify({ error: "Нужно войти в приложение" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    const { messages = [], lat, lon, city, name } = await req.json();
    const last: string = (messages.at(-1)?.content || "").slice(0, 1000);
    const low = last.toLowerCase();
    const parts: string[] = [];
    const tasks: Promise<void>[] = [];
    if (/погод|температур|градус|дожд|снег|ветер|прогноз|холодно|тепло|зонт|одеться/.test(low))
      tasks.push(weather(last, lat, lon, city).then((t) => { parts.push(t); }).catch(() => {}));
    if (/новост|что происходит|что случилось|событи|в мире|в стране|сводк/.test(low))
      tasks.push(news(low).then((t) => { if (t) parts.push(t); }).catch(() => {}));
    if (/курс|доллар|евро|юан|валют|рубл/.test(low))
      tasks.push(rates().then((t) => { parts.push(t); }).catch(() => {}));
    await Promise.all(tasks);
    const context = parts.join("\n\n");
    let reply: string, source = "llm", detail = "";
    try {
      reply = await askLLM(messages.slice(-10).map((m: Msg) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 2000) })), context, name);
    } catch (e) {
      source = "data"; detail = String(e).slice(0, 200);
      reply = context || "Сейчас не получается связаться с нейросетью. Я могу подсказать погоду, новости и курсы валют — спросите, например: «Какая погода завтра?»";
    }
    return new Response(JSON.stringify({ reply, source, detail }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
