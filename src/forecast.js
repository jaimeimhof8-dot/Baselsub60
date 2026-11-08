// Rennprognose Doubles: Laufen + Stationen + Roxzone aus euren echten Testwerten, mit Spanne, und sie eicht sich an Simulationen.
// Reine Funktionen, ohne DOM. Ausgangslage und Herleitung der Faktoren: siehe Plan «Rennprognose, die zu euren echten Daten passt».
import { fallbackStations, normDivision, DOUBLES_SHARE } from "./divisions.js";
import { normTime } from "./timeinput.js";

const ok = (v) => typeof v === "number" && isFinite(v) && v > 0;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sum = (a) => a.reduce((x, y) => x + y, 0);

/**
 * Team-Stationszeit im Rennen = Mittel der Solo-Benchmarks × k.
 * WICHTIG (Korrektur v3): Im Doubles arbeiten die Partner an einer Station nacheinander, nicht gleichzeitig. Die Teamzeit liegt
 * deshalb nahe an EINER Solo-Zeit (Pause des Partners hilft etwas, Ermüdung und Wechsel kosten), nicht bei ~0,55 davon.
 * Das frühere k = 0,80 ergab SkiErg 3:10 und RowErg 2:56 für die ganzen 1000 m, unter jeder plausiblen Grenze (und unter euren
 * eigenen Solo-Tests). Einziger echter Ankerpunkt: St. Gallen 2026, Stationen 24:03 = k ≈ 0,94 gegen die Solo-Summe von heute.
 * Alle drei Werte sind ANNAHMEN, keine Messung, bis Simulationen ab 85 % eingetragen sind: gut 0,88 = alles läuft,
 * mitte 0,95 = wie St. Gallen, vorsichtig 1,05 = Ermüdung deutlich grösser. Solo-Rennen: K_SOLO (keine Teilung, nur Ermüdung).
 */
export const K = { gut: 0.88, mitte: 0.95, vorsichtig: 1.05 };
export const K_SOLO = { gut: 0.98, mitte: 1.06, vorsichtig: 1.15 };
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

/** Plausibilitätsgrenzen für die GANZE Station, Men Pro, Sekunden [min, max]. Gilt für Solo-Eingaben und für Teamzeiten.
 * Reihenfolge wie review.STATIONS. Ausserhalb = Eingabefehler (oder Modellwert, der nicht stimmen kann), nicht Prognose. */
export const STATION_BOUNDS = [[200, 330], [60, 210], [90, 270], [120, 270], [200, 330], [50, 120], [120, 270], [180, 360]];
export const STATION_NAMES = ["SkiErg", "Sled Push", "Sled Pull", "Burpee BJ", "RowErg", "Farmers", "Lunges", "Wall Balls"];
// Teamzeiten je Station (Doubles Men Pro): P1 bis P99 von 1181 echten Teams (HyRanking). Schneller als P1 ist für ein Team nicht belegt.
export const TEAM_BOUNDS = [[196, 243], [82, 163], [145, 287], [89, 181], [213, 266], [70, 111], [124, 230], [193, 287]];
export const RUN_BOUNDS = [150, 420]; // 1 km Laufen: 2:30 bis 7:00
const fmt = (s) => Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0");

/** Zeit streng lesen: "m:ss", "h:mm:ss" oder 3–5 Ziffern ("256" = 2:56). Alles andere (auch "13") ist KEINE Zeit → NaN.
 * Bewusst nicht wie util.parseT: dort ist "13" = 13 Sekunden, das hat die unmöglichen Stationswerte erzeugt. Zahlen gelten als Sekunden. */
export function parseTimeStrict(v) {
  if (typeof v === "number") return ok(v) ? v : NaN;
  const s = normTime(String(v == null ? "" : v).trim());
  let m = s.match(/^(\d{1,2}):([0-5]\d)$/);
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(\d):([0-5]\d):([0-5]\d)$/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : NaN;
}

/** Eine Stationszeit prüfen. @returns {ok, s, reason?} reason = verständlicher Hinweis für die Anzeige */
export function checkStation(r, raw) {
  const txt = String(raw == null ? "" : raw).trim();
  if (!txt) return { ok: false, s: NaN, empty: true };
  const s = parseTimeStrict(raw), [lo, hi] = STATION_BOUNDS[r] || [0, Infinity];
  if (!ok(s)) return { ok: false, s: NaN, reason: `«${txt}» ist keine Zeit. Bitte als m:ss eintragen (z. B. ${fmt((lo + hi) / 2)}), nicht als nackte Zahl.` };
  if (s < lo) return { ok: false, s, reason: `${fmt(s)} ist unplausibel schnell für ${STATION_NAMES[r]} (ganze Station, schnellstens ${fmt(lo)}), bitte prüfen. ${r === 0 || r === 4 ? "Wahrscheinlich pro 500 m oder falsche Einheit." : "Wahrscheinlich nur ein Teil der Strecke oder falsche Einheit."}` };
  if (s > hi) return { ok: false, s, reason: `${fmt(s)} ist unplausibel langsam für ${STATION_NAMES[r]} (ganze Station, langsamstens ${fmt(hi)}), bitte prüfen.` };
  return { ok: true, s };
}
/** Laufzeit pro km prüfen (2:30 bis 7:00). */
export function checkRun(raw) {
  const txt = String(raw == null ? "" : raw).trim();
  if (!txt) return { ok: false, s: NaN, empty: true };
  const s = parseTimeStrict(raw);
  if (!ok(s)) return { ok: false, s: NaN, reason: `«${txt}» ist keine Zeit. Bitte als m:ss eintragen.` };
  if (s < RUN_BOUNDS[0] || s > RUN_BOUNDS[1]) return { ok: false, s, reason: `${fmt(s)} pro km ist unplausibel (erwartet ${fmt(RUN_BOUNDS[0])} bis ${fmt(RUN_BOUNDS[1])}), bitte prüfen.` };
  return { ok: true, s };
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
 *  station: 8 × [ich, Partner] Solo-Zeiten für die GANZE Station · sims: siehe calibrateK · testAgeDays: Alter des letzten Tests
 *  Zeiten dürfen Sekunden (Zahl) oder Text ("3:57", "357") sein. Unplausibles (siehe STATION_BOUNDS, RUN_BOUNDS) fliesst NICHT ein
 *  und steht in issues. names: Anzeigenamen der Partner für die Hinweise.
 * @returns null ohne Pace, sonst {T, pace, paces[8], run, st, rox, total, lo, hi, k, calibrated, level, missing, sources[8], stations[8], basis[], warnings[],
 *   issues[{kind,who,label,raw,reason}], scenarios{gut,mitte,vorsichtig:{k,run,st,rox,total}}, sub60{text,level,gap}, parts[{name,source,note}]}
 */
export function buildForecast({ lauf = [], laufPersons = null, station = [], base = null, division = null, sims = [], testAgeDays = null, names = ["Jaime", "Jimoh"] } = {}) {
  const issues = [];
  const cleanRuns = (arr, who) => (arr || []).map((raw, i) => {
    const c = checkRun(raw);
    if (c.reason) issues.push({ kind: "lauf", who, label: `Lauf ${i + 1}`, raw: String(raw), reason: c.reason });
    return c.ok ? c.s : NaN;
  });
  let reps, mismatch = 0;
  if (laufPersons) ({ reps, mismatch } = resolveRuns(laufPersons.map((p, i) => cleanRuns(p, names[i] || ""))));
  else reps = cleanRuns(lauf, "").filter(ok);
  const T = ok(base) ? base : reps.length ? mean(reps) : null;
  if (T == null) return null;

  const lv = levelOf(T), dv = normDivision(division), isSolo = dv.mode === "solo";
  const KS = isSolo ? K_SOLO : K;
  const share = isSolo ? 1 : DOUBLES_SHARE;
  let paces = Array.from({ length: 8 }, (_, i) => T + lv.fatigue + (i >= 4 ? DRIFT * (i - 3) : 0));

  const fb = fallbackStations(dv).map((v) => v * share); // Teamzeit aus dem Rennen von St. Gallen, wenn kein gültiger Benchmark da ist
  const sources = [], solo = [], badStations = [];
  for (let r = 0; r < 8; r++) {
    const v = [];
    (station[r] || []).forEach((raw, p) => {
      const c = checkStation(r, raw);
      if (c.reason) issues.push({ kind: "station", who: names[p] || "", label: STATION_NAMES[r], raw: String(raw), reason: c.reason });
      if (c.ok) v.push(c.s);
    });
    if (!v.length && (station[r] || []).some((x) => String(x == null ? "" : x).trim())) badStations.push(r);
    sources.push(v.length ? "bench" : "fallback");
    // Mittel der Partner (K ist am Mittel angesetzt; erst die Eichung an Simulationen mit Einzelzeiten fängt Unterschiede ein).
    solo.push(v.length ? mean(v) : null);
  }
  const allBench = sources.every((x) => x === "bench");
  const benchSum = allBench ? sum(solo) : null;

  // Simulationen: Teilzeiten prüfen; eine Simulation mit unmöglichem Wert eicht nichts
  const simsOk = [];
  (sims || []).forEach((sm, i) => {
    if (!sm) return;
    let parts = sm.parts;
    if (Array.isArray(parts) && parts.length === 8) {
      const cs = parts.map((x, r) => checkStation(r, x));
      const bad = cs.findIndex((c) => !c.ok);
      if (bad >= 0) { issues.push({ kind: "sim", who: "", label: `Simulation ${i + 1}: ${STATION_NAMES[bad]}`, raw: String(parts[bad]), reason: cs[bad].reason || "unplausibel" }); return; }
      parts = cs.map((c) => c.s);
      simsOk.push({ ...sm, parts, stations: sum(parts) });
    } else if (ok(sm.stations) && sm.stations >= sum(STATION_BOUNDS.map((b) => b[0])) && sm.stations <= sum(STATION_BOUNDS.map((b) => b[1]))) simsOk.push(sm);
    else issues.push({ kind: "sim", who: "", label: `Simulation ${i + 1}`, raw: String(sm.stations), reason: "Stationssumme unplausibel, bitte prüfen." });
  });
  const cal = calibrateK(simsOk, benchSum, allBench ? solo : null);

  let k = KS.mitte, kLo = KS.gut, kHi = KS.vorsichtig;
  if (cal.k != null) { k = cal.k; kLo = k * 0.97; kHi = k * 1.03; }
  if (cal.floor != null) { k = Math.max(k, cal.floor); kLo = Math.max(kLo, cal.floor); kHi = Math.max(kHi, k); }
  const kr = cal.perStation && cal.k != null && cal.floor == null ? cal.perStation : null; // je Station nur ohne widersprechende Untergrenze

  // Teamzeit je Station bei Faktor kk. Modellwerte ausserhalb der Plausibilitätsgrenze werden auf die Grenze gesetzt (nie schneller).
  const clamped = new Set();
  // Ohne Eichung je Station: Die Summe kommt aus den Benchmarks (Solo × kk), die Verteilung auf die Stationen aus dem echten Rennen
  // (St. Gallen). Ein Faktor allein verteilt falsch (z. B. RowErg 3:30 statt 4:01, Lunges 2:18 statt 3:21).
  const anchor = fallbackStations(dv).map((v) => v * share);
  const teamAt = (kk, fbF, note) => {
    const idx = solo.map((v, r) => (v == null ? -1 : r)).filter((r) => r >= 0);
    const sumModel = idx.reduce((a, r) => a + solo[r] * kk, 0), sumAnchor = idx.reduce((a, r) => a + anchor[r], 0) || 1;
    return solo.map((v, r) => {
      if (v == null) return fb[r] * fbF;
      const x = kr ? v * kr[r] * (kk / k) : anchor[r] * (sumModel / sumAnchor), [lo, hi] = TEAM_BOUNDS[r];
      if (x < lo || x > hi) { if (note) clamped.add(r); return Math.min(hi, Math.max(lo, x)); }
      return x;
    });
  };
  const team = teamAt(k, 1, true);
  const st = sum(team);
  const stAt = (kk, fbF) => sum(teamAt(kk, fbF));

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
  const dLo = (st - stAt(kLo, 0.93)) * widen, dHi = (stAt(kHi, 1.07) - st) * widen;
  const total = run + st + rox;

  // Szenarien: alle Teile gleichzeitig gut / mittel / vorsichtig (Eckfälle, kein Wahrscheinlichkeitsmass)
  const scen = (kk, fbF, d) => { const s2 = stAt(kk, fbF); return { k: kk, run: run + d * dRun, st: s2, rox: rox + d * dRox, total: run + d * dRun + s2 + rox + d * dRox }; };
  const scenarios = { gut: scen(kLo, 0.93, -1), mitte: scen(k, 1, 0), vorsichtig: scen(kHi, 1.07, 1) };
  const GOAL = 3600;
  const sub60 = scenarios.mitte.total <= GOAL
    ? { level: "mitte", gap: scenarios.mitte.total - GOAL, text: "Sub-60 schon im mittleren Szenario." }
    : scenarios.gut.total <= GOAL
      ? { level: "gut", gap: scenarios.mitte.total - GOAL, text: `Sub-60 nur im besten Szenario (alles läuft). Mittleres Szenario: ${fmt(scenarios.mitte.total - GOAL)} über 60:00.` }
      : { level: "nein", gap: scenarios.gut.total - GOAL, text: `Auch im besten Szenario ${fmt(scenarios.gut.total - GOAL)} über 60:00. Sub-60 braucht mehr als der heutige Stand hergibt.` };

  const missing = sources.filter((s) => s === "fallback").length;
  const warnings = [];
  if (mismatch) warnings.push("Die Uhren weichen im Test ab (über 2,5 %). Es zählt der schnellere Wert.");
  if (stale) warnings.push("Der letzte Test ist über 5 Wochen alt: Re-Test fällig, die Spanne ist breiter.");
  if (missing) warnings.push(`${missing} von 8 Stationen ohne gültigen Benchmark: dafür gilt die Zeit aus dem Rennen von St. Gallen (mit ~).`);
  if (issues.length) warnings.push(`${issues.length} Eingabe${issues.length > 1 ? "n" : ""} unplausibel, bitte prüfen. ${issues.length > 1 ? "Sie fliessen" : "Sie fliesst"} nicht in die Prognose ein.`);
  if (clamped.size) warnings.push(`Modellwert für ${[...clamped].map((r) => STATION_NAMES[r]).join(", ")} lag ausserhalb des Plausiblen und wurde auf die Grenze gesetzt.`);
  const basis = [
    `Laufen: Pacing-Test, Team Ø ${fmt(T)}/km`,
    `Stationen: gültiger Benchmark ${8 - missing} von 8`,
    cal.k != null ? `Simulationen: ${cal.n} eingetragen, k geeicht (${k.toFixed(2).replace(".", ",")})${kr ? ", je Station" : ""}${runCal ? ", Laufen gemessen" : ""}${roxCal ? ", Roxzone gemessen" : ""}` : cal.floor != null ? "Simulation unter 85 %: zeigt nur eine Untergrenze" : "Noch keine Simulation ab 85 %: k ist eine Annahme",
  ];
  const parts = [
    { name: "Laufen", source: runCal ? "gemessen (Simulation)" : "gemessen + geschätzt", note: runCal ? "aus Simulation" : `Test 4×1 km gemessen, Ermüdung (+${Math.round(lv.fatigue)} s/km) und Tempoverlust geschätzt` },
    { name: "Stationen", source: cal.k != null ? (missing ? "teils gemessen" : "gemessen (Simulation)") : missing ? "teils geschätzt" : "Solo gemessen, Teamfaktor geschätzt", note: cal.k != null ? "Faktor an Simulation geeicht" : `Solo-Benchmark gemessen, Teamfaktor k ${k.toFixed(2).replace(".", ",")} ist eine Annahme${missing ? `, ${missing} Station(en) aus St. Gallen geschätzt` : ""}` },
    { name: "Roxzone", source: roxCal ? "gemessen (Simulation)" : "geschätzt", note: roxCal ? "aus Simulation" : "Pauschale nach Niveau, nicht gemessen" },
  ];
  return {
    T, pace: run / 8, paces, run, st, rox, total,
    lo: total - Math.hypot(dRun, dLo, dRox), hi: total + Math.hypot(dRun, dHi, dRox),
    k, calibrated: cal.k != null, perStation: kr, runCal, roxCal, level: lv.name, missing, sources, stations: team, basis, warnings,
    issues, badStations, scenarios, sub60, parts,
  };
}

/** Was hat sich gegenüber der Vorwoche bewegt? a, b = Ergebnisse von buildForecast (b = früher). {total, run, st, rox} in Sekunden (negativ = schneller). */
export function delta(a, b) {
  if (!a || !b) return null;
  return { total: a.total - b.total, run: a.run - b.run, st: a.st - b.st, rox: a.rox - b.rox };
}
