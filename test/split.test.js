import { test } from "node:test";
import assert from "node:assert/strict";
import { splitLine, splitItems, retitle, tidyDay, SPLIT_FROM } from "../src/split.js";

test("Station → Lauf wird zu zwei Zeilen, Lauf bekommt das Runden-Präfix", () => {
  const r = splitLine("Runde 2 mit Jimoh: Sled Push 25 m mit 175 kg (125 kg Platten, Ziel 1:23) → 1 km @ 4:05/km (4:05), 3 Min Pause");
  assert.deepEqual(r, ["Runde 2 mit Jimoh: Sled Push 25 m mit 175 kg (125 kg Platten, Ziel 1:23)", "Runde 2: 1 km @ 4:05/km (4:05), 3 Min Pause"]);
});

test("Wadenheben → Pallof Press: zwei Übungen, kein Präfix", () => {
  assert.deepEqual(splitLine("Wadenheben einbeinig 3×15 je Seite (3 s absenken, Pause 60 s) → Pallof Press 3×10 je Seite, Pause 60 s"),
    ["Wadenheben einbeinig 3×15 je Seite (3 s absenken, Pause 60 s)", "Pallof Press 3×10 je Seite, Pause 60 s"]);
});

test("«Run N: … → Station» behält die Teile ohne zusätzliches Präfix", () => {
  assert.deepEqual(splitLine("Run 1: 1 km @ 4:05/km (4:05) → SkiErg 1000 m @ 1:47/500 m"), ["Run 1: 1 km @ 4:05/km (4:05)", "SkiErg 1000 m @ 1:47/500 m"]);
});

test("Zeile ohne Pfeil bleibt unverändert", () => {
  assert.deepEqual(splitLine("Back Squat 4×5, Pause 150 s"), ["Back Squat 4×5, Pause 150 s"]);
  assert.deepEqual(splitItems(["a → b", "c"]), ["a", "b", "c"]);
});

test("Titel: Kraft 2 + Compromised Running → Compromised Running", () => {
  assert.equal(retitle("Kraft 2 + Compromised Running"), "Compromised Running");
  assert.equal(retitle("Kraft 2 – Technik only"), "Kraft 2 – Technik only");
});

test("tidyDay teilt erst ab SPLIT_FROM, nie bei eigener Anpassung, nie Ruhetage", () => {
  const p = { t: "Kraft 2 + Compromised Running", k: "station", i: ["x → y"] };
  assert.deepEqual(tidyDay(p, SPLIT_FROM - 1, false).i, ["x → y"]);
  assert.deepEqual(tidyDay(p, SPLIT_FROM, false).i, ["x", "y"]);
  assert.deepEqual(tidyDay(p, SPLIT_FROM, true).i, ["x → y"]);
  assert.equal(tidyDay(p, 0, false).t, "Compromised Running");
  assert.deepEqual(tidyDay({ t: "Ruhetag", k: "rest", i: [] }, 40, false).i, []);
});
