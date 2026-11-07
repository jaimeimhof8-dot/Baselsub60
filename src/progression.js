// Gewichtsvorschlag für Kraftübungen. Reine Funktionen, ohne DOM. Hintergrund und Grenzen: docs/gewichtsvorschlag.md
//
// Regel: Ein Gewicht ist nur mit einem anderen vergleichbar, wenn Sätze × Wiederholungen ähnlich sind.
//  • vergleichbar  → bisherige Progression (RPE der letzten Einheit: ≤7 +2,5 kg, ≥9 −2,5 kg)
//  • nicht vergleichbar → Umrechnung über geschätztes 1RM (Epley), ausdrücklich als Schätzung markiert
//  • keine brauchbaren Daten → kein Wert, nur ein Hinweis
import { parseSets, parseKg, nextWeight } from "./weights.js";

/** Obergrenze der Wiederholungen, bis zu der die Epley-Umrechnung noch halbwegs taugt. */
export const MAX_REPS_ESTIMATE = 12;
/** Vergleichbar: Wiederholungen höchstens so weit auseinander, Satzzahl höchstens so weit. */
export const REPS_TOL = 1, SETS_TOL = 1;
/** Ältere vergleichbare Einheiten gelten nur innerhalb dieser Tage als Basis (sonst eher veraltet). */
export const COMPARABLE_MAX_AGE = 56;

const r25 = (kg) => Math.round(kg / 2.5) * 2.5;
const fmtKg = (kg) => `${+kg.toFixed(1)} kg`;

/** Geschätztes 1RM nach Epley: kg × (1 + Wdh/30). Bei 1 Wiederholung = das Gewicht selbst. */
export const e1rm = (kg, reps) => (reps <= 1 ? kg : kg * (1 + reps / 30));
/** Gewicht, das für `reps` Wiederholungen zu einem 1RM passt (Umkehrung von Epley). */
export const weightForReps = (est, reps) => (reps <= 1 ? est : est / (1 + reps / 30));

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
 * @returns {{kind:"direct"|"converted"|"none", kg:number|null, text:string, note:string, from:string}}
 *   kg ist null, wenn nichts Seriöses vorgeschlagen werden kann – dann steht der Grund in `text`.
 */
export function suggestWeight(text, history) {
  const rx = parseRx(text), want = rxLabel(rx);
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

  const stale = comparable(last.p, rx) === true && last.h.age > COMPARABLE_MAX_AGE ? ` (jene Einheit ist über ${COMPARABLE_MAX_AGE / 7} Wochen her)` : "";
  // 2) Struktur unbekannt oder zu verschieden → nur mit Schema und Wdh. auf beiden Seiten umrechnen
  if (!rx && !parseRx(last.h.t)) { // Plan nennt nie ein Schema (z. B. "Topsatz"): nichts zu vergleichen, bisherige Regel
    const base = last.p.top.kg, kg = parseKg(nextWeight(`${base} kg`, last.h.rpe, text));
    return { kind: "direct", kg, text: `${lastTxt}, Satzschema im Plan nicht angegeben${kg !== base ? ` → ${fmtKg(kg)}` : ""}`, note: "", from: describePerformed(last.p) };
  }
  if (!rx) return none(`${lastTxt} – für diese Übung steht im Plan kein Satzschema, daher kein Vorschlag.`);
  if (!last.p.repsKnown) return none(`${lastTxt} – Wiederholungen jener Einheit unbekannt, daher kein Vorschlag.`);
  const target = rx.hi; // Obergrenze: mehr Wdh. → leichter, die vorsichtigere Seite
  const srcReps = last.p.top.reps;
  if (srcReps > MAX_REPS_ESTIMATE || target > MAX_REPS_ESTIMATE)
    return none(`${lastTxt} – über ${MAX_REPS_ESTIMATE} Wiederholungen ist die Umrechnung zu ungenau, daher kein Vorschlag.`);
  const est = Math.max(...last.p.sets.map((s) => e1rm(s.kg, s.reps)));
  let kg = weightForReps(est, target);
  if (deload) kg *= 0.9;
  kg = r25(kg);
  if (!(kg > 0)) return none(`${lastTxt} – Umrechnung ergibt kein sinnvolles Gewicht.`);
  return {
    kind: "converted", kg,
    text: `${lastTxt}${stale}, Schätzung für ${want}: ${fmtKg(kg)}${deload ? " (Entlastung −10 %)" : ""}`,
    note: "Schätzung über das 1RM (Epley), kann um 5–10 % danebenliegen. Erster Satz prüft, ob es passt.",
    from: describePerformed(last.p),
  };
}
