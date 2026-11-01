// Dashboard zur Einheit: die wichtigsten Fakten als Kacheln, Rundenbalken und Coach-Kennzahlen.
// Reine Funktionen ohne DOM; die Anzeige steht in index.html (s7DashHtml). Der Fliesstext der Analyse bleibt darunter.
import { paceOf } from "./dashboard.js";
import { mmss } from "./util.js";

const hms = (s) => (s >= 3600 ? Math.floor(s / 3600) + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0") + " h" : mmss(s) + " min");
const de = (n, d = 1) => n.toFixed(d).replace(".", ",");

/**
 * @param quick Ergebnis von analyseSession (score, tone, verdict, facts)
 * @param act   Aktivität der Uhr {time, dist, hr, maxHr, kcal, laps} oder null
 * @param coach geparste Coach-Analyse (coach.parseAnalysis) oder null
 * @returns {score, tone, verdict, tiles: [{k, v, sub, tone}], laps: [{t, label, hr, pace, h}] | null, chips: [{k, v, tone}], focus}
 */
export function sessionDash(quick, act, coach) {
  const f = quick.facts || {};
  const tiles = [];
  if (f.n) tiles.push({ k: "Umsetzung", v: `${f.done}/${f.n}`, sub: `${Math.round((f.done / f.n) * 100)} % des Plans`, tone: f.done / f.n >= 0.999 ? "green" : f.done / f.n >= 0.75 ? "yellow" : "red" });
  if (f.rpe != null) {
    const ref = f.target != null ? f.target : null;
    const d = ref != null ? f.rpe - ref : null;
    tiles.push({ k: "Anstrengung", v: `${f.rpe}/10`, sub: ref != null ? `Vorgabe ≈ ${de(ref, 0)}` : f.lim != null ? `Wochenlimit ${de(f.lim)}` : "", tone: d == null ? "" : Math.abs(d) <= 1 ? "green" : d > 1 ? "red" : "yellow" });
  }
  if (act && act.time) tiles.push({ k: "Dauer", v: hms(act.time), sub: act.dist ? de(act.dist / 1000) + " km" + (act.group === "run" && act.dist > 200 ? " · " + mmss(act.time / (act.dist / 1000)) + "/km" : "") : "", tone: "" });
  if (act && act.hr) tiles.push({ k: "Ø Puls", v: String(act.hr), sub: act.maxHr ? "max " + act.maxHr : "", tone: "" });
  if (f.up || f.down || f.same) tiles.push({ k: "Gewichte", v: `▲${f.up || 0} ▼${f.down || 0}`, sub: `${f.same || 0} gleich`, tone: f.down > f.up ? "red" : f.up ? "green" : "" });

  let laps = null;
  const L = ((act && act.laps) || []).filter((l) => l && l.t > 0).slice(0, 40);
  if (L.length >= 2) {
    const max = Math.max(...L.map((l) => l.t));
    laps = L.map((l) => ({ t: l.t, label: mmss(l.t), hr: l.hr || null, pace: l.d >= 300 && paceOf(l) ? mmss(paceOf(l)) : null, h: Math.max(8, Math.round((l.t / max) * 100)) }));
  }

  const chips = [];
  let focus = "";
  if (coach) {
    if (coach.form && coach.form.rating) chips.push({ k: "Form", v: coach.form.rating, tone: coach.form.rating === "auf Kurs" ? "green" : coach.form.rating === "unklar" ? "" : coach.form.rating === "über Plan" ? "yellow" : "red" });
    chips.push({ k: "Stärken", v: String(coach.strengths.length), tone: coach.strengths.length ? "green" : "" });
    chips.push({ k: "Schwächen", v: String(coach.weaknesses.length), tone: coach.weaknesses.length ? "red" : "" });
    chips.push({ k: "Anpassungen", v: String(coach.adjustments.length), tone: coach.adjustments.length ? "yellow" : "" });
    focus = coach.nextFocus || "";
  }
  return { score: quick.score, tone: quick.tone, verdict: quick.verdict, tiles, laps, chips, focus };
}

const sgn = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±");

/**
 * Vergleich mit der letzten gleichen Einheit (gleiche Art und gleicher Plantitel, sonst gleiche Art).
 * cur / prev: {act: {time, dist, hr, group} | null, rpe: number | null}; easy = lockerer Lauf (langsamer ist dann kein Minus).
 * -> [{k, v, sub, tone}] nur mit Werten, die in beiden Einheiten vorhanden sind
 */
export function compareToPrev(cur, prev, { easy = false } = {}) {
  const rows = [];
  if (!cur || !prev) return rows;
  const a = cur.act, b = prev.act;
  const pace = (x) => (x && x.group === "run" && x.dist >= 1000 && x.time ? x.time / (x.dist / 1000) : null);
  const pc = pace(a), pp = pace(b);
  let dPace = null;
  if (pc && pp) {
    dPace = Math.round(pc - pp);
    rows.push({ k: "Pace", v: `${sgn(dPace)}${Math.abs(dPace)} s/km`, sub: `vorher ${mmss(pp)}/km`, tone: easy ? "" : dPace <= -2 ? "green" : dPace >= 5 ? "yellow" : "" });
  }
  if (a && b && a.hr && b.hr) {
    const d = Math.round(a.hr - b.hr);
    const fasterNow = dPace != null && dPace <= -2; // höherer Puls bei klar schnellerem Tempo ist kein Rückschritt
    rows.push({ k: "Ø Puls", v: `${sgn(d)}${Math.abs(d)} bpm`, sub: `vorher ${b.hr}`, tone: d <= -3 ? "green" : d >= 4 && !fasterNow ? "yellow" : "" });
  }
  if (cur.rpe != null && prev.rpe != null) {
    const d = Math.round((cur.rpe - prev.rpe) * 10) / 10;
    rows.push({ k: "Anstrengung", v: `${sgn(d)}${de(Math.abs(d), d % 1 ? 1 : 0)}`, sub: `vorher ${prev.rpe}/10`, tone: d <= -1 ? "green" : d >= 1 ? "yellow" : "" });
  }
  if (a && b && a.time && b.time) {
    const d = Math.round(a.time - b.time);
    rows.push({ k: "Dauer", v: `${sgn(d)}${mmss(Math.abs(d))} min`, sub: `vorher ${hms(b.time)}`, tone: "" });
  }
  return rows;
}
