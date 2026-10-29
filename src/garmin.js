// Garmin (inoffiziell, über die Edge Function "garmin"): Token-Datei prüfen, Aktivitäten mit Strava zusammenführen,
// Erholungswerte bewerten. Rein funktional – Netzwerk (invoke) wird übergeben, damit alles ohne Browser testbar ist.
// Die Garmin-Antworten werden schon auf dem Server reduziert (supabase/functions/garmin/reduce.js).
import { relevant } from "./ingest.js";

export const MSG = {
  notDeployed: "Garmin ist auf dem Server noch nicht eingerichtet (Edge Function „garmin“, siehe SETUP.md).",
  noSecret: "Auf dem Server fehlt GARMIN_TOKEN_KEY (siehe SETUP.md).",
  forbidden: "Bitte neu anmelden, dann nochmals versuchen.",
  badTokens: "Das ist keine gültige garmin_tokens.json. Bitte die Datei aus dem Login-Befehl wählen.",
  relogin: "Garmin hat den Zugang abgelehnt (abgelaufen oder widerrufen). Login-Befehl nochmals ausführen und die neue Datei hochladen.",
  rate: "Garmin bremst gerade (zu viele Anfragen). In ein paar Minuten nochmals versuchen.",
  down: "Garmin nicht erreichbar. Später nochmals versuchen.",
  offline: "Keine Verbindung. Garmin wird geladen, sobald du wieder online bist.",
  notConnected: "Garmin ist nicht verbunden.",
  noLoginServer: "Der Garmin-Login-Server ist noch nicht eingerichtet (garminLoginUrl in config.js, siehe SETUP.md).",
  loginDown: "Login-Server nicht erreichbar. Später nochmals versuchen.",
  credentials: "Garmin hat E-Mail oder Passwort abgelehnt. Bitte prüfen (gleich wie in der Garmin-Connect-App).",
  mfaWrong: "Der Bestätigungscode war falsch oder abgelaufen. Bitte nochmals anmelden.",
  mfaTimeout: "Kein Bestätigungscode erhalten. Bitte nochmals anmelden.",
  blocked: "Garmin blockiert die Anmeldung gerade. In ein paar Minuten nochmals versuchen oder unten die Alternative mit dem PC nutzen.",
};

/** Fehlertext für den Login-Server (garmin-login/api/login.py). */
export function loginErrorText(status, code) {
  return { credentials: MSG.credentials, mfa_wrong: MSG.mfaWrong, mfa_timeout: MSG.mfaTimeout, mfa_cancelled: "Anmeldung abgebrochen.",
    rate: MSG.blocked, garmin_down: MSG.blocked, forbidden: MSG.forbidden, no_config: MSG.noLoginServer }[code]
    || (status === 404 ? MSG.noLoginServer : MSG.loginDown);
}

/** Fehlertext zu HTTP-Status und Fehlercode der Edge Function. */
export function errorText(status, code) {
  if (status === 404 && !code) return MSG.notDeployed;
  return { no_secret: MSG.noSecret, forbidden: MSG.forbidden, bad_tokens: MSG.badTokens, relogin: MSG.relogin,
    rate: MSG.rate, not_connected: MSG.notConnected, bad_request: "Der Server kennt diese Garmin-Funktion noch nicht. Edge Function neu deployen: supabase functions deploy garmin --no-verify-jwt.", bad_workout: "Das Workout konnte nicht in das Garmin-Format umgesetzt werden." }[code] || MSG.down;
}

/** Edge Function aufrufen (invoke wie supabase-js functions.invoke). Offline → TypeError, sonst Error mit {code, status}. */
export async function call(invoke, body, { online = true } = {}) {
  if (!online) throw new TypeError("offline");
  const { data, error } = await invoke(body);
  if (!error && data && !data.error) return data;
  const res = error && error.context && typeof error.context.json === "function" ? error.context : null;
  let code = (data && data.error) || "";
  if (res && !code) { try { code = (await res.clone().json()).error || ""; } catch (_) { /* kein JSON */ } }
  const status = res ? res.status : 0;
  throw Object.assign(new Error(errorText(status, code)), { code: code || "server", status });
}

/** Inhalt von garmin_tokens.json prüfen -> {di_token, di_refresh_token, di_client_id} oder Error mit Klartext. */
export function readTokenFile(text) {
  let j;
  try { j = JSON.parse(String(text || "").replace(/^﻿/, "")); } catch (_) { j = null; }
  const ok = j && typeof j.di_token === "string" && j.di_token.length > 10 && typeof j.di_refresh_token === "string"
    && j.di_refresh_token.length > 10 && typeof j.di_client_id === "string" && j.di_client_id.length > 2;
  if (!ok) {
    const legacy = j && (j.oauth_token || j.oauth1_token || j.access_token);
    throw Object.assign(new Error(legacy ? "Alte Token-Datei (garth). Bitte den Login-Befehl aus der App verwenden." : MSG.badTokens), { code: "bad_tokens" });
  }
  return { di_token: j.di_token, di_refresh_token: j.di_refresh_token, di_client_id: j.di_client_id };
}

/* ---------- Strava + Garmin zusammenführen ---------- */
const minutes = (s) => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : null; };
const near = (a, b, tol) => (!a || !b) ? true : Math.abs(a - b) <= tol * Math.max(a, b);

/** Dieselbe Einheit aus zwei Quellen (Uhr → Garmin → Strava)? Gleiche Sportgruppe und Tag, Start ±3 Min., sonst Dauer/Distanz ±10 %. */
export function sameAct(a, b) {
  if (!a || !b || (a.src === "garmin") === (b.src === "garmin") || a.group !== b.group || a.date !== b.date) return false;
  const ta = minutes(a.start), tb = minutes(b.start);
  if (ta != null && tb != null) return Math.abs(ta - tb) <= 3;
  return !!(a.time && b.time) && near(a.time, b.time, 0.1) && near(a.dist, b.dist, 0.1);
}

/**
 * Neue Aktivitäten in die gemeinsame Liste (S.strava.acts) übernehmen. Doppelte Einheiten erscheinen nur einmal:
 * Garmin hat Vorrang (genauer, inkl. Erholungsdaten derselben Uhr), die Strava-Kopie wird entfernt bzw. nicht aufgenommen.
 * Gibt die Anzahl wirklich neuer Einheiten zurück.
 */
export function mergeActs(store, list, minDate = "") {
  let n = 0;
  for (const a of list) {
    if (!a || !a.date || a.date < minDate || !relevant(a)) continue;
    // Bereits geladene Runden behalten, wenn die neue Version keine mitbringt
    if (store[a.id]) { store[a.id] = !a.laps && store[a.id].laps ? { ...a, laps: store[a.id].laps, lapsV: store[a.id].lapsV } : a; continue; }
    const dups = Object.values(store).filter((x) => sameAct(x, a));
    if (dups.length && a.src !== "garmin") continue;
    for (const d of dups) delete store[d.id];
    store[a.id] = a;
    if (!dups.length) n++;
  }
  return n;
}

/* ---------- Erholung ---------- */
/**
 * Ampel aus den Garmin-Werten eines Tages: {level: "gut"|"mittel"|"schlecht"|null, why: [..]}.
 * schlecht: Training Readiness < 40, HRV-Status LOW/POOR, Schlaf < 6 h oder Body Battery < 30
 * mittel:   Readiness 40–59, HRV UNBALANCED, Schlaf < 7 h oder Body Battery < 50
 */
export function recoveryHint(w) {
  if (!w) return { level: null, why: [] };
  const bad = [], mid = [];
  const st = String(w.hrvStatus || "").toUpperCase();
  if (w.readiness != null) (w.readiness < 40 ? bad : w.readiness < 60 ? mid : []).push(`Readiness ${w.readiness}`);
  if (st === "LOW" || st === "POOR") bad.push("HRV niedrig"); else if (st === "UNBALANCED") mid.push("HRV unausgeglichen");
  if (w.sleepH != null) (w.sleepH < 6 ? bad : w.sleepH < 7 ? mid : []).push(`${String(w.sleepH).replace(".", ",")} h Schlaf`);
  if (w.bb != null) (w.bb < 30 ? bad : w.bb < 50 ? mid : []).push(`Body Battery ${w.bb}`);
  const known = w.readiness != null || st || w.sleepH != null || w.bb != null;
  if (!known) return { level: null, why: [] };
  return bad.length ? { level: "schlecht", why: bad } : mid.length ? { level: "mittel", why: mid } : { level: "gut", why: [] };
}

/** Erholungswerte zusammenführen (neuere Werte gewinnen) und auf die letzten `keep` Tage begrenzen. */
export function mergeWell(old = {}, fresh = {}, keep = 60) {
  const out = { ...old };
  for (const [d, v] of Object.entries(fresh)) out[d] = { ...(out[d] || {}), ...v };
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, keep));
}
