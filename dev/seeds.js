// Beispielstände für das Test-Labor (Testkopie auf Port 8081). Plan-Start ist Montag 12.10.2026, «heute» = 27.10.2026 (Tag 15, Woche 3).
// Aus _design-werkzeuge/shoot2.mjs übernommen. Wird von dev/testlab.js vor dem Start der App in localStorage["hx"] geschrieben.
window.TL_SEEDS = (() => {
  const d = (i) => new Date(2026, 9, 12 + i);
  const day = (i) => `${d(i).getFullYear()}-${d(i).getMonth() + 1}-${d(i).getDate()}`;
  const iso = (i) => `${d(i).getFullYear()}-${String(d(i).getMonth() + 1).padStart(2, "0")}-${String(d(i).getDate()).padStart(2, "0")}`;
  const voll = () => {
    const S = { onb: { strava: true }, done: {}, rpe: {}, checkin: {}, garmin: { well: {}, at: Date.now(), conn: true } };
    for (let i = 0; i < 15; i++) {
      if (i % 7 === 4 || i % 7 === 6) continue;
      for (let j = 0; j < 6; j++) S.done[day(i) + "|" + j] = true;
      S.rpe[day(i)] = 5 + ((i * 3) % 4);
    }
    for (let i = 0; i < 16; i++)
      S.garmin.well[iso(i)] = { readiness: 55 + ((i * 7) % 35), hrv: 52 + ((i * 5) % 14), rhr: 47 + ((i * 3) % 5), bb: 40 + ((i * 11) % 50), sleepH: 6.4 + ((i * 3) % 12) / 10, sleepScore: 70 + ((i * 7) % 20) };
    return S;
  };
  return {
    leer: () => ({ onb: { strava: true } }),
    voll,
    checkin: () => { const S = voll(); S.checkin[day(15)] = { sleep: "g", sore: "y", energy: "g", pain: "g" }; return S; },
  };
})();
