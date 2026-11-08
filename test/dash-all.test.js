import test from "node:test";
import assert from "node:assert/strict";
import { dataState, reviewOne, reviewAll, keyLine } from "../src/dash-all.js";
import { dashSeed } from "./fixtures/dash-seed.js";

const A = dashSeed("new").strava.acts;
const AOLD = dashSeed("old").strava.acts;
const steps3 = [
  { kind: "warm", name: "1,5 km", goal: 495 }, { kind: "run", name: "1 km Referenz", goal: 270 },
  { kind: "station", name: "SkiErg 1000 m", goal: 250 }, { kind: "run", name: "1 km", goal: 270 }, { kind: "rest", name: "Erholen", goal: 120 },
  { kind: "station", name: "Sled Push 50 m", goal: 90 }, { kind: "run", name: "1 km", goal: 270 }, { kind: "rest", name: "Erholen", goal: 100 },
  { kind: "cool", name: "1 km", goal: 330 },
];
const base = { garminOn: true, done: 4, n: 4, rpe: 8 };

test("Intervalllauf: Arbeit getrennt von Pause, Drift aus gespeicherten Runden", () => {
  const r = reviewOne({ ...base, i: 1, label: "Di", title: "Intervall", kind: "lauf", act: A.g1, planText: "4×1km zusammen, 2′ Trabpause" });
  assert.equal(r.src, "Garmin");
  assert.equal(r.data.state, "ok");
  assert.ok(["sure", "likely"].includes(r.conf), r.conf);
  assert.equal(r.key.hr, 175); // nur Arbeitsrunden, Gesamt-Ø wäre 150
  assert.ok(r.key.totalHr < r.key.hr);
  assert.equal(r.key.drift, 13);
  assert.ok(r.wd.main.every((m) => m.why));
});

test("Stationstag: Kompromiss-Delta und Plan gegen Ist aus den Runden", () => {
  const r = reviewOne({ ...base, i: 3, label: "Do", title: "Stationen", kind: "station", act: A.g3, steps: steps3 });
  assert.equal(r.conf, "sure");
  assert.ok(r.st.compromise && r.st.compromise.n === 2);
  assert.equal(r.st.compromise.ref, 266);
  assert.ok(r.st.plan && r.st.plan.n >= 3);
  assert.ok(r.st.recovery);
});

test("Altbestand ohne lapsV: Hinweis mit Grund, Abruf angeboten, nichts erfunden", () => {
  const r = reviewOne({ ...base, i: 0, label: "Mo", title: "Kraft", kind: "kraft", act: AOLD.g0 });
  assert.equal(r.data.state, "partial");
  assert.match(r.data.reason, /Runden fehlen/);
  assert.equal(r.data.refetch, true);
  assert.equal(r.key.hr, null);
  assert.equal(r.conf, "none");
});

test("Ohne Garmin-Verbindung kein Abruf; ohne Aktivität «keine Daten» mit Grund", () => {
  assert.equal(dataState(A.g5, { garminOn: false }).refetch, false);
  const none = dataState(null, { garminOn: true });
  assert.equal(none.state, "none");
  assert.equal(none.refetch, true);
  assert.match(dataState({ src: "strava", hr: 0, laps: [{ d: 1, t: 60 }] }).reason, /Kein Puls/);
});

test("Bike ohne Runden: keine Arbeitswerte, aber Gesamtpuls bleibt null statt erfunden", () => {
  const r = reviewOne({ ...base, i: 5, label: "Sa", title: "Bike", kind: "bike", act: A.g5 });
  assert.equal(r.key.hr, null);
  assert.equal(r.key.totalHr, null);
  assert.equal(r.data.state, "partial");
});

test("reviewAll: alle Einheiten, neueste zuerst, Datenlage gezählt; Rechnung ist deterministisch (rückwirkend = neu)", () => {
  const mk = (i, act, extra = {}) => ({ ...base, i, label: "d" + i, title: "t", kind: "lauf", act, ...extra });
  const list = [mk(1, A.g1, { planText: "4×1km" }), mk(3, A.g3, { steps: steps3, kind: "station" }), mk(5, A.g5), mk(6, null)];
  const a = reviewAll(list), b = reviewAll(JSON.parse(JSON.stringify(list)));
  assert.deepEqual(a.rows.map((r) => r.i), [6, 5, 3, 1]);
  assert.deepEqual(a.count, { ok: 2, partial: 1, none: 1 });
  assert.deepEqual(JSON.stringify(a), JSON.stringify(b));
  assert.match(keyLine(a.rows[3]), /Puls Arbeit 175/);
});
