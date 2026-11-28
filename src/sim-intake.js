// Simulationstag → Vorschlag für die Rennprognose (Teil-Simulation). Reine Funktionen, ohne DOM.
// Quelle je Station: zuerst die Handeingabe an der Stationszeile (S.val), sonst die zugeordnete Garmin-Runde.
// Übernommen wird nur nach Bestätigung (index.html, Analyse des Simulationstags). Rechnung: src/forecast.js calibrateK.
import { checkStation, parseTimeStrict } from "./forecast.js";
import { mmss } from "./util.js";

// Reihenfolge wie review.STATIONS / forecast.STATION_NAMES. full = Renndistanz (Meter bzw. Wiederholungen bei Wall Balls).
const MAP = [
  { re: /ski\s*erg/i, full: 1000 },
  { re: /sled\s*push|schlitten\s*schieben/i, full: 50 },
  { re: /sled\s*pull|schlitten\s*ziehen/i, full: 50 },
  { re: /burpee/i, full: 80 },
  { re: /row\s*erg|rudern/i, full: 1000 },
  { re: /farmer/i, full: 200 },
  { re: /lunge/i, full: 100 },
  { re: /wall\s*ball/i, full: 100 },
];

/** Plan-Name einer Station → Index 0–7, -1 = keine Rennstation */
export function stationIndex(name) {
  const s = String(name || "");
  return MAP.findIndex((m) => m.re.test(s));
}

/** Distanz/Wiederholungen aus «50 m · 225 kg …» bzw. «100 · 9 kg …» (Wall Balls), null = unbekannt */
const distOf = (sub) => {
  const m = /^\s*(\d[\d'.]*)\s*(m\b)?/.exec(String(sub || ""));
  return m ? +m[1].replace(/['.]/g, "") : null;
};

/** Vorschlag für die Intensität aus dem RPE: 8–10 → 90 %, 7 → 85 %, darunter 80 %. Ohne RPE 85 %. */
export function intensityFromRpe(rpe) {
  const r = Number(rpe);
  if (rpe == null || rpe === "" || !isFinite(r) || r <= 0) return 0.85;
  return r >= 8 ? 0.9 : r >= 7 ? 0.85 : 0.8;
}

/**
 * Vorschlag aus einem Simulationstag.
 * @param {object} o
 * @param {Array} o.steps Schritte aus simsteps.simSteps (kind, name, sub, goal, j)
 * @param {(j:number)=>string} [o.val] Handeingabe der Planzeile j (S.val)
 * @param {Array} [o.rows] Plan gegen Ist der Uhr ({name, kind, t}), nur zugeordnete Runden
 * @param {number|null} [o.rpe]
 * @returns {{i:number, st:string[], src:string[], goal:number[], name:string[], note:string[], n:number} | null}
 *   st = 8 Zeiten «m:ss» oder "" (nicht gemessen); src = "hand" | "uhr" | ""; note = Grund, warum eine Station fehlt
 */
export function simDraft({ steps, val = () => "", rows = [], rpe = null } = {}) {
  if (!Array.isArray(steps) || !steps.length) return null;
  const st = Array(8).fill(""), src = Array(8).fill(""), goal = Array(8).fill(0), name = Array(8).fill(""), note = Array(8).fill("");
  const perLine = {};
  steps.forEach((s) => { perLine[s.j] = (perLine[s.j] || 0) + 1; });
  const uhr = (rows || []).filter((r) => r && r.kind === "station");
  let any = false;
  steps.filter((s) => s.kind === "station").forEach((s) => {
    const r = stationIndex(s.name);
    if (r < 0 || name[r]) return; // keine Rennstation oder doppelt: erste zählt
    any = true;
    name[r] = s.name;
    goal[r] = s.goal || 0;
    const d = distOf(s.sub);
    if (d != null && d !== MAP[r].full) { note[r] = `nur ${d}${r === 7 ? " Wiederholungen" : " m"} statt ${MAP[r].full}${r === 7 ? "" : " m"}`; return; }
    // Handeingabe nur, wenn die Zeile allein der Station gehört (sonst gehört der Wert zum Lauf davor)
    const raw = perLine[s.j] === 1 ? String(val(s.j) || "").trim() : "";
    if (raw) {
      const c = checkStation(r, raw);
      if (c.ok) { st[r] = mmss(c.s); src[r] = "hand"; return; }
      if (!isNaN(parseTimeStrict(raw))) { note[r] = c.reason || "unplausibel"; return; }
      // «202 kg» o. ä.: keine Zeit, Uhr versuchen
    }
    const u = uhr.find((x) => stationIndex(x.name) === r);
    if (u && u.t > 0) {
      const c = checkStation(r, u.t);
      if (c.ok) { st[r] = mmss(c.s); src[r] = "uhr"; return; }
      note[r] = "Uhr: " + (c.reason || "unplausibel");
      return;
    }
    note[r] = "keine Zeit (weder eingetragen noch von der Uhr zugeordnet)";
  });
  if (!any) return null;
  return { i: intensityFromRpe(rpe), st, src, goal, name, note, n: st.filter(Boolean).length };
}
