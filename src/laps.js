// Garmin-/Strava-Runden der Plan-Struktur zuordnen: Plan "2×2 km" ergibt 2 Wiederholungen à 2 km,
// auch wenn die Uhr jeden Kilometer als eigene Runde aufgezeichnet hat (Auto-Lap). Reine Funktionen, ohne DOM.
import { parseReps, paceOf, repSummary as looseSummary } from "./dashboard.js";
import { mmss } from "./util.js";

/** Wiederholungen aus den Runden, passend zur Plan-Vorgabe ("4×1 km", "2×2 km").
 * Zusammenhängende schnelle Runden werden auf die Plan-Distanz zusammengefasst, langsame (Trabpause, Ein-/Auslaufen) zählen nicht.
 * -> [{d, t, hr}] in zeitlicher Reihenfolge oder null, wenn die Runden nicht zur Vorgabe passen. */
export function segmentRuns(laps, planText) {
  const reps = parseReps(planText);
  if (!reps) return null;
  const L = (laps || []).map((l, i) => ({ ...l, i, p: paceOf(l) }));
  const valid = L.filter((l) => l.p && l.t >= 20);
  if (valid.length < 1) return null;

  // Referenz-Pace: die schnellsten Runden, bis die geplante Gesamtdistanz erreicht ist
  let got = 0, dist = 0, time = 0;
  for (const l of [...valid].sort((a, b) => a.p - b.p)) {
    dist += l.d; time += l.t; got += l.d;
    if (got >= reps.n * reps.dist) break;
  }
  const ref = time / (dist / 1000);
  const fast = (l) => l && l.p && l.p <= ref * 1.12;

  const segs = [];
  let acc = null;
  for (const l of L) {
    if (!fast(l) || (acc && l.i !== acc.last + 1)) acc = null;
    if (!fast(l)) continue;
    acc = acc || { d: 0, t: 0, hr: 0, hrt: 0, last: l.i };
    acc.d += l.d; acc.t += l.t; acc.last = l.i;
    if (l.hr) { acc.hr += l.hr * l.t; acc.hrt += l.t; }
    if (acc.d >= reps.dist * 0.92) {
      if (acc.d <= reps.dist * 1.15) segs.push({ d: acc.d, t: acc.t, hr: acc.hrt ? Math.round(acc.hr / acc.hrt) : null, i: l.i });
      acc = null;
    }
  }
  if (segs.length < Math.min(2, reps.n)) return null;
  // Mehr als geplant: die schnellsten n behalten (der Rest ist Mehrarbeit), Reihenfolge bleibt
  const pick = segs.length > reps.n ? [...segs].sort((a, b) => a.t / a.d - b.t / b.d).slice(0, reps.n).sort((a, b) => a.i - b.i) : segs;
  return pick.map(({ d, t, hr }) => ({ d, t, hr }));
}

const distLabel = (m) => (m >= 1000 ? `${(m / 1000).toString().replace(".", ",")} km` : `${m} m`);

/** Kurztext wie "2×2 km: 8:05 · 8:09 (Ø 4:03/km)": Struktur aus dem Plan, Zeiten aus den Runden.
 * Bei 1 km pro Wiederholung steht die Pace, sonst die Zeit je Wiederholung. Ohne passende Runden: bisherige Erkennung. */
export function repSummary(act, planText = "") {
  const reps = parseReps(planText);
  const segs = reps && act && act.laps ? segmentRuns(act.laps, planText) : null;
  if (!segs) return looseSummary(act, planText);
  const vals = segs.map((s) => (reps.dist === 1000 ? mmss(s.t / (s.d / 1000)) : mmss(s.t)));
  const avg = segs.reduce((x, s) => x + s.t, 0) / (segs.reduce((x, s) => x + s.d, 0) / 1000);
  return `${segs.length}×${distLabel(reps.dist)}: ${vals.join(" · ")} (Ø ${mmss(avg)}/km)`;
}

/**
 * Lap-Runden der Uhr den Plan-Schritten zuordnen. steps: [{kind: "station"|"run"|"rest"|…}] in Plan-Reihenfolge.
 * Erkannte Abläufe (Mini-Runden < 15 s am Ende, z. B. Stopp nach dem letzten Schritt, werden zuerst abgeschnitten):
 *  "direct" – je Schritt eine Runde (Pausen eingeschlossen)
 *  "work"   – nur die Arbeitsschritte haben Runden, Pausen wurden nicht gelappt
 *  "alt"    – Arbeit und Pause im Wechsel (Lap nach dem Satz, Lap nach der Pause): Arbeit liegt auf den geraden Runden
 * -> {times: [s|null je Schritt], hr: [Puls|null], laps: [Index der Runde|null], mode, count} oder {times: null, count} ohne Treffer.
 * Es wird nichts geraten oder aufgefüllt: ohne passende Rundenzahl gibt es null.
 */
export function alignSplits(laps, steps) {
  const n = (steps || []).length;
  const all = (laps || []).filter((l) => l && l.t > 0);
  if (!n) return { times: null, count: all.length };
  const work = steps.map((st, k) => ({ st, k })).filter((x) => x.st.kind !== "rest");
  const w = work.length;
  const layouts = (L) => {
    const pick = (idx, mode) => ({ times: idx.map((k) => (k == null ? null : Math.round(L[k].t))), hr: idx.map((k) => (k == null ? null : L[k].hr || null)), laps: idx, mode, count: L.length });
    if (L.length === n) return pick(steps.map((_, k) => k), "direct");
    if (w !== n && L.length === w) { const idx = Array(n).fill(null); work.forEach((x, m) => (idx[x.k] = m)); return pick(idx, "work"); }
    if (w > 1 && (L.length === 2 * w || L.length === 2 * w - 1)) { const idx = Array(n).fill(null); work.forEach((x, m) => (idx[x.k] = 2 * m)); return pick(idx, "alt"); }
    return null;
  };
  let T = all.slice();
  while (T.length > 1 && T[T.length - 1].t < 15) T = T.slice(0, -1);
  const hit = layouts(T) || layouts(all);
  const L = T;
  return hit || { times: null, count: L.length };
}
