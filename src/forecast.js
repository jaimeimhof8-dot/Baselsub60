// Rennprognose Doubles: Laufen + Stationen + Roxzone aus euren echten Testwerten, mit Spanne, und sie eicht sich an Simulationen.
// Reine Funktionen, ohne DOM. Ausgangslage und Herleitung der Faktoren: siehe Plan «Rennprognose, die zu euren echten Daten passt».
import { fallbackStations, normDivision, DOUBLES_SHARE } from "./divisions.js";

const ok = (v) => typeof v === "number" && isFinite(v) && v > 0;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sum = (a) => a.reduce((x, y) => x + y, 0);

/**
 * Team-Stationszeit im Rennen = Solo-Benchmark der Station × DOUBLES_RATIO[Station] × FATIGUE_F.
 *
 * DOUBLES_RATIO: gemessen an 151 Athleten, die im selben Event Men Pro Solo UND Men Pro Doubles gelaufen sind (hyranking.com,
 * Saison 2025/26): Teamzeit im Doubles geteilt durch die eigene Solo-Rennzeit, Median je Station. Gesamt 0,75 (P10 0,66, P90 0,83).
 * Das ist weit weg von «halbe Arbeit = 0,5»: abgewechselt wird nacheinander, geschoben/gezogen wird teils zusammen.
 *
 * FATIGUE_F: Eure Benchmarks sind frisch gemessen, die Solo-Rennzeiten oben schon vom Laufen ermüdet. F rechnet frisch → Rennen um.
 * Eichpunkt: euer Rennen HYROX St. Gallen 16.01.2026 (Platz 58, Stationen 24:03 = 1443 s) gegen das Benchmark-Mittel vom 13.10.2026
 * (25:38 = 1538 s): 1443 / (1538 × 0,759) = 1,24. Das setzt voraus, dass die Oktober-Benchmarks eurer Form im Januar entsprechen.
 * Wart ihr im Januar schlechter, ist F kleiner (gut: 1,10 = Stationen 11 % schneller als im Januar); schlechter als im Januar
 * (vorsichtig 1,35). Eine Simulation ab 85 % ersetzt das alles (calibrateK).
 */
export const DOUBLES_RATIO = [0.89, 0.6, 0.73, 0.64, 0.92, 0.81, 0.72, 0.7]; // SkiErg, Push, Pull, Burpee BJ, RowErg, Farmers, Lunges, Wall Balls
export const FATIGUE_F = { gut: 1.1, mitte: 1.24, vorsichtig: 1.35 };
/** Zusammenfassung als einzelnes k für typische Benchmarks (Anzeige): mitte ≈ 0,94, vorher geraten 0,80. */
export const K = { gut: 0.84, mitte: 0.94, vorsichtig: 1.02 };
export const DRIFT = 3; // s/km zusätzlich pro Lauf ab Lauf 5 (nach den Burpee Broad Jumps)
export const MISMATCH = 0.025; // Abstand der Partner im selben Test, ab dem ein Messfehler vermutet wird
export const STALE_DAYS = 35; // älter: Spanne breiter, Re-Test fällig
export const SIM_MIN = 0.85; // erst Simulationen ab dieser Intensität eichen k

const lerp = (x, x0, x1, y0, y1) => y0 + (y1 - y0) * Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));

/**
 * Ermüdungsaufschlag (Compromised Running) und Roxzone-Zeit nach Niveau der Basis-Pace (s/km).
 * Stetig zwischen drei Stützpunkten (4:15 schnell, 4:30 mittel, 5:00 gemütlich), ausserhalb gilt der Rand.
 * Unter 4:15/km (inkl. St. Gallen 4:13 und eure 3:56) bleibt alles wie vorher (15 s, Roxzone 4:15).
 * Vorher sprang die Roxzone bei 4:15/km von 4:15 auf 5:15 (60 s Sprung durch 1 s Pace) – das war ein Rechenartefakt.
 */
export function levelOf(base) {
  const lo = base <= 270;
  const fatigue = lo ? lerp(base, 255, 270, 15, 20) : lerp(base, 270, 300, 20, 25);
  const rox = lo ? lerp(base, 255, 270, 255, 315) : lerp(base, 270, 300, 315, 360);
  return { name: base < 255 ? "schnell" : base < 285 ? "mittel" : "gemütlich", fatigue: Math.round(fatigue * 10) / 10, rox: Math.round(rox) };
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

export const HALF_LIFE_DAYS = 21; // Gewicht einer Simulation halbiert sich alle 3 Wochen (Form ändert sich)
export const SHRINK = 1; // Gewicht des Gesamt-k beim Glätten der Stations-k (eine Simulation zählt so viel wie das Gesamt-k)

const weighted = (items) => {
  const w = items.reduce((a, x) => a + x.w, 0);
  return w > 0 ? items.reduce((a, x) => a + x.v * x.w, 0) / w : null;
};
const recency = (s) => (ok(s.ageDays) ? Math.pow(0.5, s.ageDays / HALF_LIFE_DAYS) : 1);

/**
 * k aus Simulationen eichen. sims: [{intensity (0–1), stations (Team-Stationszeit der Simulation, s), parts?: 8 Stationszeiten,
 * run?: Laufzeit 8 km, rox?: Roxzone, ageDays?: Alter}]; benchSum = Summe der Mittel aller 8 Solo-Benchmarks; solo = die 8 Solo-Mittel.
 * ≥ 85 % Intensität: k = beobachteter Wert. Ohne ageDays zählen die letzten zwei gleich, mit ageDays zählen jüngere mehr.
 * Darunter: nur Untergrenze («mindestens so langsam»).
 * Mit parts und solo: perStation = je Station eigenes k, zum Gesamt-k hin geglättet (eine Simulation reicht nie für ein Extrem).
 * @returns {{k: number|null, floor: number|null, n: number, perStation: number[]|null, run: number|null, rox: number|null}}
 */
export function calibrateK(sims, benchSum, solo = null) {
  const none = { k: null, floor: null, n: 0, perStation: null, run: null, rox: null };
  if (!ok(benchSum)) return none;
  const obs = (sims || []).filter((s) => s && ok(s.stations) && ok(s.intensity)).map((s) => ({ ...s, k: s.stations / benchSum, i: s.intensity, w: recency(s) }));
  const anyAge = obs.some((s) => ok(s.ageDays));
  const strongAll = obs.filter((s) => s.i >= SIM_MIN);
  const strong = anyAge ? strongAll.slice(-4) : strongAll.slice(-2);
  const weak = obs.filter((s) => s.i < SIM_MIN).map((s) => s.k);
  const k = strong.length ? weighted(strong.map((s) => ({ v: s.k, w: s.w }))) : null;
  let perStation = null;
  if (k != null && Array.isArray(solo) && solo.length === 8 && solo.every(ok)) {
    const withParts = strong.filter((s) => Array.isArray(s.parts) && s.parts.length === 8 && s.parts.every(ok));
    if (withParts.length) {
      const nEff = withParts.reduce((a, s) => a + s.w, 0);
      perStation = solo.map((v, r) => {
        const kr = weighted(withParts.map((s) => ({ v: s.parts[r] / v, w: s.w })));
        return (nEff * kr + SHRINK * k) / (nEff + SHRINK);
      });
    }
  }
  const pick = (f) => weighted(strong.filter((s) => ok(s[f])).map((s) => ({ v: s[f], w: s.w })));
  return { k, floor: weak.length ? Math.max(...weak) : null, n: obs.length, perStation, run: pick("run"), rox: pick("rox") };
}

/**
 * Prognose für den Renntag aus dem Verlauf der Wochenprognosen. history: [{day (Tag im Plan), total (s)}].
 * Robuste Steigung (Theil–Sen: Median aller Paarsteigungen, ein Ausreisser kippt sie nicht). Der Fortschritt flacht ab
 * (Zeitkonstante TAU Tage), gedeckelt bei MAX_GAIN der Zeit. Verschlechtert sich der Trend, wird nicht extrapoliert.
 * Das ist eine Faustregel, kein Messwert: die Spanne wächst mit dem Abstand zum Renntag.
 * @returns {{total, gain, lo, hi, slopePerWeek, points}|null} null bei weniger als 3 Punkten oder unter 14 Tagen Abstand
 */
export const TAU = 60;
export const MAX_GAIN = 0.08;
export function projectRaceDay(history, daysLeft) {
  const h = (history || []).filter((x) => x && isFinite(x.day) && ok(x.total)).sort((a, b) => a.day - b.day);
  if (h.length < 3 || h[h.length - 1].day - h[0].day < 14 || !isFinite(daysLeft) || daysLeft < 0) return null;
  const slopes = [];
  for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) if (h[j].day > h[i].day) slopes.push((h[j].total - h[i].total) / (h[j].day - h[i].day));
  slopes.sort((a, b) => a - b);
  const m = slopes.length >> 1, slope = slopes.length % 2 ? slopes[m] : (slopes[m - 1] + slopes[m]) / 2;
  const cur = h[h.length - 1].total;
  const raw = slope < 0 ? -slope * TAU * (1 - Math.exp(-daysLeft / TAU)) : 0;
  const gain = Math.min(raw, cur * MAX_GAIN);
  const total = cur - gain, band = 30 + 0.5 * gain;
  return { total, gain, lo: total - band, hi: cur + 30, slopePerWeek: slope * 7, points: h.length };
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
  let paces = Array.from({ length: 8 }, (_, i) => T + lv.fatigue + (i >= 4 ? DRIFT * (i - 3) : 0));

  const fb = fallbackStations(dv).map((v) => v * share); // Teamzeit aus dem Rennen von St. Gallen, wenn kein Benchmark da ist
  const sources = [], solo = [];
  for (let r = 0; r < 8; r++) {
    const v = (station[r] || []).filter(ok);
    sources.push(v.length ? "bench" : "fallback");
    // Mittel der Partner. (Das harmonische Mittel wäre bei ungleichen Partnern theoretisch schneller, aber K ist am Mittel angesetzt
    // und es gibt keine Messung, die den Gewinn belegt: erst die Eichung an Simulationen mit Einzelzeiten (perStation) fängt das ein.)
    solo.push(v.length ? mean(v) : null);
  }
  const allBench = sources.every((x) => x === "bench");
  const benchSum = allBench ? sum(solo) : null;
  const cal = calibrateK(sims, benchSum, allBench ? solo : null);

  // Ohne Simulation: je Station Verhältnis aus den Paardaten × Ermüdung. Mit Simulation: gemessen (perStation oder Gesamt-k).
  let kr = DOUBLES_RATIO.map((x) => x * FATIGUE_F.mitte), k, kLo, kHi;
  const have = solo.map((v) => v != null);
  const wk = (vec) => (have.some(Boolean) ? sum(solo.map((v, r) => (v == null ? 0 : v * vec[r]))) / sum(solo.map((v) => v || 0)) : K.mitte);
  k = wk(kr);
  kLo = k * (FATIGUE_F.gut / FATIGUE_F.mitte);
  kHi = k * (FATIGUE_F.vorsichtig / FATIGUE_F.mitte);
  if (cal.k != null) {
    k = cal.k; kLo = k * 0.97; kHi = k * 1.03;
    kr = cal.perStation && cal.floor == null ? cal.perStation : Array(8).fill(k);
  }
  if (cal.floor != null && cal.floor > k) { // eine lockere Simulation zeigt nur eine Untergrenze
    const f = cal.floor / k;
    kr = kr.map((x) => x * f); k = cal.floor; kLo = Math.max(kLo, cal.floor); kHi = Math.max(kHi, k);
  }
  const kOf = (r) => kr[r];
  const team = solo.map((v, r) => (v == null ? fb[r] : v * kOf(r)));
  const at = (kk, fbF) => sum(solo.map((v, r) => (v == null ? fb[r] * fbF : v * kr[r] * (kk / k))));
  const st = sum(team);

  // Laufen und Roxzone: aus Simulationen, wenn dort gemessen (nur ≥ 85 %), sonst Modell
  let rox = lv.rox, runCal = false, roxCal = false;
  const modelRun = sum(paces);
  if (cal.run != null && cal.run > modelRun * 0.8 && cal.run < modelRun * 1.5) {
    const f = cal.run / modelRun;
    paces = paces.map((p) => p * f);
    runCal = true;
  }
  if (cal.rox != null && cal.rox > 60 && cal.rox < 900) { rox = Math.round(cal.rox); roxCal = true; }
  const run = sum(paces);

  const stale = ok(testAgeDays) && testAgeDays > STALE_DAYS, widen = stale ? 1.3 : 1;
  const dRun = 8 * (runCal ? 5 : 10) * widen, dRox = (roxCal ? 10 : 20) * widen;
  const dLo = (st - at(kLo, 0.93)) * widen, dHi = (at(kHi, 1.07) - st) * widen;
  const total = run + st + rox;

  const missing = sources.filter((s) => s === "fallback").length;
  const warnings = [];
  if (mismatch) warnings.push("Die Uhren weichen im Test ab (über 2,5 %). Es zählt der schnellere Wert.");
  if (stale) warnings.push("Der letzte Test ist über 5 Wochen alt: Re-Test fällig, die Spanne ist breiter.");
  if (missing) warnings.push(`${missing} von 8 Stationen ohne Benchmark: dafür gilt die Zeit aus dem Rennen von St. Gallen (mit ~).`);
  const basis = [
    `Laufen: Pacing-Test, Team Ø ${Math.floor(T / 60)}:${String(Math.round(T % 60)).padStart(2, "0")}/km`,
    `Stationen: Benchmark ${8 - missing} von 8`,
    cal.k != null ? `Simulationen: ${cal.n} eingetragen, k geeicht (${k.toFixed(2).replace(".", ",")})${cal.perStation && cal.floor == null ? ", je Station" : ""}${runCal ? ", Laufen gemessen" : ""}${roxCal ? ", Roxzone gemessen" : ""}` : cal.floor != null ? "Simulation unter 85 %: zeigt nur eine Untergrenze" : "Noch keine Simulation ab 85 %: k ist eine Annahme",
  ];
  return {
    T, pace: run / 8, paces, run, st, rox, total,
    lo: total - Math.hypot(dRun, dLo, dRox), hi: total + Math.hypot(dRun, dHi, dRox),
    k, calibrated: cal.k != null, perStation: cal.perStation && cal.k != null && cal.floor == null ? cal.perStation : null, runCal, roxCal, level: lv.name, missing, sources, stations: team, basis, warnings,
  };
}

/** Was hat sich gegenüber der Vorwoche bewegt? a, b = Ergebnisse von buildForecast (b = früher). {total, run, st, rox} in Sekunden (negativ = schneller). */
export function delta(a, b) {
  if (!a || !b) return null;
  return { total: a.total - b.total, run: a.run - b.run, st: a.st - b.st, rox: a.rox - b.rox };
}
