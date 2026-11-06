import { test } from "node:test";
import assert from "node:assert/strict";
import { planFromExport } from "../src/plan-export.js";
import { builtinPlan, mergeImport } from "../src/plan-store.js";

const payload = (plan) => JSON.stringify({ app: "basel-sub60", kind: "plan", source: "team", name: "x", plan });

test("Export des eingebauten Plans lässt sich wieder einlesen und ergibt keine Änderungen", () => {
  const p = builtinPlan();
  const parsed = planFromExport(payload(p));
  assert.equal(Object.keys(parsed.days).length, 126);
  assert.equal(parsed.meta.race, 124);
  assert.equal(parsed.meta.blocks.length, 5);
  const { changed } = mergeImport(p, parsed, { from: 0 });
  assert.equal(changed.length, 0, "gleicher Inhalt = keine Änderung: " + changed.slice(0, 5));
});

test("Keine Plan-Datei: null, damit der PDF-Text-Import weiterläuft", () => {
  assert.equal(planFromExport("Block A – Name (12.10. – 08.11.2026)"), null);
  assert.equal(planFromExport("{kaputt"), null);
  assert.equal(planFromExport(JSON.stringify({ app: "basel-sub60", version: 1, data: {} })), null);
  assert.equal(planFromExport(""), null);
});

test("Kaputte Tage werden übersprungen und gemeldet, ohne gültige Tage gibt es eine Fehlermeldung", () => {
  const parsed = planFromExport(payload({ days: { 0: { t: "Kraft", k: "kraft", i: ["a"] }, 1: { t: "", k: "lauf" }, 2: { t: "x", k: "unsinn" }, 3: null, 999: { t: "x", k: "rest" } } }));
  assert.deepEqual(Object.keys(parsed.days), ["0"]);
  assert.equal(parsed.meta.warnings.length, 4);
  assert.throws(() => planFromExport(payload({ days: { 0: { t: "", k: "kraft" } } })), /keine gültigen Tage/);
});

test("Nur bekannte Felder und Längenbegrenzung, Blöcke und Wochen mit km werden übernommen", () => {
  const long = "x".repeat(5000);
  const parsed = planFromExport(payload({ days: { 0: { t: "A", k: "lauf", i: [long], n: long, boese: "<img>" } }, blocks: [{ id: "A", name: "Block", start: 0, end: 27 }, { id: 5 }], weeks: [{ n: 1, name: "W", start: 0, km: 12 }, { n: 2, start: "x" }] }));
  assert.equal(parsed.days[0].i[0].length, 2000);
  assert.equal(parsed.days[0].n.length, 3000);
  assert.equal(parsed.days[0].boese, undefined);
  assert.equal(parsed.days[0].key, true);
  assert.equal(parsed.meta.blocks.length, 1);
  assert.deepEqual(parsed.meta.weeks, [{ n: 1, name: "W", start: 0, km: 12 }]);
});
