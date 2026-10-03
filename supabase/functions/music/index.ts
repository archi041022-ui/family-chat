// Музыка для видеоредактора «Семьи»: поиск свободной музыки (лицензии Creative Commons) и скачивание.
// Supabase → Edge Functions → music. Источники: Openverse (Jamendo, ccMixter, Wikimedia), запасной — Internet Archive.
//   { action: "search", q, page }  → { items: [{ id, title, artist, duration, license, source, url }] }
//   { action: "get", url }         → сам аудиофайл (только с разрешённых сайтов, до 20 МБ)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const UA = { "User-Agent": "FamilyChatMusic/1.0 (family messenger video editor)" };
const MAX = 20 * 1024 * 1024;
const PART = 3 * 1024 * 1024;        // для ролика до минуты хватает начала трека (2–4 минуты музыки)
const ALLOWED = [/(^|\.)jamendo\.com$/, /(^|\.)ccmixter\.org$/, /(^|\.)wikimedia\.org$/, /(^|\.)archive\.org$/, /(^|\.)freesound\.org$/];

type Item = { id: string; title: string; artist: string; duration: number; license: string; source: string; url: string };

async function getJSON(url: string, ms = 9000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { ...UA, Accept: "application/json" } }); if (!r.ok) throw new Error(String(r.status)); return await r.json(); }
  finally { clearTimeout(t); }
}

async function openverse(q: string, page: number): Promise<Item[]> {
  const u = new URL("https://api.openverse.org/v1/audio/");
  u.searchParams.set("q", q || "music"); u.searchParams.set("page", String(page)); u.searchParams.set("page_size", "20");
  u.searchParams.set("source", "jamendo,ccmixter,wikimedia_audio"); u.searchParams.set("mature", "false");
  const j = await getJSON(u.toString());
  return (j.results || []).filter((x: any) => x.url).map((x: any) => {
    let d = Number(x.duration) || 0; if (d > 3600) d = Math.round(d / 1000);       // в Openverse длительность в миллисекундах
    return { id: "ov:" + x.id, title: x.title || "Без названия", artist: x.creator || "", duration: d,
      license: `CC ${String(x.license || "").toUpperCase()} ${x.license_version || ""}`.trim(), source: x.source || "openverse",
      url: String(x.url).replace("format=mp32", "format=mp31") };      // Jamendo: лёгкое качество — быстрее скачивается
  }).filter((x: Item) => !x.duration || (x.duration >= 15 && x.duration <= 900));
}

async function archive(q: string, page: number): Promise<Item[]> {
  const query = `collection:(netlabels OR opensource_audio) AND mediatype:audio AND (${q ? `subject:(${q}) OR title:(${q})` : "music"})`;
  const u = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&rows=20&page=${page}&output=json`;
  const j = await getJSON(u);
  return (j.response?.docs || []).map((d: any) => ({ id: "ia:" + d.identifier, title: [].concat(d.title || "Без названия")[0], artist: [].concat(d.creator || "")[0],
    duration: 0, license: d.licenseurl ? "CC (" + String(d.licenseurl).replace(/^https?:\/\/creativecommons.org\/licenses\//, "").replace(/\/$/, "") + ")" : "Internet Archive",
    source: "archive.org", url: "ia:" + d.identifier }));
}

// элемент Internet Archive: выбираем первый mp3/ogg разумного размера
async function resolveArchive(id: string): Promise<string | null> {
  const j = await getJSON(`https://archive.org/metadata/${encodeURIComponent(id)}`);
  const f = (j.files || []).find((f: any) => /\.(mp3|ogg)$/i.test(f.name) && Number(f.size || 0) < MAX && Number(f.size || 0) > 50000);
  return f ? `https://archive.org/download/${encodeURIComponent(id)}/${f.name.split("/").map(encodeURIComponent).join("/")}` : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "search") {
      const q = String(body.q || "").slice(0, 80).replace(/[^\p{L}\p{N} \-]/gu, " ").trim();
      const page = Math.max(1, Math.min(10, Number(body.page) || 1));
      let items: Item[] = [], from = "openverse";
      try { items = await openverse(q, page); } catch { items = []; }
      if (!items.length) { from = "archive"; try { items = await archive(q, page); } catch { items = []; } }
      return json({ items, from });
    }
    if (body.action === "get") {
      let url = String(body.url || "");
      if (url.startsWith("ia:")) url = (await resolveArchive(url.slice(3))) || "";
      let host = ""; try { host = new URL(url).hostname; } catch { /* */ }
      if (!host || !ALLOWED.some((re) => re.test(host))) return json({ error: "BAD_URL" }, 400);
      if (/jamendo\.com$/.test(host)) url = url.replace("format=mp32", "format=mp31");
      const r = await fetch(url, { headers: { ...UA, Range: `bytes=0-${PART - 1}` }, redirect: "follow" });
      const fin = new URL(r.url).hostname;
      if (!r.ok || !ALLOWED.some((re) => re.test(fin))) return json({ error: "FETCH_" + r.status }, 502);
      // читаем не больше PART (если сайт не поддерживает Range — обрезаем сами; mp3/ogg проигрываются и с обрезанным концом)
      const reader = r.body!.getReader(); const parts: Uint8Array[] = []; let got = 0;
      while (got < PART) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; }
      try { await reader.cancel(); } catch { /* */ }
      const buf = new Uint8Array(Math.min(got, PART)); let off = 0;
      for (const p of parts) { const n = Math.min(p.length, buf.length - off); buf.set(p.subarray(0, n), off); off += n; if (off >= buf.length) break; }
      const type = (r.headers.get("content-type") || "").startsWith("audio/") ? r.headers.get("content-type")! : (/\.ogg/i.test(url) ? "audio/ogg" : "audio/mpeg");
      return new Response(buf, { headers: { ...CORS, "Content-Type": "application/octet-stream", "X-Audio-Type": type, "Access-Control-Expose-Headers": "X-Audio-Type" } });
    }
    return json({ error: "BAD_ACTION" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
