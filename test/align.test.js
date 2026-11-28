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
      // «fehlt» höchstens einmal: Fehlen zwei Runden samt Zeit (ganze Periode ausgelassen), ist bei gleichen Perioden nicht erkennbar, welche.
      // «fehlt» und «trinken» nicht zusammen: ein ausgelassener Schritt, an dessen Stelle eine Trinkpause gleicher Länge mit Arbeitspuls steht,
      // ist aus Zeit, Strecke und Puls nicht erkennbar (bekannte Grenze, PLAN_RUNDENUEBERNAHME_V3.md).
      let gone = false, drank = false;
      for (let q = 1 + Math.floor(R() * 3); q > 0; q--) { const nm = names[Math.floor(R() * names.length)]; if ((nm === "fehlt" && (gone || drank)) || (nm === "trinken" && gone)) continue; if (nm === "fehlt") gone = true; if (nm === "trinken") drank = true; MUTS_HR[nm](laps, R); }
      const r = alignLaps(laps, steps);
      if (r) steps.forEach((_, k) => {
        if (!r.sure[k] || r.laps[k] == null) return;
        sure++;
        // Fremd ist nur Zeit anderer Plan-Schritte. Zeit ohne Schritt (Übergang, Trinken) zählt nicht. Eine reine Zusatzrunde ist nur
        // als Pause richtig, wenn die echte Pausenrunde fehlt: dann war das die Pause (gleiche Stelle, Pausenpuls).
        const M = r.merged[r.laps[k]], own = M.parts.reduce((x, p) => x + ((p._o || {})[k] || 0), 0);
        const stepTime = M.parts.reduce((x, p) => x + Object.values(p._o || {}).reduce((a, b) => a + b, 0), 0);
        const restHere = stepTime === 0 && steps[k].kind === "rest" && !laps.some((l) => (l._o || {})[k]);
        assert.ok(restHere || (stepTime > 0 && own >= 0.75 * stepTime), `${ln} Seed ${seed}: Schritt ${k} sicher, aber Runde gehört überwiegend anderen (${JSON.stringify(M.parts.map((p) => p._o))})`);
      });
      // Feste Zuordnung (gleiche Rundenzahl) darf ebenfalls nie eine fremde Runde eintragen
      const s = alignSplits(laps, steps);
      if (s.times) steps.forEach((_, k) => {
        const q = s.laps[k];
        if (q == null) return;
        const restHere = !Object.keys(laps[q]._o || {}).length && steps[k].kind === "rest" && !laps.some((l) => (l._o || {})[k]);
        const st = Object.values(laps[q]._o || {}).reduce((a, b) => a + b, 0);
        assert.ok(restHere || (st > 0 && ((laps[q]._o || {})[k] || 0) >= 0.75 * st), `${ln} Seed ${seed}: alignSplits ${s.mode} legt fremde Runde auf Schritt ${k} (${JSON.stringify(laps[q]._o)})`);
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

// ---- Fall A (Jaime): Einlaufen → je Runde Station inkl. Roxzone → Lauf (Laufband, evtl. 0 m) → Pause; optional Wartepause/Stopp nach dem Einlaufen ----
const planA = (P) => [{ kind: "warm", name: "2 km", goal: 720 }, ...Array.from({ length: 8 }, () => [{ kind: "station", name: "SkiErg", sub: "500 m", goal: 115 }, { kind: "run", name: "1 km", goal: 245 }, { kind: "rest", name: "Erholen", goal: P }]).flat()];
function lapsA(st, R, { rox = 50, tm = true, erg = false, hr = true } = {}) {
  return st.map((s, k) => {
    const j = (a) => 1 + (R() - 0.5) * a;
    const t = s.kind === "station" ? Math.round(s.goal * j(0.12) + rox * j(0.4)) : Math.round(s.goal * j(s.kind === "rest" ? 0.3 : 0.12));
    const d = s.kind === "warm" ? (tm ? 0 : 2000) : s.kind === "run" ? (tm ? 0 : 1000) : s.kind === "station" && erg ? 500 : 0;
    const dr = 10 * k / st.length, h = s.kind === "warm" ? 138 : s.kind === "station" ? 160 + dr : s.kind === "run" ? 168 + dr : 168 + dr - Math.min(28, 4 + t * 0.2);
    return { t, d, hr: hr ? Math.round(h + (R() - 0.5) * 6) : null, _o: { [k]: t } };
  });
}
const waitLap = (laps, R) => { laps.splice(1, 0, R() < 0.5 ? { t: 5 + Math.floor(R() * 20), d: 0, hr: laps[0].hr, _o: {} } : { t: 40 + Math.floor(R() * 150), d: 0, hr: laps[0].hr - 12 - Math.floor(R() * 18), _o: {} }); };
test("Fall A sauber: Laufband ohne Strecke, Roxzone 40–90 s, mit und ohne Wartepause → alle Arbeitsschritte sicher (mit Puls)", () => {
  for (const rox of [40, 60, 90]) for (const P of [15, 90, 120]) for (let seed = 1; seed <= 20; seed++) {
    const st = planA(P), R = rng(seed * 13 + rox + P);
    const laps = lapsA(st, R, { rox });
    if (seed % 2) waitLap(laps, R);
    const w = watchCheck({ src: "garmin", lapsV: 3, laps }, { steps: st });
    assert.equal(w.splits.got, w.splits.total, `rox ${rox}, Pause ${P}, Seed ${seed}: ${w.splits.got}/${w.splits.total} ${w.splits.reason || ""}`);
  }
});
test("Fall A gestört (Laufband 0 m, Roxzone, Wartepause, Ergometer-Meter, mit/ohne Puls): nie «sicher» auf fremder Runde", () => {
  let sure = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const R = rng(seed * 31 + 5), P = [15, 30, 90, 120][seed % 4], st = planA(P);
    const laps = lapsA(st, R, { rox: 30 + Math.floor(R() * 70), tm: R() < 0.7, erg: R() < 0.3, hr: R() < 0.8 });
    if (R() < 0.5) waitLap(laps, R);
    const names = Object.keys(MUTS_HR);
    let gone = false;
    for (let q = Math.floor(R() * 3); q > 0; q--) { const nm = names[Math.floor(R() * names.length)]; if (nm === "fehlt" && gone) continue; if (nm === "fehlt") gone = true; MUTS_HR[nm](laps, R); }
    const r = alignLaps(laps, st);
    if (r) st.forEach((_, k) => {
      if (!r.sure[k] || r.laps[k] == null) return;
      sure++;
      const M = r.merged[r.laps[k]], own = M.parts.reduce((x, p) => x + ((p._o || {})[k] || 0), 0);
      const stepTime = M.parts.reduce((x, p) => x + Object.values(p._o || {}).reduce((a, b) => a + b, 0), 0);
      const restHere = stepTime === 0 && st[k].kind === "rest" && !laps.some((l) => (l._o || {})[k]);
      assert.ok(restHere || (stepTime > 0 && own >= 0.75 * stepTime), `Seed ${seed}: Schritt ${k} sicher auf fremder Runde ${JSON.stringify(M.parts.map((p) => p._o))}`);
    });
    const s = alignSplits(laps, st);
    if (s.times) st.forEach((_, k) => {
      const q = s.laps[k];
      if (q == null || s.times[k] == null) return;
      const o = laps[q]._o || {}, tot = Object.values(o).reduce((a, b) => a + b, 0);
      assert.ok(tot > 0 ? (o[k] || 0) >= 0.75 * tot : st[k].kind === "rest" && !laps.some((l) => (l._o || {})[k]), `Seed ${seed}: alignSplits trägt fremde Runde in Schritt ${k} ein`);
    });
  }
  assert.ok(sure > 3000, `zu wenig Abdeckung: ${sure}`);
});
test("Strecken-Beleg: Laufband 0 m oder nur Einlaufen/Ergometer mit Metern gilt nicht als Laufstrecke", async () => {
  const { runDistEvidence } = await import("../src/align.js");
  const st = planA(90);
  assert.equal(runDistEvidence(lapsA(st, rng(1), { tm: true }), st), false);
  assert.equal(runDistEvidence(lapsA(st, rng(1), { tm: true, erg: true }).map((l, i) => (i === 0 ? { ...l, d: 2000 } : l)), st), false);
  assert.equal(runDistEvidence(lapsA(st, rng(1), { tm: false }), st), true);
});

// ---- Simulationstag (echte Einheit vom 28.11.2026, Garmin «Hyrox», 9 Runden, Einlaufen separat aufgezeichnet) ----
import { simSteps } from "../src/simsteps.js";
const SIM_LINES = [
  "Einlaufen 600 m @ 5:30/km (3:18)", "Steigerungen 4×100 m @ 3:40/km (0:22)",
  "Aufteilung 60 zu 40 testen: Der Stärkere übernimmt bei Schlitten schieben und ziehen den grösseren Anteil, Abstand zur Zielzeit der Station mit dem Abstand in der letzten Simulation vergleichen",
  "Run 1: 1 km @ 4:05/km (4:05) (Verbot schneller als 4:05/km!)", "Sled Push 50 m mit 225 kg (175 kg Platten, Ziel 3:03, Wechsel alle 7 m in Bewegung)",
  "Run 2: 1 km @ 4:05/km (4:05)", "Sled Pull 50 m mit 175 kg (125 kg Platten, Ziel 3:40, Wechsel jede 12,5-m-Bahn)",
  "Run 3: 1 km @ 4:05/km (4:05)", "Sandbag Lunges 100 m mit 30 kg (Ziel 3:15, Wechsel alle 25 m ohne Ablegen)",
  "Run 4: 1 km @ 4:05/km (4:05)", "Wall Balls 100 mit 9 kg auf 3 m (Ziel 4:40, Aufteilung 20/20/15/15/15/15)",
  "Nach jeder Station führt der frischere Partner und läuft die ersten 200 m kontrolliert bei 4:15/km an, bis der andere im Rhythmus ist",
];
const SIM_LAPS = [{ d: 0, t: 229, hr: 164 }, { d: 0, t: 108, hr: 159 }, { d: 0, t: 238, hr: 172 }, { d: 0, t: 244, hr: 153 }, { d: 0, t: 239, hr: 173 }, { d: 0, t: 178, hr: 165 }, { d: 0, t: 241, hr: 178 }, { d: 0, t: 206, hr: 173 }, { d: 0, t: 1, hr: 166 }];
test("simSteps: aufgeteilte Zeilen → Einlaufen (optional), 4 × Lauf + Station mit Zielen, Hinweiszeilen ohne Schritt", () => {
  const st = simSteps(SIM_LINES);
  assert.deepEqual(st.map((s) => s.kind), ["warm", "run", "station", "run", "station", "run", "station", "run", "station"]);
  assert.deepEqual(st.map((s) => s.goal), [198, 245, 183, 245, 220, 245, 195, 245, 280]);
  assert.equal(st[0].opt, true);
  assert.deepEqual(st.map((s) => s.name).slice(1, 5), ["1 km", "Sled Push", "1 km", "Sled Pull"]);
  // Ungeteilte Form (vor Plantag 16 oder eigene Anpassung) ergibt dieselben Schritte
  const raw = ["Run 1: 1 km @ 4:05/km (4:05) → Sled Push 50 m mit 225 kg (175 kg Platten, Ziel 3:03, Wechsel alle 7 m)", "Run 2: 1 km @ 4:05/km (4:05) → Wall Balls 100 mit 9 kg (Ziel 4:40)"];
  assert.deepEqual(simSteps(raw).map((s) => [s.kind, s.goal, s.j]), [["run", 245, 0], ["station", 183, 0], ["run", 245, 1], ["station", 280, 1]]);
  assert.equal(simSteps(["Doubles Transition Drilling", "Lange Zone-2-Fahrt"]), null);
});
test("Echte Simulation 28.11.: alle 8 Arbeitsschritte sicher, richtige Runden, Einlaufen zählt nicht als fehlend", () => {
  const st = simSteps(SIM_LINES);
  const r = alignLaps(SIM_LAPS, st);
  assert.deepEqual(st.map((_, k) => (r.span[k] ? r.span[k][0] : null)), [null, 0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(st.every((s, k) => s.kind === "warm" || r.sure[k]), JSON.stringify(r.why));
  const w = watchCheck({ src: "garmin", lapsV: 3, laps: SIM_LAPS }, { steps: st });
  assert.equal(w.splits.got, 8);
  assert.equal(w.splits.total, 8);
});
test("Echte Simulation 28.11. durch die ganze Analyse: Phasen sicher, Plan gegen Ist mit 8 Schritten, Auswertung als Stationstag", async () => {
  const { splitPhases, phaseStats } = await import("../src/session-dash.js");
  const { dashV3 } = await import("../src/dash-v3.js");
  const { sessionKind, anSessionModel } = await import("../src/an-session.js");
  const plan = { t: "Brick-Simulation", k: "sim", i: SIM_LINES };
  const steps = simSteps(SIM_LINES);
  const ph = splitPhases(SIM_LAPS, { steps, planText: "Steigerungen 4×100 m @ 3:40/km (0:22)" });
  assert.equal(ph.conf, "sure", ph.note);
  assert.equal(ph.phase.filter((x) => x === "work").length, 8);
  const st = phaseStats(ph, { steps, maxHr: 190 });
  assert.ok(st.plan && st.plan.n === 8, JSON.stringify(st.plan));
  const act = { src: "garmin", lapsV: 3, laps: SIM_LAPS, hr: 168, time: 1682, dist: 0, group: "strength" };
  assert.equal(sessionKind(plan, act), "station");
  const d = dashV3({ kind: "station", act, ph, st });
  assert.ok(d.plan && d.plan.rows.length >= 4, "Plan gegen Ist vorhanden");
  const model = anSessionModel({ kind: "station", act, d, conf: ph.conf });
  // Kopfzeile und Kennzahlen zählen nur die 4 Stationen: Push 1:48, Pull 4:04, Lunges 2:58, Wall Balls 3:26 = 12:16
  assert.equal(model.headline.big, "3 von 4", JSON.stringify(model.headline));
  // Gesamtdauer 28:02 (Garmin), Stationen 12:16, Läufe 3:49 + 3:58 + 3:59 + 4:01 = 15:47
  assert.deepEqual(model.numbers.map((n) => [n.k, n.v]), [["Gesamtdauer", "28:02"], ["Stationszeit", "12:16"], ["Laufzeit", "15:47"], ["Kompromiss Ø", "–"], ["Schwächste", "+24"]]);
  assert.deepEqual(model.tabs, ["Gesamt", "Stationen", "Läufe", "Vorher", "Mehr"]);
  assert.deepEqual(d.plan.rows.filter((r) => r.kind === "run").map((r) => r.hr), [164, 172, 173, 178]);
  // Kein Kompromiss-Delta, weil der Plan keinen frischen Referenz-km hat – nicht «Runden passen nicht»
  assert.match(model.numbers[3].why, /kein frischer Referenz-km/);
  assert.ok(!JSON.stringify(model).includes("passen nicht"), JSON.stringify(model.numbers));
  // Simulationstag ohne «Run N → Station» bleibt wie bisher (keine Schritte, kein Stationstag)
  assert.equal(sessionKind({ k: "sim", i: ["Doubles Transition Drilling"] }, act), "other");
});
