// Zeitreihen für die Vergleichs-Diagramme im Garmin-Stil. Reiner Kern ohne DOM (Tests: test/series.test.js).
// Nie eine Zahl erfinden: Fehlt die Sekundenreihe (alte Aktivität), werden die Rundenmittel als Stufen gezeigt, sonst bleibt es leer.
import { alignFuzzy } from "./laps.js";

const pos = (v) => (typeof v === "number" && isFinite(v) && v > 0 ? v : null);
const arr = (a, n) => (Array.isArray(a) && a.length === n ? a : Array(n).fill(null));

/** Pace s/km aus Tempo in cm/s. Unter 0,6 m/s (Stehen) oder langsamer als 12:00/km: null. */
export const paceFromV = (v) => (v != null && v >= 60 && 1e5 / v <= 720 ? 1e5 / v : null);

/**
 * Zeitreihe einer Aktivität in einheitlicher Form {src: "series"|"laps", t (s), d (m), hr, v (cm/s), el (dm), cad} (gleich lange Arrays) oder null.
 * Ohne Sekundenreihe: aus den Runden Stufen (Rundenmittel über die Rundendauer).
 */
export function seriesOf(act) {
  const s = act && act.series;
  if (s && Array.isArray(s.t) && s.t.length >= 2) {
    const n = s.t.length;
    return { src: "series", t: s.t, d: arr(s.d, n), hr: arr(s.hr, n), v: arr(s.v, n), el: arr(s.el, n), cad: arr(s.cad, n) };
  }
  const laps = (act && act.laps ? act.laps : []).filter((l) => l && l.t > 0);
  if (!laps.length) return null;
  const o = { src: "laps", t: [], d: [], hr: [], v: [], el: [], cad: [] };
  let t = 0, d = 0;
  for (const l of laps) {
    const dd = pos(l.d) || 0, v = dd >= 100 ? Math.round((dd / l.t) * 100) : null, hr = pos(l.hr);
    const push = (tt, dist) => { o.t.push(tt); o.d.push(dist); o.hr.push(hr); o.v.push(v); o.el.push(null); o.cad.push(null); };
    push(t, d);
    push(t + l.t - 0.01, d + dd);
    t += l.t; d += dd;
  }
  return o;
}

/** Größtes i mit xs[i] <= x (xs aufsteigend). */
const upper = (xs, x) => { let lo = 0, hi = xs.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (xs[m] <= x) lo = m; else hi = m - 1; } return lo; };

/** Reihe yk auf ein gemeinsames Raster abbilden (linear). Außerhalb der Reihe und neben Lücken: null. */
export function resample(S, xk, grid, yk) {
  const xs = S[xk], ys = S[yk];
  if (!xs || !ys) return grid.map(() => null);
  const n = xs.length;
  return grid.map((g) => {
    if (xs[0] == null || g < xs[0] || g > xs[n - 1]) return null;
    const i = upper(xs, g), a = ys[i], b = i + 1 < n ? ys[i + 1] : a;
    if (a == null) return null;
    if (b == null) return xs[i] === g ? a : null;
    const x0 = xs[i], x1 = i + 1 < n ? xs[i + 1] : x0;
    return x1 > x0 ? a + ((b - a) * (g - x0)) / (x1 - x0) : a;
  });
}

/** Gleitender Mittelwert über w Punkte. Lücken bleiben Lücken. */
export function smooth(a, w) {
  if (w <= 1) return a.slice();
  const h = w >> 1;
  return a.map((v, i) => {
    if (v == null) return null;
    let s = 0, c = 0;
    for (let k = Math.max(0, i - h); k <= Math.min(a.length - 1, i + h); k++) if (a[k] != null) { s += a[k]; c++; }
    return c ? s / c : null;
  });
}

const diffOf = (a, b) => a.map((v, i) => (v != null && b[i] != null ? v - b[i] : null));
const hasAny = (a) => a.some((v) => v != null);

/**
 * Alles, was die Diagramme brauchen. xk: "t" (Sekunden) oder "d" (Meter), N Rasterpunkte.
 * -> null ohne Daten, sonst {xk, grid, N, xmax, persons: {me, pa}: {src, hr, pace, el (m), cad, dist}, diff: {hr, pace, dist}, has, src}
 * persons.pa ist null, wenn der Partner keine Reihe hat. Pace = auf ca. 15 s geglättetes Tempo in s/km.
 */
export function buildPlot(meAct, paAct, { xk = "t", N = 600 } = {}) {
  const S = { me: seriesOf(meAct), pa: seriesOf(paAct) };
  if (!S.me && !S.pa) return null;
  const ext = (s) => (s ? (xk === "d" ? s.d.filter((v) => v != null) : s.t).slice(-1)[0] || 0 : 0);
  const xmax = Math.max(ext(S.me), ext(S.pa));
  if (!(xmax > 0)) return null;
  const grid = Array.from({ length: N }, (_, i) => (xmax * i) / (N - 1));
  const win = Math.max(1, Math.round(N / 40));
  const make = (s) => {
    if (!s) return null;
    if (xk === "d" && s.d.every((v) => v == null)) return null;
    const X = xk === "d" ? { ...s, d: s.d.map((v, i) => (v == null ? (i ? s.d[i - 1] : 0) : v)) } : s;
    const r = (k) => resample(X, xk, grid, k);
    const v = s.src === "laps" ? r("v") : smooth(r("v"), win);
    return { src: s.src, hr: r("hr"), pace: v.map(paceFromV), el: r("el").map((e) => (e == null ? null : e / 10)), cad: r("cad"), dist: resample(X, xk, grid, "d") };
  };
  const me = make(S.me), pa = make(S.pa);
  if (!me && !pa) return null;
  const both = me && pa, has = {};
  for (const k of ["hr", "pace", "el", "cad"]) has[k] = !!((me && hasAny(me[k])) || (pa && hasAny(pa[k])));
  return {
    xk, grid, N, xmax, persons: { me, pa }, src: { me: me && me.src, pa: pa && pa.src }, has,
    diff: { hr: both ? diffOf(me.hr, pa.hr) : null, pace: both ? diffOf(me.pace, pa.pace) : null, dist: both && xk === "t" ? diffOf(me.dist, pa.dist) : null },
  };
}

/** Kennzahlen einer Person für den Ausschnitt [x0, x1] (x = Sekunden oder Meter): {hr, pace (s/km), gain (m), cad, dist (m), time (s)}; fehlt etwas: null. */
export function rangeStats(S, xk, x0, x1) {
  if (!S || !(x1 > x0)) return null;
  const xs = xk === "d" ? S.d : S.t;
  if (xs[0] == null) return null;
  const last = xs[xs.length - 1], a = Math.max(x0, xs[0]), b = Math.min(x1, last);
  if (!(b > a)) return null;
  const idx = [];
  for (let i = 0; i < xs.length; i++) if (xs[i] != null && xs[i] >= a && xs[i] <= b) idx.push(i);
  const mean = (k) => { const v = idx.map((i) => S[k][i]).filter((q) => q != null); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null; };
  const at = (k, x) => resample(S, xk, [x], k)[0];
  const t0 = at("t", a), t1 = at("t", b), d0 = at("d", a), d1 = at("d", b);
  const time = t0 != null && t1 != null ? t1 - t0 : null, dist = d0 != null && d1 != null ? d1 - d0 : null;
  let gain = null;
  if (S.src === "series") {
    const el = idx.map((i) => S.el[i]).filter((q) => q != null).map((q) => q / 10);
    if (el.length > 1) { gain = 0; for (let i = 1; i < el.length; i++) if (el[i] > el[i - 1]) gain += el[i] - el[i - 1]; }
  }
  const hr = mean("hr"), cad = mean("cad");
  return { hr: hr == null ? null : Math.round(hr), pace: time > 0 && dist >= 50 ? time / (dist / 1000) : null, gain: gain == null ? null : Math.round(gain), cad: cad == null ? null : Math.round(cad), dist, time };
}

/** Pulszonen (Grenzen bei 50/60/70/80/90/100 % des höchsten gemessenen Pulses). */
export const hrZones = (maxHr) => [0.5, 0.6, 0.7, 0.8, 0.9, 1].map((f) => Math.round(maxHr * f));

const cleanLaps = (laps) => (laps || []).filter((l) => l && l.t > 0).map((l) => ({ d: pos(l.d) || 0, t: l.t, hr: pos(l.hr) }));
const withRange = (list) => { let t = 0, d = 0; return list.map((l) => { const o = { ...l, t0: t, t1: t + l.t, d0: d, d1: d + l.d }; t += l.t; d += l.d; return o; }); };

/**
 * Runden beider Personen zuordnen.
 *  Gleich viele Runden: Runde k zu Runde k (mode "index").
 *  Sonst alignFuzzy (src/laps.js): mit Plan-Schritten (steps) beide an den Plan ("plan"), ohne Schritte der Partner an meine Runden ("mine").
 *  Passt nichts: mode null, nur meine Runden ohne Gegenstück (nichts wird geraten).
 * -> {mode, note, pairs: [{n, me: {t0, t1, d0, d1, d, t, hr}, pa: {…} | null}]}
 */
export function pairLaps(meLaps, paLaps, steps = null) {
  const A = cleanLaps(meLaps), B = cleanLaps(paLaps);
  if (!A.length) return { mode: null, note: "", pairs: [] };
  if (!B.length) return { mode: null, note: "", pairs: withRange(A).map((a, i) => ({ n: i + 1, me: a, pa: null })) };
  if (A.length === B.length) {
    const ra = withRange(A), rb = withRange(B);
    return { mode: "index", note: "", pairs: ra.map((a, i) => ({ n: i + 1, me: a, pa: rb[i] })) };
  }
  const usePlan = !!(steps && steps.length);
  const refSteps = usePlan ? steps : A.map((l) => ({ kind: "work", goal: l.t }));
  const fa = usePlan ? alignFuzzy(A, refSteps) : { merged: A, laps: A.map((_, i) => i) }, fb = alignFuzzy(B, refSteps);
  if (fa && fb) {
    const ra = withRange(fa.merged), rb = withRange(fb.merged), pairs = [];
    refSteps.forEach((st, k) => {
      const i = fa.laps[k], j = fb.laps[k];
      if (i != null && j != null && st.kind !== "rest") pairs.push({ n: pairs.length + 1, me: ra[i], pa: rb[j] });
    });
    if (pairs.length) return { mode: usePlan ? "plan" : "mine", note: `Rundenzahl verschieden (${A.length} gegen ${B.length}): nach Zeit zugeordnet, Doppelrunden zusammengefasst.`, pairs };
  }
  return { mode: null, note: `Rundenzahl verschieden (${A.length} gegen ${B.length}) und nicht zuzuordnen: die Runden des Partners werden nicht gepaart.`, pairs: withRange(A).map((a, i) => ({ n: i + 1, me: a, pa: null })) };
}

/** Differenz zwischen der Dauer der Zeitreihe und der Summe der Rundenzeiten in Sekunden (Auto-Pause, Garmin-Zeitbasis). null, wenn eines fehlt. */
export function timeGap(act) {
  const s = act && act.series, laps = (act && act.laps ? act.laps : []).filter((l) => l && l.t > 0);
  if (!s || !Array.isArray(s.t) || s.t.length < 2 || !laps.length) return null;
  return Math.round(s.t[s.t.length - 1] - laps.reduce((x, l) => x + l.t, 0));
}

/** Sekunden in den Pulszonen Z1 bis Z5 (50–60 %, … 90–100 % von maxHr). Nur Zeit mit Pulswert zählt, nichts wird dazugerechnet. -> [s, s, s, s, s] oder null */
export function zoneTimes(S, maxHr) {
  if (!S || !maxHr || !S.t || S.t.length < 2) return null;
  const z = hrZones(maxHr), out = [0, 0, 0, 0, 0];
  let any = false;
  for (let i = 1; i < S.t.length; i++) {
    const h = S.hr[i];
    if (h == null) continue;
    const dt = S.t[i] - S.t[i - 1];
    if (!(dt > 0)) continue;
    for (let k = 4; k >= 0; k--) if (h >= z[k]) { out[k] += dt; any = true; break; }
  }
  return any ? out.map((v) => Math.round(v)) : null;
}

/**
 * Rundenblöcke einer Aktivität für die Darstellung ohne Zeitreihe: je Runde ein Block mit Breite = Dauer. [{t0, t1, d0, d1, d, t, hr, pace}]
 * (pace = s/km, nur ab 100 m; sonst null). Leer ohne Runden.
 */
export function lapBlocks(act) {
  return withRange(cleanLaps(act && act.laps)).map((l) => ({ ...l, pace: l.d >= 100 ? l.t / (l.d / 1000) : null }));
}
