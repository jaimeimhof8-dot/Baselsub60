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
