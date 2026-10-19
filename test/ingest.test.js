import { test } from "node:test";
import assert from "node:assert/strict";
import { plannedRun, matchKind } from "../src/ingest.js";

const run = (km, min) => ({ id: "g1", group: "run", dist: km * 1000, time: min * 60 });

test("Geplante Lauf-Distanz und -Dauer aus den Zeilen", () => {
  assert.deepEqual(plannedRun({ i: ["4×1 km @ R", "Einlaufen 10′"] }), { km: 4, min: 10 });
  assert.deepEqual(plannedRun({ i: ["60′ Zone 2"] }), { km: null, min: 60 });
  assert.deepEqual(plannedRun({ i: ["10 km locker"] }), { km: 10, min: null });
  assert.deepEqual(plannedRun({ i: ["Lockerer Lauf"] }), { km: null, min: null });
});

test("Lauf wird bei ±25 % automatisch zugeordnet", () => {
  const day = { k: "lauf", i: ["10 km locker"] };
  assert.equal(matchKind(run(10.5, 55), day), "run");
  assert.equal(matchKind(run(8, 45), day), "run"); // -20 %
  assert.equal(matchKind(run(5, 28), day), null); // zu kurz
  assert.equal(matchKind(run(5, 28), { k: "lauf", i: ["Lockerer Lauf"] }), "run"); // Plan ohne Zahlen: Sportart genügt
  assert.equal(matchKind(run(10, 5), day), null); // unter 12 Min.
});

test("Kraft/Cardio auf Kraft- und Stationstagen nur als Nachweis, Lauf auf Krafttag nicht", () => {
  const st = { id: "g2", group: "strength", time: 50 * 60 };
  assert.equal(matchKind(st, { k: "kraft", i: ["Back Squat 3×5"] }), "meta");
  assert.equal(matchKind(st, { k: "station", i: ["Sled Push"] }), "meta");
  assert.equal(matchKind(st, { k: "lauf", i: ["10 km"] }), null);
  assert.equal(matchKind(run(5, 30), { k: "kraft", i: ["Back Squat"] }), null);
  assert.equal(matchKind(st, { k: "kraft", inj: true, i: [] }), null);
});
