import { test } from "node:test";
import assert from "node:assert/strict";
import { effective, checkinLevel, loadOf, impact, ZONES, ZONE, SECTIONS, zonesOf, expand, summarize, sectionLevels } from "../src/soreness.js";
import { suggest } from "../src/adapt.js";
import { toApiHistory, coachErrorText } from "../src/coach.js";

const kraft = { t: "Kraft 1", k: "kraft", i: ["Back Squat 4×5 @80%", "Back Squat 1×3 @85%, Topsatz", "Bench Press 3×6", "Pull-ups 3×6", "Plank 3×50″"] };
const rest = { t: "Ruhetag", k: "rest", i: [], n: "" };

test("Vier Bereiche mit allen Muskeln und Gelenken", () => {
  assert.deepEqual(SECTIONS.map(([, t]) => t), ["Beine & Unterkörper", "Gelenke & Sehnen", "Oberkörper & Griffkraft", "Rumpf / Core"]);
  assert.deepEqual(SECTIONS.map(([id]) => zonesOf(id).length), [6, 4, 6, 2]);
  assert.equal(ZONE.achilles.label, "Achillessehne");
  assert.equal(new Set(ZONES.map((z) => z.id)).size, ZONES.length);
});

test("Alte Zonen der Körperkarte werden umgedeutet", () => {
  assert.deepEqual(expand("chest.upper.l"), ["chest"]);
  assert.deepEqual(expand("hips.add.r"), ["adductors"]);
  assert.deepEqual(expand("hips.flexor.l"), ["hipflexor"]);
  assert.deepEqual(expand("core.obl.l"), ["obliques"]);
  assert.deepEqual(expand("core.mid"), ["abs"]);
  assert.deepEqual(expand("core"), ["abs", "obliques"]);
  assert.deepEqual(expand("traps.mid"), ["upback"]);
  assert.deepEqual(expand("biceps"), ["arms"]);
  assert.deepEqual(expand("gibtsnicht"), []);
});

test("Muskelkater klingt über drei Tage ab, höchster Wert zählt", () => {
  const S = { 10: { quads: 8 }, 11: { quads: 3, chest: 5 } };
  assert.deepEqual(effective(S, 10), { quads: 8 });
  assert.deepEqual(effective(S, 11), { quads: 6, chest: 5 });
  assert.deepEqual(effective(S, 14), {});
  assert.deepEqual(effective({ 5: { gibtsnicht: 9, knee: 0 } }, 5), {});
  assert.deepEqual(effective({ 5: { "quads.mid.l": 4, "quads.outer.r": 7 } }, 5), { quads: 7 });
  assert.deepEqual(sectionLevels({ achilles: 3, knee: 7, abs: 2 }), { joints: 7, core: 2 });
});

test("Check-in-Ampel aus dem Muskelkater", () => {
  assert.equal(checkinLevel({}), null);
  assert.equal(checkinLevel({ quads: 3 }), "g");
  assert.equal(checkinLevel({ upback: 5 }), "y");
  assert.equal(checkinLevel({ calves: 7 }), "r");
});

test("Übungen belasten bestimmte Muskeln und Gelenke", () => {
  const bench = loadOf({ k: "kraft", i: ["Bench Press 3×6"] });
  assert.ok(bench.includes("chest") && bench.includes("arms"));
  assert.ok(!bench.includes("quads"));
  const run = loadOf({ k: "lauf", i: ["4×8′ @85%"] });
  for (const z of ["calves", "achilles", "plantar", "knee", "shins"]) assert.ok(run.includes(z), z);
  assert.ok(loadOf({ k: "kraft", i: ["Box Jump 4×5"] }).includes("achilles"));
  assert.deepEqual(loadOf(rest), []);
});

test("Einfluss: nur belastete Stellen zählen, Übungen ohne Doppelnennung", () => {
  const up = impact({ k: "kraft", i: ["Bench Press 3×6"] }, { plantar: 9 });
  assert.equal(up.level, 0, "Bankdrücken belastet die Fusssohle nicht");
  const hit = impact(kraft, { quads: 7, calves: 9 });
  assert.equal(hit.level, 7);
  assert.deepEqual(hit.names, ["Back Squat"]);
  assert.deepEqual(summarize([{ label: "Brust", level: 5 }, { label: "Quadrizeps", level: 7 }]), ["Quadrizeps 7/10", "Brust 5/10"]);
});

const ctx = (sore) => ({
  today: 0, last: 10, plan: (i) => (i === 0 ? kraft : i === 1 ? rest : i === 2 ? kraft : rest),
  status: () => ({ n: 4, done: 0 }), skipped: () => false, rpe: () => undefined,
  checkin: () => undefined, dismissed: {}, sore: (i) => effective(sore, i),
});

test("Vorschlag: mittlerer Muskelkater → entlasten, starker → verschieben", () => {
  const easy = suggest(ctx({ 0: { quads: 6 } }));
  assert.equal(easy[0].type, "easy"); assert.match(easy[0].why, /Quadrizeps 6\/10/);
  const swap = suggest(ctx({ 0: { chest: 9 } }));
  assert.equal(swap[0].type, "swap"); assert.equal(swap[0].day, 0); assert.equal(swap[0].to, 1);
  assert.equal(suggest(ctx({ 0: { plantar: 9 } })).length, 0, "nicht belastete Stelle → kein Vorschlag");
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
