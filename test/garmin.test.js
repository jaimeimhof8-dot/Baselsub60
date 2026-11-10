import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAct, reduceWell, typeOf } from "../supabase/functions/garmin/reduce.js";
import { readTokenFile, sameAct, mergeActs, recoveryHint, mergeWell, call, loginErrorText, MSG } from "../src/garmin.js";
import { normalizeApi, reconcile } from "../src/strava.js";
import { suggest } from "../src/adapt.js";
import { mergeState } from "../src/merge.js";

// Ausschnitte echter Garmin-Connect-Antworten (Felder wie in python-garminconnect 0.3.x)
const RUN = { activityId: 20567, activityName: "Thun Intervalle", startTimeLocal: "2026-10-12 18:01:02", startTimeGMT: "2026-10-12 16:01:02",
  activityType: { typeKey: "running" }, distance: 8653.3, duration: 2993.1, movingDuration: 2810.4, averageHR: 161.1, avgPower: 390.9 };

test("Garmin-Aktivität normalisieren (gleiche Form wie Strava)", () => {
  assert.deepEqual(normalizeAct(RUN), { id: "g20567", name: "Thun Intervalle", type: "Run", group: "run", date: "2026-10-12",
    start: "2026-10-12T18:01", dist: 8653, time: 2993, hr: 161, maxHr: null, kcal: null, watts: 391, src: "garmin" });
});

test("Garmin-Sportarten auf die Gruppen der App abbilden", () => {
  assert.equal(typeOf("treadmill_running").group, "run");
  assert.equal(typeOf("indoor_cycling").group, "ride");
  assert.equal(typeOf("indoor_rowing").group, "row");
  assert.equal(typeOf("strength_training").type, "WeightTraining");
  assert.equal(typeOf("hiit").group, "strength");
  assert.equal(typeOf("indoor_cardio").group, "strength");
  assert.equal(typeOf("cross_country_skiing_ws").group, "ski");
  assert.equal(typeOf("walking").group, "other");
  assert.equal(typeOf(undefined).group, "other");
});

test("Erholungswerte aus den Garmin-Antworten reduzieren", () => {
  const well = reduceWell({
    hrv: { hrvSummaries: [{ calendarDate: "2026-10-12", lastNightAvg: 61.4, status: "BALANCED" }, { calendarDate: "2026-10-13", lastNightAvg: 44, status: "LOW" }] },
    rhr: { allMetrics: { metricsMap: { WELLNESS_RESTING_HEART_RATE: [{ calendarDate: "2026-10-13", value: 52 }] } } },
    bb: [{ date: "2026-10-13", bodyBatteryValuesArray: [[1, 25], [2, 68], [3, 40]] }],
    sleep: [{ dailySleepDTO: { calendarDate: "2026-10-13", sleepTimeSeconds: 19800, sleepScores: { overall: { value: 58 } } } }, null, {}],
    tr: [[{ calendarDate: "2026-10-13", score: 71, timestampLocal: "2026-10-13T12:00:00" }, { calendarDate: "2026-10-13", score: 34, timestampLocal: "2026-10-13T06:30:00" }], null, { calendarDate: "2026-10-12", score: 80 }],
  });
  assert.deepEqual(well["2026-10-13"], { hrv: 44, hrvStatus: "LOW", rhr: 52, bb: 68, sleepH: 5.5, sleepScore: 58, readiness: 34 });
  assert.deepEqual(well["2026-10-12"], { hrv: 61, hrvStatus: "BALANCED", readiness: 80 });
  assert.deepEqual(reduceWell({}), {});
});

test("Token-Datei prüfen", () => {
  const ok = JSON.stringify({ di_token: "eyJhbGciOi.xxxxx.yyy", di_refresh_token: "refresh-1234567890", di_client_id: "GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2" });
  assert.equal(readTokenFile(ok).di_client_id, "GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2");
  assert.equal(readTokenFile("﻿" + ok).di_refresh_token, "refresh-1234567890");
  assert.throws(() => readTokenFile("kein json"), { code: "bad_tokens" });
  assert.throws(() => readTokenFile(JSON.stringify({ oauth_token: "x", oauth_token_secret: "y" })), /garth/);
  assert.throws(() => readTokenFile(JSON.stringify({ di_token: "kurz" })), { code: "bad_tokens" });
});

test("Dieselbe Einheit aus Strava und Garmin erkennen", () => {
  const g = normalizeAct(RUN);
  const s = normalizeApi({ id: 99, name: "Lauf", sport_type: "Run", start_date_local: "2026-10-12T18:02:00Z", distance: 8650, moving_time: 2815 });
  assert.equal(s.start, "2026-10-12T18:02");
  assert.ok(sameAct(g, s));
  assert.ok(!sameAct(g, { ...s, start: "2026-10-12T19:30" }), "anderer Start = andere Einheit");
  assert.ok(!sameAct(g, { ...s, group: "ride" }));
  assert.ok(!sameAct(g, { ...g, id: "g2" }), "zwei Garmin-Einheiten sind nie Duplikate");
  // CSV-Import ohne Startzeit: über Dauer und Distanz
  assert.ok(sameAct(g, { id: "csv-1", group: "run", date: "2026-10-12", time: 2900, dist: 8600 }));
  assert.ok(!sameAct(g, { id: "csv-2", group: "run", date: "2026-10-12", time: 1500, dist: 5000 }));
});

test("Zusammenführen: Garmin ersetzt die Strava-Kopie, Strava-Kopie kommt nicht zurück", () => {
  const store = {};
  const s = normalizeApi({ id: 99, name: "Lauf", sport_type: "Run", start_date_local: "2026-10-12T18:02:00Z", distance: 8650, moving_time: 2815 });
  const ride = normalizeApi({ id: 100, name: "Rad", sport_type: "Ride", start_date_local: "2026-10-13T07:00:00Z", distance: 30000, moving_time: 3600 });
  assert.equal(mergeActs(store, [s, ride]), 2);
  assert.equal(mergeActs(store, [normalizeAct(RUN)]), 0, "Duplikat zählt nicht als neu");
  assert.deepEqual(Object.keys(store).sort(), ["100", "g20567"]);
  assert.equal(mergeActs(store, [s]), 0);
  assert.deepEqual(Object.keys(store).sort(), ["100", "g20567"]);
  assert.equal(mergeActs(store, [normalizeAct({ ...RUN, activityId: 5, startTimeLocal: "2026-10-01 07:00:00" })], "2026-10-05"), 0, "vor Planstart ignoriert");
  // Abgleich mit dem Plan funktioniert unverändert mit Garmin-Aktivitäten
  const r = reconcile(Object.values(store), { plan: () => ({ k: "lauf" }), idxOf: () => 0, done: () => false, last: 10 });
  assert.equal(r.byDay[0].match, true);
});

test("Erholungs-Ampel", () => {
  assert.deepEqual(recoveryHint(undefined), { level: null, why: [] });
  assert.deepEqual(recoveryHint({ rhr: 50 }), { level: null, why: [] });
  assert.equal(recoveryHint({ readiness: 75, hrvStatus: "BALANCED", sleepH: 7.8, bb: 80 }).level, "gut");
  assert.equal(recoveryHint({ readiness: 55, sleepH: 7.5 }).level, "mittel");
  assert.equal(recoveryHint({ hrvStatus: "UNBALANCED" }).level, "mittel");
  const bad = recoveryHint({ readiness: 34, hrvStatus: "LOW", sleepH: 5.5, bb: 68 });
  assert.equal(bad.level, "schlecht");
  assert.deepEqual(bad.why, ["Readiness 34", "HRV niedrig", "5,5 h Schlaf"]);
});

test("Erholungswerte zusammenführen und begrenzen", () => {
  const m = mergeWell({ "2026-10-12": { hrv: 50, rhr: 52 } }, { "2026-10-12": { hrv: 55 }, "2026-10-13": { bb: 70 } });
  assert.deepEqual(m, { "2026-10-13": { bb: 70 }, "2026-10-12": { hrv: 55, rhr: 52 } });
  const many = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`2026-08-${String(i % 28 + 1).padStart(2, "0")}-${i}`, { bb: i }]));
  assert.equal(Object.keys(mergeWell({}, many, 60)).length, 60);
});

test("Schlechte Garmin-Erholung entlastet die harte Einheit heute – Check-in hat Vorrang", () => {
  const WEEK = [["Kraft 1", "kraft"], ["Intervall", "lauf"], ["Zone 2", "bike"], ["Kraft 2", "station"], ["Ruhetag", "rest"], ["Lange Fahrt", "bike"], ["Ruhetag", "rest"]];
  const plan = (i) => { const [t, k] = WEEK[((i % 7) + 7) % 7]; return { t, k, i: k === "rest" ? [] : [t] }; };
  const base = { today: 8, last: 60, plan, status: () => ({ n: 1, done: 0 }), skipped: () => false, rpe: () => undefined,
    checkin: () => undefined, strava: () => undefined, moved: [], dismissed: {} };
  const bad = { level: "schlecht", why: ["Readiness 30"] };
  const out = suggest({ ...base, recovery: (i) => (i === 8 ? bad : null) });
  const rec = out.find((s) => s.id === "rec:8");
  assert.equal(rec.type, "easy");
  assert.match(rec.why, /Readiness 30/);
  // Grüner Check-in: man fühlt sich gut -> kein Garmin-Vorschlag
  const green = suggest({ ...base, recovery: () => bad, checkin: (i) => (i === 8 ? { sleep: "g", sore: "g", energy: "g", pain: "g" } : undefined) });
  assert.ok(!green.some((s) => s.id === "rec:8"));
  // Mittel, Ruhetag oder ohne Garmin -> nichts
  assert.ok(!suggest({ ...base, recovery: () => ({ level: "mittel", why: [] }) }).some((s) => s.id.startsWith("rec:")));
  assert.ok(!suggest({ ...base, today: 11, recovery: () => bad }).some((s) => s.id.startsWith("rec:")));
  assert.ok(!suggest(base).some((s) => s.id.startsWith("rec:")));
});

test("Sync zwischen Geräten: Erholungswerte beider Seiten bleiben", () => {
  const base = { _t: 1, garmin: { well: { a: { hrv: 1 } }, at: 1 } };
  const local = { _t: 3, garmin: { well: { a: { hrv: 1 }, b: { hrv: 2 } }, at: 3, conn: { name: "J" } } };
  const remote = { _t: 2, garmin: { well: { a: { hrv: 1 }, c: { hrv: 3 } }, at: 2 } };
  const m = mergeState(base, local, remote);
  assert.deepEqual(Object.keys(m.garmin.well).sort(), ["a", "b", "c"]);
  assert.equal(m.garmin.at, 3);
  assert.deepEqual(m.garmin.conn, { name: "J" });
});

test("Server-Fehler werden zu Handlungsanweisungen", async () => {
  const res = (status, body) => ({ status, clone: () => ({ json: async () => body }), json: async () => body });
  await assert.rejects(call(async () => ({ data: null, error: { context: res(401, { error: "relogin" }) } }), {}), { code: "relogin", message: MSG.relogin });
  await assert.rejects(call(async () => ({ data: null, error: { context: res(404, {}) } }), {}), { message: MSG.notDeployed });
  await assert.rejects(call(async () => ({ data: null, error: { context: res(429, { error: "rate" }) } }), {}), { message: MSG.rate });
  await assert.rejects(call(async () => ({}), {}, { online: false }), TypeError);
  assert.deepEqual(await call(async () => ({ data: { ok: true }, error: null }), {}), { ok: true });
});

test("Login-Server-Fehler verständlich", () => {
  assert.equal(loginErrorText(401, "credentials"), MSG.credentials);
  assert.equal(loginErrorText(429, "rate"), MSG.blocked);
  assert.equal(loginErrorText(408, "mfa_timeout"), MSG.mfaTimeout);
  assert.equal(loginErrorText(404, undefined), MSG.noLoginServer);
  assert.equal(loginErrorText(500, undefined), MSG.loginDown);
});

test("Body Battery auch im Format mit Beschreibungsliste", () => {
  const w = reduceWell({ bb: [{ date: "2026-10-13", bodyBatteryValueDescriptorDTOList: [
    { bodyBatteryValueDescriptorIndex: 0, bodyBatteryValueDescriptorKey: "timestamp" },
    { bodyBatteryValueDescriptorIndex: 1, bodyBatteryValueDescriptorKey: "bodyBatteryStatus" },
    { bodyBatteryValueDescriptorIndex: 2, bodyBatteryValueDescriptorKey: "bodyBatteryLevel" },
    { bodyBatteryValueDescriptorIndex: 3, bodyBatteryValueDescriptorKey: "bodyBatteryVersion" }],
    bodyBatteryValuesArray: [[1, "MEASURED", 30, 3.0], [2, "MEASURED", 77, 3.0]] }] });
  assert.equal(w["2026-10-13"].bb, 77);
});

test("Schlaf: Phasen, Zeiten und Nachtwerte, nur wenn vorhanden", () => {
  const well = reduceWell({ sleep: [{ restlessMomentsCount: 41, dailySleepDTO: { calendarDate: "2026-10-16", sleepTimeSeconds: 27000,
    deepSleepSeconds: 5400, lightSleepSeconds: 14400, remSleepSeconds: 7200, awakeSleepSeconds: 900,
    sleepStartTimestampLocal: Date.UTC(2026, 9, 15, 22, 40), sleepEndTimestampLocal: Date.UTC(2026, 9, 16, 6, 25),
    averageRespirationValue: 14.37, averageSpO2Value: 95.6, avgSleepStress: 18.24, sleepScores: { overall: { value: 81 } } } }] });
  assert.deepEqual(well["2026-10-16"], { sleepH: 7.5, sleepScore: 81, deep: 90, light: 240, rem: 120, awake: 15, bed: "22:40", wake: "06:25", resp: 14.4, spo2: 96, sleepStress: 18.2, restless: 41 });
});

test("Eingangsfilter: Walking und Einheiten unter 12 Minuten werden nicht aufgenommen", async () => {
  const { relevant } = await import("../src/ingest.js");
  const { relevant: serverRelevant } = await import("../supabase/functions/garmin/reduce.js");
  const run = { id: "g1", group: "run", date: "2026-10-20", time: 30 * 60 };
  const short = { ...run, id: "g2", time: 5 * 60 };
  const walk = { ...run, id: "g3", group: "other" };
  for (const [a, ok] of [[run, true], [short, false], [walk, false]]) {
    assert.equal(relevant(a), ok);
    assert.equal(serverRelevant(a), ok); // Server und Client müssen gleich entscheiden
  }
  const store = {};
  assert.equal(mergeActs(store, [run, short, walk]), 1);
  assert.deepEqual(Object.keys(store), ["g1"]);
});

test("mergeActs: Übernahme-Zeitpunkt (got) wird gesetzt und bei späteren Abrufen beibehalten", async () => {
  const { mergeActs } = await import("../src/garmin.js");
  const store = {};
  const a = { id: "g1", src: "garmin", date: "2026-10-20", group: "run", time: 2400, dist: 8000, start: "2026-10-20T18:00:00" };
  mergeActs(store, [a], "2026-10-01");
  const first = store.g1.got;
  assert.ok(first > 0);
  mergeActs(store, [{ ...a, laps: [{ d: 1000, t: 300 }], lapsV: 3 }], "2026-10-01");
  assert.equal(store.g1.got, first);
  assert.equal(store.g1.laps.length, 1);
});

import { reduceSeries } from "../supabase/functions/garmin/reduce.js";
test("Zeitreihe: reduziert auf höchstens maxN Punkte, ganze Zahlen, Arrays gleich lang", () => {
  const keys = ["sumDuration", "sumDistance", "directHeartRate", "directSpeed", "directElevation", "directRunCadence"];
  const raw = { metricDescriptors: keys.map((key, metricsIndex) => ({ key, metricsIndex })),
    activityDetailMetrics: Array.from({ length: 1000 }, (_, i) => ({ metrics: [i, i * 3.2, 120 + (i % 50) + 0.4, 3.3, 500.26, 170.2] })) };
  const s = reduceSeries(raw, 600);
  assert.ok(s.n <= 600 && s.n >= 300);
  for (const k of ["t", "d", "hr", "v", "el", "cad"]) { assert.equal(s[k].length, s.n); assert.ok(s[k].every((x) => x == null || Number.isInteger(x))); }
  assert.equal(s.v[0], 330);
  assert.equal(s.el[0], 5003);
  assert.ok(s.t.every((x, i) => i === 0 || x >= s.t[i - 1]));
});

test("Zeitreihe: fehlende Messreihe bleibt null, ohne Daten oder Zeit gibt es null", () => {
  const raw = { metricDescriptors: [{ key: "sumDuration", metricsIndex: 0 }, { key: "directHeartRate", metricsIndex: 1 }],
    activityDetailMetrics: [{ metrics: [0, 100] }, { metrics: [1, null] }, { metrics: [2, 102] }] };
  const s = reduceSeries(raw);
  assert.deepEqual(s.hr, [100, null, 102]);
  assert.deepEqual(s.v, [null, null, null]);
  assert.equal(reduceSeries({ metricDescriptors: [{ key: "directHeartRate", metricsIndex: 0 }], activityDetailMetrics: [{ metrics: [1] }, { metrics: [2] }] }), null);
  assert.equal(reduceSeries(null), null);
  assert.equal(reduceSeries({ metricDescriptors: [{ key: "sumDuration", metricsIndex: 0 }], activityDetailMetrics: [{ metrics: [0] }, { metrics: [1] }] }), null);
});

import { trimSeries } from "../src/garmin.js";
test("Zeitreihen nur für die letzten 30 Aktivitäten, Runden bleiben", () => {
  const store = {};
  for (let i = 0; i < 40; i++) store["g" + i] = { id: "g" + i, date: "2026-10-" + String(1 + (i % 28)).padStart(2, "0"), start: "2026-" + String(1 + Math.floor(i / 28)).padStart(2, "0") + "-" + String(1 + (i % 28)).padStart(2, "0") + "T08:00", laps: [{ d: 1000, t: 250 }], series: { n: 2, t: [0, 1] } };
  const gone = trimSeries(store);
  assert.equal(gone, 10);
  assert.equal(Object.values(store).filter((a) => a.series).length, 30);
  assert.ok(Object.values(store).every((a) => a.laps.length === 1));
  assert.ok(store.g39.series && !store.g0.series, "neueste behalten, älteste verlieren die Reihe");
  assert.equal(trimSeries(store), 0);
});

test("Zeitreihe aus realistischer Garmin-Antwort: Lücken, Pause, Zeitstempel statt Dauer", () => {
  const keys = ["directTimestamp", "sumDistance", "directHeartRate", "directSpeed", "directElevation", "directDoubleCadence"];
  const t0 = 1760000000000;
  const rows = [];
  for (let i = 0; i < 1200; i++) {
    const pause = i >= 600 && i < 660; // Auto-Pause: Tempo 0, Distanz steht
    rows.push({ metrics: [t0 + i * 1000, pause ? 2000 : i * 3.3, i % 97 === 0 ? null : 150 + (i % 30), pause ? 0 : 3.3, 410.5 + Math.sin(i / 50), i % 211 === 0 ? null : 172] });
  }
  const s = reduceSeries({ metricDescriptors: keys.map((key, metricsIndex) => ({ key, metricsIndex })), activityDetailMetrics: rows }, 600);
  assert.ok(s.n <= 600);
  assert.ok(s.t[0] <= 2);
  assert.ok(s.t[s.n - 1] >= 1190);
  assert.ok(s.v.some((v) => v === 0), "Pause bleibt als Tempo 0 sichtbar");
  assert.ok(s.d.every((x, i) => i === 0 || x >= s.d[i - 1]));
  assert.ok(s.hr.every((x) => x === null || (x >= 100 && x <= 200)), "Lücken werden nicht zu 0");
  assert.equal(s.el[0], 4105);
});

test("Zeitreihe: Antwort ohne Felder oder mit falschem Format ergibt null statt Müll", () => {
  assert.equal(reduceSeries({}), null);
  assert.equal(reduceSeries({ metricDescriptors: [], activityDetailMetrics: [] }), null);
  assert.equal(reduceSeries({ metricDescriptors: [{ key: "directHeartRate", metricsIndex: "x" }], activityDetailMetrics: [{ metrics: [1] }, { metrics: [2] }] }), null);
  assert.equal(reduceSeries({ metricDescriptors: [{ key: "sumDuration", metricsIndex: 0 }, { key: "directHeartRate", metricsIndex: 1 }], activityDetailMetrics: [{ metrics: [5, 100] }, { metrics: [3, 101] }] }), null, "Zeit läuft rückwärts");
  assert.equal(reduceSeries({ metricDescriptors: [{ key: "sumDuration", metricsIndex: 0 }, { key: "directHeartRate", metricsIndex: 1 }], activityDetailMetrics: [{ metrics: ["a", "b"] }, { metrics: [null, null] }] }), null);
});

import { mergeActs as mergeActs2 } from "../src/garmin.js";
test("Backfill: nachgeladene Reihe kommt in die vorhandene Aktivität, seriesTried bleibt erhalten", () => {
  const store = { g1: { id: "g1", date: "2026-10-13", group: "run", time: 3000, src: "garmin", laps: [{ d: 1000, t: 250 }], lapsV: 3 } };
  mergeActs2(store, [{ id: "g1", date: "2026-10-13", group: "run", time: 3000, src: "garmin", series: { n: 2, t: [0, 1] } }]);
  assert.ok(store.g1.series && store.g1.laps.length === 1);
  const s2 = { g2: { id: "g2", date: "2026-10-13", group: "run", time: 3000, src: "garmin", seriesTried: 1 } };
  mergeActs2(s2, [{ id: "g2", date: "2026-10-13", group: "run", time: 3000, src: "garmin" }]);
  assert.equal(s2.g2.seriesTried, 1);
});
