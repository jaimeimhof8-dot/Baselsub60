import { test } from "node:test";
import assert from "node:assert/strict";
import { lauftagSteps, alignLauf } from "../src/lauftag.js";

const LINES = [
  "Einlaufen 1 km @ 5:30/km (5:30)",
  "Steigerungen 4×100 m @ 3:40/km (0:22)",
  "Leiter 600 m @ 4:05/km (2:27), 1 km @ 4:05/km (4:05), 1,4 km @ 4:05/km (5:43), 1 km @ 4:05/km (4:05), 600 m @ 4:05/km (2:27), Trabpause 4×200 m @ 6:30/km (1:18)",
  "Auslaufen 800 m @ 5:30/km (4:24)",
];
// Echte Aktivität vom 10.11.2026 (Uhr stürzte nach dem 1-km-Schritt der Leiter ab; bei Steigerung 3 wurde die Runde nicht gedrückt)
const REAL = [
  { d: 1000, t: 306 }, { d: 120, t: 31 }, { d: 104, t: 39 }, { d: 107, t: 23 }, { d: 113, t: 50 }, { d: 213, t: 74 },
  { d: 99, t: 23 }, { d: 40, t: 31 }, { d: 606, t: 138 }, { d: 213, t: 110 }, { d: 1000, t: 241 },
];

test("Plan-Zeilen eines Lauftags werden in Schritte zerlegt (Einlaufen, 4 Steigerungen, 5 Leiter-Stufen mit 4 Pausen, Auslaufen)", () => {
  const st = lauftagSteps(LINES);
  assert.equal(st.filter((s) => s.kind === "run").length, 4 + 5);
  assert.equal(st.filter((s) => s.kind === "rest" && s.line === 2).length, 4);
  assert.deepEqual(st.filter((s) => s.line === 2 && s.kind === "run").map((s) => s.dist), [600, 1000, 1400, 1000, 600]);
  assert.equal(st[0].kind, "warm");
  assert.equal(st[st.length - 1].kind, "cool");
});

test("Nicht sicher lesbare Zeilen: kein Raten (null)", () => {
  assert.equal(lauftagSteps(["Lockerer Lauf 40′ Zone 2"]), null);
  assert.equal(lauftagSteps(["Einlaufen 1 km @ 5:30/km (5:30)", "Irgendwas Neues"]), null);
});

test("Echte Aktivität 10.11.: Einlaufen und Steigerungen gelaufen, Leiter 2 von 5, Auslaufen nicht", () => {
  const r = alignLauf(REAL, lauftagSteps(LINES));
  assert.ok(r);
  const [e, s, l, a] = r.lines;
  assert.equal(e.done, true);
  assert.equal(s.done, true, "alle 4 Steigerungen gelaufen (eine davon ohne eigene Runde)");
  assert.equal(l.done, false);
  assert.equal(l.got, 2);
  assert.equal(l.text, "600 m 2:18 · 1 km 4:01 (2 von 5)");
  assert.equal(a.got, 0);
  assert.equal(r.tail, 7);
  assert.match(s.text, /^4×100 m: .* · – · /, "die zusammengefasste Runde wird nicht als Einzelzeit gezeigt");
});

test("Vollständige Einheit mit zusätzlichen Drückern: alles zugeordnet", () => {
  const laps = [{ d: 1010, t: 330 }, { d: 99, t: 22 }, { d: 101, t: 45 }, { d: 98, t: 23 }, { d: 100, t: 47 }, { d: 102, t: 21 }, { d: 99, t: 44 }, { d: 101, t: 22 },
    { d: 8, t: 5 }, { d: 603, t: 150 }, { d: 200, t: 80 }, { d: 1004, t: 250 }, { d: 198, t: 79 }, { d: 1398, t: 346 }, { d: 201, t: 78 }, { d: 1001, t: 247 }, { d: 202, t: 80 }, { d: 597, t: 149 }, { d: 805, t: 270 }];
  const r = alignLauf(laps, lauftagSteps(LINES));
  assert.ok(r);
  assert.ok(r.lines.every((L) => L.done), JSON.stringify(r.lines.map((L) => [L.j, L.got, L.of])));
  assert.equal(r.tail, 0);
});

// Zufallstest: Eine als «sicher» gemeldete Zeit darf nie aus Runden eines anderen Schritts stammen.
function rng(seed) { let x = seed; return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296); }
test("Zufallstest Lauftag: nie «sicher» auf fremder Runde (600 Läufe)", () => {
  const st = lauftagSteps(LINES);
  let sureCount = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const R = rng(seed * 17 + 3);
    let laps = st.map((s, k) => ({ d: Math.round(s.dist * (1 + (R() - 0.5) * 0.1)), t: Math.round((s.goal || (s.dist / 1000) * 400) * (1 + (R() - 0.5) * 0.12)), _s: [k] }));
    for (let q = 0; q < Math.floor(R() * 3); q++) {
      const op = R(), at = Math.floor(R() * (laps.length - 1)), a = laps[at], b = laps[at + 1];
      if (op < 0.35) laps.splice(at, 2, { d: a.d + b.d, t: a.t + b.t, _s: [...a._s, ...b._s] });
      else if (op < 0.6) laps.splice(at, 0, { d: Math.floor(R() * 30), t: 5 + Math.floor(R() * 20), _s: [-1] });
      else if (op < 0.8) laps = laps.slice(0, Math.max(4, laps.length - 1 - Math.floor(R() * 6)));
      else laps.splice(at, 1);
    }
    const r = alignLauf(laps, st);
    if (!r) continue;
    // Eine als «erledigt» gemeldete Zeile muss wirklich vollständig in den Runden vorkommen (kein Abhaken von Nichtgelaufenem)
    r.lines.forEach((L) => {
      if (!L.done) return;
      st.forEach((s, k) => {
        if (s.line === L.j && s.kind !== "rest") assert.ok(laps.some((l) => l._s.includes(k)), `Seed ${seed}: Zeile ${L.j} erledigt, aber Schritt ${k} fehlt in den Runden`);
      });
    });
    r.match.forEach((x, k) => {
      if (!x.sure) return;
      sureCount++;
      const owners = new Set(laps.slice(x.lap[0], x.lap[1] + 1).flatMap((l) => l._s));
      owners.delete(-1);
      // Gleiche Schritte derselben Zeile (z. B. die vier Steigerungen) sind untereinander austauschbar: ein anderer Zählerstand ist dort kein falscher Wert
      const same = (o) => st[o].line === st[k].line && st[o].kind === st[k].kind && st[o].dist === st[k].dist && st[o].goal === st[k].goal;
      assert.ok(owners.size === 1 && [...owners].every(same), `Seed ${seed}: Schritt ${k} sicher, Runden gehören zu ${[...owners]}`);
    });
  }
  assert.ok(sureCount > 1000, "zu wenig Abdeckung: " + sureCount);
});
