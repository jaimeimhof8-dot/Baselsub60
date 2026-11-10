// Runden der Uhr den Plan-Schritten zuordnen, auch wenn Runden fehlen, doppelt sind oder die Aufzeichnung früher endet (Absturz).
// Reine Funktion, ohne DOM. Gedacht als Rückfall nach alignSplits/alignFuzzy (src/laps.js), die bei starker Abweichung null liefern.
// Grundsatz: lieber nichts zuordnen als falsch. Jede Zuordnung wird auf Eindeutigkeit geprüft (Mindest-Abstand zur besten Alternative).

const INF = 1e9;
const MAX_GROUP = 4; // so viele Uhr-Runden dürfen zu einem Plan-Schritt zusammengefasst werden (Doppeldrücker)
const MARGIN = 0.4; // Eindeutigkeit: die beste Alternative muss um so viel schlechter sein

/**
 * steps: [{kind: warm|cool|run|station|rest|other, goal (s) | 0}] in Plan-Reihenfolge · laps: [{d, t, hr}]
 * -> null (keine brauchbare Zuordnung) oder
 *    {mode: "dp", count, times: [s|null je Schritt], hr, laps: [Index in merged | null], merged: [{d,t,hr,parts}],
 *     sure: [true|false|null je Schritt], incomplete: Schritt-Index|null, tail: Anzahl nicht aufgezeichneter Schlussschritte,
 *     skipped, merges, quality: Anteil sicherer Arbeitsschritte (0–1), cost}
 */
export function alignLaps(laps, steps) {
  const n = (steps || []).length;
  if (steps && steps.some((x) => !x)) return null;
  let T = (laps || []).filter((l) => l && Number.isFinite(+l.t) && +l.t > 0).map((l) => ({ ...l, t: +l.t, d: Number.isFinite(+l.d) ? +l.d : 0 }));
  while (T.length > 1 && T[T.length - 1].t < 15) T = T.slice(0, -1); // Stopp-Druck am Ende
  const m = T.length;
  if (!n || !m) return null;
  if (n * m > 10000) return null; // Rechenaufwand der Eindeutigkeitsprüfung: lieber keine Zuordnung als ein blockiertes Gerät
  const isWork = (k) => steps[k].kind !== "rest";
  // Distanz als Typ-Beleg: Liefert die Uhr bei Laufrunden eine Strecke (≥ 300 m), müssen Laufschritte auch Laufrunden bekommen und Stationen/Pausen nicht.
  // Ohne Strecken (Cardio-Profil ohne GPS) bleibt nur die Zeit; dann sind Verschiebungen um eine ganze Planperiode (Lauf·Station·Pause) nicht erkennbar.
  const hasDist = T.some((l) => (l.d || 0) >= 300);
  const typeOk = (k, d) => !hasDist || steps[k].kind === "other" || steps[k].kind === "warm" || steps[k].kind === "cool" || ((steps[k].kind === "run") === (d >= 300));
  const cost = (k, t) => (steps[k].goal > 0 ? Math.abs(Math.log(t / steps[k].goal)) : 0.35);
  const pre = [0], dpre = [0];
  T.forEach((l, i) => { pre.push(pre[i] + l.t); dpre.push(dpre[i] + (l.d || 0)); });

  // best(banned): minimale Gesamtkosten und Weg; banned = Menge "schritt:laps" (z. B. "3:5-6"), die nicht gewählt werden darf
  function solve(banned) {
    const f = Array.from({ length: n + 1 }, () => Array(m + 1).fill(INF));
    const bk = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));
    f[0][0] = 0;
    const relax = (i, j, c, how, pi, pj, g) => { if (c < f[i][j]) { f[i][j] = c; bk[i][j] = [how, pi, pj, g]; } };
    for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
      const c = f[i][j];
      if (c >= INF) continue;
      if (i < n) {
        for (let g = 1; g <= MAX_GROUP && j + g <= m; g++) {
          if (banned && banned.has(`${i}:${j}-${j + g - 1}`)) continue;
          relax(i + 1, j + g, c + cost(i, pre[j + g] - pre[j]) + (g - 1) * 0.3 + (typeOk(i, dpre[j + g] - dpre[j]) ? 0 : 2), "m", i, j, g);
        }
        // Schritt nicht aufgezeichnet: am Ende (Absturz, Abbruch) billig, mittendrin teuer
        relax(i + 1, j, c + (j === m ? 0.2 : isWork(i) ? 1.5 : 0.1), "s", i, j, 0);
      }
      if (j < m) relax(i, j + 1, c + (T[j].t < 45 ? 0.15 : 1.0), "l", i, j, 0); // überzählige Runde
    }
    return { total: f[n][m], bk };
  }

  const best = solve(null);
  if (best.total >= INF) return null;

  // Weg zurücklaufen
  const asg = Array(n).fill(null);
  let i = n, j = m, skipped = 0, merges = 0;
  while (i > 0 || j > 0) {
    const [how, pi, pj, g] = best.bk[i][j];
    if (how === "m") { asg[pi] = [pj, pj + g - 1]; if (g > 1) merges++; }
    else if (how === "l") skipped++;
    i = pi; j = pj;
  }
  const matched = asg.map((a, k) => (a ? k : -1)).filter((k) => k >= 0);
  const matchedWork = matched.filter(isWork);
  if (!matchedWork.length) return null;
  if (best.total / Math.max(1, matched.length) > 0.5) return null; // schlechte Gesamtpassung: nichts raten

  // Schlussschritte ohne Runde = nicht aufgezeichnet
  const lastMatched = matched[matched.length - 1];
  const tail = n - 1 - lastMatched;
  // Unvollständige letzte Runde (Absturz mitten im Schritt): deutlich kürzer als das Planziel, danach kommt nichts mehr
  let incomplete = null;
  if (tail > 0) {
    const lastLap = asg[lastMatched][1], t = pre[lastLap + 1] - pre[asg[lastMatched][0]], goal = steps[lastMatched].goal;
    if (lastLap < m - 1) incomplete = lastMatched + 1; // Reste nach der letzten Zuordnung: der nächste Schritt wurde angefangen, nicht beendet
    else if (goal > 0 && t < goal * 0.6 && isWork(lastMatched)) incomplete = lastMatched; // letzte Runde zu kurz für ihren Schritt
  }

  // Sicherheit je Schritt. Gleiche Schritte (zweimal «1 km») lassen sich nur über ihre Stelle in der Reihenfolge unterscheiden. Darum gilt:
  // sicher nur, wenn alles davor lückenlos 1:1 zugeordnet ist (keine fehlende Arbeitsrunde, keine Sammelrunde, keine überzählige Runde ≥ 20 s)
  // und die beste Zuordnung deutlich besser ist als jede Alternative ohne genau diese Zuordnung.
  const sure = Array(n).fill(null);
  // Pausen, die an der Uhr durchgehend nicht gelappt wurden, sind unproblematisch; fehlt nur eine einzelne Pause, ist die Stelle unklar
  const systematicRest = steps.every((st, k) => k > lastMatched || st.kind !== "rest" || !asg[k]);
  // Gibt es irgendwo eine Unregelmässigkeit (Lücke, Sammelrunde, lange Zusatzrunde), kann sich jede Zuordnung um einen Schritt verschieben:
  // dann ist ein Schritt nur sicher, wenn seine Runde zu ihm klar besser passt als zu den Nachbarschritten
  const covered = new Set();
  asg.forEach((x) => { if (x) for (let q = x[0]; q <= x[1]; q++) covered.add(q); });
  const lastLap = asg[lastMatched][1];
  const anomaly = steps.some((st, k) => k <= lastMatched && !asg[k] && (isWork(k) || !systematicRest)) ||
    asg.some((x) => x && x[0] !== x[1]) ||
    T.some((l, q) => q <= lastLap && !covered.has(q) && l.t >= 20) ||
    matched.some((k) => steps[k].goal > 0 && cost(k, pre[asg[k][1] + 1] - pre[asg[k][0]]) > 0.12); // grosse Abweichung vom Planziel: Zeichen für Verschiebung
  const distinct = (k, a) => {
    const t = pre[a[1] + 1] - pre[a[0]];
    for (const j of [k - 1, k + 1]) if (j >= 0 && j < n && steps[j].goal > 0 && steps[k].goal > 0 && cost(j, t) < cost(k, t) + 0.25) return false;
    return true;
  };
  let rigid = true, next = 0; // next = erste noch nicht verbrauchte Runde
  for (let k = 0; k < n; k++) {
    const a = asg[k];
    if (!a) { if (k <= lastMatched && (isWork(k) || !systematicRest)) rigid = false; continue; }
    for (let q = next; q < a[0]; q++) if (T[q].t >= 20) rigid = false;
    next = a[1] + 1;
    const single = a[0] === a[1];
    if (!single) rigid = false;
    const alt = rigid && single && k !== incomplete ? solve(new Set([`${k}:${a[0]}-${a[1]}`])) : null;
    // Nachbarschritt unbelegt: die Runde könnte beide Schritte enthalten (vergessener Druck) oder dem Nachbarn gehören
    const gapNb = [k - 1, k + 1].some((j) => j >= 0 && j <= lastMatched && !asg[j] && (isWork(j) || !systematicRest));
    const own = steps[k].goal > 0 ? cost(k, pre[a[1] + 1] - pre[a[0]]) : 0;
    // Aufzeichnung endet früher und der Schritt gleicht einem Nachbarschritt: eine Lücke wäre nicht von einem Abbruch zu unterscheiden
    const tailId = tail > 0 && [k - 1, k + 1].some((j) => j >= 0 && j < n && steps[j].kind === steps[k].kind && steps[j].goal === steps[k].goal);
    sure[k] = !gapNb && own <= 0.2 && !tailId && !!alt && alt.total - best.total >= MARGIN && (!(anomaly || (tail > 0 && k === lastMatched)) || distinct(k, a));
    if (!sure[k] && k !== incomplete) rigid = false; // ein zweifelhafter Schritt kann die Verschiebung ausgelöst haben: alles danach ist ebenfalls nicht sicher
  }

  const merged = [], idx = [];
  asg.forEach((a, k) => {
    if (!a || k === incomplete) { idx.push(null); return; }
    const ls = T.slice(a[0], a[1] + 1), t = ls.reduce((q, l) => q + l.t, 0), d = ls.reduce((q, l) => q + (l.d || 0), 0);
    const hl = ls.filter((l) => l.hr), ht = hl.reduce((q, l) => q + l.t, 0);
    merged.push({ ...ls[0], t, d, hr: ht ? Math.round(hl.reduce((q, l) => q + l.hr * l.t, 0) / ht) : null, parts: ls });
    idx.push(merged.length - 1);
  });
  const workSure = matchedWork.filter((k) => sure[k]).length;
  return {
    mode: "dp", count: m,
    times: idx.map((x) => (x == null ? null : Math.round(merged[x].t))),
    hr: idx.map((x) => (x == null ? null : merged[x].hr || null)),
    laps: idx, merged, sure, incomplete, tail, skipped, merges,
    quality: workSure / Math.max(1, steps.filter((s) => s.kind !== "rest").length - (tail ? steps.slice(n - tail).filter((s) => s.kind !== "rest").length : 0)),
    cost: Math.round(best.total * 100) / 100,
  };
}
