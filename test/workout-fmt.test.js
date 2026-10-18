import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtLine, lineSlots, _internal } from "../src/workout-fmt.js";

const { digits, visible } = _internal;
const text = (html) => visible(html).replace(/\s+/g, " ").trim();

const RUN_STATION = [
  "Run 2: 1 km @ 4:02/km (4:02) → Sled Push 50 m mit 200 kg (150 kg Platten, Ziel 2:50, Wechsel alle 7 m in Bewegung).",
  "Run 1: 1 km @ 4:05/km (4:05) → SkiErg 1000 m @ 1:47/500 m (Ziel 3:35, Wechsel bei 350 m und 700 m).",
  "Run 4: 1 km @ 4:05/km (4:05) → Burpee Broad Jumps 80 m (Ziel 2:55, Wechsel alle 5 Sprünge).",
  "Run 6: 1 km @ 4:02/km (4:02) → Farmers Carry 200 m mit 2×32 kg (Ziel 1:26, 1 Wechsel bei 100 m).",
  "Run 8: 1 km @ 4:05/km (4:05) → Wall Balls 100 mit 9 kg auf 3 m (Ziel 3:45, Aufteilung 20/20/15/15/15/15 mit direkter Ballübergabe).",
  "Runde 2 und 4 mit Jimoh: Sled Push 50 m mit 200 kg (150 kg Platten, Ziel 2:50, Wechsel alle 7 m in Bewegung) → 1 km @ 4:02/km (4:02), 3 Min Pause.",
  "Runde 1 frisch ohne Station: 1 km @ 4:02/km (4:02) als Referenz.",
  "Run 1: 1 km @ 4:10/km (4:10) → SkiErg 1000 m @ 1:41/500 m (Ziel 3:25, Wechsel bei 350 m und 700 m) → Run 2: 1 km @ 4:10/km (4:10) → Sled Push 50 m mit 200 kg (150 kg Platten, Ziel 2:40, Wechsel alle 7 m in Bewegung).",
  "Abschnitt 1: Run 1: 1 km @ 4:00/km (4:00) → SkiErg 1000 m @ 1:41/500 m (Ziel 3:25, Wechsel bei 350 m und 700 m) → Run 2: 1 km @ 4:00/km (4:00) → Sled Push 50 m mit 200 kg (150 kg Platten, Ziel 2:40, Wechsel alle 7 m in Bewegung), 4 Min Pause.",
  "4 Runden mit Jimoh: 1 km @ 4:00/km (4:00) → Sled Pull 25 m mit 155 kg (105 kg Platten, Ziel 1:35) → Sandbag Lunges 50 m mit 30 kg (Ziel 1:30) → 40 Wall Balls mit 9 kg auf 3 m (Ziel 1:15), 3 Min Pause.",
  "Run 7: 1 km @ 4:02/km (4:02) → Sandbag Lunges 100 m mit 30 kg (Ziel 3:15, Wechsel alle 25 m) → direkt Wall Balls 100 mit 9 kg auf 3 m (Ziel 3:30, Aufteilung 20/20/15/15/15/15 mit direkter Ballübergabe).",
];
const INTERVALS = [
  "Einlaufen 1 km @ 5:30/km (5:30) → Steigerungen 4×100 m @ 3:40/km (0:22).",
  "Auslaufen 600 m @ 5:30/km (3:18).",
  "4×1 km @ 4:05/km (4:05), Trabpause 3×200 m @ 6:30/km (1:18).",
  "3×1,5 km @ 4:10/km (6:15), Trabpause 2×200 m @ 6:30/km (1:18).",
  "6×1 km @ 4:00/km (4:00), Trabpause 5×200 m @ 6:00/km (1:12), Puls-Ziel Ø unter 182 bpm.",
  "4×1 km @ 3:55/km (3:55) mit Jimoh auf 400-m-Bahn, manueller Lap (Ziel höchstens 3:55 pro km oder 3:57 pro km bei Ø Puls bis 183 bpm), Trabpause 3×200 m @ 7:30/km (1:30).",
  "Leiter 600 m @ 4:05/km (2:27), 1000 m @ 4:05/km (4:05), 1400 m @ 4:05/km (5:43), 1000 m @ 4:05/km (4:05), 600 m @ 4:05/km (2:27), Trabpause 4×200 m @ 6:30/km (1:18).",
  "5 km Zone 2 @ 5:20/km (26:40), Puls 135–150 bpm.",
  "SkiErg 1000 m @ 1:52/500 m (Ziel 3:44).",
  "Sled Push 50 m mit 200 kg (150 kg Platten, Ziel 3:00).",
];
const HOLIDAY =
  "Runden 2–4: (mit Jimoh: 1000 m RowErg @ 1:43/500 m im Wechsel / allein: 500 m RowErg @ 1:43/500 m / Heim-Ersatz: 50 Rucksack-Lunges mit 10 kg und 20 Thruster mit 2×22,5 kg) → 1 km @ 4:00/km (4:00), 3 Min Pause.";
const PLAIN = [
  "Back Squat 3×6, Pause 150 s.",
  "Farmers Carry 4×40 m mit 2×32 kg, Pause 90 s.",
  "Rad 60 Min Zone 2 (Puls 135–150 bpm), Trittfrequenz 85–95 U/min.",
  "Ziele: Gesamtzeit unter 63:00, Roxzone und Übergaben gesamt 4:30, Kompromiss-Delta höchstens 15 s.",
  "EMOM 16 Min, 4 Runden: Minute 1: 200 m SkiErg @ 1:40/500 m (0:40) → Minute 2: 200 m RowErg @ 1:42/500 m (0:41)",
  "",
];

test("Lauf-Station-Zeilen werden zu Bausteinen, ohne Zahl zu verlieren", () => {
  for (const l of [...RUN_STATION, ...INTERVALS]) {
    const h = fmtLine(l);
    assert.ok(h, "nicht erkannt: " + l);
    assert.equal(digits(visible(h)), digits(l), "Zahlen verändert: " + l);
  }
});

test("Push-Zeile zeigt Last, Platten, Ziel und Wechsel getrennt", () => {
  const t = text(fmtLine(RUN_STATION[0]));
  for (const s of ["Lauf", "1 km", "4:02/km", "Sled Push", "50 m · 200 kg", "150 kg Platten", "Ziel 2:50", "Wechsel alle 7 m in Bewegung"]) assert.ok(t.includes(s), s + " fehlt in: " + t);
});

test("Mittwochs-Runde: Beschriftung, Station, Lauf und Pause", () => {
  const h = fmtLine(RUN_STATION[5]);
  const t = text(h);
  assert.ok(t.includes("Runde 2 und 4 mit Jimoh"));
  assert.ok(t.indexOf("Sled Push") < t.indexOf("1 km"), "erst Station, dann Lauf");
  assert.ok(t.includes("Pause 3 Min"));
});

test("Volle Simulation: zwei Läufe in einer Zeile werden zwei Blöcke", () => {
  const h = fmtLine(RUN_STATION[7]);
  assert.equal((h.match(/class="wx-b"/g) || []).length, 2);
});

test("Intervall zeigt Wiederholungen, Zielzeit je Wiederholung und Trabpause", () => {
  const t = text(fmtLine(INTERVALS[2]));
  assert.ok(t.includes("4 × 1 km") && t.includes("Ziel 4:05 je Wdh.") && t.includes("Trabpause") && t.includes("3 × 200 m"));
});

test("Feiertagsvarianten erscheinen als getrennte Zeilen", () => {
  const h = fmtLine(HOLIDAY);
  assert.ok(h);
  assert.equal((h.match(/class="wx-o"/g) || []).length, 3);
  assert.equal(digits(visible(h)), digits(HOLIDAY));
});

test("Kraft, Rad und freie Texte bleiben Originaltext", () => {
  for (const l of PLAIN) assert.equal(fmtLine(l), null, l);
});

test("Sonderzeichen werden escaped", () => {
  const h = fmtLine("Run 1: 1 km @ 4:00/km (4:00) → SkiErg 1000 m @ 1:41/500 m (Ziel 3:25, Wechsel <b>x</b>).");
  assert.ok(h === null || !h.includes("<b>x</b>"));
});

test("Lauf-Station-Zeile bekommt je ein Zeitfeld mit der Zielzeit", () => {
  const s = lineSlots("Run 5: 1 km @ 4:05/km (4:05) → RowErg 1000 m @ 1:50/500 m (Ziel 3:42, Wechsel bei 350 m und 700 m).");
  assert.deepEqual(s, [{ label: "Lauf", goal: "4:05" }, { label: "RowErg", goal: "3:42" }]);
});

test("Mittwochs-Runde mit zwei Durchgängen hat vier Felder, Station vor Lauf", () => {
  const s = lineSlots("Runde 2 und 4 mit Jimoh: Sled Push 50 m mit 200 kg (150 kg Platten, Ziel 2:50, Wechsel alle 7 m in Bewegung) → 1 km @ 4:02/km (4:02), 3 Min Pause.");
  assert.deepEqual(s.map((x) => x.label), ["R2 Sled Push", "R2 Lauf", "R4 Sled Push", "R4 Lauf"]);
});

test("Zeilen mit einem Wert brauchen kein Mehrfachfeld", () => {
  for (const l of ["Runde 1 frisch ohne Station: 1 km @ 4:02/km (4:02) als Referenz.", "4×1 km @ 4:05/km (4:05), Trabpause 3×200 m @ 6:30/km (1:18).", "5 km Zone 2 @ 5:20/km (26:40), Puls 135–150 bpm.", "SkiErg 1000 m @ 1:52/500 m (Ziel 3:44).", "Back Squat 3×6, Pause 150 s."]) assert.equal(lineSlots(l), null, l);
});
