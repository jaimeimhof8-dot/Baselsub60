import { test } from "node:test";
import assert from "node:assert/strict";
import { colOf, personTests, cleanWeights, partnerProfile } from "../src/profile.js";

const tests = { lauf: { j: ["4:20", "4:18"], m: ["4:30"] }, station: { 0: { j: "3:50", m: "4:05" }, 2: { m: "1:10" } }, trans: ["7", "9"] };

test("Spalte pro Person", () => {
  assert.equal(colOf("Jaime"), "j");
  assert.equal(colOf("Jimoh"), "m");
});

test("Testwerte nur aus der eigenen Spalte", () => {
  const j = personTests(tests, "j"), m = personTests(tests, "m");
  assert.deepEqual(j.lauf, ["4:20", "4:18", "", ""]);
  assert.deepEqual(m.lauf, ["4:30", "", "", ""]);
  assert.equal(j.station[0], "3:50"); assert.equal(m.station[0], "4:05");
  assert.equal(j.station[2], ""); assert.equal(m.station[2], "1:10");
  assert.equal(j.station.length, 8); assert.equal(j.trans.length, 6);
  assert.deepEqual(personTests(undefined, "j").lauf, ["", "", "", ""]);
});

test("Partnerprofil vom Server wird bereinigt", () => {
  const p = partnerProfile({ name: "Jimoh", weights: { "back squat": "90", "x": "<script>", "bench pres": 70 }, tests, updated_at: "2026-10-20T10:00:00Z" });
  assert.deepEqual(p.weights, { "back squat": "90", "bench pres": "70" });
  assert.deepEqual(p.tests.lauf, ["4:30", "", "", ""]);
  assert.equal(partnerProfile(null), null);
  assert.equal(partnerProfile({ name: 5 }), null);
  assert.deepEqual(cleanWeights("kaputt"), {});
});
