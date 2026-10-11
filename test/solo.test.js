import { test } from "node:test";
import assert from "node:assert/strict";
import { canSolo, soloLine, soloize } from "../src/solo.js";
import { builtinPlan } from "../src/plan-store.js";

const sim = { t: "Halb-Simulation A", k: "sim", joint: true,
  i: ["Mit Jimoh in der Rennaufteilung: Run 1–4 mit SkiErg 1000 m, Sled Push 50 m", "Wechsel: Ski und Row alle 250 m, Schlitten pro Bahn", "10′ Übergaben üben, Ziel unter 8″"],
  n: "Alle Splits notieren." };

test("nur Partner-Einheiten (ohne Ruhetag und Rennen) lassen sich solo umstellen", () => {
  assert.ok(canSolo(sim));
  assert.ok(!canSolo({ ...sim, joint: false }));
  assert.ok(!canSolo({ t: "Rennen", k: "race", joint: true, i: [] }));
  assert.ok(!canSolo({ t: "Ruhetag", k: "rest", joint: true, i: [] }));
  assert.ok(!canSolo(null));
});

test("Simulation solo: halbes Stationsvolumen, Übergänge statt Übergaben, gleiche Zeilenzahl", () => {
  const s = soloize(sim);
  assert.equal(s.i.length, sim.i.length);
  assert.equal(s.i[0], "Solo, Stationen mit halbem Volumen: Run 1–4 mit SkiErg 1000 m, Sled Push 50 m");
  assert.equal(s.i[1], "Stationen solo: halbes Volumen, danach gleich lange Pause");
  assert.equal(s.i[2], "10′ Übergänge Station → Lauf üben, Ziel unter 8″");
  assert.equal(s.t, "Halb-Simulation A · solo");
  assert.match(s.n, /^Solo ohne Jimoh: Läufe voll, Stationen mit halbem Volumen/);
  assert.match(s.n, /Alle Splits notieren\.$/);
  assert.equal(s.solo, 1);
  assert.equal(sim.i[0].startsWith("Mit Jimoh"), true, "Original unverändert");
});

test("Intervalle solo: Partner fällt weg, Tempo bleibt", () => {
  assert.equal(soloLine("5×1 km mit Jimoh @ S (T + 15–20 s/km), 90″ Trabpause").text, "5×1 km @ S (T + 15–20 s/km), 90″ Trabpause");
  assert.equal(soloLine("4×1km zusammen, RPE 8–9 (kein Sprint), 2′ Trabpause").text, "4×1km, RPE 8–9 (kein Sprint), 2′ Trabpause");
  assert.equal(soloLine("Abstand zwischen euch notieren (5–15 Sek. Toleranz)").text, "Eigene Splits notieren (Streuung bis 10 Sek.)");
  assert.equal(soloLine("4×6′ @ 85% max HF, 2′ Trabpause, im Team-Tempo").text, "4×6′ @ 85% max HF, 2′ Trabpause, im Tempo T");
  const run = soloize({ t: "Intervall mit Jimoh", k: "lauf", joint: true, i: ["6×1 km mit Jimoh @ S"], n: "" });
  assert.equal(run.t, "Intervall · solo");
  assert.match(run.n, /Tempo nach deinem T/);
});

test("Stationen im Wechsel und geteilte Stationen werden halbes Volumen", () => {
  assert.equal(soloLine("3 Runden im Wechsel: 400m Ski, 400m Row").text, "3 Runden (solo: halbes Volumen): 400m Ski, 400m Row");
  assert.ok(soloLine("eine Station im vollen Rennvolumen, geteilt (Runde 1 SkiErg)").shared);
  assert.equal(soloLine("1 km @ R → halbe Station im Doubles-Wechsel, 60″ Pause").text, "1 km @ R → halbe Station allein, 60″ Pause");
  // "im Wechsel mit den Kniebeugen" ist kein Partnerwechsel
  assert.equal(soloLine("Box Jumps 3×3, im Wechsel mit den Kniebeugen").text, "Box Jumps 3×3, im Wechsel mit den Kniebeugen");
  assert.equal(soloLine("3–5′ Pause zwischen den Stationen, im Wechsel: einer testet, einer stoppt.").text, "3–5′ Pause zwischen den Stationen, selbst stoppen.");
});

test("Partnername aus Jimohs Sicht", () => {
  const s = soloize({ t: "Intervall mit Jaime", k: "lauf", joint: true, i: ["6×1 km mit Jaime @ S"], n: "" }, "Jaime");
  assert.equal(s.i[0], "6×1 km @ S");
  assert.match(s.n, /^Solo ohne Jaime/);
});

test("ganzer eingebauter Plan: Zeilenzahl bleibt, kein Partnername mehr in den Zeilen", () => {
  for (const d of Object.values(builtinPlan().days)) {
    const s = soloize(d);
    if (!canSolo(d)) { assert.equal(s, d); continue; }
    assert.equal(s.i.length, d.i.length, d.t);
    for (const l of s.i) assert.ok(!/Jimoh|zusammen|euch/.test(l), l);
  }
});
