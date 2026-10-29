import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReps, normalizeLaps, intervals, repSummary, repPaces, paceOf, weekly, barChart, lineChart, pairChart, ringGauge } from "../src/dashboard.js";
import { normalizeLaps as garminLaps } from "../supabase/functions/garmin/reduce.js";
import { mergeActs } from "../src/garmin.js";

// Echte Runden des Pacing-Tests vom 12.10.2026 (Strava): Einlaufen, 4×1 km mit Trabpausen, Auslaufen
const LAPS = [[1000, 300], [1000, 320], [243, 81], [1000, 242], [265, 111], [1000, 250], [128, 109], [1000, 248], [92, 107], [1000, 258], [1000, 526], [925, 360]]
  .map(([d, t]) => ({ d, t, hr: null, w: null }));
const RUN = { id: "1", name: "Thun", group: "run", date: "2026-10-12", dist: 8653, time: 2810, laps: LAPS };

test("Intervall-Vorgabe aus dem Plantext", () => {
  assert.deepEqual(parseReps("4×1km zusammen, RPE 8–9 (kein Sprint), 2′ Trabpause"), { n: 4, dist: 1000 });
  assert.deepEqual(parseReps("6 x 400 m"), { n: 6, dist: 400 });
  assert.deepEqual(parseReps("3×2,5 km"), { n: 3, dist: 2500 });
  assert.equal(parseReps("15′ Einlaufen + Mobility"), null);
  assert.equal(parseReps("3×8 Back Squat"), null);
});

test("Runden aus Strava und Garmin vereinheitlichen", () => {
  assert.deepEqual(normalizeLaps([{ distance: 1000.4, moving_time: 242, elapsed_time: 245, average_heartrate: 178.9, average_watts: 525.7 }]), [{ d: 1000, t: 245, hr: 179, w: 526 }]);
  assert.deepEqual(garminLaps({ lapDTOs: [{ distance: 1000, movingDuration: 241.6, duration: 245, averageHR: 179, averagePower: null }] }), [{ d: 1000, t: 245, hr: 179, w: null }]);
  assert.deepEqual(normalizeLaps(null), []);
});

test("4×1 km mit Plan-Vorgabe: genau die vier Wiederholungen", () => {
  const iv = intervals(LAPS, "4×1km zusammen");
  assert.equal(iv.kind, "intervals");
  assert.deepEqual(iv.work, [3, 5, 7, 9]);
  assert.equal(repSummary(RUN, "4×1km zusammen"), "4×1 km: 4:02 · 4:10 · 4:08 · 4:18 (Ø 4:10/km)");
  assert.deepEqual(repPaces(RUN, "4×1km").map(Math.round), [242, 250, 248, 258]);
});

test("Intervalle auch ohne Plan-Vorgabe erkennen, gleichmässiger Lauf ist keiner", () => {
  assert.deepEqual(intervals(LAPS).work, [3, 5, 7, 9]);
  const steady = [300, 305, 298, 302, 299].map((t) => ({ d: 1000, t }));
  assert.equal(intervals(steady).kind, "steady");
  assert.equal(repSummary({ laps: steady }), "");
  assert.equal(intervals([{ d: 5000, t: 1500 }]).kind, "none");
  // Kurze Intervalle: Zeiten statt Pace
  const short = [[1000, 330], [400, 80], [200, 90], [400, 82], [200, 95], [400, 81], [1000, 340]].map(([d, t]) => ({ d, t }));
  assert.equal(repSummary({ laps: short }, "3×400m"), "3×400 m: 1:20 · 1:22 · 1:21 (Ø 3:23/km)");
});

test("Pace und Wochenwerte", () => {
  assert.equal(paceOf({ d: 1000, t: 242 }), 242);
  assert.equal(paceOf({ d: 50, t: 20 }), null);
  const idx = (iso) => (Date.parse(iso) - Date.parse("2026-10-12")) / 864e5;
  const w = weekly([{ date: "2026-10-12", group: "run", dist: 8653, time: 2810 }, { date: "2026-10-14", group: "ride", dist: 30000, time: 3600 },
    { date: "2026-10-20", group: "run", dist: 5000, time: 1500 }, { date: "2026-10-01", group: "run", dist: 5000, time: 1500 }], idx, 1);
  assert.deepEqual(w, [{ w: 0, min: 107, runKm: 8.7, n: 2 }, { w: 1, min: 25, runKm: 5, n: 1 }]);
});

test("Diagramme: SVG mit Hover-Zielen, ohne Daten leer", () => {
  const b = barChart([{ label: "W1", value: 120 }, { label: "W2", value: 0 }], { label: "Zeit" });
  assert.match(b, /^<svg class="viz"/);
  assert.equal((b.match(/data-tip=/g) || []).length, 2);
  assert.match(lineChart([{ label: "1.10.", value: 50 }, { label: "2.10.", value: null }, { label: "3.10.", value: 55 }]), /class="ln" d="M/);
  assert.equal(lineChart([{ label: "x", value: null }]), "");
  assert.equal(pairChart([{ label: "Rep 1", values: [null, null] }]), "");
  assert.match(pairChart([{ label: "Rep 1", values: [242, 250] }], { names: ["Jaime", "Jimoh"] }), /Rep 1 · Jimoh/);
  // Texte werden escaped
  assert.ok(!barChart([{ label: "<b>", value: 1 }]).includes("<b>"));
});

test("Runden bleiben erhalten, wenn ein neuer Abruf keine mitliefert", () => {
  const store = { "g1": { id: "g1", src: "garmin", group: "run", date: "2026-10-12", laps: LAPS } };
  mergeActs(store, [{ id: "g1", src: "garmin", group: "run", date: "2026-10-12", time: 1800, name: "neu" }]);
  assert.equal(store.g1.name, "neu");
  assert.equal(store.g1.laps.length, 12);
});

test("Ring-Anzeige und Verlaufsfläche", () => {
  const r = ringGauge(75, { label: "Plan", value: "75 %" });
  assert.match(r, /data-pct="75"/);
  assert.match(r, /stroke-dashoffset="81\.7"/);
  assert.match(ringGauge(140), /data-pct="100"/);
  // Leerer Ring: kein Punkt durch das runde Linienende
  assert.match(ringGauge(0), /class="ring-fg" opacity="0"/);
  assert.doesNotMatch(ringGauge(30), /opacity="0"/);
  // Wert mit HTML (Hochzähl-Span): Screenreader-Text ohne Tags
  assert.match(ringGauge(40, { label: "Woche", value: '<span class="cnt">2</span><small>/5</small>' }), /aria-label="Woche: 2\/5"/);
  const l = lineChart([{ label: "a", value: 1 }, { label: "b", value: 2 }, { label: "c", value: null }, { label: "d", value: 3 }]);
  assert.match(l, /class="area"/);
});
