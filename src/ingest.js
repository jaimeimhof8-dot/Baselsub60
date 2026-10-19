// Garmin/Strava-Eingang: nur relevante Einheiten aufnehmen und passende Einheiten automatisch dem Plan zuordnen.
// Reine Funktionen, ohne DOM. `relevant` steht bewusst auch in supabase/functions/garmin/reduce.js (Edge Function bündelt nur ihren Ordner).

export const MIN_SEC = 12 * 60; // kürzere Einheiten sind Alltag, kein Training
export const TOL = 0.25; // Lauf passt zum Plan, wenn Distanz oder Dauer höchstens ±25 % abweichen

/** Zählt die Aktivität als Training? Sonstige Sportarten (Walking, Wandern, Yoga …) und Einheiten unter 12 Minuten nicht. */
export const relevant = (a) => !!a && a.group !== "other" && (+a.time || 0) >= MIN_SEC;

const num = (s) => parseFloat(String(s).replace(",", "."));

/**
 * Geplante Distanz (km) und Dauer (min) eines Lauftags aus den Zeilen lesen: "4×1 km", "10 km", "60′", "3×8 min".
 * Fehlt eine Angabe, ist der Wert null.
 */
export function plannedRun(day) {
  let km = 0, min = 0;
  for (const raw of (day && day.i) || []) {
    const t = String(raw).replace(/\s+/g, " ");
    if (/einlaufen|auslaufen|trab/i.test(t) && !/\d/.test(t)) continue;
    let m;
    const rep = /(\d+)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*(km|m)\b/gi;
    while ((m = rep.exec(t))) km += +m[1] * num(m[2]) / (m[3].toLowerCase() === "km" ? 1 : 1000);
    const repMin = /(\d+)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*(?:′|'|min)/gi;
    while ((m = repMin.exec(t))) min += +m[1] * num(m[2]);
    const single = t.replace(rep, "").replace(repMin, "");
    const k = single.match(/(\d+(?:[.,]\d+)?)\s*km\b/i);
    if (k) km += num(k[1]);
    const mi = single.match(/(\d+(?:[.,]\d+)?)\s*(?:′|'|min)/i);
    if (mi) min += num(mi[1]);
  }
  return { km: km || null, min: min || null };
}

const close = (a, b) => Math.abs(a - b) <= TOL * b;

/**
 * Wie wird die Aktivität dem geplanten Tag zugeordnet?
 *  "run"  – Lauf auf einem Lauftag, Distanz oder Dauer ±25 % (Werte in Pace, Distanz, HF übernehmen)
 *  "meta" – Kraft/Cardio/HIIT auf Kraft-, Stations-, Simulations- oder Renntag (nur Dauer, HF, Kalorien als Nachweis)
 *  null   – kein automatischer Treffer (bleibt Vorschlag oder Zusatz-Training)
 * Sind weder Distanz noch Dauer im Plan lesbar, genügt beim Lauf die passende Sportart.
 */
export function matchKind(act, day) {
  if (!relevant(act) || !day || day.inj) return null;
  if (day.k === "lauf" && act.group === "run") {
    const p = plannedRun(day), km = (act.dist || 0) / 1000, min = (act.time || 0) / 60;
    if (!p.km && !p.min) return "run";
    return (p.km && km && close(km, p.km)) || (p.min && min && close(min, p.min)) ? "run" : null;
  }
  if (["kraft", "station", "sim", "race"].includes(day.k) && act.group === "strength") return "meta";
  return null;
}
