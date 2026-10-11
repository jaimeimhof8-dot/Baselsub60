import { test } from "node:test";
import assert from "node:assert/strict";
import { swapDayData } from "../src/swap.js";

test("Tauschen nimmt Häkchen, Werte und Solo-Schalter mit, Notizen und Zusatz bleiben am Datum", () => {
  const A = "2026-10-13", B = "2026-10-14";
  const S = {
    done: { [A + "|0"]: 1, [A + "|2"]: 1, [B + "|1"]: 1, "2026-10-15|0": 1 },
    val: { [A + "|0"]: "4:10", [B + "|1"]: "80 kg" },
    solo: { [A]: 1 },
    skip: { [A]: 1, [B]: 1 },
    notes: { [A]: "müde" },
    extra: { [A]: [{ id: "x", type: "core" }] },
  };
  swapDayData(S, A, B);
  assert.deepEqual(S.done, { [B + "|0"]: 1, [B + "|2"]: 1, [A + "|1"]: 1, "2026-10-15|0": 1 });
  assert.deepEqual(S.val, { [B + "|0"]: "4:10", [A + "|1"]: "80 kg" });
  assert.deepEqual(S.solo, { [B]: 1 });
  assert.deepEqual(S.skip, {});
  assert.equal(S.notes[A], "müde");
  assert.equal(S.extra[A].length, 1);
  // Zurücktauschen stellt den Ausgangszustand her
  swapDayData(S, A, B);
  assert.deepEqual(S.solo, { [A]: 1 });
  assert.equal(S.val[A + "|0"], "4:10");
});

test("Tauschen ohne Solo-Feld (alte Daten) wirft nicht", () => {
  const S = { done: {}, val: {}, skip: {} };
  swapDayData(S, "a", "b");
  assert.deepEqual(S.done, {});
});
