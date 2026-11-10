import { test } from "node:test";
import assert from "node:assert/strict";
import { alignLaps } from "../src/align.js";

// Stationstag: Einlaufen, dann 4 × (Lauf 1 km · Station · Pause), Auslaufen
const mk = () => {
  const st = [{ kind: "warm", goal: 300 }];
  for (let r = 0; r < 4; r++) st.push({ kind: "run", goal: 240 }, { kind: "station", goal: 75 + r * 5 }, { kind: "rest", goal: 90 });
  st.push({ kind: "cool", goal: 300 });
  return st;
};
const STEPS = mk();
const truth = (steps, jit = () => 0) => steps.map((s, k) => ({ t: Math.round(s.goal * (1 + jit(k))), d: s.kind === "run" ? 1000 : s.kind === "warm" || s.kind === "cool" ? 800 : 0, hr: 150, _s: k }));
const wob = (k) => ((k * 7) % 5 - 2) * 0.03; // ±6 %

test("alle Runden vorhanden: alles zugeordnet, alles sicher", () => {
  const r = alignLaps(truth(STEPS, wob), STEPS);
  assert.ok(r);
  assert.equal(r.times.filter((t) => t != null).length, STEPS.length);
  assert.ok(r.sure.every((x) => x));
  assert.equal(r.quality, 1);
});

test("Uhrabsturz nach 9 von 14 Schritten: vorhandene zugeordnet, Rest nicht aufgezeichnet", () => {
  const laps = truth(STEPS, wob).slice(0, 9);
  const r = alignLaps(laps, STEPS);
  assert.ok(r);
  assert.equal(r.tail, STEPS.length - 9);
  assert.deepEqual(r.times.slice(9), Array(STEPS.length - 9).fill(null));
  assert.equal(r.times.slice(0, 9).filter((t) => t != null).length, 9);
});

test("Absturz mitten in einer Station: letzte Runde ist unvollständig und wird nicht gewertet", () => {
  const laps = truth(STEPS, wob).slice(0, 8);
  laps[7] = { ...laps[7], t: 20 };
  const r = alignLaps(laps, STEPS);
  assert.ok(r);
  assert.equal(r.incomplete, 7);
  assert.equal(r.times[7], null);
  assert.equal(r.times[6] != null, true);
});

test("Doppelt gedrückt (Station in zwei Runden): zusammengefasst", () => {
  const laps = truth(STEPS, wob);
  const st = laps[2];
  laps.splice(2, 1, { ...st, t: 40 }, { ...st, t: st.t - 40 });
  const r = alignLaps(laps, STEPS);
  assert.ok(r);
  assert.equal(r.times[2], truth(STEPS, wob)[2].t);
});

test("Viele Zusatzdrücker (mehr als 3 Runden Differenz) bleiben zuordenbar", () => {
  const laps = truth(STEPS, wob);
  for (const at of [12, 9, 7, 5, 3, 1]) laps.splice(at, 0, { t: 6, d: 0, hr: 150, _s: -1 });
  const r = alignLaps(laps, STEPS);
  assert.ok(r);
  assert.equal(r.times.filter((t) => t != null).length, STEPS.length);
});

test("Pausen nicht gelappt: Arbeit zugeordnet", () => {
  const laps = truth(STEPS, wob).filter((_, k) => STEPS[k].kind !== "rest");
  const r = alignLaps(laps, STEPS);
  assert.ok(r);
  assert.equal(r.times.filter((t, k) => t != null && STEPS[k].kind !== "rest").length, laps.length);
});

test("Passt nichts zum Plan: null, kein Raten", () => {
  assert.equal(alignLaps([{ t: 2400, d: 8000 }], STEPS), null);
  assert.equal(alignLaps([], STEPS), null);
  assert.equal(alignLaps(truth(STEPS), []), null);
});

// Zufallstest: Eine als «sicher» gemeldete Zuordnung darf NIE auf eine Runde eines anderen Schritts zeigen.
function rng(seed) { let x = seed; return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296); }
test("Zufallstest: kein «sicher» auf einer falschen Runde (500 Läufe)", () => {
  let sureSteps = 0, runs = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const R = rng(seed);
    let laps = truth(STEPS, () => (R() - 0.5) * 0.2);
    // Mutationen: Runden löschen, doppelt drücken, Zusatzdruck, Abbruch am Ende
    for (let q = 0; q < Math.floor(R() * 4); q++) {
      const op = R(), at = Math.floor(R() * laps.length), l = laps[at];
      if (!l) continue;
      if (op < 0.3 && laps.length > 5) laps.splice(at, 1);
      else if (op < 0.6) { const c = Math.max(5, Math.floor(l.t * R())); const dc = Math.round(l.d * c / l.t); laps.splice(at, 1, { ...l, t: c, d: dc }, { ...l, t: Math.max(1, l.t - c), d: l.d - dc }); }
      else if (op < 0.8) laps.splice(at, 0, { t: 3 + Math.floor(R() * 10), d: 0, hr: 150, _s: -1 });
      else laps = laps.slice(0, Math.max(4, laps.length - 1 - Math.floor(R() * 5)));
    }
    const r = alignLaps(laps, STEPS);
    if (!r) continue;
    runs++;
    STEPS.forEach((_, k) => {
      if (!r.sure[k] || r.laps[k] == null) return;
      sureSteps++;
      const owners = new Set(r.merged[r.laps[k]].parts.map((p) => p._s));
      owners.delete(-1);
      assert.ok(owners.size === 1 && owners.has(k), `Seed ${seed}: Schritt ${k} sicher, aber Runden gehören zu ${[...owners]}`);
    });
  }
  assert.ok(runs > 300 && sureSteps > 1000, `zu wenig Abdeckung: ${runs} Läufe, ${sureSteps} sichere Schritte`);
});

import { watchCheck } from "../src/laps.js";
test("watchCheck: Absturz wird als Teilübernahme gezeigt, nicht als «nicht zuordenbar»", () => {
  const laps = truth(STEPS, wob).slice(0, 9);
  const w = watchCheck({ src: "garmin", lapsV: 3, laps }, { steps: STEPS });
  assert.equal(w.splits.state, "ok");
  assert.equal(w.splits.mode, "dp");
  assert.ok(w.splits.tail > 0);
  assert.ok(w.splits.got >= 5);
});
test("watchCheck: völlig anderes Bild bleibt «bad»", () => {
  const w = watchCheck({ src: "garmin", lapsV: 3, laps: [{ t: 2400, d: 8000 }] }, { steps: STEPS });
  assert.equal(w.splits.state, "bad");
});

import { intervals } from "../src/dashboard.js";
test("Steigerungsläufe 4×100 m (je ~18 s) werden als Intervalle erkannt, nicht verworfen", () => {
  const laps = [{ d: 1500, t: 540 }, { d: 100, t: 18 }, { d: 100, t: 45 }, { d: 100, t: 17 }, { d: 100, t: 46 }, { d: 100, t: 18 }, { d: 100, t: 44 }, { d: 100, t: 17 }, { d: 1000, t: 250 }];
  const r = intervals(laps, "4×100 m Steigerungen");
  assert.equal(r.kind, "intervals");
  assert.equal(r.work.length, 4);
});
