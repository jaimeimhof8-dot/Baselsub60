// Rechenkern der Analyse-Diagramme: Glättung, verlustarmes Ausdünnen (Min/Max je Pixelspalte), runde Achsenwerte, Ausschnitts-Kennzahlen.
// Reine Funktionen ohne DOM (Tests: test/an-chart.test.js). Rohdaten werden nie verändert, Lücken (null) bleiben Lücken.

const ok = (v) => v != null && typeof v === "number" && isFinite(v);

/** Erster Index i mit xs[i] >= x (xs aufsteigend, gleiche Werte erlaubt). */
function lower(xs, x) {
  let lo = 0, hi = xs.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < x) lo = m + 1; else hi = m; }
  return lo;
}

/** Index des Messpunkts, der x am nächsten liegt (bei Gleichstand der frühere). */
export function snapIndex(xs, x) {
  if (!xs.length) return 0;
  const i = lower(xs, x);
  if (i <= 0) return 0;
  if (i >= xs.length) return xs.length - 1;
  return x - xs[i - 1] <= xs[i] - x ? i - 1 : i;
}

/** Gleitender Mittelwert über w Messpunkte (zentriert). Fenster ≤ 1: Kopie. Lücken bleiben Lücken und zählen nicht mit. */
export function smoothMA(arr, w) {
  if (!(w > 1)) return arr.slice();
  const n = arr.length, sum = new Float64Array(n + 1), cnt = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) { const v = arr[i], g = ok(v); sum[i + 1] = sum[i] + (g ? v : 0); cnt[i + 1] = cnt[i] + (g ? 1 : 0); }
  const h = w >> 1;
  return arr.map((v, i) => {
    if (!ok(v)) return null;
    const a = Math.max(0, i - h), b = Math.min(n - 1, i + h), c = cnt[b + 1] - cnt[a];
    return c ? (sum[b + 1] - sum[a]) / c : null;
  });
}

/**
 * Punkte für eine Linie im Ausschnitt [a, b]. Passen höchstens 2·W Messpunkte hinein (W = Breite in Pixeln), kommt jeder Punkt.
 * Sonst je Pixelspalte der kleinste und der grösste Wert in zeitlicher Reihenfolge, damit Spitzen nie verschwinden.
 * Spalten ohne Wert und Lücken ergeben {x, y: null} (die Linie bricht dort ab).
 * @returns {{x: number, y: number|null}[]}
 */
export function decimateMinMax(xs, ys, a, b, W) {
  const n0 = xs.length;
  if (!n0) return [];
  const i0 = Math.max(0, lower(xs, a) - 1), i1 = Math.min(n0 - 1, lower(xs, b) + 1), n = i1 - i0 + 1, out = [];
  if (n <= 2 * W) {
    for (let i = i0; i <= i1; i++) out.push({ x: xs[i], y: ok(ys[i]) ? ys[i] : null });
    return out;
  }
  const per = n / W;
  for (let q = 0; q < W; q++) {
    const s0 = Math.floor(i0 + q * per), s1 = Math.min(i1, Math.floor(i0 + (q + 1) * per) - (q === W - 1 ? 0 : 1));
    let lo = -1, hi = -1;
    for (let i = s0; i <= s1; i++) {
      if (!ok(ys[i])) continue;
      if (lo < 0 || ys[i] < ys[lo]) lo = i;
      if (hi < 0 || ys[i] > ys[hi]) hi = i;
    }
    if (lo < 0) { out.push({ x: xs[s0], y: null }); continue; }
    const p = Math.min(lo, hi), p2 = Math.max(lo, hi);
    out.push({ x: xs[p], y: ys[p] });
    if (p2 !== p) out.push({ x: xs[p2], y: ys[p2] });
  }
  return out;
}

/** Runde Achsenwerte im Bereich [lo, hi]: kleinste Schrittweite aus steps, die höchstens 4 Abschnitte ergibt. */
export function niceTicks(lo, hi, steps) {
  const step = steps.find((s) => (hi - lo) / s <= 4) || steps[steps.length - 1], out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

/** Ø, Min, Max einer Reihe zwischen t0 und t1 (Zeitachse S.t, Reihe S[key]); null ohne Werte. */
export function rangeStats(S, t0, t1, key) {
  const A = S[key];
  if (!A) return null;
  const i0 = lower(S.t, t0), i1 = Math.min(S.t.length - 1, lower(S.t, t1 + 1e-9) - 1);
  let s = 0, c = 0, lo = Infinity, hi = -Infinity;
  for (let i = i0; i <= i1; i++) { const v = A[i]; if (!ok(v)) continue; s += v; c++; if (v < lo) lo = v; if (v > hi) hi = v; }
  return c ? { avg: s / c, min: lo, max: hi } : null;
}

/** Ausschnitt [a, b] auf die Achse [0, max] begrenzen; mindestens min breit; so breit wie die Achse: ganze Achse. */
export function clampView(a, b, max, min) {
  const w = Math.max(min, b - a);
  if (w >= max) return [0, max];
  const x = Math.min(Math.max(a, 0), max - w);
  return [x, x + w];
}
