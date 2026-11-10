// Lauftage (Einlaufen, Steigerungen, Leiter/Intervalle mit Trabpause, Auslaufen): Plan-Zeilen in Schritte zerlegen und die Runden der Uhr
// über die DISTANZ zuordnen. Reine Funktionen, ohne DOM. Grundsatz wie in align.js: nur sicher Zugeordnetes wird als Zeit ausgewiesen.
import { mmss } from "./util.js";

const num = (s) => parseFloat(String(s).replace(",", "."));
const meters = (v, unit) => Math.round(num(v) * (unit === "km" ? 1000 : 1));
const RUN = /(\d+(?:,\d+)?) (km|m)(?: Zone 2)? @ (\d+):(\d\d)\/km(?: \((\d+):(\d\d)\))?/g;
const TRAB = /Trabpause (?:(\d+)×)?(\d+(?:,\d+)?) m @ (\d+):(\d\d)\/km(?: \((\d+):(\d\d)\))?/;
const STRIDE = /^Steigerungen (\d+)×(\d+(?:,\d+)?) m @ (\d+):(\d\d)\/km(?: \((\d+):(\d\d)\))?/;
const EZ = /^(Einlaufen|Auslaufen) (\d+(?:,\d+)?) (km|m)(?: @ (\d+):(\d\d)\/km(?: \((\d+):(\d\d)\))?)?/;
const goalOf = (dist, pm, ps, tm, ts) => (tm != null ? +tm * 60 + +ts : pm != null ? Math.round((dist / 1000) * (+pm * 60 + +ps)) : 0);
const label = (m) => (m >= 1000 ? `${m / 1000} km`.replace(".", ",") : `${m} m`);

/**
 * Plan-Zeilen eines Lauftags -> Schritte [{kind: warm|cool|run|rest, dist (m), goal (s) | 0, line: Zeilen-Index, label, soft?}] oder null,
 * wenn eine Zeile nicht sicher erkannt wird (dann bleibt es beim bisherigen Verhalten). soft = Strecke nur angenommen (Rückweg nach Steigerung).
 */
export function lauftagSteps(lines) {
  const steps = [];
  for (let j = 0; j < (lines || []).length; j++) {
    for (let tok of String(lines[j]).split(" → ")) {
      tok = tok.trim().replace(/\.$/, "");
      let m;
      if ((m = tok.match(EZ))) {
        const dist = meters(m[2], m[3]);
        steps.push({ kind: m[1] === "Einlaufen" ? "warm" : "cool", dist, goal: goalOf(dist, m[4], m[5], m[6], m[7]), line: j, label: `${m[1]} ${label(dist)}` });
      } else if ((m = tok.match(STRIDE))) {
        const dist = meters(m[2], "m"), goal = goalOf(dist, m[3], m[4], m[5], m[6]);
        for (let k = 1; k <= +m[1]; k++) {
          steps.push({ kind: "run", dist, goal, line: j, label: `Steigerung ${k}` });
          if (k < +m[1]) steps.push({ kind: "rest", dist, goal: 0, line: j, label: "Rückweg", soft: true });
        }
      } else {
        // Leiter / Intervalle: «Leiter A @ p (t), B @ p (t), …, Trabpause N×X m @ p» oder «N×D @ p …, Trabpause …»
        const body = tok.replace(/^Leiter\s+/, "");
        const reps = body.match(/^(\d{1,2})×/);
        const trab = body.match(TRAB);
        const head = body.replace(TRAB, "");
        const runs = [...head.matchAll(RUN)];
        if (!runs.length) return null;
        // Es darf nichts Unerkanntes übrig bleiben (sonst wäre die Zuordnung geraten)
        const rest = head.replace(RUN, "").replace(/^\d{1,2}×/, "").replace(/[\s,;]+/g, "");
        if (rest) return null;
        const list = reps && runs.length === 1 ? Array.from({ length: +reps[1] }, () => runs[0]) : runs;
        const gaps = trab ? (trab[1] ? +trab[1] : 1) : 0;
        list.forEach((r, k) => {
          const dist = meters(r[1], r[2]);
          steps.push({ kind: "run", dist, goal: goalOf(dist, r[3], r[4], r[5], r[6]), line: j, label: label(dist) });
          if (trab && k < list.length - 1 && k < gaps) steps.push({ kind: "rest", dist: meters(trab[2], "m"), goal: goalOf(meters(trab[2], "m"), trab[3], trab[4]), line: j, label: "Trabpause" });
        });
      }
    }
  }
  return steps.length ? steps : null;
}

const INF = 1e9;
/**
 * Runden den Schritten zuordnen. -> {match: [{lap: [von, bis] | null, pair: bool, sure: bool, t, d}], lines: [{j, of, got, sure, done, text}], tail, quality, hasDist} oder null.
 * Eine Runde kann zwei Schritte decken (vergessener Druck: Steigerung + Rückweg): beide gelten als erledigt, aber nicht als sichere Einzelzeit.
 */
export function alignLauf(laps, steps) {
  const T = (laps || []).filter((l) => l && Number.isFinite(+l.t) && +l.t > 0).map((l) => ({ ...l, t: +l.t, d: Number.isFinite(+l.d) ? +l.d : 0 }));
  const n = (steps || []).length, m = T.length;
  if (!n || !m || n * m > 10000) return null;
  const hasDist = T.some((l) => l.d >= 50);
  const pre = [0], dpre = [0];
  T.forEach((l, i) => { pre.push(pre[i] + l.t); dpre.push(dpre[i] + l.d); });
  const isRest = (k) => steps[k].kind === "rest";
  // Kosten: Abweichung der Strecke (Hauptsignal) plus kleiner Zeitanteil
  const cost = (dist, goal, soft, t, d) => {
    const tt = goal > 0 ? Math.min(1.5, Math.abs(Math.log(t / goal))) : 0;
    if (hasDist && dist > 0) return (soft ? 0.5 : 1) * (d >= 20 ? Math.abs(Math.log(d / dist)) : 1) + 0.2 * tt;
    return goal > 0 ? tt : 0.35;
  };
  const f = Array.from({ length: n + 1 }, () => Array(m + 1).fill(INF)), bk = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));
  f[0][0] = 0;
  const relax = (i, j, c, how, pi, pj, g) => { if (c < f[i][j]) { f[i][j] = c; bk[i][j] = [how, pi, pj, g]; } };
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    const c = f[i][j];
    if (c >= INF) continue;
    if (i < n) {
      const s = steps[i];
      for (let g = 1; g <= 3 && j + g <= m; g++) relax(i + 1, j + g, c + cost(s.dist, s.goal, s.soft, pre[j + g] - pre[j], dpre[j + g] - dpre[j]) + (g - 1) * 0.3, "m", i, j, g);
      if (i + 1 < n && j < m) { // eine Runde deckt zwei Schritte (vergessener Druck)
        const s2 = steps[i + 1];
        relax(i + 2, j + 1, c + cost(s.dist + s2.dist, s.goal > 0 && s2.goal > 0 ? s.goal + s2.goal : 0, s.soft && s2.soft, T[j].t, T[j].d) + 0.5, "p", i, j, 1);
      }
      relax(i + 1, j, c + (j === m ? 0.15 : isRest(i) ? 0.1 : 1.2), "s", i, j, 0);
    }
    if (j < m) relax(i, j + 1, c + (T[j].d < 60 && T[j].t < 60 ? 0.15 : 1.2), "l", i, j, 0);
  }
  if (f[n][m] >= INF) return null;
  const match = Array.from({ length: n }, () => ({ lap: null, pair: false, sure: false, t: null, d: null }));
  let i = n, j = m, skippedLaps = [];
  while (i > 0 || j > 0) {
    const [how, pi, pj, g] = bk[i][j];
    if (how === "m") match[pi] = { ...match[pi], lap: [pj, pj + g - 1] };
    else if (how === "p") { match[pi] = { ...match[pi], lap: [pj, pj], pair: true }; match[pi + 1] = { ...match[pi + 1], lap: [pj, pj], pair: true }; }
    else if (how === "l") skippedLaps.push(pj);
    i = pi; j = pj;
  }
  const got = match.map((x, k) => (x.lap ? k : -1)).filter((k) => k >= 0);
  if (!got.some((k) => !isRest(k))) return null;
  if (f[n][m] / got.length > 0.6) return null; // schlechte Gesamtpassung: nichts raten
  const last = got[got.length - 1], tail = n - 1 - last;
  const lastLap = match[last].lap[1];
  // Sicherheit: nur bei Strecke (GPS), Einzelrunde, Strecke ≤ 15 % daneben und lückenlosem Anfang (sonst könnte die Reihenfolge verschoben sein)
  let rigid = hasDist;
  const used = new Set();
  match.forEach((x) => x.lap && x.lap[0] <= x.lap[1] && [...Array(x.lap[1] - x.lap[0] + 1).keys()].forEach((q) => used.add(x.lap[0] + q)));
  // Toleranz der Strecke: höchstens 30 % des kleinsten Nachbarschritts (sonst wäre «Schritt + Nachbar in einer Runde» nicht auszuschliessen)
  const tol = (k) => {
    const nb = [k - 1, k + 1].filter((q) => q >= 0 && q < n && steps[q].dist > 0).map((q) => steps[q].dist);
    const base = steps[k].dist <= 200 ? 0.25 : 0.07;
    return nb.length ? Math.min(base, (0.3 * Math.min(...nb)) / steps[k].dist) : base;
  };
  for (let k = 0; k < n; k++) {
    const x = match[k], s = steps[k];
    if (!x.lap) { if (k < last && !isRest(k)) rigid = false; continue; }
    const t = pre[x.lap[1] + 1] - pre[x.lap[0]], d = dpre[x.lap[1] + 1] - dpre[x.lap[0]];
    x.t = Math.round(t); x.d = Math.round(d);
    for (let q = 0; q < x.lap[0]; q++) if (!used.has(q) && (T[q].d >= 60 || T[q].t >= 60)) rigid = false;
    const dd = s.dist > 0 && d >= 20 ? Math.abs(Math.log(d / s.dist)) : 9;
    // Kurze Strecken: GPS-Fehler ist absolut (±10–25 m), darum grosszügiger. Die Zeit muss ausserdem zum Planziel passen (sonst ist es eine andere Runde, z. B. der Trab zurück).
    const tt = s.goal > 0 ? Math.abs(Math.log(t / s.goal)) : 0;
    x.sure = rigid && !x.pair && x.lap[0] === x.lap[1] && !s.soft && !isRest(k) && dd <= tol(k) && tt <= 0.5;
    // Ein zweifelhaft zugeordneter Schritt (Strecke oder Zeit passt nicht) kann die Reihenfolge verschoben haben: alles danach ist nicht mehr sicher.
    // Sammelrunden (pair) sind davon ausgenommen: Ihre Gesamtstrecke bestätigt die Reihenfolge.
    if (!x.pair && !isRest(k) && !x.sure) rigid = false;
    // Pause mit stark abweichender Strecke: vermutlich mehrere Schritte in einer Runde (mehrere Drücker vergessen)
    if (isRest(k) && !x.pair && dd > 0.5) rigid = false;
  }
  // Sammelrunde «Steigerung + Rückweg»: nur als gelaufen gewertet, wenn sie deutlich schneller ist als die Rückwege dieser Einheit
  // (sonst könnte es auch «Rückweg + Rückweg» sein, wenn eine Steigerung fehlt)
  const jog = match.filter((x, k) => steps[k].soft && x.lap && !x.pair && x.d >= 60 && x.d <= 160).map((x) => x.t / (x.d / 1000)).sort((a, b) => a - b);
  const jogMed = jog.length ? jog[Math.floor(jog.length / 2)] : null;
  match.forEach((x, k) => {
    if (!x.pair || (k > 0 && match[k - 1].pair && match[k - 1].lap && match[k - 1].lap[0] === x.lap[0])) return; // nur am ersten Schritt der Sammelrunde
    const nx = match[k + 1], soft = steps[k].soft || (steps[k + 1] && steps[k + 1].soft);
    const t = pre[x.lap[1] + 1] - pre[x.lap[0]], d = dpre[x.lap[1] + 1] - dpre[x.lap[0]];
    x.pairOk = !!soft && jogMed != null && d >= 20 && t / (d / 1000) <= 0.9 * jogMed;
    if (nx) nx.pairOk = x.pairOk;
  });
  const lines = [];
  steps.forEach((s, k) => {
    let L = lines.find((x) => x.j === s.line);
    if (!L) lines.push((L = { j: s.line, of: 0, got: 0, sure: 0, done: false, text: "", parts: [] }));
    if (isRest(k)) return;
    L.of++;
    // «gelaufen» zählt nur, was sicher zugeordnet ist oder in einer Sammelrunde steckt. Ein Treffer mit unpassender Zeit/Strecke zählt nicht (nichts raten)
    if (match[k].lap && (match[k].sure || (match[k].pair && match[k].pairOk))) L.got++;
    if (match[k].sure) L.sure++;
    L.parts.push({ label: s.label, t: match[k].sure ? match[k].t : null, ok: !!match[k].lap && (match[k].sure || (match[k].pair && match[k].pairOk)) });
  });
  lines.forEach((L) => {
    L.done = L.of > 0 && L.got === L.of;
    const ts = L.parts.filter((p) => p.ok);
    const strides = L.parts.length > 0 && L.parts.every((p) => /^Steigerung \d+$/.test(p.label));
    const one = (p) => (strides ? (p.t != null ? mmss(p.t) : "–") : `${p.label} ${p.t != null ? mmss(p.t) : "–"}`);
    const dist = strides ? steps.find((st) => st.line === L.j && st.kind === "run").dist : 0;
    L.text = L.got === 0 ? "" : (strides ? `${L.of}×${dist} m: ` : "") + ts.map(one).join(" · ") + (L.done ? "" : ` (${L.got} von ${L.of})`);
  });
  const work = steps.filter((_, k) => !isRest(k)).length - steps.slice(n - tail).filter((s) => s.kind !== "rest").length;
  return { match, lines, tail, hasDist, quality: match.filter((x, k) => !isRest(k) && x.sure).length / Math.max(1, work), skippedLaps: skippedLaps.length };
}
