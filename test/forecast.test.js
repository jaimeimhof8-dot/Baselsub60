import { test } from "node:test";
import assert from "node:assert/strict";
import { buildForecast, resolveRuns, calibrateK, K, STALE_DAYS, delta, levelOf, projectRaceDay } from "../src/forecast.js";

const t = (s) => { const [m, x] = s.split(":"); return +m * 60 + +x; };
// Echte Werte vom 13.10.2026 (Pacing-Test GPS-geprüft, Stationen-Benchmark mit Renngewichten)
const JAIME = { lauf: ["3:53", "3:58", "3:55", "4:00"].map(t), st: ["3:57", "2:03", "3:30", "3:12", "3:44", "1:49", "2:25", "5:04"].map(t) };
const JIMOH = { lauf: ["3:53", "3:59", "3:56", "4:00"].map(t), st: ["3:58", "1:56", "3:22", "3:02", "3:37", "1:59", "2:38", "5:00"].map(t) };
const harm = (a, b) => (a + b) / 2; // Mittel der Partner (K ist daran angesetzt)
const SOLO = JAIME.st.map((v, r) => harm(v, JIMOH.st[r])).reduce((a, b) => a + b, 0);
const REAL = { laufPersons: [JAIME.lauf, JIMOH.lauf], station: JAIME.st.map((v, r) => [v, JIMOH.st[r]]) };

test("Eure echten Zahlen: Prognose um 59 Minuten, Spanne unter 7 Minuten, nicht Weltklasse", () => {
  const f = buildForecast(REAL);
  assert.ok(f.total > t("58:00") && f.total < t("60:00"), "Mitte " + f.total);
  assert.ok(f.lo > t("55:30") && f.lo < f.total && f.hi > f.total && f.hi < t("63:30"), `Spanne ${f.lo} bis ${f.hi}`);
  assert.ok(f.hi - f.lo < 7 * 60, "Spanne " + (f.hi - f.lo));
  assert.equal(Math.round(f.run), 2044); // 34:04, Ø 4:16/km
  assert.equal(f.missing, 0);
  assert.equal(f.k, K.mitte);
  assert.equal(f.calibrated, false);
  assert.ok(f.warnings.length === 0);
});

test("Alle Teile sind positiv, die Stationen stimmen mit dem Mittel der Benchmarks mal k", () => {
  const f = buildForecast(REAL);
  assert.ok(f.paces.every((p) => p > 0) && f.stations.every((s) => s > 0));
  assert.equal(Math.round(f.st), Math.round(f.stations.reduce((a, b) => a + b, 0)));
  assert.equal(Math.round(f.st), Math.round(SOLO * K.mitte));
});

test("Uhrfehler: weichen die Partner im selben Test über 2,5 % ab, zählt der schnellere Wert und es gibt eine Warnung", () => {
  const r = resolveRuns([[t("4:10")], [t("3:57")]]);
  assert.deepEqual(r.reps, [t("3:57")]);
  assert.equal(r.mismatch, 1);
  const f = buildForecast({ ...REAL, laufPersons: [[t("4:10"), t("4:09"), t("4:08"), t("4:18")], JIMOH.lauf] });
  assert.ok(f.warnings.some((w) => /Uhren/.test(w)));
  assert.equal(Math.round(f.T), Math.round(JIMOH.lauf.reduce((a, b) => a + b, 0) / 4));
  assert.equal(resolveRuns([[t("3:53")], [t("3:55")]]).mismatch, 0); // kleine Abweichung ist normal
});

test("Simulation ab 85 % eicht k und verengt die Spanne, eine mit 70 % nur die Untergrenze", () => {
  const base = buildForecast(REAL);
  const strong = buildForecast({ ...REAL, sims: [{ intensity: 0.9, stations: t("21:00") }] });
  const solo = SOLO;
  assert.ok(Math.abs(strong.k - 1260 / solo) < 1e-9);
  assert.ok(strong.k > K.mitte); // 21:00 ist langsamer als die Annahme
  assert.equal(strong.calibrated, true);
  assert.ok(strong.hi - strong.lo < base.hi - base.lo, "Spanne wird enger");
  const weak = buildForecast({ ...REAL, sims: [{ intensity: 0.7, stations: t("22:00") }] });
  assert.equal(weak.calibrated, false);
  assert.ok(weak.k >= 1320 / solo - 1e-9 && weak.lo >= base.lo, "70 % zeigt nur, dass es mindestens so langsam ist");
  const quick = buildForecast({ ...REAL, sims: [{ intensity: 0.7, stations: t("15:00") }] });
  assert.equal(quick.k, K.mitte); // eine lockere schnelle Simulation macht die Prognose nicht schneller
});

test("calibrateK braucht alle acht Benchmarks", () => {
  assert.deepEqual(calibrateK([{ intensity: 0.9, stations: 1200 }], null), { k: null, floor: null, n: 0, perStation: null, run: null, rox: null });
  assert.equal(calibrateK([{ intensity: 0.9, stations: 1200 }, { intensity: 0.95, stations: 1000 }], 1500).k, (0.8 + 1000 / 1500) / 2);
});

test("Alter Test macht die Spanne breiter und gibt einen Hinweis", () => {
  const f = buildForecast(REAL), old = buildForecast({ ...REAL, testAgeDays: STALE_DAYS + 5 });
  assert.ok(old.hi - old.lo > f.hi - f.lo);
  assert.ok(old.warnings.some((w) => /Re-Test/.test(w)));
  assert.equal(buildForecast({ ...REAL, testAgeDays: 10 }).warnings.length, 0);
});

test("Ohne Stationswerte: Zeit aus St. Gallen statt 0:00, mit Hinweis", () => {
  const f = buildForecast({ laufPersons: [JAIME.lauf, JIMOH.lauf] });
  assert.equal(Math.round(f.st), 1443);
  assert.equal(f.missing, 8);
  assert.ok(f.warnings.some((w) => /St\. Gallen/.test(w)));
  assert.equal(buildForecast({ laufPersons: [[NaN], []] }), null);
});

test("Veränderung zur Vorwoche", () => {
  const a = buildForecast(REAL), b = buildForecast({ ...REAL, sims: [{ intensity: 0.9, stations: t("23:00") }] });
  const d = delta(b, a);
  assert.ok(d.st > 0 && Math.abs(d.total - (d.run + d.st + d.rox)) < 1e-6);
  assert.equal(delta(null, a), null);
});

test("Niveau ist stetig: 1 s Pace verschiebt die Roxzone nicht um eine Minute", () => {
  for (let b = 235; b < 330; b++) {
    const a = levelOf(b), c = levelOf(b + 1);
    assert.ok(Math.abs(c.rox - a.rox) <= 4.1 && Math.abs(c.fatigue - a.fatigue) <= 0.41, `Sprung bei ${b}: ${a.rox} → ${c.rox}`);
  }
  for (const b of [200, 236, 253, 255]) assert.deepEqual([levelOf(b).fatigue, levelOf(b).rox], [15, 255], "wie vorher bis 4:15 (St. Gallen 4:13)");
  assert.deepEqual([levelOf(270).fatigue, levelOf(270).rox], [20, 315]);
  assert.deepEqual([levelOf(400).fatigue, levelOf(400).rox], [25, 360]); // Rand rechts
});

test("Ungleiche Partner: Mittel wie bisher (keine unbelegte Optimierung)", () => {
  const diff = buildForecast({ laufPersons: [[240], [240]], station: Array.from({ length: 8 }, () => [180, 360]) });
  assert.equal(Math.round(diff.stations[0]), Math.round(270 * K.mitte));
});

const bench = JAIME.st.map((v, r) => harm(v, JIMOH.st[r]));
test("Simulation mit Einzelzeiten eicht je Station, geglättet zum Gesamt-k", () => {
  const parts = bench.map((v) => v * 0.8);
  parts[7] = bench[7] * 1.3; // Wall Balls brechen ein
  const total = parts.reduce((a, b) => a + b, 0);
  const f = buildForecast({ ...REAL, sims: [{ intensity: 0.9, stations: total, parts }] });
  assert.ok(f.perStation && f.perStation.length === 8);
  const kWB = f.perStation[7], kSki = f.perStation[0], kAll = total / bench.reduce((a, b) => a + b, 0);
  assert.ok(kWB > kAll && kSki < kAll, "Wall Balls langsamer, SkiErg schneller als der Schnitt");
  assert.ok(kWB < 1.3, "geglättet: eine Simulation setzt kein Extrem");
  assert.ok(Math.abs(f.perStation[7] - (1.3 + kAll) / 2) < 1e-9, "eine Simulation zählt so viel wie das Gesamt-k");
  assert.ok(Math.abs(f.st - total) < 1, "Die Glättung ändert die Summe nicht: sie bleibt bei der Simulation (" + (f.st - total) + ")");
});

test("Jüngere Simulationen zählen mehr als alte", () => {
  const sims = [{ intensity: 0.9, stations: 1400, ageDays: 63 }, { intensity: 0.9, stations: 1200, ageDays: 0 }];
  const r = calibrateK(sims, 1500);
  const flat = calibrateK(sims.map(({ ageDays, ...x }) => x), 1500);
  assert.ok(r.k < flat.k && r.k > 1200 / 1500, "neue Zeit 1200 zieht stärker: " + r.k + " vs " + flat.k);
});

test("Gemessene Laufzeit und Roxzone aus Simulationen ersetzen das Modell und verengen die Spanne", () => {
  const base = buildForecast(REAL);
  const f = buildForecast({ ...REAL, sims: [{ intensity: 0.9, stations: 1230, run: base.run + 120, rox: 330 }] });
  assert.equal(f.rox, 330);
  assert.ok(f.runCal && f.roxCal);
  assert.ok(Math.abs(f.run - (base.run + 120)) < 1e-6);
  assert.ok(f.hi - f.lo < base.hi - base.lo);
  const silly = buildForecast({ ...REAL, sims: [{ intensity: 0.9, stations: 1230, run: 60, rox: 5 }] }); // Tippfehler
  assert.ok(!silly.runCal && !silly.roxCal);
  const weak = buildForecast({ ...REAL, sims: [{ intensity: 0.7, stations: 1230, run: base.run - 100, rox: 100 }] }); // locker: nicht eichen
  assert.ok(!weak.runCal && !weak.roxCal);
});

test("Prognose für den Renntag: abflachender Trend, kein Wunschdenken", () => {
  const down = [0, 7, 14, 21, 28].map((day, i) => ({ day, total: 3700 - i * 20 })); // 20 s pro Woche schneller
  const p = projectRaceDay(down, 120);
  assert.ok(p.total < 3620 && p.total > 3620 - 120 * 20 / 7, "weniger als linear: " + p.total);
  assert.ok(p.gain > 0 && p.gain <= 3620 * 0.08 && p.lo < p.total && p.hi > p.total);
  assert.ok(Math.abs(p.slopePerWeek + 20) < 1e-9);
  const flat = projectRaceDay([0, 7, 14].map((day) => ({ day, total: 3600 })), 100);
  assert.equal(flat.total, 3600);
  const worse = projectRaceDay([0, 7, 14].map((day, i) => ({ day, total: 3600 + i * 30 })), 100);
  assert.equal(worse.total, 3660); // wird langsamer: nicht schönrechnen
  const outlier = projectRaceDay([{ day: 0, total: 3700 }, { day: 7, total: 3500 }, { day: 14, total: 3680 }, { day: 21, total: 3660 }], 60);
  assert.ok(outlier.slopePerWeek > -30, "ein Ausreisser kippt die Steigung nicht");
  assert.equal(projectRaceDay([{ day: 0, total: 3700 }, { day: 7, total: 3690 }], 50), null); // zu wenig Punkte
  assert.equal(projectRaceDay([0, 3, 6].map((day) => ({ day, total: 3600 })), 50), null); // zu kurzer Zeitraum
  const cap = projectRaceDay([0, 7, 14].map((day, i) => ({ day, total: 3600 - i * 300 })), 400);
  assert.ok(cap.gain <= 3000 * 0.08 + 1e-9, "Deckel");
});
