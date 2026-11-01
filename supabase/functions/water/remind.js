// Reine Entscheidung für die Trink-Erinnerung (läuft in der Edge Function "water" und in den Node-Tests).
// Gleiche Formel wie in der Ernährungs-App (Today.tsx): bis 7 Uhr nichts erwartet, bis 21 Uhr steigt das Soll linear auf das Tagesziel.
export const FROM_HOUR = 8; // frühestens um 8 Uhr (Zürcher Zeit)
export const TO_HOUR = 21; // ab 21 Uhr keine Erinnerung mehr
export const MIN_BEHIND = 300; // erst ab so viel ml Rückstand
export const GAP_MIN = 90; // mindestens so viele Minuten zwischen zwei Erinnerungen

export const expectedMl = (goalMl, hour) => Math.round((goalMl * Math.min(1, Math.max(0, (hour - 7) / 14))) / 50) * 50;

/**
 * st = {day, ml, goal} (zuletzt von der App gemeldet), today = Zürcher Datum, hour = Zürcher Stunde,
 * lastSent = ISO-Zeit der letzten Erinnerung oder null, now = ms.
 * -> {send: boolean, behind: number}. Meldet die App für heute noch nichts, zählt 0 ml (sie wurde heute nie geöffnet).
 */
export function decide(st, { today, hour, lastSent = null, now = Date.now() }) {
  const goal = st && +st.goal > 0 ? +st.goal : 0;
  if (!goal) return { send: false, behind: 0 };
  if (hour < FROM_HOUR || hour >= TO_HOUR) return { send: false, behind: 0 };
  const ml = st.day === today ? Math.max(0, +st.ml || 0) : 0;
  const behind = Math.max(0, expectedMl(goal, hour) - ml);
  if (behind < MIN_BEHIND) return { send: false, behind };
  if (lastSent && now - Date.parse(lastSent) < GAP_MIN * 60000) return { send: false, behind };
  return { send: true, behind };
}

export const messageFor = (behind) => ({
  title: "Zeit zu trinken",
  body: `Dir fehlen ca. ${Math.round(behind / 50) * 50} ml. Trink jetzt ein Glas und trag es ein.`,
  url: "/",
});
