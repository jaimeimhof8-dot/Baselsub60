import { test } from "node:test";
import assert from "node:assert/strict";
import { suggest } from "../src/adapt.js";
import { effective, soreStreaks, overloadRisk } from "../src/soreness.js";

const kraft = { t: "Kraft 1", k: "kraft", i: ["Back Squat 3×5", "Bulgarian Split Squat 3×8"] };
const lauf = { t: "Intervall", k: "lauf", i: ["4×1km"] };
const station = { t: "Stationen", k: "station", i: ["100 Wall Balls", "Sled Push"] };
const bike = { t: "Bike", k: "bike", i: ["Bike 45′"] };
const rest = { t: "Ruhetag", k: "rest", i: [] };
const ctx = (days, doneDays, reports = {}, today = 2) => ({ today, last: 10, plan: (i) => days[i] || rest,
  status: (i) => ({ n: 2, done: doneDays.includes(i) ? 2 : 0 }), skipped: () => false, rpe: () => undefined,
  checkin: () => undefined, dismissed: {}, sore: (i) => effective(reports, i) });

test("Muskelkater-Serie: Tage in Folge über 6/10", () => {
  const at = (i) => effective({ 0: { knee: 7 }, 1: { knee: 8 }, 2: { knee: 7, abs: 9 } }, i);
  assert.deepEqual(soreStreaks(at, 2), { knee: 3, abs: 1 });
  assert.deepEqual(soreStreaks(at, 5), {});
});

test("3 Tage über 6/10 an einer belasteten Stelle → verschieben auf freien Tag", () => {
  const days = [rest, rest, lauf, rest];
  const s = suggest(ctx(days, [], { 0: { achilles: 7 }, 1: { achilles: 7 }, 2: { achilles: 8 } }));
  assert.equal(s[0].id, "over:2"); assert.equal(s[0].type, "swap"); assert.equal(s[0].to, 3);
  assert.match(s[0].why, /Achillessehne seit 3 Tagen über 6\/10 \(aktuell 8\/10\)/);
});

test("Nur 2 Tage hoch oder nicht belastete Stelle → keine Überlastung", () => {
  const two = suggest(ctx([rest, rest, lauf], [], { 1: { achilles: 7 }, 2: { achilles: 8 } }));
  assert.ok(!two.some((s) => s.id.startsWith("over")));
  const other = suggest(ctx([rest, rest, lauf], [], { 0: { chest: 8 }, 1: { chest: 8 }, 2: { chest: 8 } }));
  assert.ok(!other.some((s) => s.id.startsWith("over")));
});

test("Sehne am 3. Tag in Folge stossartig belastet → entlasten", () => {
  const s = suggest(ctx([kraft, lauf, station], [0, 1]));
  assert.equal(s[0].id, "over:2"); assert.equal(s[0].type, "easy");
  assert.match(s[0].why, /Patellasehne \/ Knie am 3\. Tag in Folge belastet/);
});

test("Nicht trainierte Vortage und Rad zählen nicht als Sehnenbelastung", () => {
  assert.ok(!suggest(ctx([kraft, lauf, station], [0])).some((s) => s.id.startsWith("over")));
  assert.ok(!suggest(ctx([kraft, bike, station], [0, 1])).some((s) => s.id.startsWith("over")));
  assert.deepEqual(overloadRisk(rest, 2, 2, () => ({}), () => null), []);
});
