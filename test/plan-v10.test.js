import { test } from "node:test";
import assert from "node:assert/strict";
import { builtinPlan, weekInfo, LAST } from "../src/plan-store.js";
import { OVERRIDE, APPEND, WEEK_KM, patchDay } from "../src/plan-v10.js";
import { LATER_DAYS } from "../src/plan-later.js";
import { isEasyRun, isHard } from "../src/util.js";

const dow = (i) => ((i % 7) + 7) % 7; // 0 = Mo
const P = builtinPlan();
const sim = (i) => P.days[i].k === "sim";

test("Wochenstruktur bleibt: Fr und So Ruhetag, Mo Kraft, Di Lauf, Do Station (Wochen 5–17), Rennen am Sa 13.02.", () => {
  for (let w = 4; w < 17; w++) {
    const d = (n) => P.days[w * 7 + n];
    assert.equal(d(4).k, "rest", `W${w + 1} Fr`);
    assert.equal(d(6).k, "rest", `W${w + 1} So`);
    assert.equal(d(0).k, "kraft", `W${w + 1} Mo`);
    assert.equal(d(1).k, "lauf", `W${w + 1} Di`);
    assert.ok(["lauf", "bike"].includes(d(2).k), `W${w + 1} Mi lauf oder rad`);
    assert.equal(d(3).k, "station", `W${w + 1} Do`);
  }
  assert.equal(P.days[124].k, "race");
  assert.equal(dow(124), 5);
});

test("Alle Plan-v10-Tage haben Titel, Inhalt und gültige Art; Tage liegen im Plan; Ruhetage werden nie überschrieben", () => {
  const kinds = ["kraft", "lauf", "station", "sim", "bike", "rest", "race"];
  for (const [k, v] of Object.entries(OVERRIDE)) {
    const i = +k;
    assert.ok(i >= 28 && i <= 122, "Tag " + i);
    assert.ok(v.t && kinds.includes(v.k) && v.i.length > 0 && v.i.every((x) => typeof x === "string" && x.length > 3), "Tag " + i);
    assert.ok(![4, 6].includes(dow(i)), "Fr/So bleiben Ruhetage: Tag " + i);
    assert.notEqual(P.days[i].k, "rest");
  }
  for (const k of Object.keys(APPEND)) assert.ok(LATER_DAYS[+k], "Anhang nur an bestehende Tage: " + k);
});

test("Lockere Dauerläufe zählen nicht als harte Tage, Tests, Schwelle und Simulationen schon", () => {
  const mi = [30, 37, 44, 58, 65, 72, 86, 93, 100, 114, 121];
  for (const i of mi) { assert.ok(isEasyRun(P.days[i]) && !isHard(P.days[i]), "Tag " + i + " " + P.days[i].t); assert.equal(dow(i), 2); }
  assert.ok(isHard(P.days[29]) && isHard(P.days[36]) && isHard(P.days[61]));
  assert.ok(isEasyRun(P.days[75]), "langer Lauf Zone 2 am Sa 26.12. zählt als locker");
});

test("Pacing-Re-Tests am 10.11., 01.12., 29.12. und 26.01. (jeweils Dienstag, alle 4 Wochen frisch)", () => {
  const tests = Object.keys(OVERRIDE).map(Number).filter((i) => /Re-Test|Zwischentest/.test(OVERRIDE[i].t));
  assert.deepEqual(tests.sort((a, b) => a - b), [29, 50, 78, 106]);
  tests.forEach((i) => assert.equal(dow(i), 1));
  assert.deepEqual(tests.map((i) => weekInfo(P, Math.floor(i / 7)).wave), ["moderat", "Deload", "Deload", "Deload"]);
});

test("Simulationen: Halb-Sim 28.11., volle Sims 12.12. (75 %), 19.12. (85 %), 09.01. (90 %), 23.01. (95 %), keine volle 7 Tage vor dem Rennen", () => {
  const full = Object.keys(OVERRIDE).map(Number).filter((i) => /^Doubles-Simulation #/.test(OVERRIDE[i].t)).sort((a, b) => a - b);
  assert.deepEqual(full, [61, 68, 89, 103]);
  assert.deepEqual(full.map((i) => +OVERRIDE[i].t.match(/\((\d+)%\)/)[1]), [75, 85, 90, 95]);
  full.forEach((i) => assert.equal(dow(i), 5));
  assert.ok(full.filter((i) => /85|90|95/.test(OVERRIDE[i].t)).length >= 3, "mindestens 3 Sims ab 85 %, damit die Prognose sich eicht");
  assert.ok(!full.some((i) => i > 124 - 14), "keine volle Simulation in den letzten 14 Tagen");
  assert.equal(OVERRIDE[117].t, "Renn-Aktivierung");
  assert.match(OVERRIDE[47].t, /Halb-Simulation/);
});

test("Lauf-Kilometer: Aufbau höchstens ca. 15 % von Woche zu Woche (ausser nach Deload), Deload und Taper reduziert", () => {
  let prevBuild = 17; // Block A: Spitze in Woche 3 etwa 17 km (Schätzwert: 24′ Schwelle + Compromised Running)
  for (let w = 5; w <= 18; w++) {
    const km = WEEK_KM[w];
    assert.ok(km > 0);
    const wave = weekInfo(P, w - 1).wave;
    if (wave === "Deload" || wave === "Taper") { assert.ok(km < prevBuild, `W${w} reduziert`); continue; }
    assert.ok(km <= prevBuild * 1.25 + 0.5, `W${w}: ${km} km gegen ${prevBuild}`);
    prevBuild = Math.max(prevBuild, km);
  }
  assert.equal(P.weeks.find((x) => x.n === 14).km, WEEK_KM[14]);
  assert.equal(weekInfo(P, 13).km, 32);
  assert.ok(Math.max(...Object.values(WEEK_KM)) <= 32);
});

test("Lunges und Wall Balls kommen in jeder Aufbauwoche zweimal vor (Mo-Finisher und Do-Block)", () => {
  for (const w of [4, 5, 6, 8, 9, 10, 12, 13, 14]) {
    assert.ok(APPEND[w * 7] && /Lunges/.test(APPEND[w * 7].join(" ")), "Mo W" + (w + 1));
    assert.ok(APPEND[w * 7 + 3] && /Wall Balls/.test(APPEND[w * 7 + 3].join(" ")), "Do W" + (w + 1));
    assert.ok(/Lunges/.test(P.days[w * 7].i.join(" ")) && /Wall Balls/.test(P.days[w * 7 + 3].i.join(" ")));
  }
});

test("patchDay verändert die Eingaben nicht und lässt unbeteiligte Tage unverändert", () => {
  const base = { t: "x", k: "kraft", i: ["a"], n: "" };
  const out = patchDay(28, base);
  assert.deepEqual(base.i, ["a"]);
  assert.ok(out.i.length > 1 && out.i[0] === "a");
  const o = patchDay(29, undefined);
  o.i.push("zzz");
  assert.ok(!OVERRIDE[29].i.includes("zzz"));
  assert.equal(patchDay(32, LATER_DAYS[32]), LATER_DAYS[32]);
  assert.equal(patchDay(999, undefined), undefined);
});

test("Plan reicht bis zum Renntag und alle Tage sind belegt", () => {
  for (let i = 0; i <= LAST; i++) assert.ok(P.days[i], "Tag " + i);
});
