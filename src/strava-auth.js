// Strava-Anmeldung über die Supabase Edge Function "strava": Aufruf, Fehlertexte und OAuth-Rückkehr.
// Rein funktional – Netzwerk (invoke), Online-Status und Speichern werden übergeben, damit alles ohne Browser testbar ist.
import { exchangeCode } from "./strava.js";

export const MSG = {
  notDeployed: "Strava ist auf dem Server noch nicht eingerichtet (Edge Function „strava“, siehe SETUP.md).",
  noSecret: "Auf dem Server fehlen STRAVA_CLIENT_ID und STRAVA_CLIENT_SECRET (siehe SETUP.md).",
  forbidden: "Bitte neu anmelden, dann nochmals verbinden.",
  rejected: "Strava hat die Anmeldung abgelehnt (Code abgelaufen, Zugriff widerrufen oder falsche Callback-Domain). Bitte neu verbinden.",
  down: "Strava-Server nicht erreichbar. Später nochmals versuchen.",
  offline: "Keine Verbindung zu Strava. Die Aktivitäten werden geladen, sobald du wieder online bist.",
  expired: "Strava-Zugriff abgelaufen oder widerrufen. Bitte „Trennen“ und neu verbinden.",
  denied: "Du hast den Zugriff in Strava abgelehnt. Zum Verbinden in Strava auf „Autorisieren“ tippen.",
  aborted: "Verbindung abgebrochen. Bitte nochmals versuchen.",
  connected: "Verbunden. Lade Aktivitäten …",
};

/** Fehlertext zu HTTP-Status und Fehlercode der Edge Function. */
export function serverErrorText(status, code) {
  if (status === 404) return MSG.notDeployed;
  if (code === "no_secret") return MSG.noSecret;
  if (code === "forbidden") return MSG.forbidden;
  if (code === "strava") return MSG.rejected;
  return MSG.down;
}

/**
 * Edge Function aufrufen. invoke(body) verhält sich wie supabase-js `functions.invoke`:
 * {data, error}; bei HTTP-Fehlern hat error.context die Response, bei Netzwerkfehlern nicht.
 * Offline → TypeError (wie fetch), sonst Error mit {code, status} und verständlichem Text.
 */
export async function callServer(invoke, body, { online = true } = {}) {
  if (!online) throw new TypeError("offline");
  const { data, error } = await invoke(body);
  if (!error && data && !data.error) return data;
  const res = error && error.context && typeof error.context.json === "function" ? error.context : null;
  let code = (data && data.error) || "";
  if (res && !code) { try { code = (await res.clone().json()).error || ""; } catch (_) { /* kein JSON */ } }
  const status = res ? res.status : 0;
  throw Object.assign(new Error(serverErrorText(status, code)), { code: code || "server", status });
}

/** Fehler beim Synchronisieren in eine Handlungsanweisung übersetzen. */
export function syncErrorText(e, { online = true } = {}) {
  if (!online || e instanceof TypeError) return MSG.offline;
  if (e.code === "auth" || e.code === "strava" || (e.code === "token" && (e.status === 400 || e.status === 401))) return MSG.expired;
  return e.message || MSG.down;
}

/**
 * Rückkehr von Strava (?code=… bzw. ?error=…) abschliessen.
 * server: Token-Tausch über die Edge Function (Cloud-Login) statt lokal mit Secret (Vorschau-Modus).
 * store(tok) speichert das Token. Ergebnis: {ok, msg, tok?}
 */
export async function completeOAuth({ code, err, server, invoke, online = true, fetchFn, cfg = {}, host = "localhost", store }) {
  if (err || !code) return { ok: false, msg: err === "access_denied" ? MSG.denied : MSG.aborted };
  try {
    const tok = server ? await callServer(invoke, { action: "exchange", code }, { online }) : await exchangeCode(fetchFn, { ...cfg, code });
    if (!tok || !tok.access || !tok.refresh) throw Object.assign(new Error(MSG.down), { code: "server" });
    store(tok);
    return { ok: true, msg: MSG.connected, tok };
  } catch (e) {
    if (e instanceof TypeError || !online) return { ok: false, msg: MSG.offline };
    return { ok: false, msg: server ? e.message : `${e.message}. Client-ID, Secret und die Callback-Domain (${host}) in strava.com/settings/api prüfen.` };
  }
}
