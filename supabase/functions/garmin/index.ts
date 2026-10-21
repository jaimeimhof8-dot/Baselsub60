// Supabase Edge Function "garmin": inoffizielle Garmin-Connect-Anbindung pro Nutzer.
// Der Login (mit Garmin-Passwort und ggf. MFA) passiert einmalig auf dem eigenen PC (python-garminconnect, siehe SETUP.md),
// weil Garmin ihn aus Rechenzentren blockiert. Hochgeladen wird nur die Token-Datei garmin_tokens.json – nie das Passwort.
// Die Tokens liegen AES-GCM-verschlüsselt in public.garmin_tokens (kein Zugriff aus der App, nur über diese Function).
// Refresh-Tokens gelten 30 Tage und rotieren; ein Cron ruft alle 6 Std. "refresh-all" auf, damit die Kette nie abreisst.
//
// Deploy: supabase secrets set GARMIN_TOKEN_KEY=<zufällig, ≥32 Zeichen> GARMIN_CRON_SECRET=<zufällig>
//         supabase functions deploy garmin --no-verify-jwt
//
// Body: {action: "connect", tokens: {di_token, di_refresh_token, di_client_id}} → {connected, name}
//       {action: "status"}                       → {connected, name, refreshExp, lastError}
//       {action: "sync", from, to}               → {acts: [...], well: {datum: {...}}, name}
//       {action: "push-workout", name, steps, date?} → {workoutId, scheduled}  (Lauf-Workout in Garmin Connect anlegen, optional auf den Tag legen)
//       {action: "disconnect"}                   → {ok}
//       {action: "refresh-all"} + x-cron-secret  → {refreshed, failed}
import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizeAct, normalizeLaps, reduceWell, relevant } from "./reduce.js";
import { buildWorkout } from "./workout.js";

const KEY = Deno.env.get("GARMIN_TOKEN_KEY") ?? "";
const CRON = Deno.env.get("GARMIN_CRON_SECRET") ?? "";
const DI_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token";
const API = "https://connectapi.garmin.com";
const DAY = 86400000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (code: string, status = 0) => Object.assign(new Error(code), { code, status });

// Header wie die Garmin-Connect-App für Android (wie python-garminconnect 0.3.x)
const NATIVE = {
  "User-Agent": "GCM-Android-5.23",
  "X-Garmin-User-Agent": "com.garmin.android.apps.connectmobile/5.23; ; Google/sdk_gphone64_arm64/google; Android/33; Dalvik/2.1.0",
  "X-Garmin-Paired-App-Version": "10861", "X-Garmin-Client-Platform": "Android", "X-App-Ver": "10861",
  "X-Lang": "en", "X-GCExperience": "GC5", "Accept-Language": "en-US,en;q=0.9",
};

type Tok = { access: string; refresh: string; clientId: string; exp: number; rexp: number; name?: string; full?: string };

/* ---------- Verschlüsselung ---------- */
let aesKey: CryptoKey | null = null;
async function key() {
  if (!aesKey) {
    const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(KEY));
    aesKey = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  return aesKey;
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function seal(tok: Tok) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(JSON.stringify(tok))));
  return b64(iv) + "." + b64(ct);
}
async function open(s: string): Promise<Tok> {
  const [iv, ct] = s.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

/* ---------- Garmin ---------- */
function jwtClaims(t: string): Record<string, unknown> {
  try { return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch (_) { return {}; }
}
async function refresh(tok: Tok): Promise<Tok> {
  let r: Response;
  try {
    r = await fetch(DI_URL, {
      method: "POST",
      headers: { ...NATIVE, Authorization: "Basic " + btoa(tok.clientId + ":"), Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: tok.clientId, refresh_token: tok.refresh }),
    });
  } catch (_) { throw fail("garmin_down"); }
  if (r.status === 400 || r.status === 401 || r.status === 403) throw fail("relogin", r.status);
  if (r.status === 429) throw fail("rate", 429);
  if (!r.ok) throw fail("garmin_down", r.status);
  const j = await r.json();
  const c = jwtClaims(j.access_token);
  return { ...tok, access: j.access_token, refresh: j.refresh_token || tok.refresh,
    clientId: typeof c.client_id === "string" ? c.client_id : tok.clientId,
    exp: Date.now() + (+j.expires_in || 3600) * 1000,
    rexp: j.refresh_token_expires_in ? Date.now() + +j.refresh_token_expires_in * 1000 : tok.rexp || Date.now() + 30 * DAY };
}

/** GET auf connectapi; bei 401 einmal erneuern. ctx.tok wird dabei aktualisiert. */
async function api(ctx: { tok: Tok; dirty: boolean }, path: string, params?: Record<string, string>) {
  const url = API + path + (params ? "?" + new URLSearchParams(params) : "");
  for (let attempt = 0; attempt < 2; attempt++) {
    let r: Response;
    try { r = await fetch(url, { headers: { ...NATIVE, Authorization: "Bearer " + ctx.tok.access, Accept: "application/json" } }); }
    catch (_) { throw fail("garmin_down"); }
    if (r.status === 401 && attempt === 0) { ctx.tok = await refresh(ctx.tok); ctx.dirty = true; continue; }
    if (r.status === 401 || r.status === 403) throw fail("relogin", r.status);
    if (r.status === 429) throw fail("rate", 429);
    if (r.status === 204 || r.status === 404) return null;
    if (!r.ok) throw fail("garmin_down", r.status);
    return await r.json();
  }
}
/** POST auf connectapi (JSON); bei 401 einmal erneuern. */
async function apiPost(ctx: { tok: Tok; dirty: boolean }, path: string, payload: unknown) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let r: Response;
    try {
      r = await fetch(API + path, { method: "POST", body: JSON.stringify(payload),
        headers: { ...NATIVE, Authorization: "Bearer " + ctx.tok.access, Accept: "application/json", "Content-Type": "application/json" } });
    } catch (_) { throw fail("garmin_down"); }
    if (r.status === 401 && attempt === 0) { ctx.tok = await refresh(ctx.tok); ctx.dirty = true; continue; }
    if (r.status === 401 || r.status === 403) throw fail("relogin", r.status);
    if (r.status === 429) throw fail("rate", 429);
    if (!r.ok) throw fail("garmin_down", r.status);
    return r.status === 204 ? null : await r.json().catch(() => null);
  }
}
/** Einzelne Erholungs-Abfrage: Fehler nicht abbrechen lassen, aber in diag festhalten (Status bzw. leer). */
const soft = (diag: Record<string, string>, key: string, p: Promise<unknown>) => p.then((v) => {
  if (v == null || (Array.isArray(v) && !v.length)) diag[key] ??= "leer"; else diag[key] = "ok";
  return v;
}).catch((e) => { if (e.code === "relogin") throw e; diag[key] ??= String(e.status || e.code || "fehler"); return null; });
/** Feldnamen (ohne Werte) eines Objekts – zur Fehlersuche, falls Garmin das Format ändert. */
const keysOf = (v: unknown) => { const o = Array.isArray(v) ? v.find((x) => x && typeof x === "object") : v; return o && typeof o === "object" ? Object.keys(o).slice(0, 25).join(",") : ""; };

/* ---------- Datenbank ---------- */
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
type Admin = ReturnType<typeof admin>;
async function load(db: Admin, uid: string) {
  const { data } = await db.from("garmin_tokens").select("data, last_error").eq("user_id", uid).maybeSingle();
  return data ? { tok: await open(data.data), lastError: data.last_error as string | null } : null;
}
async function store(db: Admin, uid: string, tok: Tok, lastError: string | null = null) {
  const { error } = await db.from("garmin_tokens").upsert({
    user_id: uid, data: await seal(tok), display_name: tok.full || tok.name || null,
    access_exp: new Date(tok.exp).toISOString(), refresh_exp: new Date(tok.rexp).toISOString(),
    last_error: lastError, updated_at: new Date().toISOString(),
  });
  if (error) throw fail("db");
}

const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

async function sync(ctx: { tok: Tok; dirty: boolean }, from: string, to: string, have: Set<string> = new Set()) {
  if (ctx.tok.exp - Date.now() < 3600000) { ctx.tok = await refresh(ctx.tok); ctx.dirty = true; }
  if (!ctx.tok.name) {
    const p = await api(ctx, "/userprofile-service/socialProfile") as Record<string, string> | null;
    ctx.tok.name = p?.displayName; ctx.tok.full = p?.fullName; ctx.dirty = true;
  }
  const name = encodeURIComponent(ctx.tok.name || "");

  const acts: Record<string, unknown>[] = [];
  for (let start = 0; start < 500; start += 100) {
    const page = await api(ctx, "/activitylist-service/activities/search/activities",
      { startDate: from, endDate: to, start: String(start), limit: "100" }) as Record<string, unknown>[] | null;
    if (!Array.isArray(page) || !page.length) break;
    acts.push(...page.map(normalizeAct).filter((a) => a.date && relevant(a)));
    if (page.length < 100) break;
  }

  // Runden (Laps) für Ausdauer-Einheiten: daraus erkennt die App Intervalle und deren Zeiten. Max. 15 neueste pro Abruf.
  // have = Einheiten, deren Runden die App schon kennt (werden nicht nochmals geholt)
  const withLaps = acts.filter((a) => ["run", "row", "ride", "ski"].includes(a.group as string) && !have.has(a.id as string))
    .sort((x, y) => String(y.start).localeCompare(String(x.start))).slice(0, 15);
  for (let i = 0; i < withLaps.length; i += 5) {
    await Promise.all(withLaps.slice(i, i + 5).map(async (a) => {
      try { const r = await api(ctx, `/activity-service/activity/${String(a.id).slice(1)}/splits`); a.laps = normalizeLaps(r); }
      catch (e) { if ((e as { code?: string }).code === "relogin") throw e; }
    }));
  }

  // Erholungswerte: die letzten 14 Tage (Bereichsabfragen + Schlaf/Readiness pro Tag)
  const wTo = Date.parse(to), wFrom = Math.max(Date.parse(from), wTo - 13 * DAY);
  const days: string[] = [];
  for (let t = wFrom; t <= wTo; t += DAY) days.push(iso(t));
  const a = days[0], b = days[days.length - 1];
  const diag: Record<string, string> = {};
  const [hrv, rhr, bb] = await Promise.all([
    soft(diag, "hrv", api(ctx, `/hrv-service/hrv/daily/${a}/${b}`)),
    soft(diag, "rhr", api(ctx, `/userstats-service/wellness/daily/${name}`, { fromDate: a, untilDate: b, metricId: "60" })),
    soft(diag, "bb", api(ctx, "/wellness-service/wellness/bodyBattery/reports/daily", { startDate: a, endDate: b })),
  ]);
  const sleep: unknown[] = [], tr: unknown[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    const res = await Promise.all(chunk.flatMap((d) => [
      soft(diag, "sleep", api(ctx, `/wellness-service/wellness/dailySleepData/${name}`, { date: d, nonSleepBufferMinutes: "60" })),
      soft(diag, "tr", api(ctx, `/metrics-service/metrics/trainingreadiness/${d}`)),
    ]));
    res.forEach((r, j) => (j % 2 ? tr : sleep).push(r));
  }
  const well = reduceWell({ hrv, rhr, bb: Array.isArray(bb) ? bb : [], sleep, tr });
  const shape = { hrv: keysOf(hrv), rhr: keysOf(rhr), bb: keysOf(bb), sleep: keysOf(sleep.find(Boolean)), tr: keysOf(tr.find(Boolean)) };
  return { acts, well, diag, shape, days: Object.keys(well).length, name: ctx.tok.full || ctx.tok.name || null };
}

/* ---------- Cron: alle Tokens rechtzeitig erneuern ---------- */
async function refreshAll(db: Admin) {
  const soon = new Date(Date.now() + 12 * 3600000).toISOString();
  const { data } = await db.from("garmin_tokens").select("user_id, data").lt("access_exp", soon);
  let refreshed = 0, failed = 0;
  for (const row of data || []) {
    try { await store(db, row.user_id, await refresh(await open(row.data))); refreshed++; }
    catch (e) {
      failed++;
      await db.from("garmin_tokens").update({ last_error: (e as { code?: string }).code || "error", updated_at: new Date().toISOString() }).eq("user_id", row.user_id);
    }
  }
  return { refreshed, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (KEY.length < 32) return json({ error: "no_secret" }, 500);

  let body: Record<string, unknown> | null;
  try { body = await req.json(); } catch (_) { body = null; }
  if (!body || typeof body !== "object") return json({ error: "bad_request" }, 400);
  const db = admin();

  if (body.action === "refresh-all") {
    if (!CRON || req.headers.get("x-cron-secret") !== CRON) return json({ error: "forbidden" }, 403);
    return json(await refreshAll(db));
  }

  // Nur angemeldete Mitglieder (wie "strava"/"coach"); die user_id kommt aus dem Login-Token, nie aus dem Body.
  const auth = req.headers.get("Authorization") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
  if (!/^Bearer\s+\S+/.test(auth) || !anonKey) return json({ error: "forbidden" }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: member, error: authErr } = await sb.rpc("is_member");
  if (authErr || member !== true) return json({ error: "forbidden" }, 403);
  const { data: u } = await sb.auth.getUser(auth.replace(/^Bearer\s+/, ""));
  const uid = u?.user?.id;
  if (!uid) return json({ error: "forbidden" }, 403);

  try {
    if (body.action === "connect") {
      const t = body.tokens as Record<string, unknown> | undefined;
      const ok = (v: unknown) => typeof v === "string" && v.length > 10 && v.length < 8000;
      if (!t || !ok(t.di_token) || !ok(t.di_refresh_token) || typeof t.di_client_id !== "string" || !/^[\w.-]{3,100}$/.test(t.di_client_id))
        return json({ error: "bad_tokens" }, 400);
      // Sofort erneuern: die Kopie auf dem PC wird damit ungültig, es gibt nur noch eine aktive Token-Kette (hier).
      const ctx = { tok: await refresh({ access: t.di_token as string, refresh: t.di_refresh_token as string, clientId: t.di_client_id, exp: 0, rexp: 0 }), dirty: true };
      const p = await api(ctx, "/userprofile-service/socialProfile") as Record<string, string> | null;
      ctx.tok.name = p?.displayName; ctx.tok.full = p?.fullName;
      await store(db, uid, ctx.tok);
      return json({ connected: true, name: ctx.tok.full || ctx.tok.name || null });
    }
    if (body.action === "disconnect") {
      await db.from("garmin_tokens").delete().eq("user_id", uid);
      return json({ ok: true });
    }
    const row = await load(db, uid);
    if (body.action === "status") {
      return json(row ? { connected: true, name: row.tok.full || row.tok.name || null, refreshExp: row.tok.rexp, lastError: row.lastError }
        : { connected: false });
    }
    if (body.action === "sync") {
      if (!row) return json({ error: "not_connected" }, 400);
      const to = isDate(body.to) ? body.to as string : iso(Date.now());
      const from = isDate(body.from) ? body.from as string : iso(Date.parse(to) - 30 * DAY);
      if (Date.parse(from) > Date.parse(to) || Date.parse(to) - Date.parse(from) > 400 * DAY) return json({ error: "bad_request" }, 400);
      const ctx = { tok: row.tok, dirty: false };
      try {
        const have = new Set(Array.isArray(body.have) ? (body.have as unknown[]).filter((x) => typeof x === "string").slice(0, 2000) as string[] : []);
        const res = await sync(ctx, from, to, have);
        if (ctx.dirty || row.lastError) await store(db, uid, ctx.tok);
        return json(res);
      } catch (e) {
        // Neue Tokens auch bei Fehlern sichern, sonst ist das rotierte Refresh-Token verloren
        if (ctx.dirty) await store(db, uid, ctx.tok, (e as { code?: string }).code || "error").catch(() => {});
        else await db.from("garmin_tokens").update({ last_error: (e as { code?: string }).code || "error" }).eq("user_id", uid);
        throw e;
      }
    }
    if (body.action === "push-workout") {
      if (!row) return json({ error: "not_connected" }, 400);
      let workout;
      try { workout = buildWorkout(body.name as string, body.steps as unknown[]); }
      catch (_) { return json({ error: "bad_workout" }, 400); }
      const ctx = { tok: row.tok, dirty: false };
      try {
        const made = await apiPost(ctx, "/workout-service/workout", workout) as { workoutId?: number } | null;
        if (!made?.workoutId) throw fail("garmin_down");
        let scheduled = false, scheduleError: string | null = null;
        if (isDate(body.date)) {
          try { await apiPost(ctx, `/workout-service/schedule/${made.workoutId}`, { date: body.date }); scheduled = true; }
          catch (e) {
            if ((e as { code?: string }).code === "relogin") throw e;
            scheduleError = String((e as { status?: number }).status || (e as { code?: string }).code || "fehler");
          }
        }
        if (ctx.dirty) await store(db, uid, ctx.tok);
        return json({ workoutId: made.workoutId, scheduled, scheduleError, date: isDate(body.date) ? body.date : null });
      } catch (e) {
        if (ctx.dirty) await store(db, uid, ctx.tok, (e as { code?: string }).code || "error").catch(() => {});
        throw e;
      }
    }
    return json({ error: "bad_request" }, 400);
  } catch (e) {
    const code = (e as { code?: string }).code || "garmin_down";
    return json({ error: code }, code === "relogin" ? 401 : code === "rate" ? 429 : 502);
  }
});
