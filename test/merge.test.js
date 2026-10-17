import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeState, safeMerge, countEntries, stable } from "../src/merge.js";

const st = (o) => ({ done: {}, val: {}, notes: {}, extra: {}, solo: {}, strava: { acts: {}, at: 0 }, chat: [], plan: null, _t: 1, ...o });

test("stable: gleiche Inhalte, gleiche Reihenfolge", () => {
  assert.equal(stable({ b: 1, a: [1, { d: 2, c: 3 }] }), stable({ a: [1, { c: 3, d: 2 }], b: 1 }));
  assert.notEqual(stable({ a: 1 }), stable({ a: 2 }));
});

test("Handy offline und Laptop ändern Verschiedenes: beides bleibt erhalten", () => {
  const base = st({ done: { "2026-10-12|0": 1 }, _t: 10 });
  const phone = st({ done: { "2026-10-12|0": 1, "2026-10-13|0": 1 }, notes: { "2026-10-13": "Wade zwickt" }, _t: 20 });
  const laptop = st({ done: { "2026-10-12|0": 1, "2026-10-12|1": 1 }, extra: { "2026-10-12": [{ id: "a", type: "core" }] }, _t: 30 });
  const m = mergeState(base, phone, laptop);
  assert.deepEqual(Object.keys(m.done).sort(), ["2026-10-12|0", "2026-10-12|1", "2026-10-13|0"]);
  assert.equal(m.notes["2026-10-13"], "Wade zwickt");
  assert.deepEqual(m.extra["2026-10-12"], [{ id: "a", type: "core" }]);
  assert.equal(m._t, 30);
  // Symmetrisch
  assert.equal(stable(mergeState(base, laptop, phone)), stable(m));
});

test("Gelöschtes bleibt gelöscht, wenn die andere Seite es nicht geändert hat", () => {
  const base = st({ done: { a: 1, b: 1 }, solo: { "2026-10-13": 1 } });
  const local = st({ done: { a: 1 }, solo: {}, _t: 5 });
  const remote = st({ done: { a: 1, b: 1, c: 1 }, solo: { "2026-10-13": 1 }, _t: 4 });
  const m = mergeState(base, local, remote);
  assert.deepEqual(m.done, { a: 1, c: 1 });
  assert.deepEqual(m.solo, {});
});

test("beide ändern denselben Eintrag: der neuere Stand gewinnt", () => {
  const base = st({ notes: { d: "alt" } });
  assert.equal(mergeState(base, st({ notes: { d: "Handy" }, _t: 5 }), st({ notes: { d: "Laptop" }, _t: 9 })).notes.d, "Laptop");
  assert.equal(mergeState(base, st({ notes: { d: "Handy" }, _t: 9 }), st({ notes: { d: "Laptop" }, _t: 5 })).notes.d, "Handy");
});

test("erste Synchronisation ohne Basis: alles wird vereinigt", () => {
  const m = mergeState(null, st({ done: { a: 1 }, _t: 1 }), st({ done: { b: 1 }, _t: 2 }));
  assert.deepEqual(m.done, { a: 1, b: 1 });
});

test("Ganze Felder (Plan, Chat) und Strava-Aktivitäten", () => {
  const base = st({ plan: null, chat: [] });
  const local = st({ plan: { source: "pdf", days: { 0: { t: "Kraft 1" } } }, strava: { acts: { x: { id: "x" } }, at: 50 }, _t: 3 });
  const remote = st({ chat: [{ role: "user", content: "Hallo" }], strava: { acts: { y: { id: "y" } }, at: 70 }, _t: 4 });
  const m = mergeState(base, local, remote);
  assert.equal(m.plan.source, "pdf");
  assert.equal(m.chat.length, 1);
  assert.deepEqual(Object.keys(m.strava.acts).sort(), ["x", "y"]);
  assert.equal(m.strava.at, 70);
});

test("ohne Cloud-Stand bleibt der lokale, Eingaben bleiben unverändert", () => {
  const local = st({ done: { a: 1 } });
  assert.equal(mergeState(null, local, null), local);
  const remote = st({ done: { b: 1 } }), snap = stable(remote);
  mergeState(null, local, remote);
  assert.equal(stable(remote), snap);
  assert.deepEqual(local.done, { a: 1 });
});

test("Abmelden + Anmelden: leeres Gerät mit alter Basis löscht die Cloud nicht (Fehler vom 17.10.2026)", () => {
  const full = st({ done: { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 }, notes: { x: "Wade" }, plan: { days: {} }, _t: 50 });
  const empty = { done: {}, val: {}, notes: {}, extra: {}, solo: {}, strava: { acts: {}, at: 0 }, chat: [], plan: null };
  // Ohne Schutz wäre alles weg (das ist der alte Fehler)
  assert.deepEqual(mergeState(full, empty, full).done, {});
  const m = safeMerge(full, empty, full);
  assert.equal(countEntries(m), countEntries(full));
  assert.deepEqual(m.plan, { days: {} });
  assert.equal(m.notes.x, "Wade");
});

test("Anderes Gerät mit vollen Daten holt eine geleerte Cloud zurück", () => {
  const full = st({ done: { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 }, plan: { days: {} }, _t: 50 });
  const wiped = st({ _t: 60 });
  const m = safeMerge(full, full, wiped);
  assert.deepEqual(Object.keys(m.done).sort(), ["a", "b", "c", "d", "e", "f"]);
  assert.ok(m.plan);
});

test("Einzelne Haken entfernen bleibt möglich", () => {
  const base = st({ done: { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 } });
  const local = st({ done: { a: 1, b: 1, c: 1, d: 1 }, _t: 5 });
  assert.deepEqual(Object.keys(safeMerge(base, local, base).done).sort(), ["a", "b", "c", "d"]);
});

test("countEntries zählt Listen, Aktivitäten, Tests und Plan", () => {
  assert.equal(countEntries(null), 0);
  assert.equal(countEntries({ done: { a: 1 }, strava: { acts: { x: {} } }, tests: { lauf: { j: ["3:50", ""] }, trans: ["", "6"] }, plan: { days: {} } }), 5);
});
