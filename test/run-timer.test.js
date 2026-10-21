import { test } from "node:test";
import assert from "node:assert/strict";
import { flatten, targetSec, phaseTitle, phaseGoal, splitSummary, dashboard } from "../src/run-timer.js";
import { planSteps } from "../src/garmin-workout.js";
import { parseTreadmill, buildTreadmill } from "../src/ftms.js";

const day = { k: "lauf", i: ["3×1,5 km @ 4:10/km (6:15), Trabpause 2×200 m @ 6:30/km (1:18)."] };

test("Abfolge: Intervall 1/3, Pause, Intervall 2/3, Pause, Intervall 3/3", () => {
  const ph = flatten(planSteps(day).steps);
  assert.deepEqual(ph.map(phaseTitle), ["Intervall 1/3", "Trabpause", "Intervall 2/3", "Trabpause", "Intervall 3/3"]);
  assert.equal(targetSec(ph[0]), 375);
  assert.equal(targetSec(ph[1]), 78);
  assert.equal(phaseGoal(ph[0]), "1,5 km @ 4:10/km · Ziel 6:15");
});

test("Wiederholungsgruppe (Steigerungen) wird aufgelöst, Runden-Taste ohne Ziel", () => {
  const ph = flatten([{ kind: "repeat", n: 2, steps: [{ kind: "interval", dist: 80, pace: 210 }, { kind: "recovery", lap: true }] }]);
  assert.equal(ph.length, 4);
  assert.equal(targetSec(ph[1]), null);
  assert.match(phaseGoal(ph[1]), /Nächster Schritt/);
});

test("Eintrag aus den gelaufenen Zeiten, Trabpausen zählen nicht", () => {
  const ph = flatten(planSteps(day).steps);
  assert.equal(splitSummary(ph, [372, 80, 370, 79, 378]), "3×1,5 km: 6:12 · 6:10 · 6:18 (Ø 4:09/km)");
  assert.equal(splitSummary(ph, []), "");
});

test("Einzelner Lauf: Distanz, Zeit, Pace", () => {
  const ph = flatten(planSteps({ k: "lauf", i: ["8 km Zone 2 @ 5:50/km (46:40)."] }).steps);
  assert.equal(splitSummary(ph, [2800]), "8 km: 46:40 (Ø 5:50/km)");
});

test("Simulator-Paket wird wie ein echtes Laufband gelesen", () => {
  for (const [kmh, d] of [[14, 0], [12.5, 1500], [20, 70000]]) {
    const r = parseTreadmill(new DataView(buildTreadmill(kmh, d).buffer));
    assert.equal(r.kmh, kmh);
    assert.equal(r.distM, d);
  }
});

test("Bluetooth-Laufband: Geschwindigkeit und Distanz aus Treadmill Data", () => {
  // Flags: Bit 2 (Distanz) gesetzt, Bit 0 = 0 (Geschwindigkeit vorhanden). 12,00 km/h, 1234 m
  const b = new Uint8Array([0x04, 0x00, 0xb0, 0x04, 0xd2, 0x04, 0x00]);
  const r = parseTreadmill(new DataView(b.buffer));
  assert.equal(r.kmh, 12);
  assert.equal(r.distM, 1234);
  assert.equal(r.pace, 300);
  assert.deepEqual(parseTreadmill(null), { kmh: null, distM: null, pace: null });
});

test("Dashboard: Tempo, Distanz im Abschnitt, Fortschritt, Puls und Rundenzeit", () => {
  const ph = flatten(planSteps(day).steps);
  const d = dashboard({ ph, idx: 0, secs: 228, running: true, base: 1000, live: { pace: 247, distM: 1920 }, bpm: 168 });
  assert.equal(d.pace, "4:07");
  assert.equal(d.dist, "0,92");
  assert.equal(d.dgoal, "km von 1,50");
  assert.equal(d.barPct, 61);
  assert.equal(d.hr, "168");
  assert.equal(d.rt, "3:48");
  assert.equal(d.lgoal, "Ziel 6:15");
  assert.ok(Math.abs(d.prog - 0.92 / 1.5) < 0.001);
  assert.equal(d.fin, false);
});

test("Dashboard: ohne Laufband und Puls bleiben die Felder leer, der Fortschritt läuft über die Zeit", () => {
  const ph = flatten(planSteps(day).steps);
  const d = dashboard({ ph, idx: 0, secs: 187.5, running: true });
  assert.equal(d.pace, "–:––");
  assert.equal(d.dist, "–");
  assert.equal(d.dgoal, "Ziel 1,50 km");
  assert.equal(d.hr, "–");
  assert.equal(d.barPct, 0);
  assert.ok(Math.abs(d.prog - 0.5) < 0.001);
});

test("Dashboard: fertige Runden mit Zeit und Pace, nach dem letzten Abschnitt Haken", () => {
  const ph = flatten(planSteps(day).steps);
  const d = dashboard({ ph, idx: ph.length, log: [372, 80, 370, 79, 378] });
  assert.equal(d.fin, true);
  assert.equal(d.rt, "✓");
  assert.deepEqual(d.laps.map((x) => x.time), ["1:20", "6:10", "1:19", "6:18"]);
  assert.equal(d.laps[1].pace, "4:07");
  assert.equal(d.laps[1].title, "Intervall 2/3");
});

test("Dashboard: Distanz stößt nie unter null, vor dem Start steht 0,00", () => {
  const ph = flatten(planSteps(day).steps);
  assert.equal(dashboard({ ph, running: true, base: 500, live: { distM: 400 } }).dist, "0,00");
  assert.equal(dashboard({ ph, running: false, live: { distM: 900 } }).dist, "0,00");
});
