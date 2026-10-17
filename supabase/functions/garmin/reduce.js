// Garmin-Antworten auf das kompakte App-Format reduzieren. Reines JS ohne Deno/DOM:
// läuft in der Edge Function "garmin" und in den Node-Tests (test/garmin.test.js).

/** Garmin activityType.typeKey -> Strava-Typname + Sportgruppe der App (siehe src/strava.js SPORT). */
const TYPES = [
  [/^(running|street_running|track_running|treadmill_running|indoor_running|trail_running|virtual_run|obstacle_run|ultra_run)$/, "Run", "run"],
  [/(cycling|biking|gravel|bmx|e_bike|virtual_ride|spinning)/, "Ride", "ride"],
  [/rowing/, "Rowing", "row"],
  [/(cross_country|skate_ski|classic_ski|backcountry|skiing)/, "NordicSki", "ski"],
  [/^(strength_training|indoor_cardio|hiit|fitness_equipment|elliptical|stair_climbing|floor_climbing|pilates|bouldering|indoor_climbing|crossfit|mobility|training|other_fitness)$/, "Workout", "strength"],
];
export function typeOf(typeKey) {
  const k = String(typeKey || "").toLowerCase();
  if (k === "strength_training") return { type: "WeightTraining", group: "strength" };
  for (const [re, type, group] of TYPES) if (re.test(k)) return { type, group };
  return { type: k || "other", group: "other" };
}

const day = (s) => { const m = String(s || "").match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; };
const round = (v) => (v == null || isNaN(+v) ? null : Math.round(+v));

/** Eine Aktivität aus /activitylist-service/activities/search/activities -> {id, name, type, group, date, start, dist, time, hr, watts, src} */
export function normalizeAct(g) {
  const t = typeOf(g.activityType && g.activityType.typeKey);
  const local = String(g.startTimeLocal || g.startTimeGMT || "").replace(" ", "T");
  return {
    id: "g" + g.activityId, name: g.activityName || "", type: t.type, group: t.group,
    date: day(local), start: local.slice(0, 16) || null,
    dist: Math.round(+g.distance || 0), time: Math.round(+g.movingDuration || +g.duration || 0),
    hr: g.averageHR ? Math.round(g.averageHR) : null, watts: g.avgPower ? Math.round(g.avgPower) : null, src: "garmin",
  };
}

/** Runden aus /activity-service/activity/{id}/splits -> [{d, t, hr, w}] (gleiches Format wie src/dashboard.js normalizeLaps) */
export function normalizeLaps(raw) {
  const list = (raw && raw.lapDTOs) || [];
  return list.slice(0, 80).map((l) => ({
    d: Math.round(+l.distance || 0), t: Math.round(+l.movingDuration || +l.duration || +l.elapsedDuration || 0),
    hr: Math.round(+l.averageHR || 0) || null, w: Math.round(+l.averagePower || 0) || null,
  })).filter((l) => l.t > 0);
}

/**
 * Erholungswerte pro Tag zusammenführen.
 * raw = {hrv: Antwort von /hrv-service/hrv/daily/{a}/{b}, rhr: Antwort von /userstats-service/wellness/daily/{name},
 *        bb: Liste aus /wellness-service/wellness/bodyBattery/reports/daily, sleep: [dailySleepData pro Tag],
 *        tr: [trainingreadiness pro Tag (Liste oder Objekt)]}
 * -> {"YYYY-MM-DD": {hrv, hrvStatus, sleepScore, sleepH, bb, readiness, rhr}}
 */
export function reduceWell(raw = {}) {
  const out = {};
  const at = (d) => out[d] || (out[d] = {});
  for (const h of (raw.hrv && raw.hrv.hrvSummaries) || []) {
    if (!h || !day(h.calendarDate)) continue;
    const o = at(day(h.calendarDate));
    o.hrv = round(h.lastNightAvg); o.hrvStatus = h.status || null;
  }
  const rhr = (((raw.rhr || {}).allMetrics || {}).metricsMap || {}).WELLNESS_RESTING_HEART_RATE || [];
  for (const r of rhr) if (r && day(r.calendarDate) && r.value != null) at(day(r.calendarDate)).rhr = round(r.value);
  for (const b of raw.bb || []) {
    if (!b || !day(b.date || b.calendarDate)) continue;
    // Werte sind [Zeit, Level] oder (mit Beschreibungsliste) z. B. [Zeit, Status, Level, Version]
    const desc = b.bodyBatteryValueDescriptorDTOList || b.bodyBatteryValueDescriptorsDTOList || [];
    const d = desc.find((x) => /level/i.test(String(x.bodyBatteryValueDescriptorKey || x.key || "")));
    const idx = d && Number.isInteger(d.bodyBatteryValueDescriptorIndex ?? d.index) ? (d.bodyBatteryValueDescriptorIndex ?? d.index) : 1;
    const vals = (b.bodyBatteryValuesArray || []).map((x) => (Array.isArray(x) ? x[idx] : null)).filter((v) => typeof v === "number" && v >= 0 && v <= 100);
    if (vals.length) at(day(b.date || b.calendarDate)).bb = Math.max(...vals);
  }
  for (const s of raw.sleep || []) {
    const d = s && s.dailySleepDTO; if (!d || !day(d.calendarDate) || !d.sleepTimeSeconds) continue;
    const o = at(day(d.calendarDate));
    o.sleepH = Math.round(d.sleepTimeSeconds / 360) / 10;
    const sc = d.sleepScores && d.sleepScores.overall; o.sleepScore = sc && sc.value != null ? round(sc.value) : null;
    // Schlafphasen (Minuten), Zeiten (HH:MM lokal) und Nachtwerte – nur, was Garmin liefert
    const min = (v) => (v == null || isNaN(+v) ? null : Math.round(+v / 60));
    const hhmm = (ts) => { if (ts == null || isNaN(+ts)) return null; const t = new Date(+ts); return String(t.getUTCHours()).padStart(2, "0") + ":" + String(t.getUTCMinutes()).padStart(2, "0"); };
    const extra = {
      deep: min(d.deepSleepSeconds), light: min(d.lightSleepSeconds), rem: min(d.remSleepSeconds), awake: min(d.awakeSleepSeconds),
      bed: hhmm(d.sleepStartTimestampLocal), wake: hhmm(d.sleepEndTimestampLocal),
      resp: d.averageRespirationValue != null ? Math.round(+d.averageRespirationValue * 10) / 10 : null,
      spo2: round(d.averageSpO2Value), sleepStress: d.avgSleepStress != null ? Math.round(+d.avgSleepStress * 10) / 10 : null,
      restless: round(s.restlessMomentsCount),
    };
    for (const [k, v] of Object.entries(extra)) if (v != null) o[k] = v;
  }
  for (const t of raw.tr || []) {
    const list = Array.isArray(t) ? t : t ? [t] : [];
    // Garmin liefert mehrere Werte pro Tag (z. B. nach dem Aufwachen und nach einer Aktivität) – der erste ist der Morgenwert
    const first = list.filter((x) => x && day(x.calendarDate) && x.score != null)
      .sort((a, b) => String(a.timestampLocal || a.timestamp || "").localeCompare(String(b.timestampLocal || b.timestamp || "")))[0];
    if (first) at(day(first.calendarDate)).readiness = round(first.score);
  }
  return out;
}
