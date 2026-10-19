import { test } from "node:test";
import assert from "node:assert/strict";
import { buildForecast, resolveRuns, calibrateK, K, STALE_DAYS, delta } from "../src/forecast.js";

const t = (s) => { const [m, x] = s.split(":"); return +m * 60 + +x; };
// Echte Werte vom 13.10.2026 (Pacing-Test GPS-geprüft, Stationen-Benchmark mit Renngewichten)
const JAIME = { lauf: ["3:53", "3:58", "3:55", "4:00"].map(t), st: ["3:57", "2:03", "3:30", "3:12", "3:44", "1:49", "2:25", "5:04"].map(t) };
const JIMOH = { lauf: ["3:53", "3:59", "3:56", "4:00"].map(t), st: ["3:58", "1:56", "3:22", "3:02", "3:37", "1:59", "2:38", "5:00"].map(t) };
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
  const solo = JAIME.st.map((v, r) => (v + JIMOH.st[r]) / 2).reduce((a, b) => a + b, 0);
  assert.equal(Math.round(f.st), Math.round(solo * K.mitte));
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
  const solo = JAIME.st.map((v, r) => (v + JIMOH.st[r]) / 2).reduce((a, b) => a + b, 0);
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
  assert.deepEqual(calibrateK([{ intensity: 0.9, stations: 1200 }], null), { k: null, floor: null, n: 0 });
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
  assert.ok(d.st > 0 && d.total === d.run + d.st + d.rox);
  assert.equal(delta(null, a), null);
});
