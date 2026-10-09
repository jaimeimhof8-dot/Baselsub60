import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePlanText, splitByWeeks, parseExercises } from "../src/parser.js";

const text = readFileSync(new URL("./fixtures/plan-provisorisch.txt", import.meta.url), "utf8");
const { days, meta } = parsePlanText(text);

test("erkennt alle Blöcke, Wochen und den Renntag", () => {
  assert.deepEqual(meta.blocks.map((b) => b.id), ["A", "B", "C", "D", "T"]);
  assert.equal(meta.weeks.length, 4);
  assert.equal(meta.race, 124);
  assert.equal(days[124].k, "race");
});

test("Kraft 1 Woche 1 wird in Übungszeilen zerlegt", () => {
  assert.deepEqual(days[0].i, [
    "Back Squat 3×5 @75% RPE 7", "Bulgarian Split Squat 3×8 je Seite RPE 7", "Bench Press 3×6 RPE 7",
    "Shoulder Press 3×8 RPE 7", "Pull-ups 3×6 RPE 7", "Plank 3×50″"]);
});

test("gemeinsame Angaben (beziehungsweise) werden korrekt verteilt", () => {
  assert.equal(days[7].i[2], "Bench Press 3×6 RPE 7");
  assert.equal(days[7].i[3], "Shoulder Press 3×8 RPE 7");
});

test("Tagesarten und Flags", () => {
  assert.equal(days[1].k, "lauf"); assert.ok(days[1].joint); assert.ok(days[1].key);
  assert.equal(days[2].k, "bike"); assert.ok(!days[2].key);
  assert.equal(days[4].k, "rest");
  assert.equal(days[19].k, "sim"); // Sa Woche 3: Transition Drilling
});

test("Block-Absätze werden auf die 4 Wochen verteilt", () => {
  assert.match(days[29].i[0], /Woche 1/);
  assert.match(days[36].i[0], /Woche 2/);
  assert.equal(days[89].k, "bike");   // Block D, Sa Woche 1
  assert.equal(days[103].k, "sim");   // Block D, Sa Woche 3
});

test("splitByWeeks mit Bereichen", () => {
  const r = splitByWeeks("Intro. In den Wochen 1 bis 3 A. In Woche 4 B.", 4);
  assert.deepEqual(r.weeks.map((w) => w.slice(-2)), ["A.", "A.", "A.", "B."]);
  assert.equal(r.common, "Intro.");
});

test("parseExercises braucht Struktur", () => {
  assert.equal(parseExercises("Nur ein Satz ohne Übungen."), null);
});

test("leerer Text liefert Warnung statt Absturz", () => {
  const r = parsePlanText("irgendwas");
  assert.equal(Object.keys(r.days).length, 0);
  assert.equal(r.meta.warnings.length, 1);
});
