import test from "node:test";
import assert from "node:assert/strict";
import { sessionDash, compareToPrev } from "../src/session-dash.js";
import { analyseSession } from "../src/analyse.js";

const q = analyseSession({ kind: "lauf", easy: true, rpe: 4, items: [{ t: "Lockerer Lauf 40′", done: true, val: "" }] });
test("sessionDash: Kacheln, Rundenbalken, Coach-Chips", () => {
  const act = { time: 2400, dist: 8000, hr: 145, maxHr: 170, group: "run", laps: [{ d: 1000, t: 300, hr: 140 }, { d: 1000, t: 150, hr: 150 }] };
  const coach = { form: { rating: "auf Kurs" }, strengths: [1, 2], weaknesses: [], adjustments: [1], nextFocus: "Ruhig bleiben" };
  const d = sessionDash(q, act, coach);
  assert.equal(d.score, q.score);
  assert.deepEqual(d.tiles.map((t) => t.k), ["Umsetzung", "Anstrengung", "Dauer", "Ø Puls"]);
  assert.equal(d.tiles[2].v, "40:00 min");
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

test("compareToPrev: gleiches mit gleichem, nur vorhandene Werte", () => {
  const cur = { act: { group: "run", dist: 8000, time: 2400, hr: 148 }, rpe: 6 };
  const prev = { act: { group: "run", dist: 8000, time: 2480, hr: 153 }, rpe: 7 };
  const r = compareToPrev(cur, prev);
  assert.deepEqual(r.map((x) => x.k), ["Pace", "Ø Puls", "Anstrengung", "Dauer"]);
  assert.equal(r[0].v, "−10 s/km");
  assert.equal(r[0].tone, "green");
  assert.equal(r[1].v, "−5 bpm");
  assert.equal(r[2].v, "−1");
  assert.equal(r[3].v, "−1:20 min");
  assert.equal(r[3].tone, "");
  // lockerer Lauf: langsamer ist kein Minus; Puls höher bei schnellerem Tempo auch nicht
  const slow = compareToPrev({ act: { group: "run", dist: 8000, time: 2800, hr: 140 } }, { act: { group: "run", dist: 8000, time: 2400, hr: 140 } }, { easy: true });
  assert.equal(slow[0].tone, "");
  const fast = compareToPrev({ act: { group: "run", dist: 8000, time: 2300, hr: 160 } }, { act: { group: "run", dist: 8000, time: 2400, hr: 150 } });
  assert.equal(fast[1].tone, "");
  // Kraft ohne Distanz: nur Puls, Anstrengung, Dauer
  assert.deepEqual(compareToPrev({ act: { group: "strength", time: 3000, hr: 120 }, rpe: 7 }, { act: { group: "strength", time: 3300, hr: 122 }, rpe: 7 }).map((x) => x.k), ["Ø Puls", "Anstrengung", "Dauer"]);
  assert.deepEqual(compareToPrev(cur, null), []);
});
