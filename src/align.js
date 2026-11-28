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
/** Geplante Strecke einer Station aus Name/Zusatz («SkiErg 1000 m», «500 m · …») in Metern oder 0 */
const planDist = (st) => { const m = /(\d[\d']*)\s?m\b/.exec(`${st.name || ""} ${st.sub || ""}`); return m ? +m[1].replace(/'/g, "") : 0; };
/** Station mit gemessener Strecke d: plausibel, wenn der Plan ≥ 300 m vorsieht und d höchstens Faktor 1,65 daneben liegt */
const ergOk = (st, d) => { const p = planDist(st); return p >= 300 && d > 0 && Math.abs(Math.log(d / p)) < 0.5; };

export function alignLaps(laps, steps) {
  const n = (steps || []).length;
  if (steps && steps.some((x) => !x)) return null;
  let T = (laps || []).filter((l) => l && Number.isFinite(+l.t) && +l.t > 0).map((l) => ({ ...l, t: +l.t, d: Number.isFinite(+l.d) ? +l.d : 0 }));
  // Stopp-Druck am Ende: kurze Schlussrunde, die auch für den letzten Planschritt klar zu kurz ist (eine geplante 15-s-Pause bleibt)
  const lastGoal = (steps && steps.length && steps[steps.length - 1] && steps[steps.length - 1].goal) || 0;
  while (T.length > 1 && T[T.length - 1].t < 15 && !(lastGoal > 0 && T[T.length - 1].t >= lastGoal * 0.5)) T = T.slice(0, -1);
  const m = T.length;
  if (!n || !m) return null;
  if (n * m > 10000) return null; // Rechenaufwand der Eindeutigkeitsprüfung: lieber keine Zuordnung als ein blockiertes Gerät
  const isWork = (k) => steps[k].kind !== "rest";
  // Distanz als Typ-Beleg: Liefert die Uhr bei Laufrunden eine Strecke (≥ 300 m), müssen Laufschritte auch Laufrunden bekommen und Stationen/Pausen nicht.
  // Ohne Strecken (Cardio-Profil ohne GPS) bleibt nur die Zeit; dann sind Verschiebungen um eine ganze Planperiode (Lauf·Station·Pause) nicht erkennbar.
  const hasDist = T.some((l) => (l.d || 0) >= 300);
  // Station mit Strecke (Ergometer zeigt Meter) ist nur dann plausibel, wenn der Plan diese Strecke vorsieht («SkiErg 1000 m»).
  const typeOk = (k, d) => !hasDist || steps[k].kind === "other" || steps[k].kind === "warm" || steps[k].kind === "cool" ||
    ((steps[k].kind === "run") === (d >= 300)) || (steps[k].kind === "station" && ergOk(steps[k], d));
  const cost = (k, t) => (steps[k].goal > 0 ? Math.abs(Math.log(t / steps[k].goal)) : 0.35);
  const pre = [0], dpre = [0];
  T.forEach((l, i) => { pre.push(pre[i] + l.t); dpre.push(dpre[i] + (l.d || 0)); });
  // Harmlose Zusatzrunde (Übergang, Doppeldruck): kurz, ohne Strecke, höchstens 35 % des kürzesten Planschritts (max. 45 s).
  // Kein festes Minimum: Bei 15-s-Pausen ist eine 15-s-Runde eine Pause, keine Störung.
  // Sie kann keinen Planschritt enthalten und löst darum keine Verschiebung aus.
  const goals = steps.map((s) => s.goal).filter((g) => g > 0);
  const shortMax = goals.length ? Math.min(45, Math.min(...goals) * 0.35) : 20;
  const harmless = (l) => l.t < shortMax && (l.d || 0) < 100;

  // Puls als Typ-Beleg (Pulsgurt): Eine Pausenrunde liegt im Puls deutlich unter ihren Nachbarrunden, eine Arbeitsrunde nicht.
  // Nur wenn fast alle Runden Puls haben und er sich spürbar bewegt; sonst bleibt alles wie ohne Puls.
  const hrs = T.map((l) => +l.hr || 0).filter((h) => h > 0);
  const hrOk = hrs.length >= 0.8 * m && Math.max(...hrs) - Math.min(...hrs) >= 10;
  const hrOf = (a, b) => {
    let w = 0, s = 0;
    for (let q = Math.max(0, a); q <= Math.min(m - 1, b); q++) if (+T[q].hr > 0) { w += T[q].t; s += T[q].hr * T[q].t; }
    return w ? s / w : null;
  };
  // Nachbarrunde für den Pulsvergleich: harmlose Kurzrunden überspringen
  const nb = (q, dir) => { while (q >= 0 && q < m && harmless(T[q])) q += dir; return q >= 0 && q < m ? q : -1; };
  // Pulsabfall gegenüber der Runde davor (Pause: deutlich positiv) und gegenüber beiden Nachbarn (Arbeit: nicht deutlich darunter)
  const restScore = (a, b) => {
    const own = hrOf(a, b);
    if (own == null) return null;
    const p = nb(a - 1, -1), n = nb(b + 1, 1);
    const ph = p >= 0 ? hrOf(p, p) : null, nh = n >= 0 ? hrOf(n, n) : null;
    if (ph == null && nh == null) return null;
    return { drop: ph == null ? null : ph - own, valley: Math.min(ph ?? Infinity, nh ?? Infinity) - own };
  };
  const HR_PEN = 0.6;
  const hrCost = (k, a, b) => {
    if (!hrOk) return 0;
    const sc = restScore(a, b);
    if (sc == null) return 0;
    const kind = steps[k].kind;
    // In kurzen Pausen (< 45 s) fällt der Puls kaum: dort ist der Abfall kein Beleg
    if (kind === "rest") return steps[k].goal >= 45 && sc.drop != null && sc.drop < 3 ? HR_PEN : 0;
    if (kind === "station" || kind === "run") return sc.valley >= 6 ? HR_PEN : 0;
    return 0;
  };
  // Kosten eines Schritts für die Runden a..b (ohne Gruppenzuschlag): Zeit, Strecke als Typ, Puls als Typ
  const pairCost = (k, a, b) => cost(k, pre[b + 1] - pre[a]) + (typeOk(k, dpre[b + 1] - dpre[a]) ? 0 : 2) + hrCost(k, a, b);

  // best(banned): minimale Gesamtkosten und Weg; banned = {k, lap}: Schritt k darf Runde lap nicht enthalten (auch nicht zusammen mit Nachbarrunden)
  function solve(banned) {
    const f = Array.from({ length: n + 1 }, () => Array(m + 1).fill(INF));
    const h = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0)); // Anteil der Pulskosten am Weg (für die Gesamtpassung)
    const bk = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));
    f[0][0] = 0;
    const relax = (i, j, c, hc, how, pi, pj, g) => { if (c < f[i][j]) { f[i][j] = c; h[i][j] = hc; bk[i][j] = [how, pi, pj, g]; } };
    for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
      const c = f[i][j];
      if (c >= INF) continue;
      if (i < n) {
        for (let g = 1; g <= MAX_GROUP && j + g <= m; g++) {
          if (banned && banned.k === i && j <= banned.lap && banned.lap <= j + g - 1) continue;
          const hp = hrCost(i, j, j + g - 1);
          // Zusammenfassen: 0,3 je Zusatzrunde, plus 0,5 je weitere nicht harmlose Runde (zwei echte Runden in einem Schritt sind selten)
          let real = 0;
          for (let q = j; q < j + g; q++) if (!harmless(T[q])) real++;
          relax(i + 1, j + g, c + pairCost(i, j, j + g - 1) + (g - 1) * 0.3 + Math.max(0, real - 1) * 0.5, h[i][j] + hp, "m", i, j, g);
        }
        // Vergessener Druck zwischen zwei Schritten: eine Runde enthält beide (Zeit gegen die Summe der Ziele). Keiner der beiden bekommt
        // eine Einzelzeit, aber die Runden daneben bleiben richtig zugeordnet.
        // Nur wenn die Runde zur Summe beider Ziele passt und deutlich besser als zu jedem einzelnen (sonst wäre es eine billige Ausrede).
        if (i + 1 < n && j < m && (isWork(i) || isWork(i + 1)) && steps[i].goal > 0 && steps[i + 1].goal > 0 &&
            Math.abs(Math.log(T[j].t / (steps[i].goal + steps[i + 1].goal))) <= 0.2 &&
            Math.abs(Math.log(T[j].t / (steps[i].goal + steps[i + 1].goal))) + 0.15 < Math.min(Math.abs(Math.log(T[j].t / steps[i].goal)), Math.abs(Math.log(T[j].t / steps[i + 1].goal))) &&
            !(banned && (banned.k === i || banned.k === i + 1) && banned.lap === j)) {
          const run = steps[i].kind === "run" || steps[i + 1].kind === "run";
          const tc = Math.abs(Math.log(T[j].t / (steps[i].goal + steps[i + 1].goal))) + 0.5 + (hasDist && run && T[j].d < 300 ? 2 : 0);
          relax(i + 2, j + 1, c + tc, h[i][j], "d", i, j, 1);
        }
        // Schritt nicht aufgezeichnet: am Ende (Absturz, Abbruch) billig, mittendrin teuer
        relax(i + 1, j, c + (j === m ? 0.2 : isWork(i) ? 1.5 : 0.1), h[i][j], "s", i, j, 0);
      }
      if (j < m) relax(i, j + 1, c + (harmless(T[j]) ? 0.15 : T[j].t < 45 ? 0.6 : 1.0), h[i][j], "l", i, j, 0); // überzählige Runde
    }
    return { total: f[n][m], hrPart: h[n][m], bk };
  }

  const best = solve(null);
  if (best.total >= INF) return null;

  // Weg zurücklaufen
  const asg = Array(n).fill(null), dbl = Array(n).fill(false);
  let i = n, j = m, skipped = 0, merges = 0;
  while (i > 0 || j > 0) {
    const [how, pi, pj, g] = best.bk[i][j];
    if (how === "m") { asg[pi] = [pj, pj + g - 1]; if (g > 1) merges++; }
    else if (how === "d") { asg[pi] = asg[pi + 1] = [pj, pj]; dbl[pi] = dbl[pi + 1] = true; merges++; }
    else if (how === "l") skipped++;
    i = pi; j = pj;
  }
  const matched = asg.map((a, k) => (a ? k : -1)).filter((k) => k >= 0);
  const matchedWork = matched.filter((k) => isWork(k) && !dbl[k]);
  if (!matchedWork.length) return null;
  if ((best.total - best.hrPart) / Math.max(1, matched.length) > 0.5) return null; // schlechte Gesamtpassung: nichts raten

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
  // Tagesniveau je Schritt-Art: Median von log(Ist/Ziel). Sind alle Läufe 20 % langsamer, ist das kein Zeichen für eine Verschiebung,
  // eine einzelne Ausreisser-Runde schon. Absolut bleibt eine Grenze (Faktor 1,65).
  const lr = (k) => Math.log((pre[asg[k][1] + 1] - pre[asg[k][0]]) / steps[k].goal);
  // Median ohne den geprüften Schritt selbst (ein Ausreisser verschiebt sonst sein eigenes Tagesniveau), mindestens 3 Vergleichswerte
  const med = (k) => {
    const v = matched.filter((j) => j !== k && !dbl[j] && steps[j].kind === steps[k].kind && steps[j].goal > 0 && asg[j][0] === asg[j][1]).map(lr).sort((x, y) => x - y);
    if (v.length < 3) return 0;
    const mid = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    return Math.max(-0.25, Math.min(0.25, mid));
  };
  const dev = (k) => (dbl[k] ? 1 : steps[k].goal > 0 ? Math.max(Math.abs(lr(k) - med(k)), Math.abs(lr(k)) > 0.5 ? 1 : 0) : 0);
  const anomaly = steps.some((st, k) => k <= lastMatched && !asg[k] && (isWork(k) || !systematicRest)) ||
    asg.some((x) => x && x[0] !== x[1]) || dbl.some(Boolean) ||
    T.some((l, q) => q <= lastLap && !covered.has(q) && !harmless(l)) ||
    matched.some((k) => dev(k) > (hrOk && steps[k].kind === "rest" ? 0.5 : 0.15)); // grosse Abweichung vom Tagesniveau: Zeichen für Verschiebung
  // Mit Puls zählen die Typ-Kosten mit: Station und Pause gleicher Dauer unterscheiden sich dann über den Puls
  const distinct = (k, a) => {
    for (const j of [k - 1, k + 1]) if (j >= 0 && j < n && steps[j].goal > 0 && steps[k].goal > 0 && pairCost(j, a[0], a[1]) < pairCost(k, a[0], a[1]) + 0.25) return false;
    return true;
  };
  // Sicher ist ein Schritt nur, wenn er vom Start ODER vom Ende her lückenlos verankert ist (Ende nur bei vollständiger Aufzeichnung).
  // Zwischen zwei Störungen ist nie etwas sicher: Zwei Störungen (z. B. vergessener Druck + Zusatzrunde) können sich in der Rundenzahl
  // aufheben, dazwischen wäre eine Verschiebung um eine ganze Planperiode weder an der Zeit noch am Puls erkennbar.
  // Prüfung eines einzelnen Schritts, unabhängig von der Verankerung. Gibt den Grund zurück, warum er nicht sicher ist, sonst null.
  const altCache = new Map();
  const altOf = (k, lap) => { if (!altCache.has(k)) altCache.set(k, solve({ k, lap })); return altCache.get(k); };
  const check = (k, strict) => {
    const a = asg[k];
    if (k === incomplete) return "unvollständig";
    if (dbl[k]) return "zusammen mit dem Nachbarschritt in einer Runde";
    if (a[0] !== a[1]) return "mehrere Runden zusammengefasst";
    // Nachbarschritt unbelegt: die Runde könnte beide Schritte enthalten (vergessener Druck) oder dem Nachbarn gehören
    if ([k - 1, k + 1].some((j) => j >= 0 && j <= lastMatched && !asg[j] && (isWork(j) || !systematicRest))) return "Nachbarschritt ohne Runde";
    // Pausen hält man nach Bedarf: mit Puls als Beleg erst ab Faktor 1,65 auffällig, sonst wie Arbeit ab 20 %
    if (dev(k) > (hrOk && steps[k].kind === "rest" ? 0.5 : 0.2)) return "Zeit weicht stark vom Ziel ab";
    // Aufzeichnung endet früher und der Schritt gleicht einem Nachbarschritt: eine Lücke wäre nicht von einem Abbruch zu unterscheiden
    if (tail > 0 && [k - 1, k + 1].some((j) => j >= 0 && j < n && steps[j].kind === steps[k].kind && steps[j].goal === steps[k].goal)) return "Abbruch, gleicher Nachbarschritt";
    // Pulspegel gegen die gleichartigen Schritte in der Nähe (bis zu 4, je 2 davor und danach): Pause mit Arbeitspuls oder Arbeit mit Pausenpuls
    if (hrOk && (steps[k].kind === "rest" || steps[k].kind === "station" || steps[k].kind === "run")) {
      const own = hrOf(a[0], a[1]);
      const near = [];
      for (const dir of [-1, 1]) for (let j = k + dir, c = 0; j >= 0 && j < n && c < 2; j += dir)
        if (steps[j].kind === steps[k].kind && asg[j] && !dbl[j] && asg[j][0] === asg[j][1]) { const h = hrOf(asg[j][0], asg[j][0]); if (h != null) { near.push(h); c++; } }
      if (own != null && near.length >= 2) {
        near.sort((x, y) => x - y);
        const mh = near.length % 2 ? near[(near.length - 1) / 2] : (near[near.length / 2 - 1] + near[near.length / 2]) / 2;
        if (steps[k].kind === "rest" && Math.abs(own - mh) > 12) return "Puls passt nicht zu einer Pause";
        // Arbeit mit Pausenpuls: nur nach unten und grosszügig (frischer Referenzlauf liegt natürlich etwas tiefer)
        if (steps[k].kind !== "rest" && own < mh - 20) return "Puls zu tief für diesen Arbeitsschritt";
      }
    }
    // Ergometer misst Strecke: Haben die anderen Stationen mit derselben Planstrecke Meter, muss diese Runde auch welche haben
    const pd = steps[k].kind === "station" ? planDist(steps[k]) : 0;
    if (pd >= 300) {
      const d = dpre[a[1] + 1] - dpre[a[0]];
      const others = matched.filter((j) => j !== k && !dbl[j] && steps[j].kind === "station" && planDist(steps[j]) === pd);
      if (others.length >= 2 && others.filter((j) => dpre[asg[j][1] + 1] - dpre[asg[j][0]] >= 0.6 * pd).length >= 0.75 * others.length && d < 0.3 * pd)
        return "Strecke passt nicht zur Station";
    }
    const alt = altOf(k, a[0]);
    // Vom Ende her verankert (strict) ist riskanter (ein Absturz kann wie ein vollständiges Ende aussehen): doppelter Abstand verlangt
    if (!alt || alt.total - best.total < (strict ? 2 * MARGIN : MARGIN)) return "andere Zuordnung fast gleich gut";
    if ((strict || anomaly || (tail > 0 && k === lastMatched)) && !distinct(k, a)) return "gleicht dem Nachbarschritt";
    return null;
  };
  const why = Array(n).fill(null);
  const cF = Array(n).fill(false), cB = Array(n).fill(false);
  // Vorwärts (Start als Anker): wie bisher, jede Unregelmässigkeit oder jeder unsichere Schritt beendet die Kette
  let rigid = true, next = 0; // next = erste noch nicht verbrauchte Runde
  for (let k = 0; k < n; k++) {
    const a = asg[k];
    if (!a) { if (k <= lastMatched && (isWork(k) || !systematicRest)) rigid = false; why[k] = k > lastMatched ? "nicht aufgezeichnet" : "keine Runde"; continue; }
    for (let q = next; q < a[0]; q++) if (!harmless(T[q])) rigid = false;
    next = a[1] + 1;
    if (a[0] !== a[1] || dbl[k]) rigid = false;
    const w = dbl[k] ? check(k, false) : rigid ? check(k, false) : "nach früherer Unsicherheit";
    cF[k] = !w; why[k] = w;
    if (w && k !== incomplete) rigid = false; // ein zweifelhafter Schritt kann die Verschiebung ausgelöst haben: alles danach ist ebenfalls nicht sicher
  }
  // Rückwärts (Ende als Anker, nur bei vollständiger Aufzeichnung): gleiche Regel spiegelbildlich, Abgrenzung zu den Nachbarn immer verlangt
  if (tail === 0) {
    let ok = true, prevStart = m;
    for (let k = n - 1; k >= 0 && ok; k--) {
      const a = asg[k];
      if (!a) { if (isWork(k) || !systematicRest) ok = false; continue; }
      for (let q = a[1] + 1; q < prevStart; q++) if (!harmless(T[q])) ok = false;
      if (a[0] !== a[1] || dbl[k]) ok = false;
      prevStart = a[0];
      if (!ok) { if (dbl[k]) why[k] = check(k, true); break; }
      const w = check(k, true);
      if (w) { if (why[k] === "nach früherer Unsicherheit") why[k] = w; ok = false; } else cB[k] = true;
    }
  }
  // Ein Schritt direkt vor (vorwärts) bzw. nach (rückwärts) einer Störung ist nicht sicher: die Störung könnte auch ihn betreffen.
  // Endet die Aufzeichnung früher und ist die letzte Runde eine Pause, ist sie nicht sicher (ruhige Runde vor dem Absturz: Trinken, Stehen, Pause).
  const nextLap = (k, dir) => { for (let j = k + dir; j >= 0 && j < n; j += dir) if (asg[j]) return j; return -1; };
  for (let k = 0; k < n; k++) {
    if (!asg[k]) continue;
    const f = nextLap(k, 1), b = nextLap(k, -1);
    const okF = cF[k] && (f >= 0 ? cF[f] : tail === 0 || isWork(k));
    // Die letzte Runde als Pause kann sich nicht selbst verankern (Trinken, Gehen, Stopp sehen gleich aus)
    const okB = cB[k] && (b >= 0 ? cB[b] : true) && (f >= 0 || isWork(k));
    sure[k] = okF || okB;
    if (sure[k]) why[k] = null;
    else if (!why[k]) why[k] = f < 0 && tail > 0 ? "ruhige Runde vor dem Abbruch" : "Störung direkt daneben";
  }
  // Pausenzeit eintragen ist strenger als «Pause hält die Kette»: Die Kette darf eine nach Bedarf längere Pause überspannen (Puls belegt sie),
  // die Zeit selbst wird aber nur eingetragen, wenn sie höchstens 20 % vom Ziel abweicht und die Pause mindestens 45 s geplant ist.
  // Kürzere Pausen sind von einem Übergang oder zu spät gedrückten Lap nicht zu unterscheiden.
  for (let k = 0; k < n; k++) {
    if (!sure[k] || steps[k].kind !== "rest") continue;
    if (!(steps[k].goal >= 45)) { sure[k] = false; why[k] = "kurze Pause: Runde nicht eindeutig"; }
    else if (dev(k) > 0.2) { sure[k] = false; why[k] = "Pausenzeit weicht stark vom Ziel ab"; }
  }

  const merged = [], idx = [];
  asg.forEach((a, k) => {
    if (!a || k === incomplete || dbl[k]) { idx.push(null); return; }
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
    laps: idx, span: asg.map((x, k) => (x && k !== incomplete && !dbl[k] ? x.slice() : null)), pair: dbl.slice(), merged, sure, why, hrUsed: hrOk, incomplete, tail, skipped, merges,
    quality: workSure / Math.max(1, steps.filter((s) => s.kind !== "rest").length - (tail ? steps.slice(n - tail).filter((s) => s.kind !== "rest").length : 0)),
    cost: Math.round(best.total * 100) / 100,
  };
}

/**
 * Prüft eine feste Zuordnung (alignSplits: «direct», «work», «alt») auf Plausibilität, bevor Zeiten ohne weitere Prüfung eingetragen werden.
 * idx[k] = Rundenindex für Schritt k oder null. Abgelehnt wird, wenn die Strecke den Typ widerlegt (Laufschritt ohne Strecke, Pause mit ≥ 300 m)
 * oder der Puls eine Pausenrunde auf einen Arbeitsschritt legt bzw. umgekehrt, oder eine Runde mehr als Faktor 1,65 vom Planziel abweicht. -> true/false
 */
export function layoutOk(laps, steps, idx) {
  const T = laps || [];
  const hasDist = T.some((l) => (+l.d || 0) >= 300);
  const hrs = T.map((l) => +l.hr || 0).filter((h) => h > 0);
  const hrOk = hrs.length >= 0.8 * T.length && hrs.length > 2 && Math.max(...hrs) - Math.min(...hrs) >= 10;
  const rest = (q) => {
    const own = +T[q].hr || 0, p = +(T[q - 1] || {}).hr || 0, n = +(T[q + 1] || {}).hr || 0;
    if (!own || (!p && !n)) return null;
    return { drop: p ? p - own : null, valley: Math.min(p || Infinity, n || Infinity) - own };
  };
  for (let k = 0; k < steps.length; k++) {
    const q = idx[k];
    if (q == null || !T[q]) continue;
    const kind = steps[k].kind, d = +T[q].d || 0;
    // Dauer grob daneben (über Faktor 1,65): Zeichen für vergessenen Druck, Zusatzrunde oder Verschiebung
    if (steps[k].goal > 0 && +T[q].t > 0 && Math.abs(Math.log(+T[q].t / steps[k].goal)) > 0.5) return false;
    // Lauf ohne Strecke, Pause mit ≥ 300 m oder Station mit Strecke, die der Plan nicht vorsieht, widerlegt die Zuordnung.
    if (hasDist && ((kind === "run" && d < 300) || (kind === "rest" && d >= 300) || (kind === "station" && d >= 300 && !ergOk(steps[k], d)))) return false;
    if (hrOk) {
      const sc = rest(q);
      if (sc == null) continue;
      if (kind === "rest" && steps[k].goal >= 45 && sc.drop != null && sc.drop < -3) return false; // Pause deutlich über der Runde davor: das war Arbeit
      if ((kind === "station" || kind === "run") && sc.valley >= 10) return false; // Arbeitsschritt klar im Pulstal: das war eine Pause
    }
  }
  return true;
}
