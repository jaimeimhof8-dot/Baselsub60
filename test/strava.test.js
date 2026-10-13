import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeApi, fromCsv, csvDate, parseActivities, reconcile, summary, ensureToken, fetchActivities, authUrl } from "../src/strava.js";

const API = [
  { id: 1, name: "Intervalle", sport_type: "Run", start_date_local: "2026-10-13T18:05:00Z", distance: 8200, moving_time: 2460, average_heartrate: 161.4 },
  { id: 2, name: "Zone 2", type: "VirtualRide", start_date_local: "2026-10-14T07:00:00Z", distance: 30000, moving_time: 3600, average_watts: 182 },
  { id: 3, name: "Lauf am Ruhetag", sport_type: "Run", start_date_local: "2026-10-16T07:00:00Z", distance: 5000, moving_time: 1500 }
];

test("API-Aktivität normalisieren", () => {
  const a = normalizeApi(API[0]);
  assert.deepEqual(a, { id: "1", name: "Intervalle", type: "Run", group: "run", date: "2026-10-13", start: "2026-10-13T18:05", dist: 8200, time: 2460, hr: 161, watts: null });
  assert.equal(normalizeApi(API[1]).group, "ride");
});

test("Datumsformate aus dem Export", () => {
  assert.equal(csvDate("Oct 12, 2026, 6:01:02 PM"), "2026-10-12");
  assert.equal(csvDate("12.10.2026, 18:01:02"), "2026-10-12");
  assert.equal(csvDate("2026-10-12 18:01:02"), "2026-10-12");
  assert.equal(csvDate("3. Okt. 2026, 18:01"), "2026-10-03");
  assert.equal(csvDate("Unsinn"), null);
});

test("CSV-Export (englisch, mit Anführungszeichen und doppelter Distance-Spalte)", () => {
  const csv = 'Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Max Heart Rate,Moving Time,Distance,Average Heart Rate\n' +
    '111,"Oct 13, 2026, 6:05:00 PM","Intervall, hart",Run,,2600,8.20,180,2460,8200.0,161.2\n' +
    '112,"Oct 14, 2026, 7:00:00 AM",Zone 2,Ride,"",3700,30.05,,3600,30050.0,\n';
  const a = fromCsv(csv);
  assert.equal(a.length, 2);
  assert.equal(a[0].name, "Intervall, hart");
  assert.equal(a[0].dist, 8200); assert.equal(a[0].time, 2460); assert.equal(a[0].hr, 161);
  assert.equal(a[1].group, "ride"); assert.equal(a[1].hr, null);
});

test("CSV deutsch", () => {
  const csv = "Aktivitäts-ID,Datum der Aktivität,Name der Aktivität,Aktivitätsart,Verstrichene Zeit,Distanz\n5,\"13.10.2026, 18:05:00\",Lauf,Lauf,1800,\"6,1\"\n";
  const a = fromCsv(csv);
  assert.equal(a[0].date, "2026-10-13"); assert.equal(a[0].group, "run"); assert.equal(a[0].dist, 6100);
});

test("unbekanntes CSV wirft verständlichen Fehler", () => {
  assert.throws(() => fromCsv("a,b\n1,2"), /Unbekanntes CSV-Format/);
});

test("parseActivities erkennt JSON und CSV", () => {
  assert.equal(parseActivities(JSON.stringify(API)).length, 3);
  assert.equal(parseActivities(JSON.stringify({ activities: API })).length, 3);
});

test("summary", () => {
  assert.equal(summary(normalizeApi(API[0])), "Lauf · 8,2 km · 41:00 · 5:00/km · Ø 161 bpm");
  assert.equal(summary(normalizeApi(API[1])), "Rad · 30,0 km · 1:00:00 · 182 W");
});

test("reconcile: passend, verschoben, unpassend", () => {
  // Woche 1 ab 12.10.: Mo Kraft(0) Di Lauf(1) Mi Bike(2) Do Station(3) Fr Ruhe(4) Sa Bike(5) So Ruhe(6)
  const K = ["kraft", "lauf", "bike", "station", "rest", "bike", "rest"];
  const idxOf = (d) => Math.round((new Date(d + "T00:00:00") - new Date(2026, 9, 12)) / 864e5);
  const r = reconcile(API.map(normalizeApi), { plan: (i) => ({ k: K[i % 7] }), idxOf, done: () => false, last: 125 });
  assert.deepEqual(r.byDay[1], { acts: ["1"], match: true });
  assert.deepEqual(r.byDay[2], { acts: ["2"], match: true });
  assert.equal(r.byDay[4].match, false);
  // Lauf am Fr (4) passt zur offenen Station am Do (3)
  assert.deepEqual(r.moved, [{ from: 3, to: 4, act: { id: "3", label: "Lauf" } }]);
});

test("Token-Refresh nur kurz vor Ablauf", async () => {
  let calls = 0;
  const f = async () => { calls++; return { ok: true, json: async () => ({ access_token: "new", refresh_token: "r2", expires_at: 9999999999 }) }; };
  const tok = { access: "a", refresh: "r", expires: 2000, athlete: "Jaime" };
  assert.equal(await ensureToken(f, tok, { clientId: 1, secret: "s", now: 1000 * 1000 }), tok);
  const n = await ensureToken(f, tok, { clientId: 1, secret: "s", now: 1999 * 1000 });
  assert.equal(n.access, "new"); assert.equal(n.athlete, "Jaime"); assert.equal(calls, 1);
});

test("fetchActivities: Seiten und Fehler", async () => {
  const page = (n) => Array.from({ length: n }, (_, j) => ({ ...API[0], id: j }));
  let p = 0;
  const f = async () => ({ ok: true, status: 200, json: async () => (++p === 1 ? page(100) : page(3)) });
  assert.equal((await fetchActivities(f, "x", 0)).length, 103);
  await assert.rejects(fetchActivities(async () => ({ ok: false, status: 429 }), "x", 0), /Limit/);
});

test("authUrl", () => {
  const u = new URL(authUrl("123", "https://x.github.io/app/"));
  assert.equal(u.searchParams.get("scope"), "activity:read_all");
  assert.equal(u.searchParams.get("state"), "hx-strava");
});
