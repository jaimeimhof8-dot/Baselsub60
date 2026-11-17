import test from "node:test";
import assert from "node:assert/strict";
import { smoothMA, decimateMinMax, niceTicks, rangeStats, snapIndex, clampView } from "../src/an-chart.js";

test("smoothMA: Fenster 1 ist eine Kopie, Fenster 5 mittelt, Lücken bleiben Lücken", () => {
  const a = [1, 2, 3, 4, 5];
  const c = smoothMA(a, 1);
  assert.deepEqual(c, a);
  assert.notEqual(c, a);
  assert.deepEqual(smoothMA([0, 0, 10, 0, 0], 5)[2], 2);
  const g = smoothMA([4, null, 8, 8], 3);
  assert.equal(g[1], null);
  assert.equal(g[0], 4);
  assert.equal(g[2], 8);
});

test("decimateMinMax: wenige Punkte bleiben alle, viele behalten die Spitze", () => {
  const xs = Array.from({ length: 100 }, (_, i) => i), ys = xs.map((i) => i % 7);
  assert.equal(decimateMinMax(xs, ys, 0, 99, 300).length, 100);
  const N = 3000, bx = Array.from({ length: N }, (_, i) => i), by = bx.map(() => 5);
  by[1234] = 99;
  const d = decimateMinMax(bx, by, 0, N - 1, 300);
  assert.ok(d.length <= 600 + 2);
  assert.ok(d.some((p) => p.y === 99 && p.x === 1234), "Spitze bleibt erhalten");
  assert.ok(d.every((p, i) => i === 0 || p.x >= d[i - 1].x), "Reihenfolge bleibt");
});

test("decimateMinMax: nur der sichtbare Ausschnitt, Lücken als y null", () => {
  const xs = Array.from({ length: 50 }, (_, i) => i), ys = xs.map((i) => (i === 10 ? null : i));
  const d = decimateMinMax(xs, ys, 5, 15, 300);
  assert.ok(d[0].x >= 4 && d[d.length - 1].x <= 16);
  assert.ok(d.some((p) => p.x === 10 && p.y === null));
});

test("niceTicks: runde Werte im Bereich", () => {
  assert.deepEqual(niceTicks(3.9 * 60, 8 * 60, [30, 60, 120]), [240, 360, 480]);
  assert.deepEqual(niceTicks(127, 181, [5, 10, 20]), [140, 160, 180]);
  assert.deepEqual(niceTicks(155.5, 160.5, [1, 2, 5]), [156, 158, 160]);
});

test("rangeStats: Ø, Min, Max im Zeitbereich, Lücken übersprungen", () => {
  const S = { t: [0, 1, 2, 3, 4, 5], hr: [100, 110, null, 130, 140, 150] };
  assert.deepEqual(rangeStats(S, 1, 4, "hr"), { avg: 126.66666666666667, min: 110, max: 140 });
  assert.equal(rangeStats({ t: [0, 1], hr: [null, null] }, 0, 1, "hr"), null);
});

test("snapIndex: nächster Messpunkt", () => {
  assert.equal(snapIndex([0, 1, 2, 3], 1.6), 2);
  assert.equal(snapIndex([0, 1, 2, 3], -4), 0);
  assert.equal(snapIndex([0, 1, 2, 3], 99), 3);
  assert.equal(snapIndex([0, 0, 0, 5, 5], 4), 3, "Stillstand: gleiche x-Werte, nächster Wert gewinnt");
});

test("clampView: kleinster Ausschnitt, Ränder, ganze Achse", () => {
  assert.deepEqual(clampView(-5, 30, 100, 10), [0, 35]);
  assert.deepEqual(clampView(50, 52, 100, 10), [50, 60]);
  assert.deepEqual(clampView(95, 130, 100, 10), [65, 100], "über den rechten Rand: verschoben, Breite bleibt");
  assert.deepEqual(clampView(-20, 150, 100, 10), [0, 100], "so breit wie die Achse: ganze Achse");
  assert.deepEqual(clampView(90, 99, 100, 10), [90, 100]);
});
