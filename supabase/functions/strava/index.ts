// Supabase Edge Function "strava": tauscht den OAuth-Code bzw. das Refresh-Token gegen ein Strava-Access-Token.
// Client-ID und Client-Secret bleiben hier (Secrets STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET), nie im Browser.
// Ein Refresh-Token allein nützt ohne Secret nichts – deshalb darf es im Browser bleiben.
// Deploy: supabase secrets set STRAVA_CLIENT_ID=12345 STRAVA_CLIENT_SECRET=...
//         supabase functions deploy strava --no-verify-jwt
//
// Body: {action: "config"}                → {clientId}
//       {action: "exchange", code}        → {access, refresh, expires, athlete}
//       {action: "refresh", refresh}      → {access, refresh, expires, athlete}
import { createClient } from "npm:@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("STRAVA_CLIENT_ID");
const SECRET = Deno.env.get("STRAVA_CLIENT_SECRET");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const isToken = (v: unknown) => typeof v === "string" && /^[\w.-]{8,200}$/.test(v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // Nur angemeldete Mitglieder (gleiche Prüfung wie in "coach"): is_member() liest die E-Mail aus dem Token.
  const auth = req.headers.get("Authorization") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
  if (!/^Bearer\s+\S+/.test(auth) || !anonKey) return json({ error: "forbidden" }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: member, error: authErr } = await sb.rpc("is_member");
  if (authErr || member !== true) return json({ error: "forbidden" }, 403);
  if (!CLIENT_ID || !SECRET) return json({ error: "no_secret" }, 500);

  let body: Record<string, unknown> | null;
  try { body = await req.json(); } catch (_) { body = null; }
  if (!body || typeof body !== "object") return json({ error: "bad_request" }, 400);

  if (body.action === "config") return json({ clientId: CLIENT_ID });
  let grant: Record<string, string>;
  if (body.action === "exchange" && isToken(body.code)) grant = { code: body.code as string, grant_type: "authorization_code" };
  else if (body.action === "refresh" && isToken(body.refresh)) grant = { refresh_token: body.refresh as string, grant_type: "refresh_token" };
  else return json({ error: "bad_request" }, 400);

  let r: Response;
  try {
    r = await fetch("https://www.strava.com/oauth/token", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: SECRET, ...grant }),
    });
  } catch (_) { return json({ error: "strava_down" }, 502); }
  // 400/401 von Strava: Code abgelaufen, Zugriff widerrufen oder falsche Callback-Domain → neu verbinden
  if (!r.ok) return json({ error: "strava", status: r.status }, 502);
  const j = await r.json();
  return json({ access: j.access_token, refresh: j.refresh_token, expires: j.expires_at, athlete: j.athlete?.firstname ?? null });
});
