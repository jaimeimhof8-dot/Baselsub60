import { test } from "node:test";
import assert from "node:assert/strict";
import { alignLaps } from "../src/align.js";

// Stationstag: Einlaufen, dann 4 × (Lauf 1 km · Station · Pause), Auslaufen
const mk = () => {
  const st = [{ kind: "warm", goal: 300 }];
  for (let r = 0; r < 4; r++) st.push({ kind: "run", goal: 240 }, { kind: "station", goal: 75 + r * 5 }, { kind: "rest", goal: 90 });
  st.push({ kind: "cool", goal: 300 });
  return st;
};
const STEPS = mk();
const truth = (steps, jit = () => 0) => steps.map((s, k) => ({ t: Math.round(s.goal * (1 + jit(k))), d: s.kind === "run" ? 1000 : s.kind === "warm" || s.kind === "cool" ? 800 : 0, hr: 150, _s: k }));
const wob = (k) => ((k * 7) % 5 - 2) * 0.03; // ±6 %

test("alle Runden vorhanden: alles zugeordnet, alles sicher", () => {
  const r = alignLaps(truth(STEPS, wob), STEPS);
  assert.ok(r);
  assert.equal(r.times.filter((t) => t != null).length, STEPS.length);
  assert.ok(r.sure.every((x) => x));
  assert.equal(r.quality, 1);
});

test("Uhrabsturz nach 9 von 14 Schritten: vorhandene zugeordnet, Rest nicht aufgezeichnet", () => {
  const laps = truth(STEPS, wob).slice(0, 9);
  const r = alignLaps(laps, STEPS);
  assert.ok(r);
  assert.equal(r.tail, STEPS.length - 9);
  assert.deepEqual(r.times.slice(9), Array(STEPS.length - 9).fill(null));
  assert.equal(r.times.slice(0, 9).filter((t) => t != null).length, 9);
});

test("Absturz mitten in einer Station: letzte Runde ist unvollständig und wird nicht gewertet", () => {
  const laps = truth(STEPS, wob).slice(0, 8);
  laps[7] = { ...laps[7], t: 20 };
  const r = alignLaps(laps, STEPS);
  assert.ok(r);
  assert.equal(r.incomplete, 7);
  assert.equal(r.times[7], null);
  assert.equal(r.times[6] != null, true);
});

test("Doppelt gedrückt (Station in zwei Runden): zusammengefasst", () => {
  const laps = truth(STEPS, wob);
  const st = laps[2];
  laps.splice(2, 1, { ...st, t: 40 }, { ...st, t: st.t - 40 });
  const r = alignLaps(laps, STEPS);
  assert.ok(r);
  assert.equal(r.times[2], truth(STEPS, wob)[2].t);
});

test("Viele Zusatzdrücker (mehr als 3 Runden Differenz) bleiben zuordenbar", () => {
  const laps = truth(STEPS, wob);
  for (const at of [12, 9, 7, 5, 3, 1]) laps.splice(at, 0, { t: 6, d: 0, hr: 150, _s: -1 });
  const r = alignLaps(laps, STEPS);
  assert.ok(r);
  assert.equal(r.times.filter((t) => t != null).length, STEPS.length);
});

test("Pausen nicht gelappt: Arbeit zugeordnet", () => {
  const laps = truth(STEPS, wob).filter((_, k) => STEPS[k].kind !== "rest");
  const r = alignLaps(laps, STEPS);
  assert.ok(r);
  assert.equal(r.times.filter((t, k) => t != null && STEPS[k].kind !== "rest").length, laps.length);
});

test("Passt nichts zum Plan: null, kein Raten", () => {
  assert.equal(alignLaps([{ t: 2400, d: 8000 }], STEPS), null);
  assert.equal(alignLaps([], STEPS), null);
  assert.equal(alignLaps(truth(STEPS), []), null);
});

// Zufallstest: Eine als «sicher» gemeldete Zuordnung darf NIE auf eine Runde eines anderen Schritts zeigen.
function rng(seed) { let x = seed; return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296); }
test("Zufallstest: kein «sicher» auf einer falschen Runde (500 Läufe)", () => {
  let sureSteps = 0, runs = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const R = rng(seed);
    let laps = truth(STEPS, () => (R() - 0.5) * 0.2);
    // Mutationen: Runden löschen, doppelt drücken, Zusatzdruck, Abbruch am Ende
    for (let q = 0; q < Math.floor(R() * 4); q++) {
      const op = R(), at = Math.floor(R() * laps.length), l = laps[at];
      if (!l) continue;
      if (op < 0.3 && laps.length > 5) laps.splice(at, 1);
      else if (op < 0.6) { const c = Math.max(5, Math.floor(l.t * R())); const dc = Math.round(l.d * c / l.t); laps.splice(at, 1, { ...l, t: c, d: dc }, { ...l, t: Math.max(1, l.t - c), d: l.d - dc }); }
      else if (op < 0.8) laps.splice(at, 0, { t: 3 + Math.floor(R() * 10), d: 0, hr: 150, _s: -1 });
      else laps = laps.slice(0, Math.max(4, laps.length - 1 - Math.floor(R() * 5)));
    }
    const r = alignLaps(laps, STEPS);
    if (!r) continue;
    runs++;
    STEPS.forEach((_, k) => {
      if (!r.sure[k] || r.laps[k] == null) return;
      sureSteps++;
      const owners = new Set(r.merged[r.laps[k]].parts.map((p) => p._s));
      owners.delete(-1);
      assert.ok(owners.size === 1 && owners.has(k), `Seed ${seed}: Schritt ${k} sicher, aber Runden gehören zu ${[...owners]}`);
    });
  }
  assert.ok(runs > 300 && sureSteps > 1000, `zu wenig Abdeckung: ${runs} Läufe, ${sureSteps} sichere Schritte`);
});

import { watchCheck } from "../src/laps.js";
test("watchCheck: Absturz wird als Teilübernahme gezeigt, nicht als «nicht zuordenbar»", () => {
  const laps = truth(STEPS, wob).slice(0, 9);
  const w = watchCheck({ src: "garmin", lapsV: 3, laps }, { steps: STEPS });
  assert.equal(w.splits.state, "ok");
  assert.equal(w.splits.mode, "dp");
  assert.ok(w.splits.tail > 0);
  assert.ok(w.splits.got >= 5);
});
test("watchCheck: völlig anderes Bild bleibt «bad»", () => {
  const w = watchCheck({ src: "garmin", lapsV: 3, laps: [{ t: 2400, d: 8000 }] }, { steps: STEPS });
  assert.equal(w.splits.state, "bad");
});

import { intervals } from "../src/dashboard.js";
test("Steigerungsläufe 4×100 m (je ~18 s) werden als Intervalle erkannt, nicht verworfen", () => {
  const laps = [{ d: 1500, t: 540 }, { d: 100, t: 18 }, { d: 100, t: 45 }, { d: 100, t: 17 }, { d: 100, t: 46 }, { d: 100, t: 18 }, { d: 100, t: 44 }, { d: 100, t: 17 }, { d: 1000, t: 250 }];
  const r = intervals(laps, "4×100 m Steigerungen");
  assert.equal(r.kind, "intervals");
  assert.equal(r.work.length, 4);
});

// ---- Erweiterter Zufallstest (Review-Befund): mehrere Plan-Layouts, Mutation «zwei Schritte in einer Runde» ----
const L1 = (kind, goal) => ({ kind, goal });
const LAYOUTS = {
  station: STEPS,
  intervalle: [L1("warm", 600), ...Array.from({ length: 6 }, () => [L1("run", 240), L1("rest", 90)]).flat(), L1("cool", 600)],
  intervalleOhnePause: [L1("warm", 600), ...Array.from({ length: 6 }, () => L1("run", 240)), L1("cool", 600)],
  zweiLaeufe: [L1("warm", 600), L1("run", 300), L1("run", 300), L1("station", 120), L1("run", 300), L1("run", 300), L1("cool", 600)],
  nurStationen: Array.from({ length: 8 }, () => L1("station", 90)),
};
const mkLaps = (steps, R) => steps.map((s, k) => ({ t: Math.round(s.goal * (1 + (R() - 0.5) * 0.12)), d: s.kind === "run" ? 1000 : s.kind === "warm" || s.kind === "cool" ? 1500 : 0, hr: 150, _s: [k] }));
const MUTS = {
  vergessen: (laps, R) => { const i = Math.floor(R() * (laps.length - 1)); const a = laps[i], b = laps[i + 1]; laps.splice(i, 2, { t: a.t + b.t, d: a.d + b.d, hr: 150, _s: [...a._s, ...b._s] }); },
  abbruch: (laps, R) => { laps.splice(Math.max(3, laps.length - 1 - Math.floor(R() * 4))); },
  fehlt: (laps, R) => { laps.splice(Math.floor(R() * laps.length), 1); },
  zusatz: (laps, R) => { laps.splice(Math.floor(R() * laps.length), 0, { t: 5 + Math.floor(R() * 8), d: 0, hr: 150, _s: [-1] }); },
  doppelt: (laps, R) => { const i = Math.floor(R() * laps.length), l = laps[i], c = Math.max(5, Math.floor(l.t * R())); laps.splice(i, 1, { ...l, t: c, d: Math.round(l.d * c / l.t) }, { ...l, t: Math.max(1, l.t - c), d: l.d - Math.round(l.d * c / l.t) }); },
};
for (const [ln, steps] of Object.entries(LAYOUTS)) for (const [mn, mut] of Object.entries(MUTS)) {
  test(`Zufallstest ${ln} / ${mn}: nie «sicher» auf fremder Runde`, () => {
    let sureSteps = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const R = rng(seed * 31 + 7);
      const laps = mkLaps(steps, R);
      mut(laps, R);
      const r = alignLaps(laps, steps);
      if (!r) continue;
      steps.forEach((_, k) => {
        if (!r.sure[k] || r.laps[k] == null) return;
        sureSteps++;
        const owners = new Set(r.merged[r.laps[k]].parts.flatMap((p) => p._s));
        owners.delete(-1);
        assert.ok(owners.size === 1 && owners.has(k), `${ln}/${mn} Seed ${seed}: Schritt ${k} sicher, Runden gehören zu ${[...owners]}`);
      });
    }
  });
}
test("Review H1: vergessener Druck (Einlaufen + Lauf in einer Runde) wird nie als sicher gemeldet", () => {
  const P = LAYOUTS.zweiLaeufe;
  const laps = [{ t: 900, d: 3060 }, { t: 300, d: 1260 }, { t: 120, d: 0 }, { t: 300, d: 1260 }, { t: 300, d: 1260 }, { t: 600, d: 1800 }];
  const r = alignLaps(laps, P);
  assert.ok(!r || !r.sure[0]);
});
test("Ungültige Eingaben: kein Absturz", () => {
  assert.equal(alignLaps([{ t: 240 }], [null]), null);
  assert.doesNotThrow(() => alignLaps([{ t: "240", d: NaN }, { t: NaN }], STEPS));
});

import { repSummary as repSummaryLaps, segmentRuns as segLaps } from "../src/laps.js";
test("Strides: «100 m» von der Uhr als 90–99 m gemessen wird nicht verworfen (4×100 m, nicht nur 2)", () => {
  const plan = "Einlaufen 1 km @ 5:30/km (5:30) → Steigerungen 4×100 m @ 3:40/km (0:22)";
  const laps = [{ d: 1002, t: 331 }, { d: 97, t: 23 }, { d: 92, t: 48 }, { d: 103, t: 22 }, { d: 95, t: 50 }, { d: 99, t: 23 }, { d: 94, t: 47 }, { d: 101, t: 21 }, { d: 90, t: 52 }, { d: 1000, t: 290 }];
  assert.equal(intervals(laps, plan).work.length, 4);
  assert.equal(segLaps(laps, plan).length, 4);
  assert.match(repSummaryLaps({ laps }, plan), /^4×100 m: 0:23 · 0:22 · 0:23 · 0:21/);
});
test("Strides: Abbruch nach dem Einlaufen (nur 2 von 4 Steigerungen) gibt keine erfundenen Wiederholungen", () => {
  const plan = "Einlaufen 1 km @ 5:30/km (5:30) → Steigerungen 4×100 m @ 3:40/km (0:22)";
  const laps = [{ d: 1002, t: 331 }, { d: 97, t: 23 }, { d: 92, t: 48 }, { d: 103, t: 22 }];
  const iv = intervals(laps, plan);
  assert.ok(iv.kind !== "intervals" || iv.work.length <= 2);
});

// ---- Puls (Pulsgurt) und Übergangsrunden, Plan v3: Compromised Running «Runde N: Station → 1 km, Pause» ----
import { alignSplits } from "../src/laps.js";
import { layoutOk } from "../src/align.js";
const CR = Array.from({ length: 8 }, () => [L1("station", 115), L1("run", 245), L1("rest", 120)]).flat();
const HR = { warm: 135, run: 166, station: 160, rest: 140, cool: 142, other: 150 };
// _o = Sekunden je echtem Plan-Schritt in dieser Runde. Eine Runde «gehört» einem Schritt, wenn ≥ 75 % ihrer Zeit von ihm stammen
// (ein paar Sekunden zu früh oder zu spät gedrückt sind keine fremde Runde, das kann kein Verfahren erkennen).
const mkHr = (steps, R, noise) => steps.map((s, k) => { const t = Math.round(s.goal * (1 + (R() - 0.5) * 0.16)); return { t, d: s.kind === "run" ? 1000 : s.kind === "warm" || s.kind === "cool" ? 1500 : 0, hr: Math.round(HR[s.kind] + k * 0.3 + (R() - 0.5) * 2 * noise), _o: { [k]: t } }; });
const addO = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = (o[k] || 0) + v; return o; };
const mix = (a, b) => ({ t: a.t + b.t, d: a.d + b.d, hr: Math.round((a.hr * a.t + b.hr * b.t) / (a.t + b.t)), _o: addO(a._o, b._o) });
const ownsMost = (lap, k) => ((lap._o || {})[k] || 0) >= 0.75 * lap.t;
const MUTS_HR = {
  vergessen: (laps, R) => { const i = Math.floor(R() * (laps.length - 1)); laps.splice(i, 2, mix(laps[i], laps[i + 1])); },
  abbruch: (laps, R) => { laps.splice(Math.max(3, laps.length - 1 - Math.floor(R() * 4))); },
  fehlt: (laps, R) => { laps.splice(Math.floor(R() * laps.length), 1); },
  zusatz: (laps, R) => { laps.splice(Math.floor(R() * laps.length), 0, { t: 5 + Math.floor(R() * 8), d: 0, hr: 150, _o: {} }); },
  // nur Runden eines einzigen Schritts teilen: eine geteilte Sammelrunde wäre ein zur falschen Zeit gedrückter Lap (in den Zeiten nicht erkennbar)
  doppelt: (laps, R) => { const i = Math.floor(R() * laps.length), l = laps[i]; if (Object.keys(l._o).length !== 1) return; const c = Math.max(5, Math.floor(l.t * R())), f = c / l.t, sc = (x) => Object.fromEntries(Object.entries(l._o).map(([k, v]) => [k, v * x])); laps.splice(i, 1, { ...l, t: c, d: Math.round(l.d * f), _o: sc(f) }, { ...l, t: Math.max(1, l.t - c), d: l.d - Math.round(l.d * f), _o: sc(1 - f) }); },
  uebergang: (laps, R) => { const i = 1 + Math.floor(R() * (laps.length - 1)); laps.splice(i, 0, { t: 20 + Math.floor(R() * 25), d: Math.floor(R() * 90), hr: laps[i - 1].hr, _o: {} }); },
  trinken: (laps, R) => { const i = 1 + Math.floor(R() * (laps.length - 1)); laps.splice(i, 0, { t: 50 + Math.floor(R() * 60), d: 0, hr: laps[i - 1].hr - 8, _o: {} }); },
};
const LAYOUTS_HR = { compromised: CR, ...LAYOUTS };
// noise 0 = ohne Pulsunterschiede (alle 150): prüft das Verhalten ohne Pulsgurt.
// «nurStationen» ohne «trinken»: Fehlt eine von 8 gleichen Stationen und ersetzt eine Trink-Runde gleicher Dauer sie, ist das in Zeit,
// Strecke und Puls identisch und von keinem Verfahren erkennbar (galt schon vor v3).
for (const noise of [3, 8, 0]) for (const [ln, steps] of Object.entries(LAYOUTS_HR)) {
  test(`Zufallstest ${noise ? `mit Puls ±${noise}` : "ohne Puls"} / ${ln}: nie «sicher» auf fremder Runde, auch bei 1–3 Störungen`, () => {
    let sure = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const R = rng(seed * 97 + noise);
      let laps = mkHr(steps, R, noise);
      if (!noise) laps = laps.map((l) => ({ ...l, hr: 150 }));
      const names = Object.keys(MUTS_HR).filter((x) => !(ln === "nurStationen" && x === "trinken"));
      for (let q = 1 + Math.floor(R() * 3); q > 0; q--) MUTS_HR[names[Math.floor(R() * names.length)]](laps, R);
      const r = alignLaps(laps, steps);
      if (r) steps.forEach((_, k) => {
        if (!r.sure[k] || r.laps[k] == null) return;
        sure++;
        const M = r.merged[r.laps[k]], own = M.parts.reduce((x, p) => x + ((p._o || {})[k] || 0), 0);
        assert.ok(own >= 0.75 * M.t, `${ln} Seed ${seed}: Schritt ${k} sicher, aber Runde gehört überwiegend anderen (${JSON.stringify(M.parts.map((p) => p._o))})`);
      });
      // Feste Zuordnung (gleiche Rundenzahl) darf ebenfalls nie eine fremde Runde eintragen
      const s = alignSplits(laps, steps);
      if (s.times) steps.forEach((_, k) => {
        const q = s.laps[k];
        if (q == null) return;
        assert.ok(ownsMost(laps[q], k), `${ln} Seed ${seed}: alignSplits ${s.mode} legt fremde Runde auf Schritt ${k} (${JSON.stringify(laps[q]._o)})`);
      });
    }
    assert.ok(sure > 150, `zu wenig Abdeckung: ${sure} sichere Schritte`);
  });
}

const crLaps = () => mkHr(CR, rng(5), 2);
test("Compromised Running: eine Übergangsrunde (25 s) macht nichts mehr unsicher", () => {
  const laps = crLaps();
  laps.splice(4, 0, { t: 25, d: 40, hr: laps[3].hr, _o: {} });
  const r = alignLaps(laps, CR);
  assert.equal(r.quality, 1);
});
test("Compromised Running: vergessener Druck in Runde 2 – mit Puls bleiben die Runden 3–8 sicher", () => {
  const laps = crLaps();
  laps.splice(3, 2, mix(laps[3], laps[4]));
  const r = alignLaps(laps, CR);
  assert.ok(r.hrUsed);
  for (let k = 6; k < CR.length; k++) if (CR[k].kind !== "rest") assert.ok(r.sure[k], `Schritt ${k}`);
  assert.equal(r.sure[3], false);
  assert.ok(r.why[3]);
});
test("Compromised Running: Absturz nach 16 von 24 Runden wird nicht als «Pausen nicht gelappt» eingetragen", () => {
  const laps = crLaps().slice(0, 16);
  assert.equal(alignSplits(laps, CR).times, null);
  const r = alignLaps(laps, CR);
  assert.equal(r.tail > 0, true);
  for (let k = 0; k < 15; k++) if (CR[k].kind !== "rest") assert.ok(r.sure[k], `Schritt ${k}`);
});
test("layoutOk: Lauf ohne Strecke oder Pause im Pulsberg wird abgelehnt, Station mit Ergometer-Metern nicht", () => {
  const steps = [L1("station", 115), L1("run", 245), L1("rest", 120)];
  assert.equal(layoutOk([{ t: 115, d: 500, hr: 160 }, { t: 245, d: 1000, hr: 166 }, { t: 120, d: 0, hr: 140 }], [{ ...steps[0], name: "SkiErg 500 m" }, steps[1], steps[2]], [0, 1, 2]), true);
  assert.equal(layoutOk([{ t: 115, d: 500, hr: 160 }, { t: 245, d: 1000, hr: 166 }, { t: 120, d: 0, hr: 140 }], steps, [0, 1, 2]), false); // Strecke ohne Planstrecke
  assert.equal(layoutOk([{ t: 115, d: 0, hr: 160 }, { t: 245, d: 0, hr: 166 }, { t: 120, d: 1000, hr: 140 }], steps, [0, 1, 2]), false);
  assert.equal(layoutOk([{ t: 115, d: 0, hr: 140 }, { t: 245, d: 1000, hr: 166 }, { t: 120, d: 0, hr: 175 }], steps, [0, 1, 2]), false);
});
test("Ohne Puls: vergessener Druck – betroffene Runde unsicher mit Grund (SkiErg 1:55 und Pause 2:00 sind ohne Puls nicht trennbar)", () => {
  const laps = crLaps().map((l) => ({ ...l, hr: null }));
  laps.splice(3, 2, { ...mix({ ...laps[3], hr: 1 }, { ...laps[4], hr: 1 }), hr: null });
  const r = alignLaps(laps, CR);
  assert.equal(r.hrUsed, false);
  assert.equal(r.sure[3], false);
  assert.ok(r.why[3]);
});
test("Ohne Puls, Absturz und vergessener Druck: nach der Störung nichts sicher (Verschiebung nicht auszuschliessen)", () => {
  const laps = crLaps().map((l) => ({ ...l, hr: null })).slice(0, 15);
  laps.splice(3, 2, { ...mix({ ...laps[3], hr: 1 }, { ...laps[4], hr: 1 }), hr: null });
  const r = alignLaps(laps, CR);
  assert.ok(r.tail > 0);
  assert.ok(r.sure.slice(3).every((x) => x !== true));
});
test("Langsamer Tag (alle Läufe +22 %) gilt nicht als Störung, ein einzelner Ausreisser schon", () => {
  const laps = crLaps().map((l) => (l.d ? { ...l, t: Math.round(l.t * 1.22) } : l));
  laps.splice(4, 0, { t: 25, d: 40, hr: laps[3].hr, _o: {} });
  assert.equal(alignLaps(laps, CR).quality, 1);
  const one = crLaps();
  one[7] = { ...one[7], t: Math.round(one[7].t * 1.4) };
  const r = alignLaps(one, CR);
  assert.equal(r ? r.sure[7] : false, false);
});
test("watchCheck nennt den Grund, wenn Schritte nicht sicher sind (Anzeige in der Prüfliste)", () => {
  const laps = crLaps();
  laps.splice(3, 2, mix(laps[3], laps[4]));
  const w = watchCheck({ src: "garmin", lapsV: 3, laps }, { steps: CR });
  assert.equal(w.splits.state, "ok");
  assert.ok(w.splits.unsure > 0);
  assert.match(w.splits.reason, /\(Schritt \d+\): /);
  const bad = watchCheck({ src: "garmin", lapsV: 3, laps: [{ t: 2400, d: 8000 }] }, { steps: CR });
  assert.equal(bad.splits.state, "bad");
  assert.ok(bad.splits.reason);
});
