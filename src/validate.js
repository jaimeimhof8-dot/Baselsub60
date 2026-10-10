/* Workout-Validierung: welche Übungen brauchen einen Wert, und welchen? */

/* Ein- und Auslaufen brauchen keinen Wert */
export const isFiller = (t) => /einlaufen|auslaufen/i.test(t);

/* Welche Angabe bei einer Übung erwartet wird (für Warnungen wie „bitte Pace eintragen“) */
export function valueHint(k, t) {
  if (/runde|rounds|amrap|emom/i.test(t)) return "Runden";
  if (/plank|hold|halten/i.test(t)) return "Zeit";
  if (/row|ski|rudern/i.test(t)) return "Zeit oder Watt";
  if (k === "lauf") return "Pace";
  if (k === "bike") return "Watt";
  if (k === "kraft") return "Gewicht";
  return "Zeit";
}

/* Abgehakte Übungen ohne eingetragenen Wert. items = Übungstexte des Tages, done/val = S.done/S.val, dk = Tagesschlüssel */
export function missingValues(items, done, val, dk) {
  return items.map((t, j) => ({ t, j }))
    .filter(({ t, j }) => !isFiller(t) && done[dk + "|" + j] && !String(val[dk + "|" + j] || "").trim());
}
