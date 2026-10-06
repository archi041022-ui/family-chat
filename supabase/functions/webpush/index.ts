// Оповещения для iPhone и браузеров (Web Push) для «Семьи».
// Supabase → Edge Functions → webpush. Текст оповещения шифруется ключом самого устройства
// (RFC 8291), поэтому Apple и Google его прочитать не могут.
//   POST {action:"key"}  (вошедший)  → { key }  открытый ключ для подписки (создаётся при первом обращении)
//   POST {action:"test"} (вошедший)  → отправляет пробное оповещение на устройства этого пользователя
//   POST {items:[{u,t,b,k,c}]}       (заголовок x-push-secret, вызывает база) → рассылка

import { createClient } from "jsr:@supabase/supabase-js@2";

// ==CRYPTO==
const b64u = (data: ArrayBuffer | Uint8Array | string): string => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (s: string): Uint8Array => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
};
const cat = (...a: Uint8Array[]): Uint8Array => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}

/** Шифрование полезной нагрузки для подписки: формат aes128gcm (RFC 8188 + RFC 8291). */
async function encryptPayload(p256dh: string, authKey: string, payload: Uint8Array,
  fixed?: { salt?: Uint8Array; eph?: CryptoKeyPair }): Promise<Uint8Array> {
  const ua = unb64u(p256dh), auth = unb64u(authKey);
  if (ua.length !== 65 || ua[0] !== 4 || auth.length !== 16) throw new Error("BAD_SUB_KEYS");
  const eph = fixed?.eph || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const enc = new TextEncoder();
  const ikm = await hkdf(auth, ecdh, cat(enc.encode("WebPush: info\0"), ua, asPub), 32);
  const salt = fixed?.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  if (payload.length > 3800) throw new Error("PAYLOAD_TOO_BIG");
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, cat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 0x10, 0]);                         // размер записи 4096
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

/** Подпись VAPID (RFC 8292): ES256 JWT для адреса службы push. */
async function vapidHeader(endpoint: string, pubB64: string, privJwk: JsonWebKey, sub: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claim = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub }));
  const key = await crypto.subtle.importKey("jwk", privJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${claim}`)));
  return `vapid t=${head}.${claim}.${b64u(sig)}, k=${pubB64}`;
}
// ==/CRYPTO==

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const SUB = "https://archi041022-ui.github.io/family-chat/";
const HOSTS = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;

let sb: ReturnType<typeof createClient>;
let vapid: { pub: string; jwk: JsonWebKey } | null = null;

/** Ключи VAPID создаются один раз и живут только в app_config (клиентам отдаётся лишь открытая часть). */
async function keys() {
  if (vapid) return vapid;
  const read = async () => {
    const { data } = await sb.from("app_config").select("key,value").in("key", ["vapid_public", "vapid_jwk"]);
    const m = new Map((data || []).map((r: { key: string; value: string }) => [r.key, r.value]));
    return m.get("vapid_public") && m.get("vapid_jwk") ? { pub: m.get("vapid_public")!, jwk: JSON.parse(m.get("vapid_jwk")!) as JsonWebKey } : null;
  };
  let k = await read();
  if (!k) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
    await sb.from("app_config").upsert([{ key: "vapid_public", value: b64u(raw) }, { key: "vapid_jwk", value: JSON.stringify(jwk) }], { onConflict: "key", ignoreDuplicates: true });
    k = await read();            // при одновременном создании побеждает первая запись
  }
  if (!k) throw new Error("VAPID_INIT");
  vapid = k;
  return k;
}

type Item = { u: string; t?: string; b?: string; k?: string; c?: string };

async function deliver(items: Item[]) {
  const users = [...new Set(items.map((i) => i.u))];
  const { data: subs } = await sb.from("web_push_subs").select("endpoint,user_id,p256dh,auth_key").in("user_id", users);
  if (!subs?.length) return { sent: 0, failed: 0, gone: 0 };
  const k = await keys();
  let sent = 0, failed = 0, gone = 0;
  const jobs: Promise<void>[] = [];
  for (const it of items) {
    const body = new TextEncoder().encode(JSON.stringify({ t: it.t || "Семья", b: it.b || "", k: it.k || "", c: it.c || "" }));
    for (const s of subs.filter((x: { user_id: string }) => x.user_id === it.u)) {
      jobs.push((async () => {
        try {
          if (!HOSTS.test(s.endpoint)) { failed++; return; }
          const data = await encryptPayload(s.p256dh, s.auth_key, body);
          const call = it.k === "call";
          const r = await fetch(s.endpoint, {
            method: "POST",
            headers: {
              Authorization: await vapidHeader(s.endpoint, k.pub, k.jwk, SUB),
              "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
              TTL: call ? "60" : "86400", Urgency: call ? "high" : "normal",
            },
            body: data,
          });
          if (r.ok) { sent++; return; }
          if (r.status === 404 || r.status === 410) { gone++; await sb.from("web_push_subs").delete().eq("endpoint", s.endpoint); return; }
          failed++;
        } catch { failed++; }
      })());
    }
  }
  await Promise.all(jobs);
  return { sent, failed, gone };
}

if (typeof Deno !== "undefined" && Deno.serve) {
  sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    try {
      const body = await req.json().catch(() => ({}));
      const hook = req.headers.get("x-push-secret");
      if (hook) {
        const { data } = await sb.from("app_config").select("value").eq("key", "push_hook_secret").maybeSingle();
        if (!data?.value || data.value !== hook) return json({ error: "auth" }, 401);
        const items: Item[] = Array.isArray(body.items) ? body.items.slice(0, 200).filter((i: Item) => i && typeof i.u === "string") : [];
        return json({ ok: true, ...(await deliver(items)) });
      }
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = await sb.auth.getUser(jwt);
      if (!u?.user) return json({ error: "auth" }, 401);
      if (body.action === "key") return json({ key: (await keys()).pub });
      if (body.action === "test") {
        const r = await deliver([{ u: u.user.id, t: "Семья", b: "Оповещения работают ✅", k: "test" }]);
        return json({ ok: r.sent > 0, ...r });
      }
      return json({ error: "bad_request" }, 400);
    } catch (e) {
      return json({ ok: false, reason: String((e as Error)?.message || e) }, 500);
    }
  });
}
