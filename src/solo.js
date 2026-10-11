// Solo-Modus: eine Partner-Einheit so umschreiben, dass sie allein machbar ist (Partner fällt aus).
// Regeln wie im Doubles-Rennen: Läufe voll, Stationen mit halbem Volumen und danach gleich lange
// Pause (simuliert die Arbeitszeit des Partners). Übergaben werden zu Übergängen Station → Lauf.
// Wichtig: gleich viele Zeilen wie das Original, damit abgehakte Zeilen und Werte am Platz bleiben.
// Reine Funktionen, ohne DOM.

const HALF = "(solo: halbes Volumen)";

/** Kann diese Einheit solo umgeschrieben werden? (Partner-Einheiten ausser Ruhetag und Rennen) */
export const canSolo = (day) => !!day && !!day.joint && !["rest", "race"].includes(day.k);

// \b kennt in JavaScript keine Umlaute: eigene Wortgrenzen
const L = "A-Za-zÄÖÜäöüß";
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Eine Zeile solo umschreiben. Gibt {text, shared} zurück (shared = Stationen waren geteilt). */
export function soloLine(line, partner = "Jimoh") {
  const P = esc(partner);
  let s = String(line ?? ""), shared = false;
  const sub = (re, to, isShared) => { if (re.test(s)) { s = s.replace(re, to); if (isShared) shared = true; } };
  // Stationen im Doubles geteilt -> halbes Volumen
  sub(new RegExp(`^Mit ${P} in der Rennaufteilung:\\s*`, "i"), "Solo, Stationen mit halbem Volumen: ", true);
  sub(/^Wechsel:.*$/i, "Stationen solo: halbes Volumen, danach gleich lange Pause", true);
  sub(/\s*in der Rennaufteilung/gi, ` ${HALF}`, true);
  sub(/\s*im Doubles-Wechsel/gi, " allein", true);
  sub(/,\s*geteilt\b/gi, ` ${HALF}`, true);
  sub(/\s*im Wechsel(?=\s*\))/gi, "", false);
  sub(/,?\s*im Wechsel:\s*einer testet, einer stoppt/gi, ", selbst stoppen", false);
  sub(/\s*im Wechsel(?! mit\b)(?=[\s:,]|$)/gi, ` ${HALF}`, true);
  // Partner und Team
  sub(new RegExp(`^Mit ${P}\\s+`, "i"), "", false);
  sub(new RegExp(`,?\\s*(?:gemeinsam |zusammen )?mit ${P}(?![${L}])`, "gi"), "", false);
  sub(/,?\s*\b(?:gemeinsam|zusammen)\b/gi, "", false);
  sub(/Abstand zwischen euch notieren.*$/i, "Eigene Splits notieren (Streuung bis 10 Sek.)", false);
  sub(/\bim Team-Tempo\b/gi, "im Tempo T", false);
  sub(/\bWenn möglich beide mit Pulsuhr\b/gi, "Mit Pulsuhr", false);
  // Übergaben an den Partner -> Übergänge Station → Lauf
  sub(/Übergaben üben/g, "Übergänge Station → Lauf üben", false);
  sub(/Übergabezeiten/g, "Übergangszeiten Station → Lauf", false);
  sub(new RegExp(`(?<![${L}])Übergaben(?![${L}])`, "g"), "Übergänge", false);
  sub(new RegExp(`(?<![${L}])Übergabe(?![${L}])`, "g"), "Übergang", false);
  sub(/\bDoubles[- ](Simulation|Transition)/g, "$1", false);
  s = s.replace(/\s{2,}/g, " ").replace(/\s+([,.:)])/g, "$1").trim();
  return { text: s.charAt(0).toUpperCase() + s.slice(1), shared };
}

/**
 * Einheit für Solo-Training. partner = Name, der im Text steht ("Jimoh", bzw. "Jaime" aus Jimohs Sicht).
 * Gibt dasselbe Objekt zurück, wenn die Einheit kein Partner-Training ist.
 */
export function soloize(day, partner = "Jimoh") {
  if (!canSolo(day)) return day;
  const lines = (day.i || []).map((l) => soloLine(l, partner));
  const shared = lines.some((l) => l.shared) || ["sim"].includes(day.k);
  const t = soloLine(day.t, partner).text;
  const n = soloLine(day.n || "", partner).text;
  const why = shared
    ? `Solo ohne ${partner}: Läufe voll, Stationen mit halbem Volumen, danach gleich lange Pause – wie im Doubles-Rennen.`
    : `Solo ohne ${partner}: gleiche Einheit, Tempo nach deinem T.`;
  return { ...day, t: /solo/i.test(t) ? t : `${t} · solo`, i: lines.map((l) => l.text), n: n ? `${why} ${n}` : why, solo: 1 };
}
