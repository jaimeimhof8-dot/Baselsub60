import { test } from "node:test";
import assert from "node:assert/strict";
import { lockReason, movable, canDrop, shelfStart } from "../src/shelf.js";

const plan = (m) => (i) => m[i] || null;

test("Vergangenheit, Verletzung, Renntag und leere Tage sind gesperrt", () => {
  assert.equal(lockReason({ k: "lauf" }, 3, 5), "past");
  assert.equal(lockReason({ k: "lauf", inj: "pause" }, 6, 5), "inj");
  assert.equal(lockReason({ k: "race", race: true }, 6, 5), "race");
  assert.equal(lockReason(null, 6, 5), "none");
  assert.equal(lockReason({ k: "lauf" }, 5, 5), "");
  assert.ok(movable({ k: "rest" }, 7, 5));
});

test("Ablegen: nur zwischen beweglichen Tagen, nie auf sich selbst, nie Ruhetag auf Ruhetag", () => {
  const p = plan({ 5: { k: "kraft" }, 6: { k: "lauf" }, 7: { k: "rest" }, 8: { k: "rest" }, 9: { k: "lauf", inj: "alt" }, 2: { k: "lauf" } });
  assert.ok(canDrop(5, 6, p, 5));
  assert.ok(canDrop(5, 7, p, 5)); // Einheit auf freien Tag
  assert.ok(canDrop(7, 6, p, 5)); // Ruhetag zieht die Einheit zu sich
  assert.equal(canDrop(5, 5, p, 5), false);
  assert.equal(canDrop(7, 8, p, 5), false);
  assert.equal(canDrop(5, 9, p, 5), false);
  assert.equal(canDrop(5, 2, p, 5), false);
  assert.equal(canDrop(5, 99, p, 5), false);
});

test("Regal zeigt zwei Wochen, die beide im Plan liegen", () => {
  assert.equal(shelfStart(0, 18), 0);
  assert.equal(shelfStart(5, 18), 5);
  assert.equal(shelfStart(17, 18), 16);
});
