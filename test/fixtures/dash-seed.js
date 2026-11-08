// Beispielstand für das Handy-Dashboard (nur Testkopie): abgeschlossene Einheiten mit realistischen Uhr-Daten.
// Keine echten Garmin-Daten von Jaime – alle Zahlen sind erfundene, aber plausible Beispielwerte.
// Plan-Start Mo 12.10.2026 (Tag 0). mode "old" = Garmin-Einheiten ohne lapsV (so wie vor dem Runden-Update gespeichert).
export const dashSeed = (mode = "new") => {
  const d = (i) => new Date(2026, 9, 12 + i);
  const key = (i) => `${d(i).getFullYear()}-${d(i).getMonth() + 1}-${d(i).getDate()}`;
  const iso = (i) => `${d(i).getFullYear()}-${String(d(i).getMonth() + 1).padStart(2, "0")}-${String(d(i).getDate()).padStart(2, "0")}`;
  const S = { onb: { strava: true }, done: {}, rpe: {}, val: {}, notes: {}, edit: {}, strava: { acts: {}, at: Date.now() }, garmin: { well: {}, at: Date.now(), conn: { name: "Jaime" } } };
  const finish = (i, n, rpe) => { for (let j = 0; j < n; j++) S.done[key(i) + "|" + j] = 1; S.rpe[key(i)] = rpe; };
  const act = (id, i, o) => { S.strava.acts[id] = { id, src: "garmin", date: iso(i), got: Date.now() - (30 - i) * 864e5, ...o }; };
  // Tag 0 Kraft (ohne Runden, mit Puls)
  finish(0, 6, 7);
  act("g0", 0, { type: "strength_training", group: "strength", name: "Kraft", time: 3900, hr: 112, maxHr: 158, kcal: 380, lapsV: mode === "old" ? undefined : 3 });
  // Tag 1 Lauf 4×1 km mit 2′ Trabpause (Einlaufen, 4 Arbeit, 3 Pause, Auslaufen)
  finish(1, 4, 8);
  const L = (d, t, hr) => ({ d, t, hr });
  act("g1", 1, { type: "running", group: "run", name: "Intervalle", time: 15 * 60 + 4 * 236 + 3 * 120 + 10 * 60, dist: 2500 + 4000 + 3 * 280 + 1900, hr: 151, maxHr: 182, lapsV: 3,
    laps: [L(2500, 900, 129), L(1000, 238, 168), L(280, 120, 149), L(1000, 236, 173), L(280, 120, 152), L(1000, 235, 176), L(280, 120, 154), L(1000, 241, 181), L(1900, 600, 140)] });
  // Tag 3 Stationstag mit Rundenplan (Einlaufen, 2 Runden Station → Lauf + Pause, Referenz, Auslaufen)
  S.edit[3] = { t: "Stationen-Benchmark mit Jimoh", k: "station", n: "", i: [
    "Einlaufen 1,5 km @ 5:30/km (8:15)",
    "Runde 1 frisch ohne Station: 1 km @ 4:30/km (4:30)",
    "Runde 1: SkiErg 1000 m (Ziel 4:10) → 1 km @ 4:30/km (4:30), 2 Min Pause",
    "Runde 2: Sled Push 50 m mit 102 kg (Ziel 1:30) → 1 km @ 4:30/km (4:30), 2 Min Pause",
    "Auslaufen 1 km @ 5:30/km (5:30)",
  ] };
  finish(3, 5, 8);
  act("g3", 3, { type: "strength_training", group: "strength", name: "HYROX", time: 2900, dist: 4500, hr: 158, maxHr: 187, lapsV: 3,
    laps: [L(1500, 495, 130), L(1000, 266, 164), L(1000, 250, 169), L(1000, 288, 174), L(120, 118, 158), L(50, 95, 176), L(1000, 301, 179), L(120, 100, 160), L(1000, 330, 150)] });
  // Tag 5 Bike ohne Daten-Details (Garmin ohne Runden: «Kein Puls»)
  finish(5, 1, 4);
  act("g5", 5, { type: "cycling", group: "ride", name: "Bike", time: 4800, dist: 32000, lapsV: 3 });
  return S;
};
