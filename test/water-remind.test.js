import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, expectedMl, messageFor } from "../supabase/functions/water/remind.js";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const base = { today: "2026-11-03", now: NOW };

test("Soll steigt linear von 7 bis 21 Uhr", () => {
  assert.equal(expectedMl(3000, 7), 0);
  assert.equal(expectedMl(3000, 14), 1500);
  assert.equal(expectedMl(3000, 21), 3000);
});

test("Erinnerung nur bei genug Rückstand und innerhalb 8–21 Uhr", () => {
  const st = { day: "2026-11-03", ml: 500, goal: 3000 };
  assert.deepEqual(decide(st, { ...base, hour: 14 }), { send: true, behind: 1000 });
  assert.equal(decide(st, { ...base, hour: 7 }).send, false); // zu früh
  assert.equal(decide(st, { ...base, hour: 21 }).send, false); // zu spät
  assert.equal(decide({ ...st, ml: 1300 }, { ...base, hour: 14 }).send, false); // nur 200 ml Rückstand
});

test("Abstand zwischen zwei Erinnerungen", () => {
  const st = { day: "2026-11-03", ml: 0, goal: 3000 };
  assert.equal(decide(st, { ...base, hour: 14, lastSent: new Date(NOW - 30 * 60000).toISOString() }).send, false);
  assert.equal(decide(st, { ...base, hour: 14, lastSent: new Date(NOW - 100 * 60000).toISOString() }).send, true);
});

test("Stand von gestern oder ohne Ziel", () => {
  assert.equal(decide({ day: "2026-11-02", ml: 3000, goal: 3000 }, { ...base, hour: 14 }).send, true); // heute nie geöffnet: zählt 0 ml
  assert.equal(decide(null, { ...base, hour: 14 }).send, false);
  assert.equal(decide({ day: "2026-11-03", ml: 0, goal: 0 }, { ...base, hour: 14 }).send, false);
});

test("Nachricht nennt den Rückstand gerundet", () => {
  assert.match(messageFor(620).body, /ca\. 600 ml/);
});
