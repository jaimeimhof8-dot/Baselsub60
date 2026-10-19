// Fokusmodus: Hilfsfunktionen für Ort (GPS) und Reihenfolge der Übungen. Reine Funktionen, ohne DOM.
// Gespeicherter Trainingsort (nur auf dem Gerät, localStorage "hx:gym"): {lat, lon, r (Meter)}

export const GYM_RADIUS = 150; // m: so nah muss man am gespeicherten Ort sein

/** Abstand zweier Koordinaten in Metern (Haversine). */
export function distanceM(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Ist die Position am gespeicherten Ort? Ungültige Werte zählen als "nein". */
export function atPlace(pos, place) {
  const ok = (p) => p && isFinite(p.lat) && isFinite(p.lon);
  if (!ok(pos) || !ok(place)) return false;
  return distanceM(pos, place) <= (place.r || GYM_RADIUS);
}

/** Position der nächsten offenen Übung ab `from` (danach von vorn), sonst -1. done: j → bool. */
export function nextOpen(count, done, from = 0) {
  for (let k = 0; k < count; k++) {
    const j = (from + k) % count;
    if (!done(j)) return j;
  }
  return -1;
}

const num = (s) => parseFloat(String(s).replace(",", "."));
const isMin = (u) => /^(?:′|'|min)/i.test(u);

/**
 * Zeitvorgabe einer Planzeile für den Timer, sonst null. Nur Übungen, bei denen eine Uhr Sinn macht:
 * «1 Minute Sled Push», «EMOM 20′», «AMRAP 10′», «Plank 3×50″», «Compromised Running 2×10′, 2′ Pause».
 * Rad (lange Fahrten) und Bereiche wie «45–60′» bekommen keinen Timer. Halte-Übungen ohne Pausenangabe: 30 s Pause.
 * @returns {{label: string, rounds: number, work: number, rest: number}|null} Sekunden je Runde
 */
export function timedSpec(text, kind = "") {
  const t = String(text || "").replace(/\s+/g, " ");
  if (["bike", "mob", "rest"].includes(kind)) return null;
  if (/\d\s*[–-]\s*\d+\s*(?:′|'|min)/i.test(t)) return null;
  let m;
  if ((m = t.match(/EMOM\s*(\d+)\s*(?:′|'|min)?/i))) return { label: "EMOM", rounds: Math.min(+m[1], 60), work: 60, rest: 0 };
  if ((m = t.match(/AMRAP\s*(\d+)\s*(?:′|'|min)/i) || t.match(/(\d+)\s*(?:′|'|min)\s*AMRAP/i))) return { label: "AMRAP", rounds: 1, work: +m[1] * 60, rest: 0 };
  if ((m = t.match(/(\d+)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*(″|"|sek\w*|sec|s\b|′|'|min\w*)/i))) {
    const mins = isMin(m[3]), work = Math.round(num(m[2]) * (mins ? 60 : 1));
    if (work >= 5 && work <= 1800) {
      const p = t.match(/(\d+(?:[.,]\d+)?)\s*(′|'|min\w*|″|"|sek\w*|sec)\s*Pause/i);
      const rest = p ? Math.round(num(p[1]) * (isMin(p[2]) ? 60 : 1)) : mins ? 0 : 30;
      return { label: mins ? "Intervall" : "Halten", rounds: Math.min(+m[1], 20), work, rest };
    }
  }
  if ((m = t.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(Minuten?|Min\.?|Sek(?:unden)?\.?|sec)(?![a-zäöü])/i))) {
    const work = Math.round(num(m[1]) * (/^min/i.test(m[2]) ? 60 : 1));
    if (work >= 10 && work <= 1800) return { label: "Zeit", rounds: 1, work, rest: 0 };
  }
  return null;
}

/** Wo steht der Timer nach `e` Sekunden? {done, round (ab 0), rest, left (Sekunden in dieser Phase)}. Nach der letzten Arbeit keine Pause mehr. */
export function timerPhase(spec, e) {
  const { rounds, work, rest } = spec, cycle = work + rest;
  const total = rounds * work + (rounds - 1) * rest;
  if (e >= total) return { done: true, round: rounds - 1, rest: false, left: 0 };
  const round = Math.floor(e / cycle), within = e - round * cycle;
  return within < work ? { done: false, round, rest: false, left: work - within } : { done: false, round, rest: true, left: cycle - within };
}
