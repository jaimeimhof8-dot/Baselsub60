import { test } from "node:test";
import assert from "node:assert/strict";
import { planContext, buildCoachRequest, toApiHistory, validateActions, parseCoachResponse, isoFromIdx, skipMessage, COACH_AHEAD } from "../src/coach.js";
import { makeBackup, readBackup, backupFileName } from "../src/backup.js";
import { idxFromDate } from "../src/dates.js";

// Mo Kraft, Di Lauf, Mi Bike, Do Station, Fr Ruhe, Sa Bike, So Ruhe; Tag 125 = Rennen
const WEEK = [["Kraft 1", "kraft"], ["Intervall", "lauf"], ["Zone 2", "bike"], ["Station", "station"], ["Ruhetag", "rest"], ["Lange Fahrt", "bike"], ["Ruhetag", "rest"]];
const plan = (i) => {
  if (i < 0 || i > 125) return null;
  if (i === 125) return { t: "Rennen", k: "sim", i: ["HYROX"], race: 1 };
  const [t, k] = WEEK[i % 7]; return { t, k, i: k === "rest" ? [] : [t + " Übung"], n: "" };
};
const idxOf = (s) => { const [y, m, d] = s.split("-").map(Number); return idxFromDate(new Date(y, m - 1, d)); };
const vctx = { today: 10, last: 125, idxOf, plan };

test("isoFromIdx: Tag 0 = 2026-10-12", () => {
  assert.equal(isoFromIdx(0), "2026-10-12");
  assert.equal(idxOf(isoFromIdx(40)), 40);
});

test("Plan-Kontext: Rückblick mit Status, Vorschau begrenzt", () => {
  const c = planContext({ today: 10, last: 125, plan, status: () => ({ n: 1, done: 1 }), rpe: (i) => (i === 9 ? 7 : undefined),
    skipped: (i) => i === 8, checkin: { sleep: "r" }, me: "Jaime", partner: "Jimoh" });
  assert.equal(c.today, isoFromIdx(10));
  assert.equal(c.recent.length, 7);
  assert.equal(c.recent.at(-1).rpe, 7);
  assert.equal(c.recent.find((d) => d.date === isoFromIdx(8)).skipped, true);
  assert.equal(c.upcoming.length, COACH_AHEAD);
  assert.equal(c.upcoming[0].date, isoFromIdx(10));
  assert.deepEqual(c.checkin, { sleep: "r" });
});

test("Ausfall: kommende Tage tragen skipped, Nachricht nennt Tag und Einheit", () => {
  const c = planContext({ today: 10, last: 125, plan, status: () => ({ n: 0, done: 0 }), rpe: () => undefined, skipped: (i) => i === 12 });
  assert.equal(c.upcoming.find((d) => d.date === isoFromIdx(12)).skipped, true);
  assert.equal(c.upcoming.find((d) => d.date === isoFromIdx(11)).skipped, undefined);
  const m = skipMessage(12, "Zone 2");
  assert.ok(m.includes(isoFromIdx(12)) && m.includes("Zone 2"));
  assert.doesNotThrow(() => buildCoachRequest({ context: c, chat: [], message: m }));
});

test("Plan-Kontext vor Planstart beginnt bei Tag 0", () => {
  const c = planContext({ today: -2, last: 125, plan, status: () => ({ n: 0, done: 0 }), rpe: () => undefined, skipped: () => false });
  assert.equal(c.recent.length, 0);
  assert.equal(c.upcoming[0].date, "2026-10-12");
});

test("Anfrage: leer und zu lang werden abgelehnt", () => {
  assert.throws(() => buildCoachRequest({ context: {}, chat: [], message: "  " }), { code: "empty" });
  assert.throws(() => buildCoachRequest({ context: {}, chat: [], message: "x".repeat(2001) }), { code: "too_long" });
  const r = buildCoachRequest({ context: { a: 1 }, chat: [], message: " Knie zwickt " });
  assert.equal(r.message, "Knie zwickt");
});

test("Verlauf beginnt mit user und enthält Status der Vorschläge", () => {
  const h = toApiHistory([
    { role: "assistant", text: "Hoi" },
    { role: "user", text: "Mi geht nicht" },
    { role: "assistant", text: "Tausch?", actions: [{ type: "swap", date: "2026-10-21", to: "2026-10-22" }], state: "applied" },
  ]);
  assert.equal(h[0].role, "user");
  assert.match(h[1].content, /übernommen/);
});

test("edit übernimmt die neue Disziplin, ungültige fällt auf die bisherige zurück", () => {
  // Tag 12 = Lange Fahrt (bike), Tag 10 = Station
  const mk = (date, kind) => ({ type: "edit", date, to: null, title: "Lockerer Lauf", items: ["Lauf 30′ Zone 2"], note: null, kind, reason: "" });
  const { valid } = validateActions([mk(isoFromIdx(12), "lauf"), mk(isoFromIdx(10), "yoga")], vctx);
  assert.equal(valid.find((a) => a.i === 12).kind, "lauf");
  assert.equal(valid.find((a) => a.i === 10).kind, "station");
});

test("Vorschläge prüfen: Vergangenheit, Renntag, Ruhetag-Entlastung, Doppelungen", () => {
  const d = (i) => isoFromIdx(i);
  const { valid, invalid } = validateActions([
    { type: "swap", date: d(16), to: d(18) },          // ok (Mi ↔ Fr)
    { type: "easy", date: d(5) },                       // Vergangenheit
    { type: "easy", date: d(125) },                     // Renntag
    { type: "easy", date: d(13) },                      // So = Ruhetag
    { type: "skip", date: d(16) },                      // Tag schon im Tausch
    { type: "edit", date: d(21), title: "Alternative", items: ["Bike 30′", " "], note: null },
    { type: "edit", date: d(22), items: [] },           // keine Übungen
    { type: "delete", date: d(20) },                    // unbekannt
    { type: "swap", date: d(20), to: "morgen" },        // Zieldatum ungültig
  ], vctx);
  assert.deepEqual(valid.map((a) => a.type), ["swap", "edit"]);
  assert.equal(valid[0].i, 16); assert.equal(valid[0].j, 18);
  assert.deepEqual(valid[1].items, ["Bike 30′"]);
  assert.equal(invalid.length, 7);
});

test("Antwort der Edge Function", () => {
  assert.deepEqual(parseCoachResponse({ reply: "Ok", actions: null }), { reply: "Ok", actions: [] });
  assert.throws(() => parseCoachResponse({ error: "x" }), { code: "bad_response" });
});

test("Backup: Export → Import ergibt denselben Stand", () => {
  const state = { done: { "2026-10-12|0": 1 }, notes: { a: "x" }, rpe: {}, checkin: {}, sched: { 3: { easy: 1 } }, edit: {}, strava: { acts: { 1: {} } } };
  const b = readBackup(JSON.stringify(makeBackup(state, { user: "Jaime", now: new Date(2026, 9, 20) })));
  assert.deepEqual(b.data, state);
  assert.equal(b.meta.user, "Jaime");
  assert.equal(b.summary.done, 1); assert.equal(b.summary.changes, 1); assert.equal(b.summary.strava, 1);
  assert.equal(backupFileName(new Date(2026, 9, 5)), "basel-sub60-backup-2026-10-05.json");
});

test("Backup: altes Text-Backup wird gelesen, Fremdes abgelehnt", () => {
  assert.equal(readBackup(JSON.stringify({ done: {}, val: {} })).meta.version, 0);
  for (const bad of ["kein json", "[]", "{}", JSON.stringify({ app: "andere-app", data: { done: {} } })])
    assert.throws(() => readBackup(bad), { code: "invalid" });
  assert.throws(() => readBackup(JSON.stringify({ app: "basel-sub60", version: 99, data: { done: {} } })), { code: "newer" });
});

test("Erklär-Anfrage: enthält die Einheit und setzt mode", async () => {
  const { explainMessage } = await import("../src/coach.js");
  const m = explainMessage(3, { t: "Kraft 1", i: ["Squat 5x5", "Zug"], n: "locker" });
  assert.match(m, /Kraft 1/);
  assert.match(m, /– Squat 5x5/);
  assert.match(m, /Hinweis im Plan: locker/);
  assert.ok(m.length <= 2000);
  assert.equal(buildCoachRequest({ context: {}, chat: [], message: "Was ist Zone 2?", mode: "explain" }).mode, "explain");
  assert.equal(buildCoachRequest({ context: {}, chat: [], message: "x" }).mode, undefined);
  assert.ok(explainMessage(0, { t: "A", i: Array(500).fill("sehr lange Übung ".repeat(5)) }).length <= 2000);
});
