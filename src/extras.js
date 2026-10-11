// Zusatz-Einheiten: spontane Einheiten neben dem Plan (Zone 2, Mobility, Core …), pro Tag als Liste.
// Gespeicherte Form (S.extra): {"2026-10-14": [{id, type, min, note}]} – der Plan selbst bleibt unverändert.
// Reine Funktionen, ohne DOM.
import { overloadRisk, overloadText } from "./soreness.js";

/** Arten. run = belastet Sehnen und Gelenke wie ein Lauf (zählt für die Überlastungs-Warnung). */
export const EXTRA_TYPES = {
  z2bike: { label: "Zone 2 Rad" },
  z2run: { label: "Zone 2 Lauf", run: true },
  mobility: { label: "Mobility" },
  core: { label: "Core" },
  other: { label: "Andere" },
};

const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * Eingabe prüfen und als Eintrag zurückgeben, oder null bei ungültiger Eingabe.
 * min: Minuten 1–600 (leer erlaubt, dann ohne Dauer), note: max. 80 Zeichen.
 */
export function makeExtra({ type, min, note } = {}, id = Date.now().toString(36)) {
  if (!EXTRA_TYPES[type]) return null;
  const raw = String(min ?? "").trim();
  const m = raw === "" ? null : Math.round(+raw.replace(",", "."));
  if (m !== null && !(m >= 1 && m <= 600)) return null;
  const e = { id: String(id), type };
  if (m) e.min = m;
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
  return [EXTRA_TYPES[e.type].label, e.min ? `${e.min}′` : "", e.note || ""].filter(Boolean).join(" · ");
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
  return null;
}
