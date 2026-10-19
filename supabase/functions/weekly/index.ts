// Supabase Edge Function "weekly": Wochenbericht als Web-Push aufs Handy (Sonntag 18 Uhr per Cron, siehe supabase/push.sql).
// Die Push-Abos (push_subs) legt die App selbst an; der private VAPID-Schlüssel liegt nur hier als Secret.
//
// Deploy: supabase secrets set --env-file supabase/.env.push     (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, WEEKLY_CRON_SECRET)
//         supabase functions deploy weekly --no-verify-jwt
//
// Body: {action: "send-all"} + x-cron-secret → {sent, gone, failed}   (alle Abos)
//       {action: "test"} (angemeldet)       → {sent}                   (nur eigene Geräte, sofort)
//       {action: "subscribe"} (angemeldet)  → {ok}
//       sub: {endpoint, p256dh, auth} (optional bei test/subscribe) ordnet das Abo dieses Geräts dem Nutzer zu
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { weeklyMessage, weekOf, zurichDate } from "./report.js";

const PUB = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const PRIV = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const CRON = Deno.env.get("WEEKLY_CRON_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

type Sub = { user_id: string; endpoint: string; p256dh: string; auth: string; fail_count?: number };

const MAX_FAILS = 5; // so viele Fehlversuche in Folge, dann gilt das Abo als tot und wird entfernt
const CHUNK = 10; // Geräte gleichzeitig
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const zurichHour = () => +new Date().toLocaleString("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", hour12: false });

/** Nachricht für einen Nutzer aus seinem Plan-Stand und Namen */
async function messageFor(db: ReturnType<typeof admin>, uid: string) {
  const week = weekOf(zurichDate());
  const { data: ps } = await db.from("plan_state").select("data").eq("user_id", uid).maybeSingle();
  const { data: u } = await db.auth.admin.getUserById(uid);
  const email = (u?.user?.email || "").toLowerCase();
  const { data: m } = email ? await db.from("members").select("name").ilike("email", email).maybeSingle() : { data: null };
  return weeklyMessage((ps?.data as Record<string, unknown> | null)?.wsnap ?? null, week, { name: m?.name || "" });
}

/** Eine Nachricht senden; bei Drosselung (429), Serverfehlern (5xx) und Netzfehlern bis zu 2 Mal mit Wartezeit wiederholen */
async function deliver(s: Sub, msg: unknown) {
  for (let attempt = 0; ; attempt++) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 6 * 3600 });
      return { ok: true as const };
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) return { ok: false as const, gone: true, error: String(code) };
      const retry = (!code || code === 429 || code >= 500) && attempt < 2;
      if (!retry) return { ok: false as const, gone: false, error: String(code ?? (e as Error).message).slice(0, 200) };
      await sleep(1000 * 2 ** attempt);
    }
  }
}

async function sendTo(db: ReturnType<typeof admin>, subs: Sub[]) {
  let sent = 0, gone = 0, failed = 0;
  const cache = new Map<string, unknown>();
  for (const s of subs) if (!cache.has(s.user_id)) cache.set(s.user_id, await messageFor(db, s.user_id));
  for (let i = 0; i < subs.length; i += CHUNK) {
    await Promise.all(subs.slice(i, i + CHUNK).map(async (s) => {
      const r = await deliver(s, cache.get(s.user_id));
      if (r.ok) {
        sent++;
        // Gesundheit des Abos festhalten (Spalten aus supabase/push-health.sql; fehlen sie noch, ist das nur ein ignorierter Fehler)
        await db.from("push_subs").update({ last_ok: new Date().toISOString(), fail_count: 0, last_error: null }).eq("endpoint", s.endpoint);
      } else if (r.gone || (s.fail_count ?? 0) + 1 >= MAX_FAILS) {
        // Abo abgelaufen, im Browser entfernt oder dauerhaft kaputt: aufräumen
        await db.from("push_subs").delete().eq("endpoint", s.endpoint);
        gone++;
      } else {
        failed++;
        console.error("push failed", s.endpoint.slice(0, 60), r.error);
        await db.from("push_subs").update({ fail_count: (s.fail_count ?? 0) + 1, last_error: r.error }).eq("endpoint", s.endpoint);
      }
    }));
  }
  console.log("push run", JSON.stringify({ sent, gone, failed, subs: subs.length }));
  return { sent, gone, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!PUB || !PRIV) return json({ error: "no_secret" }, 500);
  webpush.setVapidDetails("mailto:noreply@basel-sub60.app", PUB, PRIV);

  let body: Record<string, unknown> | null;
  try { body = await req.json(); } catch (_) { body = null; }
  if (!body || typeof body !== "object") return json({ error: "bad_request" }, 400);
  const db = admin();

  if (body.action === "send-all") {
    if (!CRON || req.headers.get("x-cron-secret") !== CRON) return json({ error: "forbidden" }, 403);
    // Der Cron läuft um 16 und 17 Uhr UTC (Sommer- und Winterzeit); gesendet wird nur um 18 Uhr Zürcher Zeit (force: true umgeht das)
    if (!body.force && zurichHour() !== 18) return json({ skipped: true });
    const { data } = await db.from("push_subs").select("*");
    return json(await sendTo(db, (data || []) as Sub[]));
  }

  // Test: nur angemeldete Mitglieder, nur die eigenen Geräte; die user_id kommt aus dem Login-Token
  const auth = req.headers.get("Authorization") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
  if (!/^Bearer\s+\S+/.test(auth) || !anonKey) return json({ error: "forbidden" }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: member, error: authErr } = await sb.rpc("is_member");
  if (authErr || member !== true) return json({ error: "forbidden" }, 403);
  const { data: u } = await sb.auth.getUser(auth.replace(/^Bearer\s+/, ""));
  const uid = u?.user?.id;
  if (!uid) return json({ error: "forbidden" }, 403);

  // Abo dieses Geräts dem angemeldeten Nutzer zuordnen (auch wenn es vorher einem anderen Konto auf dem Gerät gehörte)
  const sub = body.sub as Record<string, unknown> | undefined;
  if (sub) {
    const endpoint = String(sub.endpoint || ""), p256dh = String(sub.p256dh || ""), key = String(sub.auth || "");
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || p256dh.length > 200 || !key || key.length > 100)
      return json({ error: "bad_request" }, 400);
    const { error } = await db.from("push_subs").upsert({ endpoint, user_id: uid, p256dh, auth: key });
    if (error) return json({ error: "save_failed" }, 500);
  }
  if (body.action === "subscribe") return json({ ok: !!sub });

  if (body.action === "test") {
    const { data } = await db.from("push_subs").select("user_id, endpoint, p256dh, auth").eq("user_id", uid);
    if (!data || !data.length) return json({ error: "no_subscription" }, 400);
    return json(await sendTo(db, data as Sub[]));
  }
  return json({ error: "bad_request" }, 400);
});
