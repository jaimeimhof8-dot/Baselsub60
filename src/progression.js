// Gewichtsvorschlag für Kraftübungen. Reine Funktionen, ohne DOM. Hintergrund und Grenzen: docs/gewichtsvorschlag.md
//
// Regel: Ein Gewicht ist nur mit einem anderen vergleichbar, wenn Sätze × Wiederholungen gleich sind.
//  • vergleichbar  → bisherige Progression (RPE der letzten Einheit: ≤7 +2,5 kg, ≥9 −2,5 kg)
//  • nicht vergleichbar → KEIN Vorschlag und keine Umrechnung, nur der Hinweis „letztes Mal anders: 3×5 mit 80 kg“
//  • keine brauchbaren Daten → kein Wert, nur ein Hinweis
import { parseSets, parseKg, nextWeight } from "./weights.js";

/** Vergleichbar = gleiche Sätze×Wiederholungen (3×5 gegen 3×5; bei Plan-Bereich "3×6–8" zählt jede Wdh. darin). Toleranz bewusst 0. */
export const REPS_TOL = 0, SETS_TOL = 0;
/** Ältere vergleichbare Einheiten gelten nur innerhalb dieser Tage als Basis (sonst eher veraltet). */
export const COMPARABLE_MAX_AGE = 56;

const fmtKg = (kg) => `${+kg.toFixed(1)} kg`;

/**
 * Soll-Schema aus dem Plantext: "Back Squat 3×5 @75% RPE 7" → {sets:3, lo:5, hi:5}; "3×6–8" → lo 6, hi 8.
 * Läufe, Zeiten und Strecken ("4×1 km", "3×50″", "20 m") sind kein Satzschema → null.
 */
export function parseRx(text) {
  const m = String(text || "").match(/(?:^|[^\d×x.,])(\d{1,2})\s*[×x]\s*(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?(?![\d,.]*\s*(?:km|m\b|min|[′'″"]|s\b|sek|sec))/i);
  if (!m) return null;
  const sets = +m[1], lo = +m[2], hi = m[3] ? +m[3] : lo;
  return sets > 0 && lo > 0 && hi >= lo ? { sets, lo, hi } : null;
}

/** Kurztext des Schemas: {sets:2, lo:8, hi:8} → "2×8"; Bereich "3×6–8". */
export const rxLabel = (rx) => (rx ? `${rx.sets}×${rx.lo === rx.hi ? rx.lo : rx.lo + "–" + rx.hi}` : "");

/**
 * Was wurde tatsächlich gemacht? Aus gespeichertem Wert + Plantext jener Einheit.
 * Ein Wert für alle Sätze ("80 kg") gilt für alle geplanten Sätze; fehlende Wdh. kommen aus dem Plan (untere Grenze,
 * das ist die vorsichtigere Annahme). Gibt null zurück, wenn kein Gewicht erkennbar ist.
 * @returns {{sets:{kg:number,reps:number|null}[], top:{kg:number,reps:number|null}, repsKnown:boolean, n:number, uniform:boolean}|null}
 */
export function performed(v, text) {
  let sets = parseSets(v);
  const rx = parseRx(text);
  if (!sets.length) { const kg = parseKg(v); if (isNaN(kg)) return null; sets = [{ kg, reps: null }]; }
  if (sets.length === 1 && rx) sets = Array.from({ length: rx.sets }, () => ({ ...sets[0] })); // ein Wert für alle Sätze
  sets = sets.map((s) => ({ kg: s.kg, reps: s.reps != null ? s.reps : rx ? rx.lo : null }));
  // schwerster Satz (bei Gleichstand der mit den meisten Wdh.) = Arbeitssatz
  const top = sets.reduce((a, b) => (b.kg > a.kg || (b.kg === a.kg && (b.reps || 0) > (a.reps || 0)) ? b : a));
  return { sets, top, repsKnown: sets.every((s) => s.reps != null), n: sets.length, uniform: sets.every((s) => s.kg === sets[0].kg && s.reps === sets[0].reps) };
}

/** Lesbar: "3×5 mit 80 kg" oder, bei unterschiedlichen Sätzen, "80×5, 85×5, 85×3 kg". */
export function describePerformed(p) {
  if (!p) return "";
  if (p.uniform) return p.sets[0].reps != null ? `${p.n}×${p.sets[0].reps} mit ${fmtKg(p.top.kg)}` : `${p.n} ${p.n === 1 ? "Satz" : "Sätze"} mit ${fmtKg(p.top.kg)}`;
  return `${p.sets.map((s) => `${+s.kg.toFixed(1)}${s.reps != null ? "×" + s.reps : ""}`).join(", ")} kg`;
}

/**
 * Sind Gewicht der letzten Einheit und neues Soll vergleichbar? Verglichen wird der Arbeitssatz (schwerster Satz):
 * seine Wdh. müssen im Soll-Bereich ±1 liegen, die Satzzahl ±1.
 * @returns {boolean|null} null = nicht entscheidbar (Schema fehlt auf einer Seite)
 */
export function comparable(p, rx) {
  if (!p || !rx || !p.repsKnown) return null;
  return p.top.reps >= rx.lo - REPS_TOL && p.top.reps <= rx.hi + REPS_TOL && Math.abs(p.n - rx.sets) <= SETS_TOL;
}

/**
 * Vorschlag fürs Gewicht der Übung `text` (Plantext des heutigen Tags).
 * @param {string} text Plantext der heutigen Zeile
 * @param {{v:string, rpe?:number, t:string, age:number}[]} history frühere Einträge derselben Übung, neueste zuerst (age = Tage her)
 * @returns {{kind:"direct"|"none", kg:number|null, text:string, note:string, from:string}}
 *   kg ist null, wenn nichts Seriöses vorgeschlagen werden kann – dann steht der Grund in `text`.
 */
export function suggestWeight(text, history) {
  const rx = parseRx(text);
  const entries = (history || []).map((h) => ({ h, p: performed(h.v, h.t) })).filter((e) => e.p);
  const none = (msg) => ({ kind: "none", kg: null, text: msg, note: "", from: "" });
  if (!entries.length) return none("Noch kein Gewicht für diese Übung eingetragen – bitte selbst eintragen.");
  const deload = /RPE\s*5/i.test(text);
  const last = entries[0];
  const lastTxt = `letztes Mal ${describePerformed(last.p)}`;

  // 1) jüngste vergleichbare Einheit (nicht zu alt) → bisherige Progression
  const same = entries.find((e) => e.h.age <= COMPARABLE_MAX_AGE && comparable(e.p, rx) === true);
  if (same) {
    const base = same.p.top.kg;
    const kg = parseKg(nextWeight(`${base} kg`, same.h.rpe, text));
    const src = same === last ? lastTxt : `${describePerformed(same.p)} vor ${Math.round(same.h.age / 7) || 1} Wo.`;
    const why = deload ? "Entlastung −10 %" : same.h.rpe != null && same.h.rpe !== 8 && kg !== base ? `RPE ${same.h.rpe}` : "";
    return { kind: "direct", kg, text: `${src}, gleiche Struktur${kg !== base ? ` → ${fmtKg(kg)}` : ""}${why ? ` (${why})` : ""}`, note: "", from: describePerformed(same.p) };
  }

  // Plan nennt nie ein Schema (z. B. "Topsatz"): nichts zu vergleichen, bisherige Regel
  if (!rx && !parseRx(last.h.t)) {
    const base = last.p.top.kg, kg = parseKg(nextWeight(`${base} kg`, last.h.rpe, text));
    return { kind: "direct", kg, text: `${lastTxt}, Satzschema im Plan nicht angegeben${kg !== base ? ` → ${fmtKg(kg)}` : ""}`, note: "", from: describePerformed(last.p) };
  }
  // 2) Keine vergleichbare Einheit: kein Vorschlag und keine Umrechnung, nur der getrennte Hinweis auf die letzte, andere Einheit
  return none(`letztes Mal anders: ${describePerformed(last.p)} – nicht vergleichbar, daher kein Vorschlag.`);
}
