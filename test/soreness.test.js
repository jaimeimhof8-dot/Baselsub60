import { test } from "node:test";
import assert from "node:assert/strict";
import { effective, checkinLevel, loadOf, loadedZones, impact, ZONES, ZONE, GROUPS, zonesOf, mirrorZone, summarize, groupLevels } from "../src/soreness.js";
import { suggest } from "../src/adapt.js";
import { toApiHistory, coachErrorText } from "../src/coach.js";

const kraft = { t: "Kraft 1", k: "kraft", i: ["Back Squat 4×5 @80%", "Back Squat 1×3 @85%, Topsatz", "Bench Press 3×6", "Pull-ups 3×6", "Plank 3×50″"] };
const rest = { t: "Ruhetag", k: "rest", i: [], n: "" };

test("Feine Zonen: Brust oben/mitte/unten je links und rechts", () => {
  assert.deepEqual(zonesOf("chest").map((z) => z.id).sort(),
    ["chest.lower.l", "chest.lower.r", "chest.mid.l", "chest.mid.r", "chest.upper.l", "chest.upper.r"]);
  assert.equal(ZONE["chest.upper.l"].label, "Brust oben links");
  for (const g of Object.keys(GROUPS)) assert.ok(zonesOf(g).length, g);
  assert.equal(new Set(ZONES.map((z) => z.id)).size, ZONES.length);
});

test("Seiten: vorne liegt die rechte Körperseite links im Bild", () => {
  assert.ok(ZONE["chest.upper.r"].shape.x < 100);
  assert.ok(ZONE["chest.upper.l"].shape.x > 100);
  assert.ok(ZONE["calves.outer.l"].shape.cx < 100); // hinten: links = links
  assert.equal(mirrorZone("chest.upper.l"), "chest.upper.r");
  assert.equal(mirrorZone("traps.mid"), null);
});

test("Muskelkater klingt über drei Tage ab, höchster Wert zählt", () => {
  const S = { 10: { "quads.mid.l": 8 }, 11: { "quads.mid.l": 3, "chest.lower.r": 5 } };
  assert.deepEqual(effective(S, 10), { "quads.mid.l": 8 });
  assert.deepEqual(effective(S, 11), { "quads.mid.l": 6, "chest.lower.r": 5 });
  assert.deepEqual(effective(S, 14), {});
  assert.deepEqual(effective({ 5: { gibtsnicht: 9 } }, 5), {});
  // ältere Meldung pro Gruppe gilt für alle Zonen der Gruppe
  assert.equal(Object.keys(effective({ 5: { chest: 4 } }, 5)).length, 6);
  assert.deepEqual(groupLevels({ "chest.upper.l": 3, "chest.mid.r": 7 }), { chest: 7 });
});

test("Check-in-Ampel aus dem Muskelkater", () => {
  assert.equal(checkinLevel({}), null);
  assert.equal(checkinLevel({ "quads.mid.l": 3 }), "g");
  assert.equal(checkinLevel({ "back.lats.r": 5 }), "y");
  assert.equal(checkinLevel({ "calves.inner.l": 7 }), "r");
});

test("Übungen belasten bestimmte Zonen", () => {
  const bench = loadedZones({ k: "kraft", i: ["Bench Press 3×6"] });
  assert.ok(bench.includes("chest.mid.l") && bench.includes("chest.lower.r"));
  assert.ok(!bench.includes("chest.upper.l"), "Bankdrücken flach: obere Brust nicht");
  const press = loadedZones({ k: "kraft", i: ["Shoulder Press 3×8"] });
  assert.ok(press.includes("chest.upper.l") && press.includes("shoulders.front.r"));
  assert.ok(loadOf({ k: "lauf", i: ["4×8′ @85%"] }).includes("calves"));
  assert.deepEqual(loadOf(rest), []);
});

test("Einfluss: nur belastete Zonen zählen, Übungen ohne Doppelnennung", () => {
  const up = impact({ k: "kraft", i: ["Bench Press 3×6"] }, { "chest.upper.l": 9 });
  assert.equal(up.level, 0, "obere Brust wird beim Bankdrücken nicht belastet");
  const hit = impact(kraft, { "quads.mid.l": 7, "calves.outer.r": 9 });
  assert.equal(hit.level, 7);
  assert.deepEqual(hit.names, ["Back Squat"]);
  assert.deepEqual(summarize([{ id: "chest.mid.l", level: 7 }, { id: "chest.mid.r", level: 5 }]), ["Brust mitte beidseitig 7/10"]);
});

const ctx = (sore) => ({
  today: 0, last: 10, plan: (i) => (i === 0 ? kraft : i === 1 ? rest : i === 2 ? kraft : rest),
  status: () => ({ n: 4, done: 0 }), skipped: () => false, rpe: () => undefined,
  checkin: () => undefined, dismissed: {}, sore: (i) => effective(sore, i),
});

test("Vorschlag: mittlerer Muskelkater → entlasten, starker → verschieben", () => {
  const easy = suggest(ctx({ 0: { "quads.mid.l": 6, "quads.mid.r": 6 } }));
  assert.equal(easy[0].type, "easy"); assert.match(easy[0].why, /Oberschenkel vorne Mitte beidseitig 6\/10/);
  const swap = suggest(ctx({ 0: { "chest.mid.r": 9 } }));
  assert.equal(swap[0].type, "swap"); assert.equal(swap[0].day, 0); assert.equal(swap[0].to, 1);
  assert.equal(suggest(ctx({ 0: { "chest.upper.l": 9 } })).length, 0, "nicht belastete Zone → kein Vorschlag");
  assert.equal(suggest(ctx({})).length, 0);
});

test("Chatverlauf: abwechselnde Rollen, endet mit Antwort", () => {
  const h = toApiHistory([
    { role: "user", text: "Mi geht nicht" }, { role: "user", text: "Hallo?" },
    { role: "assistant", text: "Dann Do." }, { role: "user", text: "Knie zwickt" },
  ]);
  assert.deepEqual(h.map((m) => m.role), ["user", "assistant"]);
  assert.equal(h[0].content, "Mi geht nicht\n\nHallo?");
  assert.deepEqual(toApiHistory([{ role: "user", text: "x" }]), []);
  assert.deepEqual(toApiHistory([null, { role: "system", text: "x" }]), []);
});

test("Fehlertexte des Coach", () => {
  assert.match(coachErrorText(404, ""), /nicht eingerichtet/);
  assert.match(coachErrorText(403, "forbidden"), /anmelden/);
  assert.match(coachErrorText(500, "no_key"), /API-Key/);
  assert.match(coachErrorText(0, ""), /Verbindung/);
});
