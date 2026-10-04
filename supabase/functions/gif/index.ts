// GIF для «Семьи»: поиск готовых анимаций и скачивание.  Supabase → Edge Functions → gif
//   { action: "search", q?, page? } → { items: [{ id, title, preview, url, w, h, source }], from }
//   { action: "get", url }          → сам файл (только с разрешённых сайтов, до 8 МБ)
// Источники: GIPHY (если администратор вставил бесплатный ключ в приложении — настоящие «живые» реакции),
// иначе — свободные GIF (Openverse: Wikimedia, Flickr и др.). Доступ — только вошедшим в приложение.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const UA = { "User-Agent": "FamilyChatGif/1.0 (family messenger)" };
const MAX = 8 * 1024 * 1024;
const ALLOWED = [/(^|\.)giphy\.com$/, /(^|\.)wikimedia\.org$/, /(^|\.)staticflickr\.com$/, /(^|\.)flickr\.com$/, /(^|\.)tenor\.com$/, /(^|\.)archive\.org$/, /(^|\.)openverse\.org$/];
const okHost = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" && ALLOWED.some((re) => re.test(x.hostname)); } catch { return false; } };

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

type Item = { id: string; title: string; preview: string; url: string; w: number; h: number; source: string };

async function getJSON(url: string, ms = 9000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { ...UA, Accept: "application/json" } }); if (!r.ok) throw new Error(String(r.status)); return await r.json(); }
  finally { clearTimeout(t); }
}

async function giphy(key: string, q: string, page: number): Promise<Item[]> {
  const u = new URL(q ? "https://api.giphy.com/v1/gifs/search" : "https://api.giphy.com/v1/gifs/trending");
  u.searchParams.set("api_key", key); u.searchParams.set("limit", "24"); u.searchParams.set("offset", String((page - 1) * 24));
  u.searchParams.set("rating", "g"); u.searchParams.set("lang", "ru"); if (q) u.searchParams.set("q", q);
  const j = await getJSON(u.toString());
  return (j.data || []).map((g: any) => {
    const im = g.images || {};
    const small = im.fixed_width_small || im.fixed_width || im.downsized || {};
    const full = im.downsized_medium || im.downsized || im.fixed_height || im.original || {};
    return { id: "gp:" + g.id, title: g.title || "", preview: small.url, url: full.url, w: +full.width || 0, h: +full.height || 0, source: "GIPHY" };
  }).filter((x: Item) => x.preview && x.url && Number((j.data || []).find((g: any) => "gp:" + g.id === x.id)?.images?.downsized_medium?.size || 0) < MAX);
}

async function openverse(q: string, page: number): Promise<Item[]> {
  const u = new URL("https://api.openverse.org/v1/images/");
  u.searchParams.set("q", q || "funny"); u.searchParams.set("extension", "gif"); u.searchParams.set("page", String(page));
  u.searchParams.set("page_size", "24"); u.searchParams.set("mature", "false"); u.searchParams.set("source", "wikimedia,flickr");
  const j = await getJSON(u.toString());
  return (j.results || []).filter((x: any) => x.url && okHost(x.url) && (!x.filesize || Number(x.filesize) < MAX)).map((x: any) => ({
    id: "ov:" + x.id, title: x.title || "", preview: x.thumbnail || x.url, url: x.url, w: +x.width || 0, h: +x.height || 0, source: "Openverse · " + (x.source || ""),
  }));
}

async function cfg(key: string): Promise<string> {
  const { data } = await sb.from("app_config").select("value").eq("key", key).maybeSingle();
  return data?.value || "";
}

// скачиваем по цепочке перенаправлений, проверяя каждый переход (чтобы нельзя было уйти на внутренний адрес)
async function fetchSafe(url: string): Promise<Response | null> {
  for (let i = 0; i < 4; i++) {
    if (!okHost(url)) return null;
    const r = await fetch(url, { headers: UA, redirect: "manual" });
    if (r.status >= 300 && r.status < 400) { const loc = r.headers.get("location"); if (!loc) return null; url = new URL(loc, url).toString(); continue; }
    return r;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u?.user) return json({ error: "NO_AUTH" }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.action === "search") {
      const q = String(body.q || "").slice(0, 60).replace(/[^\p{L}\p{N} \-]/gu, " ").trim();
      const page = Math.max(1, Math.min(10, Number(body.page) || 1));
      const key = await cfg("giphy_key");
      let items: Item[] = [], from = "openverse";
      if (key) { try { items = await giphy(key, q, page); from = "giphy"; } catch { items = []; } }
      if (!items.length) { from = "openverse"; try { items = await openverse(q, page); } catch { items = []; } }
      return json({ items, from, giphy: !!key });
    }
    if (body.action === "get") {
      const r = await fetchSafe(String(body.url || ""));
      if (!r || !r.ok) return json({ error: "FETCH_" + (r?.status ?? "BAD") }, 502);
      const len = Number(r.headers.get("content-length") || 0);
      if (len > MAX) return json({ error: "TOO_BIG" }, 413);
      const reader = r.body!.getReader(); const parts: Uint8Array[] = []; let got = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; got += value.length; if (got > MAX) { try { await reader.cancel(); } catch { /* */ } return json({ error: "TOO_BIG" }, 413); } parts.push(value); }
      const buf = new Uint8Array(got); let off = 0; for (const p of parts) { buf.set(p, off); off += p.length; }
      const ct = r.headers.get("content-type") || "image/gif";
      return new Response(buf, { headers: { ...CORS, "Content-Type": "application/octet-stream", "X-Gif-Type": /^image\//.test(ct) ? ct : "image/gif", "Access-Control-Expose-Headers": "X-Gif-Type" } });
    }
    return json({ error: "BAD_ACTION" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
