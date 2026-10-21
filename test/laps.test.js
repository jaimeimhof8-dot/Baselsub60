import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentRuns, repSummary } from "../src/laps.js";

const slow = (d = 1000) => ({ d, t: Math.round(d * 0.33) });
const fast = (t, d = 1000) => ({ d, t });

test("4×1 km: eine Runde je Wiederholung, Pause und Ein-/Auslaufen zählen nicht", () => {
  const laps = [slow(2600), fast(237), slow(300), fast(240), slow(300), fast(238), slow(300), fast(241), slow(2500)];
  const s = segmentRuns(laps, "4×1 km @ 3:57/km (3:57) mit Jimoh, Trabpause 3×300 m @ 6:30/km (1:57)");
  assert.deepEqual(s.map((x) => x.t), [237, 240, 238, 241]);
  assert.equal(repSummary({ laps }, "4×1 km @ 3:57/km (3:57)"), "4×1 km: 3:57 · 4:00 · 3:58 · 4:01 (Ø 3:59/km)");
});

test("Plan 2×2 km bleibt 2×2 km, auch wenn die Uhr jeden Kilometer eine Runde macht", () => {
  const laps = [slow(), slow(), fast(242), fast(244), slow(300), fast(240), fast(243), slow(), slow()];
  const s = segmentRuns(laps, "2×2 km @ 4:03/km (8:06)");
  assert.equal(s.length, 2);
  assert.deepEqual(s.map((x) => [x.d, x.t]), [[2000, 486], [2000, 483]]);
  assert.equal(repSummary({ laps }, "2×2 km @ 4:03/km (8:06)"), "2×2 km: 8:06 · 8:03 (Ø 4:02/km)");
});

test("Plan 4×1 km wird nicht zu 2×2 km: zwei zusammenhängende Kilometer sind zwei Wiederholungen", () => {
  const laps = [slow(), fast(240), fast(242), slow(300), fast(241), fast(243), slow()];
  const s = segmentRuns(laps, "4×1 km @ 4:00/km (4:00)");
  assert.deepEqual(s.map((x) => x.d), [1000, 1000, 1000, 1000]);
});

test("Mehr schnelle Runden als geplant: die schnellsten bleiben, in Reihenfolge", () => {
  const laps = [fast(250), slow(300), fast(238), slow(300), fast(240), slow(300), fast(236)];
  const s = segmentRuns(laps, "3×1 km @ 4:00/km (4:00)");
  assert.deepEqual(s.map((x) => x.t), [238, 240, 236]);
});

test("Passen die Runden nicht zur Vorgabe, bleibt es bei der bisherigen Erkennung", () => {
  assert.equal(segmentRuns([fast(240)], "4×1 km @ 4:00/km (4:00)"), null);
  assert.equal(segmentRuns([slow(), slow()], "Lockerer Lauf 40′"), null);
  const act = { laps: [fast(240), fast(241), fast(239)] };
  assert.equal(typeof repSummary(act, "Lockerer Lauf 40′"), "string");
});
