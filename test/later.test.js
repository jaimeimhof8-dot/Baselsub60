import { test } from "node:test";
import assert from "node:assert/strict";
import { openItems, canCarry, makeCarry, carriedTo, carryProgress } from "../src/later.js";
import { swapDayData } from "../src/swap.js";

const kraft = { t: "Kraft 1", k: "kraft", i: ["Back Squat 4×6", "RDL 3×8", "Lunges 3×10", "Core"] };

test("Offene Übungen: nur, was nicht abgehakt ist", () => {
  const done = { "2026-10-12|0": 1, "2026-10-12|2": 1 };
  assert.deepEqual(openItems(kraft, done, "2026-10-12"), [1, 3]);
  assert.deepEqual(openItems(null, done, "x"), []);
});

test("Anhängen nur heute/vergangen, mit offenen Übungen und Folgetag", () => {
  const base = { i: 5, today: 5, last: 125, day: kraft, open: [1] };
  assert.ok(canCarry(base));
  assert.ok(!canCarry({ ...base, i: 6 })); // Zukunft: dafür gibt es Umplanen
  assert.ok(!canCarry({ ...base, i: 125, today: 125 })); // kein Folgetag
  assert.ok(!canCarry({ ...base, open: [] }));
  assert.ok(!canCarry({ ...base, day: { t: "Ruhetag", k: "rest", i: [] } }));
});

test("Ziel-Tag findet seine angehängten Einheiten, Fortschritt zählt am Ursprung", () => {
  const later = {
    "2026-10-13": makeCarry("2026-10-14", [1, 3], 1),
    "2026-10-12": makeCarry("2026-10-14", [2], 1),
    "2026-10-15": makeCarry("2026-10-16", [0], 1),
  };
  const c = carriedTo(later, "2026-10-14");
  assert.deepEqual(c.map((x) => x.from), ["2026-10-12", "2026-10-13"]);
  assert.deepEqual(carryProgress(c[1], { "2026-10-13|3": 1 }), { n: 2, done: 1 });
  assert.deepEqual(carriedTo(later, "2026-10-20"), []);
});

test("Tage tauschen: der Anhang wandert mit der Einheit", () => {
  const s = { done: {}, val: {}, later: { "2026-10-13": makeCarry("2026-10-14", [1], 1) } };
  swapDayData(s, "2026-10-13", "2026-10-15");
  assert.equal(s.later["2026-10-13"], undefined);
  assert.equal(s.later["2026-10-15"].to, "2026-10-14");
});
