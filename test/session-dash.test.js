import test from "node:test";
import assert from "node:assert/strict";
import { sessionDash } from "../src/session-dash.js";
import { analyseSession } from "../src/analyse.js";

const q = analyseSession({ kind: "lauf", easy: true, rpe: 4, items: [{ t: "Lockerer Lauf 40′", done: true, val: "" }] });
test("sessionDash: Kacheln, Rundenbalken, Coach-Chips", () => {
  const act = { time: 2400, dist: 8000, hr: 145, maxHr: 170, group: "run", laps: [{ d: 1000, t: 300, hr: 140 }, { d: 1000, t: 150, hr: 150 }] };
  const coach = { form: { rating: "auf Kurs" }, strengths: [1, 2], weaknesses: [], adjustments: [1], nextFocus: "Ruhig bleiben" };
  const d = sessionDash(q, act, coach);
  assert.equal(d.score, q.score);
  assert.deepEqual(d.tiles.map((t) => t.k), ["Umsetzung", "Anstrengung", "Dauer", "Ø Puls", "Beste Runde"]);
  assert.equal(d.tiles[2].v, "40:00 min");
  assert.equal(d.tiles[4].v, "2:30");
  assert.equal(d.laps.length, 2);
  assert.equal(d.laps[0].h, 100);
  assert.equal(d.laps[1].h, 50);
  assert.deepEqual(d.chips.map((c) => c.v), ["auf Kurs", "2", "0", "1"]);
  assert.equal(d.focus, "Ruhig bleiben");
});
test("sessionDash: ohne Uhr und ohne Coach nur die Fakten", () => {
  const d = sessionDash(q, null, null);
  assert.equal(d.laps, null);
  assert.deepEqual(d.chips, []);
  assert.ok(d.tiles.length >= 1);
});
