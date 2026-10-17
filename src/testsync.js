// Testwerte aus einer Einheit in Profil → Tests & Benchmarks übernehmen (Pacing-Test, T-Test, Stationen-Benchmark).
// Testtage werden am Flag (eingebauter Plan) oder am Titel erkannt – importierte PDF-Pläne setzen kein Flag.
// Reine Funktionen, ohne DOM.
import { mmss, parseT } from "./util.js";

/** Lauf-Test (4×1 km): Pacing-Test, T-Test, Lauf-Test T */
export const isRunTest = (p) => !!p && p.k === "lauf" && (!!p.test || /pacing.?test|lauf.?test|\bt.?test\b/i.test(p.t || ""));
/** Stationen-Test: Benchmark oder Re-Test mit den acht Stationen */
export const isStationTest = (p) => !!p && p.k === "station" && (!!p.test || /benchmark|re.?test|stationen.?test/i.test(p.t || ""));

/** Reihenfolge wie in S.tests.station (Profil-Tabelle) */
const STATION_RE = [/ski/i, /sled push|schlitten.*schieb/i, /sled pull|schlitten.*zieh/i, /burpee/i, /row/i, /farmer/i, /lunge|sandbag/i, /wall ?ball/i];
export const stationIndex = (text) => STATION_RE.findIndex((re) => re.test(String(text || "")));

/** Alle Zeiten "m:ss" bzw. "mm:ss" in einem Eintrag, als Sekunden ("3:52 3:55, 3:50/3:58" → [232, 235, 230, 238]) */
export const timesIn = (v) => (String(v || "").match(/\b\d{1,2}:[0-5]\d\b/g) || []).map(parseT);

/**
 * Testwerte aus den Einträgen einer Einheit.
 * day = Plan-Einheit {t, k, i, test}, vals = Einträge je Übungszeile (Index wie day.i).
 * @returns null (kein Testtag oder nichts gefunden) oder {lauf?: [4 × "m:ss"|""], station?: {index: "m:ss"}}
 */
export function extractTests(day, vals) {
  if (isRunTest(day)) {
    // Zeile mit der 4×1-km-Vorgabe zuerst, sonst alle Einträge; nur plausible km-Zeiten (2:30–7:00)
    const rows = (day.i || []).map((t, j) => ({ t, v: vals[j] }));
    const main = rows.filter((r) => /4\s*[×x]\s*1\s*km/i.test(r.t));
    const pick = (list) => list.flatMap((r) => timesIn(r.v)).filter((s) => s >= 150 && s <= 420);
    const T = pick(main).length ? pick(main) : pick(rows);
    if (!T.length) return null;
    return { lauf: Array.from({ length: 4 }, (_, x) => (T[x] ? mmss(T[x]) : "")) };
  }
  if (isStationTest(day)) {
    const station = {};
    (day.i || []).forEach((t, j) => {
      const r = stationIndex(t), s = timesIn(vals[j])[0];
      if (r >= 0 && s > 0 && !(r in station)) station[r] = mmss(s);
    });
    return Object.keys(station).length ? { station } : null;
  }
  return null;
}

/**
 * Werte in ein tests-Objekt schreiben (eigene Spalte col). Lauf ersetzt die ganze Reihe, Stationen nur die gefundenen.
 * onlyEmpty: nur leere Felder füllen (z. B. bei Übernahme von Garmin/Strava, Handeinträge haben Vorrang).
 * @returns Anzahl geänderter Felder
 */
export function applyTests(tests, col, found, { onlyEmpty = false } = {}) {
  if (!found) return 0;
  let n = 0;
  const put = (get, set, v) => { const old = String(get() || "").trim(); if (v && old !== v && !(onlyEmpty && old)) { set(v); n++; } };
  if (found.lauf) {
    tests.lauf = tests.lauf || {};
    const L = tests.lauf[col] || (tests.lauf[col] = ["", "", "", ""]);
    found.lauf.forEach((v, x) => put(() => L[x], (y) => (L[x] = y), v));
  }
  if (found.station) {
    tests.station = tests.station || {};
    for (const [r, v] of Object.entries(found.station)) {
      const row = tests.station[r] || (tests.station[r] = {});
      put(() => row[col], (y) => (row[col] = y), v);
    }
  }
  return n;
}
