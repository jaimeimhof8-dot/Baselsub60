// „Später fertig machen“: offene Übungen einer Einheit an den nächsten Tag anhängen.
// Gespeichert an der Ursprungs-Einheit: S.later[datum] = {to: zielDatum, j: [Übungsindex], at}.
// Abhaken und Werte bleiben an der Ursprungs-Einheit (Schlüssel datum|j) – Fortschritt, Wochenrückblick und Tests stimmen so weiter.
// Reine Funktionen, ohne DOM.

/** Offene (nicht abgehakte) Übungen einer Einheit: Indizes in day.i */
export function openItems(day, done, dk) {
  if (!day || !Array.isArray(day.i)) return [];
  return day.i.map((_, j) => j).filter((j) => !(done || {})[dk + "|" + j]);
}

/** Darf die Einheit an Tag i angehängt werden? Nur heute oder vergangene Tage, mit offenen Übungen und einem Folgetag im Plan. */
export function canCarry({ i, today, last, day, open }) {
  return !!day && day.k !== "rest" && i <= today && i < last && open.length > 0;
}

/** Eintrag für S.later */
export const makeCarry = (toKey, open, now = Date.now()) => ({ to: toKey, j: open.slice(), at: now });

/** Welche Einheiten hängen an Ziel-Tag toKey? → [{from: datum, j: [..]}] (älteste zuerst) */
export function carriedTo(later, toKey) {
  return Object.entries(later || {})
    .filter(([, c]) => c && c.to === toKey && Array.isArray(c.j) && c.j.length)
    .map(([from, c]) => ({ from, j: c.j }))
    .sort((a, b) => (a.from < b.from ? -1 : 1));
}

/** Wie viele der angehängten Übungen sind schon erledigt? */
export function carryProgress(c, done) {
  const n = c.j.length,
    d = c.j.filter((j) => (done || {})[c.from + "|" + j]).length;
  return { n, done: d };
}
