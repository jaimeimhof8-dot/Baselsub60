import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePlanText } from "../src/parser.js";
import { builtinPlan, activePlan, mergeImport, changesByWeek, undoImport, weekInfo, blockOverview, LAST } from "../src/plan-store.js";
import { weekSnapshot, weekText, encodeSnapshot, decodeSnapshot, shareLink, linkCode } from "../src/share.js";

const parsed = parsePlanText(readFileSync(new URL("./fixtures/plan-provisorisch.txt", import.meta.url), "utf8"));

test("eingebauter Plan deckt alle Tage ab", () => {
  const p = builtinPlan();
  for (let i = 0; i <= LAST; i++) assert.ok(p.days[i], "Tag " + i);
  assert.equal(p.days[124].k, "race");
  assert.equal(activePlan(null), p);
});

test("weekInfo: Woche, Block, Welle", () => {
  const p = builtinPlan();
  assert.deepEqual(weekInfo(p, 0), { block: "A", blockName: "Standortbestimmung", name: "Standortbestimmung", wave: "Test" });
  assert.equal(weekInfo(p, 3).wave, "Deload");
  assert.equal(weekInfo(p, 4).block, "B"); assert.equal(weekInfo(p, 4).wave, "moderat");
  assert.equal(weekInfo(p, 17).block, "T"); assert.equal(weekInfo(p, 17).wave, "Taper");
});

test("PDF-Import ab heute lässt die Vergangenheit unverändert", () => {
  const cur = builtinPlan();
  const { plan, changed } = mergeImport(cur, parsed, { from: 30, name: "Test.pdf", now: 1 });
  assert.deepEqual(plan.days[1], cur.days[1]);
  assert.ok(changed.every((i) => i >= 30));
  // Der eingebaute Plan ab Woche 5 stammt aus demselben PDF – der Import ändert dort kaum etwas
  for (let i = 30; i < 119; i++) assert.deepEqual(plan.days[i].i, cur.days[i].i, "Tag " + i);
  assert.equal(plan.days[120].t, cur.days[120].t, "nicht erkannte Tage bleiben");
  assert.equal(plan.blocks.length, 5);
  assert.equal(plan.prev, null);
  assert.equal(undoImport(plan), null);
});

test("Re-Import merkt sich den vorherigen Plan", () => {
  const a = mergeImport(builtinPlan(), parsed, { from: 0 }).plan;
  const { plan: b, changed } = mergeImport(a, parsed, { from: 0 });
  assert.equal(changed.length, 0, "gleicher Inhalt = keine Änderung");
  assert.equal(undoImport(b).name, a.name);
  assert.equal(undoImport(b).prev, undefined);
});

test("changesByWeek / blockOverview", () => {
  assert.deepEqual(changesByWeek([1, 2, 9, 30]), [{ w: 0, n: 2 }, { w: 1, n: 1 }, { w: 4, n: 1 }]);
  const ov = blockOverview(builtinPlan());
  assert.equal(ov[0].id, "A");
  assert.ok(ov[1].list.some((x) => x.k === "lauf"));
});

test("Teilen: Snapshot, Text, Link hin und zurück", () => {
  const p = builtinPlan();
  const snap = weekSnapshot({ w: 0, by: "Jaime", title: "Standortbestimmung", plan: (i) => p.days[i], status: (i) => ({ n: 2, done: i === 0 ? 2 : 0 }) });
  assert.equal(snap.days.length, 7);
  assert.equal(snap.days[0].done, 1);
  const txt = weekText(snap);
  assert.match(txt, /Montag, 12\. Okt: Kraft 1 \(Kraft\) ✓/);
  assert.match(txt, /Geteilt von Jaime/);
  const link = shareLink("https://a.b/app/index.html#alt", snap);
  assert.ok(link.startsWith("https://a.b/app/index.html#w="));
  assert.deepEqual(decodeSnapshot(linkCode(link.slice(link.indexOf("#")))), snap);
  assert.equal(decodeSnapshot("kaputt!"), null);
  assert.equal(decodeSnapshot(encodeSnapshot({ v: 2 })), null);
  // manipulierte Links stürzen die Ansicht nicht ab
  const evil = decodeSnapshot(encodeSnapshot({ v: 1, w: 1, days: [{ t: 5, i: "x" }, null] }));
  assert.deepEqual(evil.days, [{ t: "", k: "", n: "", i: [] }, { t: "", k: "", n: "", i: [] }]);
});
