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
    "Back Squat 3×5 @75% RPE 7", "Bulgarian Split Squat 3×8 je Seite RPE 7", "Push Press 3×6 RPE 7",
    "Shoulder Press 3×8 RPE 7", "Pull-ups 3×6 RPE 7", "Plank 3×50″"]);
});

test("gemeinsame Angaben (beziehungsweise) werden korrekt verteilt", () => {
  assert.equal(days[7].i[2], "Push Press 3×6 RPE 7");
  assert.equal(days[7].i[3], "Shoulder Press 3×8 RPE 7");
});

test("gleichbleibendes Volumen wird aus der Vorwoche übernommen", () => {
  assert.equal(days[7].i[4], "Pull-ups 3×6 RPE 7–8");
});

test("Tagesarten und Flags", () => {
  assert.equal(days[1].k, "lauf"); assert.ok(days[1].joint); assert.ok(days[1].key);
  assert.equal(days[2].k, "bike"); assert.ok(!days[2].key);
  assert.equal(days[4].k, "rest");
  assert.equal(days[19].k, "sim"); // Sa Woche 3: Transition Drilling
});

test("Block-Absätze werden auf die 4 Wochen verteilt", () => {
  assert.deepEqual(days[29].i, ["15′ Einlaufen", "4×8′ @82–85% max HF, 2′ Pause", "10′ Auslaufen"]);
  assert.deepEqual(days[36].i, ["15′ Einlaufen", "4×10′ @85%, 90″ Pause", "10′ Auslaufen"]);
  assert.equal(days[89].k, "bike");   // Block D, Sa Woche 1
  assert.equal(days[103].k, "sim");   // Block D, Sa Woche 3
});

test("Block B: Kraft als Übungsliste mit Topsatz und Wellenmuster der Zusatzübungen", () => {
  assert.deepEqual(days[28].i, [
    "Back Squat 4×5 @80% RPE 7–8", "Back Squat 1×3 @85%, Topsatz", "Bulgarian Split Squat 3×8 je Seite RPE 7",
    "Push Press 3×6 RPE 7", "Shoulder Press 3×8 RPE 7", "Pull-ups 3×6 RPE 7", "Plank 3×50″"]);
  assert.equal(days[35].i[0], "Back Squat 4×4 @82%");          // Woche 2: Hauptübung ohne Namen im Wochentext
  assert.equal(days[35].i[5], "Pull-ups 3×6 RPE 7–8");          // Volumen aus Block A Woche 2
  assert.deepEqual(days[49].i.slice(0, 2), ["Back Squat 3×5 @65% RPE 5–6", "Bulgarian Split Squat 2×8 RPE 5–6"]); // Deload, kein Topsatz
});

test("Block C–Taper: Zirkel, Grundübungen und kurze Zeilen statt Fliesstext", () => {
  assert.equal(days[56].i[0], "Back Squat RPE 7, Zirkel, 2 Durchgänge");
  assert.deepEqual(days[112].i[0], "Back Squat 2 Sätze RPE 5–6");
  assert.deepEqual(days[31].i, ["4 Runden im Stationswechsel mit leichtem Zeitdruck", "Compromised Running 2×10′ Zone 3"]);
  assert.deepEqual(days[30].i, ["45–60′ Rad @65–70% max HF"]);
  for (let i = 28; i < 124; i++) for (const line of days[i] ? days[i].i : []) assert.ok(line.length <= 130, `Tag ${i}: ${line}`);
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

test("Kraft in Kurzschreibweise: jede Übung wird eine Zeile, auch unbekannte", () => {
  const r = parsePlanText("Woche 1 – Aufbau (12.10. – 18.10.)\nMontag – Kraft 1. Back Squat 4×5 RPE 7. Romanian Deadlift 3×8 RPE 7. Heavy Sled Push 6×12,5 m @ 120 % Rennlast. Plank 3×50″. Kein Muskelversagen.");
  const d = r.days[0];
  assert.equal(d.k, "kraft");
  assert.deepEqual(d.i, ["Back Squat 4×5 RPE 7", "Romanian Deadlift 3×8 RPE 7", "Heavy Sled Push 6×12,5 m @ 120 % Rennlast", "Plank 3×50″"]);
  assert.equal(d.n, "Kein Muskelversagen.");
});
