// Prognose-Protokoll und Ausblick bis zum Rennen. Reine Funktionen, ohne DOM.
//
// Protokoll (S.fclog): {"YYYY-MM-DD": Eintrag}, ein Eintrag pro Tag, nur wenn sich die Prognose wirklich verändert hat
// (neuer Lauf-Test, neuer Stationen-Benchmark, neue Simulation). Eintrag: {t, r, s, x, lo, hi, k, T, b, n, why}
//   v Modellversion · t Gesamt, r Laufen, s Stationen, x Roxzone (alle Sekunden) · lo/hi Spanne · k Stationsfaktor · T Test-Pace (s/km)
//   b Summe der Stationen-Benchmarks (Solo-Mittel, s) · n Anzahl Simulationen · why Ursache als Text
//
// Ausblick: Wie viel schneller wird die Prognose bis zum Rennen? Grundlage ist die gemessene Verbesserung zwischen den Tests.
// Gibt es noch keine, gilt eine vorsichtige Annahme (PRIOR), skaliert mit der Trainingstreue der letzten Wochen.
// Der Gewinn nimmt mit der Zeit ab (Trainingsanpassung flacht ab, TAU) und in den letzten Wochen vor dem Rennen gibt es keinen mehr (Taper).
import { mmss } from "./util.js";

const ok = (v) => typeof v === "number" && isFinite(v) && v > 0;
const r1 = (v) => Math.round(v);

export const MODEL_V = 2; // Version des Prognosemodells; Einträge anderer Versionen sind nicht vergleichbar und zählen nicht für die Steigung
export const TAU_W = 10; // Wochen: Zeitkonstante, nach der ca. 63 % des möglichen Gewinns erreicht sind
export const TAPER_W = 2; // Wochen vor dem Rennen ohne weiteren Gewinn
export const PRIOR = -15; // s/Woche ohne eigene Messreihe – Annahme, keine Messung
export const RATE_MIN = -45; // schneller als 45 s pro Woche ist nicht glaubwürdig
export const RATE_MAX = 10; // Rückschritt wird begrenzt (ein schlechter Testtag ist kein Trend)
export const MIN_SPAN_DAYS = 14; // erst ab so viel Abstand zwischen erstem und letztem Punkt zählt eine Steigung als gemessen

/** Eintrag aus einem Prognose-Ergebnis (buildForecast). nSims = Anzahl gültiger Simulationen. */
export function makeEntry(fc, nSims = 0) {
  if (!fc || !ok(fc.total)) return null;
  return {
    t: r1(fc.total), r: r1(fc.run), s: r1(fc.st), x: r1(fc.rox), lo: r1(fc.lo), hi: r1(fc.hi),
    v: MODEL_V, k: Math.round(fc.k * 1000) / 1000, T: r1(fc.T), b: fc.bench != null ? r1(fc.bench) : null, n: nSims | 0,
  };
}

/** Hat sich die Prognose gegenüber dem vorigen Eintrag bewegt? (Spanne und Alter des Tests zählen nicht.) */
export const moved = (p, c) => !p || ["t", "r", "s", "x"].some((f) => Math.abs((c[f] ?? 0) - (p[f] ?? 0)) >= 1);

/** Ursache der Veränderung in Worten, aus den Eingaben beider Einträge. */
export function whyChanged(p, c) {
  if (!p) return "Startwert";
  if (p.v !== c.v) return "Modell neu geeicht (nicht mit früheren Einträgen vergleichbar)";
  const parts = [];
  if (Math.abs(c.T - p.T) >= 1) parts.push(`Lauf-Test: Ø ${mmss(p.T)} → ${mmss(c.T)}/km`);
  if (p.b != null && c.b != null && Math.abs(c.b - p.b) >= 2) parts.push(`Stationen-Benchmark: Summe ${mmss(p.b)} → ${mmss(c.b)}`);
  else if (p.b == null && c.b != null) parts.push("Stationen-Benchmark eingetragen");
  if (c.n > p.n) parts.push("Neue Simulation");
  else if (c.n < p.n) parts.push("Simulation entfernt");
  else if (Math.abs(c.k - p.k) > 0.004 && !parts.length) parts.push(`Faktor k ${String(p.k.toFixed(2)).replace(".", ",")} → ${String(c.k.toFixed(2)).replace(".", ",")}`);
  return parts.join(" · ") || "Neu berechnet";
}

/** Sortierte Liste [{d, ...Eintrag}] aus dem Protokoll. */
export const list = (log) => Object.entries(log || {}).filter(([, e]) => e && ok(e.t)).map(([d, e]) => ({ d, ...e })).sort((a, b) => (a.d < b.d ? -1 : 1));

/**
 * Protokoll fortschreiben. Gibt {log, entry, changed} zurück; log ist ein neues Objekt (der Eingang bleibt unverändert).
 * Gleicher Tag: der Eintrag wird überschrieben (Tippen und Korrigieren erzeugt keine Flut). Ist der Tageswert wieder gleich dem
 * letzten früheren Eintrag, entfällt der Tageseintrag.
 */
export function update(log, fc, date, nSims = 0) {
  const cur = makeEntry(fc, nSims);
  if (!cur) return { log: log || {}, entry: null, changed: false };
  const out = { ...(log || {}) };
  const prev = list(out).filter((e) => e.d < date).pop() || null;
  const had = out[date];
  if (prev && !moved(prev, cur)) {
    if (had) { delete out[date]; return { log: out, entry: null, changed: true }; }
    return { log: out, entry: null, changed: false };
  }
  const entry = { ...cur, why: whyChanged(prev, cur) };
  const same = had && !moved(had, entry) && had.why === entry.why && had.lo === entry.lo && had.hi === entry.hi;
  if (same) return { log: out, entry: had, changed: false };
  out[date] = entry;
  return { log: out, entry, changed: true };
}

/** Veränderung je Eintrag gegenüber dem vorigen: [{...Eintrag, dt, dr, ds, dx}] (negativ = schneller). */
export function withDeltas(items) {
  return items.map((e, i) => {
    const p = items[i - 1];
    return { ...e, dt: p ? e.t - p.t : null, dr: p ? e.r - p.r : null, ds: p ? e.s - p.s : null, dx: p ? e.x - p.x : null };
  });
}

const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;

/**
 * Gemessene Verbesserung: Steigung der Gesamtzeit über die Zeit in s/Woche (negativ = schneller).
 * Braucht mindestens zwei Punkte mit mindestens MIN_SPAN_DAYS Abstand, sonst null.
 */
export function trend(items) {
  const p = items.filter((e) => ok(e.t) && e.v === MODEL_V); // nur Einträge desselben Modells
  if (p.length < 2) return null;
  const x = p.map((e) => dayNum(e.d)), span = Math.max(...x) - Math.min(...x);
  if (span < MIN_SPAN_DAYS) return null;
  const mx = x.reduce((a, b) => a + b, 0) / p.length, my = p.reduce((a, e) => a + e.t, 0) / p.length;
  let num = 0, den = 0;
  p.forEach((e, i) => { num += (x[i] - mx) * (e.t - my); den += (x[i] - mx) ** 2; });
  return den ? { rate: (num / den) * 7, span, n: p.length } : null;
}

/** Gewinn (s, negativ = schneller) nach w Wochen bei Rate rate (s/Woche), mit Abflachen und Taper. weeksLeft = Wochen bis zum Rennen. */
export function gainAt(rate, w, weeksLeft) {
  const eff = Math.max(0, Math.min(w, weeksLeft - TAPER_W));
  return rate * TAU_W * (1 - Math.exp(-eff / TAU_W)) || 0;
}

/**
 * Ausblick bis zum Rennen.
 * @param items   Protokoll als Liste (list())
 * @param cur     aktuelle Prognose {t, lo, hi} in Sekunden
 * @param weeksLeft Wochen bis zum Rennen
 * @param adherence Trainingstreue 0–1 (erledigte / geplante Einheiten der letzten Wochen), nur für die Annahme ohne Messreihe
 * @returns null ohne Prognose, sonst {rate, source, proj, lo, hi, needed, subWeeks, curve[]}
 *   source "gemessen" | "Annahme" · needed = nötige Verbesserung pro Woche, um das Ziel ohne Abflachen zu erreichen
 *   subWeeks = in wie vielen Wochen die Prognose unter dem Ziel liegt (0 = schon jetzt, null = nach diesem Modell nicht erreichbar)
 */
export function outlook({ items = [], cur, weeksLeft, adherence = 1, goal = 3600 } = {}) {
  if (!cur || !ok(cur.t) || !(weeksLeft >= 0)) return null;
  const tr = trend(items);
  const af = Math.min(1, Math.max(0.3, typeof adherence === "number" && isFinite(adherence) ? adherence : 1));
  const source = tr ? "gemessen" : "Annahme";
  const rate = tr ? Math.min(RATE_MAX, Math.max(RATE_MIN, tr.rate)) : PRIOR * af;
  const half = Math.max(0, ((cur.hi ?? cur.t) - (cur.lo ?? cur.t)) / 2);
  const gain = gainAt(rate, weeksLeft, weeksLeft);
  const unc = Math.abs(gain) * (tr ? 0.5 : 1);
  const spread = Math.hypot(half, unc);
  const proj = cur.t + gain;
  const eff = Math.max(0, weeksLeft - TAPER_W), gap = cur.t - goal;
  let subWeeks = null;
  if (gap <= 0) subWeeks = 0;
  else if (rate < 0) {
    const frac = gap / (-rate * TAU_W);
    if (frac < 1) subWeeks = Math.ceil(-TAU_W * Math.log(1 - frac));
  }
  const curve = [];
  for (let w = 0; w <= Math.ceil(weeksLeft); w++) curve.push({ w, t: cur.t + gainAt(rate, w, weeksLeft) });
  return { rate, source, proj, lo: proj - spread, hi: proj + spread, needed: gap > 0 && eff > 0 ? gap / eff : 0, subWeeks, curve, adherence: af };
}
