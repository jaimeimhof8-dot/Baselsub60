// Dashboard nach dem Training, Fassung 3 (Datenplan docs/dashboard-planung.md): wenige Zahlen, kein Urteil, keine Anstrengung (RPE).
// Reine Funktionen ohne DOM; die Anzeige ruft dashV3Html() und anCardHtml() auf. Fehlende Daten heissen «keine Daten, Grund: …», nie eine erfundene Zahl.
import { mmss } from "./util.js";

const sg = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n);
const de = (n, d = 1) => n.toFixed(d).replace(".", ",");
const hms = (t) => (t >= 3600 ? Math.floor(t / 3600) + ":" + String(Math.floor((t % 3600) / 60)).padStart(2, "0") + " h" : mmss(t) + " min");
/** Ab dieser Verlangsamung nach einer Station (s/km) gilt ein Übergang als «nicht im Ziel» (orange). */
export const COMP_WARN = 15;
/** Ab diesem Puls-Anstieg (%) ist die Drift «nicht im Ziel» (orange); darunter neutral. */
export const DRIFT_WARN = 6;

/** Zieltempo einer Intervall-Zeile («6×1 km @ 4:00/km») in s/km oder null. */
export function planGoal(planText) {
  const m = /@\s*(\d{1,2}):(\d{2})/.exec(String(planText || ""));
  return m ? +m[1] * 60 + +m[2] : null;
}

/** Plan gegen Ist für Intervall-Läufe: Ziel = Zieltempo × Distanz der Runde. null ohne Zieltempo oder ohne Arbeitsrunden. */
export function intervalPlan(ph, planText) {
  const goal = planGoal(planText);
  if (!goal || !ph || !ph.laps || !ph.laps.length) return null;
  const rows = [];
  ph.laps.forEach((l, i) => {
    if (ph.phase[i] !== "work" || (ph.sub[i] || "run") !== "run" || !(l.d >= 100)) return;
    const g = Math.round(goal * (l.d / 1000));
    rows.push({ name: `Intervall ${rows.length + 1}`, goal: g, t: Math.round(l.t), diff: Math.round(l.t - g) });
  });
  return rows.length ? { rows, hit: rows.filter((r) => r.diff <= 0).length, n: rows.length, goalPace: goal } : null;
}

/** Vergleich mit der letzten Einheit als Tabellenzeilen {k, now, was, d, tone}; nur Werte, die in beiden Einheiten vorhanden sind. */
export function compareRows(cur, prev, kind) {
  const rows = [];
  if (!cur || !prev) return rows;
  const cw = cur.work, pw = prev.work;
  const label = kind === "station" ? "Pace Läufe" : kind === "steady" ? "Pace" : "Pace Arbeit";
  if (cw && pw && cw.pace && pw.pace) {
    const d = Math.round(cw.pace - pw.pace);
    rows.push({ k: label, now: mmss(cw.pace) + "/km", was: mmss(pw.pace) + "/km", d: sg(d) + " s/km", tone: d >= 5 ? "yellow" : "" });
  }
  if (cw && pw && cw.hr && pw.hr) {
    const d = Math.round(cw.hr - pw.hr);
    rows.push({ k: kind === "steady" ? "Ø Puls" : "Ø Puls Arbeit", now: String(Math.round(cw.hr)), was: String(Math.round(pw.hr)), d: sg(d) + " bpm", tone: "" });
  }
  if (kind === "station" && cur.comp != null && prev.comp != null) {
    const d = cur.comp - prev.comp;
    rows.push({ k: "Kompromiss-Delta", now: sg(cur.comp) + " s", was: sg(prev.comp) + " s", d: sg(d) + " s", tone: d >= 3 ? "yellow" : "" });
  }
  return rows;
}

/**
 * Daten für Dashboard und Analyse-Karte.
 *  kind: Art der Einheit (kraft|station|lauf|steady = gleichmässig: Rad, lockerer Lauf, Zusatz-Einheit); group: Sportart der Uhr (run|bike|…); maxHr: höchster gemessener Puls; zone2: Plan nennt Zone 2 · act: Uhr-Aktivität oder null · ph: splitPhases() · st: phaseStats()
 *  planText: Intervall-Zeile des Plans · facts: {done, n, open: [Namen], skipped: Zahl}
 *  prev: null | {label, same, work, comp} (letzte gleiche Einheit mit Uhr-Daten) · coachNext: nextFocus der Coach-Analyse oder ""
 * -> {kind, tiles: [{k, v, sub, tone, na?, why?}], stations: [{after, delta, warn}] | null, hint, openNote, plan, cmp: {title, rows, note} | null, an: {good, bad, next}}
 */
export function dashV3({ kind, act, ph, st, planText = "", facts = {}, prev = null, coachNext = "", group = "", maxHr = null, zone2 = false }) {
  const isK = kind === "kraft", isS = kind === "station";
  const out = { kind: isK ? "kraft" : isS ? "station" : "lauf", tiles: [], stations: null, hint: "", openNote: "", plan: null, cmp: null, an: { good: [], bad: [], next: "" } };
  const work = st && st.work, comp = st && st.compromise;
  const noWhy = !act ? "keine Uhr-Aktivität gefunden" : (ph && ph.note) || "Arbeitsphasen nicht erkennbar";

  if (isK) {
    if (facts.n) out.tiles.push({ k: "Umsetzung", v: `${facts.done}/${facts.n}`, sub: "Übungen abgehakt", tone: "" });
    const parts = [];
    if (facts.open && facts.open.length) parts.push(`Offen geblieben: ${facts.open.join(", ")}.`);
    if (facts.skipped) parts.push(`${facts.skipped} ${facts.skipped === 1 ? "Übung" : "Übungen"} gestrichen.`);
    out.openNote = parts.join(" ");
    if (facts.n) out.an.good.push({ n: `${facts.done} von ${facts.n}`, t: "Übungen abgehakt." });
    if (facts.open && facts.open.length) out.an.bad.push({ n: `${facts.open.length} offen`, t: `${facts.open.join(", ")} fehlt.` });
    out.an.next = coachNext || (facts.open && facts.open.length ? `${facts.open[0]} früher machen, wenn die Zeit knapp wird.` : "");
    return out;
  }

  if (kind === "steady") {
    // Gleichmässige Einheit (Rad, lockerer Lauf, Zusatz-Einheit): die ganze Einheit zählt, Tempo nur beim Laufen
    out.kind = "steady";
    const hr = work && work.hr ? work.hr : act && act.hr ? act.hr : null;
    const noWhySt = !act ? "keine Uhr-Aktivität gefunden" : "kein Puls aufgezeichnet";
    out.tiles.push(hr ? { k: "Ø Puls", v: String(Math.round(hr)), sub: "ganze Einheit", tone: "" } : { k: "Ø Puls", v: "–", sub: "", na: true, why: noWhySt });
    const time = act && act.time ? act.time : st && st.time && st.time.all ? st.time.all : 0;
    out.tiles.push(time ? { k: "Dauer", v: hms(time), sub: act && act.dist ? de(act.dist / 1000) + " km" : "", tone: "" } : { k: "Dauer", v: "–", sub: "", na: true, why: noWhySt });
    if (group === "run" && work && work.pace) out.tiles.push({ k: "Pace", v: mmss(work.pace), sub: "/km", tone: "" });
    if (st && st.drift) out.tiles.push({ k: "Puls-Drift", v: sg(st.drift.bpm) + " bpm", sub: "erstes zu letztem Drittel", tone: st.drift.pct >= DRIFT_WARN ? "yellow" : "" });
    if (prev) {
      const confOk = st && (st.conf === "sure" || st.conf === "likely");
      const cur = { work: hr ? { hr, pace: group === "run" && confOk && work ? work.pace : null } : null };
      const rows = compareRows(cur, { work: prev.work }, "steady");
      out.cmp = { title: `Vergleich mit ${prev.same ? "der letzten gleichen Einheit" : "der letzten ähnlichen Einheit"} (${prev.label})`, rows, note: rows.length ? "" : "keine Daten, Grund: in der früheren Einheit fehlt der Puls" };
    } else if (act) out.cmp = { title: "Vergleich mit der letzten Einheit", rows: [], note: "keine Daten, Grund: noch keine frühere gleiche Einheit mit Uhr-Daten" };
    const G = out.an.good, B = out.an.bad;
    if (hr && zone2 && maxHr) {
      const lo = Math.round(maxHr * 0.6), hi = Math.round(maxHr * 0.7);
      if (hr > hi) B.push({ n: `${Math.round(hr)} bpm`, t: `über Zone 2 (bis ${hi} bpm).` });
      else G.push({ n: `${Math.round(hr)} bpm`, t: `im Zone-2-Bereich (${lo}–${hi} bpm).` });
    }
    if (st && st.drift) {
      if (st.drift.pct >= 3) B.push({ n: sg(st.drift.bpm) + " bpm", t: "Puls stieg im Verlauf." });
      else if (G.length < 2) G.push({ n: sg(st.drift.bpm) + " bpm", t: "Puls blieb stabil." });
    }
    out.an.good = G.slice(0, 2);
    out.an.bad = B.slice(0, 2);
    out.an.next = coachNext || "";
    if (hr && zone2 && maxHr) out.hint = `Zone 2 = 60 bis 70 % vom höchsten gemessenen Puls (${maxHr} bpm).`;
    return out;
  }

  if (!work) {
    out.tiles.push({ k: "Arbeitswerte", v: "–", sub: "", na: true, why: noWhy });
  } else {
    const cover = work.hrCover && /^(\d+)\/(\d+)$/.exec(work.hrCover);
    const partial = cover && cover[1] !== cover[2];
    out.tiles.push(work.hr ? { k: "Ø Puls Arbeit", v: String(work.hr), sub: partial ? `Puls in ${cover[1]} von ${cover[2]} Runden` : isS ? "Läufe und Stationen" : "nur die Arbeitsrunden", tone: "" } : { k: "Ø Puls Arbeit", v: "–", sub: "", na: true, why: "kein Puls in den Arbeitsrunden aufgezeichnet" });
    if (isS) {
      out.tiles.unshift(comp ? { k: "Kompromiss-Delta", v: sg(comp.avg) + " s/km", sub: "Läufe nach Station, Ø", tone: "" } : { k: "Kompromiss-Delta", v: "–", sub: "", na: true, why: "kein Referenz-km oder Runden passen nicht zum Plan" });
    } else {
      if (work.pace) out.tiles.push({ k: "Pace Arbeit", v: mmss(work.pace), sub: "/km", tone: "" });
      out.tiles.push(st.drift ? { k: "Puls-Drift", v: sg(st.drift.bpm) + " bpm", sub: "erstes zu letztem Drittel", tone: st.drift.pct >= DRIFT_WARN ? "yellow" : "" } : { k: "Puls-Drift", v: "–", sub: "", na: true, why: "weniger als 3 Arbeitsläufe mit Puls" });
    }
  }
  if (isS && comp && comp.list) {
    out.stations = comp.list.map((d) => ({ after: d.after, delta: d.delta, warn: d.delta >= COMP_WARN }));
    out.hint = "Die Referenz ist nur 1 km. Ein Ausreisser dort verschiebt alle Werte.";
  }

  // Plan gegen Ist: Stationstag aus den Plan-Schritten, Intervall-Lauf aus Zieltempo × Distanz
  const plan = isS ? (st && st.plan ? { rows: st.plan.rows, hit: st.plan.hit, n: st.plan.n } : null) : intervalPlan(ph, planText);
  out.plan = plan ? { rows: plan.rows.map((r) => ({ name: r.name, goal: r.goal, t: r.t, diff: r.diff })), hit: plan.hit, n: plan.n } : null;

  // Vergleich mit der letzten Einheit
  if (prev) {
    const confOk = st && (st.conf === "sure" || st.conf === "likely");
    const rows = compareRows({ work: confOk ? work : null, comp: confOk && comp ? comp.avg : null }, { work: prev.work, comp: prev.comp }, out.kind);
    out.cmp = { title: `Vergleich mit ${prev.same ? "der letzten gleichen Einheit" : "der letzten ähnlichen Einheit"} (${prev.label})`, rows, note: rows.length ? "" : "keine Daten, Grund: in der früheren Einheit fehlen Arbeitswerte" };
  } else if (act) {
    out.cmp = { title: "Vergleich mit der letzten Einheit", rows: [], note: "keine Daten, Grund: noch keine frühere gleiche Einheit mit Uhr-Daten" };
  }

  // Analyse-Zeilen: nur aus gemessenen Zahlen, höchstens 2 je Block
  const G = out.an.good, B = out.an.bad, label = prev ? prev.label : "";
  const rowOf = (k) => (out.cmp ? out.cmp.rows.find((r) => r.k === k) : null);
  if (isS) {
    const c = rowOf("Kompromiss-Delta"), p = rowOf("Pace Läufe");
    if (c && c.tone === "") { const d = comp.avg - prev.comp; if (d <= -2) G.push({ n: sg(d) + " s", t: `Kompromiss-Delta besser als beim letzten Mal (${label}).` }); }
    if (p && /^−/.test(p.d)) G.push({ n: p.d, t: "Pace der Läufe schneller." });
    if (comp && comp.worst && comp.worst.delta >= COMP_WARN) B.push({ n: sg(comp.worst.delta) + " s", t: `nach ${comp.worst.after} der schwächste Übergang.` });
    if (out.plan && out.plan.hit < out.plan.n) B.push({ n: `${out.plan.hit} von ${out.plan.n}`, t: "Schritte im Ziel." });
    out.an.next = coachNext || (comp && comp.worst && comp.worst.delta >= COMP_WARN ? `Nach ${comp.worst.after} 10 s ruhig atmen, dann Tempo aufnehmen.` : "");
  } else {
    const p = rowOf("Pace Arbeit");
    if (p && /^−/.test(p.d)) G.push({ n: p.d, t: `Pace schneller als beim letzten Mal (${label}).` });
    if (st && st.drift && st.drift.pct < 3 && !G.length) G.push({ n: sg(st.drift.bpm) + " bpm", t: "Puls blieb stabil." });
    if (out.plan && out.plan.hit < out.plan.n) {
      const miss = out.plan.rows.map((r, i) => (r.diff > 0 ? i + 1 : 0)).filter(Boolean);
      B.push({ n: `${out.plan.hit} von ${out.plan.n}`, t: `Intervall ${miss[0]}${miss.length > 1 ? " bis " + miss[miss.length - 1] : ""} über ${mmss(out.plan.rows[miss[0] - 1].goal)}.` });
    }
    if (st && st.drift && st.drift.pct >= 3) B.push({ n: sg(st.drift.bpm) + " bpm", t: st.drift.slower != null && st.drift.slower > 0.02 ? "Puls stieg, das Tempo sank." : "Puls stieg." });
    if (p && p.tone === "yellow") B.push({ n: p.d, t: `Pace langsamer als beim letzten Mal (${label}).` });
    out.an.next = coachNext || (out.plan && out.plan.hit < out.plan.n && st && st.drift && st.drift.pct >= 3 ? "Die ersten Intervalle am Ziel halten statt schneller zu starten." : "");
  }
  out.an.good = G.slice(0, 2);
  out.an.bad = B.slice(0, 2);
  return out;
}

/* ---------- HTML (Zeichenketten; esc = HTML-Escaper der App) ---------- */
const tileHtml = (t, esc) => t.na
  ? `<div class="dt"><span class="k">${esc(t.k)}</span><b>–</b><span class="s">keine Daten, Grund: ${esc(t.why)}</span></div>`
  : `<div class="dt ${t.tone || ""}"><span class="k">${esc(t.k)}</span><b>${esc(t.v)}</b>${t.sub ? `<span class="s">${esc(t.sub)}</span>` : ""}</div>`;
const sgs = (n) => sg(n);

/** Kacheln, Delta je Station und die zwei aufklappbaren Tabellen (Plan gegen Ist, Vergleich). */
export function dashV3Html(d, esc) {
  let h = `<div class="dg">${d.tiles.map((t) => tileHtml(t, esc)).join("")}</div>`;
  if (d.openNote) h += `<p class="dwarn v3-note">${esc(d.openNote)}</p>`;
  if (d.stations && d.stations.length) h += `<div class="dl"><span class="k">Delta je Station</span>${d.stations.map((s) => `<div class="v3-row${s.warn ? " warn" : ""}"><span>nach ${esc(s.after)}</span><b>${esc(sgs(s.delta))} s/km</b></div>`).join("")}${d.hint ? `<p class="dtot">${esc(d.hint)}</p>` : ""}</div>`;
  if (d.kind === "steady" && d.hint) h += `<p class="dtot v3-note">${esc(d.hint)}</p>`;
  if (d.kind === "lauf" || d.kind === "station") {
    const planBody = d.plan
      ? `<table class="v3-t"><thead><tr><th>Schritt</th><th class="n">Ziel</th><th class="n">Ist</th><th class="n">Δ s</th></tr></thead><tbody>${d.plan.rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${mmss(r.goal)}</td><td class="n o">${mmss(r.t)}</td><td class="n ${r.diff > 0 ? "m" : "o"}">${sgs(r.diff)}</td></tr>`).join("")}</tbody></table><p class="dtot">${d.plan.hit} von ${d.plan.n} im Ziel. Rundenzeit gegen Zielzeit.</p>`
      : `<p class="dtot">keine Daten, Grund: ${esc(d.kind === "lauf" ? "im Plan steht kein Zieltempo («@ 4:00») oder es gibt keine Arbeitsrunden" : "Runden passen nicht zu den Plan-Schritten")}</p>`;
    h += `<details class="dmore"><summary>Plan gegen Ist</summary><div class="dd">${planBody}</div></details>`;
  }
  if (d.cmp && (d.kind === "lauf" || d.kind === "station" || d.kind === "steady")) {
      const body = d.cmp.rows.length
        ? `<table class="v3-t"><thead><tr><th>Wert</th><th class="n">Jetzt</th><th class="n">Vorher</th><th class="n">Δ</th></tr></thead><tbody>${d.cmp.rows.map((r) => `<tr><td>${esc(r.k)}</td><td class="n o">${esc(r.now)}</td><td class="n">${esc(r.was)}</td><td class="n ${r.tone === "yellow" ? "m" : "o"}">${esc(r.d)}</td></tr>`).join("")}</tbody></table>`
        : `<p class="dtot">${esc(d.cmp.note)}</p>`;
      h += `<details class="dmore"><summary>${esc(d.cmp.title)}</summary><div class="dd">${body}</div></details>`;
  }
  return h;
}

/** Analyse-Karte: Gut / Nicht gut / Nächstes Mal, jede Zeile mit der Zahl vorn. Leerer Block entfällt. */
export function anCardHtml(an, esc) {
  const blk = (title, rows, bad) => (rows.length ? `<div class="v3-blk"><span class="k">${title}</span><ul>${rows.map((r) => `<li class="${bad ? "bad" : ""}"><b>${esc(r.n)}</b><span>${esc(r.t)}</span></li>`).join("")}</ul></div>` : "");
  const next = an.next ? `<div class="v3-blk"><span class="k">Nächstes Mal</span><p>${esc(an.next)}</p></div>` : "";
  const inner = blk("Gut", an.good, false) + blk("Nicht gut", an.bad, true) + next;
  return inner;
}

/** Kopfzeile je Aktivität, wenn ein Tag mehrere hat: Sportart, Start, Dauer, Distanz, und ob sie zur geplanten Einheit gehört. */
export function actHeaderHtml({ i, n, label, start, time, dist, planned }, esc) {
  const meta = [start, time ? hms(time) : "", dist ? de(dist / 1000) + " km" : ""].filter(Boolean).join(" · ");
  return `<div class="v3-ah"><div><span class="k">Aktivität ${i} von ${n}</span><b>${esc(label)}</b>${meta ? `<span class="s">${esc(meta)}</span>` : ""}</div><span class="v3-tag${planned ? "" : " x"}">${planned ? "Geplant" : "Zusätzlich"}</span></div>`;
}
