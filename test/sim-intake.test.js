import { test } from "node:test";
import assert from "node:assert/strict";
import { simDraft, stationIndex, intensityFromRpe } from "../src/sim-intake.js";
import { simSteps } from "../src/simsteps.js";
import { splitItems } from "../src/split.js";

// Brick-Simulation (Plantag 47, 28.11.2026) wie in der App: ab Plantag 16 an « → » geteilt
const BRICK = splitItems([
  "Einlaufen 600 m @ 5:30/km (3:18) → Steigerungen 4×100 m @ 3:40/km (0:22)",
  "Aufteilung 60 zu 40 testen: Der Stärkere übernimmt bei Schlitten schieben und ziehen den grösseren Anteil",
  "Run 1: 1 km @ 4:05/km (4:05) (Verbot schneller als 4:05/km!) → Sled Push 50 m mit 225 kg (175 kg Platten, Ziel 3:03, Wechsel alle 7 m in Bewegung)",
  "Run 2: 1 km @ 4:05/km (4:05) → Sled Pull 50 m mit 175 kg (125 kg Platten, Ziel 3:40, Wechsel jede 12,5-m-Bahn)",
  "Run 3: 1 km @ 4:05/km (4:05) → Sandbag Lunges 100 m mit 30 kg (Ziel 3:15, Wechsel alle 25 m ohne Ablegen)",
  "Run 4: 1 km @ 4:05/km (4:05) → Wall Balls 100 mit 9 kg auf 3 m (Ziel 4:40, Aufteilung 20/20/15/15/15/15)",
]);
const lineOf = (re) => BRICK.findIndex((t) => re.test(t) && !/^Run/.test(t));

test("Namen der Plan-Stationen werden den 8 Rennstationen zugeordnet", () => {
  assert.deepEqual(["SkiErg", "Sled Push", "Sled Pull", "Burpee Broad Jumps", "RowErg", "Farmers Carry", "Sandbag Lunges", "Wall Balls"].map(stationIndex), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(stationIndex("Steigerungen"), -1);
});

test("Intensität aus RPE: 8 → 90 %, 7 → 85 %, 6 → 80 %, ohne RPE 85 %", () => {
  assert.deepEqual([10, 8, 7, 6, null].map(intensityFromRpe), [0.9, 0.9, 0.85, 0.8, 0.85]);
});

test("Brick-Simulation: Handeingaben an den Stationszeilen zählen, die übrigen 4 Stationen bleiben leer", () => {
  const steps = simSteps(BRICK);
  const val = { [lineOf(/^Sled Push/)]: "1:48", [lineOf(/^Sled Pull/)]: "4:04", [lineOf(/^Sandbag/)]: "2:58", [lineOf(/^Wall Balls/)]: "3:26" };
  const d = simDraft({ steps, val: (j) => val[j], rpe: 8 });
  assert.deepEqual(d.st, ["", "1:48", "4:04", "", "", "", "2:58", "3:26"]);
  assert.deepEqual(d.src, ["", "hand", "hand", "", "", "", "hand", "hand"]);
  assert.equal(d.n, 4);
  assert.equal(d.i, 0.9);
  assert.equal(d.goal[1], 183);
});

test("Ohne Handeingabe kommt die Zeit aus der zugeordneten Uhr-Runde; «202 kg» im Feld ist keine Zeit", () => {
  const steps = simSteps(BRICK);
  const rows = [{ name: "1 km", kind: "run", t: 245 }, { name: "Sled Push", kind: "station", t: 110 }, { name: "Sled Pull", kind: "station", t: 241 }];
  const d = simDraft({ steps, val: (j) => (j === lineOf(/^Sled Push/) ? "202 kg" : ""), rows });
  assert.equal(d.st[1], "1:50");
  assert.equal(d.src[1], "uhr");
  assert.equal(d.st[2], "4:01");
  assert.equal(d.st[6], "");
  assert.match(d.note[6], /keine Zeit/);
});

test("Unplausible Handeingabe wird nicht übernommen, sondern mit Grund gemeldet", () => {
  const steps = simSteps(BRICK);
  const d = simDraft({ steps, val: (j) => (j === lineOf(/^Sled Push/) ? "0:20" : "") });
  assert.equal(d.st[1], "");
  assert.match(d.note[1], /unplausibel schnell/);
});

test("Teilstrecken (z. B. Sled Pull 25 m) sind keine Rennstation und werden nicht übernommen", () => {
  const steps = simSteps(["Run 1: 1 km @ 4:05/km (4:05) → Sled Pull 25 m mit 155 kg (105 kg Platten, Ziel 1:10)"]);
  const d = simDraft({ steps, val: () => "", rows: [{ name: "Sled Pull", kind: "station", t: 70 }] });
  assert.equal(d.st[2], "");
  assert.match(d.note[2], /nur 25 m statt 50 m/);
});

test("Ungeteilte Form: Lauf und Station auf einer Zeile, Handeingabe ist mehrdeutig und zählt nicht", () => {
  const steps = simSteps(["Run 1: 1 km @ 4:05/km (4:05) → SkiErg 1000 m @ 1:47/500 m (Ziel 3:35)"]);
  const d = simDraft({ steps, val: () => "3:40" });
  assert.equal(d.st[0], "");
});
