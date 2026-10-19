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
