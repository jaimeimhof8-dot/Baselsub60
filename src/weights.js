// Standard-Arbeitsgewichte (Profil). Reine Funktionen, ohne DOM.
// Gespeicherte Form (S.weights): {übungsname (exName): "80"} – Wert in kg, als Text wie eingegeben.
import { exName } from "./util.js";
import { stationWeight } from "./divisions.js";

/** Übungen, die immer im Profil stehen. Gilt nur für Krafteinheiten (Stationen werden auf Zeit gemessen). */
export const BASE_EXERCISES = ["Back Squat", "Front Squat", "Bulgarian Split Squat", "Deadlift", "Bench Press", "Shoulder Press", "Pull-ups"];
// Ohne Gewicht: Halteübungen, Lauf-Zeilen, Sprünge und Zirkel (EMOM)
const NO_WEIGHT = /plank|einlaufen|auslaufen|^kraft\b|box ?jumps?|^emom\b/i;

/** Anzeigename einer Übung: Text vor Satz-/Wdh-Angaben ("Back Squat 3×5 @75%" → "Back Squat"). */
export const label = (t) => String(t).split(/\s\d|\s@|\s–|,|\sRPE\b/i)[0].trim();

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

/** Zeile mit Gewicht? Auf Krafttagen jede Übung, sonst nur die festen Übungen (z. B. Back Squat vor dem Compromised Running). */
export function isLift(kind, text) {
  if (kind === "kraft") return true;
  const n = exName(text);
  return BASE_EXERCISES.some((l) => exName(l) === n);
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

/**
 * Geplantes Gewicht für das Eingabefeld: (1) "NN kg" im Plantext, (2) Wettkampfgewicht der Division bei Stationen
 * (nicht an Testtagen, dort steht die Zeit im Feld), (3) Profil-Standardgewicht bei Kraftübungen. Sonst "".
 * @param {string} text Planzeile
 * @param {{lift?:boolean, test?:boolean, weights?:object, division?:object}} o
 */
export function plannedWeight(text, { lift = false, test = false, weights, division } = {}) {
  if (/Topsatz/.test(text)) return "";
  const m = String(text).replace(",", ".").match(/(?:^|\s)@?\s*(\d{1,3}(?:\.\d+)?)\s*kg\b/i);
  if (m && lift) return `${+m[1]} kg`;
  if (!test) { const s = stationWeight(text, division); if (s) return s; }
  return lift ? defaultWeight(text, weights) : "";
}

/**
 * Sätze aus einem gespeicherten Wert lesen. Gespeichert bleibt ein Text pro Übung (S.val), daher bleiben alle
 * alten Werte und Backups gültig. Formen:
 *   "80 kg"                      → ein Wert für alle Sätze (alt, bleibt Standard)   → [{kg:80, reps:null}]
 *   "82,5 kg × 5"                → ein Satz mit Wiederholungen (alt)               → [{kg:82.5, reps:5}]
 *   "80/85/85" oder "80 kg × 5 / 85 kg × 5 / 85 kg × 3" → je Satz ein Gewicht, optional mit Wdh.
 * Alles andere (Zeiten, Pace, Freitext) → [] (kein Gewicht erkennbar).
 * @returns {{kg:number, reps:number|null}[]}
 */
export function parseSets(v) {
  const s = String(v || "").trim();
  if (!s || /\d:\d/.test(s)) return [];
  const out = [];
  for (const part of s.split(/\s*\/\s*/)) {
    const m = part.replace(/,/g, ".").match(/^(\d{1,3}(?:\.\d{1,2})?)\s*(kg)?(?:\s*[×x*]\s*(\d{1,3}))?\s*(kg)?$/i);
    if (!m) return [];
    const kg = +m[1], unit = m[2] || m[4];
    if (!(kg > 0 && kg <= 400) || (!unit && kg < 10) || (m[3] != null && (+m[3] < 1 || +m[3] > 50))) return []; // "3×5" ist ein Satzschema, kein Gewicht
    out.push({ kg, reps: m[3] != null ? +m[3] : null });
  }
  return out;
}

/** Sätze → gespeicherter Text. Ein Satz ohne Wdh. bleibt "80 kg" (altes Format); Sätze ohne Gewicht fallen weg. */
export function formatSets(sets) {
  const ok = (sets || []).filter((x) => x && x.kg > 0);
  return ok.map((x) => `${+(+x.kg).toFixed(2)} kg${x.reps > 0 ? ` × ${x.reps}` : ""}`).join(" / ");
}

/** Gewicht aus einem Eintrag lesen: "82,5 kg × 5" → 82.5, "80/85/85" → 85 (schwerster Satz), sonst NaN. */
export function parseKg(v) {
  const sets = parseSets(v);
  if (sets.length) return Math.max(...sets.map((x) => x.kg));
  const s = String(v || "").replace(",", ".");
  const kg = s.match(/(\d{1,3}(?:\.\d+)?)\s*kg/i);
  if (kg) return +kg[1];
  if (/\d:\d/.test(s)) return NaN; // Zeit oder Pace, kein Gewicht
  const nums = (s.match(/\d{1,3}(?:\.\d+)?/g) || []).map(Number).filter((n) => n >= 10 && n <= 400);
  return nums.length ? Math.max(...nums) : NaN;
}

/** Wert um dir × 2.5 kg verschieben (alle Sätze gleich), Struktur und Wdh. bleiben. "" wenn kein Gewicht erkennbar. */
export function stepValue(v, dir) {
  const sets = parseSets(v);
  if (!sets.length) { const kg = parseKg(v); return isNaN(kg) ? "" : formatSets([{ kg: Math.max(0, kg + dir * 2.5), reps: null }]); }
  return formatSets(sets.map((x) => ({ kg: Math.max(2.5, +(x.kg + dir * 2.5).toFixed(2)), reps: x.reps }))); // nie 0: sonst fiele ein Satz weg
}

/**
 * Gewicht fürs nächste Mal aus dem letzten Wert und der RPE jener Einheit:
 * RPE ≤ 7 → +2.5 kg, RPE ≥ 9 → −2.5 kg, sonst gleich. Deload-Zeilen (RPE 5–6 im Text) → −10 %.
 * Gibt "" zurück, wenn kein Gewicht erkennbar ist.
 */
export function nextWeight(last, lastRpe, text = "") {
  const kg = parseKg(last); if (isNaN(kg)) return "";
  let n = kg;
  if (/RPE\s*5/i.test(text)) n = kg * 0.9;
  else if (lastRpe != null && lastRpe <= 7) n = kg + 2.5;
  else if (lastRpe >= 9) n = kg - 2.5;
  return `${Math.round(n / 2.5) * 2.5} kg`;
}
/** Ziel-RPE aus dem Plantext: ["… RPE 7", "… RPE 7–8"] → [7, 8]; ohne Angabe null. */
export function targetRpe(items) {
  let lo = null, hi = null;
  for (const t of items || []) {
    const m = String(t).match(/RPE\s*(\d+)(?:\s*[–-]\s*(\d+))?/i); if (!m) continue;
    lo = Math.min(lo ?? 10, +m[1]); hi = Math.max(hi ?? 0, +(m[2] || m[1]));
  }
  return lo == null ? null : [lo, hi];
}
