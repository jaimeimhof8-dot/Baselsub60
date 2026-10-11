// Zusatz-Einheiten im Zusammenspiel mit Umplanen und Coach: wenn sie etwas auslösen, muss es sichtbar sein.
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggest } from "../src/adapt.js";
import { planContext } from "../src/coach.js";
import { overloadWithExtras, extraAsDay } from "../src/extras.js";

const lauf = { t: "Intervall", k: "lauf", i: ["4×1 km"] }, bike = { t: "Rad", k: "bike", i: ["Rad 60′"] }, rest = { t: "Ruhetag", k: "rest", i: [] };
const run = [{ id: "r", type: "z2run", min: 30 }];
const ctx = (extra) => ({ today: 2, last: 10, plan: (i) => [lauf, bike, lauf][i] || rest,
  status: (i) => ({ n: 1, done: i === 0 ? 1 : 0 }), skipped: () => false, rpe: () => undefined,
  checkin: () => undefined, dismissed: {}, sore: () => ({}), extra });

test("Vorschlag entsteht erst durch den Zusatz-Lauf und ist markiert", () => {
  assert.equal(suggest(ctx(() => [])).filter((s) => s.id.startsWith("over:")).length, 0);
  const s = suggest(ctx((i) => (i === 1 ? run : []))).find((x) => x.id === "over:2");
  assert.ok(s, "Überlastungs-Vorschlag fehlt");
  assert.equal(s.extra, true);
  assert.match(s.why, /Mitverursacht durch Zusatz-Einheiten: Zone 2 Lauf · 30′/);
});

test("ohne extra im Kontext verhält sich das Umplanen wie bisher", () => {
  const c = ctx(undefined); delete c.extra;
  assert.equal(suggest(c).filter((s) => s.id.startsWith("over:")).length, 0);
});

test("Überlastung ohne Zusatz-Einheit wird nicht als Zusatz-Ursache markiert", () => {
  const plan = (d) => [lauf, lauf, lauf][d] || null;
  const r = overloadWithExtras({ day: lauf, x: 2, today: 2, soreAt: () => ({}), planAt: plan, extraAt: () => [] });
  assert.ok(r.risk.length > 0);
  assert.equal(r.byExtra, false);
  assert.deepEqual(r.runs, []);
});

test("Zusatz-Einheiten als Belastung für den Muskelkater-Melder", () => {
  assert.equal(extraAsDay({ id: "1", type: "z2run", min: 30 }).k, "lauf");
  assert.equal(extraAsDay({ id: "1", type: "core" }).i[0], "Core");
  assert.equal(extraAsDay({ id: "1", type: "mobility" }), null);
  assert.equal(extraAsDay({ type: "kaputt" }), null);
});

test("Coach sieht Zusatz-Einheiten und Solo-Tage", () => {
  const plan = (i) => (i === 11 ? { ...lauf, solo: 1 } : lauf);
  const c = planContext({ today: 10, last: 125, plan, status: () => ({ n: 1, done: 1 }), rpe: () => undefined, skipped: () => false,
    me: "Jaime", partner: "Jimoh", extra: (i) => (i === 9 ? [{ id: "a", type: "z2bike", min: 45 }] : i === 10 ? [{ type: "kaputt" }] : []) });
  assert.deepEqual(c.recent.at(-1).extra, ["Zone 2 Rad · 45′"]);
  assert.equal(c.upcoming[0].extra, undefined, "ungültige Einträge werden ignoriert");
  assert.ok(c.upcoming[1].flags.includes("solo ohne Partner"));
});
