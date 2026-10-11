import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKg, nextWeight, targetRpe } from "../src/weights.js";

test("Gewicht aus Einträgen lesen", () => {
  assert.equal(parseKg("82,5 kg × 5"), 82.5);
  assert.equal(parseKg("80/85/85"), 85);
  assert.ok(isNaN(parseKg("3×5")));
  assert.ok(isNaN(parseKg("")));
});

test("Progression nach RPE der letzten Einheit", () => {
  assert.equal(nextWeight("80 kg × 5", 7), "82.5 kg");
  assert.equal(nextWeight("80 kg × 5", 8), "80 kg");
  assert.equal(nextWeight("80 kg × 5", 9), "77.5 kg");
  assert.equal(nextWeight("80 kg × 5", undefined), "80 kg");
  assert.equal(nextWeight("80 kg", 6, "Back Squat 3×5 @65% RPE 5–6"), "72.5 kg");
  assert.equal(nextWeight("4:12 / 4:10", 7), "");
});

test("Ziel-RPE als Bereich aus dem Plan", () => {
  assert.deepEqual(targetRpe(["Back Squat 3×5 @75% RPE 7", "Pull-ups 3×6 RPE 7–8", "Plank 3×50″"]), [7, 8]);
  assert.deepEqual(targetRpe(["4×1km zusammen, RPE 8–9 (kein Sprint)"]), [8, 9]);
  assert.equal(targetRpe(["Bike 45′"]), null);
});
