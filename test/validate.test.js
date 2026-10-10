import { test } from "node:test";
import assert from "node:assert/strict";
import { isFiller, valueHint, missingValues } from "../src/validate.js";

test("Ein- und Auslaufen brauchen keinen Wert", () => {
  assert.equal(isFiller("Einlaufen 10′ locker"), true);
  assert.equal(isFiller("Auslaufen 5′"), true);
  assert.equal(isFiller("6× 1 km @T"), false);
});

test("Erwarteter Wert je nach Einheit und Übung", () => {
  assert.equal(valueHint("lauf", "6× 1 km @T"), "Pace");
  assert.equal(valueHint("bike", "45′ Z2"), "Watt");
  assert.equal(valueHint("kraft", "Back Squat 4×5 @80%"), "Gewicht");
  assert.equal(valueHint("kraft", "Plank 3×50″"), "Zeit");
  assert.equal(valueHint("hyrox", "4 Runden: 1 km Lauf + 20 Wall Balls"), "Runden");
  assert.equal(valueHint("hyrox", "SkiErg 1000 m"), "Zeit oder Watt");
  assert.equal(valueHint("hyrox", "Sled Push 4×25 m"), "Zeit");
});

test("Nur abgehakte Übungen ohne Wert gelten als unvollständig", () => {
  const items = ["Einlaufen 10′", "6× 1 km @T", "Wall Balls 3×20", "Auslaufen 5′"];
  const dk = "2026-10-10";
  const done = { [dk + "|0"]: 1, [dk + "|1"]: 1, [dk + "|2"]: 1 };
  const val = { [dk + "|1"]: "4:05 / 4:02", [dk + "|2"]: "  " };
  assert.deepEqual(missingValues(items, done, val, dk), [{ t: "Wall Balls 3×20", j: 2 }]);
  assert.deepEqual(missingValues(items, {}, {}, dk), []);
});
