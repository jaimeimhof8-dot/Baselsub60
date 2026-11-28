import test from "node:test";
import assert from "node:assert/strict";
import { sessionKind, zoneShare, driftThirds, decoupling, zoneBoundsOf, dataState, anSessionModel, DECOUPLE_WARN } from "../src/an-session.js";

const GB = [114, 141, 157, 167, 175];
const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const series = (n, o = {}) => ({ n, res: 1, t: mk(n, (i) => i), d: mk(n, (i) => i * 3), hr: mk(n, () => 150), v: mk(n, () => 300), el: mk(n, () => 5000), cad: mk(n, () => 170), ...o });

test("sessionKind: Plan und Aktivität bestimmen die Art", () => {
  assert.equal(sessionKind({ k: "bike", t: "Zone 2 Bike", i: ["Bike 45–60′"] }, null), "bike");
  assert.equal(sessionKind({ k: "station", t: "Kraft 2 + Compromised Running", i: ["Compromised Running 2×10′ Zone 3, 2′ Pause, zusammen"] }, null), "compromise");
  assert.equal(sessionKind({ k: "station", t: "Stationen unter Zeitdruck + Compromised Running", i: ["AMRAP"] }, null), "station");
  assert.equal(sessionKind({ k: "station", t: "Hyrox Stationen", i: ["8 Stationen"] }, null), "station");
  assert.equal(sessionKind({ k: "lauf", t: "Tempo", i: ["4×1,5 km @ 4:00/km"] }, null), "interval");
  assert.equal(sessionKind({ k: "lauf", t: "Dauerlauf", i: ["7 km locker"] }, null), "easy");
  assert.equal(sessionKind({ k: "kraft", t: "Kraft 1", i: [] }, null), "strength");
  assert.equal(sessionKind(null, { group: "ride" }), "bike");
  assert.equal(sessionKind(null, { group: "run" }), "easy");
  assert.equal(sessionKind({ k: "rest" }, null), "other");
});

test("zoneBoundsOf: Garmin-Grenzen vor eigener Rechnung, mit Kennzeichnung", () => {
  assert.deepEqual(zoneBoundsOf({ zones: { bounds: GB, secs: [1, 2, 3, 4, 5] } }, 187), { bounds: GB, estimated: false });
  assert.deepEqual(zoneBoundsOf({}, 187), { bounds: [94, 112, 131, 150, 168], estimated: true });
  assert.equal(zoneBoundsOf({}, null), null);
});

test("zoneShare: Anteil der Zeit in Zone 2, Lücken zählen nicht", () => {
  const hr = mk(100, (i) => (i < 40 ? 150 : i < 80 ? 120 : 170));
  const S = series(100, { hr });
  assert.equal(zoneShare(S, GB, 2), 39, "39 von 99 Zeitschritten");
  assert.equal(zoneShare(S, GB, 4), 20);
  assert.equal(zoneShare(series(50, { hr: mk(50, () => null) }), GB, 2), null);
  assert.equal(zoneShare(S, null, 2), null);
});

test("driftThirds: Puls im letzten gegen das erste Drittel", () => {
  const S = series(1200, { hr: mk(1200, (i) => (i < 400 ? 140 : i < 800 ? 145 : 150)) });
  const d = driftThirds(S);
  assert.equal(d.bpm, 10);
  assert.ok(Math.abs(d.pct - (10 / 140) * 100) < 0.5);
  assert.equal(driftThirds(series(200)), null, "unter 6 Minuten");
});

test("decoupling: 0 % bei gleichmässiger Aktivität, positiv wenn der Puls bei gleicher Leistung steigt", () => {
  const flat = series(1800, { pw: mk(1800, () => 200) });
  assert.equal(decoupling(flat, "pw"), 0);
  const drift = series(1800, { pw: mk(1800, () => 200), hr: mk(1800, (i) => (i < 900 ? 140 : 154)) });
  assert.equal(decoupling(drift, "pw"), 9);
  assert.equal(decoupling(series(300, { pw: mk(300, () => 200) }), "pw"), null, "unter 10 Minuten");
  assert.equal(decoupling(series(1800), "pw"), null, "ohne Leistungsreihe");
});

test("dataState: Auflösung, Puls, Zonen und Phasen ehrlich benennen", () => {
  const a = { src: "garmin", laps: [{}, {}, {}] };
  assert.equal(dataState(a, { ...series(100), src: "series" }, { zones: { estimated: false }, conf: "sure" }).text, "Garmin · 3 Runden · 1-s-Daten · Puls lückenlos · Phasen sicher erkannt");
  const low = dataState(a, { ...series(100), src: "series", res: 5 }, {});
  assert.match(low.text, /Auflösung 5 s \(reduziert\)/);
  assert.equal(low.tone, "warn");
  assert.match(dataState(a, { ...series(100), src: "series", hr: mk(100, (i) => (i < 80 ? 150 : null)) }, {}).text, /Puls in 80 % der Zeit/);
  assert.match(dataState(a, { ...series(100), src: "series" }, { zones: { estimated: true } }).text, /Zonen geschätzt/);
  assert.match(dataState(a, { src: "laps", t: [0, 1], hr: [1, 1] }, {}).text, /nur Rundenwerte/);
  assert.equal(dataState(null, null, {}).tone, "warn");
});

test("anSessionModel easy: Zone-2-Anteil, Pace, Drift, Garmin-Zahlen", () => {
  const act = { src: "garmin", group: "run", time: 1800, dist: 5000, hr: 148, te: { a: 2.4, n: 0 }, load: 90, zones: { bounds: GB, secs: [0, 0, 0, 0, 0] }, series: { n: 1800, res: 1, t: mk(1800, (i) => i), d: mk(1800, (i) => i * 3), hr: mk(1800, () => 148), v: mk(1800, () => 278), el: mk(1800, () => 5000), cad: mk(1800, () => 168) } };
  const m = anSessionModel({ kind: "easy", act, zone2: true });
  assert.equal(m.headline.big, "100 %");
  assert.equal(m.headline.label, "der Zeit in Zone 2");
  assert.deepEqual(m.headline.status, { text: "im Zone-2-Bereich", tone: "ok" });
  assert.deepEqual(m.numbers.map((n) => n.k), ["Ø Pace", "Puls Ø", "Puls-Drift"]);
  assert.equal(m.numbers[0].v, "6:00");
  assert.deepEqual(m.garmin, [{ k: "Effekt aerob", v: "2,4" }, { k: "Belastung", v: "90" }], "Effekt anaerob 0 heisst keine Messung und fehlt");
  assert.deepEqual(m.tabs, ["Kilometer", "Zonen", "Vorher", "Mehr"]);
  assert.deepEqual(m.chart.defaults, ["pace", "hr", "el"]);
  assert.deepEqual(m.chart.zoneBand, { lo: 141, hi: 157, label: "Zone 2" });
  const hot = anSessionModel({ kind: "easy", act: { ...act, hr: 160 }, zone2: true });
  assert.equal(hot.headline.status.tone, "warn");
});

test("anSessionModel bike: Leistung, Entkopplung, Diagramme mit Leistung zuerst; ohne Leistung eine leere Kachel mit Grund", () => {
  const S = { n: 1800, res: 1, t: mk(1800, (i) => i), d: mk(1800, (i) => i * 8), hr: mk(1800, (i) => (i < 900 ? 140 : 154)), v: mk(1800, () => 800), el: mk(1800, () => null), cad: mk(1800, () => 88), pw: mk(1800, () => 200) };
  const m = anSessionModel({ kind: "bike", act: { src: "garmin", group: "ride", time: 1800, hr: 147, watts: 200, series: S, zones: { bounds: GB, secs: [] } }, zone2: true });
  assert.deepEqual(m.numbers.map((n) => n.k), ["Ø Leistung", "Puls Ø", "Entkopplung"]);
  assert.equal(m.numbers[2].v, "+9");
  assert.equal(m.numbers[2].tone, "warn");
  assert.ok(m.numbers[2].tone === "warn" && 9 >= DECOUPLE_WARN);
  assert.deepEqual(m.chart.keys, ["pw", "hr", "spd", "cad"], "Indoor: keine Höhe");
  assert.deepEqual(m.tabs, ["Abschnitte", "Zonen", "Vorher", "Mehr"]);
  const noPw = anSessionModel({ kind: "bike", act: { src: "garmin", group: "ride", time: 1800, hr: 147, series: { ...S, pw: undefined } } });
  assert.equal(noPw.numbers[0].na, true);
  assert.match(noPw.numbers[0].why, /keine Leistung/);
});

test("anSessionModel interval: x von n, Zahlen aus den Arbeitsabschnitten", () => {
  const ivs = [{ k: 1, t0: 0, t1: 360, d: 1500, hr: 164 }, { k: 2, t0: 480, t1: 840, d: 1500, hr: 166 }];
  const m = anSessionModel({ kind: "interval", act: { src: "garmin", group: "run", laps: [{}], hr: 150 }, d: { plan: { hit: 1, n: 2, rows: [] } }, ivs, conf: "sure" });
  assert.equal(m.headline.big, "1 von 2");
  assert.deepEqual(m.headline.status, { text: "1 verfehlt", tone: "bad" });
  assert.equal(m.numbers[0].v, "4:00");
  assert.equal(m.numbers[1].v, "165");
  assert.equal(m.numbers[2].v, "+2");
  const none = anSessionModel({ kind: "interval", act: null, d: null, ivs: [] });
  assert.equal(none.numbers[0].na, true);
  assert.equal(none.headline.big, "–");
});

test("anSessionModel compromise: Läufe in Zone 3 gegen die Garmin-Grenzen", () => {
  const ivs = [{ k: 1, t0: 0, t1: 480, d: 1500, hr: 160 }, { k: 2, t0: 600, t1: 1080, d: 1500, hr: 172 }];
  const m = anSessionModel({ kind: "compromise", act: { src: "garmin", group: "run", zones: { bounds: GB, secs: [] } }, d: { tiles: [{ k: "Kompromiss-Delta", v: "+12 s/km" }] }, ivs });
  assert.equal(m.headline.big, "1 von 2");
  assert.equal(m.headline.label, "Läufe in Zone 3");
  assert.equal(m.numbers[2].v, "+12");
  assert.equal(m.numbers[2].unit, "s/km");
});

test("anSessionModel station: Stationen im Ziel, schwächste Station", () => {
  const rows = [{ name: "SkiErg", goal: 240, t: 238, diff: -2 }, { name: "Wall Balls", goal: 200, t: 236, diff: 36 }];
  const m = anSessionModel({ kind: "station", act: { src: "garmin" }, d: { plan: { hit: 1, n: 2, rows }, tiles: [{ k: "Kompromiss-Delta", v: "+12 s/km" }] } });
  assert.equal(m.headline.big, "1 von 2");
  assert.deepEqual(m.numbers.map((n) => n.k), ["Gesamtdauer", "Stationszeit", "Laufzeit", "Kompromiss Ø", "Schwächste"]);
  assert.equal(m.numbers[0].na, true, "ohne Dauer von der Uhr kein erfundener Wert");
  assert.equal(m.numbers[1].v, "7:54");
  assert.equal(m.numbers[2].na, true, "ohne Laufzeilen keine Laufzeit");
  assert.equal(m.numbers[3].tone, "warn");
  assert.equal(m.numbers[4].v, "+36");
  assert.equal(m.worst, "Wall Balls");
  assert.equal(m.chart, null, "ohne Zeitreihe kein Diagramm");
});

test("anSessionModel strength: nur Haken, kein Diagramm", () => {
  const m = anSessionModel({ kind: "strength", act: null, d: null });
  assert.equal(m.chart, null);
  assert.deepEqual(m.tabs, []);
});

import { zoneRows, kmSplits, timeBlocks, elevGain } from "../src/an-session.js";
test("zoneRows: Garmin-Sekunden, Anteile und Zeit unter Zone 1", () => {
  const act = { time: 3222, zones: { bounds: GB, secs: [886, 498, 312, 937, 263] } };
  const z = zoneRows(act, null, 187);
  assert.equal(z.estimated, false);
  assert.deepEqual(z.rows.map((r) => r.label), ["Z5", "Z4", "Z3", "Z2", "Z1", "–"]);
  assert.equal(z.rows[0].secs, 263);
  assert.equal(z.rows[0].sub, "ab 175 bpm");
  assert.equal(z.rows[1].sub, "167 bis 174 bpm");
  assert.equal(z.rows[5].secs, 3222 - (886 + 498 + 312 + 937 + 263), "Rest liegt unter Zone 1");
  const own = zoneRows({ time: 100 }, { t: [0, 50, 100], hr: [150, 150, 150] }, 187);
  assert.equal(own.estimated, true, "ohne Garmin-Zonen gerechnet und so gekennzeichnet");
  assert.equal(zoneRows({ time: 100 }, null, null), null);
});

test("kmSplits: Kilometer-Abschnitte mit Pace und Puls, Rest ab 100 m", () => {
  const n = 1300, S = { t: mk(n, (i) => i), d: mk(n, (i) => i * 4), hr: mk(n, () => 150), cad: mk(n, () => 170) };
  const k = kmSplits(S);
  assert.equal(k.length, 6, "5 volle km und 200 m Rest");
  assert.equal(k[0].pace, 250);
  assert.equal(k[0].hr, 150);
  assert.ok(Math.abs(k[5].d - 200) < 1e-6 || k[5].d > 100);
  assert.deepEqual(kmSplits({ t: [0, 1], d: [null, null] }), []);
});

test("timeBlocks: 10-Minuten-Blöcke mit Leistung, kurzer Rest entfällt", () => {
  const n = 1900, S = { t: mk(n, (i) => i), d: mk(n, (i) => i * 8), hr: mk(n, () => 140), cad: mk(n, () => 88), pw: mk(n, (i) => (i < 600 ? 200 : 220)) };
  const b = timeBlocks(S, 600);
  assert.equal(b.length, 3, "1899 s: zwei volle Blöcke und ein Rest von 699 s");
  assert.equal(Math.round(b[0].pw), 200);
  assert.equal(Math.round(b[1].pw), 220);
  assert.equal(timeBlocks(null).length, 0);
});

test("elevGain: Rauschen unter 2 m zählt nicht", () => {
  assert.deepEqual(elevGain({ el: [5000, 5005, 5000, 5010, 5200, 5100, 5190] }), { up: 29, down: 10 }, "±1 m ignoriert, dann +20 m, −10 m, +9 m");
  assert.equal(elevGain({ el: [null, null] }), null);
});

test("anSessionModel: Puls unter der Zone-2-Untergrenze heisst «unter Zone 2», nicht «im Bereich»", () => {
  const act = { src: "garmin", group: "run", time: 1800, dist: 5000, hr: 130, zones: { bounds: GB, secs: [0, 0, 0, 0, 0] }, series: { n: 600, res: 3, t: mk(600, (i) => i * 3), d: mk(600, (i) => i * 8), hr: mk(600, () => 130), v: mk(600, () => 278), el: mk(600, () => null), cad: mk(600, () => 168) } };
  assert.deepEqual(anSessionModel({ kind: "easy", act, zone2: true }).headline.status, { text: "Puls unter Zone 2", tone: "mu" });
});
