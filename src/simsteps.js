// Plan-Schritte für Simulationstage («Brick-Simulation»): «Run N: 1 km @ 4:05/km (4:05) → Sled Push 50 m … (Ziel 3:03, …)».
// Ab Plantag 16 teilt die App solche Zeilen an « → » in zwei Zeilen (src/split.js). Beide Formen werden gelesen.
// Reine Funktion, ohne DOM. Ergebnis im Format von s7Steps (index.html): [{j, kind, tp, name, sub, goal, opt?}].
// Einlaufen/Auslaufen sind optional (opt): Sie stecken oft in einer eigenen Aktivität und dürfen in den Runden fehlen.
// Hinweis- und Taktikzeilen («Aufteilung …», «Nach jeder Station …») und Steigerungen ergeben keinen Schritt.

const mmss = (s) => { const m = /^(\d+):(\d\d)$/.exec(String(s || "").trim()); return m ? +m[1] * 60 + +m[2] : 0; };
const RUN = /^(?:Run|Lauf)\s+(\d+):\s*(\d+(?:,\d+)?\s?km|\d+\s?m)\s*@\s*(\d:\d\d)\/km\s*(?:\((\d+:\d\d)\))?/;
const STATION = /^(.+?)\s*\(([^)]*\bZiel (\d+:\d\d)[^)]*)\)\s*$/;
const WARM = /^(Einlaufen|Auslaufen)\s+(\d[\d,.]*\s?(?:km|m))\s*@\s*(\d:\d\d)\/km\s*\((\d+:\d\d)\)/;

const runGoal = (dist, pace, given) => {
  if (given) return mmss(given);
  const km = /km/.test(dist) ? parseFloat(dist.replace(",", ".")) : parseFloat(dist) / 1000;
  return Math.round(km * mmss(pace));
};
function station(text, j) {
  const m = STATION.exec(text);
  if (!m) return null;
  const hm = /^(.*?)\s+(\d[\d,.']*\s?m|\d+)(?:\s+mit\s+(\d+\s?kg))?(?:\s+.*)?$/.exec(m[1]);
  const extra = m[2].split(/,\s*/).filter((x) => !/^Ziel /.test(x) && !/^Wechsel|^Aufteilung/.test(x));
  return { j, kind: "station", tp: "Station", name: hm ? hm[1] : m[1], sub: [hm ? hm[2] : "", hm && hm[3] ? hm[3] : "", ...extra].filter(Boolean).join(" · "), goal: mmss(m[3]) };
}

/** lines: Zeilen der Einheit (p.i) -> Schritte oder null, wenn kein «Run N:» mit Station darin vorkommt */
export function simSteps(lines) {
  const steps = [];
  let runs = 0, stations = 0;
  (lines || []).forEach((t0, j) => {
    const t = String(t0 || "").replace(/\s+/g, " ").trim();
    const parts = t.split(/\s+→\s+/);
    let m;
    if ((m = WARM.exec(parts[0]))) {
      steps.push({ j, kind: m[1] === "Einlaufen" ? "warm" : "cool", tp: m[1], name: m[2], sub: `@ ${m[3]} /km`, goal: mmss(m[4]), opt: true });
      return;
    }
    if ((m = RUN.exec(parts[0]))) {
      runs++;
      steps.push({ j, kind: "run", tp: "Lauf", name: m[2].replace(/\s+/g, " "), sub: `@ ${m[3]} /km`, goal: runGoal(m[2], m[3], m[4]) });
      if (parts[1]) { const s = station(parts.slice(1).join(" → "), j); if (s) { stations++; steps.push(s); } }
      return;
    }
    // Station als eigene Zeile direkt nach einem Lauf (aufgeteilte Form)
    if (steps.length && steps[steps.length - 1].kind === "run") {
      const s = station(t, j);
      if (s) { stations++; steps.push(s); }
    }
  });
  return runs && stations ? steps : null;
}
