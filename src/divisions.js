// HYROX-Divisionen: Wettkampfgewichte der Stationen. Reine Daten und Funktionen, ohne DOM.
// Quelle: veröffentlichte HYROX-Gewichtstabellen (Sleds inkl. Schlitten, Farmers pro Hand). Doubles nutzen die Gewichte der Kategorie.
// Gespeicherte Form (S.division): {gender:"m"|"w", cat:"pro"|"open", mode:"doubles"|"solo"}

export const DEFAULT_DIVISION = { gender: "m", cat: "pro", mode: "doubles" };

const W = {
  "m-pro": { push: 202, pull: 153, farmers: 32, sandbag: 30, ball: 9 },
  "m-open": { push: 152, pull: 103, farmers: 24, sandbag: 20, ball: 6 },
  "w-pro": { push: 152, pull: 103, farmers: 24, sandbag: 20, ball: 6 },
  "w-open": { push: 102, pull: 78, farmers: 16, sandbag: 10, ball: 4 },
};

/** Division bereinigen: ungültige oder fehlende Felder fallen auf den Standard (Men Pro Doubles). */
export function normDivision(d) {
  const x = d || {};
  return {
    gender: x.gender === "w" ? "w" : "m",
    cat: x.cat === "open" ? "open" : x.cat === "pro" ? "pro" : DEFAULT_DIVISION.cat,
    mode: x.mode === "solo" ? "solo" : "doubles",
  };
}

/** Wettkampfgewichte (kg) der Division: {push, pull, farmers, sandbag, ball}. */
export const stationKg = (d) => W[`${normDivision(d).gender}-${normDivision(d).cat}`];

// Stationszeile → Gewichtsschlüssel. Nur Zeilen, die mit dem Stationsnamen beginnen ("10 Sled Push moderat" in Zirkeln nicht).
const STATIONS = [
  [/^sled push\b/i, "push", (kg) => `${kg} kg`],
  [/^sled pull\b/i, "pull", (kg) => `${kg} kg`],
  [/^farmers? carry\b/i, "farmers", (kg) => `2×${kg} kg`],
  [/^sandbag lunges?\b/i, "sandbag", (kg) => `${kg} kg`],
  [/^(\d+\s*)?wall ?balls?\b/i, "ball", (kg) => `${kg} kg`],
];

/** Wettkampfgewicht für eine Stationszeile, z. B. "Sled Push" → "202 kg"; sonst "". */
export function stationWeight(text, division) {
  const t = String(text || "").trim();
  for (const [re, key, fmt] of STATIONS) if (re.test(t)) return fmt(stationKg(division)[key]);
  return "";
}

export const DOUBLES_SHARE = 0.55; // Anteil der Solo-Stationszeit im Doubles (Arbeit wird geteilt, Wechsel kosten)

// Fallback für Stationen ohne eigenen Benchmark, verankert an einem echten Rennen: HYROX St. Gallen 2026, Doubles Pro Men
// (Platz 58/256): Stationen zusammen 24:03, aufgeteilt nach dem Rennmodell des Plans. Als Solo-Zeit gespeichert, damit
// DOUBLES_SHARE wieder die Teamzeit ergibt. Die anderen Divisionen sind Annahmen (Faktor auf diesen Anker), keine Messwerte.
// Reihenfolge wie review.STATIONS: SkiErg, Sled Push, Sled Pull, Burpee BJ, RowErg, Farmers, Lunges, Wall Balls.
const TEAM_ANCHOR = [228, 156, 187, 166, 234, 83, 187, 202]; // Summe 1443 s = 24:03
const FACTOR = { "m-pro": 1, "m-open": 1, "w-pro": 1.12, "w-open": 1.2 };
const FALLBACK_S = Object.fromEntries(Object.entries(FACTOR).map(([k, f]) => [k, TEAM_ANCHOR.map((v) => Math.round((v * f) / DOUBLES_SHARE))]));

/** Fallback-Stationszeiten (Solo, Sekunden) der Division. */
export const fallbackStations = (d) => FALLBACK_S[`${normDivision(d).gender}-${normDivision(d).cat}`].slice();
