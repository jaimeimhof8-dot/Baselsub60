import { test } from "node:test";
import assert from "node:assert/strict";
import { weightList, cleanWeight, defaultWeight, isLift } from "../src/weights.js";
import { builtinPlan } from "../src/plan-store.js";

test("Gewichtsliste: Kraftübungen aus dem Plan, ohne Plank und Platzhalter", () => {
  const list = weightList(Object.values(builtinPlan().days));
  const labels = list.map((e) => e.label);
  for (const l of ["Back Squat", "Bench Press", "Bulgarian Split Squat", "Shoulder Press", "Pull-ups"]) assert.ok(labels.includes(l), l);
  assert.ok(!labels.some((l) => /plank|^kraft/i.test(l)));
  assert.equal(new Set(list.map((e) => e.key)).size, list.length);
});

test("Gewichtsliste nimmt neue Übungen aus importiertem Plan auf", () => {
  const list = weightList([{ k: "kraft", i: ["Hip Thrust 3×10", "Back Squat 5×3"] }, { k: "station", i: ["Sled Push 4×20m"] }]);
  assert.ok(list.some((e) => e.label === "Hip Thrust"));
  assert.ok(!list.some((e) => e.label === "Sled Push"));
});

test("Gewichtsliste ohne Sprünge und EMOM", () => {
  const list = weightList([{ k: "kraft", i: ["Box Jumps 3×3, im Wechsel mit den Kniebeugen", "EMOM 20′ (5 Runden): 15 Wall Balls", "Romanian Deadlift 3×8 RPE 7"] }]);
  assert.ok(list.some((e) => e.label === "Romanian Deadlift"));
  assert.ok(!list.some((e) => /Box Jumps|EMOM/.test(e.label)));
});

test("Gewicht normalisieren", () => {
  assert.equal(cleanWeight("80"), "80");
  assert.equal(cleanWeight(" 82,5 kg"), "82.5");
  assert.equal(cleanWeight("80KG"), "80");
  for (const bad of ["", "0", "abc", "80 x 5", "-5"]) assert.equal(cleanWeight(bad), "");
});

test("Vorschlag passt zur Übung trotz Satz-/Wdh-Angaben", () => {
  const w = { "back squat": "80", "pull-up": "10" };
  assert.equal(defaultWeight("Back Squat 3×5 @75% RPE 7", w), "80 kg");
  assert.equal(defaultWeight("Pull-ups 3×6 RPE 7", w), "10 kg");
  assert.equal(defaultWeight("Bench Press 3×6", w), "");
  assert.equal(defaultWeight("Back Squat", undefined), "");
});

test("Gewicht auch für feste Kraftübungen an Stationstagen", () => {
  assert.ok(isLift("kraft", "Wadenheben einbeinig 3×15"));
  assert.ok(isLift("station", "Back Squat 4×5 RPE 7"));
  assert.ok(isLift("station", "Bulgarian Split Squat 3×8 je Seite RPE 7"));
  assert.ok(!isLift("station", "Sled Push 50 m"));
  assert.ok(!isLift("lauf", "4×1 km @ R"));
});
