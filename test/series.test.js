import { test } from "node:test";
import assert from "node:assert/strict";
import { seriesOf, resample, smooth, paceFromV, buildPlot, rangeStats, hrZones, pairLaps } from "../src/series.js";
import { comparePanelHtml, fmtTime, fmtDist, valuesAt, KINDS, _resetCharts } from "../src/charts.js";
import { compareSessions } from "../src/compare.js";

const ser = (n, f) => ({ n, t: Array.from({ length: n }, (_, i) => i * 5), d: Array.from({ length: n }, (_, i) => Math.round(i * 5 * 3.4)), hr: Array.from({ length: n }, (_, i) => 140 + (i % 20)), v: Array.from({ length: n }, () => 340 + f), el: Array.from({ length: n }, (_, i) => 4000 + i), cad: Array.from({ length: n }, () => 172) });
const act = (n, f, laps) => ({ group: "run", time: n * 5, dist: Math.round(n * 5 * 3.4), hr: 150, laps, series: ser(n, f) });
const lap = (d, t, hr) => ({ d, t, hr });

test("paceFromV: 3,4 m/s = 4:54, Stehen und Gehen ergeben keine Pace", () => {
  assert.equal(Math.round(paceFromV(340)), 294);
  assert.equal(paceFromV(30), null);
  assert.equal(paceFromV(null), null);
});

test("seriesOf: echte Reihe bleibt, ohne Reihe Stufen aus Runden, ohne beides null", () => {
  assert.equal(seriesOf(act(100, 0)).src, "series");
  const s = seriesOf({ laps: [lap(1000, 250, 150), lap(1000, 260, 155)] });
  assert.equal(s.src, "laps");
  assert.equal(s.v[0], 400);
  assert.equal(s.hr[3], 155);
  assert.deepEqual(s.el, [null, null, null, null]);
  assert.equal(seriesOf({}), null);
  assert.equal(seriesOf(null), null);
});

test("resample: linear, außerhalb und an Lücken null", () => {
  const S = { t: [0, 10, 20], hr: [100, null, 120], d: [0, 1, 2] };
  assert.deepEqual(resample(S, "t", [0, 5, 10, 25], "hr"), [null, null, null, null].map((x, i) => (i === 0 ? 100 : null)));
  const T = { t: [0, 10], hr: [100, 120] };
  assert.deepEqual(resample(T, "t", [-1, 5, 10, 11], "hr"), [null, 110, 120, null]);
});

test("smooth glättet und lässt Lücken stehen", () => {
  const a = smooth([0, 10, null, 10, 0], 3);
  assert.equal(a[2], null);
  assert.equal(a[1], 5);
});

test("buildPlot: gemeinsames Raster, Differenz nur wo beide Werte da sind", () => {
  const P = buildPlot(act(100, 0), act(80, 20), { N: 100 });
  assert.equal(P.grid.length, 100);
  assert.equal(P.xmax, 495);
  assert.ok(P.persons.me.hr[0] != null && P.persons.pa.hr[99] == null, "Partner endet früher: danach Lücke");
  assert.equal(P.diff.hr[99], null);
  assert.ok(P.diff.hr[10] != null);
  assert.ok(P.diff.pace[10] < 0 || P.diff.pace[10] > 0);
  assert.equal(P.has.el, true);
  const D = buildPlot(act(100, 0), act(80, 20), { xk: "d", N: 100 });
  assert.equal(D.diff.dist, null, "Abstand über Distanz ist sinnlos");
  assert.ok(D.xmax > 1000);
});

test("buildPlot ohne Partner: nur meine Reihe, kein Diff; ohne alles null", () => {
  const P = buildPlot(act(50, 0), null);
  assert.equal(P.persons.pa, null);
  assert.equal(P.diff.hr, null);
  assert.equal(buildPlot(null, null), null);
});

test("rangeStats: Durchschnitte nur für den Ausschnitt", () => {
  const S = seriesOf(act(100, 0));
  const all = rangeStats(S, "t", 0, 495), part = rangeStats(S, "t", 100, 200);
  assert.equal(Math.round(all.pace), 294);
  assert.equal(part.time, 100);
  assert.equal(part.dist, 340);
  assert.equal(part.cad, 172);
  assert.ok(part.gain >= 0);
  assert.equal(rangeStats(S, "t", 10, 10), null);
  const L = seriesOf({ laps: [lap(1000, 250, 150)] });
  assert.equal(rangeStats(L, "t", 0, 249).gain, null, "Höhe gibt es aus Runden nicht");
});

test("hrZones", () => assert.deepEqual(hrZones(200), [100, 120, 140, 160, 180, 200]));

test("pairLaps: gleiche Zahl nach Index, 12 gegen 13 nach Zeit zugeordnet", () => {
  const a = Array.from({ length: 12 }, (_, i) => lap(1000, 250 + i, 150));
  const b = Array.from({ length: 12 }, (_, i) => lap(1000, 245 + i, 152));
  assert.equal(pairLaps(a, b).mode, "index");
  const c = [...b.slice(0, 5), lap(500, 120, 150), lap(500, 125, 151), ...b.slice(6)]; // eine Runde vom Partner in zwei gelappt: 13 Runden
  const r = pairLaps(a, c);
  assert.equal(c.length, 13);
  assert.equal(r.mode, "mine");
  assert.equal(r.pairs.length, 12);
  assert.ok(r.pairs[5].pa.t > 240, "Doppelrunde zusammengefasst");
  assert.match(r.note, /12 gegen 13/);
});

test("pairLaps: nicht zuordenbar -> keine Paare, kein Raten", () => {
  const a = Array.from({ length: 12 }, () => lap(1000, 250, 150));
  const b = Array.from({ length: 4 }, () => lap(3000, 750, 150));
  const r = pairLaps(a, b);
  assert.equal(r.mode, null);
  assert.ok(r.pairs.every((p) => p.pa === null));
  assert.equal(pairLaps(a, []).mode, null);
});

test("Formate und Werte am Cursor: Differenz ich minus Partner, keine Wertung", () => {
  assert.equal(fmtTime(65), "1:05");
  assert.equal(fmtTime(3725), "1:02:05");
  assert.equal(fmtDist(450), "450 m");
  assert.equal(fmtDist(1500), "1,50 km");
  const P = buildPlot(act(100, 0), act(100, 20), { N: 100 });
  const v = valuesAt(P, "hr", 5);
  assert.equal(v.diff, 0);
  const p = valuesAt(P, "pace", 50);
  assert.match(p.diffText, /s\/km/);
  assert.ok(KINDS.pace.invert);
});

test("Panel-Gerüst: Achse, Legende, Zoom, Runden; ohne Daten ein Hinweis", () => {
  _resetCharts();
  const me = act(100, 0, [lap(1000, 250, 150)]), pa = act(100, 20, [lap(1000, 245, 152)]);
  const model = compareSessions(me, pa, { me: "Jaime", partner: "Jimoh" });
  const h = comparePanelHtml("x1", model, undefined, { me, pa });
  for (const k of ["data-cmp-x=\"d\"", "data-cmp-hide=\"pa\"", "data-cmp-zoom=\"reset\"", "data-cmp-dm=\"pace\"", "tabindex=\"0\""]) assert.ok(h.includes(k), k);
  assert.doesNotMatch(h, /besser|schlechter|Ampel|Punkte/i);
  const none = comparePanelHtml("x2", compareSessions({ group: "ride", time: 1 }, { group: "ride", time: 1 }, {}), undefined, { me: { group: "ride", time: 1 }, pa: { group: "ride", time: 1 } });
  assert.match(none, /keine Daten, Grund/);
  const lapOnly = { group: "run", time: 500, dist: 1000, laps: [lap(1000, 250, 150)] };
  assert.match(comparePanelHtml("x3", compareSessions(lapOnly, lapOnly, {}), undefined, { me: lapOnly, pa: lapOnly }), /nur der Rundendurchschnitt/);
});

import { timeGap } from "../src/series.js";
test("D4: Rundenbänder und Zeitreihe laufen bei Pausen auseinander, das wird erkannt und gemeldet", () => {
  const a = act(100, 0, [lap(1000, 200, 150), lap(1000, 200, 150)]); // Reihe 495 s, Runden nur 400 s (Auto-Pause)
  assert.equal(timeGap(a), 95);
  const ok = act(100, 0, [lap(1000, 247, 150), lap(1000, 248, 150)]);
  assert.equal(timeGap(ok), 0);
  assert.equal(timeGap({ laps: [lap(1, 1, 1)] }), null);
  const me = a, model = compareSessions(me, me, { me: "A", partner: "B" });
  assert.match(comparePanelHtml("gap", model, undefined, { me, pa: me }), /weichen um 95 s ab/);
});

test("verschiedene Sportarten: kein Differenz-Bereich", () => {
  const bike = { ...act(100, 0), group: "ride" };
  const model = compareSessions(act(100, 0), bike, { me: "A", partner: "B" });
  const h = comparePanelHtml("mix", model, undefined, { me: act(100, 0), pa: bike });
  assert.doesNotMatch(h, /Unterschied zeigt/);
  assert.match(h, /Verschiedene Sportarten/);
});

test("Distanzachse: kein Knopf «Abstand»; Hinweis ab Start der Aufzeichnung", () => {
  _resetCharts();
  const me = act(100, 0), model = compareSessions(me, me, { me: "A", partner: "B" });
  const t = comparePanelHtml("ax", model, undefined, { me, pa: me });
  assert.match(t, /data-cmp-dm="dist"/);
  assert.match(t, /ab Start der Aufzeichnung/);
  assert.match(t, /Strg oder Cmd/);
});

import { zoneTimes } from "../src/series.js";
test("Zonen: Zeit je Zone aus dem Puls, nur mit Pulswert; Schalter standardmäßig aus", () => {
  const S = { t: [0, 10, 20, 30, 40], hr: [100, 130, 150, 170, null] };
  // maxHr 200: Z1 100–120, Z2 120–140, Z3 140–160, Z4 160–180, Z5 180–200
  assert.deepEqual(zoneTimes(S, 200), [0, 10, 10, 10, 0]);
  assert.equal(zoneTimes({ t: [0, 1], hr: [null, null] }, 200), null);
  assert.equal(zoneTimes(S, null), null);
  _resetCharts();
  const me = act(100, 0), model = compareSessions(me, me, { me: "Jaime", partner: "Jimoh" });
  const h = comparePanelHtml("z1", model, undefined, { me, pa: me });
  assert.match(h, /data-cmp-zones/);
  assert.match(h, /aria-pressed="false"/);
  assert.ok(h.includes('cmp-zbtn off'));
});
