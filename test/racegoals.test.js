import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, setSplit, toggleLock, reset, progress, doublesShare, planText, slots, roundTo, scenarioGoal, DISTANCE, MIN_SPLIT } from "../src/racegoals.js";
import { buildForecast } from "../src/forecast.js";

const t = (s) => { const [m, x] = s.split(":"); return +m * 60 + +x; };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const JAIME = { lauf: ["3:53", "3:58", "3:55", "4:00"].map(t), st: ["3:57", "2:03", "3:30", "3:12", "3:44", "1:49", "2:25", "5:04"].map(t) };
const JIMOH = { lauf: ["3:53", "3:59", "3:56", "4:00"].map(t), st: ["3:58", "1:56", "3:22", "3:02", "3:37", "1:59", "2:38", "5:00"].map(t) };
const FC = buildForecast({ laufPersons: [JAIME.lauf, JIMOH.lauf], station: JAIME.st.map((v, r) => [v, JIMOH.st[r]]) });

test("Reihenfolge wie im Rennen: 8 Läufe, 8 Stationen abwechselnd, dann Roxzone", () => {
  const s = slots();
  assert.equal(s.length, 17);
  assert.deepEqual(s.slice(0, 4).map((x) => x.label), ["Lauf 1", "SkiErg", "Lauf 2", "Sled Push"]);
  assert.equal(s[15].label, "Wall Balls");
  assert.equal(s[16].kind, "rox");
});

test("Zielzeit wird auf die Sekunde genau verteilt, auch bei krummen Zahlen", () => {
  for (const goal of [t("60:00"), t("59:01"), t("57:37"), t("63:21"), 4271]) {
    const p = buildPlan({ goal });
    assert.equal(p.total, goal, "Summe " + goal);
    assert.ok(p.splits.every((s) => Number.isInteger(s.sec) && s.sec >= s.min));
    assert.equal(p.error, null);
  }
});

test("Ohne Prognose: das Rennmodell der App (rund 4:00 pro Lauf, Roxzone rund 4:30), gleichmässig skaliert", () => {
  const p = buildPlan({ goal: 3600 });
  assert.equal(p.personal, false);
  const runs = p.splits.filter((s) => s.kind === "run").map((s) => s.sec);
  assert.ok(runs.every((x) => x >= 240 && x <= 242) && new Set(runs).size <= 2, "gleich lange Läufe: " + runs);
  assert.ok(p.splits.at(-1).sec >= 270 && p.splits.at(-1).sec <= 272);
});

test("Mit Prognose: eure eigene Form, das Verhältnis der Teile bleibt, die Zeit passt zum Ziel", () => {
  const p = buildPlan({ goal: t("59:00") }, FC);
  assert.equal(p.personal, true);
  assert.equal(p.total, t("59:00"));
  const wb = p.splits.find((s) => s.id === "s7"), ski = p.splits.find((s) => s.id === "s0");
  assert.ok(wb.sec > ski.sec, "Wall Balls dauern länger als SkiErg");
  const r1 = p.splits.find((s) => s.id === "r0"), r8 = p.splits.find((s) => s.id === "r7");
  assert.ok(r8.sec > r1.sec, "Lauf 8 langsamer als Lauf 1 (Drift)");
});

test("Szenarien: Bequem langsamer, Stretch schneller, Prognose = aktuelle Prognose", () => {
  assert.equal(scenarioGoal(3600, "bequem", FC), 3708);
  assert.equal(scenarioGoal(3600, "stretch", FC), 3492);
  assert.equal(scenarioGoal(3600, "prognose", FC), Math.round(FC.total));
  assert.equal(scenarioGoal(3600, "prognose", null), 3600); // ohne Tests: Ziel
  assert.equal(buildPlan({ goal: 3600, scenario: "stretch" }).total, 3492);
});

test("Split ändern, Gesamtzeit gesperrt: die anderen gleichen aus, der geänderte bleibt", () => {
  const a = buildPlan({ goal: 3600 });
  const st = setSplit({ goal: 3600 }, "s7", a.splits[15].sec + 20);
  const b = buildPlan(st);
  assert.equal(b.total, 3600);
  assert.equal(b.splits[15].sec, a.splits[15].sec + 20);
  assert.ok(b.splits[15].locked && b.splits[15].edited);
  const others = b.splits.filter((s) => s.id !== "s7");
  assert.ok(others.every((s, i) => s.sec <= a.splits.filter((x) => x.id !== "s7")[i].sec), "alle anderen werden etwas schneller");
});

test("Gesamtzeit entsperrt: nur der Split ändert sich, die Summe wandert", () => {
  const a = buildPlan({ goal: 3600, lockTotal: false });
  const b = buildPlan({ ...setSplit({ goal: 3600 }, "s7", 215), lockTotal: false });
  assert.equal(b.total, 3600 + (215 - a.splits[15].sec));
  assert.ok(b.splits.filter((s) => s.id !== "s7").every((s, i) => s.sec === a.splits.filter((x) => x.id !== "s7")[i].sec));
});

test("Gesperrte Splits bleiben, wenn andere geändert werden; entsperren nimmt sie zurück in den Ausgleich", () => {
  let st = { goal: 3600 };
  const r0 = buildPlan({ goal: 3600 }).splits[0].sec;
  st = toggleLock(st, "r0"); // Lauf 1 festhalten
  st = setSplit(st, "s0", 260);
  let p = buildPlan(st);
  assert.equal(p.total, 3600);
  assert.equal(p.splits[0].sec, r0);
  assert.equal(p.splits[1].sec, 260);
  st = toggleLock(st, "s0");
  p = buildPlan(st);
  assert.ok(!p.splits[1].edited && p.splits[1].sec < 260 && p.splits[1].sec > 200);
  assert.deepEqual(reset(st).locked, {});
});

test("Unmögliche Wünsche geben eine Fehlermeldung statt Unsinn", () => {
  // alle Läufe auf 6:00 gesperrt: 48 Minuten Laufen lassen für Stationen + Roxzone weniger als das Minimum
  let st = { goal: t("50:00") };
  for (let i = 0; i < 8; i++) st = setSplit(st, `r${i}`, 360);
  const p = buildPlan(st);
  assert.match(p.error, /mindestens/);
  // alles gesperrt, Summe passt nicht
  let all = { goal: 3600 };
  for (const s of slots()) all = setSplit(all, s.id, 200);
  assert.match(buildPlan(all).error, /gesperrt/);
  // Minimum wird eingehalten, wenn die Reste knapp werden
  let tight = setSplit({ goal: t("40:00") }, "r0", 600);
  const q = buildPlan(tight);
  assert.ok(q.splits.every((s) => s.sec >= s.min) || q.error);
});

test("setSplit/toggleLock verändern den alten State nicht und ignorieren Unsinn", () => {
  const st = { goal: 3600, edits: { r0: 200 } };
  const n = setSplit(st, "r1", 230);
  assert.deepEqual(st, { goal: 3600, edits: { r0: 200 } });
  assert.equal(n.edits.r1, 230);
  assert.equal(setSplit(st, "gibtsnicht", 100), st);
  assert.equal(setSplit(st, "r1", NaN), st);
  assert.equal(setSplit(st, "r1", -5), st);
});

test("Renntag: Abstand zum Plan pro Split und kumuliert, Hochrechnung", () => {
  const p = buildPlan({ goal: 3600 });
  const pr = progress(p, { r0: 235, s0: 230, r1: 245 });
  assert.equal(pr.done, 3);
  assert.equal(pr.rows[0].delta, 235 - p.splits[0].sec);
  assert.equal(pr.rows[1].delta, 230 - p.splits[1].sec);
  assert.equal(pr.rows[2].deltaCum, pr.rows[2].cum - (p.splits[0].sec + p.splits[1].sec + p.splits[2].sec));
  assert.equal(pr.projected, 3600 + pr.ahead);
  assert.equal(pr.rows[3].actual, null);
  const none = progress(p, {});
  assert.equal(none.ahead, 0);
  assert.equal(none.projected, null);
});

test("Doubles: der Schnellere übernimmt mehr, gerundet auf die Schrittweite, beide machen mindestens einen Schritt", () => {
  const ski = doublesShare(0, t("3:57"), t("3:58"), 230);
  assert.equal(ski.me + ski.pa, 1000);
  assert.ok(ski.me === 500 && ski.pa === 500, "praktisch gleich stark: 50/50");
  const sled = doublesShare(1, t("2:03"), t("1:56"), 120);
  assert.equal(sled.me + sled.pa, 50);
  assert.ok(sled.pa >= sled.me, "Jimoh schiebt schneller");
  const wide = doublesShare(7, 600, 120, 300); // Wall Balls: 5:1
  assert.equal(wide.me + wide.pa, 100);
  assert.ok(wide.me >= 5 && wide.pa > wide.me);
  assert.ok(Math.abs(wide.timeMe + wide.timePa - 300) < 1e-6);
  const extreme = doublesShare(3, 10000, 10, 100);
  assert.ok(extreme.me >= 5, "mindestens ein Schritt");
  assert.equal(doublesShare(0, NaN, 200, 100), null);
  assert.equal(doublesShare(9, 200, 200, 100), null);
  assert.equal(DISTANCE.length, 8);
});

test("Teilen als Text enthält Gesamtzeit, alle 17 Zeilen und die kumulierte Zeit", () => {
  const txt = planText(buildPlan({ goal: 3600 }));
  assert.equal(txt.split("\n").length, 18);
  assert.match(txt, /^Race Goals: 60:00/);
  assert.match(txt.split("\n").at(-1), /60:00\)$/);
});

test("roundTo trifft die Zielsumme immer", () => {
  for (const [v, n] of [[[1.4, 1.4, 1.2], 4], [[10.5, 10.5], 21], [[0.2, 0.2, 0.2, 0.2, 0.2], 1]]) assert.equal(sum(roundTo(v, n)), n);
  assert.ok(MIN_SPLIT.run > 0);
});
