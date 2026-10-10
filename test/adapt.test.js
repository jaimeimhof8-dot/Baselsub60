import { test } from "node:test";
import assert from "node:assert/strict";
import { readiness, suggest, isFixedRest, findSlot } from "../src/adapt.js";

// Standardwoche: Mo Kraft, Di Lauf, Mi Bike, Do Station, Fr Ruhe (fix), Sa Bike, So Ruhe
const WEEK = [["Kraft 1", "kraft"], ["Intervall", "lauf"], ["Zone 2", "bike"], ["Kraft 2", "station"], ["Ruhetag", "rest"], ["Lange Fahrt", "bike"], ["Ruhetag", "rest"]];
function ctx(over = {}) {
  const sched = {};
  const base = (i) => { const [t, k] = WEEK[((i % 7) + 7) % 7]; return { t, k, i: k === "rest" ? [] : [t], n: "" }; };
  const c = {
    today: 8, last: 125,
    plan: (i) => (i < 0 || i > 125 ? null : { ...base(i), ...(sched[i] || {}) }),
    status: () => ({ n: 1, done: 0 }), skipped: () => false, rpe: () => undefined, checkin: () => undefined,
    strava: () => undefined, moved: [], dismissed: {}, ...over
  };
  c.sched = sched;
  return c;
}

test("Ampel aus dem Check-in", () => {
  assert.equal(readiness({ sleep: "g", sore: "g", energy: "g", pain: "g" }), "green");
  assert.equal(readiness({ sleep: "y", sore: "y", energy: "y", pain: "g" }), "yellow");
  assert.equal(readiness({ sleep: "r", sore: "g", energy: "g", pain: "g" }), "yellow");
  assert.equal(readiness({ sleep: "r", sore: "r", energy: "g", pain: "g" }), "red");
  assert.equal(readiness({ sleep: "g", sore: "g", energy: "g", pain: "r" }), "red");
  assert.equal(readiness({ sleep: "g" }), null);
  assert.equal(readiness(undefined), null);
});

test("Freitag und 'Fix Ruhetag' sind fix", () => {
  assert.ok(isFixedRest({ k: "rest", n: "" }, 4));
  assert.ok(isFixedRest({ k: "rest", n: "Fixer Ruhetag" }, 6));
  assert.ok(!isFixedRest({ k: "rest", n: "" }, 6));
  assert.ok(!isFixedRest({ k: "bike", n: "fix" }, 4));
});

test("grüner Check-in und alles erledigt -> keine Vorschläge", () => {
  const c = ctx({ checkin: () => ({ sleep: "g", sore: "g", energy: "g", pain: "g" }), status: () => ({ n: 1, done: 1 }) });
  assert.deepEqual(suggest(c), []);
});

test("gelber Check-in -> heutige harte Einheit entlasten", () => {
  const c = ctx({ status: (i) => ({ n: 1, done: i < 8 ? 1 : 0 }), checkin: (i) => (i === 8 ? { sleep: "y", sore: "y", energy: "y", pain: "g" } : undefined) });
  const s = suggest(c);
  assert.equal(s.length, 1);
  assert.equal(s[0].type, "easy"); assert.equal(s[0].day, 8);
});

test("roter Check-in -> auf freien, nicht fixen Ruhetag verschieben", () => {
  // heute = Do (10). Fr (11) ist fix, So (13) ist frei
  const c = ctx({ today: 10, status: (i) => ({ n: 1, done: i < 10 ? 1 : 0 }), checkin: (i) => (i === 10 ? { sleep: "r", sore: "r", energy: "y", pain: "g" } : undefined) });
  const s = suggest(c);
  assert.equal(s[0].type, "swap"); assert.equal(s[0].day, 10); assert.equal(s[0].to, 13);
});

test("roter Check-in mit Schmerzen -> Alternativtraining", () => {
  const c = ctx({ status: (i) => ({ n: 1, done: i < 8 ? 1 : 0 }), checkin: (i) => (i === 8 ? { sleep: "g", sore: "g", energy: "g", pain: "r" } : undefined) });
  assert.equal(suggest(c)[0].type, "alt");
});

test("verpasste harte Einheit -> nachholen auf freiem Tag", () => {
  // heute Sa (12). Do (10) Station verpasst, So (13) ist frei; Sa ist Bike (nicht hart) -> kein hart-auf-hart
  const c = ctx({ today: 12, status: (i) => ({ n: 1, done: i === 10 ? 0 : 1 }) });
  const s = suggest(c);
  assert.equal(s.length, 1);
  assert.equal(s[0].id, "miss:10"); assert.equal(s[0].to, 13);
});

test("Strava-Erfüllung zählt als erledigt", () => {
  const c = ctx({ today: 12, status: () => ({ n: 1, done: 0 }), strava: (i) => ({ match: i >= 9 }) });
  assert.equal(suggest(c).filter((x) => x.id.startsWith("miss")).length, 0);
});

test("weggeklickte Vorschläge erscheinen nicht mehr", () => {
  const c = ctx({ today: 12, status: (i) => ({ n: 1, done: i === 10 ? 0 : 1 }), dismissed: { "miss:10": 1 } });
  assert.deepEqual(suggest(c), []);
});

test("hohe RPE -> nächste harte Einheit entlasten", () => {
  const rpe = { 7: 9, 8: 9, 10: 8 };
  const c = ctx({ today: 12, status: () => ({ n: 1, done: 1 }), rpe: (i) => rpe[i] });
  c.status = (i) => ({ n: 1, done: i < 12 ? 1 : 0 });
  const s = suggest(c);
  assert.equal(s.length, 1);
  assert.equal(s[0].type, "easy"); assert.equal(s[0].day, 14); // nächster Montag
});

test("findSlot meidet hart-auf-hart, nimmt sonst Fallback", () => {
  const c = ctx();
  // Einheit Di (8) auf So (13): Nachbarn Sa Bike / Mo Kraft (14) -> hart daneben -> nur Fallback
  assert.equal(findSlot(c, 8, 13, 13), 13);
  assert.equal(findSlot(c, 8, 9, 10), null); // keine Ruhetage
});
