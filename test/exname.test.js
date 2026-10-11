import { test } from "node:test";
import assert from "node:assert/strict";
import { exName } from "../src/util.js";
import { weightList } from "../src/weights.js";
import { builtinPlan } from "../src/plan-store.js";

test("Übungsname ohne RPE-Angabe: Zirkelwochen finden dieselbe Übung", () => {
  assert.equal(exName("Back Squat RPE 7, Zirkel, 2 Durchgänge"), exName("Back Squat 3×5 @75% RPE 7"));
  assert.equal(exName("Pull-ups RPE 7, Zirkel"), "pull-up");
  const labels = weightList(Object.values(builtinPlan().days)).map((e) => e.label);
  assert.ok(!labels.some((l) => /RPE/.test(l)), labels.join(", "));
});
