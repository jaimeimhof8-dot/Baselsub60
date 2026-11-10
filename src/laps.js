// Garmin-/Strava-Runden der Plan-Struktur zuordnen: Plan "2×2 km" ergibt 2 Wiederholungen à 2 km,
// auch wenn die Uhr jeden Kilometer als eigene Runde aufgezeichnet hat (Auto-Lap). Reine Funktionen, ohne DOM.
import { parseReps, paceOf, repSummary as looseSummary } from "./dashboard.js";
import { mmss } from "./util.js";
import { alignLaps } from "./align.js";

/** Wiederholungen aus den Runden, passend zur Plan-Vorgabe ("4×1 km", "2×2 km").
 * Zusammenhängende schnelle Runden werden auf die Plan-Distanz zusammengefasst, langsame (Trabpause, Ein-/Auslaufen) zählen nicht.
 * -> [{d, t, hr}] in zeitlicher Reihenfolge oder null, wenn die Runden nicht zur Vorgabe passen. */
export function segmentRuns(laps, planText) {
  const reps = parseReps(planText);
  if (!reps) return null;
  const shortReps = reps.dist <= 200; // Strides: Uhr misst «100 m» oft als 90–99 m (paceOf verlangt 100 m)
  const L = (laps || []).map((l, i) => ({ ...l, i, p: shortReps && l && l.t && l.d >= reps.dist * 0.6 ? l.t / (l.d / 1000) : paceOf(l) }));
  const valid = L.filter((l) => l.p && l.t >= (reps.dist <= 200 ? 10 : 20));
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

/**
 * Tolerante Zuordnung für die Anzeige (nicht für das Eintragen von Zeiten): Stimmt die Rundenzahl nicht genau, werden die Runden
 * nach Zeit dem Plan zugeordnet. Erlaubt sind eine zusammengefasste Doppelrunde (ein Schritt in zwei Runden gelappt), überzählige Runden
 * (Auto-Lap, Stopp) und nicht gelappte Pausen. Fehlt eine Arbeitsrunde oder passen die Zeiten schlecht, gibt es null (nichts geraten).
 * -> {times, hr, laps: Index je Schritt in merged | null, mode: "fuzzy", count, merged: [{d, t, hr}], merges, skipped} oder null
 */
export function alignFuzzy(laps, steps) {
  const n = (steps || []).length;
  let T = (laps || []).filter((l) => l && l.t > 0);
  while (T.length > 1 && T[T.length - 1].t < 15) T = T.slice(0, -1);
  const m = T.length;
  if (!n || !m || Math.abs(m - n) > 3) return null;
  const cost = (s, t) => (s.goal > 0 ? Math.abs(Math.log(t / s.goal)) : 0.35);
  const INF = 1e9;
  const f = Array.from({ length: n + 1 }, () => Array(m + 1).fill(INF));
  const bk = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));
  f[0][0] = 0;
  const relax = (i, j, c, how, pi, pj) => { if (c < f[i][j]) { f[i][j] = c; bk[i][j] = [how, pi, pj]; } };
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    const c = f[i][j];
    if (c >= INF) continue;
    if (i < n && j < m) relax(i + 1, j + 1, c + cost(steps[i], T[j].t), "m", i, j);
    if (i < n && j + 1 < m) relax(i + 1, j + 2, c + cost(steps[i], T[j].t + T[j + 1].t) + 0.3, "g", i, j);
    if (j < m) relax(i, j + 1, c + (T[j].t < 45 ? 0.15 : 1.0), "l", i, j);
    if (i < n) relax(i + 1, j, c + (steps[i].kind === "rest" ? 0.1 : 1.5), "s", i, j);
  }
  if (f[n][m] >= INF || f[n][m] > 0.4 * n) return null;
  const asg = Array(n).fill(null);
  let i = n, j = m, skipped = 0, merges = 0;
  while (i > 0 || j > 0) {
    const [how, pi, pj] = bk[i][j];
    if (how === "m") asg[pi] = [pj];
    else if (how === "g") { asg[pi] = [pj, pj + 1]; merges++; }
    else if (how === "l") skipped++;
    i = pi; j = pj;
  }
  if (steps.some((st, k) => st.kind !== "rest" && !asg[k])) return null;
  const merged = [], idx = [];
  asg.forEach((a) => {
    if (!a) { idx.push(null); return; }
    const ls = a.map((x) => T[x]), t = ls.reduce((q, l) => q + l.t, 0), d = ls.reduce((q, l) => q + (l.d || 0), 0);
    const hl = ls.filter((l) => l.hr), ht = hl.reduce((q, l) => q + l.t, 0);
    merged.push({ ...ls[0], t, d, hr: ht ? Math.round(hl.reduce((q, l) => q + l.hr * l.t, 0) / ht) : null });
    idx.push(merged.length - 1);
  });
  return { times: idx.map((k) => (k == null ? null : Math.round(merged[k].t))), hr: idx.map((k) => (k == null ? null : merged[k].hr || null)), laps: idx, mode: "fuzzy", count: m, merged, merges, skipped };
}

/**
 * Prüfbericht für eine Einheit von der Uhr: Was kam wirklich an? Reine Funktion, Grundlage der Anzeige „Garmin-Übernahme“.
 *  laps:      {n, state: "ok" | "wait" | "none"} – Runden da / werden beim nächsten Sync geholt (Garmin ohne lapsV 3) / keine
 *  splits:    nur mit steps (Stationstag): {state: "ok" | "bad" | "none", got, total, mode, count}
 *  intervals: nur mit Intervall-Text im Plan: {state: "ok" | "none", text}
 */
export function watchCheck(act, { steps = null, intervalText = "" } = {}) {
  const laps = (act && act.laps) || [];
  const wait = !!act && act.src === "garmin" && act.lapsV !== 3;
  const out = { laps: { n: laps.length, state: laps.length ? "ok" : wait ? "wait" : "none" }, splits: null, intervals: null };
  if (steps && steps.length) {
    const total = steps.filter((s) => s.kind !== "rest").length;
    if (!laps.length) out.splits = { state: "none", got: 0, total, mode: null, count: 0 };
    else {
      const r = alignSplits(laps, steps);
      const dp = r.times ? null : alignLaps(laps, steps);
      if (r.times) out.splits = { state: "ok", got: r.times.filter((t, k) => t != null && steps[k].kind !== "rest").length, total, mode: r.mode, count: r.count };
      else if (dp && dp.sure.some((x, k) => x && steps[k].kind !== "rest")) {
        // Nur sicher zugeordnete Schritte zählen; unsichere bleiben leer (nichts raten)
        const got = dp.sure.filter((x, k) => x && steps[k].kind !== "rest").length;
        const unsure = dp.sure.filter((x, k) => x === false && steps[k].kind !== "rest").length;
        out.splits = { state: "ok", got, total, mode: "dp", count: dp.count, tail: dp.tail, unsure };
      } else out.splits = { state: "bad", got: 0, total, mode: null, count: r.count };
    }
  }
  if (intervalText) {
    const text = laps.length ? repSummary(act, intervalText) : "";
    out.intervals = { state: text ? "ok" : "none", text };
  }
  return out;
}
