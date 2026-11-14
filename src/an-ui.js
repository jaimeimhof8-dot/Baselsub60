// Analyse-Bereich nach dem Entwurf (Artefakt «Analyse-Tab Entwurf»): Kopf, Ergebnis, Diagramm (Dropdowns, Zoom, Ausschnitt, Runden), Einschätzung, Details.
// Reine HTML-Bausteine ohne App-Zustand; nur attachAnChart() hängt Zeiger- und Klick-Ereignisse an. Fehlende Daten bleiben leer, nie erfundene Zahlen.
import { mmss } from "./util.js";
import { seriesOf, resample, smooth, paceFromV } from "./series.js";

const esc0 = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const r0 = (v) => String(Math.round(v));
const sg = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n);
const dur = (s) => { s = Math.max(0, Math.round(s)); return s >= 3600 ? Math.floor(s / 3600) + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0") : mmss(s); };
const km = (m) => (m / 1000).toFixed(2).replace(".", ",");
const CHEV = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;

const MET = {
  pace: { label: "Pace", color: "#64a8ff", inv: false, fmt: (v) => mmss(v), unit: "/km", min: 20 },
  hr: { label: "Herzfrequenz", color: "#ff6961", inv: true, fmt: r0, unit: "bpm", min: 15 },
  cad: { label: "Kadenz", color: "#5ad1b8", inv: true, fmt: r0, unit: "spm", min: 20 },
  el: { label: "Höhe", color: "#bf8cff", inv: true, fmt: r0, unit: "m", min: 8 },
};
const LAB = { pace: "Pace", hr: "Herzfrequenz", cad: "Kadenz", el: "Höhe", both: "Pace und Puls", delta: "Abweichung vom Ziel" };

/* ---------- Kopf, Ergebnis, Einschätzung, Planvorschlag, Details ---------- */
export const anHead = (kick, title) =>
  `<header class="an2-head"><div><div class="an2-kick">${kick}</div><h1>${title}</h1></div><button type="button" class="an2-burger" data-act="menu" aria-label="Menü öffnen" aria-controls="sheet"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button></header>`;

const split = (v) => { const m = /^(.*\S)\s+(bpm|min|h|s\/km|km)$/.exec(String(v)); return m ? [m[1], m[2]] : [String(v), ""]; };

/** Ergebnis: Art, Titel, die eine Aussage («3 von 6») und bis zu drei Kennzahlen. d = dashV3-Ergebnis. */
export function anResultHtml({ kind, color, meta, title, d }, esc = esc0) {
  let big = "", lab = "";
  const um = d.tiles.find((t) => t.k === "Umsetzung");
  if (d.plan) { big = `${d.plan.hit} von ${d.plan.n}`; lab = d.kind === "station" ? "Schritte im Ziel" : "Intervalle im Ziel"; }
  else if (um) { big = um.v.replace("/", " von "); lab = "Übungen abgehakt"; }
  const cols = d.tiles.filter((t) => !t.na && t.k !== "Umsetzung").slice(0, 3).map((t) => {
    const [v, u] = split(t.v);
    return `<div class="an2-col${t.tone === "yellow" ? " warn" : ""}"><div class="k">${esc(t.k.replace(/ Arbeit$/, "").replace("Ø Puls", "Puls Ø"))}</div><div class="v">${esc(v)}<small>${esc(u || (/Pace/.test(t.k) ? "/km" : /Puls/.test(t.k) ? "bpm" : ""))}</small></div></div>`;
  }).join("");
  return `<section class="an2-res" aria-label="Ergebnis"><div class="an2-meta"><i style="background:${color}"></i>${esc(kind)}${meta ? " · " + esc(meta) : ""}</div><h2>${esc(title)}</h2>${big ? `<div class="an2-big"><b>${esc(big)}</b><span>${lab}</span></div>` : ""}${cols ? `<div class="an2-cols">${cols}</div>` : ""}${d.openNote ? `<p class="an2-note">${esc(d.openNote)}</p>` : ""}</section>`;
}

/**
 * Block «Gegen Rennplan»: die Pace der Arbeitsläufe neben dem Tempo, mit dem die Prognose rechnet, und dem Tempo für 60:00.
 * res = racePlanRows() aus src/race-link.js. Nur Zahlen und Unterschiede, kein Urteil; Orange nur für langsamer / mehr.
 * total: Prognose gesamt in s · testsAt: Datum der Tests als Text (oder leer).
 */
export function anRaceHtml(res, { total = null, testsAt = "" } = {}, esc = esc0) {
  if (!res) return "";
  const sec = (body) => `<section class="an2-sec an2-race" aria-label="Gegen Rennplan"><h3>Gegen Rennplan</h3>${body}</section>`;
  if (res.state === "nokm") return sec(`<p class="an2-note">Kein Vergleich: Intervalle sind nicht rund 1 km lang. Im Rennen sind es 8 × 1 km.</p>`);
  if (res.state === "notests") return sec(`<p class="an2-note">Noch keine Testwerte. Nach dem Lauf-Pacing-Test und dem Stationen-Benchmark steht hier der Vergleich mit dem Renntempo.</p><button type="button" class="an2-btn" data-v="profile">Tests eintragen</button>`);
  const R = (id) => res.rows.find((r) => r.id === id);
  const diff = (r, up, down) => (r.d == null ? "" : `<div class="x${r.bad ? " bad" : ""}">${r.d === 0 ? "gleich" : Math.abs(r.d) + " s " + (r.d > 0 ? up : down)}</div>`);
  const col = (k, v, unit, x) => `<div class="an2-col"><div class="k">${k}</div><div class="v">${v}<small>${unit}</small></div>${x}</div>`;
  const pace = R("pace"), fc = R("fc"), need = R("need"), comp = R("comp"), cfc = R("compfc");
  let h = `<div class="an2-big"><b>${mmss(pace.v)}</b><span>/km Pace Arbeit</span></div>`;
  const a = [];
  if (fc) a.push(col("Prognose rechnet mit", mmss(fc.v), "/km", diff(fc, "langsamer", "schneller")));
  if (need) a.push(need.v == null ? `<div class="an2-col"><div class="k">Für 60:00 nötig</div><div class="v">–</div><div class="x">${esc(need.why || "")}</div></div>` : col("Für 60:00 nötig", mmss(need.v), "/km", diff(need, "langsamer", "schneller")));
  if (a.length) h += `<div class="an2-cols two">${a.join("")}</div>`;
  if (comp) h += `<div class="an2-cols two">${col("Kompromiss-Delta", sg(comp.v), "s/km", "")}${cfc ? col("Prognose rechnet mit", sg(cfc.v), "s/km", diff(cfc, "mehr", "weniger")) : ""}</div>`;
  const foot = [total ? "Prognose " + mmss(Math.round(total)) : "", testsAt ? "Tests vom " + esc(testsAt) : "", "ändert sich nur durch Tests und Simulationen"].filter(Boolean).join(" · ");
  return sec(h + `<p class="an2-note">${foot}</p>`);
}

/** Gut / Nicht gut / Nächstes Mal. Leere Blöcke entfallen. */
export function anCoachHtml(an, esc = esc0) {
  const blk = (t, rows, cls) => (rows.length ? `<div class="an2-blk ${cls}"><div class="h"><i></i><span>${t}</span></div>${rows.map((r) => `<p><b>${esc(r.n)}</b> ${esc(r.t)}</p>`).join("")}</div>` : "");
  const next = an.next ? `<div class="an2-blk next"><div class="h"><i></i><span>Nächstes Mal</span></div><p>${esc(an.next)}</p></div>` : "";
  const h = blk("Gut", an.good, "good") + blk("Nicht gut", an.bad, "bad") + next;
  return h ? `<section class="an2-sec" aria-label="Einschätzung"><h3>Einschätzung</h3>${h}</section>` : "";
}

/** Planvorschlag des Coaches. items: [{text, why}]. */
export function anProposalHtml(items, i, canAll, esc = esc0) {
  if (!items.length) return "";
  return `<section class="an2-sec an2-prop" aria-label="Vorschlag für den Plan"><span class="an2-kick">Vorschlag für den Plan</span>${items.map((x) => `<p class="t">${esc(x.text)}${x.why ? ` <small>${esc(x.why)}</small>` : ""}</p>`).join("")}<div class="btns"><button type="button" class="an2-btn gold" data-act="an-apply" data-i="${i}">Nur für mich</button>${canAll ? `<button type="button" class="an2-btn" data-act="an-apply-all" data-i="${i}">Für uns beide</button>` : ""}</div><button type="button" class="an2-link" data-act="an-dismiss" data-i="${i}">Verwerfen</button></section>`;
}

/** Aufklappbare Details: Intervalle (Plan gegen Ist), Pulszonen, Vergleich mit der letzten Einheit. */
export function anDetailsHtml({ d, ivs = [], zones = null, maxHr = null }, esc = esc0) {
  const row = (a, b, c, e) => `<div class="an2-lr"><b>${a}</b><span class="${c}">${b}</span>${e}</div>`;
  const det = (title, sub, body, open) => `<details class="an2-dt"${open ? " open" : ""}><summary><span><b>${esc(title)}</b><small>${esc(sub)}</small></span>${CHEV}</summary><div class="body">${body}</div></details>`;
  let h = "";
  if (d.plan) {
    const rows = d.plan.rows.map((r, k) => row(k + 1, `${sg(r.diff)} s`, r.diff <= 0 ? "ok" : "bad", `<span class="n ${r.diff <= 0 ? "" : "bad"}">${mmss(r.t)}</span><span class="h">${ivs[k] && ivs[k].hr ? ivs[k].hr : ""}</span>`)).join("");
    h += det(d.kind === "station" ? "Schritte" : "Intervalle", `Plan gegen Ist · ${d.plan.hit} von ${d.plan.n} im Ziel`, `<div class="an2-lr hd"><span>Nr.</span><span>Ziel</span><span class="n">Zeit</span><span class="h">Puls</span></div>${rows}`, true);
  }
  if (zones && maxHr) {
    const tot = zones.reduce((a, b) => a + b, 0) || 1, top = zones.indexOf(Math.max(...zones));
    const col = ["#9a9ba3", "#64a8ff", "#e0bf6a", "#ffb340", "#ff6961"];
    h += det("Pulszonen", `Meiste Zeit in Zone ${top + 1}`, `<p class="an2-note">Max-Puls ${maxHr} bpm</p>${[4, 3, 2, 1, 0].map((k) => `<div class="an2-z"><span>Z${k + 1}</span><div><i style="width:${Math.max(1, Math.round((zones[k] / tot) * 100))}%;background:${col[k]}"></i></div><span class="n">${mmss(zones[k])}</span></div>`).join("")}`, false);
  }
  if (d.cmp && d.cmp.rows.length) {
    h += det(d.cmp.title.replace(/^Vergleich mit /, "Gegenüber "), d.cmp.rows[0] ? `${d.cmp.rows[0].k}: ${d.cmp.rows[0].d}` : "", d.cmp.rows.map((r) => `<div class="an2-dr"><span>${esc(r.k)}</span><span class="m">${esc(r.was)}</span><b${r.tone ? ' class="bad"' : ""}>${esc(r.now)}</b></div>`).join(""), false);
  }
  return h ? `<section class="an2-sec an2-details" aria-label="Details">${h}</section>` : "";
}

/** Liste im Verlauf. rows: {w} (Wochenkopf) oder {x, dow, day, color, title, sub, today}. */
export function anListHtml(rows, esc = esc0) {
  const arrow = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;
  return rows.map((r) => (r.w ? `<h3 class="an2-wk">Woche ${r.w}</h3>` : `<button type="button" class="an2-row" data-act="an-pick" data-i="${r.x}" data-go="analysis"><span class="d"><small>${esc(r.dow)}</small><b>${r.day}</b></span><span class="t"><span><i style="background:${r.color}"></i>${esc(r.title)}</span><small>${r.today ? "Heute · " : ""}${esc(r.sub)}</small></span>${arrow}</button>`)).join("");
}

/* ---------- Diagramm ---------- */
/** Daten fürs Diagramm. ivs: [{k, t0, t1, pace, hr, diff}] (Intervalle, Zeit in Sekunden). pact: Partner (gestrichelt). -> null ohne Zeitreihe/Runden. */
export function anChartData(act, ivs = [], pact = null) {
  const S = seriesOf(act);
  if (!S) return null;
  const T = S.t[S.t.length - 1];
  if (!(T > 60)) return null;
  const N = Math.min(500, Math.max(150, Math.round(T / 5))), grid = Array.from({ length: N }, (_, i) => (T * i) / (N - 1));
  const stepped = S.src !== "series";
  const one = (A) => {
    const Q = seriesOf(A);
    if (!Q) return null;
    const g = (k) => resample(Q, "t", grid, k), st = Q.src !== "series";
    return { pace: smooth(g("v").map((v) => (v == null ? null : paceFromV(v))), st ? 1 : 5), hr: smooth(g("hr"), st ? 1 : 3), cad: g("cad"), el: g("el").map((v) => (v == null ? null : v / 10)), dist: g("d") };
  };
  const me = one(act), pa = pact ? one(pact) : null;
  let keys = ["pace", "hr", "cad", "el"].filter((k) => me[k].some((v) => v != null));
  if (pa) keys = keys.filter((k) => (k === "pace" || k === "hr") && pa[k].some((v) => v != null));
  else {
    if (keys.includes("pace") && keys.includes("hr")) keys.splice(2, 0, "both");
    if (ivs.some((v) => v.diff != null)) keys.push("delta");
  }
  return keys.length ? { T, N, grid, me, pa, ivs, stepped, keys } : null;
}

const STATES = new Map(), CTX = new Map();

export function anChartHtml(key, D, names = { me: "Ich", pa: "Partner" }) {
  CTX.set(key, { ...D, names });
  let st = STATES.get(key);
  if (!st || st.T !== D.T) { st = { T: D.T, metric: D.keys[0], a: 0, b: D.T, sel: null, hover: null, drag: null, menu: null }; STATES.set(key, st); }
  if (!D.keys.includes(st.metric)) st.metric = D.keys[0];
  return `<div class="an2-chart" data-anc="${key}">${inner(key)}</div>`;
}

function model(D, st) {
  const { T, N, me, pa, ivs } = D, a = st.a, b = st.b, span = b - a, dt = T / (N - 1);
  const m = st.metric, cmp = !!pa;
  const main = m === "both" ? "pace" : m === "delta" ? null : m, sec = m === "both" ? "hr" : null;
  const ix = (t) => Math.max(0, Math.min(N - 1, Math.round(t / dt)));
  const pct = (t) => ((t - a) / span) * 100;
  const i0 = Math.max(0, Math.floor(a / dt) - 1), i1 = Math.min(N - 1, Math.ceil(b / dt) + 1);
  const dom = (k, both) => {
    let lo = 1e9, hi = -1e9;
    for (let i = i0; i <= i1; i++) for (const A of both && pa ? [me, pa] : [me]) { const v = A[k][i]; if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    if (lo > hi) return { lo: 0, hi: 1 };
    const r = Math.max(hi - lo, MET[k].min), c = (hi + lo) / 2;
    return { lo: c - r * 0.62, hi: c + r * 0.62 };
  };
  const f1 = (v) => v.toFixed(1);
  const path = (arr, d, inv) => {
    const step = Math.max(1, Math.floor((i1 - i0) / 150)), segs = [];
    let cur = [];
    for (let i = i0; i <= i1; i += step) {
      const v = arr[i];
      if (v == null) { if (cur.length) segs.push(cur); cur = []; continue; }
      cur.push([((i * dt - a) / span) * 1000, (inv ? (d.hi - v) / (d.hi - d.lo) : (v - d.lo) / (d.hi - d.lo)) * 1000]);
    }
    if (cur.length) segs.push(cur);
    let line = "", area = "";
    for (const p of segs) {
      if (p.length < 2) continue;
      let s = "M" + f1(p[0][0]) + " " + f1(p[0][1]);
      for (let j = 0; j < p.length - 1; j++) {
        if (D.stepped) { s += " L" + f1(p[j + 1][0]) + " " + f1(p[j + 1][1]); continue; }
        const p0 = p[j - 1] || p[j], p1 = p[j], p2 = p[j + 1], p3 = p[j + 2] || p2;
        s += " C" + f1(p1[0] + (p2[0] - p0[0]) / 6) + " " + f1(p1[1] + (p2[1] - p0[1]) / 6) + " " + f1(p2[0] - (p3[0] - p1[0]) / 6) + " " + f1(p2[1] - (p3[1] - p1[1]) / 6) + " " + f1(p2[0]) + " " + f1(p2[1]);
      }
      line += s + " "; area += s + " L" + f1(p[p.length - 1][0]) + " 1000 L" + f1(p[0][0]) + " 1000 Z ";
    }
    return { line, area };
  };
  let areaMain = "", lineMain = "", lineSec = "", linePart = "", dm = null, ds = null;
  if (main) {
    dm = dom(main, cmp);
    const pm = path(me[main], dm, MET[main].inv);
    lineMain = pm.line; areaMain = sec || cmp ? "" : pm.area;
    if (cmp) linePart = path(pa[main], dm, MET[main].inv).line;
  }
  if (sec) { ds = dom(sec, false); lineSec = path(me[sec], ds, MET[sec].inv).line; }
  const yt = [0, 1 / 3, 2 / 3, 1].map((fr) => {
    let l = "", r = "";
    if (m === "delta") l = sg(Math.round(-10 + 20 * fr)) + " s";
    else {
      l = MET[main].fmt(MET[main].inv ? dm.hi - (dm.hi - dm.lo) * fr : dm.lo + (dm.hi - dm.lo) * fr);
      if (sec) r = MET[sec].fmt(MET[sec].inv ? ds.hi - (ds.hi - ds.lo) * fr : ds.lo + (ds.hi - ds.lo) * fr);
    }
    return { top: (fr * 100).toFixed(1), l, r };
  });
  const step = [10, 15, 30, 60, 120, 300, 600, 1200].find((s) => span / s <= 6) || 1200, xt = [];
  for (let s = Math.ceil(a / step) * step; s <= b + 0.1; s += step) xt.push({ left: pct(s).toFixed(2), l: span > 900 ? Math.round(s / 60) + " min" : mmss(s) });
  const vis = ivs.filter((v) => v.t1 > a && v.t0 < b);
  const isSel = (v) => st.sel && Math.abs(st.sel[0] - v.t0) < 1 && Math.abs(st.sel[1] - v.t1) < 1;
  const bands = m === "delta" ? [] : vis.map((v) => ({ left: pct(v.t0).toFixed(2), w: (((v.t1 - v.t0) / span) * 100).toFixed(2), on: isSel(v), n: v.k }));
  const bars = m === "delta" ? vis.filter((v) => v.diff != null).map((v) => { const h = Math.min(50, (Math.abs(v.diff) / 10) * 50), good = v.diff <= 0; return { left: pct(v.t0).toFixed(2), w: (((v.t1 - v.t0) / span) * 100).toFixed(2), top: good ? (50 - h).toFixed(1) : "50", h: h.toFixed(1), good, v: sg(v.diff) + " s" }; }) : [];
  const sel = st.sel ? { left: Math.max(0, pct(st.sel[0])).toFixed(2), w: (Math.min(100, pct(st.sel[1])) - Math.max(0, pct(st.sel[0]))).toFixed(2), show: pct(st.sel[1]) > 0 && pct(st.sel[0]) < 100 } : { left: "0", w: "0", show: false };
  const hovOn = st.hover != null && st.hover >= a && st.hover <= b;
  let readout = "Ziehen wählt einen Bereich, Tippen ein Intervall.";
  if (st.hover != null) {
    const i = ix(st.hover), iv = ivs.find((v) => st.hover >= v.t0 && st.hover < v.t1), tag = iv ? ` · Intervall ${iv.k}` : "";
    const val = (A, k) => (A[k][i] == null ? "–" : MET[k].fmt(A[k][i]));
    if (cmp) readout = `${mmss(st.hover)} · ${D.names.me} ${val(me, main)} · ${D.names.pa} ${val(pa, main)} ${MET[main].unit}`;
    else if (!main) readout = `${mmss(st.hover)} · ${val(me, "pace")} /km${tag}`;
    else readout = `${mmss(st.hover)} · ${val(me, main)} ${MET[main].unit}${sec ? ` · ${val(me, sec)} ${MET[sec].unit}` : ""}${tag}`;
  }
  // Kennzahlen des Bereichs
  const r = st.sel || [0, T], j0 = ix(r[0]), j1 = Math.max(j0 + 1, ix(r[1])), time = r[1] - r[0];
  const mean = (arr) => { let s = 0, c = 0; for (let i = j0; i <= j1; i++) if (arr[i] != null) { s += arr[i]; c++; } return c ? s / c : null; };
  const mx = (arr) => { let q = null; for (let i = j0; i <= j1; i++) if (arr[i] != null) q = q == null ? arr[i] : Math.max(q, arr[i]); return q; };
  const dd = me.dist[j1] != null && me.dist[j0] != null ? me.dist[j1] - me.dist[j0] : null;
  const cell = (k, v, s) => ({ k, v: v == null ? "–" : v, s: v == null ? "" : s });
  let cells;
  if (cmp) {
    const A = mean(me[main]), B = mean(pa[main]), df = A != null && B != null ? Math.round(A - B) : null;
    cells = [cell(D.names.me, A == null ? null : MET[main].fmt(A), MET[main].unit), cell(D.names.pa, B == null ? null : MET[main].fmt(B), MET[main].unit), cell("Differenz", df == null ? null : sg(df), main === "pace" ? "s/km" : "bpm")];
  } else if (main && main !== "pace" && main !== "hr") {
    const A = mean(me[main]), X = mx(me[main]);
    cells = [cell("Dauer", dur(time), "min"), cell("Distanz", dd == null ? null : km(dd), "km"), cell("Ø " + MET[main].label, A == null ? null : MET[main].fmt(A), MET[main].unit), cell("Max", X == null ? null : MET[main].fmt(X), MET[main].unit)];
  } else {
    const h = mean(me.hr), X = mx(me.hr);
    cells = [cell("Dauer", dur(time), "min"), cell("Distanz", dd == null ? null : km(dd), "km"), cell("Ø Pace", dd != null && dd >= 50 ? mmss(time / (dd / 1000)) : null, "/km"), cell("Ø Puls", h == null ? null : r0(h), X == null ? "" : "max " + r0(X))];
  }
  const selIv = ivs.find(isSel);
  return {
    mColor: main ? MET[main].color : "#c9cad1", leftColor: main === "pace" ? "#8dbcff" : main ? MET[main].color : "#c9cad1",
    areaMain, lineMain, lineSec, linePart, yt, xt, bands, bars, sel, hov: { left: hovOn ? pct(st.hover).toFixed(2) : "0", show: hovOn }, readout, cells,
    rangeLabel: st.sel ? (selIv ? "Intervall " + selIv.k : "Auswahl " + mmss(r[0]) + " bis " + mmss(r[1])) : "Ganze Einheit", lapLabel: selIv ? "Intervall " + selIv.k : st.sel ? "Auswahl" : "Ganze Einheit",
    metricLabel: LAB[m], legend: cmp, zoomed: span < T - 1,
  };
}

const dropdown = (id, cap, label, color, opts, open) =>
  `<div class="an2-dd"><button type="button" data-anc-do="menu:${id}" aria-haspopup="listbox" aria-expanded="${open}"><span><small>${cap}</small><b${color ? ` style="color:${color}"` : ""}>${label}</b></span>${CHEV}</button><div class="an2-list ${id}" role="listbox" aria-label="${cap} wählen"${open ? "" : " hidden"}>${opts}</div></div>`;

function inner(key) {
  const D = CTX.get(key), st = STATES.get(key), M = model(D, st);
  const mOpts = D.keys.map((k) => `<button type="button" role="option" aria-selected="${st.metric === k}" data-anc-do="metric:${k}"><i style="background:${k === "both" ? "#ff6961" : k === "delta" ? "#c9cad1" : MET[k].color}"></i><span>${LAB[k]}</span>${st.metric === k ? "<em>✓</em>" : ""}</button>`).join("");
  const lOpts = `<button type="button" role="option" aria-selected="${!st.sel}" data-anc-do="lap:all"><span>Ganze Einheit</span></button>` + D.ivs.map((v) => `<button type="button" role="option" aria-selected="${!!(st.sel && Math.abs(st.sel[0] - v.t0) < 1)}" data-anc-do="lap:${v.k}"><span>Intervall ${v.k}</span><small>${v.pace ? mmss(v.pace) + " /km" : ""}</small></button>`).join("");
  const ctl = `<div class="an2-ctl">${dropdown("metric", "Diagramm", M.metricLabel, M.mColor, mOpts, st.menu === "metric")}${D.ivs.length ? dropdown("lap", "Bereich", M.lapLabel, "", lOpts, st.menu === "lap") : ""}<div class="an2-zoom" role="group" aria-label="Zoom"><button type="button" data-anc-do="zoom:out" aria-label="Herauszoomen">−</button><button type="button" data-anc-do="zoom:in" aria-label="Hineinzoomen">+</button><button type="button" data-anc-do="pan:-1" aria-label="Nach links"${M.zoomed ? "" : " disabled"}>‹</button><button type="button" data-anc-do="pan:1" aria-label="Nach rechts"${M.zoomed ? "" : " disabled"}>›</button><button type="button" data-anc-do="zoom:reset" class="w">Alles</button></div></div>`;
  const plot = `<div class="an2-plotbox"><div class="an2-yl l" style="color:${M.leftColor}">${M.yt.map((y) => `<span style="top:${y.top}%">${y.l}</span>`).join("")}</div><div class="an2-yl r">${M.yt.map((y) => `<span style="top:${y.top}%">${y.r}</span>`).join("")}</div>
    <div class="an2-plot" data-anc-plot tabindex="0" role="group" aria-label="Diagramm der Einheit. Ziehen wählt einen Bereich, Tippen ein Intervall">${M.yt.map((y) => `<i class="g" style="top:${y.top}%"></i>`).join("")}${M.bands.map((b) => `<div class="band${b.on ? " on" : ""}" style="left:${b.left}%;width:${b.w}%"><span>${b.n}</span></div>`).join("")}${M.bars.map((b) => `<div class="bar" style="left:${b.left}%;width:${b.w}%;top:${b.top}%;height:${b.h}%"><i class="${b.good ? "ok" : "bad"}"></i><span class="${b.good ? "ok" : "bad"}" style="${b.good ? "top:-18px" : "bottom:-18px"}">${b.v}</span></div>`).join("")}
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true" style="color:${M.mColor}"><defs><linearGradient id="anG${key.replace(/\W/g, "")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".34"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path d="${M.areaMain}" fill="url(#anG${key.replace(/\W/g, "")})"/><path d="${M.lineMain}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><path d="${M.lineSec}" fill="none" stroke="#ff6961" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><path d="${M.linePart}" fill="none" stroke="#f5f5f7" stroke-width="2.25" stroke-dasharray="7 6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>
    <div class="sel"${M.sel.show ? "" : " hidden"} style="left:${M.sel.left}%;width:${M.sel.w}%"></div><div class="cross"${M.hov.show ? "" : " hidden"} style="left:${M.hov.left}%"></div></div>
    <div class="an2-xl">${M.xt.map((x) => `<span style="left:${x.left}%">${x.l}</span>`).join("")}</div></div>`;
  const leg = M.legend ? `<div class="an2-leg"><span><i style="background:${M.mColor}"></i>${D.names.me}</span><span><i class="d"></i>${D.names.pa}</span></div>` : "";
  const sels = st.sel ? `<div class="btns"><button type="button" class="an2-btn gold" data-anc-do="zoom:sel">Hineinzoomen</button><button type="button" class="an2-btn" data-anc-do="clear">Aufheben</button></div>` : "";
  return `${ctl}<div class="an2-read" aria-live="polite">${M.readout}</div>${plot}${leg}<div class="an2-rng"><span class="an2-kick">${M.rangeLabel}</span><div class="an2-cells c${M.cells.length}">${M.cells.map((c) => `<div><small>${c.k}</small><b>${c.v}</b><small>${c.s}</small></div>`).join("")}</div>${sels}</div>`;
}

/* ---------- Bedienung ---------- */
const root = (key) => document.querySelector(`[data-anc="${key}"]`);
const paint = (key) => { const r = root(key); if (r && CTX.has(key)) r.innerHTML = inner(key); };
function overlay(key) {
  const r = root(key), D = CTX.get(key), st = STATES.get(key);
  if (!r || !D) return;
  const M = model(D, st), s = r.querySelector(".sel"), c = r.querySelector(".cross"), rd = r.querySelector(".an2-read");
  if (s) { s.hidden = !M.sel.show; s.style.left = M.sel.left + "%"; s.style.width = M.sel.w + "%"; }
  if (c) { c.hidden = !M.hov.show; c.style.left = M.hov.left + "%"; }
  if (rd) rd.textContent = M.readout;
}
const clampV = (st, x, y) => { const T = st.T; let w = y - x; if (w < 60) { const c = (x + y) / 2; x = c - 30; y = c + 30; w = 60; } if (w >= T) { st.a = 0; st.b = T; return; } if (x < 0) { y -= x; x = 0; } if (y > T) { x -= y - T; y = T; } st.a = Math.max(0, x); st.b = y; };

let attached = false;
/** Einmal beim Start: Klicks (Dropdowns, Zoom, Runden) und Ziehen im Diagramm. */
export function attachAnChart(doc = document) {
  if (attached) return;
  attached = true;
  const keyOf = (el) => { const c = el && el.closest && el.closest("[data-anc]"); return c ? c.dataset.anc : null; };
  const tOf = (e, el, st) => { const rc = el.getBoundingClientRect(); return st.a + Math.min(1, Math.max(0, (e.clientX - rc.left) / rc.width)) * (st.b - st.a); };
  doc.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest("[data-anc-do]"), key = keyOf(btn);
    for (const [k, s] of STATES) if (s.menu && (!btn || k !== key || !/^menu:/.test(btn.dataset.ancDo)) && !(e.target.closest && e.target.closest(".an2-list"))) { s.menu = null; paint(k); }
    if (!btn || !key) return;
    const st = STATES.get(key), D = CTX.get(key), [act, arg] = btn.dataset.ancDo.split(":"), mid = () => (st.sel ? (st.sel[0] + st.sel[1]) / 2 : (st.a + st.b) / 2), sp = st.b - st.a;
    if (act === "menu") st.menu = st.menu === arg ? null : arg;
    else if (act === "metric") { st.metric = arg; st.menu = null; }
    else if (act === "lap") { st.menu = null; const v = D.ivs.find((q) => String(q.k) === arg); st.sel = v ? [v.t0, v.t1] : null; if (v && (v.t0 < st.a || v.t1 > st.b)) { st.a = 0; st.b = st.T; } }
    else if (act === "zoom") { if (arg === "in") clampV(st, mid() - sp / 4, mid() + sp / 4); else if (arg === "out") clampV(st, mid() - sp, mid() + sp); else if (arg === "reset") { st.a = 0; st.b = st.T; st.sel = null; } else if (arg === "sel" && st.sel) { clampV(st, st.sel[0] - 10, st.sel[1] + 10); st.sel = null; } }
    else if (act === "pan") clampV(st, st.a + (+arg * sp) / 2, st.b + (+arg * sp) / 2);
    else if (act === "clear") st.sel = null;
    paint(key);
  });
  doc.addEventListener("pointerdown", (e) => {
    const el = e.target.closest && e.target.closest("[data-anc-plot]"), key = keyOf(el);
    if (!el || !key) return;
    const st = STATES.get(key), t = tOf(e, el, st);
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    st.drag = { t, x0: e.clientX }; st.sel = null; st.hover = t; st.menu = null; overlay(key);
  });
  doc.addEventListener("pointermove", (e) => {
    const el = e.target.closest && e.target.closest("[data-anc-plot]"), key = keyOf(el);
    if (!el || !key) return;
    const st = STATES.get(key), t = tOf(e, el, st);
    st.hover = t;
    if (st.drag && Math.abs(e.clientX - st.drag.x0) > 5) st.sel = [Math.min(st.drag.t, t), Math.max(st.drag.t, t)];
    overlay(key);
  });
  const up = (e) => {
    const el = e.target.closest && e.target.closest("[data-anc-plot]"), key = keyOf(el);
    if (!el || !key) return;
    const st = STATES.get(key), D = CTX.get(key);
    if (!st.drag) return;
    const t = tOf(e, el, st);
    if (Math.abs(e.clientX - st.drag.x0) <= 5) { const v = D.ivs.find((q) => t >= q.t0 && t < q.t1); st.sel = v ? [v.t0, v.t1] : null; }
    else if (!st.sel || st.sel[1] - st.sel[0] < 20) st.sel = null;
    st.drag = null; paint(key);
  };
  doc.addEventListener("pointerup", up);
  doc.addEventListener("pointercancel", up);
  doc.addEventListener("pointerleave", (e) => { const el = e.target.closest && e.target.closest("[data-anc-plot]"), key = keyOf(el); if (el && key && !STATES.get(key).drag) { STATES.get(key).hover = null; overlay(key); } }, true);
}

/** Trend im Verlauf: Pace der letzten Intervall-Läufe. pts: [{label, pc}] (s/km, ältestes zuerst). */
export function anTrendHtml(pts) {
  if (pts.length < 2) return "";
  const last = pts[pts.length - 1], prev = pts[pts.length - 2], d = Math.round(last.pc - prev.pc);
  const lo = Math.min(...pts.map((p) => p.pc)) - 4, hi = Math.max(...pts.map((p) => p.pc)) + 4;
  const xy = pts.map((p, i) => [18 + (i * 274) / (pts.length - 1), 12 + ((p.pc - lo) / (hi - lo)) * 72]);
  let s = `M${xy[0][0].toFixed(1)} ${xy[0][1].toFixed(1)}`;
  for (let j = 0; j < xy.length - 1; j++) { const p0 = xy[j - 1] || xy[j], p1 = xy[j], p2 = xy[j + 1], p3 = xy[j + 2] || p2; s += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`; }
  const dots = xy.map((p, i) => (i === xy.length - 1 ? `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="6" fill="#64a8ff"/>` : `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.5" fill="#0e1016" stroke="#64a8ff" stroke-width="2"/>`)).join("");
  return `<section class="an2-trend" aria-label="Trend"><span class="an2-kick">Pace in Intervall-Läufen</span><div class="big"><b>${mmss(last.pc)}</b><small>/km</small></div><p>${d === 0 ? "Gleich schnell wie" : Math.abs(d) + " s " + (d < 0 ? "schneller" : "langsamer") + " als"} bei der Einheit davor.</p><svg viewBox="0 0 310 96" width="100%" role="img" aria-label="Verlauf der Pace in den letzten ${pts.length} Einheiten" style="display:block"><path d="${s}" fill="none" stroke="#64a8ff" stroke-width="2.5" stroke-linecap="round"/>${dots}</svg></section>`;
}

/** Vergleich mit dem Partner. rows: [{k, me, pa}], pairs: [{k, me, pa, d}], chart: HTML des Diagramms. */
export function anCmpBody({ names, kind, color, day, title, rows, pairs, chart }, esc = esc0) {
  const t = rows.map((r) => `<div class="an2-cr"><span>${esc(r.k)}</span><b>${esc(r.me)}</b><b class="p">${esc(r.pa)}</b></div>`).join("");
  const iv = pairs.map((r) => `<div class="an2-ir"><b>${r.k}</b><span>${esc(r.me)}</span><span class="p">${esc(r.pa)}</span><em>${esc(r.d)}</em></div>`).join("");
  return `<section class="an2-res"><div class="an2-meta"><i style="background:${color}"></i>${esc(kind)} · ${esc(day)}</div><h2>${esc(title)}</h2><p class="an2-note">${esc(names.me)} und ${esc(names.pa)}, gleiche Einheit. Nur Zahlen, keine Wertung.</p><div class="an2-ct"><div class="an2-cr hd"><span></span><b>${esc(names.me)}</b><b>${esc(names.pa)}</b></div>${t}</div></section>
  ${chart ? `<section class="an2-sec" aria-label="Zeitverlauf"><h3>Zeitverlauf</h3>${chart}</section>` : ""}
  ${pairs.length ? `<section class="an2-sec" aria-label="Intervalle"><h3>Intervalle</h3><div class="an2-ir hd"><span>Nr.</span><span>${esc(names.me)}</span><span>${esc(names.pa)}</span><em>Diff.</em></div>${iv}</section>` : ""}`;
}
