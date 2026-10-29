import test from "node:test";
import assert from "node:assert/strict";
import { analyseSession } from "../src/analyse.js";

const it = (t, done = true, extra = {}) => ({ t, done, skip: false, val: "", prevVal: "", ...extra });

test("komplette Kraft-Einheit mit mehr Gewicht ist gut", () => {
  const r = analyseSession({ kind: "kraft", wave: "moderat", rpe: 7, rpeMax: 6.5, items: [
    it("Back Squat 3×5 @75% RPE 7", true, { val: "80 kg", prevVal: "77.5 kg" }), it("Bench Press 3×6 RPE 7"), it("Plank 3×50″")] });
  assert.ok(r.score >= 78);
  assert.equal(r.tone, "green");
  assert.ok(r.good.some((x) => /mehr Gewicht/.test(x)));
});

test("halb umgesetzt und zu hart wird schlecht bewertet", () => {
  const r = analyseSession({ kind: "lauf", easy: true, wave: "moderat", rpe: 8, rpeMax: 6.5, items: [it("Lockerer Lauf 45′"), it("Dehnen", false), it("Mobility", false)] });
  assert.ok(r.score < 55);
  assert.ok(r.bad.length >= 2);
  assert.ok(r.adjust.some((x) => /locker/i.test(x)));
});

test("Intervall-Einbruch wird erkannt", () => {
  const laps = [240, 245, 255, 275].map((t) => ({ d: 1000, t }));
  const r = analyseSession({ kind: "lauf", wave: "hart", rpe: 8, rpeMax: 7.5, items: [it("4×1km, RPE 8")], act: { laps } });
  assert.ok(r.bad.some((x) => /Einbruch/.test(x)));
});

test("ohne RPE und Schmerznotiz", () => {
  const r = analyseSession({ kind: "kraft", wave: "moderat", rpe: null, rpeMax: 6.5, note: "Knie zwickt", items: [it("Squat 3×5")] });
  assert.ok(r.bad.some((x) => /RPE/.test(x)) && r.bad.some((x) => /Schmerz/.test(x)));
});

import { analysisContext, parseAnalysis, buildCoachRequest } from "../src/coach.js";

test("analysisContext kürzt Runden und hängt session an", () => {
  const laps = Array.from({ length: 100 }, () => ({ d: 1000, t: 240, hr: 160 }));
  const c = analysisContext({ today: "2026-10-29" }, { title: "x", items: [], watch: { laps }, similar: [] });
  assert.equal(c.session.watch.laps.length, 60);
  assert.equal(c.today, "2026-10-29");
});

test("parseAnalysis säubert und lehnt Müll ab", () => {
  const r = parseAnalysis({ headline: "Gut", summary: "ok", strengths: [{ title: "a", detail: "b" }, { title: "", detail: "x" }], weaknesses: [],
    execution: { pacing: "p", rest: "", technique: "" }, adjustments: [{ area: "komisch", change: "Pause 2′", why: "w" }], next_focus: "f", data_gaps: ["g"], actions: [] });
  assert.equal(r.strengths.length, 1);
  assert.equal(r.adjustments[0].area, "session");
  assert.throws(() => parseAnalysis({}), /Ungültige/);
});

test("buildCoachRequest reicht den Modus analyse durch", () => {
  assert.equal(buildCoachRequest({ context: {}, chat: [], message: "x", mode: "analyse" }).mode, "analyse");
});

test("parseAnalysis erkennt die alte Edge-Function-Antwort", () => {
  assert.throws(() => parseAnalysis({ reply: "Hallo", actions: [] }), (e) => e.code === "old_function");
});

test("parseAnalysis übernimmt Stand und Erkenntnisse", () => {
  const r = parseAnalysis({ headline: "h", summary: "s", form: { rating: "auf Kurs", text: "ok" }, insights: [{ title: "Drift", detail: "+8 bpm" }],
    strengths: [], weaknesses: [], execution: {}, adjustments: [], next_focus: "", data_gaps: [], actions: [] });
  assert.equal(r.form.rating, "auf Kurs");
  assert.equal(r.insights.length, 1);
});
