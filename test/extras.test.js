import { test } from "node:test";
import assert from "node:assert/strict";
import { EXTRA_TYPES, makeExtra, addExtra, removeExtra, extraLabel, extraMinutes, cleanExtras, loadDay } from "../src/extras.js";
import { tendonLoad, overloadRisk } from "../src/soreness.js";

test("Eintrag anlegen und prüfen", () => {
  assert.deepEqual(makeExtra({ type: "z2bike", min: "45", note: "  Arbeitsweg  " }, "a"), { id: "a", type: "z2bike", min: 45, note: "Arbeitsweg" });
  assert.deepEqual(makeExtra({ type: "core", min: "" }, "b"), { id: "b", type: "core" });
  assert.equal(makeExtra({ type: "core", min: "12,4" }, "c").min, 12);
  assert.equal(makeExtra({ type: "yoga", min: 30 }), null);
  assert.equal(makeExtra({ type: "z2run", min: 0 }), null);
  assert.equal(makeExtra({ type: "z2run", min: 700 }), null);
  assert.equal(makeExtra({ type: "z2run", min: "abc" }), null);
  assert.equal(makeExtra({ type: "other", note: "x".repeat(200) }, "d").note.length, 80);
  assert.ok(Object.keys(EXTRA_TYPES).includes("mobility"));
});

test("Liste hinzufügen, entfernen und summieren, ohne die alte Liste zu ändern", () => {
  const a = makeExtra({ type: "z2bike", min: 45 }, "1"), b = makeExtra({ type: "mobility", min: 15 }, "2");
  const l1 = addExtra(undefined, a), l2 = addExtra(l1, b);
  assert.equal(l1.length, 1);
  assert.equal(l2.length, 2);
  assert.equal(extraMinutes(l2), 60);
  assert.deepEqual(removeExtra(l2, "1").map((e) => e.id), ["2"]);
  assert.equal(l2.length, 2);
  assert.deepEqual(addExtra(l2, null), l2);
  assert.equal(extraLabel(a), "Zone 2 Rad · 45′");
  assert.equal(extraLabel({ id: "3", type: "core", note: "Pallof" }), "Core · Pallof");
  assert.equal(extraLabel({ type: "kaputt" }), "");
});

test("ungültige Daten aus Sync oder Backup werden ignoriert", () => {
  assert.deepEqual(cleanExtras("x"), []);
  assert.deepEqual(cleanExtras([null, { type: "core" }, { id: "1", type: "nope" }, { id: "2", type: "core" }]).map((e) => e.id), ["2"]);
});

test("Plan bleibt unverändert, nur zusätzliche Läufe zählen für die Belastung", () => {
  const bike = { t: "Rad", k: "bike", i: ["Rad 60′"] };
  assert.equal(loadDay(bike, [makeExtra({ type: "z2bike", min: 30 }, "1")]), bike);
  assert.equal(loadDay(null, []), null);
  const run = makeExtra({ type: "z2run", min: 30 }, "r");
  const onBike = loadDay(bike, [run]);
  assert.equal(onBike.k, "lauf");
  assert.ok(tendonLoad(onBike).includes("knee"));
  const station = { t: "Stationen", k: "station", i: ["Sled Push 50 m"] };
  const both = loadDay(station, [run]);
  assert.deepEqual(both.i, ["Sled Push 50 m", "Zone 2 Lauf · 30′"]);
  assert.deepEqual(station.i, ["Sled Push 50 m"], "Original unverändert");
});

test("spontane Läufe lösen die Überlastungs-Warnung aus", () => {
  const lauf = { t: "Lauf", k: "lauf", i: ["4×1 km"] }, bike = { t: "Rad", k: "bike", i: ["Rad 60′"] };
  const run = [makeExtra({ type: "z2run", min: 40 }, "r")];
  // Mo Lauf, Di Rad + Zusatzlauf, Mi Lauf -> 3. Tag in Folge
  const plain = (d) => [lauf, bike, lauf][d] || null;
  const withRun = (d) => loadDay(plain(d), d === 1 ? run : []);
  assert.equal(overloadRisk(lauf, 2, 2, () => ({}), plain).length, 0);
  assert.ok(overloadRisk(lauf, 2, 2, () => ({}), withRun).some((o) => o.id === "knee"));
});
