import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceM, atPlace, nextOpen } from "../src/focus.js";

const gym = { lat: 47.5596, lon: 7.5886 }; // Basel

test("Abstand in Metern", () => {
  assert.equal(Math.round(distanceM(gym, gym)), 0);
  const d = distanceM(gym, { lat: 47.5596 + 0.001, lon: 7.5886 }); // 0,001° Breite ≈ 111 m
  assert.ok(d > 105 && d < 117, String(d));
});

test("Am Trainingsort: innerhalb von 150 m, ungültige Werte nie", () => {
  assert.ok(atPlace({ lat: 47.5601, lon: 7.5886 }, gym)); // ca. 55 m
  assert.ok(!atPlace({ lat: 47.57, lon: 7.5886 }, gym)); // über 1 km
  assert.ok(!atPlace(null, gym));
  assert.ok(!atPlace({ lat: NaN, lon: 1 }, gym));
  assert.ok(!atPlace({ lat: 47.5596, lon: 7.5886 }, null));
  assert.ok(atPlace({ lat: 47.5606, lon: 7.5886 }, { ...gym, r: 300 })); // eigener Radius
});

test("Nächste offene Übung ab Position, danach von vorn", () => {
  const done = (j) => j === 0 || j === 2;
  assert.equal(nextOpen(4, done, 0), 1);
  assert.equal(nextOpen(4, done, 2), 3);
  assert.equal(nextOpen(4, () => true, 0), -1);
  assert.equal(nextOpen(0, () => false, 0), -1);
});

import { timedSpec, timerPhase } from "../src/focus.js";

test("Timer nur bei Zeitvorgabe im Plan", () => {
  assert.deepEqual(timedSpec("1 Minute Sled Push", "station"), { label: "Zeit", rounds: 1, work: 60, rest: 0 });
  assert.deepEqual(timedSpec("45 Sek Wall Sit", "kraft"), { label: "Zeit", rounds: 1, work: 45, rest: 0 });
  assert.deepEqual(timedSpec("EMOM 20′: 15 Wall Balls", "station"), { label: "EMOM", rounds: 20, work: 60, rest: 0 });
  assert.deepEqual(timedSpec("AMRAP 10′ Farmers + Lunges", "station"), { label: "AMRAP", rounds: 1, work: 600, rest: 0 });
  assert.deepEqual(timedSpec("Plank 3×50″", "kraft"), { label: "Halten", rounds: 3, work: 50, rest: 30 });
  assert.deepEqual(timedSpec("Compromised Running 2×10′ Zone 3, 2′ Pause, zusammen", "station"), { label: "Intervall", rounds: 2, work: 600, rest: 120 });
});

test("Kein Timer bei Gewicht, Distanz, Rad, Bereichen und Kleinkram", () => {
  for (const [t, k] of [["Back Squat 3×5 @75% RPE 7", "kraft"], ["4×1 km @ R", "lauf"], ["Sled Push", "station"], ["Bike 45–60′", "bike"], ["75–90′ Zone 2 Bike", "bike"],
    ["Übergabezeiten messen (Ziel < 8 Sek.)", "sim"], ["Kraft 1 minimal", "kraft"], ["Box Jumps 3×3", "kraft"], ["3 Runden: 400m Ski, 10 Sled Push", "station"]])
    assert.equal(timedSpec(t, k), null, t);
});

test("Timer-Phasen: Arbeit, Pause, letzte Runde ohne Pause, danach fertig", () => {
  const s = { label: "Halten", rounds: 3, work: 50, rest: 30 };
  assert.deepEqual(timerPhase(s, 0), { done: false, round: 0, rest: false, left: 50 });
  assert.deepEqual(timerPhase(s, 55), { done: false, round: 0, rest: true, left: 25 });
  assert.deepEqual(timerPhase(s, 85), { done: false, round: 1, rest: false, left: 45 });
  assert.equal(timerPhase(s, 3 * 50 + 2 * 30 - 1).done, false);
  assert.equal(timerPhase(s, 3 * 50 + 2 * 30).done, true); // nach der dritten Arbeit keine Pause mehr
  const emom = { label: "EMOM", rounds: 20, work: 60, rest: 0 };
  assert.deepEqual(timerPhase(emom, 61), { done: false, round: 1, rest: false, left: 59 });
  assert.equal(timerPhase(emom, 1200).done, true);
});
