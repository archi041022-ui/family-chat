// Мгновенные оповещения «Семьи»: сигнал «проснись» на телефоны через Firebase Cloud Messaging.
// Supabase → Edge Functions → push. Текст сообщений через Google не передаётся —
// телефон, проснувшись, сам забирает оповещения с сервера семьи.
// Вызывается: 1) базой при новых оповещениях (заголовок x-push-secret);
//             2) администратором из приложения — «Проверить» (только на свои телефоны).

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

type SA = { client_email: string; private_key: string; project_id: string };
let cached: { email: string; token: string; exp: number } | null = null;

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function googleToken(sa: SA): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.email === sa.client_email && cached.exp > now + 120) return cached.token;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("Google: " + (j.error_description || j.error || r.status));
  cached = { email: sa.client_email, token: j.access_token, exp: now + (j.expires_in || 3600) };
  return j.access_token;
}

async function config() {
  const { data } = await sb.from("app_config").select("key,value").in("key", ["push_hook_secret", "fcm_service_account"]);
  const m = new Map((data || []).map((r: { key: string; value: string }) => [r.key, r.value]));
  return { secret: m.get("push_hook_secret") || "", sa: m.get("fcm_service_account") ? JSON.parse(m.get("fcm_service_account")!) as SA : null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const cfg = await config();
    let users: string[] = [];
    let data: Record<string, string> = { type: "wake" };
    const hook = req.headers.get("x-push-secret");
    if (hook && cfg.secret && hook === cfg.secret) {
      users = Array.isArray(body.users) ? body.users.slice(0, 500).map(String) : [];
      if (body.call) data = { type: "call" };
    } else {
      // проверка из приложения: только на телефоны самого пользователя
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = await sb.auth.getUser(jwt);
      if (!u?.user) return json({ ok: false, reason: "NO_AUTH" }, 401);
      users = [u.user.id];
      data = { type: "test" };
    }
    if (!cfg.sa) return json({ ok: false, reason: "NOT_CONFIGURED" });
    if (!users.length) return json({ ok: true, sent: 0 });

    const { data: devs } = await sb.from("push_devices").select("key_hash,fcm_token").in("user_id", users).not("fcm_token", "is", null);
    if (!devs?.length) return json({ ok: true, sent: 0, reason: "NO_DEVICES" });
    const token = await googleToken(cfg.sa);
    let sent = 0, failed = 0; const errors: string[] = [];
    await Promise.all(devs.map(async (d: { key_hash: string; fcm_token: string }) => {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${cfg.sa!.project_id}/messages:send`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token: d.fcm_token, data, android: { priority: "HIGH", ttl: data.type === "call" ? "60s" : "86400s" } } }),
      });
      if (r.ok) { sent++; return; }
      failed++;
      const t = await r.text();
      errors.push(`${r.status}: ${t.slice(0, 200)}`);
      // телефон удалил приложение или сменил адрес — забываем адрес
      if (r.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(t)) {
        await sb.from("push_devices").update({ fcm_token: null }).eq("key_hash", d.key_hash);
      }
    }));
    return json({ ok: failed === 0, sent, failed, errors: errors.slice(0, 3) });
  } catch (e) {
    return json({ ok: false, reason: String((e as Error)?.message || e) }, 500);
  }
});
