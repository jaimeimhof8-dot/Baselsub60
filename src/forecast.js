// Rennprognose Doubles: Laufen + Stationen + Roxzone aus euren echten Testwerten, mit Spanne, und sie eicht sich an Simulationen.
// Reine Funktionen, ohne DOM. Ausgangslage und Herleitung der Faktoren: siehe Plan «Rennprognose, die zu euren echten Daten passt».
import { fallbackStations, normDivision, DOUBLES_SHARE } from "./divisions.js";

const ok = (v) => typeof v === "number" && isFinite(v) && v > 0;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sum = (a) => a.reduce((x, y) => x + y, 0);

/**
 * Team-Stationszeit im Rennen = Mittel der Solo-Benchmarks × k.
 * k bündelt das Teilen der Arbeit (ca. 0,55) und die Ermüdung nach Renntempo (Puls, Grip, Wechsel).
 * Annahme, bis eine Simulation ≥ 85 % eingetragen ist: mitte 0,80 (Ermüdung ×1,45); gut/vorsichtig = Rand der Spanne.
 * Zur Einordnung: 0,66 = alles läuft, 0,95 = so langsam wie im Rennen von St. Gallen 2026 (Stationen 24:03).
 */
export const K = { gut: 0.72, mitte: 0.8, vorsichtig: 0.9 };
export const DRIFT = 3; // s/km zusätzlich pro Lauf ab Lauf 5 (nach den Burpee Broad Jumps)
export const MISMATCH = 0.025; // Abstand der Partner im selben Test, ab dem ein Messfehler vermutet wird
export const STALE_DAYS = 35; // älter: Spanne breiter, Re-Test fällig
export const SIM_MIN = 0.85; // erst Simulationen ab dieser Intensität eichen k

/** Ermüdungsaufschlag (Compromised Running) und Roxzone-Zeit nach Niveau der Basis-Pace (s/km). */
export function levelOf(base) {
  if (base < 255) return { name: "schnell", fatigue: 15, rox: 255 }; // 4:15 (St. Gallen 2026: 4:13)
  if (base < 285) return { name: "mittel", fatigue: 20, rox: 315 }; // 5:15
  return { name: "gemütlich", fatigue: 25, rox: 360 }; // 6:00
}

/**
 * Lauf-Testzeiten beider Partner je Wiederholung zusammenführen. Laufen sie zusammen (Pacing-Test), sind die Zeiten gleich;
 * weichen sie um mehr als 2,5 % ab, ist das ein Messfehler (z. B. eine Uhr mit falscher Distanz) und der schnellere Wert zählt.
 * @param {number[][]} persons je Person die Zeiten der Wiederholungen (Sekunden, ungültig = ignoriert)
 */
export function resolveRuns(persons) {
  const reps = [];
  let mismatch = 0;
  const n = Math.max(0, ...persons.map((p) => (p || []).length));
  for (let r = 0; r < n; r++) {
    const v = persons.map((p) => (p || [])[r]).filter(ok);
    if (!v.length) continue;
    const lo = Math.min(...v), hi = Math.max(...v);
    if (v.length > 1 && (hi - lo) / lo > MISMATCH) { mismatch++; reps.push(lo); } else reps.push(mean(v));
  }
  return { reps, mismatch };
}

/**
 * k aus Simulationen eichen. sims: [{intensity (0–1), stations (Team-Stationszeit der Simulation, s)}]; benchSum = Summe der Mittel aller 8 Solo-Benchmarks.
 * ≥ 85 % Intensität: k = beobachteter Wert (Mittel der letzten zwei). Darunter: nur Untergrenze («mindestens so langsam»).
 * @returns {{k: number|null, floor: number|null, n: number}}
 */
export function calibrateK(sims, benchSum) {
  if (!ok(benchSum)) return { k: null, floor: null, n: 0 };
  const obs = (sims || []).filter((s) => s && ok(s.stations) && ok(s.intensity)).map((s) => ({ k: s.stations / benchSum, i: s.intensity }));
  const strong = obs.filter((s) => s.i >= SIM_MIN).slice(-2).map((s) => s.k);
  const weak = obs.filter((s) => s.i < SIM_MIN).map((s) => s.k);
  return { k: strong.length ? mean(strong) : null, floor: weak.length ? Math.max(...weak) : null, n: obs.length };
}

/**
 * Prognose. Eingaben:
 *  laufPersons: [[4 Zeiten Jaime], [4 Zeiten Jimoh]] (bevorzugt) oder lauf: flache Liste; base: Schwellen-Pace in s/km (hat Vorrang)
 *  station: 8 × [ich, Partner] Solo-Zeiten · sims: siehe calibrateK · testAgeDays: Alter des letzten Tests (null = unbekannt)
 * @returns null ohne Pace, sonst {T, pace, paces[8], run, st, rox, total, lo, hi, k, calibrated, level, missing, sources[8], stations[8], basis[], warnings[]}
 */
export function buildForecast({ lauf = [], laufPersons = null, station = [], base = null, division = null, sims = [], testAgeDays = null } = {}) {
  let reps, mismatch = 0;
  if (laufPersons) ({ reps, mismatch } = resolveRuns(laufPersons));
  else reps = lauf.filter(ok);
  const T = ok(base) ? base : reps.length ? mean(reps) : null;
  if (T == null) return null;

  const lv = levelOf(T), dv = normDivision(division);
  const share = dv.mode === "solo" ? 1 : DOUBLES_SHARE;
  const paces = Array.from({ length: 8 }, (_, i) => T + lv.fatigue + (i >= 4 ? DRIFT * (i - 3) : 0));
  const run = sum(paces);

  const fb = fallbackStations(dv).map((v) => v * share); // Teamzeit aus dem Rennen von St. Gallen, wenn kein Benchmark da ist
  const sources = [], solo = [];
  for (let r = 0; r < 8; r++) {
    const v = (station[r] || []).filter(ok);
    sources.push(v.length ? "bench" : "fallback");
    solo.push(v.length ? mean(v) : null);
  }
  const benchSum = sources.every((s) => s === "bench") ? sum(solo) : null;
  const cal = calibrateK(sims, benchSum);

  let k = K.mitte, kLo = K.gut, kHi = K.vorsichtig;
  if (cal.k != null) { k = cal.k; kLo = k * 0.97; kHi = k * 1.03; }
  if (cal.floor != null) { k = Math.max(k, cal.floor); kLo = Math.max(kLo, cal.floor); kHi = Math.max(kHi, k); }

  const team = solo.map((v, r) => (v == null ? fb[r] : v * k));
  const at = (kk, fbF) => sum(solo.map((v, r) => (v == null ? fb[r] * fbF : v * kk)));
  const st = sum(team);
  const stale = ok(testAgeDays) && testAgeDays > STALE_DAYS, widen = stale ? 1.3 : 1;
  const dRun = 8 * 10 * widen, dRox = 20 * widen;
  const dLo = (st - at(kLo, 0.93)) * widen, dHi = (at(kHi, 1.07) - st) * widen;
  const total = run + st + lv.rox;

  const missing = sources.filter((s) => s === "fallback").length;
  const warnings = [];
  if (mismatch) warnings.push("Die Uhren weichen im Test ab (über 2,5 %). Es zählt der schnellere Wert.");
  if (stale) warnings.push("Der letzte Test ist über 5 Wochen alt: Re-Test fällig, die Spanne ist breiter.");
  if (missing) warnings.push(`${missing} von 8 Stationen ohne Benchmark: dafür gilt die Zeit aus dem Rennen von St. Gallen (mit ~).`);
  const basis = [
    `Laufen: Pacing-Test, Team Ø ${Math.floor(T / 60)}:${String(Math.round(T % 60)).padStart(2, "0")}/km`,
    `Stationen: Benchmark ${8 - missing} von 8`,
    cal.k != null ? `Simulationen: ${cal.n} eingetragen, k geeicht (${k.toFixed(2).replace(".", ",")})` : cal.floor != null ? "Simulation unter 85 %: zeigt nur eine Untergrenze" : "Noch keine Simulation ab 85 %: k ist eine Annahme",
  ];
  return {
    T, pace: run / 8, paces, run, st, rox: lv.rox, total,
    lo: total - Math.hypot(dRun, dLo, dRox), hi: total + Math.hypot(dRun, dHi, dRox),
    k, calibrated: cal.k != null, level: lv.name, missing, sources, stations: team, basis, warnings,
  };
}

/** Was hat sich gegenüber der Vorwoche bewegt? a, b = Ergebnisse von buildForecast (b = früher). {total, run, st, rox} in Sekunden (negativ = schneller). */
export function delta(a, b) {
  if (!a || !b) return null;
  return { total: a.total - b.total, run: a.run - b.run, st: a.st - b.st, rox: a.rox - b.rox };
}
