import test from "node:test";
import assert from "node:assert/strict";
import { sessionDash, compareToPrev } from "../src/session-dash.js";
import { analyseSession } from "../src/analyse.js";
import { dashV3 } from "../src/dash-v3.js";

const q = analyseSession({ kind: "lauf", easy: true, rpe: 4, items: [{ t: "Lockerer Lauf 40′", done: true, val: "" }] });
test("sessionDash: Kacheln, Rundenbalken, Coach-Chips", () => {
  const act = { time: 2400, dist: 8000, hr: 145, maxHr: 170, group: "run", laps: [{ d: 1000, t: 300, hr: 140 }, { d: 1000, t: 150, hr: 150 }] };
  const coach = { form: { rating: "auf Kurs" }, strengths: [1, 2], weaknesses: [], adjustments: [1], nextFocus: "Ruhig bleiben" };
  const d = sessionDash(q, act, coach);
  assert.equal(d.score, q.score);
  assert.deepEqual(d.tiles.map((t) => t.k), ["Umsetzung", "Anstrengung", "Dauer", "Ø Puls"]);
  assert.equal(d.tiles[2].v, "40:00 min");
  assert.equal(d.laps.length, 2);
  assert.equal(d.laps[0].h, 100);
  assert.equal(d.laps[1].h, 50);
  assert.deepEqual(d.chips.map((c) => c.v), ["auf Kurs", "2", "0", "1"]);
  assert.equal(d.focus, "Ruhig bleiben");
});
test("sessionDash: ohne Uhr und ohne Coach nur die Fakten", () => {
  const d = sessionDash(q, null, null);
  assert.equal(d.laps, null);
  assert.deepEqual(d.chips, []);
  assert.ok(d.tiles.length >= 1);
});

test("compareToPrev: gleiches mit gleichem, nur vorhandene Werte", () => {
  const cur = { act: { group: "run", dist: 8000, time: 2400, hr: 148 }, rpe: 6 };
  const prev = { act: { group: "run", dist: 8000, time: 2480, hr: 153 }, rpe: 7 };
  const r = compareToPrev(cur, prev);
  assert.deepEqual(r.map((x) => x.k), ["Pace", "Ø Puls", "Anstrengung", "Dauer"]);
  assert.equal(r[0].v, "−10 s/km");
  assert.equal(r[0].tone, "green");
  assert.equal(r[1].v, "−5 bpm");
  assert.equal(r[2].v, "−1");
  assert.equal(r[3].v, "−1:20 min");
  assert.equal(r[3].tone, "");
  // lockerer Lauf: langsamer ist kein Minus; Puls höher bei schnellerem Tempo auch nicht
  const slow = compareToPrev({ act: { group: "run", dist: 8000, time: 2800, hr: 140 } }, { act: { group: "run", dist: 8000, time: 2400, hr: 140 } }, { easy: true });
  assert.equal(slow[0].tone, "");
  const fast = compareToPrev({ act: { group: "run", dist: 8000, time: 2300, hr: 160 } }, { act: { group: "run", dist: 8000, time: 2400, hr: 150 } });
  assert.equal(fast[1].tone, "");
  // Kraft ohne Distanz: nur Puls, Anstrengung, Dauer
  assert.deepEqual(compareToPrev({ act: { group: "strength", time: 3000, hr: 120 }, rpe: 7 }, { act: { group: "strength", time: 3300, hr: 122 }, rpe: 7 }).map((x) => x.k), ["Ø Puls", "Anstrengung", "Dauer"]);
  assert.deepEqual(compareToPrev(cur, null), []);
});

/* ---------- Phasen-Trennung, Kennzahlen, Quelle ---------- */
import { splitPhases, phaseStats, workDash, sourceInfo } from "../src/session-dash.js";

// Stationstag wie ihn s7Steps liefert: Einlaufen, Referenzkilometer, 4× (Station → Lauf → Pause), Auslaufen
const SP = [{ kind: "warm", name: "1 km", goal: 360 }, { kind: "run", name: "1 km Referenz", goal: 245 }];
const STATIONS = ["Ski", "Sled Push", "Burpees", "Rudern"];
for (const s of STATIONS) SP.push({ kind: "station", name: s, goal: 80 }, { kind: "run", name: "1 km", goal: 255 }, { kind: "rest", name: "Erholen", goal: 120 });
SP.push({ kind: "cool", name: "1 km", goal: 420 });
const mk = (d, t, hr) => ({ d, t, hr });
const LAPS = [mk(1000, 360, 118), mk(1000, 245, 158)];
[[84, 166, 262, 170, 118], [78, 171, 266, 174, 122], [90, 174, 270, 176, 125], [82, 177, 278, 178, 130]].forEach(([st, sh, rt, rh, ph]) => LAPS.push(mk(50, st, sh), mk(1000, rt, rh), mk(0, 120, ph + 12)));
LAPS.push(mk(1000, 430, 125));

test("splitPhases (Stationstag): Arbeit, Pause, Ein-/Auslaufen sauber getrennt", () => {
  const ph = splitPhases(LAPS, { steps: SP });
  assert.equal(ph.conf, "sure");
  assert.equal(ph.mode, "direct");
  assert.equal(ph.phase[0], "warm");
  assert.equal(ph.phase[1], "work");
  assert.deepEqual(ph.phase.slice(2, 5), ["work", "work", "rest"]);
  assert.equal(ph.phase[ph.phase.length - 1], "cool");
  assert.equal(ph.phase.filter((p) => p === "rest").length, 4);
});

test("phaseStats: Ø-Puls nur über Arbeit, nicht über das ganze Training", () => {
  const st = phaseStats(splitPhases(LAPS, { steps: SP }), { steps: SP, maxHr: 190 });
  assert.ok(st.work.hr > 160 && st.work.hr < 175, "Arbeits-Ø " + st.work.hr);
  assert.ok(st.total.hr < st.work.hr - 8, `Gesamt-Ø ${st.total.hr} muss durch Pausen deutlich unter Arbeit ${st.work.hr} liegen`);
  assert.equal(st.work.peak, 178);
  assert.equal(st.n.work, 1 + 8);
  assert.equal(st.time.rest, 480);
  assert.equal(st.time.warm, 360);
});

test("phaseStats: Drift, Streuung, Erholung, Kompromiss-Delta, Plan gegen Ist", () => {
  const st = phaseStats(splitPhases(LAPS, { steps: SP }), { steps: SP, maxHr: 190 });
  // Drift: Läufe (inkl. Referenz) 158,170,174,176,178 -> erstes Drittel (1) 158, letztes 178
  assert.equal(st.drift.from, 158);
  assert.equal(st.drift.to, 178);
  assert.equal(st.drift.bpm, 20);
  // Streuung der Arbeitsläufe: 245 … 278 s/km
  assert.equal(st.spread.range, 33);
  // Erholung: Puls der Arbeitsrunde davor minus Puls in der Pause (170−130 … 178−142)
  assert.equal(st.recovery.n, 4);
  assert.equal(st.recovery.drop, Math.round((170 - 130 + 174 - 134 + 176 - 137 + 178 - 142) / 4));
  // Kompromiss: Referenz 245, Läufe nach Station 262/266/270/278 -> Ø +21,5
  assert.equal(st.compromise.ref, 245);
  assert.equal(st.compromise.avg, Math.round((17 + 21 + 25 + 33) / 4));
  assert.equal(st.compromise.worst.after, "Rudern");
  assert.equal(st.compromise.worst.delta, 33);
  assert.deepEqual(st.compromise.list.map((x) => x.delta), [17, 21, 25, 33], "Delta je Station für das Dashboard");
  // Plan gegen Ist: Referenz 245 ≤ 245 im Ziel, Stationen 84/78/90/82 gegen 80
  assert.equal(st.plan.n, 9);
  assert.equal(st.plan.rows.find((r) => r.name === "Sled Push").diff, -2);
  assert.ok(st.zones.reduce((s, z) => s + z.pct, 0) >= 99);
});

test("workDash: höchstens 6 Hauptkennzahlen, Gesamtwerte klein beschriftet, jede Detail-Auswertung mit Erklärung", () => {
  const d = workDash(phaseStats(splitPhases(LAPS, { steps: SP }), { steps: SP, maxHr: 190 }));
  assert.ok(d.main.length >= 4 && d.main.length <= 6);
  assert.match(d.totals, /^Ganzes Training inkl\. Pausen: Ø Puls \d+/);
  assert.ok(d.details.length >= 4);
  for (const x of d.details) assert.ok(x.why.length > 20, x.k);
  assert.equal(d.warn, "");
});

test("splitPhases: passt die Rundenzahl nicht zum Plan, wird nichts geraten", () => {
  const ph = splitPhases(LAPS.slice(0, 12), { steps: SP });
  assert.equal(ph.conf, "none");
  assert.match(ph.note, /passen nicht/);
  const st = phaseStats(ph, { steps: SP });
  assert.equal(st.work, null);
  const d = workDash(st);
  assert.deepEqual(d.main, []);
  assert.ok(d.warn);
  assert.ok(d.totals.includes("Ø Puls"), "Gesamtwerte bleiben sichtbar");
});

test("splitPhases: Pausen wechseln mit Arbeit ab (Lap nach Satz und nach Pause) -> wahrscheinlich, mit Hinweis", () => {
  const steps = [{ kind: "station", name: "Ski" }, { kind: "rest" }, { kind: "station", name: "Rudern" }, { kind: "rest" }, { kind: "station", name: "Sled" }];
  const laps = [mk(250, 70, 160), mk(0, 60, 130), mk(250, 75, 165), mk(0, 60, 132), mk(50, 80, 168)];
  const ph = splitPhases(laps, { steps });
  assert.equal(ph.mode, "direct"); // gleiche Rundenzahl wie Schritte
  const alt = splitPhases(laps.slice(0, 5), { steps: [{ kind: "station", name: "A" }, { kind: "station", name: "B" }, { kind: "station", name: "C" }] });
  assert.equal(alt.mode, "alt");
  assert.equal(alt.conf, "likely");
  assert.deepEqual(alt.phase, ["work", "rest", "work", "rest", "work"]);
  assert.match(alt.note, /wechseln sich/);
});

test("splitPhases (Intervalle 5×1 km): Einlaufen, Pausen und Auslaufen fallen aus den Arbeitswerten", () => {
  const laps = [mk(1500, 540, 120), mk(1000, 245, 160), mk(300, 90, 140), mk(1000, 243, 168), mk(300, 90, 148), mk(1000, 244, 172), mk(300, 90, 150), mk(1000, 246, 175), mk(300, 90, 152), mk(1000, 250, 178), mk(1200, 480, 125)];
  const ph = splitPhases(laps, { planText: "5×1 km @ S, 90″ Trabpause" });
  assert.equal(ph.conf, "sure");
  assert.equal(ph.phase.filter((p) => p === "work").length, 5);
  assert.equal(ph.phase[0], "warm");
  assert.equal(ph.phase[10], "cool");
  const st = phaseStats(ph);
  assert.equal(st.work.hr, Math.round((160 + 168 + 172 + 175 + 178) / 5));
  assert.ok(st.total.hr < st.work.hr - 10);
  assert.equal(Math.round(st.work.pace), Math.round((245 + 243 + 244 + 246 + 250) / 5));
  assert.equal(st.drift.bpm, 18);
  assert.equal(st.recovery.n, 4);
  assert.equal(st.compromise, null, "ohne Stationen kein Kompromiss-Delta");
});

test("splitPhases: gleichmässiger Lauf = alles Arbeit; bei Plan mit Intervallen aber ohne Tempowechsel: unsicher", () => {
  const laps = [1, 2, 3, 4, 5].map((k) => mk(1000, 330 + k, 140 + k));
  const a = splitPhases(laps, { planText: "Lockerer Lauf 40′" });
  assert.equal(a.conf, "sure");
  assert.ok(a.phase.every((p) => p === "work"));
  const b = splitPhases(laps, { planText: "4×1 km @ S" });
  assert.equal(b.conf, "unsure");
  assert.match(b.note, /gleichen Tempo/);
});

test("splitPhases: ohne Runden oder ohne Distanz keine Phasen", () => {
  assert.equal(splitPhases([], {}).conf, "none");
  assert.equal(splitPhases([mk(0, 600, 120), mk(0, 300, 130)], {}).conf, "none");
});

test("phaseStats: nur berechnen, was die Daten hergeben (kein Puls -> keine Pulswerte)", () => {
  const laps = [1, 2, 3, 4].map(() => ({ d: 1000, t: 300, hr: null }));
  const st = phaseStats(splitPhases(laps, {}), {});
  assert.equal(st.work.hr, null);
  assert.equal(st.drift, null);
  assert.equal(st.zones, null);
  assert.equal(st.spread.range, 0);
  assert.deepEqual(workDash(st).main.map((m) => m.k), ["Pace Arbeit", "Arbeitszeit"]);
});

test("sourceInfo: übernommen, teilweise, nicht verbunden, nichts gefunden", () => {
  const act = { src: "garmin", lapsV: 3, hr: 150, got: Date.UTC(2026, 9, 28, 18, 42), laps: [mk(1000, 300, 140), mk(1000, 290, 150)] };
  const ok = sourceInfo(act, { garmin: { on: true } });
  assert.equal(ok.state, "ok");
  assert.equal(ok.head, "Von Garmin übernommen");
  assert.ok(ok.lines.some((l) => /^Übernommen am/.test(l.txt)));
  assert.ok(ok.lines.some((l) => l.txt === "2 Runden"));
  assert.ok(ok.refetch);

  const noHr = sourceInfo({ src: "garmin", lapsV: 3, laps: [mk(1000, 300, null)] }, { garmin: { on: true } });
  assert.equal(noHr.state, "partial");
  assert.ok(noHr.lines.some((l) => l.st === "bad" && /Kein Puls/.test(l.txt)));
  const noLaps = sourceInfo({ src: "garmin", lapsV: 3, hr: 140 }, { garmin: { on: true } });
  assert.equal(noLaps.state, "partial");
  assert.ok(noLaps.lines.some((l) => /Keine Runden/.test(l.txt)));
  const wait = sourceInfo({ src: "garmin", hr: 140 }, { garmin: { on: true } });
  assert.ok(wait.lines.some((l) => /nächsten Abruf/.test(l.txt)));

  const off = sourceInfo(null, { garmin: { on: false }, strava: { on: false }, dayLabel: "Di 27.10." });
  assert.equal(off.state, "none");
  assert.match(off.lines[0].txt, /nicht verbunden/);
  assert.equal(off.refetch, false);
  const none = sourceInfo(null, { garmin: { on: true, at: Date.UTC(2026, 9, 28, 8, 0) }, strava: { on: false }, dayLabel: "Di 27.10." });
  assert.match(none.lines[0].txt, /am Di 27\.10\. keine passende Aktivität/);
  assert.equal(none.refetch, true);
  assert.match(sourceInfo(null, { garmin: { on: true, err: "relogin" } }).lines[0].txt, /Zugang abgelehnt/);
});

test("compareToPrev: mit Arbeitswerten auf beiden Seiten wird nur die Arbeit verglichen", () => {
  const cur = { act: { group: "run", dist: 8000, time: 2400, hr: 140 }, rpe: 6, work: { hr: 168, pace: 250 } };
  const prev = { act: { group: "run", dist: 8000, time: 2400, hr: 150 }, rpe: 6, work: { hr: 172, pace: 258 } };
  const r = compareToPrev(cur, prev);
  assert.deepEqual(r.slice(0, 2).map((x) => x.k), ["Pace Arbeit", "Ø Puls Arbeit"]);
  assert.equal(r[0].v, "−8 s/km");
  assert.equal(r[1].v, "−4 bpm");
  // Nur eine Seite mit Arbeitswerten: Gesamtwerte wie bisher
  const mixed = compareToPrev(cur, { act: prev.act, rpe: 6 });
  assert.equal(mixed[1].k, "Ø Puls");
});

test("sessionDash: mit erkannten Phasen keine Gesamt-Kacheln, Rundenbalken tragen die Phase", () => {
  const ph = splitPhases(LAPS, { steps: SP });
  const act = { time: 3000, dist: 8000, hr: 150, group: "run", laps: LAPS };
  const d = sessionDash(q, act, null, ph);
  assert.ok(!d.tiles.some((t) => t.k === "Ø Puls" || t.k === "Dauer"));
  assert.equal(d.laps[0].phase, "warm");
  assert.equal(d.laps[4].phase, "rest");
  const plain = sessionDash(q, act, null, splitPhases(LAPS.slice(0, 12), { steps: SP }));
  assert.ok(plain.tiles.some((t) => t.k === "Ø Puls"));
});

test("workDash: gleichmässiger Lauf warnt, dass Ein-/Auslaufen nicht abgetrennt ist; Erholung zeigt auch steigenden Puls", () => {
  const laps = [330, 320, 315, 312, 318, 340].map((t, k) => mk(1000, t, 120 + k * 6));
  const d = workDash(phaseStats(splitPhases(laps, { planText: "Lockerer Lauf 40′" }), {}));
  assert.match(d.warn, /nicht abgetrennt/);
  const iv = [mk(1000, 240, 150), mk(200, 90, 160), mk(1000, 240, 160), mk(200, 90, 165), mk(1000, 240, 170)];
  const dd = workDash(phaseStats(splitPhases(iv, { planText: "3×1 km" }), {}));
  assert.ok(dd.details.some((x) => x.k.startsWith("Erholung") && x.v.startsWith("+")), JSON.stringify(dd.details.map((x) => x.v)));
});

test("dashV3 Stationstag: Kompromiss-Delta, Delta je Station, Hinweis auf 1 Referenz-km", () => {
  const ph = splitPhases(LAPS, { steps: SP }), st = phaseStats(ph, { steps: SP, maxHr: 190 });
  const d = dashV3({ kind: "station", act: { laps: LAPS }, ph, st, facts: {}, prev: null });
  assert.equal(d.tiles[0].k, "Kompromiss-Delta");
  assert.equal(d.tiles[0].v, "+24 s/km");
  assert.deepEqual(d.stations.map((x) => x.delta), [17, 21, 25, 33]);
  assert.match(d.hint, /1 km/);
  assert.match(d.an.bad[0].t, /Rudern/);
  assert.ok(!JSON.stringify(d).match(/Anstrengung|RPE/));
});
