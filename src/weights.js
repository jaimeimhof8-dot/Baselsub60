// Standard-Arbeitsgewichte (Profil). Reine Funktionen, ohne DOM.
// Gespeicherte Form (S.weights): {übungsname (exName): "80"} – Wert in kg, als Text wie eingegeben.
import { exName } from "./util.js";

/** Übungen, die immer im Profil stehen. Gilt nur für Krafteinheiten (Stationen werden auf Zeit gemessen). */
export const BASE_EXERCISES = ["Back Squat", "Front Squat", "Bulgarian Split Squat", "Deadlift", "Bench Press", "Shoulder Press", "Pull-ups"];
const NO_WEIGHT = /plank|einlaufen|auslaufen|^kraft\b/i;

/** Anzeigename einer Übung: Text vor Satz-/Wdh-Angaben ("Back Squat 3×5 @75%" → "Back Squat"). */
const label = (t) => String(t).split(/\s\d|\s@|\s–|,/)[0].trim();

/**
 * Liste für das Profil: feste Übungen + weitere Kraftübungen aus dem aktiven Plan (z. B. nach PDF-Import).
 * @param {Iterable<{k:string,i?:string[]}>} days
 * @returns {{key:string,label:string}[]}
 */
export function weightList(days) {
  const out = new Map();
  for (const l of BASE_EXERCISES) out.set(exName(l), l);
  for (const d of days) {
    if (!d || d.k !== "kraft") continue;
    for (const t of d.i || []) {
      const l = label(t), k = exName(t);
      if (l && !NO_WEIGHT.test(l) && !out.has(k)) out.set(k, l);
    }
  }
  return [...out].map(([key, l]) => ({ key, label: l }));
}

/** Gewicht normalisieren: "80", "80kg", "80,5 kg" → "80" / "80.5"; leer oder ungültig → "". */
export function cleanWeight(v) {
  const m = String(v || "").trim().replace(",", ".").match(/^(\d{1,3}(?:\.\d{1,2})?)\s*(kg)?$/i);
  return m && +m[1] > 0 ? String(+m[1]) : "";
}

/** Vorschlag für das Eingabefeld einer Übung, z. B. "80 kg" – oder "", wenn nichts hinterlegt ist. */
export function defaultWeight(text, weights) {
  const w = weights && weights[exName(text)];
  return w ? `${w} kg` : "";
}
