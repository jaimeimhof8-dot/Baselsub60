// Plan-Datei (.json aus Menü → Backup → «Plan als Datei sichern») wieder einlesen: dieselbe Form wie der PDF-Import liefert.
// Reine Funktionen, ohne DOM.
const isObj = (o) => !!o && typeof o === "object" && !Array.isArray(o);
const KINDS = ["kraft", "lauf", "bike", "station", "sim", "rest", "race"];

/**
 * Text einer Plan-Datei → {days, meta:{blocks, weeks, race, warnings}} oder null, wenn es keine Plan-Datei ist.
 * Prüft Tage (Titel, Art, Übungen) und übernimmt nur bekannte Felder. Wirft mit Meldung bei kaputten Plan-Dateien.
 */
export function planFromExport(text) {
  const s = String(text || "").trim();
  if (s[0] !== "{") return null;
  let o;
  try { o = JSON.parse(s); } catch (_) { return null; }
  if (!isObj(o) || o.kind !== "plan" || !isObj(o.plan) || !isObj(o.plan.days)) return null;
  const days = {}, warnings = [];
  let race = null;
  for (const [k, d] of Object.entries(o.plan.days)) {
    const i = +k;
    if (!Number.isInteger(i) || i < 0 || i > 400 || !isObj(d) || !d.t || !KINDS.includes(d.k)) { warnings.push(`Tag ${k} übersprungen (unvollständig)`); continue; }
    const day = { t: String(d.t).slice(0, 200), k: d.k, i: Array.isArray(d.i) ? d.i.map((x) => String(x).slice(0, 2000)) : [], n: String(d.n || "").slice(0, 3000) };
    day.key = ["kraft", "lauf", "station", "sim", "race"].includes(day.k);
    day.joint = ["lauf", "station", "sim", "race"].includes(day.k);
    if (d.race || d.k === "race") { day.race = true; race = i; }
    days[i] = day;
  }
  if (!Object.keys(days).length) throw new Error("Die Plan-Datei enthält keine gültigen Tage.");
  const blocks = (Array.isArray(o.plan.blocks) ? o.plan.blocks : []).filter((b) => isObj(b) && b.id && Number.isInteger(b.start)).map((b) => ({ id: String(b.id), name: String(b.name || b.id), start: b.start, end: Number.isInteger(b.end) ? b.end : b.start }));
  const weeks = (Array.isArray(o.plan.weeks) ? o.plan.weeks : []).filter((w) => isObj(w) && Number.isInteger(w.start)).map((w) => ({ n: w.n, name: String(w.name || ""), start: w.start, ...(w.km > 0 ? { km: +w.km } : {}) }));
  return { days, meta: { blocks, weeks, race, warnings } };
}
