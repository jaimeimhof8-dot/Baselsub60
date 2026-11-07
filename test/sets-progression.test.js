import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSets, formatSets, parseKg, stepValue } from "../src/weights.js";
import { parseRx, rxLabel, performed, comparable, suggestWeight } from "../src/progression.js";
import { makeBackup, readBackup } from "../src/backup.js";

// Referenz: so las parseKg vor der Änderung (Migrationsorakel)
function parseKgOld(v) {
  const s = String(v || "").replace(",", ".");
  const kg = s.match(/(\d{1,3}(?:\.\d+)?)\s*kg/i);
  if (kg) return +kg[1];
  if (/\d:\d/.test(s)) return NaN;
  const nums = (s.match(/\d{1,3}(?:\.\d+)?/g) || []).map(Number).filter((n) => n >= 10 && n <= 400);
  return nums.length ? Math.max(...nums) : NaN;
}

test("Satz-Struktur: ein Wert für alle, mit Wdh., je Satz", () => {
  assert.deepEqual(parseSets("80 kg"), [{ kg: 80, reps: null }]);
  assert.deepEqual(parseSets("82,5 kg × 5"), [{ kg: 82.5, reps: 5 }]);
  assert.deepEqual(parseSets("80/85/85"), [{ kg: 80, reps: null }, { kg: 85, reps: null }, { kg: 85, reps: null }]);
  assert.deepEqual(parseSets("80 kg × 5 / 85 kg × 5 / 85 kg × 3"), [{ kg: 80, reps: 5 }, { kg: 85, reps: 5 }, { kg: 85, reps: 3 }]);
  assert.deepEqual(parseSets("80×5 / 85×5 kg"), [{ kg: 80, reps: 5 }, { kg: 85, reps: 5 }]);
  for (const bad of ["", "3×5", "4:12 / 4:10", "3:52 3:55", "8/7/6", "locker", "0 kg", "500 kg"]) assert.deepEqual(parseSets(bad), [], bad);
});

test("Formatieren und Wieder-Einlesen verliert nichts", () => {
  const sets = [{ kg: 80, reps: 5 }, { kg: 82.5, reps: 5 }, { kg: 85, reps: null }];
  assert.equal(formatSets(sets), "80 kg × 5 / 82.5 kg × 5 / 85 kg");
  assert.deepEqual(parseSets(formatSets(sets)), sets);
  assert.equal(formatSets([{ kg: 80, reps: null }]), "80 kg"); // altes Format bleibt identisch
  assert.equal(formatSets([{ kg: 0, reps: 5 }]), "");
});

test("Migration: alle alten Werte lesen sich wie vorher", () => {
  const legacy = ["80 kg", "80kg", "82,5 kg × 5", "80/85/85", "60 kg 3×8", "100", "4:12 / 4:10", "3:52 3:55 4:01", "12 kg je Seite", "3×5", "", "locker", "20 kg + 10 kg"];
  for (const v of legacy) {
    const a = parseKg(v), b = parseKgOld(v);
    assert.ok((isNaN(a) && isNaN(b)) || a === b, `${v}: neu ${a} alt ${b}`);
  }
});

test("Migration: Backup mit alten und neuen Werten übersteht Export und Import unverändert", () => {
  const state = { done: { "2027-01-04|0": 1 }, val: { "2027-01-04|0": "80 kg", "2027-01-04|1": "82,5 kg × 5", "2027-01-04|2": "80 kg × 5 / 85 kg × 5 / 85 kg × 3" }, weights: { "back squat": "80" } };
  const back = readBackup(JSON.stringify(makeBackup(state, { user: "jaime" })));
  assert.deepEqual(back.data, state);
  assert.equal(parseKg(back.data.val["2027-01-04|2"]), 85);
  // altes Backup ohne Kopf
  assert.deepEqual(readBackup(JSON.stringify(state)).data.val, state.val);
});

test("Schritt ändert alle Sätze, Struktur bleibt", () => {
  assert.equal(stepValue("80 kg", 1), "82.5 kg");
  assert.equal(stepValue("80 kg × 5 / 85 kg × 3", 1), "82.5 kg × 5 / 87.5 kg × 3");
  assert.equal(stepValue("", 1), "");
});

test("Plan-Schema lesen, Läufe und Zeiten sind keins", () => {
  assert.deepEqual(parseRx("Back Squat 3×5 @75% RPE 7"), { sets: 3, lo: 5, hi: 5 });
  assert.deepEqual(parseRx("Pull-ups 3×6–8 RPE 7"), { sets: 3, lo: 6, hi: 8 });
  assert.deepEqual(parseRx("Bulgarian Split Squat 2×8 je Seite"), { sets: 2, lo: 8, hi: 8 });
  assert.equal(rxLabel(parseRx("Deadlift 4×3")), "4×3");
  for (const t of ["4×1 km @ R", "Plank 3×50″", "Sled Push 4×20m", "Back Squat Topsatz", "Bike 45′"]) assert.equal(parseRx(t), null, t);
});

test("Vergleichbarkeit: nur gleiche Sätze×Wdh. (3×5 vs 3×5 ja, vs 3×6 / 4×5 / 2×8 nein)", () => {
  const p35 = performed("80 kg", "Back Squat 3×5 RPE 7");
  assert.equal(comparable(p35, parseRx("Back Squat 3×5")), true);
  assert.equal(comparable(p35, parseRx("Back Squat 3×4–6")), true); // Plan-Bereich enthält die Wdh.
  assert.equal(comparable(p35, parseRx("Back Squat 3×6")), false);
  assert.equal(comparable(p35, parseRx("Back Squat 4×5")), false);
  assert.equal(comparable(p35, parseRx("Back Squat 2×8")), false);
  assert.equal(comparable(p35, parseRx("Back Squat 5×3")), false);
  assert.equal(comparable(p35, null), null);
  assert.equal(comparable(performed("80 kg", "Back Squat Topsatz"), parseRx("Back Squat 3×5")), null);
});

test("Ein Wert gilt für alle geplanten Sätze, fehlende Wdh. aus dem Plan", () => {
  const p = performed("80 kg", "Back Squat 3×5");
  assert.equal(p.n, 3); assert.equal(p.top.reps, 5); assert.ok(p.uniform);
  const q = performed("80 kg × 5 / 85 kg × 3", "Back Squat 3×5");
  assert.equal(q.n, 2); assert.equal(q.top.kg, 85); assert.equal(q.top.reps, 3); assert.ok(!q.uniform);
});

test("Vorschlag: gleiche Struktur → bisherige RPE-Regel", () => {
  const s = suggestWeight("Back Squat 3×5 RPE 7", [{ v: "80 kg", rpe: 7, t: "Back Squat 3×5 RPE 7", age: 7 }]);
  assert.equal(s.kind, "direct"); assert.equal(s.kg, 82.5);
  const h = suggestWeight("Back Squat 3×5", [{ v: "80 kg", rpe: 9, t: "Back Squat 3×5", age: 7 }]);
  assert.equal(h.kg, 77.5);
});

test("Vorschlag: 3×5 mit 80 kg gestern → 2×8 heute: KEIN Vorschlag, nur Hinweis, keine Umrechnung", () => {
  const s = suggestWeight("Back Squat 2×8 RPE 7", [{ v: "80 kg", rpe: 7, t: "Back Squat 3×5 RPE 7", age: 7 }]);
  assert.equal(s.kind, "none"); assert.equal(s.kg, null);
  assert.match(s.text, /letztes Mal anders: 3×5 mit 80 kg/);
  assert.doesNotMatch(s.text, /Schätzung|1RM|Epley/);
  assert.equal(suggestWeight("Back Squat 3×5", [{ v: "72.5 kg", rpe: 7, t: "Back Squat 2×8", age: 7 }]).kg, null);
  // 3×6 gegen 3×5 und 4×5 gegen 3×5 sind ebenfalls nicht gleich
  assert.equal(suggestWeight("Back Squat 3×6", [{ v: "80 kg", rpe: 7, t: "Back Squat 3×5", age: 7 }]).kg, null);
  assert.equal(suggestWeight("Back Squat 4×5", [{ v: "80 kg", rpe: 7, t: "Back Squat 3×5", age: 7 }]).kg, null);
});

test("Vorschlag: lieber eine ältere vergleichbare Einheit als eine Umrechnung, aber nicht uralt", () => {
  const hist = [{ v: "70 kg", rpe: 7, t: "Back Squat 2×8", age: 7 }, { v: "80 kg", rpe: 7, t: "Back Squat 3×5", age: 28 }];
  const s = suggestWeight("Back Squat 3×5", hist);
  assert.equal(s.kind, "direct"); assert.equal(s.kg, 82.5);
  const old = suggestWeight("Back Squat 3×5", [hist[0], { ...hist[1], age: 120 }]);
  assert.equal(old.kind, "none");
});

test("Vorschlag: unterschiedliche Sätze → schwerster Satz ist Basis, Schema muss gleich sein", () => {
  const s = suggestWeight("Back Squat 3×5", [{ v: "80 kg × 5 / 85 kg × 5 / 85 kg × 5", rpe: 8, t: "Back Squat 3×5", age: 7 }]);
  assert.equal(s.kind, "direct"); assert.equal(s.kg, 85);
  assert.equal(suggestWeight("Back Squat 3×5", [{ v: "80 kg × 5 / 85 kg × 3", rpe: 8, t: "Back Squat 3×5", age: 7 }]).kg, null);
});

test("Vorschlag: fehlende Daten → kein erfundener Wert", () => {
  const none = suggestWeight("Back Squat 3×5", []);
  assert.equal(none.kg, null); assert.equal(none.kind, "none"); assert.match(none.text, /Noch kein Gewicht/);
  const noRx = suggestWeight("Back Squat 3×5", [{ v: "80 kg", rpe: 7, t: "Back Squat Topsatz", age: 7 }]);
  assert.equal(noRx.kg, null); assert.match(noRx.text, /kein Vorschlag/);
  assert.equal(suggestWeight("Back Squat 3×5", [{ v: "4:12", rpe: 7, t: "Back Squat 3×5", age: 7 }]).kg, null);
});

test("Plan ohne Satzschema auf beiden Seiten: bisherige Regel", () => {
  const s = suggestWeight("Back Squat Topsatz", [{ v: "100 kg", rpe: 7, t: "Back Squat Topsatz", age: 7 }]);
  assert.equal(s.kind, "direct"); assert.equal(s.kg, 102.5);
});

test("Randfälle: Wdh. 0, Zeitangaben, Dezimal-Satzzahl, Stepper behält Sätze", () => {
  assert.deepEqual(parseSets("80 kg x 0"), []);
  assert.equal(parseRx("Plank 3×45 sec"), null);
  assert.equal(parseRx("2.5×8"), null);
  assert.equal(stepValue("80 kg × 5 / 2.5 kg", -1), "77.5 kg × 5 / 2.5 kg");
});
