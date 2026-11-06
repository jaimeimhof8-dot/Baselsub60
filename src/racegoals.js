// Race Goals: Zielzeit → Split-Plan für 8 Läufe, 8 Stationen und Roxzone (Doubles-Aufteilung inklusive). Reine Funktionen, ohne DOM.
// Gespeicherte Form (S.racegoal): {goal, scenario, locked: {id: true}, edits: {id: Sekunden}, lockTotal, actual: {id: Sekunden}, mode}
import { STATIONS, RACE_MODEL, GOAL_S } from "./review.js";

const ok = (v) => typeof v === "number" && isFinite(v) && v > 0;
const sum = (a) => a.reduce((x, y) => x + y, 0);

export const MIN_SPLIT = { run: 120, station: 40, rox: 60 }; // darunter ist ein Split unmöglich (Schutz vor Tippfehlern)
export const SCENARIOS = {
  ziel: { label: "Ziel", factor: 1, hint: "genau deine Zielzeit" },
  bequem: { label: "Bequem", factor: 1.03, hint: "3 % langsamer: sicher ankommen" },
  stretch: { label: "Stretch", factor: 0.97, hint: "3 % schneller: alles muss passen" },
  prognose: { label: "Prognose", factor: null, hint: "was die Tests aktuell hergeben" },
};

/** Wettkampfdistanzen der Stationen (Gesamtstrecke bei Doubles gleich wie solo) und Schrittweite für die Aufteilung. */
export const DISTANCE = [
  { total: 1000, unit: "m", step: 50 },
  { total: 50, unit: "m", step: 12.5 },
  { total: 50, unit: "m", step: 12.5 },
  { total: 80, unit: "m", step: 5 },
  { total: 1000, unit: "m", step: 50 },
  { total: 200, unit: "m", step: 25 },
  { total: 100, unit: "m", step: 10 },
  { total: 100, unit: "Wdh.", step: 5 },
];

/** Reihenfolge im Rennen: Lauf 1, SkiErg, Lauf 2, Sled Push … Lauf 8, Wall Balls, dann die Roxzone als Summe. */
export function slots() {
  const out = [];
  for (let i = 0; i < 8; i++) {
    out.push({ id: `r${i}`, kind: "run", label: `Lauf ${i + 1}`, i });
    out.push({ id: `s${i}`, kind: "station", label: STATIONS[i], i });
  }
  out.push({ id: "rox", kind: "rox", label: "Roxzone und Wechsel", i: 0 });
  return out;
}

/**
 * Verhältnisse der Teile. Mit Prognose (fc aus buildForecast): eure eigene Form, sonst das Rennmodell der App.
 * Das Rennmodell ist der gleichmässige Plan für 60:00 (4:00/km, Stationen geteilt).
 */
export function weightsOf(fc) {
  if (fc && fc.paces && fc.stations && ok(fc.rox)) return { run: fc.paces.slice(), st: fc.stations.slice(), rox: fc.rox, personal: true };
  return { run: Array(8).fill(RACE_MODEL.run / 8), st: RACE_MODEL.stations.slice(), rox: RACE_MODEL.rox, personal: false };
}

/** Ganze Sekunden, deren Summe genau das Ziel ergibt (Rest geht an die grössten Nachkommaanteile). */
export function roundTo(values, target) {
  const fl = values.map(Math.floor);
  let rest = Math.round(target - sum(fl));
  const order = values.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let n = 0; rest > 0 && n < order.length; n++, rest--) fl[order[n][1]] += 1;
  return fl;
}

/** Zielzeit eines Szenarios: «prognose» nimmt fc.total, die anderen rechnen vom Ziel. */
export function scenarioGoal(goal, scenario, fc) {
  const sc = SCENARIOS[scenario] || SCENARIOS.ziel;
  if (scenario === "prognose") return fc && ok(fc.total) ? Math.round(fc.total) : goal;
  return Math.round(goal * sc.factor);
}

/**
 * Plan bauen. state: S.racegoal. Reihenfolge: Szenario → Verteilung → manuelle Änderungen (edits) mit Sperren.
 * @returns {{total, target, splits: [{id, kind, label, sec, locked, edited, min}], lockTotal, personal, error}}
 */
export function buildPlan(state = {}, fc = null) {
  const goal = ok(state.goal) ? state.goal : GOAL_S;
  const target = scenarioGoal(goal, state.scenario || "ziel", fc);
  const w = weightsOf(fc);
  const base = slots().map((s) => (s.kind === "run" ? w.run[s.i] : s.kind === "station" ? w.st[s.i] : w.rox));
  const scale = target / sum(base);
  const secs = roundTo(base.map((v) => v * scale), target);
  const locked = state.locked || {}, edits = state.edits || {};
  const splits = slots().map((s, n) => ({ ...s, sec: secs[n], locked: !!locked[s.id], edited: false, min: MIN_SPLIT[s.kind] }));
  // Eigene Werte setzen, dann die freien Splits so anpassen, dass die Summe stimmt (wenn die Gesamtzeit gesperrt ist)
  let error = null;
  for (const s of splits) if (ok(edits[s.id])) { s.sec = Math.round(edits[s.id]); s.edited = true; s.locked = true; }
  const lockTotal = state.lockTotal !== false; // Standard: Gesamtzeit gesperrt (Ziel bleibt Ziel)
  if (lockTotal) error = rebalance(splits, target);
  return { total: sum(splits.map((s) => s.sec)), target, splits, lockTotal, personal: w.personal, error };
}

/** Freie Splits (nicht gesperrt) proportional verschieben, bis die Summe target ergibt. Gibt null oder einen Fehlertext zurück. */
export function rebalance(splits, target) {
  const free = splits.filter((s) => !s.locked);
  const fixed = sum(splits.filter((s) => s.locked).map((s) => s.sec));
  const need = target - fixed;
  const mins = sum(free.map((s) => s.min));
  if (!free.length) return sum(splits.map((s) => s.sec)) === target ? null : "Alle Splits sind gesperrt, die Summe passt nicht zur Zielzeit. Entsperre einen Split oder die Gesamtzeit.";
  if (need < mins) return `Die gesperrten Splits brauchen schon ${fmt(fixed)}: für die übrigen bleiben nur ${fmt(Math.max(0, need))}, nötig wären mindestens ${fmt(mins)}.`;
  // Proportional verteilen; wer unter sein Minimum fiele, wird auf das Minimum gesetzt und der Rest neu verteilt
  let pool = free.slice(), left = need;
  for (let guard = 0; guard < 20 && pool.length; guard++) {
    const tot = sum(pool.map((s) => s.sec)) || 1;
    const low = pool.filter((s) => (s.sec / tot) * left < s.min);
    if (!low.length) break;
    for (const s of low) { s.sec = s.min; left -= s.min; pool = pool.filter((x) => x !== s); }
  }
  const tot = sum(pool.map((s) => s.sec)) || 1;
  const vals = roundTo(pool.map((s) => (s.sec / tot) * left), left);
  pool.forEach((s, n) => (s.sec = vals[n]));
  return null;
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * Split ändern. Der geänderte Split wird gesperrt (er soll bleiben, wie du ihn gesetzt hast).
 * @returns neuer State (nie das Original verändern)
 */
export function setSplit(state, id, sec) {
  const sl = slots().find((s) => s.id === id);
  if (!sl || !ok(sec) || sec < MIN_SPLIT[sl.kind]) return state;
  return { ...state, edits: { ...(state.edits || {}), [id]: Math.round(sec) }, locked: { ...(state.locked || {}), [id]: true } };
}
export function toggleLock(state, id, sec) {
  if (!slots().some((s) => s.id === id)) return state;
  const locked = { ...(state.locked || {}) }, edits = { ...(state.edits || {}) };
  if (locked[id] || edits[id] != null) { delete locked[id]; delete edits[id]; } // entsperren heisst: zurück in den Ausgleich
  else {
    locked[id] = true;
    if (ok(sec)) edits[id] = Math.round(sec); // Sperren friert den aktuellen Wert ein, auch wenn sich Ziel oder Szenario ändern
  }
  return { ...state, locked, edits };
}
export function reset(state) {
  return { ...state, edits: {}, locked: {} };
}

/**
 * Ist-Zeiten gegen den Plan. actual {id: Sekunden}. Die Roxzone ist im Rennen in den Abschnitten enthalten (Wechsel gehören zum
 * Lauf bzw. zur Station, die Uhr zeigt sie dort): darum wird ihr Planwert auf die 16 Abschnitte verteilt und sie selbst nicht abgefragt.
 * delta > 0 = langsamer als geplant. Der kumulierte Abstand zählt nur eingetragene Abschnitte, Lücken verfälschen ihn nicht.
 */
export function progress(plan, actual = {}) {
  const rox = plan.splits.find((s) => s.kind === "rox"), body = plan.splits.filter((s) => s.kind !== "rox");
  const bodySum = body.reduce((a, s) => a + s.sec, 0) || 1;
  const eff = (s) => (s.kind === "rox" ? 0 : s.sec * (1 + (rox ? rox.sec : 0) / bodySum));
  let cumDelta = 0, cumPlan = 0, last = null;
  const rows = plan.splits.map((s) => {
    const e = eff(s);
    cumPlan += e;
    const a = actual[s.id];
    if (s.kind !== "rox" && ok(a)) {
      cumDelta += a - e;
      last = { id: s.id };
      return { id: s.id, label: s.label, plan: e, actual: a, delta: a - e, cumPlan, deltaCum: cumDelta };
    }
    return { id: s.id, label: s.label, plan: e, actual: null, delta: null, cumPlan, deltaCum: null };
  });
  const done = rows.filter((r) => r.actual != null).length;
  return { rows, ahead: last ? cumDelta : 0, projected: last ? plan.total + cumDelta : null, done };
}

/**
 * Doubles: wer macht wie viel einer Station? Aufteilung im Verhältnis der Tempi (der Schnellere übernimmt mehr),
 * gerundet auf die Schrittweite der Station. soloMe/soloPa = Solo-Benchmark (s) für die ganze Station.
 * @returns {{me, pa, unit, timeMe, timePa, step}|null}
 */
export function doublesShare(r, soloMe, soloPa, split) {
  const d = DISTANCE[r];
  if (!d || !ok(soloMe) || !ok(soloPa)) return null;
  const vMe = 1 / soloMe, vPa = 1 / soloPa;
  let me = Math.round((d.total * vMe / (vMe + vPa)) / d.step) * d.step;
  me = Math.min(d.total - d.step, Math.max(d.step, me)); // beide machen mindestens einen Schritt
  const pa = d.total - me;
  return { me, pa, unit: d.unit, step: d.step, timeMe: ok(split) ? split * ((me * soloMe) / (me * soloMe + pa * soloPa)) : null, timePa: ok(split) ? split * ((pa * soloPa) / (me * soloMe + pa * soloPa)) : null };
}

/** Vorschlag zum Teilen als Text (Nachricht an den Partner / Notiz). */
export function planText(plan, { name = "Race Goals" } = {}) {
  const lines = [`${name}: ${fmt(plan.total)}`];
  let cum = 0;
  for (const s of plan.splits) { cum += s.sec; lines.push(`${s.label.padEnd(20)} ${fmt(s.sec)}  (${fmt(cum)})`); }
  return lines.join("\n");
}
