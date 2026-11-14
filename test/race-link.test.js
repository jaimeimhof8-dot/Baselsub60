import test from "node:test";
import assert from "node:assert/strict";
import { RACE_LAP, raceLaps, paceOfLaps, racePlanRows } from "../src/race-link.js";
import { anRaceHtml } from "../src/an-ui.js";
import { splitPhases, phaseStats } from "../src/session-dash.js";
import { buildForecast } from "../src/forecast.js";

// Phasen wie aus splitPhases: Einlaufen, dann Arbeit/Pause im Wechsel
const phOf = (work, { conf = "sure", sub = null } = {}) => {
  const laps = [{ d: 1500, t: 540, hr: 130 }], phase = ["warm"], subs = [null];
  work.forEach((l, k) => {
    laps.push(l); phase.push("work"); subs.push(sub ? sub[k] : "run");
    laps.push({ d: 200, t: 90, hr: 140 }); phase.push("rest"); subs.push(null);
  });
  return { laps, phase, sub: subs, step: laps.map(() => null), conf, mode: null, note: "" };
};
const km = (t, n = 4) => Array.from({ length: n }, () => ({ d: 1000, t, hr: 170 }));
const FC = { T: 262, pace: 271, st: 1443, rox: 300, total: 3911 };
const row = (res, id) => res.rows.find((r) => r.id === id);

test("RACE_LAP: rund 1 km", () => assert.deepEqual(RACE_LAP, [800, 1200]));

test("raceLaps: nur Arbeitsläufe von 800 bis 1200 m", () => {
  const ph = phOf([{ d: 1000, t: 250 }, { d: 400, t: 90 }, { d: 1200, t: 300 }, { d: 1000, t: 200 }], { sub: ["run", "run", "run", "station"] });
  assert.deepEqual(raceLaps(ph).map((l) => l.d), [1000, 1200]);
  assert.deepEqual(raceLaps(null), []);
});

test("paceOfLaps: Summe Zeit durch Summe Strecke, nie NaN", () => {
  assert.equal(paceOfLaps([{ d: 1000, t: 250 }, { d: 1000, t: 254 }]), 252);
  assert.equal(paceOfLaps([]), null);
  assert.equal(paceOfLaps([{ d: 0, t: 30 }]), null);
});

test("racePlanRows: Pace gegen Prognose und gegen das Tempo für 60:00", () => {
  const res = racePlanRows({ ph: phOf(km(252)), st: {}, fc: FC, kind: "lauf" });
  assert.equal(res.state, "ok");
  assert.equal(row(res, "pace").v, 252);
  assert.equal(row(res, "fc").v, 271);
  assert.equal(row(res, "fc").d, -19);
  assert.equal(row(res, "fc").bad, false);
  assert.equal(row(res, "need").v, 232);
  assert.equal(row(res, "need").d, 20);
  assert.equal(row(res, "need").bad, true);
  assert.equal(row(res, "comp"), undefined);
});

test("racePlanRows: Kompromiss-Delta gegen den Aufschlag der Prognose", () => {
  const res = racePlanRows({ ph: phOf(km(252)), st: { compromise: { avg: 14 } }, fc: FC, kind: "station" });
  assert.equal(row(res, "comp").v, 14);
  assert.equal(row(res, "compfc").v, 9);
  assert.equal(row(res, "compfc").d, 5);
  assert.equal(row(res, "compfc").bad, true);
});

test("racePlanRows: geeichte Laufzeiten ohne Aufschlag -> Zeile fehlt", () => {
  const res = racePlanRows({ ph: phOf(km(252)), st: { compromise: { avg: 14 } }, fc: { ...FC, pace: 262 }, kind: "station" });
  assert.equal(row(res, "comp").v, 14);
  assert.equal(row(res, "compfc"), undefined);
  const neg = racePlanRows({ ph: phOf(km(252)), st: { compromise: { avg: 14 } }, fc: { ...FC, pace: 258 }, kind: "station" });
  assert.equal(row(neg, "compfc"), undefined);
});

test("racePlanRows: 400-m-Intervalle werden nicht verglichen", () => {
  const res = racePlanRows({ ph: phOf(Array.from({ length: 6 }, () => ({ d: 400, t: 88, hr: 175 }))), st: {}, fc: FC, kind: "lauf" });
  assert.equal(res.state, "nokm");
  assert.deepEqual(res.rows, []);
});

test("racePlanRows: ohne Prognose nur der Hinweis", () => {
  for (const fc of [null, undefined, {}, { total: 0 }]) {
    const res = racePlanRows({ ph: phOf(km(252)), st: {}, fc, kind: "lauf" });
    assert.equal(res.state, "notests");
    assert.deepEqual(res.rows, []);
  }
});

test("racePlanRows: kein Block bei lockerem Lauf, Kraft, unsicheren Phasen, ohne Arbeit", () => {
  const ph = phOf(km(252));
  assert.equal(racePlanRows({ ph, st: {}, fc: FC, kind: "lauf", easy: true }), null);
  assert.equal(racePlanRows({ ph, st: {}, fc: FC, kind: "kraft" }), null);
  assert.equal(racePlanRows({ ph: phOf(km(252), { conf: "unsure" }), st: {}, fc: FC, kind: "lauf" }), null);
  assert.equal(racePlanRows({ ph: phOf([]), st: {}, fc: FC, kind: "lauf" }), null);
  assert.equal(racePlanRows({ ph: null, st: {}, fc: FC, kind: "lauf" }), null);
  // 400 m bei lockerem Lauf oder Kraft: auch kein Hinweis
  assert.equal(racePlanRows({ ph: phOf([{ d: 400, t: 88 }]), st: {}, fc: null, kind: "lauf", easy: true }), null);
});

test("racePlanRows: Stationen und Roxzone lassen kein sub 60 zu -> Wert fehlt mit Grund", () => {
  const res = racePlanRows({ ph: phOf(km(252)), st: {}, fc: { ...FC, st: 3400 }, kind: "lauf" });
  assert.equal(row(res, "need").v, null);
  assert.equal(row(res, "need").d, null);
  assert.match(row(res, "need").why, /kein sub 60/);
});

test("racePlanRows: Runden ohne Puls und mit Strecke 0 ergeben kein NaN", () => {
  const res = racePlanRows({ ph: phOf([{ d: 1000, t: 250 }, { d: 0, t: 40 }, { d: 1000, t: 254 }]), st: { compromise: { avg: 0 } }, fc: FC, kind: "lauf" });
  assert.equal(res.state, "ok");
  for (const r of res.rows) for (const k of ["v", "d"]) assert.ok(r[k] === null || Number.isFinite(r[k]), `${r.id}.${k}`);
  assert.equal(row(res, "pace").v, 252);
});

test("racePlanRows: Prognose mit unvollständigen Feldern erfindet nichts", () => {
  const res = racePlanRows({ ph: phOf(km(252)), st: {}, fc: { total: 3900, pace: 271 }, kind: "lauf" });
  assert.equal(row(res, "fc").v, 271);
  assert.equal(row(res, "need"), undefined);
});

test("anRaceHtml: grosse Zahl, zwei Vergleiche, Fusszeile, kein Grün", () => {
  const res = racePlanRows({ ph: phOf(km(252)), st: { compromise: { avg: 14 } }, fc: FC, kind: "station" });
  const h = anRaceHtml(res, { total: 3911, testsAt: "02.11." });
  assert.match(h, /Gegen Rennplan/);
  assert.match(h, /<b>4:12<\/b><span>\/km · 4 Läufe à 1 km<\/span>/);
  assert.match(h, /4:31/);
  assert.match(h, /<div class="x">19 s schneller<\/div>/);
  assert.match(h, /3:52/);
  assert.match(h, /<div class="x bad">20 s langsamer<\/div>/);
  assert.match(h, /\+14/);
  assert.match(h, /<div class="x bad">5 s mehr<\/div>/);
  assert.match(h, /Prognose 65:11 · Tests vom 02\.11\. · ändert sich nur durch Tests und Simulationen/);
  assert.doesNotMatch(h, /30d158|green|class="ok"/);
});

test("anRaceHtml: gleich schnell, weniger Delta, ohne Testdatum", () => {
  const res = racePlanRows({ ph: phOf(km(271)), st: { compromise: { avg: 6 } }, fc: FC, kind: "station" });
  const h = anRaceHtml(res, { total: 3911 });
  assert.match(h, /<div class="x">gleich<\/div>/);
  assert.match(h, /<div class="x">3 s weniger<\/div>/);
  assert.doesNotMatch(h, /Tests vom/);
});

test("anRaceHtml: leer, Hinweise, fehlender Wert mit Grund", () => {
  assert.equal(anRaceHtml(null), "");
  assert.equal(anRaceHtml(undefined), "");
  assert.match(anRaceHtml({ state: "nokm", rows: [] }), /Intervalle sind nicht rund 1 km lang/);
  const nt = anRaceHtml({ state: "notests", rows: [] });
  assert.match(nt, /Noch keine Testwerte/);
  assert.match(nt, /data-v="profile"/);
  const res = racePlanRows({ ph: phOf(km(252)), st: {}, fc: { ...FC, st: 3400 }, kind: "lauf" });
  const h = anRaceHtml(res, { total: 5868 });
  assert.match(h, /Stationen und Roxzone allein lassen kein sub 60 zu/);
  assert.doesNotMatch(h, /NaN|undefined|null/);
});

test("racePlanRows: Simulation eicht die Laufzeiten -> Aufschlag-Zeile fehlt auch bei pace > T", () => {
  const res = racePlanRows({ ph: phOf(km(252)), st: { compromise: { avg: 14 } }, fc: { ...FC, T: 236, pace: 300, runCal: true }, kind: "station" });
  assert.equal(row(res, "comp").v, 14);
  assert.equal(row(res, "compfc"), undefined);
});

test("racePlanRows: Dauerlauf mit Auto-Lap ohne Wiederholungen im Plan (echtes splitPhases) -> kein Block", () => {
  const laps = Array.from({ length: 10 }, () => ({ d: 1000, t: 331, hr: 150 }));
  const ph = splitPhases(laps, { steps: null, planText: "" });
  assert.equal(ph.mode, "steady");
  assert.equal(racePlanRows({ ph, st: phaseStats(ph), fc: FC, kind: "lauf" }), null);
  const one = splitPhases([{ d: 6200, t: 2100, hr: 150 }], { steps: null, planText: "" });
  assert.equal(racePlanRows({ ph: one, st: phaseStats(one), fc: FC, kind: "lauf" }), null);
});

test("racePlanRows: Intervall-Lauf über echtes splitPhases und echtes buildForecast", () => {
  const L = (d, t, hr) => ({ d, t, hr });
  const laps = [L(1500, 495, 128), L(1000, 244, 163), L(400, 170, 150), L(1000, 241, 170), L(400, 168, 156), L(1000, 243, 175), L(400, 172, 158), L(1000, 249, 180), L(1500, 520, 140)];
  const ph = splitPhases(laps, { steps: null, planText: "4×1 km @ 4:05, 400 m Trabpause" });
  const fc = buildForecast({ laufPersons: [["4:20", "4:22", "4:24", "4:26"], ["4:18", "4:21", "4:25", "4:28"]], station: ["4:10", "2:40", "4:30", "4:00", "4:20", "1:40", "4:10", "5:30"].map((v) => [v, v]) });
  assert.ok(fc.total > 0);
  const res = racePlanRows({ ph, st: phaseStats(ph), fc, kind: "lauf" });
  assert.equal(res.state, "ok");
  assert.equal(row(res, "pace").n, 4);
  assert.equal(row(res, "pace").v, 244);
  assert.equal(row(res, "fc").v, Math.round(fc.pace));
  assert.equal(row(res, "need").v, Math.round((3600 - fc.st - fc.rox) / 8));
  for (const r of res.rows) assert.ok(r.v === null || Number.isFinite(r.v));
});
