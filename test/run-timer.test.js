import { test } from "node:test";
import assert from "node:assert/strict";
import { flatten, targetSec, phaseTitle, phaseGoal, splitSummary } from "../src/run-timer.js";
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
