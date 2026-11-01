import { test } from "node:test";
import assert from "node:assert/strict";
import { buildForecast } from "../src/forecast.js";
import { makeEntry, update, list, withDeltas, trend, outlook, gainAt, whyChanged, moved, PRIOR, TAPER_W, MODEL_V } from "../src/progress.js";

const t = (s) => { const [m, x] = s.split(":"); return +m * 60 + +x; };
const run = (v) => [v, v, v, v].map(t);
const st = (v) => Array.from({ length: 8 }, () => [t(v), t(v)]);
const fc = (lauf, stat, sims = []) => buildForecast({ laufPersons: [run(lauf), run(lauf)], station: st(stat), sims });

test("Eintrag: runde Sekunden, Benchmark-Summe und Pace stehen drin", () => {
  const e = makeEntry(fc("3:55", "3:10"), 0);
  assert.equal(e.T, 235);
  assert.equal(e.b, 8 * 190);
  assert.equal(e.t, e.r + e.s + e.x);
  assert.equal(makeEntry(null), null);
});

test("Protokoll: erster Eintrag ist Startwert, gleiche Eingaben erzeugen keinen neuen Eintrag", () => {
  const f = fc("3:55", "3:10");
  let r = update({}, f, "2026-10-13");
  assert.equal(r.changed, true);
  assert.equal(r.log["2026-10-13"].why, "Startwert");
  const again = update(r.log, f, "2026-10-20");
  assert.equal(again.changed, false);
  assert.deepEqual(Object.keys(again.log), ["2026-10-13"]);
});

test("Protokoll: neuer Lauf-Test wird mit Ursache und Veränderung festgehalten", () => {
  const a = update({}, fc("3:55", "3:10"), "2026-10-13").log;
  const r = update(a, fc("3:50", "3:10"), "2026-11-10");
  assert.equal(r.changed, true);
  assert.match(r.entry.why, /Lauf-Test: Ø 3:55 → 3:50\/km/);
  const items = withDeltas(list(r.log));
  assert.equal(items.length, 2);
  assert.ok(items[1].dt < 0 && items[1].dr < 0, "schneller");
  assert.equal(items[1].ds, 0);
  assert.equal(items[0].dt, null);
});

test("Protokoll: Stationen-Benchmark und Simulation werden benannt", () => {
  const a = update({}, fc("3:55", "3:10"), "2026-10-13").log;
  const b = update(a, fc("3:55", "3:00"), "2026-11-01");
  assert.match(b.entry.why, /Stationen-Benchmark: Summe 25:20 → 24:00/);
  const s = update(b.log, fc("3:55", "3:00", [{ intensity: 0.9, stations: t("22:00") }]), "2026-11-20", 1);
  assert.match(s.entry.why, /Neue Simulation/);
});

test("Protokoll: am selben Tag wird überschrieben, wird der Wert wieder wie zuvor, entfällt der Tageseintrag", () => {
  const a = update({}, fc("3:55", "3:10"), "2026-10-13").log;
  const b = update(a, fc("3:50", "3:10"), "2026-11-10").log;
  const c = update(b, fc("3:52", "3:10"), "2026-11-10");
  assert.equal(Object.keys(c.log).length, 2);
  assert.equal(c.log["2026-11-10"].T, 232);
  const d = update(c.log, fc("3:55", "3:10"), "2026-11-10");
  assert.deepEqual(Object.keys(d.log), ["2026-10-13"]);
  assert.equal(a["2026-11-10"], undefined, "Eingang bleibt unverändert");
});

test("Trend: braucht zwei Punkte mit 14 Tagen Abstand, dann Steigung in s/Woche", () => {
  assert.equal(trend([{ d: "2026-10-13", t: 3800, v: MODEL_V }]), null);
  assert.equal(trend([{ d: "2026-10-13", t: 3800, v: MODEL_V }, { d: "2026-10-20", t: 3780, v: MODEL_V }]), null);
  const r = trend([{ d: "2026-10-13", t: 3800, v: MODEL_V }, { d: "2026-10-27", t: 3760, v: MODEL_V }, { d: "2026-11-10", t: 3720, v: MODEL_V }]);
  assert.ok(Math.abs(r.rate - -20) < 1e-9, "rate " + r.rate);
  assert.equal(r.n, 3);
});

test("Ausblick ohne Messreihe: Annahme, skaliert mit Trainingstreue, nie schneller als Modell erlaubt", () => {
  const cur = { t: 3745, lo: 3600, hi: 3890 };
  const full = outlook({ cur, weeksLeft: 15, adherence: 1 });
  const half = outlook({ cur, weeksLeft: 15, adherence: 0.5 });
  assert.equal(full.source, "Annahme");
  assert.equal(full.rate, PRIOR);
  assert.ok(full.proj < cur.t && half.proj < cur.t && half.proj > full.proj, "weniger Training, weniger Gewinn");
  assert.ok(full.proj > cur.t - 150, "Gewinn flacht ab: " + (cur.t - full.proj));
  assert.equal(outlook({ cur, weeksLeft: 15, adherence: 0 }).rate, PRIOR * 0.3, "Untergrenze der Trainingstreue");
});

test("Ausblick mit gemessener Verbesserung nutzt diese und begrenzt sie", () => {
  const items = [{ d: "2026-10-13", t: 3800, v: MODEL_V }, { d: "2026-11-10", t: 3720, v: MODEL_V }]; // −20 s/Woche
  const o = outlook({ items, cur: { t: 3720, lo: 3650, hi: 3790 }, weeksLeft: 13 });
  assert.equal(o.source, "gemessen");
  assert.ok(Math.abs(o.rate - -20) < 1e-9);
  assert.ok(o.proj < 3720 && o.lo < o.proj && o.hi > o.proj);
  const wild = outlook({ items: [{ d: "2026-10-01", t: 4000, v: MODEL_V }, { d: "2026-10-22", t: 3600, v: MODEL_V }], cur: { t: 3600 }, weeksLeft: 10 });
  assert.equal(wild.rate, -45, "unglaubwürdig steile Steigung wird begrenzt");
  const bad = outlook({ items: [{ d: "2026-10-01", t: 3600, v: MODEL_V }, { d: "2026-10-29", t: 3800, v: MODEL_V }], cur: { t: 3800 }, weeksLeft: 10 });
  assert.equal(bad.rate, 10);
  assert.equal(bad.subWeeks, null);
});

test("Taper: in den letzten Wochen kein Gewinn mehr; Ziel erreicht oder nach dem Modell nicht erreichbar", () => {
  assert.equal(gainAt(-20, 5, TAPER_W), 0);
  assert.ok(gainAt(-20, 20, 12) === gainAt(-20, 12, 12), "über das Rennen hinaus zählt nichts");
  assert.equal(outlook({ cur: { t: 3500 }, weeksLeft: 10 }).subWeeks, 0);
  const never = outlook({ cur: { t: 3900 }, weeksLeft: 15, adherence: 1 }); // max. Gewinn 150 s bei Annahme, 300 s fehlen
  assert.equal(never.subWeeks, null);
  const near = outlook({ cur: { t: 3700 }, weeksLeft: 15, adherence: 1 });
  assert.ok(near.subWeeks > 0 && near.subWeeks <= 13, "erreichbar in " + near.subWeeks);
  assert.ok(near.needed > 0);
  assert.equal(outlook({ cur: null, weeksLeft: 5 }), null);
});

test("Kurve startet bei der aktuellen Prognose und fällt nie", () => {
  const o = outlook({ cur: { t: 3745 }, weeksLeft: 14 });
  assert.equal(o.curve[0].t, 3745);
  assert.ok(o.curve.every((p, i, a) => i === 0 || p.t <= a[i - 1].t));
  assert.ok(moved(null, { t: 1, r: 1, s: 1, x: 1 }) && !moved({ t: 1, r: 1, s: 1, x: 1 }, { t: 1, r: 1, s: 1, x: 1 }));
  assert.equal(whyChanged(null, {}), "Startwert");
});

test("Einträge eines anderen Modells zählen nicht für die Steigung und erzeugen keine Scheinverschlechterung", () => {
  const items = [{ d: "2026-10-01", t: 3530 }, { d: "2026-10-20", t: 3745, v: MODEL_V }, { d: "2026-11-10", t: 3700, v: MODEL_V }];
  assert.equal(trend(items).n, 2);
  assert.ok(trend(items).rate < 0);
  assert.equal(trend([{ d: "2026-10-01", t: 3530 }, { d: "2026-11-10", t: 3745, v: MODEL_V }]), null);
  const old = { "2026-10-18": { t: 3530, r: 2044, s: 1230, x: 255, lo: 3380, hi: 3700, T: 237, b: 1538, n: 0, k: 0.8 } };
  const r = update(old, fc("3:55", "3:10"), "2026-11-01");
  assert.match(r.entry.why, /Modell neu geeicht/);
  assert.equal(r.entry.v, MODEL_V);
});
