import { test } from "node:test";
import assert from "node:assert/strict";
import { isRunTest, isStationTest, stationIndex, timesIn, extractTests, applyTests } from "../src/testsync.js";

// Wie aus dem PDF-Plan v8 importiert (ohne test-Flag)
const pacing = { t: "Lauf-Pacing-Test", k: "lauf", i: ["15′ Einlaufen und Mobility", "4×1 km mit Jimoh, RPE 8–9, kein Sprint, 2′ Trabpause, alle Splits notieren", "10′ Auslaufen"] };
const bench = { t: "Stationen-Benchmark", k: "station", i: ["SkiErg 1000 m", "Sled Push 50 m", "Sled Pull 50 m", "Burpee Broad Jumps 80 m", "RowErg 1000 m", "Farmers Carry 200 m", "Sandbag Lunges 100 m", "100 Wall Balls"] };

test("Testtage am Titel erkennen, auch ohne Flag", () => {
  assert.ok(isRunTest(pacing));
  assert.ok(isRunTest({ t: "Lauf-Test T", k: "lauf" }));
  assert.ok(!isRunTest({ t: "Schwellenintervall", k: "lauf" }));
  assert.ok(isStationTest(bench));
  assert.ok(isStationTest({ t: "Stationen-Re-Test", k: "station" }));
  assert.ok(!isStationTest({ t: "Aerober Stationszirkel", k: "station" }));
  assert.equal(stationIndex("100 Wall Balls"), 7);
  assert.equal(stationIndex("Sandbag Lunges 100 m"), 6);
  assert.deepEqual(timesIn("3:52 3:55, 3:50/3:58 (RPE 9)"), [232, 235, 230, 238]);
});

test("Handytastatur: Punkt, Komma, Apostroph statt Doppelpunkt", () => {
  assert.deepEqual(timesIn("3.52 3.55 3.50 3.58"), [232, 235, 230, 238]);
  assert.deepEqual(timesIn("3,52 / 3,55"), [232, 235]);
  assert.deepEqual(timesIn("3'52 3′55"), [232, 235]);
  assert.deepEqual(timesIn("RPE 8.5, 1000 m, 3:72"), []);
  assert.deepEqual(extractTests(pacing, ["", "3.52 3.55 3.50 3.58", ""]).lauf, ["3:52", "3:55", "3:50", "3:58"]);
});

test("Pacing-Test: Splits aus der 4×1-km-Zeile, Einlaufzeit wird ignoriert", () => {
  assert.deepEqual(extractTests(pacing, ["15:00", "3:52 3:55 3:50 3:58", ""]), { lauf: ["3:52", "3:55", "3:50", "3:58"] });
  assert.deepEqual(extractTests(pacing, ["", "3:52, 3:55", ""]).lauf, ["3:52", "3:55", "", ""]);
  assert.equal(extractTests(pacing, ["", "gut gelaufen", ""]), null);
});

test("Stationen-Benchmark: je Station die erste Zeit", () => {
  const v = ["4:05", "2:31 schwer!", "", "3:10", "", "1:22", "", "4:40"];
  assert.deepEqual(extractTests(bench, v), { station: { 0: "4:05", 1: "2:31", 3: "3:10", 5: "1:22", 7: "4:40" } });
  assert.equal(extractTests({ t: "Kraft 1", k: "kraft", i: ["Back Squat"] }, ["100"]), null);
});

test("In die Testtabelle schreiben: eigene Spalte, Partner unberührt, onlyEmpty", () => {
  const tests = { lauf: { j: ["4:00", "", "", ""], m: ["3:55", "3:56", "3:57", "3:58"] }, station: { 1: { m: "2:20" } }, trans: [] };
  assert.equal(applyTests(tests, "j", { lauf: ["3:52", "3:55", "", ""] }, { onlyEmpty: true }), 1);
  assert.deepEqual(tests.lauf.j, ["4:00", "3:55", "", ""]);
  assert.equal(applyTests(tests, "j", { lauf: ["3:52", "3:55", "3:50", "3:58"], station: { 1: "2:31" } }), 4);
  assert.deepEqual(tests.lauf.j, ["3:52", "3:55", "3:50", "3:58"]);
  assert.deepEqual(tests.lauf.m, ["3:55", "3:56", "3:57", "3:58"]);
  assert.deepEqual(tests.station[1], { m: "2:20", j: "2:31" });
  assert.equal(applyTests(tests, "j", null), 0);
});
