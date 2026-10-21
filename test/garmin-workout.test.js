import { test } from "node:test";
import assert from "node:assert/strict";
import { planSteps, countSteps } from "../src/garmin-workout.js";
import { buildWorkout } from "../supabase/functions/garmin/workout.js";

const PACING = {
  k: "lauf",
  t: "Lauf-Pacing-Test",
  i: [
    "Einlaufen 2,6 km @ 5:30/km (14:18).",
    "4×1 km @ 3:57/km (3:57) mit Jimoh, Trabpause 3×300 m @ 6:30/km (1:57).",
    "Auslaufen 2,5 km @ 5:30/km (13:45).",
  ],
};

test("Pacing-Test: jede Wiederholung und jede Pause als eigener Schritt", () => {
  const { steps, skipped } = planSteps(PACING);
  assert.deepEqual(skipped, []);
  assert.deepEqual(steps, [
    { kind: "warmup", dist: 2600, pace: 330 },
    { kind: "interval", dist: 1000, pace: 237 }, { kind: "recovery", dist: 300, pace: 390 },
    { kind: "interval", dist: 1000, pace: 237 }, { kind: "recovery", dist: 300, pace: 390 },
    { kind: "interval", dist: 1000, pace: 237 }, { kind: "recovery", dist: 300, pace: 390 },
    { kind: "interval", dist: 1000, pace: 237 },
    { kind: "cooldown", dist: 2500, pace: 330 },
  ]);
  assert.equal(countSteps(steps), 9);
});

test("3×1,5 km mit Trabpause 2×200 m: zwei Pausen zu 200 m, zusammen 400 m", () => {
  const { steps } = planSteps({ k: "lauf", i: ["3×1,5 km @ 4:10/km (6:15), Trabpause 2×200 m @ 6:30/km (1:18)."] });
  assert.deepEqual(steps.map((s) => s.kind), ["interval", "recovery", "interval", "recovery", "interval"]);
  assert.equal(steps.filter((s) => s.kind === "recovery").reduce((a, s) => a + s.dist, 0), 400);
  assert.deepEqual(steps.filter((s) => s.kind === "interval").map((s) => s.dist), [1500, 1500, 1500]);
});

test("Steigerungen nach dem Einlaufen in derselben Zeile", () => {
  const { steps } = planSteps({ k: "lauf", i: ["Einlaufen 2 km @ 5:30/km (11:00) → Steigerungen 6×80 m @ 3:30/km (0:17)."] });
  assert.equal(steps[0].kind, "warmup");
  assert.deepEqual(steps[1], { kind: "repeat", n: 6, steps: [{ kind: "interval", dist: 80, pace: 210 }, { kind: "recovery", lap: true }] });
});

test("Zone-2-Lauf: ein Schritt mit Distanz und Pace", () => {
  assert.deepEqual(planSteps({ k: "lauf", i: ["8 km Zone 2 @ 5:50/km (46:40), Puls 140–150 bpm."] }).steps, [{ kind: "interval", dist: 8000, pace: 350 }]);
});

test("2×2 km bleibt 2×2 km", () => {
  const { steps } = planSteps({ k: "lauf", i: ["2×2 km @ 4:03/km (8:06), Trabpause 1×400 m @ 6:30/km (2:36)."] });
  assert.deepEqual(steps, [{ kind: "interval", dist: 2000, pace: 243 }, { kind: "recovery", dist: 400, pace: 390 }, { kind: "interval", dist: 2000, pace: 243 }]);
});

test("Keine Lauf-Einheit oder nicht erkannte Pace-Zeile: nichts erfinden", () => {
  assert.deepEqual(planSteps({ k: "kraft", i: ["Kniebeuge 3×5"] }).steps, []);
  const r = planSteps({ k: "lauf", i: ["Fahrtspiel nach Gefühl, ca. 4:30/km"] });
  assert.deepEqual(r.steps, []);
  assert.equal(r.skipped.length, 1);
});

test("Garmin-Format: Schritt-Reihenfolge, Pace-Zielbereich in m/s, Wiederholung", () => {
  const w = buildWorkout("HYROX Pacing-Test", [...planSteps(PACING).steps, { kind: "repeat", n: 3, steps: [{ kind: "interval", dist: 1000, pace: 237 }, { kind: "recovery", dist: 300, pace: 390 }] }]);
  const s = w.workoutSegments[0].workoutSteps;
  assert.equal(w.sportType.sportTypeKey, "running");
  assert.equal(s[0].stepType.stepTypeKey, "warmup");
  assert.equal(s[0].endConditionValue, 2600);
  assert.equal(s[9].type, "RepeatGroupDTO");
  assert.equal(s[9].numberOfIterations, 3);
  assert.deepEqual(s[9].workoutSteps.map((x) => x.stepType.stepTypeKey), ["interval", "recovery"]);
  assert.deepEqual(s.slice(0, 9).map((x) => x.stepOrder), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const iv = s[1];
  assert.ok(iv.targetValueOne < iv.targetValueTwo);
  assert.ok(Math.abs(1000 / iv.targetValueOne - 242) < 0.1 && Math.abs(1000 / iv.targetValueTwo - 232) < 0.1);
});

test("Garmin-Format: ungültige Eingaben werden abgelehnt", () => {
  for (const bad of [[], [{ kind: "sprint", dist: 100 }], [{ kind: "interval", dist: 5 }], [{ kind: "interval", dist: 1000, pace: 10 }], [{ kind: "repeat", n: 2, steps: [{ kind: "repeat", n: 2, steps: [{ kind: "interval", dist: 100 }] }] }], "x"])
    assert.throws(() => buildWorkout("A", bad), { code: "bad_workout" });
  assert.throws(() => buildWorkout("", [{ kind: "interval", dist: 1000 }]), { code: "bad_workout" });
});
