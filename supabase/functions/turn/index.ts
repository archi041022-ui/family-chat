// Сервер звонков для «Семьи»: выдаёт короткоживущие данные Cloudflare Realtime TURN.
//   POST {} → { iceServers: [...] }  (пусто, если администратор ещё не подключил Cloudflare)
// Ключ Cloudflare хранится в app_config и клиентам не отдаётся; доступ — только вошедшим в приложение.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

let cache: { at: number; id: string; ice: unknown } | null = null;
const TTL = 12 * 3600;            // данные действуют 12 часов
const KEEP = 6 * 3600 * 1000;     // а у себя держим 6 часов

async function cfg(key: string): Promise<string> {
  const { data } = await sb.from("app_config").select("value").eq("key", key).maybeSingle();
  return data?.value || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u?.user) return json({ error: "auth" }, 401);
    const id = await cfg("cf_turn_id"), token = await cfg("cf_turn_token");
    if (!id || !token) return json({ iceServers: [] });
    if (cache && cache.id === id && Date.now() - cache.at < KEEP) return json({ iceServers: cache.ice });
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate-ice-servers`, {
        method: "POST", signal: ctl.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: TTL }),
      });
      if (!r.ok) return json({ iceServers: [], error: "cloudflare " + r.status });
      const j = await r.json();
      const ice = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
      cache = { at: Date.now(), id, ice };
      return json({ iceServers: ice });
    } finally { clearTimeout(t); }
  } catch (e) {
    return json({ iceServers: [], error: String((e as Error)?.message || e) });
  }
});
