import { test } from "node:test";
import assert from "node:assert/strict";
import { weekCheck, forecast, onTrack, trackText, cleanSelf, reviewDue, RUN_PENALTY, DOUBLES_SHARE, ROXZONE } from "../src/review.js";
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
  assert.equal(reviewDue(7, {}), 0); // Montag danach, noch offen
  assert.equal(reviewDue(7, { 0: { at: 1 } }), null);
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
