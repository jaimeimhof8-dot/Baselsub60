// Profilwerte (Arbeitsgewichte, Tests & Benchmarks) pro Person. Reine Funktionen, ohne DOM.
// Gespeicherte Form in S.tests (historisch zwei Spalten): lauf:{j:[4],m:[4]}, station:{r:{j,m}}, trans:[6].
// j = Jaime, m = Jimoh. Jeder bearbeitet nur seine eigene Spalte; die des Partners kommt aus dessen Konto.
import { cleanWeight } from "./weights.js";

export const STATIONS = 8, REPS = 4, TRANS = 6;

/** Spalte einer Person in S.tests. */
export const colOf = (name) => (name === "Jimoh" ? "m" : "j");

const str = (v) => (v == null ? "" : String(v).slice(0, 12));

/** Testwerte einer Person aus einem gespeicherten tests-Objekt: {lauf:[4], station:[8], trans:[6]}. */
export function personTests(tests, col) {
  const t = tests || {}, lauf = (t.lauf && t.lauf[col]) || [], st = t.station || {};
  return {
    lauf: Array.from({ length: REPS }, (_, r) => str(lauf[r])),
    station: Array.from({ length: STATIONS }, (_, r) => str(st[r] && st[r][col])),
    trans: Array.from({ length: TRANS }, (_, r) => str((t.trans || [])[r])),
  };
}

/** Nur gültige Gewichte übernehmen (Daten des Partners kommen vom Server, nicht vom eigenen Gerät). */
export function cleanWeights(w) {
  const out = {};
  for (const [k, v] of Object.entries(w && typeof w === "object" ? w : {})) { const c = cleanWeight(v); if (c && k.length <= 60) out[k] = c; }
  return out;
}

/** Zeile aus partner_profile() → Profil des Partners (nur lesen). null, wenn es keinen Partner-Stand gibt. */
export function partnerProfile(row) {
  if (!row || typeof row.name !== "string") return null;
  return { name: row.name, weights: cleanWeights(row.weights), tests: personTests(row.tests, colOf(row.name)), at: row.updated_at || null };
}
