// Wochenbericht als Push-Nachricht. Reines JS ohne Deno/DOM: läuft in der Edge Function "weekly" und in den Node-Tests.
// Die App legt bei jeder Änderung eine Kurzfassung der laufenden Woche in plan_state ab (S.wsnap, siehe index.html weekSnap()).
// Der Server rechnet nichts nach – er formuliert nur die Nachricht aus dieser Kurzfassung.

export const START = Date.UTC(2026, 9, 12); // Montag 12.10.2026 = Tag 0 des Plans
const DAY = 86400000;
const LVL = { green: "Auf Kurs ✅", yellow: "Aufpassen ⚠️", red: "Nachsteuern 🔴" };
const one = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Planwoche (0-basiert) für ein Datum "YYYY-MM-DD" (Ortszeit Zürich, vom Aufrufer bestimmt). */
export const weekOf = (isoDate) => Math.floor((Date.parse(isoDate + "T00:00:00Z") - START) / DAY / 7);

/**
 * Nachricht für eine Woche: {title, body, url}.
 * snap = S.wsnap aus plan_state oder null. Passt die Woche nicht (App diese Woche nicht geöffnet), kommt eine Erinnerung.
 */
export function weeklyMessage(snap, week, { name = "" } = {}) {
  const url = "./?v=review";
  const title = `Wochenbericht Woche ${week + 1}`;
  if (!snap || snap.w !== week)
    return { title, body: `${name ? name + ", diese" : "Diese"} Woche ist noch nichts eingetragen. Öffne die App, hake deine Einheiten ab und mach den Wochen-Check.`, url };
  const parts = [`${snap.done}/${snap.planned} Einheiten`];
  if (snap.rpe != null) parts.push(`Ø RPE ${one(snap.rpe)}`);
  if (snap.sleep != null) parts.push(`Schlaf Ø ${one(snap.sleep)} h`);
  if (snap.fc) parts.push(`Prognose ${mmss(snap.fc)}`);
  let body = `${LVL[snap.level] || ""} ${parts.join(" · ")}`.trim();
  if (snap.focus) body += `\nFokus: ${snap.focus}`;
  body += snap.reviewed ? "\nWochen-Check erledigt 👍" : "\nTipp hier für den Wochen-Check (1 Minute).";
  return { title, body: body.slice(0, 400), url };
}

/** Zürcher Datum "YYYY-MM-DD" zu einem Zeitpunkt (für den Cron, der in UTC läuft). */
export function zurichDate(now = Date.now()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}
