// Wochen-Regal: reine Regeln, welche Tage sich ziehen und ablegen lassen. Ohne DOM.
// Ein Tag ist beweglich, wenn er ab heute liegt und weder verletzt noch der Renntag ist.

/** Grund, warum ein Tag nicht beweglich ist ("past", "inj", "race", "none"), sonst "". */
export function lockReason(p, i, today) {
  if (!p) return "none";
  if (i < today) return "past";
  if (p.race) return "race";
  if (p.inj) return "inj";
  return "";
}

export const movable = (p, i, today) => lockReason(p, i, today) === "";

/** Darf Tag from auf Tag to gezogen werden? Zwei Ruhetage tauschen bringt nichts. */
export function canDrop(from, to, plan, today) {
  if (from === to) return false;
  const a = plan(from), b = plan(to);
  if (!movable(a, from, today) || !movable(b, to, today)) return false;
  return !(a.k === "rest" && b.k === "rest");
}

/** Erste von zwei angezeigten Wochen: die Woche des gewählten Tags, so begrenzt, dass beide Wochen existieren. */
export function shelfStart(week, nweeks) {
  return Math.max(0, Math.min(nweeks - 2, week));
}
