// Rennbezug im Analyse-Tab: stellt eine Einheit neben das Renntempo der Prognose und das Tempo, das 60:00 verlangt.
// Reine Funktionen, ohne DOM. Die Prognose selbst (src/forecast.js) wird hier nur gelesen, nie verändert:
// sie bewegt sich nur durch Tests und Simulationen, nicht durch ein normales Training.
// Entwurf: docs/plan-analyse-rennbezug.md
import { RUN_BOUNDS } from "./forecast.js";

/** Nur Arbeitsläufe dieser Länge (m) werden mit dem Renntempo verglichen: im Rennen sind es 8 × 1 km. */
export const RACE_LAP = [800, 1200];

const pos = (v) => typeof v === "number" && isFinite(v) && v > 0;
const sure = (ph) => !!ph && (ph.conf === "sure" || ph.conf === "likely");
const isRun = (ph, i) => ph.phase[i] === "work" && ((ph.sub && ph.sub[i]) || "run") === "run";

/** Arbeitsläufe von rund 1 km aus den getrennten Phasen (Ergebnis von splitPhases). */
export function raceLaps(ph) {
  if (!ph || !ph.laps) return [];
  return ph.laps.filter((l, i) => isRun(ph, i) && l && l.d >= RACE_LAP[0] && l.d <= RACE_LAP[1] && pos(l.t));
}

/** Pace in s/km über mehrere Runden (Summe Zeit durch Summe Strecke) oder null. */
export function paceOfLaps(laps) {
  const L = (laps || []).filter((l) => l && pos(l.d) && pos(l.t));
  const d = L.reduce((s, l) => s + l.d, 0), t = L.reduce((s, l) => s + l.t, 0);
  return d > 0 ? t / (d / 1000) : null;
}

/**
 * Zeilen für den Block «Gegen Rennplan».
 *  ph: splitPhases · st: phaseStats · fc: buildForecast oder null · kind: Art der Einheit · easy: lockerer Lauf
 * -> null (kein Block) oder {state: "ok"|"nokm"|"notests", rows: [{id, v, d, bad, why?}]}
 *    Zeile "pace" trägt n = Anzahl der verglichenen Läufe.
 *    v in Sekunden (s/km), d = Unterschied in Sekunden (positiv = Ist ist langsamer bzw. Delta ist grösser), bad = d > 0
 */
export function racePlanRows({ ph, st, fc, goal = 3600, easy = false, kind } = {}) {
  if (easy || !["lauf", "station", "sim"].includes(kind) || !sure(ph)) return null;
  // Dauerlauf ohne Wiederholungen im Plan: alle Runden gelten als Arbeit (auch Ein- und Auslaufen). Kein Intervall-Lauf, kein Vergleich.
  if (ph.mode === "steady") return null;
  if (!ph.laps.some((l, i) => isRun(ph, i))) return null;
  const laps = raceLaps(ph), pace = paceOfLaps(laps);
  if (pace == null) return { state: "nokm", rows: [] };
  if (!fc || !pos(fc.total)) return { state: "notests", rows: [] };

  const P = Math.round(pace), rows = [{ id: "pace", v: P, d: null, bad: false, n: laps.length }];
  const cmp = (id, v, base) => { const x = Math.round(v), d = base - x; rows.push({ id, v: x, d, bad: d > 0 }); };
  if (pos(fc.pace)) cmp("fc", fc.pace, P);
  if (pos(fc.st) && pos(fc.rox)) {
    const need = (goal - fc.st - fc.rox) / 8;
    if (need < RUN_BOUNDS[0]) rows.push({ id: "need", v: null, d: null, bad: false, why: "Stationen und Roxzone allein lassen kein sub 60 zu" });
    else cmp("need", need, P);
  }
  const c = st && st.compromise && typeof st.compromise.avg === "number" && isFinite(st.compromise.avg) ? Math.round(st.compromise.avg) : null;
  if (c != null) {
    rows.push({ id: "comp", v: c, d: null, bad: false });
    // Aufschlag, mit dem die Prognose rechnet. Eicht eine Simulation die Laufzeiten, ist die Differenz kein reiner Aufschlag mehr: Zeile fehlt.
    const add = !fc.runCal && pos(fc.pace) && pos(fc.T) ? Math.round(fc.pace - fc.T) : 0;
    if (add > 0) rows.push({ id: "compfc", v: add, d: c - add, bad: c - add > 0 });
  }
  return { state: "ok", rows };
}
