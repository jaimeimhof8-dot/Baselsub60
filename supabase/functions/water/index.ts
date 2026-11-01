// Supabase Edge Function "water": Trink-Erinnerung als Web-Push für die Ernährungs-App.
// Die App meldet ihren Wasserstand ({action: "state"}); ein Cron (alle 30 Min., siehe supabase/water.sql) schickt eine Erinnerung,
// wenn der Stand für die Uhrzeit zu tief ist. Gleiche VAPID-Schlüssel und gleicher Cron-Secret wie die Funktion "weekly".
//
// Deploy: supabase functions deploy water --no-verify-jwt   (Secrets VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, WEEKLY_CRON_SECRET sind schon gesetzt)
//
// Body (angemeldet): {action: "subscribe", sub: {endpoint, p256dh, auth}} → {ok}
//                    {action: "state", day: "JJJJ-MM-TT", ml, goal}        → {ok}
//                    {action: "off", endpoint}                             → {ok}
//                    {action: "test"}                                      → {sent}   (Erinnerung sofort auf die eigenen Geräte)
//       Cron:        {action: "remind-all"} + x-cron-secret                → {sent, gone, failed, skipped}
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { decide, messageFor } from "./remind.js";

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

type Sub = { user_id: string; endpoint: string; p256dh: string; auth: string; last_sent: string | null; fail_count: number | null };
const MAX_FAILS = 5;
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function zurichNow(now = Date.now()) {
  const d = new Date(now);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return { today: `${g("year")}-${g("month")}-${g("day")}`, hour: +g("hour") % 24 };
}

async function deliver(s: Sub, msg: unknown) {
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 3600 });
    return { ok: true as const, gone: false };
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return { ok: false as const, gone: code === 404 || code === 410, error: String(code ?? (e as Error).message).slice(0, 200) };
  }
}

async function send(db: ReturnType<typeof admin>, s: Sub, msg: unknown) {
  const r = await deliver(s, msg);
  if (r.ok) {
    await db.from("water_subs").update({ last_sent: new Date().toISOString(), fail_count: 0 }).eq("endpoint", s.endpoint);
    return "sent" as const;
  }
  if (r.gone || (s.fail_count ?? 0) + 1 >= MAX_FAILS) {
    await db.from("water_subs").delete().eq("endpoint", s.endpoint);
    return "gone" as const;
  }
  await db.from("water_subs").update({ fail_count: (s.fail_count ?? 0) + 1 }).eq("endpoint", s.endpoint);
  return "failed" as const;
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

  if (body.action === "remind-all") {
    if (!CRON || req.headers.get("x-cron-secret") !== CRON) return json({ error: "forbidden" }, 403);
    const { today, hour } = zurichNow();
    const [{ data: subs }, { data: states }] = await Promise.all([db.from("water_subs").select("*"), db.from("water_state").select("*")]);
    const byUser = new Map((states ?? []).map((r: Record<string, unknown>) => [r.user_id as string, r]));
    const out = { sent: 0, gone: 0, failed: 0, skipped: 0 };
    for (const s of (subs ?? []) as Sub[]) {
      const d = decide(byUser.get(s.user_id) ?? null, { today, hour, lastSent: s.last_sent });
      if (!d.send) { out.skipped++; continue; }
      out[await send(db, s, messageFor(d.behind))]++;
    }
    console.log("water run", JSON.stringify({ ...out, today, hour }));
    return json(out);
  }

  // Alles Weitere nur für angemeldete Mitglieder; die user_id kommt aus dem Login-Token
  const auth = req.headers.get("Authorization") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
  if (!/^Bearer\s+\S+/.test(auth) || !anonKey) return json({ error: "forbidden" }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: member, error: authErr } = await sb.rpc("is_member");
  if (authErr || member !== true) return json({ error: "forbidden" }, 403);
  const { data: u } = await sb.auth.getUser(auth.replace(/^Bearer\s+/, ""));
  const uid = u?.user?.id;
  if (!uid) return json({ error: "forbidden" }, 403);

  if (body.action === "subscribe") {
    const sub = body.sub as Record<string, unknown> | undefined;
    const endpoint = String(sub?.endpoint || ""), p256dh = String(sub?.p256dh || ""), key = String(sub?.auth || "");
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || p256dh.length > 200 || !key || key.length > 100) return json({ error: "bad_request" }, 400);
    const { error } = await db.from("water_subs").upsert({ endpoint, user_id: uid, p256dh, auth: key, fail_count: 0 });
    return error ? json({ error: "save_failed" }, 500) : json({ ok: true });
  }
  if (body.action === "state") {
    const ml = Math.round(Number(body.ml)), goal = Math.round(Number(body.goal));
    if (!isDate(body.day) || !(ml >= 0 && ml <= 20000) || !(goal >= 500 && goal <= 10000)) return json({ error: "bad_request" }, 400);
    const { error } = await db.from("water_state").upsert({ user_id: uid, day: body.day, ml, goal, updated_at: new Date().toISOString() });
    return error ? json({ error: "save_failed" }, 500) : json({ ok: true });
  }
  if (body.action === "off") {
    await db.from("water_subs").delete().eq("endpoint", String(body.endpoint || "")).eq("user_id", uid);
    return json({ ok: true });
  }
  if (body.action === "test") {
    const { data } = await db.from("water_subs").select("*").eq("user_id", uid);
    if (!data || !data.length) return json({ error: "no_subscription" }, 400);
    let sent = 0;
    for (const s of data as Sub[]) if ((await send(db, s, { title: "Trink-Erinnerung", body: "So sieht die Erinnerung aus. Trink jetzt ein Glas.", url: "/" })) === "sent") sent++;
    return json({ sent });
  }
  return json({ error: "bad_request" }, 400);
});
