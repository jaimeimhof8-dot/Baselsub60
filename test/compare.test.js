import { test } from "node:test";
import assert from "node:assert/strict";
import { lapPace, lapSeries, pickAct, compareSessions, atLap } from "../src/compare.js";
import { dashSeed } from "./fixtures/dash-seed.js";

const seedAct = () => Object.values(dashSeed().strava.acts).find((a) => a.id === "g1");
const partnerAct = () => {
  const a = seedAct();
  return { ...a, hr: 156, time: a.time + 40, laps: a.laps.map((l, i) => ({ ...l, t: l.t + (i % 2 ? 6 : -4), hr: l.hr == null ? null : l.hr + 3 })) };
};
const names = { me: "Jaime", partner: "Jimoh" };

test("lapPace: nur ab 100 m und mit Zeit", () => {
  assert.equal(lapPace({ d: 1000, t: 240 }), 240);
  assert.equal(lapPace({ d: 50, t: 95 }), null);
  assert.equal(lapPace({ d: 1000, t: 0 }), null);
  assert.equal(lapPace(null), null);
});

test("lapSeries: Nummern ab 1, fehlender Puls bleibt null", () => {
  const s = lapSeries({ laps: [{ d: 1000, t: 250, hr: 150 }, { d: 1000, t: 260 }] });
  assert.deepEqual(s.map((l) => [l.n, l.hr]), [[1, 150], [2, null]]);
  assert.deepEqual(lapSeries({}), []);
});

test("pickAct: gleiche Sportart vor Runden vor Dauer", () => {
  const a = { group: "ride", time: 5000 }, b = { group: "run", time: 100, laps: [{ d: 1, t: 1 }] }, c = { group: "run", time: 900 };
  assert.equal(pickAct([a, b, c], "run"), b);
  assert.equal(pickAct([a, c], ""), a);
  assert.equal(pickAct([], "run"), null);
});

test("ohne Partner: keine Daten mit Grund, keine Zahlen", () => {
  const r = compareSessions(seedAct(), null, names);
  assert.equal(r.ok, false);
  assert.match(r.why, /Jimoh/);
  assert.equal(compareSessions(null, partnerAct(), names).ok, false);
});

test("Vergleich Seed: Kacheln, Differenz = ich minus Partner, Runden gepaart", () => {
  const r = compareSessions(seedAct(), partnerAct(), names);
  assert.ok(r.ok && r.aligned && r.same);
  const hr = r.tiles.find((t) => t.id === "hr");
  assert.equal(hr.me, 151);
  assert.equal(hr.partner, 156);
  assert.equal(hr.diff, -5);
  assert.equal(hr.dfmt(hr.diff), "−5 bpm");
  assert.equal(r.tiles.find((t) => t.id === "time").diff, -40);
  assert.ok(r.tiles.some((t) => t.id === "pace"));
  assert.equal(r.metrics.hr.series[0].pts.length, 9);
});

test("fehlender Wert bleibt Lücke, wird nie aufgefüllt", () => {
  const p = partnerAct();
  p.laps = p.laps.map((l, i) => (i === 2 ? { d: l.d, t: l.t } : l));
  const r = compareSessions(seedAct(), p, names);
  assert.equal(r.metrics.hr.series[1].pts[2].y, null);
  assert.equal(atLap(r.metrics.hr, 3).vals[1].text, "–");
  assert.equal(atLap(r.metrics.hr, 3).diff, null);
});

test("unterschiedliche Rundenzahl: nicht gepaart, Hinweis", () => {
  const p = partnerAct();
  p.laps = p.laps.slice(0, 5);
  const r = compareSessions(seedAct(), p, names);
  assert.equal(r.aligned, false);
  assert.match(r.note, /nicht gepaart/);
});

test("ohne Puls bei beiden: Puls-Metrik nicht ok, mit Grund; Rad ohne Pace-Kachel", () => {
  const bike = { group: "ride", time: 4800, dist: 32000 };
  const r = compareSessions(bike, { ...bike }, names);
  assert.equal(r.metrics.hr.ok, false);
  assert.match(r.metrics.hr.why, /keine Runden/);
  assert.ok(!r.tiles.some((t) => t.id === "pace"));
  assert.equal(r.tiles.find((t) => t.id === "hr").diff, null);
  assert.equal(r.hasLaps, false);
});

test("ungleiche Rundenzahl (12 gegen 13): keine Differenz je Runde", () => {
  const mk = (n, dt) => ({ group: "run", time: 3000, dist: 9000, hr: 150, laps: Array.from({ length: n }, (_, i) => ({ d: 1000, t: 250 + dt, hr: 140 + i })) });
  const r = compareSessions(mk(12, 0), mk(13, 5), names);
  assert.equal(r.aligned, false);
  const a = atLap(r.metrics.hr, 3);
  assert.equal(a.diff, null);
  assert.equal(a.vals[0].text, "142");
  assert.equal(atLap(r.metrics.pace, 13).vals[0].text, "–");
  assert.ok(atLap(compareSessions(mk(12, 0), mk(12, 5), names).metrics.hr, 3).diff);
});

test("verschiedene Sportarten: neutrale Zeile, keine Differenzen", () => {
  const run = { group: "run", name: "Lauf", time: 3000, dist: 9000, hr: 150, laps: [{ d: 1000, t: 300, hr: 150 }] };
  const bike = { group: "ride", name: "Rad", time: 3600, dist: 30000, hr: 130, laps: [{ d: 1000, t: 120, hr: 130 }] };
  const r = compareSessions(run, bike, names);
  assert.ok(r.ok);
  assert.match(r.note, /Verschiedene Sportarten/);
  assert.ok(r.tiles.every((t) => t.diff == null));
  assert.equal(atLap(r.metrics.hr, 1).diff, null);
  assert.doesNotMatch(r.note, /besser|schlechter/i);
});
