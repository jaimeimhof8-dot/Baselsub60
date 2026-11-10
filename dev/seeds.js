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
  // Demo «vergleich»: Lauf-Intervall am Di 13.10.2026 mit 12 Garmin-Runden + passende Partner-Einheit (nur Testkopie, erfundene Beispielwerte).
  // Direktlink: http://localhost:8081/?seed=vergleich&heute=2026-10-13
  const L = (d, t, hr) => ({ d, t, hr });
  const lapsMe = [L(1500, 495, 128), L(1000, 244, 163), L(400, 170, 150), L(1000, 241, 170), L(400, 168, 156), L(1000, 243, 175), L(400, 172, 158), L(1000, 249, 180), L(400, 176, 160), L(1000, 330, 148), L(1000, 335, 139), L(500, 170, 132)];
  const lapsPa = [L(1500, 480, 132), L(1000, 238, 168), L(400, 160, 154), L(1000, 239, 174), L(400, 164, 160), L(1000, 245, 178), L(400, 166, 162), L(1000, 244, 183), L(400, 171, 163), L(1000, 318, 151), L(1000, 322, 143), L(500, 165, 136)];
  // Sekundenreihe aus den Runden erzeugen (Demo): Tempo je Runde mit Rauschen, Puls folgt träge dem Rundenpuls plus Drift, Höhe sanft wellig, Kadenz ~ Tempo. Auf ~600 Punkte reduziert (wie reduceSeries).
  const rng = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const mkSeries = (laps, seed, off) => {
    const r = rng(seed), T = laps.reduce((x, l) => x + l.t, 0), step = Math.max(1, Math.ceil(T / 600)), pts = [];
    let hr = laps[0].hr - 8, dist = 0, t = 0;
    for (const l of laps) {
      const v = l.d / l.t;
      for (let k = 0; k < l.t; k++, t++) {
        const sp = Math.max(0, v * (1 + (r() - 0.5) * 0.06) * (k < 6 ? 0.8 + k * 0.03 : 1));
        hr += (l.hr + t / T * 4 - hr) * 0.045 + (r() - 0.5) * 0.9;
        dist += sp;
        pts.push({ t: t + 1, d: dist, hr, v: sp, el: 412 + 7 * Math.sin(t / 380 + off) + 3 * Math.sin(t / 95) + (r() - 0.5) * 0.4, cad: Math.round(sp < 1 ? 0 : 150 + sp * 6.4 + (r() - 0.5) * 3) });
      }
    }
    const o = { n: 0, t: [], d: [], hr: [], v: [], el: [], cad: [] };
    for (let i = 0; i < pts.length; i += step) {
      const b = pts.slice(i, i + step), m = (k) => b.reduce((x, p) => x + p[k], 0) / b.length, e = b[b.length - 1];
      o.t.push(e.t); o.d.push(Math.round(e.d)); o.hr.push(Math.round(m("hr"))); o.v.push(Math.round(m("v") * 100)); o.el.push(Math.round(m("el") * 10)); o.cad.push(Math.round(m("cad")));
    }
    o.n = o.t.length;
    return o;
  };
  // Zweiter Demo-Tag OHNE Zeitreihe (Do 15.10.2026): nur Runden, wie bei Einheiten, die vor dem Update geladen wurden. Dort zeigt der Vergleich Rundenblöcke und den Hinweis.
  const lapsMe2 = [L(1500, 500, 130), L(1000, 262, 160), L(1000, 266, 168), L(1000, 270, 172), L(1000, 281, 176), L(1000, 289, 178), L(1000, 295, 180), L(500, 160, 150), L(1000, 335, 141)];
  const lapsPa2 = [L(1500, 485, 134), L(1000, 255, 166), L(1000, 259, 172), L(1000, 262, 176), L(1000, 270, 180), L(1000, 278, 182), L(1000, 283, 184), L(500, 152, 156), L(1000, 322, 146)];
  const sum = (a, k) => a.reduce((x, l) => x + l[k], 0);
  const avgHr = (a) => Math.round(a.reduce((x, l) => x + l.hr * l.t, 0) / sum(a, "t"));
  const vergleich = () => {
    const S = voll();
    for (let j = 0; j < 4; j++) S.done[day(1) + "|" + j] = true;
    S.rpe[day(1)] = 8;
    for (let j = 0; j < 8; j++) S.done[day(3) + "|" + j] = true;
    S.rpe[day(3)] = 8;
    S.strava = { acts: { demo2: { id: "demo2", src: "garmin", date: iso(3), got: Date.now(), type: "running", group: "run", name: "Tempoläufe (Demo)", time: sum(lapsMe2, "t"), dist: sum(lapsMe2, "d"), hr: avgHr(lapsMe2), maxHr: 182, lapsV: 3, laps: lapsMe2 }, demo1: { id: "demo1", src: "garmin", date: iso(1), got: Date.now(), type: "running", group: "run", name: "Intervalle (Demo)", time: sum(lapsMe, "t"), dist: sum(lapsMe, "d"), hr: avgHr(lapsMe), maxHr: 182, lapsV: 3, laps: lapsMe, series: mkSeries(lapsMe, 11, 0) } }, at: Date.now() };
    return S;
  };
  window.TL_PARTNER_DEMO = { [iso(3)]: [{ group: "run", time: sum(lapsPa2, "t"), dist: sum(lapsPa2, "d"), hr: avgHr(lapsPa2), laps: lapsPa2 }], [iso(1)]: [{ group: "run", time: sum(lapsPa, "t"), dist: sum(lapsPa, "d"), hr: avgHr(lapsPa), laps: lapsPa, series: mkSeries(lapsPa, 29, 0.4) }] };
  return {
    vergleich,
    leer: () => ({ onb: { strava: true } }),
    voll,
    checkin: () => { const S = voll(); S.checkin[day(15)] = { sleep: "g", sore: "y", energy: "g", pain: "g" }; return S; },
  };
})();
