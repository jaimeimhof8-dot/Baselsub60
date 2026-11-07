// Dashboard zur Einheit: die wichtigsten Fakten als Kacheln, Rundenbalken und Coach-Kennzahlen.
// Reine Funktionen ohne DOM; die Anzeige steht in index.html (s7DashHtml). Der Fliesstext der Analyse bleibt darunter.
import { paceOf, intervals, parseReps } from "./dashboard.js";
import { alignSplits } from "./laps.js";
import { mmss } from "./util.js";

const hms = (s) => (s >= 3600 ? Math.floor(s / 3600) + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0") + " h" : mmss(s) + " min");
const de = (n, d = 1) => n.toFixed(d).replace(".", ",");

/**
 * @param quick Ergebnis von analyseSession (score, tone, verdict, facts)
 * @param act   Aktivität der Uhr {time, dist, hr, maxHr, kcal, laps} oder null
 * @param coach geparste Coach-Analyse (coach.parseAnalysis) oder null
 * @param ph    optional splitPhases(): mit sicherer/wahrscheinlicher Erkennung ersetzen die Arbeitswerte (workDash) die Gesamt-Kacheln Dauer/Ø Puls, und die Rundenbalken tragen ihre Phase
 * @returns {score, tone, verdict, tiles: [{k, v, sub, tone}], laps: [{t, label, hr, pace, h}] | null, chips: [{k, v, tone}], focus}
 */
export function sessionDash(quick, act, coach, ph = null) {
  const f = quick.facts || {};
  const tiles = [];
  if (f.n) tiles.push({ k: "Umsetzung", v: `${f.done}/${f.n}`, sub: `${Math.round((f.done / f.n) * 100)} % des Plans`, tone: f.done / f.n >= 0.999 ? "green" : f.done / f.n >= 0.75 ? "yellow" : "red" });
  if (f.rpe != null) {
    const ref = f.target != null ? f.target : null;
    const d = ref != null ? f.rpe - ref : null;
    tiles.push({ k: "Anstrengung", v: `${f.rpe}/10`, sub: ref != null ? `Vorgabe ≈ ${de(ref, 0)}` : f.lim != null ? `Wochenlimit ${de(f.lim)}` : "", tone: d == null ? "" : Math.abs(d) <= 1 ? "green" : d > 1 ? "red" : "yellow" });
  }
  const phased = !!(ph && ph.conf !== "none" && ph.conf !== undefined);
  if (!phased && act && act.time) tiles.push({ k: "Dauer", v: hms(act.time), sub: act.dist ? de(act.dist / 1000) + " km" + (act.group === "run" && act.dist > 200 ? " · " + mmss(act.time / (act.dist / 1000)) + "/km" : "") : "", tone: "" });
  if (!phased && act && act.hr) tiles.push({ k: "Ø Puls", v: String(act.hr), sub: act.maxHr ? "max " + act.maxHr : "", tone: "" });
  if (f.up || f.down || f.same) tiles.push({ k: "Gewichte", v: `▲${f.up || 0} ▼${f.down || 0}`, sub: `${f.same || 0} gleich`, tone: f.down > f.up ? "red" : f.up ? "green" : "" });

  let laps = null;
  const L = ((act && act.laps) || []).filter((l) => l && l.t > 0).slice(0, 40);
  if (L.length >= 2) {
    const max = Math.max(...L.map((l) => l.t));
    laps = L.map((l, k) => ({ phase: phased && ph.laps.length === (((act && act.laps) || []).filter((x) => x && x.t > 0).length) ? ph.phase[k] : null, t: l.t, label: mmss(l.t), hr: l.hr || null, pace: l.d >= 300 && paceOf(l) ? mmss(paceOf(l)) : null, h: Math.max(8, Math.round((l.t / max) * 100)) }));
  }

  const chips = [];
  let focus = "";
  if (coach) {
    if (coach.form && coach.form.rating) chips.push({ k: "Form", v: coach.form.rating, tone: coach.form.rating === "auf Kurs" ? "green" : coach.form.rating === "unklar" ? "" : coach.form.rating === "über Plan" ? "yellow" : "red" });
    chips.push({ k: "Stärken", v: String(coach.strengths.length), tone: coach.strengths.length ? "green" : "" });
    chips.push({ k: "Schwächen", v: String(coach.weaknesses.length), tone: coach.weaknesses.length ? "red" : "" });
    chips.push({ k: "Anpassungen", v: String(coach.adjustments.length), tone: coach.adjustments.length ? "yellow" : "" });
    focus = coach.nextFocus || "";
  }
  return { score: quick.score, tone: quick.tone, verdict: quick.verdict, tiles, laps, chips, focus };
}

const sgn = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±");

/**
 * Vergleich mit der letzten gleichen Einheit (gleiche Art und gleicher Plantitel, sonst gleiche Art).
 * cur / prev: {act: {time, dist, hr, group} | null, rpe: number | null, work?: {hr, pace} (phaseStats().work)}; easy = lockerer Lauf (langsamer ist dann kein Minus).
 * -> [{k, v, sub, tone}] nur mit Werten, die in beiden Einheiten vorhanden sind
 */
export function compareToPrev(cur, prev, { easy = false } = {}) {
  const rows = [];
  if (!cur || !prev) return rows;
  const a = cur.act, b = prev.act;
  const pace = (x) => (x && x.group === "run" && x.dist >= 1000 && x.time ? x.time / (x.dist / 1000) : null);
  // Mit Arbeitsphasen-Werten auf beiden Seiten wird nur die Arbeit verglichen (Pausenrunden verfälschen sonst)
  const wk = cur.work && prev.work;
  const wPace = wk && cur.work.pace && prev.work.pace ? [cur.work.pace, prev.work.pace] : null;
  const wHr = wk && cur.work.hr && prev.work.hr ? [cur.work.hr, prev.work.hr] : null;
  const pc = wPace ? wPace[0] : pace(a), pp = wPace ? wPace[1] : pace(b);
  let dPace = null;
  if (pc && pp) {
    dPace = Math.round(pc - pp);
    rows.push({ k: wPace ? "Pace Arbeit" : "Pace", v: `${sgn(dPace)}${Math.abs(dPace)} s/km`, sub: `vorher ${mmss(pp)}/km`, tone: easy ? "" : dPace <= -2 ? "green" : dPace >= 5 ? "yellow" : "" });
  }
  if (wHr || (a && b && a.hr && b.hr)) {
    const [hc, hp] = wHr || [a.hr, b.hr];
    const d = Math.round(hc - hp);
    const fasterNow = dPace != null && dPace <= -2; // höherer Puls bei klar schnellerem Tempo ist kein Rückschritt
    rows.push({ k: wHr ? "Ø Puls Arbeit" : "Ø Puls", v: `${sgn(d)}${Math.abs(d)} bpm`, sub: `vorher ${Math.round(hp)}`, tone: d <= -3 ? "green" : d >= 4 && !fasterNow ? "yellow" : "" });
  }
  if (cur.rpe != null && prev.rpe != null) {
    const d = Math.round((cur.rpe - prev.rpe) * 10) / 10;
    rows.push({ k: "Anstrengung", v: `${sgn(d)}${de(Math.abs(d), d % 1 ? 1 : 0)}`, sub: `vorher ${prev.rpe}/10`, tone: d <= -1 ? "green" : d >= 1 ? "yellow" : "" });
  }
  if (a && b && a.time && b.time) {
    const d = Math.round(a.time - b.time);
    rows.push({ k: "Dauer", v: `${sgn(d)}${mmss(Math.abs(d))} min`, sub: `vorher ${hms(b.time)}`, tone: "" });
  }
  return rows;
}

/* ---------- Quelle: kam etwas von der Uhr an? ---------- */

const dmy = (ts) => (ts ? new Date(ts).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

/**
 * Herkunft der Uhr-Daten einer Einheit. Reine Funktion; die Anzeige steht in index.html.
 *  act: gewählte Aktivität oder null · garmin: {on (verbunden), err (Fehlercode), at (letzter Abruf)} · strava: {on, at}
 *  dayLabel: z. B. "Di 27.10." (für die Meldung «keine Aktivität gefunden»)
 * -> {state: "ok"|"partial"|"none", head, lines: [{st: "ok"|"bad"|"none", txt}], refetch: bool}
 *  partial = Aktivität da, aber ohne Runden oder ohne Puls · refetch = Knopf «Erneut abrufen» sinnvoll (Garmin verbunden)
 */
export function sourceInfo(act, { garmin = {}, strava = {}, dayLabel = "" } = {}) {
  const lines = [];
  const gOn = !!garmin.on && !garmin.err;
  if (!act) {
    const why = [];
    if (garmin.err) why.push("Garmin: Zugang abgelehnt, bitte neu verbinden");
    else if (!garmin.on) why.push("Garmin ist nicht verbunden");
    else why.push(`Garmin verbunden${garmin.at ? ", letzter Abruf " + dmy(garmin.at) : ""}, aber${dayLabel ? " am " + dayLabel : ""} keine passende Aktivität gefunden`);
    if (!strava.on) why.push("Strava ist nicht verbunden");
    else why.push(`Strava verbunden${strava.at ? ", letzter Abruf " + dmy(strava.at) : ""}, ohne passende Aktivität`);
    return { state: "none", head: "Nicht übernommen – keine Uhr-Daten", lines: why.map((txt) => ({ st: "bad", txt })), refetch: gOn };
  }
  const name = act.src === "garmin" ? "Garmin" : "Strava";
  const laps = (act.laps || []).filter((l) => l && l.t > 0);
  const waiting = act.src === "garmin" && act.lapsV !== 3 && !laps.length;
  lines.push({ st: "ok", txt: act.got ? `Übernommen am ${dmy(act.got)}` : `Von ${name} geladen` });
  if (laps.length) lines.push({ st: "ok", txt: `${laps.length} ${laps.length === 1 ? "Runde" : "Runden"}` });
  else lines.push({ st: waiting ? "none" : "bad", txt: waiting ? "Runden werden beim nächsten Abruf geholt" : "Keine Runden aufgezeichnet" });
  const lapHr = laps.filter((l) => l.hr).length;
  if (act.hr || lapHr) lines.push({ st: laps.length && lapHr < laps.length ? "none" : "ok", txt: laps.length && lapHr < laps.length ? `Puls in ${lapHr} von ${laps.length} Runden` : "Puls vorhanden" });
  else lines.push({ st: "bad", txt: "Kein Puls aufgezeichnet (Brustgurt/Uhr am Handgelenk prüfen)" });
  const partial = !laps.length || !(act.hr || lapHr);
  return { state: partial ? "partial" : "ok", head: `Von ${name} übernommen`, lines, refetch: act.src === "garmin" && gOn };
}

/* ---------- Phasen: Arbeit, Pause, Ein-/Auslaufen ---------- */

const TONE_PHASE = { warm: "Einlaufen", work: "Arbeit", rest: "Pause", cool: "Auslaufen", other: "Sonstiges" };
export const phaseName = (p) => TONE_PHASE[p] || p;

/**
 * Jede Runde einer Phase zuordnen.
 *  laps: Runden der Uhr [{d, t, hr}] · steps: Plan-Schritte der Einheit (Stationstag, [{kind: warm|cool|run|station|rest|other, name, goal}]) oder null
 *  planText: Plan-Zeile mit "N×… km" (Intervalle) oder ""
 * -> {laps (bereinigt, t > 0), phase: [warm|work|rest|cool|other je Runde], step: [Plan-Schritt je Runde|null], sub: ["run"|"station"|null],
 *     conf: "sure"|"likely"|"unsure"|"none", mode, note}
 * conf "none" = Phasen nicht erkennbar (keine Arbeitswerte zeigen), "unsure" = nach Tempo geschätzt.
 */
export function splitPhases(laps, { steps = null, planText = "" } = {}) {
  const L = (laps || []).filter((l) => l && l.t > 0);
  const out = { laps: L, phase: L.map(() => "other"), step: L.map(() => null), sub: L.map(() => null), conf: "none", mode: null, note: "" };
  if (!L.length) { out.note = "Keine Runden – Phasen lassen sich nicht trennen."; return out; }

  if (steps && steps.length) {
    const r = alignSplits(L, steps);
    if (!r.times) { out.note = `Die ${r.count} Runden der Uhr passen nicht zu den ${steps.length} Plan-Schritten – keine Trennung geraten.`; return out; }
    steps.forEach((st, k) => {
      const li = r.laps[k];
      if (li == null || !L[li]) return;
      out.step[li] = k;
      out.phase[li] = st.kind === "warm" ? "warm" : st.kind === "cool" ? "cool" : st.kind === "rest" ? "rest" : st.kind === "run" || st.kind === "station" ? "work" : "other";
      out.sub[li] = st.kind === "run" || st.kind === "station" ? st.kind : null;
    });
    if (r.mode === "alt") for (let i = 1; i < r.count; i += 2) if (out.phase[i] === "other" && out.step[i] == null) out.phase[i] = "rest";
    out.mode = r.mode;
    out.conf = r.mode === "alt" ? "likely" : "sure";
    out.note = r.mode === "alt" ? "Arbeit und Pause wechseln sich in den Runden ab – so zugeordnet, nicht einzeln bestätigt." : r.mode === "work" ? "Pausen wurden an der Uhr nicht gelappt; Arbeitsrunden direkt zugeordnet." : "";
    return out;
  }

  const reps = parseReps(planText);
  const fillAround = (work) => {
    const first = Math.min(...work), last = Math.max(...work);
    L.forEach((_, i) => { out.phase[i] = work.includes(i) ? "work" : i < first ? "warm" : i > last ? "cool" : "rest"; out.sub[i] = work.includes(i) ? "run" : null; });
  };
  if (reps) {
    const iv = intervals(L, planText);
    if (iv.kind === "intervals") {
      fillAround(iv.work);
      out.mode = "plan-intervals";
      out.conf = iv.work.length === reps.n ? "sure" : "likely";
      out.note = iv.work.length === reps.n ? "" : `${iv.work.length} von ${reps.n} geplanten Wiederholungen in den Runden gefunden.`;
      // Laufen die übrigen Runden im selben Tempo, ist «Pause/Einlaufen» nicht belegt (z. B. Auto-Lap bei gleichmässigem Lauf)
      const wp = mean(iv.work.map((i) => paceOf(L[i])).filter(Boolean));
      if (wp && L.some((l, i) => !iv.work.includes(i) && l.t >= 60 && paceOf(l) && paceOf(l) <= wp * 1.06)) {
        out.conf = "unsure";
        out.note = "Runden ausserhalb der Wiederholungen laufen im gleichen Tempo – Arbeit und Pause sind nicht sicher trennbar.";
      }
      return out;
    }
  }
  const iv = intervals(L, "");
  if (iv.kind === "steady" || L.length === 1) {
    L.forEach((_, i) => { out.phase[i] = "work"; out.sub[i] = "run"; });
    out.mode = "steady";
    out.conf = reps ? "unsure" : "sure";
    out.note = reps ? "Plan nennt Wiederholungen, die Runden zeigen aber gleichmässiges Tempo: ganze Einheit als Arbeit gezählt." : "Gleichmässige Einheit: alles gilt als Arbeit, Ein-/Auslaufen ist nicht abgetrennt.";
    return out;
  }
  if (iv.kind === "intervals") {
    fillAround(iv.work);
    out.mode = "pace";
    out.conf = "unsure";
    out.note = "Arbeitsrunden nach Tempo geschätzt (keine passende Plan-Vorgabe) – Werte mit Vorsicht lesen.";
    return out;
  }
  out.note = "Zu wenige Runden mit Distanz – Phasen nicht erkennbar.";
  return out;
}

const wavg = (items, key) => {
  const v = items.filter((l) => l[key]);
  const t = v.reduce((s, l) => s + l.t, 0);
  return t ? v.reduce((s, l) => s + l[key] * l.t, 0) / t : null;
};
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const paceSum = (ls) => {
  const v = ls.filter((l) => l.d >= 100);
  const d = v.reduce((s, l) => s + l.d, 0);
  return d ? v.reduce((s, l) => s + l.t, 0) / (d / 1000) : null;
};
export const ZONES = [["Z1", 0, 0.6], ["Z2", 0.6, 0.7], ["Z3", 0.7, 0.8], ["Z4", 0.8, 0.9], ["Z5", 0.9, 9]];

/**
 * Kennzahlen aus den getrennten Phasen. Berechnet wird nur, was die Daten wirklich hergeben (sonst null).
 *  ph: Ergebnis von splitPhases · steps: Plan-Schritte oder null · maxHr: Referenz-Maximalpuls für Zonen oder null
 * Puls gibt es von der Uhr nur als Rundenschnitt: «Spitze» ist der höchste Rundenschnitt, nicht der echte Maximalpuls.
 */
export function phaseStats(ph, { steps = null, maxHr = null } = {}) {
  const L = ph.laps, at = (name) => L.filter((_, i) => ph.phase[i] === name);
  const work = at("work"), rest = at("rest"), warm = at("warm"), cool = at("cool");
  const runs = work.filter((l) => (ph.sub[L.indexOf(l)] || "run") === "run");
  const sum = (a) => a.reduce((s, l) => s + l.t, 0);
  const ok = ph.conf === "sure" || ph.conf === "likely" || ph.conf === "unsure";
  const st = {
    conf: ph.conf, note: ph.note,
    time: { work: sum(work), rest: sum(rest), warm: sum(warm), cool: sum(cool), all: sum(L) },
    n: { work: work.length, rest: rest.length },
    total: { hr: wavg(L, "hr") && Math.round(wavg(L, "hr")), pace: paceSum(L) },
    work: null, zones: null, drift: null, spread: null, recovery: null, compromise: null, plan: null,
  };
  if (!ok || !work.length) return st;

  const whr = wavg(work, "hr");
  st.work = {
    hr: whr == null ? null : Math.round(whr),
    hrCover: `${work.filter((l) => l.hr).length}/${work.length}`,
    peak: Math.max(0, ...work.map((l) => l.hr || 0)) || null,
    pace: paceSum(runs),
  };

  if (maxHr && whr != null) {
    const hrLaps = work.filter((l) => l.hr), tot = sum(hrLaps);
    const z = ZONES.map(([k, lo, hi]) => ({ k, s: hrLaps.filter((l) => l.hr / maxHr >= lo && l.hr / maxHr < hi).reduce((s, l) => s + l.t, 0) }));
    st.zones = z.map((x) => ({ k: x.k, s: x.s, pct: Math.round((x.s / tot) * 100) }));
  }

  // Puls-Drift: Rundenschnitt erstes gegen letztes Drittel der Arbeitsrunden (nur Läufe, sonst Stationen mit anderem Pulsniveau)
  const dl = runs.filter((l) => l.hr);
  if (dl.length >= 3) {
    const k = Math.max(1, Math.floor(dl.length / 3));
    const a = mean(dl.slice(0, k).map((l) => l.hr)), b = mean(dl.slice(-k).map((l) => l.hr));
    const pa = paceSum(dl.slice(0, k)), pb = paceSum(dl.slice(-k));
    st.drift = { bpm: Math.round(b - a), pct: Math.round(((b - a) / a) * 1000) / 10, from: Math.round(a), to: Math.round(b), n: dl.length, slower: pa && pb ? pb / pa - 1 : null };
  }

  // Streuung der Rundenzeiten (Pace der Arbeitsläufe)
  const ps = runs.map(paceOf).filter(Boolean);
  if (ps.length >= 3) {
    const m = mean(ps), sd = Math.sqrt(mean(ps.map((p) => (p - m) ** 2)));
    st.spread = { min: Math.min(...ps), max: Math.max(...ps), range: Math.round(Math.max(...ps) - Math.min(...ps)), cv: Math.round((sd / m) * 1000) / 10, n: ps.length };
  }

  // Erholung: Rundenschnitt-Puls der Pause gegen die Arbeitsrunde davor (nur wenn die Pause als eigene Runde existiert)
  const drops = [];
  L.forEach((l, i) => {
    if (ph.phase[i] !== "rest" || !l.hr) return;
    for (let j = i - 1; j >= 0; j--) { if (ph.phase[j] === "work") { if (L[j].hr) drops.push({ drop: L[j].hr - l.hr, rest: l.t }); break; } if (ph.phase[j] !== "rest") break; }
  });
  if (drops.length) st.recovery = { drop: Math.round(mean(drops.map((d) => d.drop))), n: drops.length, restS: Math.round(mean(drops.map((d) => d.rest))) };

  if (steps && steps.length && ph.mode) {
    // Kompromiss-Delta: Lauf direkt nach einer Station gegen den frischen Referenzlauf (ohne Station davor)
    const lapOf = (k) => { const i = ph.step.indexOf(k); return i >= 0 ? L[i] : null; };
    const ref = steps.map((s, k) => (s.kind === "run" && /Referenz/.test(s.name || "") ? paceOf(lapOf(k)) : null)).filter(Boolean)[0];
    if (ref) {
      const ds = [];
      steps.forEach((s, k) => {
        if (s.kind !== "run" || /Referenz/.test(s.name || "") || !steps[k - 1] || steps[k - 1].kind !== "station") return;
        const p = paceOf(lapOf(k));
        if (p) ds.push({ after: steps[k - 1].name, delta: Math.round(p - ref) });
      });
      if (ds.length) st.compromise = { ref: Math.round(ref), avg: Math.round(mean(ds.map((d) => d.delta))), worst: ds.reduce((a, b) => (b.delta > a.delta ? b : a)), n: ds.length };
    }
    // Plan gegen Ist je Schritt (nur Schritte mit Zielzeit und Runde)
    const rows = [];
    steps.forEach((s, k) => { const l = lapOf(k); if (l && s.goal > 0 && (s.kind === "run" || s.kind === "station")) rows.push({ name: s.name, kind: s.kind, goal: s.goal, t: Math.round(l.t), diff: Math.round(l.t - s.goal) }); });
    if (rows.length) st.plan = { rows, hit: rows.filter((r) => r.diff <= 0).length, n: rows.length, sum: rows.reduce((s, r) => s + r.diff, 0) };
  }
  return st;
}

const sg = (n, unit) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)} ${unit}`;

/**
 * Anzeige-Bausteine fürs Handy: wenige Hauptkennzahlen (Arbeit) + Gesamtwerte klein daneben + Detail-Auswertungen mit Ein-Satz-Erklärung.
 * -> {main: [{k, v, sub, tone}], totals: string, phaseBar: [{phase, s, pct}], details: [{k, v, why, tone, rows?: [{a, b, tone}]}], warn: string}
 */
export function workDash(st) {
  const out = { main: [], totals: "", phaseBar: [], details: [], warn: "" };
  if (st.time.all) {
    const parts = [["work", st.time.work], ["rest", st.time.rest], ["warm", st.time.warm], ["cool", st.time.cool]].filter(([, s]) => s > 0);
    out.phaseBar = parts.map(([phase, s]) => ({ phase, s, label: phaseName(phase), pct: Math.max(2, Math.round((s / st.time.all) * 100)) }));
  }
  const tot = [];
  if (st.total.hr) tot.push(`Ø Puls ${st.total.hr}`);
  if (st.total.pace) tot.push(`Ø Pace ${mmss(st.total.pace)}/km`);
  if (st.time.all) tot.push(`${hms(st.time.all)} gesamt`);
  out.totals = tot.length ? `Ganzes Training inkl. Pausen: ${tot.join(" · ")}` : "";
  if (st.conf === "none") { out.warn = st.note || "Phasen nicht erkennbar."; return out; }
  if (st.conf === "unsure" || st.conf === "likely") out.warn = st.note;
  const w = st.work;
  if (!w) return out;
  const diff = st.total.hr && w.hr ? w.hr - st.total.hr : null;
  if (w.hr) out.main.push({ k: "Ø Puls Arbeit", v: String(w.hr), sub: diff ? `${sg(diff, "bpm")} zum Gesamt-Ø` : "gleich wie Gesamt", tone: "" });
  if (w.peak) out.main.push({ k: "Höchster Runden-Ø", v: String(w.peak), sub: "Spitze der Arbeitsrunden", tone: "" });
  if (w.pace) out.main.push({ k: "Pace Arbeit", v: mmss(w.pace), sub: "/km nur Arbeitsläufe", tone: "" });
  if (st.time.work) out.main.push({ k: "Arbeitszeit", v: hms(st.time.work), sub: `${st.n.work} Runden · Pause ${st.time.rest ? hms(st.time.rest) : "–"}`, tone: "" });
  if (st.drift) {
    const d = st.drift, tone = d.pct < 3 ? "green" : d.pct < 6 ? "yellow" : "red";
    out.main.push({ k: "Puls-Drift", v: sg(d.bpm, "bpm"), sub: `${d.from} → ${d.to}`, tone });
  }
  if (st.compromise) out.main.push({ k: "Kompromiss-Delta", v: sg(st.compromise.avg, "s/km"), sub: `schlechtester: nach ${st.compromise.worst.after}`, tone: st.compromise.avg <= 8 ? "green" : st.compromise.avg <= 20 ? "yellow" : "red" });
  out.main = out.main.slice(0, 6);

  const D = out.details;
  if (st.zones && st.zones.some((z) => z.s)) D.push({ k: "Zeit in Zonen", v: st.zones.filter((z) => z.pct).map((z) => `${z.k} ${z.pct} %`).join(" · "), why: "Anteil der Arbeitszeit je Pulsbereich, nach dem Rundenschnitt zugeordnet (grob, kurze Spitzen fehlen).", tone: "" });
  if (st.drift) D.push({ k: "Puls-Drift", v: `${sg(st.drift.bpm, "bpm")} (${st.drift.pct > 0 ? "+" : st.drift.pct < 0 ? "−" : "±"}${de(Math.abs(st.drift.pct))} %)`, why: `Rundenschnitt-Puls im letzten gegen das erste Drittel der ${st.drift.n} Arbeitsläufe${st.drift.slower != null && st.drift.slower > 0.02 ? " – bei langsamerem Tempo, also echte Ermüdung" : st.drift.slower != null && st.drift.slower < -0.02 ? " – bei schnellerem Tempo, Anstieg teils erklärt" : ""}; unter 3 % ist ein gutes Zeichen.`, tone: st.drift.pct < 3 ? "green" : st.drift.pct < 6 ? "yellow" : "red" });
  if (st.spread) D.push({ k: "Streuung der Läufe", v: `${mmss(st.spread.min)}–${mmss(st.spread.max)}/km`, why: `Spanne ${st.spread.range} s/km über ${st.spread.n} Läufe; je kleiner, desto gleichmässiger gepaced.`, tone: st.spread.cv <= 2 ? "green" : st.spread.cv <= 4 ? "yellow" : "red" });
  if (st.recovery) D.push({ k: "Erholung in der Pause", v: `−${Math.max(0, st.recovery.drop)} bpm`, why: `Ø Puls der Pause (${hms(st.recovery.restS)}) gegen die Runde davor, über ${st.recovery.n} Pausen; grösser heisst besser erholt.`, tone: "" });
  if (st.compromise) D.push({ k: "Lauf nach Station", v: `${sg(st.compromise.avg, "s/km")} zur Referenz ${mmss(st.compromise.ref)}`, why: `Pace der Läufe direkt nach einer Station minus frischer Referenzkilometer (${st.compromise.n} Läufe).`, tone: "" });
  if (st.plan) D.push({ k: "Plan gegen Ist", v: `${st.plan.hit} von ${st.plan.n} im Ziel`, why: `Rundenzeit gegen die Zielzeit je Schritt; insgesamt ${sg(st.plan.sum, "s")}.`, tone: st.plan.hit === st.plan.n ? "green" : st.plan.hit >= st.plan.n / 2 ? "yellow" : "red", rows: st.plan.rows.map((r) => ({ a: r.name, b: `${mmss(r.t)} (Ziel ${mmss(r.goal)}, ${sg(r.diff, "s")})`, tone: r.diff <= 0 ? "green" : r.diff <= r.goal * 0.05 ? "yellow" : "red" })) });
  return out;
}

/* ---------- HTML-Bausteine (Zeichenketten, ohne DOM; esc = HTML-Escaper der App) ---------- */

const ICON = { ok: "✓", bad: "!", none: "–" };

/**
 * Quelle-Box, Arbeitsphasen-Block und «Weitere Auswertungen» als HTML.
 *  src: sourceInfo() · wd: workDash() · actId: Aktivitäts-ID für «Erneut abrufen»
 * -> {src, work, more}
 */
export function dashSections({ src, wd, actId = "" }, esc) {
  const btn = src.refetch
    ? src.state === "none"
      ? `<button type="button" class="s6-btn" data-act="gm-sync">Jetzt abrufen</button>`
      : `<button type="button" class="s6-btn" data-act="gm-refetch" data-id="${esc(actId)}">Erneut abrufen</button>`
    : "";
  const srcHtml = `<div class="dsrc ${src.state}"><div class="dsh"><b>${esc(src.head)}</b>${btn}</div><ul>${src.lines.map((l) => `<li class="${l.st}"><span aria-hidden="true">${ICON[l.st] || "–"}</span> ${esc(l.txt)}</li>`).join("")}</ul></div>`;

  let work = "";
  if (wd.main.length || wd.warn || wd.totals) {
    const bar = wd.phaseBar.length > 1 && wd.main.length
      ? `<div class="pbar" role="img" aria-label="Zeitanteile der Phasen">${wd.phaseBar.map((p) => `<i class="ph-${p.phase}" style="flex:${p.pct}"></i>`).join("")}</div><div class="pleg">${wd.phaseBar.map((p) => `<span><i class="ph-${p.phase}"></i>${esc(p.label)} ${esc(hms(p.s))}</span>`).join("")}</div>`
      : "";
    work = `<div class="dw"><span class="k">Nur Arbeitsphasen</span>${wd.warn ? `<p class="dwarn">${esc(wd.warn)}</p>` : ""}${wd.main.length ? `<div class="dg">${wd.main.map((t) => `<div class="dt ${t.tone}"><span class="k">${esc(t.k)}</span><b>${esc(t.v)}</b><span class="s">${esc(t.sub)}</span></div>`).join("")}</div>` : ""}${bar}${wd.totals ? `<p class="dtot">${esc(wd.totals)}</p>` : ""}</div>`;
  }

  const more = wd.details.length
    ? `<details class="dmore"><summary>Weitere Auswertungen (${wd.details.length})</summary>${wd.details.map((x) => `<div class="dd ${x.tone}"><div class="ddh"><span>${esc(x.k)}</span><b>${esc(x.v)}</b></div><p>${esc(x.why)}</p>${x.rows ? `<ul class="ddr">${x.rows.map((r) => `<li class="${r.tone}"><span>${esc(r.a)}</span><span>${esc(r.b)}</span></li>`).join("")}</ul>` : ""}</div>`).join("")}</details>`
    : "";
  return { src: srcHtml, work, more };
}
