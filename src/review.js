// Wochen-Check: einmal pro Woche ehrlich prüfen, ob du auf Kurs Richtung Sub-60 bist – nicht erst am Race Day.
// Drei Teile: (1) automatische Zahlen der Woche, (2) Rennprognose aus den Tests, (3) eigene Einschätzung.
// Gespeicherte Form (S.review): {wochenIndex: {feel, prog, pain, note, at, level, fc}} – fc = Prognose in Sekunden zum Zeitpunkt des Checks.
// Reine Funktionen, ohne DOM.
import { mmss } from "./util.js";
import { buildForecast, K, DRIFT, levelOf } from "./forecast.js";
import { DOUBLES_SHARE } from "./divisions.js";
export { DOUBLES_SHARE, DRIFT, levelOf, K };

export const GOAL_S = 3600;
/** Obergrenze der mittleren Anstrengung (RPE) je Wochentyp – darüber war die Woche härter als geplant. */
export const RPE_MAX = { Test: 8.5, moderat: 6.5, hart: 7.5, Spitzenreiz: 8.5, Deload: 5.5, Taper: 6 };

export const SELF = {
  feel: { label: "Wie fühlst du dich?", short: "Gefühl", opts: ["gut", "okay", "müde"] },
  prog: { label: "Stärker geworden?", short: "Stärker", opts: ["ja", "etwas", "nein"] }, // kurze Wörter: drei Knöpfe passen auch auf 375 px
  pain: { label: "Schmerzen?", short: "Schmerzen", opts: ["keine", "leicht", "stark"] },
};

const ok = (v) => typeof v === "number" && isFinite(v) && v > 0;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const RANK = { green: 0, yellow: 1, red: 2 };
const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);

/**
 * Zahlen einer Woche bewerten.
 * days: [{t, k, done, skip, rpe, ready}] – nur Tage bis heute; k "rest" zählt nicht
 * load: {runKm, min} diese Woche, prev: [{runKm, min}] Vorwochen (neueste zuletzt)
 * extras: Zusatz-Einheiten der Woche, self: eigene Einschätzung ({feel, prog, pain} als Index 0–2) oder null
 * @returns {level, planned, done, missedKey: [t], avgRpe, rpeMax, reds, yellows, runRamp, extraN, extraMin, notes: [{level, text}], focus: [text]}
 */
export function weekCheck({ days = [], wave = "moderat", load = null, prev = [], extras = [], self = null } = {}) {
  const sessions = days.filter((d) => d && d.k !== "rest");
  const done = sessions.filter((d) => d.done).length;
  const missedKey = sessions.filter((d) => !d.done && ["lauf", "station", "sim", "kraft"].includes(d.k)).map((d) => d.t);
  const rpes = sessions.map((d) => d.rpe).filter((v) => v != null && !isNaN(v)).map(Number);
  const avgRpe = rpes.length ? mean(rpes) : null;
  const rpeMax = RPE_MAX[wave] ?? 7.5;
  const reds = days.filter((d) => d && d.ready === "red").length;
  const yellows = days.filter((d) => d && d.ready === "yellow").length;
  const extraMin = extras.reduce((s, e) => s + (e.min || 0), 0);
  const notes = [], focus = [];
  let level = "green";
  const add = (lv, text, f) => { level = worse(level, lv); notes.push({ level: lv, text }); if (f) focus.push(f); };

  const quota = sessions.length ? done / sessions.length : 1;
  if (sessions.length) {
    const txt = `${done} von ${sessions.length} Einheiten erledigt (${Math.round(quota * 100)} %).`;
    if (quota < 0.6) add("red", txt, "Wochenplan realistisch machen: feste Zeiten im Kalender, notfalls mit dem Coach umplanen statt ausfallen lassen.");
    else if (quota < 0.85) add("yellow", txt, "Ausgefallene Einheiten nicht doppelt nachholen – lieber mit „Umplanen“ verschieben und die Woche sauber beenden.");
    else add("green", txt);
  }
  if (missedKey.length >= 2) add("red", `Verpasste Schlüsseleinheiten: ${missedKey.join(", ")}.`, "Schlüsseleinheiten (Lauf, Stationen, Doubles) haben Vorrang – Rad und Zusatz notfalls streichen.");
  else if (missedKey.length === 1) add("yellow", `Verpasst: ${missedKey[0]}.`);

  if (avgRpe != null) {
    const r = avgRpe.toFixed(1).replace(".", ",");
    if (avgRpe > rpeMax + 1) add("red", `Ø Anstrengung ${r} – deutlich härter als für eine ${wave}-Woche vorgesehen (bis ${String(rpeMax).replace(".", ",")}).`, "Lockere Einheiten wirklich locker halten (Zone 2 = du kannst noch sprechen).");
    else if (avgRpe > rpeMax) add("yellow", `Ø Anstrengung ${r} – etwas härter als geplant (bis ${String(rpeMax).replace(".", ",")}).`, "Bei Intervallen das Tempo halten, nicht schneller laufen als vorgegeben.");
    else add("green", `Ø Anstrengung ${r} – passt zur ${wave}-Woche.`);
  } else if (sessions.some((d) => d.done)) notes.push({ level: "yellow", text: "Keine RPE-Werte – nach jedem Training die Anstrengung eintragen, sonst fehlt die Hälfte des Bildes." });

  if (reds >= 2) add("red", `${reds}× Check-in rot.`, "Schlaf und Erholung priorisieren. Bei anhaltend rot: Coach → Verletzt/krank.");
  else if (reds === 1 || yellows >= 3) add("yellow", `Check-ins: ${reds}× rot, ${yellows}× gelb.`);

  let runRamp = null;
  const pr = prev.filter((p) => p && p.runKm > 0).slice(-3);
  if (load && pr.length) {
    const base = mean(pr.map((p) => p.runKm));
    runRamp = base > 0 ? load.runKm / base - 1 : null;
    if (runRamp != null && runRamp > 0.3 && load.runKm >= 10)
      add("yellow", `Laufumfang +${Math.round(runRamp * 100)} % gegenüber den Vorwochen.`, "Laufumfang höchstens ~10–20 % pro Woche steigern (Knie, Achillessehne).");
  }

  if (self) {
    if (self.pain === 2) add("red", "Starke Schmerzen gemeldet.", "Schmerzen abklären lassen und im Coach unter „Verletzt / krank“ eintragen – nicht drüber trainieren.");
    else if (self.pain === 1) add("yellow", "Leichte Schmerzen gemeldet.", "Schmerzstelle beobachten, im Muskelkater-Melder eintragen.");
    if (self.feel === 2 && self.prog === 2) add("yellow", "Müde und schwächer – mögliches Zeichen für zu wenig Erholung.", "Eine Woche lang 8 h Schlaf anpeilen, Zusatz-Einheiten weglassen.");
  }
  if (!focus.length) focus.push(level === "green" ? "Weiter so – Plan wie vorgesehen durchziehen." : "Kleine Stellschraube: die gelben Punkte oben im Blick behalten.");
  return { level, planned: sessions.length, done, missedKey, avgRpe, rpeMax, reds, yellows, runRamp, extraN: extras.length, extraMin, notes, focus: [...new Set(focus)].slice(0, 3) };
}

/** Rennprognose mit Spanne, siehe src/forecast.js (buildForecast). */
export const forecast = (opts) => buildForecast(opts);

/** Rennmodell für unter 60 Minuten (Plan v9): 8 × 1 km in 4:00, Stationen geteilt, Roxzone mit 16 Wechseln */
export const STATIONS = ["SkiErg", "Sled Push", "Sled Pull", "Burpee BJ", "RowErg", "Farmers", "Lunges", "Wall Balls"];
export const RACE_MODEL = { run: 8 * 240, stations: [220, 150, 180, 160, 225, 80, 180, 195], rox: 270 };

/**
 * Prognose Zeile für Zeile gegen das Rennmodell: [{label, est, goal, diff}] + Summe.
 * diff > 0 = langsamer als das Modell. Fehlende Stationswerte bleiben null.
 */
export function breakdown(fc, model = RACE_MODEL) {
  if (!fc) return null;
  const row = (label, est, goal, src = "bench") => ({ label, est, goal, src, diff: est == null ? null : est - goal });
  const rows = [row("Laufen 8 × 1 km", fc.run, model.run)];
  STATIONS.forEach((s, r) => rows.push(row(s, fc.stations ? fc.stations[r] : null, model.stations[r], fc.sources ? fc.sources[r] : "bench")));
  rows.push(row("Roxzone und Wechsel", fc.rox, model.rox));
  const goal = rows.reduce((s, x) => s + x.goal, 0);
  return { rows, est: fc.total, goal, diff: fc.total == null ? null : fc.total - goal };
}

/**
 * Laufumfang der Woche bewerten (Strava/Garmin): gegen den Plan und gegen die Vorwoche.
 * Mehr als 20 % über der Vorwoche oder über dem Plan = gelb (Sehnen brauchen länger als Herz und Lunge).
 */
export function runCheck(km, { plan = null, prev = null } = {}) {
  if (km == null) return null;
  const ramp = prev > 0 ? km / prev - 1 : null;
  let level = "green";
  if ((ramp != null && ramp > 0.2) || (plan && km > plan * 1.2)) level = "yellow";
  if (plan && km < plan * 0.7) level = "yellow";
  return { km, plan, ramp, level };
}

/**
 * Prognose gegen Ziel: {level, gap (s, positiv = zu langsam), perWeek (nötige Verbesserung pro Woche)}.
 * Bis 40 s pro Woche gilt als machbar (gelb), mehr ist unrealistisch (rot).
 */
export function onTrack(total, weeksLeft, goal = GOAL_S) {
  if (!ok(total)) return null;
  const gap = total - goal, perWeek = gap > 0 ? gap / Math.max(1, weeksLeft) : 0;
  const level = gap <= 0 ? "green" : perWeek <= 40 ? "yellow" : "red";
  return { level, gap, perWeek };
}

/** Kurztext, z. B. "62:10 – 2:10 über dem Ziel, ca. 9 s pro Woche aufholen" */
export function trackText(total, t) {
  if (!t) return "";
  if (t.gap <= 0) return `${mmss(total)} – ${mmss(-t.gap)} unter dem Ziel 60:00`;
  return `${mmss(total)} – ${mmss(t.gap)} über dem Ziel, ca. ${Math.ceil(t.perWeek)} s pro Woche aufholen`;
}

/** Eigene Einschätzung prüfen (Index 0–2 je Frage, Notiz max. 300 Zeichen). Ungültiges fällt weg. */
export function cleanSelf(o) {
  const out = {};
  for (const k of Object.keys(SELF)) if ([0, 1, 2].includes(o && o[k])) out[k] = o[k];
  const n = String((o && o.note) || "").trim().slice(0, 300);
  if (n) out.note = n;
  return out;
}

/**
 * Welche Woche soll als Karte auf der Startseite erscheinen? Nur am Wochenende (Sa/So) und – falls dann nicht gemacht –
 * noch in der ersten Sitzung der neuen Woche (firstOpen). Danach verschwindet die Karte, der Check bleibt im Menü.
 */
export function reviewDue(today, reviews, firstOpen = false) {
  const w = Math.floor(today / 7), d = ((today % 7) + 7) % 7;
  const done = (x) => !!(reviews && reviews[x] && reviews[x].at);
  if (d >= 5 && !done(w)) return w;
  if (firstOpen && w > 0 && !done(w - 1)) return w - 1;
  return null;
}
