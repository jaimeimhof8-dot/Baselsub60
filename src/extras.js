// Zusatz-Einheiten: spontane Einheiten neben dem Plan (Zone 2, Mobility, Core …), pro Tag als Liste.
// Gespeicherte Form (S.extra): {"2026-10-14": [{id, type, min, rpe, note}]} – der Plan selbst bleibt unverändert.
// Reine Funktionen, ohne DOM.
import { overloadRisk, overloadText } from "./soreness.js";

/** Arten. run = belastet Sehnen und Gelenke wie ein Lauf (zählt für die Überlastungs-Warnung). */
export const EXTRA_TYPES = {
  z2bike: { label: "Zone 2 Rad" },
  z2run: { label: "Zone 2 Lauf", run: true },
  erg: { label: "Ski/Row Erg" },
  station: { label: "Stationen-Technik" },
  kraft: { label: "Kraft-Zusatz" },
  mobility: { label: "Mobility" },
  core: { label: "Core" },
  other: { label: "Andere" },
};

const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * Eingabe prüfen und als Eintrag zurückgeben, oder null bei ungültiger Eingabe.
 * min: Minuten 1–600 (leer erlaubt, dann ohne Dauer), rpe: Anstrengung 1–10 (leer erlaubt), note: max. 80 Zeichen.
 */
export function makeExtra({ type, min, rpe, note } = {}, id = Date.now().toString(36)) {
  if (!EXTRA_TYPES[type]) return null;
  const raw = String(min ?? "").trim();
  const m = raw === "" ? null : Math.round(+raw.replace(",", "."));
  if (m !== null && !(m >= 1 && m <= 600)) return null;
  const e = { id: String(id), type };
  if (m) e.min = m;
  const r = String(rpe ?? "").trim() === "" ? null : Math.round(+String(rpe).replace(",", "."));
  if (r !== null && !(r >= 1 && r <= 10)) return null;
  if (r) e.rpe = r;
  const n = clip(note, 80);
  if (n) e.note = n;
  return e;
}

/** Neue Liste mit Eintrag (die alte bleibt unverändert). */
export const addExtra = (list, entry) => (entry ? [...(list || []), entry] : list || []);

/** Neue Liste ohne Eintrag id. */
export const removeExtra = (list, id) => (list || []).filter((e) => e.id !== id);

/** Anzeigetext, z. B. "Zone 2 Rad · 45′ · Arbeitsweg". */
export function extraLabel(e) {
  if (!e || !EXTRA_TYPES[e.type]) return "";
  return [EXTRA_TYPES[e.type].label, e.min ? `${e.min}′` : "", e.rpe ? `RPE ${e.rpe}` : "", e.note || ""].filter(Boolean).join(" · ");
}

/** Gesamtminuten einer Liste (Einträge ohne Dauer zählen 0). */
export const extraMinutes = (list) => (list || []).reduce((s, e) => s + (e.min || 0), 0);

/** Nur gültige Einträge (Schutz gegen alte oder fremde Daten aus Sync und Backup). */
export const cleanExtras = (list) => (Array.isArray(list) ? list.filter((e) => e && EXTRA_TYPES[e.type] && e.id) : []);

/**
 * Tag für die Belastungsrechnung: Plan-Einheit plus zusätzliche Läufe.
 * Zusätzliche Läufe belasten Knie und Achillessehne wie ein Lauf, auch an einem Rad- oder Ruhetag.
 * @returns Tag oder null (kein Training)
 */
export function loadDay(day, list) {
  const runs = cleanExtras(list).filter((e) => EXTRA_TYPES[e.type].run).map(extraLabel);
  if (!runs.length) return day || null;
  if (!day || ["rest", "bike"].includes(day.k) || day.inj) return { t: "Zusatz-Einheit", k: "lauf", i: runs };
  return { ...day, i: [...(day.i || []), ...runs] };
}

/**
 * Überlastungsrisiko mit Zusatz-Einheiten – und ob es erst durch sie entsteht (oder schlimmer wird).
 * planAt(d) = Einheit, die an Tag d stattfand/stattfindet (null = keine), extraAt(d) = Zusatz-Liste.
 * @returns {{risk, byExtra: boolean, runs: {d:number,label:string}[]}} runs = Zusatz-Läufe der letzten 7 Tage bis x
 */
export function overloadWithExtras({ day, x, today, soreAt, planAt, extraAt }) {
  const at = (d) => loadDay(planAt(d), extraAt(d));
  const base = day ? overloadRisk(day, x, today, soreAt, planAt) : [];
  const risk = overloadRisk(loadDay(day, extraAt(x)), x, today, soreAt, at);
  const sig = (list) => list.map(overloadText).join("|");
  const byExtra = risk.length > 0 && sig(risk) !== sig(base);
  const runs = [];
  if (byExtra) for (let d = x - 7; d <= x; d++) for (const e of cleanExtras(extraAt(d))) if (EXTRA_TYPES[e.type].run) runs.push({ d, label: extraLabel(e) });
  return { risk, byExtra, runs };
}

/** Zusatz-Einheit als Tag für die Muskel-Zuordnung (Muskelkater-Melder). Mobility belastet nichts. */
export function extraAsDay(e) {
  if (!e || !EXTRA_TYPES[e.type]) return null;
  if (e.type === "z2run") return { t: extraLabel(e), k: "lauf", i: ["Zone 2 Lauf"] };
  if (e.type === "z2bike") return { t: extraLabel(e), k: "bike", i: ["Rad Zone 2"] };
  if (e.type === "core") return { t: extraLabel(e), k: "kraft", i: ["Core"] };
  if (e.type === "erg") return { t: extraLabel(e), k: "station", i: ["SkiErg", "RowErg"] };
  if (e.type === "station") return { t: extraLabel(e), k: "station", i: [e.note || "Wall Balls"] };
  if (e.type === "kraft") return { t: extraLabel(e), k: "kraft", i: [e.note || "Kraft"] };
  return null;
}

const HARD_NEXT = ["lauf", "station", "sim", "race"];

/**
 * Welche Zusatz-Einheit passt heute? Bewusst vorsichtig: der Plan ist die Hauptsache, Zusatz soll ihn nicht stören.
 * day/next = Plan-Einheit heute/morgen (oder null), wave = Wochentyp ("moderat", "Deload", "Taper" …),
 * ready = Check-in-Ampel heute, weekMin = Zusatz-Minuten dieser Woche, runRisk = Überlastung bei einem Zusatz-Lauf.
 * @returns [{type, min, why}] (höchstens 3, die erste ist die Empfehlung)
 */
export function suggestExtras({ day, next, wave = "", ready = null, weekMin = 0, runRisk = false } = {}) {
  const mob = (min, why) => ({ type: "mobility", min, why });
  if (!day || day.inj) return [mob(15, "Heute ohne Plan-Einheit: lockere Mobility hält beweglich.")];
  if (ready === "red") return [mob(15, "Check-in rot: heute nur Mobility, keine zusätzliche Belastung.")];
  if (day.k === "rest") return [mob(15, "Ruhetag: echte Erholung. Höchstens lockere Mobility.")];
  if (/deload|taper/i.test(wave)) return [mob(20, `${wave}-Woche: Erholung ist das Training. Nur Mobility.`), { type: "core", min: 10, why: "Kurzes Core ermüdet kaum." }];
  if (weekMin >= 150) return [mob(15, `Schon ${weekMin}′ Zusatz diese Woche – genug. Nur noch Mobility.`)];
  const out = [];
  const hardTomorrow = next && HARD_NEXT.includes(next.k);
  if (hardTomorrow) out.push(mob(15, `Morgen „${next.t}“: Beine frisch halten.`));
  if (day.k === "kraft") {
    if (!/kein zone.?2/i.test(day.n || "")) out.push({ type: "z2bike", min: 30, why: "Nach Kraft: lockeres Ausfahren, Zone 2." });
    out.push({ type: "core", min: 10, why: "Core stärkt Sandbag Lunges und Wall Balls." });
  } else if (day.k === "bike") {
    out.push({ type: "core", min: 15, why: "Rad belastet den Rumpf kaum – Core passt gut dazu." });
    if (!hardTomorrow) out.push({ type: "station", min: 15, why: "Technik ohne Ermüdung, z. B. Wall Balls oder Burpee Broad Jumps." });
    if (!hardTomorrow && !runRisk) out.push({ type: "z2run", min: 30, why: "Lockerer Lauf statt Rad, wenn die Beine frisch sind." });
  } else if (day.k === "lauf") {
    out.push({ type: "core", min: 10, why: "Core nach dem Lauf, ohne die Beine zu belasten." });
    out.push(mob(15, "Hüfte und Waden lockern nach dem Lauf."));
  } else {
    out.push(mob(20, "Nach Stationen/Simulation: Erholung statt mehr Volumen."));
  }
  const seen = new Set();
  return out.filter((x) => !seen.has(x.type) && seen.add(x.type)).slice(0, 3);
}
