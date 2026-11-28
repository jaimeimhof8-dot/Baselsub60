// Ansichts-Modell des Analyse-Tabs je Einheitstyp (Anforderungen: docs/analyse-tab-anforderungen.md, Abschnitte 6 und 12 bis 16).
// Reine Funktionen ohne DOM (Tests: test/an-session.test.js). Fehlende Daten heissen «na» mit Grund, nie eine erfundene Zahl.
import { seriesOf, hrZones, zoneTimes } from "./series.js";
import { mmss } from "./util.js";
import { DRIFT_WARN } from "./dash-v3.js";
import { simSteps } from "./simsteps.js";

/** Ab dieser Entkopplung Leistung zu Puls (%, erste zu zweiter Hälfte) gilt eine lockere Radeinheit als «Puls driftet». */
export const DECOUPLE_WARN = 5;

const ok = (v) => typeof v === "number" && isFinite(v);
const sg = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n);
const km1 = (m) => (m / 1000).toFixed(1).replace(".", ",");

/** Art der Einheit aus Plan und Uhr-Aktivität: interval | station | compromise | easy | bike | strength | other. */
export function sessionKind(plan, act) {
  const p = plan || {}, text = [p.t, ...(p.i || [])].join(" ");
  if (p.k === "kraft") return "strength";
  if (p.k === "bike" || (!p.k && act && act.group === "ride") || (act && act.group === "ride" && p.k !== "station")) return "bike";
  if (p.k === "sim" && simSteps(p.i)) return "station"; // Simulation mit «Run N → Station»: Auswertung wie Stationstag
  if (p.k === "station") return /compromised\s*running\s*\d/i.test(text) && !/stationen unter zeitdruck/i.test(text) ? "compromise" : "station";
  if (p.k === "lauf") return /\d+\s*[×x]\s*\d+(?:[,.]\d+)?\s*(?:km|m|′|')/.test(text) ? "interval" : "easy"; // Wiederholungen im Plan = Intervall-Lauf, auch ohne Zieltempo
  if (!p.k && act && act.group === "run") return "easy";
  return "other";
}

/** Pulszonen der Aktivität: Garmin-Grenzen (untere Grenze Z1 bis Z5) oder, wenn sie fehlen, 50/60/70/80/90 % vom höchsten Puls (estimated). */
export function zoneBoundsOf(act, maxHr) {
  const z = act && act.zones && Array.isArray(act.zones.bounds) && act.zones.bounds.length === 5 ? act.zones.bounds : null;
  if (z) return { bounds: z, estimated: false };
  return maxHr ? { bounds: hrZones(maxHr).slice(0, 5), estimated: true } : null;
}

/** Anteil der Zeit (ganze %) in Zone `zone` (1 bis 5) an der Zeit mit Pulswert. null ohne Puls. */
export function zoneShare(S, bounds, zone) {
  if (!S || !S.hr || !bounds) return null;
  let tot = 0, inz = 0;
  for (let i = 1; i < S.t.length; i++) {
    const h = S.hr[i], dt = S.t[i] - S.t[i - 1];
    if (!ok(h) || !(dt > 0)) continue;
    tot += dt;
    if (h >= bounds[zone - 1] && (zone === 5 || h < bounds[zone])) inz += dt;
  }
  return tot ? Math.round((inz / tot) * 100) : null;
}

const meanBetween = (S, key, t0, t1) => {
  let s = 0, c = 0;
  for (let i = 0; i < S.t.length; i++) { if (S.t[i] < t0 || S.t[i] >= t1) continue; const v = S[key] && S[key][i]; if (ok(v) && v > 0) { s += v; c++; } }
  return c ? s / c : null;
};

/** Puls-Drift: Ø Puls im letzten Drittel minus im ersten Drittel (bpm) und in % des ersten. null bei weniger als 6 Minuten oder ohne Puls. */
export function driftThirds(S) {
  if (!S || !S.hr || S.t.length < 3) return null;
  const T = S.t[S.t.length - 1] - S.t[0];
  if (T < 360) return null;
  const a = meanBetween(S, "hr", S.t[0], S.t[0] + T / 3), b = meanBetween(S, "hr", S.t[0] + (2 * T) / 3, S.t[S.t.length - 1] + 1);
  if (a == null || b == null) return null;
  return { bpm: Math.round(b - a), pct: ((b - a) / a) * 100 };
}

/** Entkopplung (%): Verhältnis Wert (Leistung «pw» oder Tempo «v») zu Puls in der ersten gegen die zweite Hälfte. Positiv = in der zweiten Hälfte weniger Leistung je Herzschlag. null bei weniger als 10 Minuten oder ohne beide Reihen. */
export function decoupling(S, key) {
  if (!S || !S.hr || !S[key] || S.t.length < 3) return null;
  const t0 = S.t[0], t1 = S.t[S.t.length - 1], T = t1 - t0;
  if (T < 600) return null;
  const m = t0 + T / 2, v1 = meanBetween(S, key, t0, m), v2 = meanBetween(S, key, m, t1 + 1), h1 = meanBetween(S, "hr", t0, m), h2 = meanBetween(S, "hr", m, t1 + 1);
  if (![v1, v2, h1, h2].every(ok)) return null;
  const r1 = v1 / h1, r2 = v2 / h2;
  return Math.round(((r1 - r2) / r1) * 100);
}

const num = (k, v, unit = "", tone = "") => ({ k, v, unit, tone });
const na = (k, why) => ({ k, v: "–", unit: "", tone: "", na: true, why });

/** Zeile «Datenlage» unter dem Ergebnis: Quelle, Runden, Auflösung, Puls, Zonen, Phasen. -> {text, tone: "" | "warn"} */
export function dataState(act, S, { zones = null, conf = null, hrCover = true } = {}) {
  if (!act) return { text: "keine Uhr-Aktivität gefunden", tone: "warn" };
  const parts = [act.src === "garmin" ? "Garmin" : act.src === "strava" ? "Strava" : "Uhr"];
  if (act.laps && act.laps.length) parts.push(`${act.laps.length} Runden`);
  let tone = "";
  if (S && S.src === "series") {
    const res = S.res || Math.max(1, Math.round((S.t[S.t.length - 1] - S.t[0]) / Math.max(1, S.t.length - 1)));
    if (res <= 1) parts.push("1-s-Daten");
    else { parts.push(`Auflösung ${res} s (reduziert)`); tone = "warn"; }
    if (S.hr) {
      const have = S.hr.filter(ok).length / S.hr.length;
      parts.push(have >= 0.98 ? "Puls lückenlos" : `Puls in ${Math.round(have * 100)} % der Zeit`);
      if (have < 0.98) tone = "warn";
    } else { parts.push("kein Puls"); tone = "warn"; }
  } else { parts.push(S ? "nur Rundenwerte" : "keine Zeitreihe"); tone = "warn"; }
  if (zones && zones.estimated) { parts.push("Zonen geschätzt"); tone = "warn"; }
  if (conf) { parts.push(conf === "sure" || conf === "likely" ? "Phasen sicher erkannt" : "Phasen vermutet"); if (!(conf === "sure" || conf === "likely")) tone = "warn"; }
  return { text: parts.join(" · "), tone };
}

/** Diagramme je Typ: keys = alle mit Daten, defaults = die drei, die zuerst sichtbar sind. */
function chartOf(kind, S, zb, ivBands) {
  if (!S || S.src !== "series") return null;
  const has = (k) => Array.isArray(S[k]) && S[k].some(ok);
  const order = kind === "bike" ? ["pw", "hr", "spd", "cad", "el"] : ["pace", "hr", "el", "cad"];
  const keys = order.filter((k) => (k === "pace" || k === "spd" ? has("v") : has(k)));
  if (!keys.length) return null;
  const zoneBand = kind === "compromise" && zb ? { lo: zb.bounds[2], hi: zb.bounds[3], label: "Zone 3" } : (kind === "easy" || kind === "bike") && zb ? { lo: zb.bounds[1], hi: zb.bounds[2], label: "Zone 2" } : null;
  return { keys, defaults: keys.slice(0, 3), zoneBand, bands: ivBands || [] };
}

/**
 * Modell der Einheit. Eingaben: kind (sessionKind), act (Uhr-Aktivität | null), d (dashV3-Ergebnis | null), ivs [{k, t0, t1, d, pace, hr, diff}] (Arbeitsabschnitte),
 * maxHr (Rückfall für Zonen), zone2 (Plan nennt Zone 2), conf (Sicherheit der Phasen-Erkennung).
 * -> {kind, headline: {big, label, status: {text, tone} | null}, numbers (Stationstag 5, sonst ≤ 3), garmin[≤3], dataState, chart, tabs}
 */
export function anSessionModel({ kind, act, d = null, ivs = [], maxHr = null, zone2 = false, conf = null }) {
  const S = act ? seriesOf(act) : null, zb = zoneBoundsOf(act, maxHr), out = { kind, headline: { big: "", label: "", status: null }, numbers: [], garmin: [], dataState: dataState(act, S, { zones: zb, conf: kind === "interval" || kind === "compromise" || kind === "station" ? conf : null }), chart: chartOf(kind, S, zb, ivs), tabs: [] };
  if (act && act.te) { if (act.te.a > 0) out.garmin.push({ k: "Effekt aerob", v: String(act.te.a).replace(".", ",") }); if (act.te.n > 0) out.garmin.push({ k: "Effekt anaerob", v: String(act.te.n).replace(".", ",") }); }
  if (act && act.load) out.garmin.push({ k: "Belastung", v: String(act.load) });
  out.garmin = out.garmin.slice(0, 3);
  const hrAvg = act && act.hr ? act.hr : null;

  if (kind === "strength") { out.tabs = []; out.chart = null; return out; }

  if (kind === "interval") {
    const plan = d && d.plan;
    out.headline = plan ? { big: `${plan.hit} von ${plan.n}`, label: "Intervalle im Ziel", status: plan.n - plan.hit ? { text: `${plan.n - plan.hit} verfehlt`, tone: "bad" } : { text: "alle im Ziel", tone: "ok" } } : { big: "–", label: "kein Zieltempo im Plan", status: null };
    const dur = ivs.reduce((s, q) => s + (q.t1 - q.t0), 0), dist = ivs.reduce((s, q) => s + (q.d || 0), 0);
    out.numbers.push(dist > 0 ? num("Pace Arbeit", mmss(dur / (dist / 1000)), "/km") : na("Pace Arbeit", "keine Arbeitsrunden erkannt"));
    const hrs = ivs.map((q) => q.hr).filter(ok);
    out.numbers.push(hrs.length ? num("Puls Ø Arbeit", String(Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length)), "bpm") : na("Puls Ø Arbeit", "kein Puls in den Arbeitsrunden"));
    if (hrs.length >= 2) { const dr = Math.round(hrs[hrs.length - 1] - hrs[0]); out.numbers.push(num("Puls-Drift", sg(dr), "bpm", (dr / hrs[0]) * 100 >= DRIFT_WARN ? "warn" : "")); } else out.numbers.push(na("Puls-Drift", "weniger als 2 Arbeitsrunden mit Puls"));
    out.tabs = ["Intervalle", "Zonen", "Vorher", "Mehr"];
    return out;
  }

  if (kind === "station") {
    // Nur Stationen zählen (Plan gegen Ist enthält auch die Läufe; ohne Art-Angabe wie bisher alle Zeilen)
    const plan0 = d && d.plan, sr = plan0 ? plan0.rows.filter((r) => !r.kind || r.kind === "station") : [];
    const plan = plan0 && sr.length ? { ...plan0, rows: sr, n: sr.length, hit: sr.filter((r) => r.diff <= 0).length } : null;
    out.headline = plan ? { big: `${plan.hit} von ${plan.n}`, label: "Stationen im Ziel", status: plan.n - plan.hit ? { text: `${plan.n - plan.hit} verfehlt`, tone: "bad" } : { text: "alle im Ziel", tone: "ok" } } : { big: "–", label: "Runden passen nicht zum Plan", status: null };
    const tile = (k) => d && d.tiles && d.tiles.find((t) => t.k === k);
    // Reihe 1: Gesamtdauer (wie Garmin, alle Runden), nur Stationen, nur Läufe. Reihe 2: Kompromiss, schwächste Station.
    out.numbers.push(act && act.time > 0 ? num("Gesamtdauer", mmss(act.time), "min") : na("Gesamtdauer", "keine Dauer von der Uhr"));
    out.numbers.push(plan ? num("Stationszeit", mmss(plan.rows.reduce((s, r) => s + r.t, 0)), "min") : na("Stationszeit", "Runden passen nicht zum Plan"));
    const rr = plan0 ? plan0.rows.filter((r) => r.kind === "run") : [];
    out.numbers.push(rr.length ? num("Laufzeit", mmss(rr.reduce((s, r) => s + r.t, 0)), "min") : na("Laufzeit", plan0 ? "keine Läufe sicher zugeordnet" : "Runden passen nicht zum Plan"));
    const comp = tile("Kompromiss-Delta");
    out.numbers.push(comp && !comp.na ? num("Kompromiss Ø", comp.v.replace(/ s\/km$/, ""), "s/km", /^\+(\d+)/.test(comp.v) && +/^\+(\d+)/.exec(comp.v)[1] >= 10 ? "warn" : "") : na("Kompromiss Ø", comp && comp.why ? comp.why : "kein Referenz-km"));
    if (plan && plan.rows.length) { const w = plan.rows.reduce((a, r) => (r.diff > a.diff ? r : a), plan.rows[0]); out.numbers.push(num("Schwächste", sg(w.diff), "s")); out.worst = w.name; } else out.numbers.push(na("Schwächste", "kein Plan-Vergleich"));
    out.tabs = ["Stationen", "Vorher", "Mehr"];
    return out;
  }

  if (kind === "compromise") {
    const inZ3 = zb ? ivs.filter((q) => ok(q.hr) && q.hr >= zb.bounds[2] && q.hr < zb.bounds[3]).length : null;
    out.headline = ivs.length && inZ3 != null ? { big: `${inZ3} von ${ivs.length}`, label: "Läufe in Zone 3", status: ivs.length - inZ3 ? { text: `${ivs.length - inZ3} ausserhalb`, tone: "warn" } : { text: "alle in Zone 3", tone: "ok" } } : { big: "–", label: "keine Läufe erkannt", status: null };
    const dur = ivs.reduce((s, q) => s + (q.t1 - q.t0), 0), dist = ivs.reduce((s, q) => s + (q.d || 0), 0), hrs = ivs.map((q) => q.hr).filter(ok);
    out.numbers.push(dist > 0 ? num("Pace Läufe", mmss(dur / (dist / 1000)), "/km") : na("Pace Läufe", "keine Läufe erkannt"));
    out.numbers.push(hrs.length ? num("Puls Ø Läufe", String(Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length)), "bpm") : na("Puls Ø Läufe", "kein Puls in den Läufen"));
    const comp = d && d.tiles && d.tiles.find((t) => t.k === "Kompromiss-Delta");
    out.numbers.push(comp && !comp.na ? num("Kompromiss Ø", comp.v.replace(/ s\/km$/, ""), "s/km") : na("Kompromiss Ø", "kein Referenz-km"));
    out.tabs = ["Abschnitte", "Zonen", "Vorher", "Mehr"];
    return out;
  }

  if (kind === "easy" || kind === "bike") {
    const bike = kind === "bike", share = zb && S ? zoneShare(S, zb.bounds, 2) : null;
    out.headline = share != null ? { big: `${share} %`, label: "der Zeit in Zone 2", status: null } : { big: hrAvg ? String(hrAvg) : "–", label: hrAvg ? "bpm im Durchschnitt" : "kein Puls aufgezeichnet", status: null };
    if (zone2 && hrAvg && zb) out.headline.status = hrAvg >= zb.bounds[2] ? { text: "Puls über Zone 2", tone: "warn" } : hrAvg < zb.bounds[1] ? { text: "Puls unter Zone 2", tone: "mu" } : { text: "im Zone-2-Bereich", tone: "ok" };
    if (bike) {
      const w = act && act.watts ? act.watts : S && S.pw ? Math.round(S.pw.filter(ok).reduce((a, b) => a + b, 0) / Math.max(1, S.pw.filter(ok).length)) : null;
      out.numbers.push(w ? num("Ø Leistung", String(w), "W") : na("Ø Leistung", "keine Leistung aufgezeichnet"));
      out.numbers.push(hrAvg ? num("Puls Ø", String(hrAvg), "bpm") : na("Puls Ø", "kein Puls aufgezeichnet"));
      const dc = S ? decoupling(S, S.pw ? "pw" : "v") : null;
      out.numbers.push(dc != null ? num("Entkopplung", sg(dc), "%", dc >= DECOUPLE_WARN ? "warn" : "") : na("Entkopplung", "weniger als 10 Minuten mit Puls und Leistung"));
      out.tabs = ["Abschnitte", "Zonen", "Vorher", "Mehr"];
    } else {
      const pace = act && act.dist > 100 && act.time ? act.time / (act.dist / 1000) : null;
      out.numbers.push(pace ? num("Ø Pace", mmss(pace), "/km") : na("Ø Pace", "keine Distanz aufgezeichnet"));
      out.numbers.push(hrAvg ? num("Puls Ø", String(hrAvg), "bpm") : na("Puls Ø", "kein Puls aufgezeichnet"));
      const dr = S ? driftThirds(S) : null;
      out.numbers.push(dr ? num("Puls-Drift", sg(dr.bpm), "bpm", dr.pct >= DRIFT_WARN ? "warn" : "") : na("Puls-Drift", "weniger als 6 Minuten mit Puls"));
      out.tabs = ["Kilometer", "Zonen", "Vorher", "Mehr"];
    }
    return out;
  }

  out.headline = { big: act && act.time ? mmss(act.time) : "–", label: act && act.dist ? `min · ${km1(act.dist)} km` : "min", status: null };
  out.numbers.push(hrAvg ? num("Puls Ø", String(hrAvg), "bpm") : na("Puls Ø", "kein Puls aufgezeichnet"));
  out.tabs = ["Zonen", "Mehr"];
  return out;
}

const ZCOL = ["#ff6961", "#ff9f0a", "#30d158", "#64a8ff", "#a1a2aa"];

/**
 * Zeit in den Pulszonen Z5 bis Z1 (und darunter). Garmin-Sekunden der Aktivität, sonst aus der Zeitreihe gerechnet.
 * -> {rows: [{label, sub, secs, pct, color}], estimated, total} oder null ohne Grenzen oder ohne Puls.
 */
export function zoneRows(act, S, maxHr) {
  const zb = zoneBoundsOf(act, maxHr);
  if (!zb) return null;
  const b = zb.bounds, total = act && act.time ? act.time : S ? S.t[S.t.length - 1] - S.t[0] : 0;
  let secs = act && act.zones && Array.isArray(act.zones.secs) && act.zones.secs.length === 5 ? act.zones.secs : null;
  if (!secs && S) secs = zoneTimes(S, maxHr, zb.estimated ? null : b);
  if (!secs || !total) return null;
  const sum = secs.reduce((a, c) => a + c, 0), below = Math.max(0, total - sum);
  const rows = [4, 3, 2, 1, 0].map((k) => ({ label: "Z" + (k + 1), sub: k === 4 ? `ab ${b[4]} bpm` : `${b[k]} bis ${b[k + 1] - 1} bpm`, secs: secs[k], pct: (secs[k] / total) * 100, color: ZCOL[4 - k] }));
  if (below >= 30) rows.push({ label: "–", sub: `unter ${b[0]} bpm`, secs: below, pct: (below / total) * 100, color: "#5a5b63" });
  return { rows, estimated: zb.estimated, total };
}

/** Zeit bei einer Distanz m (lineare Zwischenwerte). null ausserhalb der Reihe. */
function timeAtDist(S, m) {
  let lastD = -1;
  for (let i = 1; i < S.t.length; i++) {
    const a = S.d[i - 1], b = S.d[i];
    if (!ok(a) || !ok(b) || b < a) continue;
    if (m >= a && m <= b && b > a) return S.t[i - 1] + ((m - a) / (b - a)) * (S.t[i] - S.t[i - 1]);
    lastD = b;
  }
  void lastD;
  return null;
}
const meanIn = (S, key, t0, t1) => { let s = 0, c = 0; for (let i = 0; i < S.t.length; i++) { if (S.t[i] < t0 || S.t[i] > t1) continue; const v = S[key] && S[key][i]; if (ok(v)) { s += v; c++; } } return c ? s / c : null; };

/** Kilometer-Abschnitte aus der Zeitreihe: [{k, t0, t1, d, pace, hr, cad}]. Ein Rest ab 100 m wird als letzter Abschnitt gezeigt. */
export function kmSplits(S, step = 1000) {
  if (!S || !S.d || !S.d.some(ok)) return [];
  const maxD = Math.max(...S.d.filter(ok)), out = [];
  let prevT = S.t[0], prevM = 0, k = 0;
  for (let m = step; m <= maxD + 1e-9; m += step) {
    const t = timeAtDist(S, m);
    if (t == null) break;
    out.push({ k: ++k, t0: prevT, t1: t, d: m - prevM, pace: (t - prevT) / ((m - prevM) / 1000), hr: meanIn(S, "hr", prevT, t), cad: meanIn(S, "cad", prevT, t) });
    prevT = t; prevM = m;
  }
  const rest = maxD - prevM;
  if (rest >= 100) { const t = S.t[S.t.length - 1]; out.push({ k: ++k, t0: prevT, t1: t, d: rest, pace: (t - prevT) / (rest / 1000), hr: meanIn(S, "hr", prevT, t), cad: meanIn(S, "cad", prevT, t) }); }
  return out;
}

/** Zeitblöcke (Standard 10 Minuten) für Rad: [{k, t0, t1, d, hr, cad, pw}]. Ein Rest unter 2 Minuten wird nicht gezeigt. */
export function timeBlocks(S, secs = 600) {
  if (!S) return [];
  const T = S.t[S.t.length - 1] - S.t[0], out = [];
  for (let t0 = S.t[0], k = 1; t0 < S.t[0] + T; t0 += secs, k++) {
    const t1 = Math.min(t0 + secs, S.t[S.t.length - 1]);
    if (t1 - t0 < 120 && k > 1) break;
    const i0 = S.t.findIndex((x) => x >= t0), i1 = S.t.length - 1 - [...S.t].reverse().findIndex((x) => x <= t1);
    out.push({ k, t0, t1, d: ok(S.d[i1]) && ok(S.d[i0]) ? S.d[i1] - S.d[i0] : null, hr: meanIn(S, "hr", t0, t1), cad: meanIn(S, "cad", t0, t1), pw: S.pw ? meanIn(S, "pw", t0, t1) : null });
  }
  return out;
}

/** Anstieg und Abstieg in Metern aus der Höhenreihe (dm), Schwelle 2 m gegen Rauschen. null ohne Höhe. */
export function elevGain(S) {
  if (!S || !S.el || !S.el.some(ok)) return null;
  let ref = null, up = 0, down = 0;
  for (const dm of S.el) {
    if (!ok(dm)) continue;
    const m = dm / 10;
    if (ref == null) { ref = m; continue; }
    if (m - ref >= 2) { up += m - ref; ref = m; } else if (ref - m >= 2) { down += ref - m; ref = m; }
  }
  return { up: Math.round(up), down: Math.round(down) };
}
