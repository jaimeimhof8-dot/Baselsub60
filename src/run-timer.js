// Lauf-Timer für den Fokusmodus: die Schritte einer Planzeile (src/garmin-workout.js planSteps) als Abfolge von Abschnitten,
// je Abschnitt die gelaufene Zeit festhalten und daraus den Eintrag für die Zeile bauen. Reine Funktionen, ohne DOM.
import { mmss } from "./util.js";

const KIND_LABEL = { warmup: "Einlaufen", cooldown: "Auslaufen", interval: "Intervall", recovery: "Trabpause" };

/** Schritte (mit Wiederholungsgruppen) zu einer flachen Abfolge: [{kind, dist?, pace?, lap?, round?, rounds?}] */
export function flatten(steps) {
  const out = [];
  for (const s of steps || []) {
    if (s.kind === "repeat") for (let r = 1; r <= s.n; r++) for (const c of s.steps) out.push({ ...c, round: r, rounds: s.n });
    else out.push({ ...s });
  }
  // Nummerierung der Intervalle über die ganze Einheit (Intervall 2/3), Wiederholungsgruppen sind schon aufgelöst
  const total = out.filter((p) => p.kind === "interval").length;
  let k = 0;
  return out.map((p) => (p.kind === "interval" ? { ...p, nr: ++k, of: total } : p));
}

export const distLabel = (m) => (m >= 1000 ? `${(m / 1000).toString().replace(".", ",")} km` : `${m} m`);

/** Zielzeit in Sekunden (Distanz × Pace) oder null, wenn der Abschnitt keine feste Distanz und Pace hat. */
export const targetSec = (p) => (p && p.dist && p.pace ? Math.round((p.dist / 1000) * p.pace) : null);

/** Titel des Abschnitts: "Intervall 2/3", "Trabpause", "Einlaufen" */
export function phaseTitle(p) {
  if (!p) return "";
  return p.kind === "interval" && p.of > 1 ? `Intervall ${p.nr}/${p.of}` : KIND_LABEL[p.kind] || "Lauf";
}

/** Zweite Zeile: "1,5 km @ 4:10/km · Ziel 6:15" bzw. "Runden-Taste drücken" */
export function phaseGoal(p) {
  if (!p) return "";
  if (p.lap) return "weiter mit Tipp auf „Nächster Schritt“";
  const t = targetSec(p);
  return [p.pace ? `${distLabel(p.dist)} @ ${mmss(p.pace)}/km` : distLabel(p.dist), t ? `Ziel ${mmss(t)}` : ""].filter(Boolean).join(" · ");
}

/**
 * Anzeigewerte des Lauf-Dashboards im Fokusmodus: Tempo, Distanz im Abschnitt, Fortschritt, Puls, Rundenzeit, fertige Runden.
 * @param {{ph: object[], idx?: number, log?: number[], secs?: number, running?: boolean, base?: number|null, live?: {pace?: number|null, distM?: number|null}|null, bpm?: number|null}} a
 *   idx: aktueller Abschnitt, secs: Zeit im Abschnitt, base: Laufband-Distanz beim Start des Abschnitts, live: Laufband-Daten, bpm: Puls
 */
export function dashboard({ ph, idx = 0, log = [], secs = 0, running = false, base = null, live = null, bpm = null }) {
  const fin = idx >= ph.length;
  const cur = ph[Math.min(idx, ph.length - 1)] || null;
  const km = (m) => (m / 1000).toFixed(2).replace(".", ",");
  const pace = live && live.pace ? mmss(live.pace) : "–:––";
  const hr = bpm != null ? String(bpm) : "–";
  const laps = ph.slice(0, Math.min(idx, ph.length)).map((p, i) => ({ title: phaseTitle(p), time: mmss(log[i] || 0), pace: p.dist && log[i] > 0 ? mmss(Math.round(log[i] / (p.dist / 1000))) : "" })).slice(-4);
  if (fin) {
    // Nach dem letzten Abschnitt: Ring und Balken voll, Distanz = geplante Gesamtstrecke, keine Zielzeit mehr
    const total = ph.reduce((s, p) => s + (p.dist || 0), 0);
    return { fin, cur, pace, dist: total ? km(total) : "–", dgoal: total ? "km gesamt" : "km", barPct: 100, prog: 1, hr, rt: "✓", lgoal: "", laps };
  }
  const tgt = cur && cur.dist && !cur.lap ? cur.dist : 0;
  const ts = targetSec(cur);
  // Läuft der Abschnitt ohne Startwert (Laufband erst nach „Start“ verbunden), ist die Strecke unbekannt: Fortschritt über die Zeit
  const dm = live && live.distM != null ? (!running ? 0 : base != null ? Math.max(0, live.distM - base) : null) : null;
  const known = tgt > 0 && dm != null;
  const prog = known ? dm / tgt : ts && running ? secs / ts : 0;
  return {
    fin,
    cur,
    pace,
    dist: dm == null ? "–" : km(dm),
    dgoal: !tgt ? "km" : dm == null ? `Ziel ${km(tgt)} km` : `km von ${km(tgt)}`,
    barPct: known ? Math.min(100, Math.round((dm / tgt) * 100)) : 0,
    prog: Math.max(0, Math.min(1, prog)),
    hr,
    rt: mmss(Math.floor(secs)),
    lgoal: ts ? `Ziel ${mmss(ts)}` : "",
    laps,
  };
}

/** Eintrag für die Zeile aus den gelaufenen Zeiten (log: Sekunden je Abschnitt, gleiche Reihenfolge wie phases).
 * Trabpausen zählen nicht. "3×1,5 km: 6:12 · 6:10 · 6:18 (Ø 4:09/km)".
 * @returns {string} leer, wenn nichts Auswertbares gelaufen wurde */
export function splitSummary(phases, log) {
  const w = [];
  (phases || []).forEach((p, i) => {
    if (p.kind !== "recovery" && p.dist && log[i] > 0) w.push({ d: p.dist, t: log[i] });
  });
  if (!w.length) return "";
  const dist = w.reduce((s, x) => s + x.d, 0), time = w.reduce((s, x) => s + x.t, 0);
  const same = w.every((x) => x.d === w[0].d);
  const head = w.length > 1 && same ? `${w.length}×${distLabel(w[0].d)}` : distLabel(dist);
  return `${head}: ${w.map((x) => mmss(x.t)).join(" · ")} (Ø ${mmss(time / (dist / 1000))}/km)`;
}
