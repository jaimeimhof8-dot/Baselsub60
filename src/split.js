// Plan-Zeilen aufteilen: eine Zeile mit zwei Übungen («Sled Push … → 1 km @ 4:05/km», «Wadenheben … → Pallof Press …»)
// wird zu zwei Zeilen, damit man jede einzeln abhaken, streichen und eintragen kann. Reine Funktionen, ohne DOM.

/** Ab diesem Plan-Tag (Index, 16 = Mi 28.10.2026) wird aufgeteilt. Frühere Tage behalten ihre Zeilen, weil an der
 *  Zeilennummer abgehakte Übungen, Werte und «Später» hängen. */
export const SPLIT_FROM = 16;

const ARROW = /\s+→\s+/;

/** «Kraft 2 + Compromised Running» ist nur noch Compromised Running (der Kraftteil entfiel). */
export const retitle = (t) => String(t ?? "").replace(/^Kraft 2 \+ (Compromised Running)\b/, "$1");

/** Eine Zeile an « → » teilen. Beginnt sie mit «Runde N», bekommt der Lauf-Teil dasselbe Präfix («Runde 2: 1 km …»). */
export function splitLine(line) {
  const s = String(line ?? "");
  const parts = s.split(ARROW).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return [s];
  const m = /^(Runde \d+)\b[^:]*:/.exec(parts[0]);
  return parts.map((p, k) => (k > 0 && m && !/^(Runde|Run)\s*\d+/.test(p) ? `${m[1]}: ${p}` : p));
}

/** Alle Zeilen einer Einheit aufteilen. */
export const splitItems = (items) => (Array.isArray(items) ? items.flatMap(splitLine) : items);

/** Einheit für die Anzeige aufbereiten: Titel immer, Zeilen nur ab SPLIT_FROM und nur ohne eigene Anpassung (edited). */
export function tidyDay(p, src, edited) {
  if (!p) return p;
  const out = { ...p, t: retitle(p.t) };
  if (!edited && src >= SPLIT_FROM && p.k !== "rest") out.i = splitItems(p.i);
  return out;
}
