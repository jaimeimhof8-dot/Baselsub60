import test from "node:test";
import assert from "node:assert/strict";
import { dashV3, dashV3Html, anCardHtml, intervalPlan, planGoal, compareRows } from "../src/dash-v3.js";
import { splitPhases, phaseStats } from "../src/session-dash.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const lap = (t, d, hr) => ({ t, d, hr });
// 6×1 km @ 4:00, Pause 90 s: Intervall 4 bis 6 über dem Ziel, Puls steigt
const lauf = [lap(720, 1950, 128), lap(238, 1000, 168), lap(90, 220, 150), lap(237, 1000, 172), lap(90, 220, 155), lap(239, 1000, 174), lap(90, 220, 158), lap(241, 1000, 176), lap(90, 220, 160), lap(243, 1000, 178), lap(90, 220, 162), lap(245, 1000, 179), lap(360, 1000, 141)];
const PLAN = "6×1 km @ 4:00/km, Pause 90 s Trab";

test("planGoal: Zieltempo aus der Plan-Zeile, sonst null", () => {
  assert.equal(planGoal(PLAN), 240);
  assert.equal(planGoal("6×1 km locker"), null);
});

test("intervalPlan: Ziel = Zieltempo × Distanz, Δ je Intervall", () => {
  const ph = splitPhases(lauf, { planText: PLAN });
  const p = intervalPlan(ph, PLAN);
  assert.ok(p, "Arbeitsrunden erkannt");
  assert.equal(p.n, 6);
  assert.equal(p.hit, 3);
  assert.deepEqual(p.rows.map((r) => r.diff), [-2, -3, -1, 1, 3, 5]);
  assert.equal(intervalPlan(ph, "6×1 km locker"), null);
});

test("dashV3 Lauf: drei Kacheln ohne RPE, Plan, Analyse-Zeilen mit Zahl vorn", () => {
  const ph = splitPhases(lauf, { planText: PLAN }), st = phaseStats(ph, {});
  const d = dashV3({ kind: "lauf", act: { laps: lauf }, ph, st, planText: PLAN, facts: {}, prev: null });
  assert.deepEqual(d.tiles.map((t) => t.k), ["Ø Puls Arbeit", "Pace Arbeit", "Puls-Drift"]);
  assert.equal(d.tiles[0].v, "175");
  assert.equal(d.tiles[1].v, "4:01");
  assert.equal(d.tiles[2].v, "+9 bpm");
  assert.ok(!JSON.stringify(d).match(/Anstrengung|RPE/));
  assert.equal(d.an.bad[0].n, "3 von 6");
  assert.match(d.an.bad[0].t, /Intervall 4 bis 6 über 4:00/);
  assert.equal(d.an.bad[1].n, "+9 bpm");
  assert.equal(d.an.good.length, 0, "ohne Vorgänger kein «besser als»");
  assert.match(d.an.next, /Intervalle/);
});

test("dashV3 Lauf: Vergleich nur mit Werten aus beiden Einheiten", () => {
  const ph = splitPhases(lauf, { planText: PLAN }), st = phaseStats(ph, {});
  const d = dashV3({ kind: "lauf", act: { laps: lauf }, ph, st, planText: PLAN, facts: {}, prev: { label: "Di 13.10.", same: true, work: { pace: 243.5, hr: 172 }, comp: null } });
  assert.deepEqual(d.cmp.rows.map((r) => r.k), ["Pace Arbeit", "Ø Puls Arbeit"]);
  assert.equal(d.cmp.rows[0].d, "−3 s/km");
  assert.equal(d.cmp.rows[1].d, "+3 bpm");
  assert.match(d.an.good[0].t, /beim letzten Mal \(Di 13\.10\.\)/);
  assert.match(d.cmp.title, /letzten gleichen Einheit \(Di 13\.10\.\)/);
});

test("dashV3 ohne Uhr: «keine Daten, Grund», nie eine erfundene Zahl", () => {
  const ph = splitPhases([], {}), st = phaseStats(ph, {});
  const d = dashV3({ kind: "lauf", act: null, ph, st, planText: PLAN, facts: {}, prev: null });
  assert.equal(d.tiles.length, 1);
  assert.ok(d.tiles[0].na);
  assert.match(d.tiles[0].why, /keine Uhr-Aktivität/);
  const h = dashV3Html(d, esc);
  assert.match(h, /keine Daten, Grund: keine Uhr-Aktivität gefunden/);
  assert.ok(!/<b>\d/.test(h));
});

test("dashV3 Kraft: nur Haken, kein Puls, keine Tabellen", () => {
  const d = dashV3({ kind: "kraft", act: null, ph: null, st: null, facts: { done: 4, n: 5, open: ["Wadenheben"], skipped: 1 } });
  assert.deepEqual(d.tiles.map((t) => [t.k, t.v]), [["Umsetzung", "4/5"]]);
  assert.equal(d.openNote, "Offen geblieben: Wadenheben. 1 Übung gestrichen.");
  assert.deepEqual(d.an.good, [{ n: "4 von 5", t: "Übungen abgehakt." }]);
  assert.deepEqual(d.an.bad, [{ n: "1 offen", t: "Wadenheben fehlt." }]);
  const h = dashV3Html(d, esc);
  assert.ok(!/Plan gegen Ist|Vergleich|Puls/.test(h));
});

test("compareRows: Stationstag mit Kompromiss-Delta", () => {
  const r = compareRows({ work: { pace: 250, hr: 172 }, comp: 10 }, { work: { pace: 252, hr: 171 }, comp: 13 }, "station");
  assert.deepEqual(r.map((x) => x.k), ["Pace Läufe", "Ø Puls Arbeit", "Kompromiss-Delta"]);
  assert.equal(r[2].d, "−3 s");
});

test("anCardHtml: leere Blöcke entfallen, Nicht gut ist markiert", () => {
  const h = anCardHtml({ good: [], bad: [{ n: "1 offen", t: "X fehlt." }], next: "" }, esc);
  assert.ok(!/Gut</.test(h));
  assert.match(h, /Nicht gut/);
  assert.match(h, /class="bad"/);
  assert.ok(!/Nächstes Mal/.test(h));
});
