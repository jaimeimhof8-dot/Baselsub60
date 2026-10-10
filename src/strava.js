// Strava: Aktivitäten einlesen (API-JSON oder Export-CSV), normalisieren und den geplanten Einheiten zuordnen.
// Netzwerkfunktionen bekommen `fetch` übergeben, damit alles ohne Browser testbar bleibt.

const SPORT = {
  run: ["Run", "TrailRun", "VirtualRun", "Lauf", "Laufen", "Trail Run", "Virtueller Lauf"],
  ride: ["Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide", "Velomobile", "Radfahrt", "Virtuelle Radfahrt", "Gravel-Radfahrt", "Mountainbikefahrt", "E-Bike-Fahrt"],
  row: ["Rowing", "VirtualRow", "Rudern"],
  ski: ["NordicSki", "BackcountrySki", "Skilanglauf"],
  strength: ["WeightTraining", "Workout", "Crossfit", "HighIntensityIntervalTraining", "Krafttraining", "Training", "HIIT"]
};
const sportGroup = (type) => {
  const t = String(type || "").replace(/\s+/g, "").toLowerCase();
  for (const [g, list] of Object.entries(SPORT)) if (list.some((x) => x.replace(/\s+/g, "").toLowerCase() === t)) return g;
  return "other";
};
export const SPORT_LABEL = { run: "Lauf", ride: "Rad", row: "Rudern", ski: "Ski", strength: "Kraft/Workout", other: "Aktivität" };

/** Welche Strava-Sportarten erfüllen welche geplante Einheit? */
const FITS = {
  lauf: ["run"], bike: ["ride"], station: ["run", "row", "ski", "strength"], sim: ["run", "row", "ski", "strength"],
  kraft: ["strength"], race: ["run", "strength", "row"]
};
export const fits = (planKind, group) => (FITS[planKind] || []).includes(group);

const pad = (n) => String(n).padStart(2, "0");
/** "2026-10-13T18:05:00Z" (start_date_local ist Lokalzeit mit "Z") -> "2026-10-13" */
const isoDay = (s) => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };

/** Strava-API-Aktivität -> {id, name, group, date, dist (m), time (s), hr, watts} */
export function normalizeApi(a) {
  const type = a.sport_type || a.type;
  return {
    id: String(a.id), name: a.name || "", type, group: sportGroup(type),
    date: isoDay(a.start_date_local || a.start_date),
    dist: Math.round(+a.distance || 0), time: Math.round(+a.moving_time || +a.elapsed_time || 0),
    hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    watts: a.average_watts ? Math.round(a.average_watts) : null
  };
}

/** Einfacher CSV-Parser mit Anführungszeichen. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  const s = String(text).replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = ""; if (row.some((x) => x !== "")) rows.push(row); row = [];
    } else cell += c;
  }
  row.push(cell); if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  mär: 3, mrz: 3, mai: 5, okt: 10, dez: 12 };
/** Datum aus dem Strava-Export ("Oct 12, 2026, 6:01:02 PM" oder "12.10.2026, 18:01:02") -> "YYYY-MM-DD" */
export function csvDate(v) {
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^([A-Za-zäÄ]{3})[a-zä]*\.? (\d{1,2}), (\d{4})/);
  if (m && MON[m[1].toLowerCase()]) return `${m[3]}-${pad(MON[m[1].toLowerCase()])}-${pad(m[2])}`;
  m = s.match(/^(\d{1,2})\.? ([A-Za-zäÄ]{3})[a-zä]*\.? (\d{4})/);
  if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${pad(MON[m[2].toLowerCase()])}-${pad(m[1])}`;
  return null;
}

const num = (v) => { const n = parseFloat(String(v || "").replace(/'/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };

/** Strava-Export activities.csv (englisch oder deutsch) -> normalisierte Aktivitäten. */
export function fromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const col = (...names) => h.findIndex((x) => names.includes(x));
  const c = {
    id: col("activity id", "aktivitäts-id"), date: col("activity date", "aktivitätsdatum", "datum der aktivität"),
    name: col("activity name", "aktivitätsname", "name der aktivität"), type: col("activity type", "aktivitätsart", "sportart"),
    elapsed: col("elapsed time", "verstrichene zeit"), moving: col("moving time", "bewegungszeit"),
    dist: col("distance", "distanz", "entfernung"), hr: col("average heart rate", "durchschnittliche herzfrequenz"),
    watts: col("average watts", "durchschnittliche watt")
  };
  if (c.date < 0 || c.type < 0) throw Object.assign(new Error("Unbekanntes CSV-Format"), { code: "csv_format" });
  return rows.slice(1).map((r, j) => {
    // Die erste "Distance"-Spalte im Export ist in km.
    const km = num(r[c.dist]);
    return {
      id: c.id >= 0 && r[c.id] ? String(r[c.id]) : `csv-${j}`, name: c.name >= 0 ? r[c.name] : "",
      type: r[c.type], group: sportGroup(r[c.type]), date: csvDate(r[c.date]),
      dist: Math.round(km > 500 ? km : km * 1000),
      time: Math.round(num(r[c.moving]) || num(r[c.elapsed])),
      hr: c.hr >= 0 && num(r[c.hr]) ? Math.round(num(r[c.hr])) : null,
      watts: c.watts >= 0 && num(r[c.watts]) ? Math.round(num(r[c.watts])) : null
    };
  }).filter((a) => a.date);
}

/** Beliebige Datei (JSON-Array der API oder CSV-Export) einlesen. */
export function parseActivities(text) {
  const s = String(text || "").trim();
  if (s.startsWith("[") || s.startsWith("{")) {
    const j = JSON.parse(s);
    const list = Array.isArray(j) ? j : j.activities || [];
    return list.map(normalizeApi).filter((a) => a.date);
  }
  return fromCsv(s);
}

const hms = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + pad(m) : m) + ":" + pad(x); };
/** Kurzbeschreibung, z. B. "Lauf · 10,2 km · 48:12 · 4:43/km · Ø 152 bpm" */
export function summary(a) {
  const p = [SPORT_LABEL[a.group] || a.type];
  if (a.dist) p.push((a.dist / 1000).toFixed(1).replace(".", ",") + " km");
  if (a.time) p.push(hms(a.time));
  if (a.group === "run" && a.dist > 200 && a.time) { const pace = a.time / (a.dist / 1000); p.push(Math.floor(pace / 60) + ":" + pad(Math.round(pace % 60)) + "/km"); }
  if (a.watts) p.push(a.watts + " W");
  if (a.hr) p.push("Ø " + a.hr + " bpm");
  return p.join(" · ");
}

/**
 * Aktivitäten den Plantagen zuordnen.
 * plan(i) -> Tagesplan, idxOf("YYYY-MM-DD") -> Tag-Index, done(i) -> bereits erledigt?
 * Ergebnis: byDay {idx: {acts: [id], match}}, moved [{from, to, act}] – Aktivität an einem Tag ohne passende
 * Einheit, aber eine passende, offene Einheit liegt bis 3 Tage davor/danach in derselben Woche.
 */
export function reconcile(acts, { plan, idxOf, done, last }) {
  const byDay = {}, moved = [], used = new Set();
  const list = [...acts].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const a of list) {
    const i = idxOf(a.date);
    if (i == null || i < 0 || i > last) continue;
    const p = plan(i), e = byDay[i] || (byDay[i] = { acts: [], match: false });
    e.acts.push(a.id);
    if (p && fits(p.k, a.group)) { e.match = true; continue; }
    if (a.group === "other") continue;
    const w0 = Math.floor(i / 7) * 7;
    let best = null;
    for (let x = Math.max(w0, i - 3); x <= Math.min(w0 + 6, i + 3, last); x++) {
      if (x === i || used.has(x)) continue;
      const q = plan(x);
      if (q && !q.inj && fits(q.k, a.group) && !done(x) && (best == null || Math.abs(x - i) < Math.abs(best - i))) best = x;
    }
    if (best != null) { used.add(best); moved.push({ from: best, to: i, act: { id: a.id, label: SPORT_LABEL[a.group] } }); }
  }
  // Ein Tag, der durch eine Aktivität erfüllt ist, braucht keine Verschiebung mehr.
  return { byDay, moved: moved.filter((m) => !(byDay[m.from] && byDay[m.from].match)) };
}

/* ---------- OAuth + API (Browser) ---------- */
export const STATE = "hx-strava";
export function authUrl(clientId, redirectUri) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code",
    approval_prompt: "auto", scope: "activity:read_all", state: STATE });
  return "https://www.strava.com/oauth/authorize?" + q;
}
async function tokenCall(fetchFn, body) {
  const r = await fetchFn("https://www.strava.com/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  if (!r.ok) throw Object.assign(new Error("Strava-Anmeldung fehlgeschlagen (" + r.status + ")"), { code: "token", status: r.status });
  const j = await r.json();
  return { access: j.access_token, refresh: j.refresh_token, expires: j.expires_at, athlete: j.athlete ? j.athlete.firstname : null };
}
export const exchangeCode = (fetchFn, { clientId, secret, code }) =>
  tokenCall(fetchFn, { client_id: clientId, client_secret: secret, code, grant_type: "authorization_code" });

/** Gültigen Token sicherstellen (Refresh 5 Min. vor Ablauf). Gibt das (evtl. neue) Token-Objekt zurück. */
export async function ensureToken(fetchFn, tok, { clientId, secret, now = Date.now() }) {
  if (tok.expires * 1000 - 300000 > now) return tok;
  const n = await tokenCall(fetchFn, { client_id: clientId, client_secret: secret, refresh_token: tok.refresh, grant_type: "refresh_token" });
  return { ...tok, ...n, athlete: n.athlete || tok.athlete };
}

/** Aktivitäten seit `after` (Unix-Sekunden) seitenweise holen. */
export async function fetchActivities(fetchFn, access, after, maxPages = 5) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await fetchFn(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100&page=${page}`,
      { headers: { Authorization: "Bearer " + access } });
    if (r.status === 401) throw Object.assign(new Error("Strava-Zugriff abgelaufen"), { code: "auth" });
    if (r.status === 429) throw Object.assign(new Error("Strava-Limit erreicht, später nochmals versuchen"), { code: "rate" });
    if (!r.ok) throw Object.assign(new Error("Strava nicht erreichbar (" + r.status + ")"), { code: "http" });
    const list = await r.json();
    all.push(...list.map(normalizeApi));
    if (list.length < 100) break;
  }
  return all.filter((a) => a.date);
}
