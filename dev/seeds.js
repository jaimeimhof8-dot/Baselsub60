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

  // Beispielstand «analyse»: fünf Einheitstypen mit 1-s-Zeitreihen, Garmin-Zonen und Training Effect (nur Testkopie, erfundene Werte).
  // Direktlink: http://localhost:8081/?seed=analyse&heute=2026-10-22   (Di 13.10. Intervall-Lauf, Mi 14.10. Zone-2-Rad, Do 22.10. Kompromiss-Einheit). Der lockere Lauf braucht einen Plantag ohne Wiederholungen und ist hier nicht enthalten.
  const GZ = { bounds: [114, 141, 157, 167, 175], secs: [886, 498, 312, 937, 263] };
  const mk1 = (segs, seed, kind) => {
    const r = rng(seed), T = segs[segs.length - 1].t1, o = { n: 0, res: 1, hi: 1, t: [], d: [], hr: [], v: [], el: [], cad: [] };
    if (kind === "bike") o.pw = [];
    let v = segs[0].v, hr = segs[0].hr[0], d = 0, cad = segs[0].cad;
    for (let t = 0; t <= T; t++) {
      const sg = segs.find((q) => t >= q.t0 && t < q.t1) || segs[segs.length - 1], k = (t - sg.t0) / (sg.t1 - sg.t0);
      v += (sg.v - v) * 0.15; hr += (sg.hr[0] + (sg.hr[1] - sg.hr[0]) * k - hr) * 0.02 + (r() - 0.5) * 0.9; cad += (sg.cad - cad) * 0.08 + (r() - 0.5) * 3;
      const vn = Math.max(0.5, v * (1 + (r() - 0.5) * 0.09));
      o.t.push(t); o.d.push(Math.round(d)); o.hr.push(Math.round(hr)); o.v.push(Math.round(vn * 100)); o.cad.push(Math.round(cad));
      o.el.push(kind === "bike" ? null : Math.round((412 + 7 * Math.sin(t / 380) + 3 * Math.sin(t / 95)) * 10));
      if (kind === "bike") o.pw.push(Math.round(sg.pw * (1 + (r() - 0.5) * 0.12)));
      d += v;
    }
    o.n = o.t.length;
    return o;
  };
  const seg = (t0, t1, pace, hr0, hr1, cad, extra = {}) => ({ t0, t1, v: 1000 / pace, hr: [hr0, hr1], cad, ...extra });
  const analyse = () => {
    const S = voll();
    for (const i of [1, 2, 10]) { for (let j = 0; j < 6; j++) S.done[day(i) + "|" + j] = true; S.rpe[day(i)] = 6; }
    const iv = [seg(0, 653, 336, 128, 152, 162), seg(653, 1013, 240, 160, 174, 180), seg(1013, 1131, 560, 172, 150, 150), seg(1131, 1489, 240.5, 158, 176, 181), seg(1489, 1610, 570, 174, 152, 150), seg(1610, 1971, 239.5, 160, 177, 181), seg(1971, 2092, 580, 176, 154, 150), seg(2092, 2460, 245, 162, 183, 178), seg(2460, 3222, 362, 166, 134, 163)];
    const lapsIv = [L(1940, 653, 140), L(1500, 360, 167), L(200, 118, 158), L(1500, 358, 168), L(200, 121, 160), L(1500, 361, 169), L(200, 121, 162), L(1500, 368, 172), L(2100, 762, 150)];
    const bike = [seg(0, 300, 1000 / 7.6, 112, 132, 82, { pw: 150 }), seg(300, 3300, 1000 / 7.8, 134, 146, 88, { pw: 190 }), seg(3300, 3600, 1000 / 7.0, 146, 128, 80, { pw: 120 })];
    const comp = [seg(0, 600, 420, 120, 140, 160), seg(600, 1080, 300, 150, 164, 172), seg(1080, 1200, 700, 160, 140, 140), seg(1200, 1680, 305, 152, 166, 172), seg(1680, 1900, 500, 150, 130, 150)];
    const lapsComp = [L(1500, 600, 130), L(1600, 480, 158), L(150, 120, 150), L(1550, 480, 160), L(400, 220, 140)];
    const act = (id, i, group, type, name, series, laps, extra) => ({ id, src: "garmin", date: iso(i), start: iso(i) + "T18:05", got: Date.now(), type, group, name, time: series.t[series.n - 1], dist: series.d[series.n - 1], hr: Math.round(series.hr.reduce((a, b) => a + b, 0) / series.n), maxHr: 187, lapsV: 3, laps, series, zones: GZ, ...extra });
    S.strava = { acts: {
      a1: act("a1", 1, "run", "Run", "Thun Laufen", mk1(iv, 7), lapsIv, { te: { a: 3.8, n: 2.2 }, load: 187 }),
      a2: act("a2", 2, "ride", "Ride", "Indoor-Radfahren", mk1(bike, 11, "bike"), [L(3000, 1800, 138), L(3000, 1800, 144)], { watts: 188, te: { a: 2.6, n: 0 }, load: 96 }),
      a4: act("a4", 10, "strength", "Workout", "Kraft + Compromised Running", mk1(comp, 17), lapsComp, { te: { a: 3.1, n: 1.4 }, load: 140 }),
    } };
    return S;
  };
  return {
    analyse,
    vergleich,
    leer: () => ({ onb: { strava: true } }),
    voll,
    checkin: () => { const S = voll(); S.checkin[day(15)] = { sleep: "g", sore: "y", energy: "g", pain: "g" }; return S; },
  };
})();
