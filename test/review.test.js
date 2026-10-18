import { test } from "node:test";
import assert from "node:assert/strict";
import { weekCheck, forecast, onTrack, trackText, cleanSelf, reviewDue, RUN_PENALTY, DOUBLES_SHARE, ROXZONE } from "../src/review.js";
import * as review from "../src/review.js";
import { suggestExtras, makeExtra, extraLabel, extraAsDay } from "../src/extras.js";

const day = (k, done, o = {}) => ({ t: k + "-Einheit", k, done, ...o });

test("Wochen-Check: alles erledigt, RPE passend = grün", () => {
  const r = weekCheck({ wave: "moderat", days: [day("kraft", 1, { rpe: 6 }), day("lauf", 1, { rpe: 7 }), day("bike", 1, { rpe: 4 }), day("rest", 0)] });
  assert.equal(r.level, "green");
  assert.equal(r.planned, 3);
  assert.equal(r.done, 3);
  assert.ok(r.focus.length);
});

test("Wochen-Check: zwei Schlüsseleinheiten verpasst = rot mit Fokus", () => {
  const r = weekCheck({ days: [day("kraft", 0), day("lauf", 0), day("bike", 1), day("station", 1)] });
  assert.equal(r.level, "red");
  assert.deepEqual(r.missedKey, ["kraft-Einheit", "lauf-Einheit"]);
  assert.ok(r.focus.some((f) => /Schlüsseleinheiten/.test(f)));
});

test("Wochen-Check: zu hart für Deload, Laufumfang-Sprung und Schmerzen", () => {
  const r = weekCheck({ wave: "Deload", days: [day("lauf", 1, { rpe: 8 })], load: { runKm: 20, min: 200 }, prev: [{ runKm: 12 }, { runKm: 12 }], self: { pain: 2 } });
  assert.equal(r.level, "red");
  assert.ok(r.runRamp > 0.6);
  assert.ok(r.notes.some((n) => /Laufumfang/.test(n.text)));
  assert.ok(r.notes.some((n) => /Schmerzen/.test(n.text)));
});

test("Prognose aus Tests, nur mit allen Stationen komplett", () => {
  assert.equal(forecast({ lauf: [NaN] }), null);
  const half = forecast({ lauf: [230, 250], station: [[300, 320]] });
  assert.equal(half.T, 240);
  assert.equal(half.run, 8 * (240 + RUN_PENALTY));
  assert.equal(half.total, null);
  assert.equal(half.missing, 7);
  const full = forecast({ lauf: [240], station: Array.from({ length: 8 }, () => [200, null]) });
  assert.equal(full.total, 8 * (240 + RUN_PENALTY) + 1600 * DOUBLES_SHARE + ROXZONE);
});

test("Auf Kurs: Rückstand pro Restwoche", () => {
  assert.equal(onTrack(3500, 10).level, "green");
  const t = onTrack(3700, 10);
  assert.equal(t.level, "yellow");
  assert.equal(t.perWeek, 10);
  assert.equal(onTrack(4200, 5).level, "red");
  assert.match(trackText(3700, t), /1:40 über dem Ziel, ca\. 10 s pro Woche/);
  assert.equal(onTrack(null, 3), null);
});

test("Eigene Einschätzung säubern und Fälligkeit", () => {
  assert.deepEqual(cleanSelf({ feel: 0, prog: 5, pain: "x", note: "  gut  " }), { feel: 0, note: "gut" });
  assert.equal(reviewDue(5, {}), 0); // Samstag Woche 1
  assert.equal(reviewDue(3, {}), null); // Donnerstag
  assert.equal(reviewDue(7, {}, true), 0); // erste Sitzung der neuen Woche, Vorwoche noch offen
  assert.equal(reviewDue(7, {}, false), null); // danach verschwindet die Karte
  assert.equal(reviewDue(9, {}, true), 0); // auch wenn die erste Sitzung erst am Mittwoch ist
  assert.equal(reviewDue(7, { 0: { at: 1 } }, true), null);
  assert.equal(reviewDue(12, { 1: { at: 1 } }), null);
});

test("Zusatz-Einheit mit RPE und neuen Arten", () => {
  const e = makeExtra({ type: "erg", min: "20", rpe: "6" }, "a");
  assert.deepEqual(e, { id: "a", type: "erg", min: 20, rpe: 6 });
  assert.equal(extraLabel(e), "Ski/Row Erg · 20′ · RPE 6");
  assert.equal(makeExtra({ type: "core", rpe: 11 }), null);
  assert.equal(extraAsDay(makeExtra({ type: "station", note: "Wall Balls" }, "b")).k, "station");
});

test("Passende Zusatz-Einheit: vorsichtig je nach Tag", () => {
  assert.deepEqual(suggestExtras({ day: { k: "rest" } }).map((x) => x.type), ["mobility"]);
  assert.deepEqual(suggestExtras({ day: { k: "bike" }, ready: "red" }).map((x) => x.type), ["mobility"]);
  assert.ok(suggestExtras({ day: { k: "kraft" }, wave: "Deload" }).every((x) => ["mobility", "core"].includes(x.type)));
  // Kraft mit Hinweis „Kein Zone-2-Zusatz“: kein Rad
  assert.ok(!suggestExtras({ day: { k: "kraft", n: "Kein Zone-2-Zusatz danach." } }).some((x) => x.type === "z2bike"));
  assert.ok(suggestExtras({ day: { k: "kraft" } }).some((x) => x.type === "z2bike"));
  // Morgen hart: kein Zusatz-Lauf, Mobility zuerst
  const s = suggestExtras({ day: { k: "bike" }, next: { k: "lauf", t: "Intervall" } });
  assert.equal(s[0].type, "mobility");
  assert.ok(!s.some((x) => x.type === "z2run"));
  assert.ok(suggestExtras({ day: { k: "bike" } }).some((x) => x.type === "z2run"));
  assert.ok(!suggestExtras({ day: { k: "bike" }, runRisk: true }).some((x) => x.type === "z2run"));
  assert.deepEqual(suggestExtras({ day: { k: "bike" }, weekMin: 160 }).map((x) => x.type), ["mobility"]);
});

test("Wochenbericht-Push: Text aus der Kurzfassung, Erinnerung ohne Daten", async () => {
  const { weeklyMessage, weekOf, zurichDate } = await import("../supabase/functions/weekly/report.js");
  assert.equal(weekOf("2026-10-18"), 0);
  assert.equal(weekOf("2026-10-25"), 1);
  const m = weeklyMessage({ w: 1, level: "green", done: 5, planned: 6, rpe: 6.54, sleep: 7.1, fc: 3550, focus: "Weiter so.", reviewed: false }, 1);
  assert.equal(m.title, "Wochenbericht Woche 2");
  assert.match(m.body, /^Auf Kurs ✅ 5\/6 Einheiten · Ø RPE 6,5 · Schlaf Ø 7,1 h · Prognose 59:10\nFokus: Weiter so\.\nTipp hier/);
  assert.equal(m.url, "./?v=review");
  assert.match(weeklyMessage({ w: 0 }, 1, { name: "Jaime" }).body, /^Jaime, diese Woche ist noch nichts eingetragen/);
  assert.match(weeklyMessage(null, 3).body, /^Diese Woche/);
  assert.equal(zurichDate(Date.UTC(2026, 9, 18, 23, 30)), "2026-10-19"); // 00:30 in Zürich
});

test("Prognose Zeile für Zeile gegen das Rennmodell", () => {
  const fc = review.forecast({ lauf: [232, 235, 230, 238], station: Array.from({ length: 8 }, () => [400, 420]) });
  const b = review.breakdown(fc);
  assert.equal(b.rows.length, 10);
  assert.equal(b.rows[0].goal, 1920);
  assert.equal(Math.round(b.rows[0].est), Math.round(8 * (233.75 + review.RUN_PENALTY)));
  assert.equal(Math.round(b.rows[1].est), Math.round(410 * review.DOUBLES_SHARE));
  assert.equal(b.goal, 1920 + 1390 + 270);
  assert.ok(b.goal < 3600, "Rennmodell muss unter 60 Minuten liegen");
  assert.equal(Math.round(b.diff), Math.round(fc.total - b.goal));
  assert.equal(review.breakdown(null), null);
});

test("Laufumfang gegen Plan und Vorwoche", () => {
  assert.equal(review.runCheck(18, { plan: 20, prev: 16 }).level, "green");
  assert.equal(review.runCheck(22, { plan: 20, prev: 15 }).level, "yellow"); // +47 % zur Vorwoche
  assert.equal(review.runCheck(12, { plan: 20 }).level, "yellow"); // deutlich unter Plan
  assert.equal(review.runCheck(null), null);
});
