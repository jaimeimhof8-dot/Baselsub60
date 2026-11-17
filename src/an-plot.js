// Diagramm-Stapel des Analyse-Tabs (Entwurf «Analyse-Tab Garmin-Stil»): gemeinsame Zeit- oder Distanzachse, ein Cursor, ein Zoom für alle Diagramme.
// Zeichnet jeden Messpunkt (sonst Min/Max je Pixelspalte), Cursor rastet auf Messpunkte, Zoom bis 10 s, Glättung nur für die Anzeige.
// Rechenkern: src/an-chart.js. Reihen: src/series.js (seriesOf). Nur diese Datei kennt das DOM der Diagramme; Klassen tragen das Präfix an3-.
import { mmss } from "./util.js";
import { seriesOf, paceFromV } from "./series.js";
import { smoothMA, decimateMinMax, niceTicks, rangeStats, snapIndex, clampView } from "./an-chart.js";

const ok = (v) => typeof v === "number" && isFinite(v);
const K = (...a) => a.filter(Boolean).join(" ").split(/\s+/).map((x) => "an3-" + x).join(" ");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const f1 = (v) => v.toFixed(1);
const r0 = (v) => String(Math.round(v));
const kmS = (m) => (m / 1000).toFixed(2).replace(".", ",");
export const ico = (d, w = 20) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const sg = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n);

/** Grössen der Diagramme. up: höher = weiter oben; steps: mögliche Achsenschritte; smooth: Glättung wirkt darauf. */
export const MET = {
  pace: { name: "Pace", color: "#64a8ff", unit: "/km", fmt: (v) => mmss(v), up: false, cap: 480, steps: [5, 10, 15, 30, 60, 120], smooth: true },
  hr: { name: "Herzfrequenz", color: "#ff6961", unit: "bpm", fmt: r0, up: true, steps: [5, 10, 20, 25] },
  el: { name: "Höhe", color: "#bf8cff", unit: "m", fmt: r0, up: true, steps: [1, 2, 5, 10, 20] },
  cad: { name: "Schrittfrequenz", color: "#5ad1b8", unit: "spm", fmt: r0, up: true, steps: [5, 10, 20, 25] },
  pw: { name: "Leistung", color: "#ffd60a", unit: "W", fmt: r0, up: true, steps: [10, 25, 50, 100], smooth: true },
  spd: { name: "Geschwindigkeit", color: "#64d2ff", unit: "km/h", fmt: (v) => v.toFixed(1).replace(".", ","), up: true, steps: [0.5, 1, 2, 5], smooth: true },
};
const NOT_YET = [["Schrittlänge", "#e0bf6a"], ["Bodenkontaktzeit", "#ff9f0a"]];
const SMOOTH = [[0, "Aus"], [5, "5 s"], [10, "10 s"], [30, "30 s"]];
let GSMOOTH = 10; // zuletzt gewählte Glättung gilt für alle Einheiten dieser Sitzung

/** Messreihen einer Aktivität in Anzeigeeinheiten, gleich lang wie S.t. null = keine Messung. */
function arrays(S) {
  const n = S.t.length;
  let last = 0;
  const dk = S.d.map((m) => { if (ok(m) && m >= last) last = m; return last / 1000; });
  return { t: S.t, dk, hasDist: last > 0, pace: S.v.map((v) => (ok(v) ? paceFromV(v) : null)), spd: S.v.map((v) => (ok(v) ? v * 0.036 : null)), hr: S.hr, el: S.el.map((v) => (ok(v) ? v / 10 : null)), cad: S.cad, pw: S.pw || Array(n).fill(null), stepped: S.src !== "series", res: resOf(S) };
}
const resOf = (S) => (S.res && S.res > 0 ? S.res : Math.max(1, (S.t[S.t.length - 1] - S.t[0]) / Math.max(1, S.t.length - 1)));

/**
 * Daten fürs Diagramm. Eingaben: act (Aktivität), pact (Partner oder null), ivs [{k, t0, t1, label?}] (Bänder, Zeit in Sekunden), sections [{t0, t1, label}] (Abschnittsnamen am Cursor),
 * keys/defaults/zoneBand aus dem Ansichts-Modell (src/an-session.js). -> null ohne Zeitreihe oder Runden.
 */
export function anChartData({ act, pact = null, ivs = [], sections = [], keys = null, defaults = null, zoneBand = null, names = { me: "Ich", pa: "Partner" } }) {
  const S = act ? seriesOf(act) : null;
  if (!S || !(S.t[S.t.length - 1] > 30)) return null;
  const me = arrays(S), pa = pact && seriesOf(pact) ? arrays(seriesOf(pact)) : null;
  const has = (k) => me[k] && me[k].some(ok);
  let ks = (keys || ["pace", "hr", "el", "cad"]).filter(has);
  if (pa) ks = ks.filter((k) => (k === "pace" || k === "hr") && pa[k].some(ok));
  if (!ks.length) return null;
  return { S, me, pa, res: resOf(S), T: S.t[S.t.length - 1], keys: ks, defaults: (defaults || ks).filter((k) => ks.includes(k)).slice(0, 3), zoneBand, bands: ivs, sections, names, cache: new Map() };
}

const STATES = new Map(), CTX = new Map();
const smoothed = (D, which, w) => {
  const src = which === "pa" ? D.pa : D.me, ck = which + w;
  if (D.cache.has(ck)) return D.cache.get(ck);
  const pts = src.stepped ? 1 : Math.max(1, Math.round(w / src.res)), o = { ...src };
  if (pts > 1) for (const k of ["pace", "spd", "pw"]) o[k] = smoothMA(src[k], pts);
  D.cache.set(ck, o);
  return o;
};

function view(key) {
  const D = CTX.get(key), st = STATES.get(key), A = smoothed(D, "me", st.smooth), P = D.pa ? smoothed(D, "pa", st.smooth) : null;
  const xs = st.mode === "t" ? A.t : A.dk, xp = P ? (st.mode === "t" ? P.t : P.dk) : null, max = xs[xs.length - 1];
  const tOf = (x) => (st.mode === "t" ? x : A.t[snapIndex(A.dk, x)]);
  const xOf = (t) => (st.mode === "t" ? t : A.dk[snapIndex(A.t, t)]);
  return { D, st, A, P, xs, xp, max, tOf, xOf, minSpan: st.mode === "t" ? 10 : 0.03 };
}
const rangeT = (V) => (V.st.sel ? [V.st.sel.t0, V.st.sel.t1] : V.st.a > 1e-9 || V.st.b < V.max - 1e-9 ? [V.tOf(V.st.a), V.tOf(V.st.b)] : [0, V.D.T]);
const rangeLabel = (V) => (V.st.sel ? V.st.sel.label : V.st.a > 1e-9 || V.st.b < V.max - 1e-9 ? "Ausschnitt " + mmss(V.tOf(V.st.a)) + " bis " + mmss(V.tOf(V.st.b)) : "Ganze Einheit");

function domain(V, key, both) {
  const m = MET[key], { xs, st } = V, i0 = Math.max(0, snapIndex(xs, st.a) - 1), i1 = Math.min(xs.length - 1, snapIndex(xs, st.b) + 1);
  let lo = Infinity, hi = -Infinity;
  const scan = (arr, xx) => { const j0 = Math.max(0, snapIndex(xx, st.a) - 1), j1 = Math.min(xx.length - 1, snapIndex(xx, st.b) + 1); for (let i = j0; i <= j1; i++) { let v = arr[i]; if (!ok(v)) continue; if (m.cap) v = Math.min(v, m.cap); if (v < lo) lo = v; if (v > hi) hi = v; } };
  scan(V.A[key], xs); if (both && V.P) scan(V.P[key], V.xp);
  void i0; void i1;
  if (lo > hi) return { lo: 0, hi: 1 };
  const minPad = { pace: 6, hr: 4, cad: 4, el: 2, pw: 10, spd: 1 }[key] || 2, pad = Math.max((hi - lo) * 0.1, minPad);
  return { lo: lo - pad, hi: hi + pad };
}
const yPct = (m, dm, v) => (m.up ? (dm.hi - v) / (dm.hi - dm.lo) : (v - dm.lo) / (dm.hi - dm.lo)) * 100;

function linePath(m, dm, xs, ys, a, b, W) {
  const pts = decimateMinMax(xs, ys, a, b, W), sp = b - a;
  let s = "", pen = false;
  for (const p of pts) {
    if (p.y == null) { pen = false; continue; }
    const v = m.cap ? Math.min(p.y, m.cap) : p.y;
    s += (pen ? "L" : "M") + f1(((p.x - a) / sp) * 1000) + " " + f1(clamp(yPct(m, dm, v), -2, 102)); pen = true;
  }
  return s;
}

function stackHtml(key) {
  const V = view(key), { D, st, A, P, xs } = V, cmp = !!P, a = st.a, b = st.b, span = b - a;
  const keys = cmp ? ["pace", "hr"].filter((k) => D.keys.includes(k)) : st.metrics;
  const W = Math.round(clamp((document.querySelector(`[data-an-stack="${key}"] .an3-plot`) || { clientWidth: 300 }).clientWidth, 200, 800));
  const tstep = [1, 2, 5, 10, 20, 30, 60, 120, 300, 600, 900], dstep = [0.05, 0.1, 0.25, 0.5, 1, 2, 5];
  const tick = (st.mode === "t" ? tstep : dstep).find((q) => span / q <= 5) || 900;
  let h = cmp ? `<div class="${K("leg")}"><span><i style="border-color:#64a8ff"></i>${D.names.me}</span><span><i class="${K("d")}" style="border-color:#f5f5f7"></i>${D.names.pa}</span></div>` : "";
  for (const k of keys) {
    const m = MET[k], dm = domain(V, k, cmp), tk = niceTicks(dm.lo, dm.hi, m.steps);
    const ylab = tk.map((v) => `<span style="top:${yPct(m, dm, v).toFixed(1)}%">${m.fmt(v)}</span>`).join("");
    const grid = tk.map((v) => `<i class="${K("g")}" style="top:${yPct(m, dm, v).toFixed(1)}%"></i>`).join("");
    const bh = D.bands.map((s) => { const l = ((V.xOf(s.t0) - a) / span) * 100, w = ((V.xOf(s.t1) - V.xOf(s.t0)) / span) * 100; if (l + w < 0 || l > 100) return ""; return `<div class="${K("band", st.sel && st.sel.t0 === s.t0 && "on")}" style="left:${l.toFixed(2)}%;width:${w.toFixed(2)}%"><span>${s.k || ""}</span></div>`; }).join("");
    let zb = "";
    if (k === "hr" && D.zoneBand) { const top = clamp(yPct(m, dm, D.zoneBand.hi), 0, 100), bot = clamp(yPct(m, dm, D.zoneBand.lo), 0, 100); if (bot > top) zb = `<div class="${K("zb")}" style="top:${top.toFixed(1)}%;height:${(bot - top).toFixed(1)}%"><span>${D.zoneBand.label}</span></div>`; }
    const line = linePath(m, dm, xs, A[k], a, b, W), pline = cmp ? linePath(m, dm, V.xp, P[k], a, b, W) : "";
    const sv = `<svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path d="${line}" fill="none" stroke="${m.color}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${cmp ? `<path d="${pline}" fill="none" stroke="#f5f5f7" stroke-width="2" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"/>` : ""}</svg>`;
    h += `<div class="${K("ch")}" data-k="${k}"><div class="${K("chh")}"><i style="background:${m.color}"></i><span class="${K("n")}">${m.name}</span><span class="${K("val")}" data-an-val="${k}"></span></div><div class="${K("chb")}"><div class="${K("yl")}">${ylab}</div><div class="${K("plot")}" data-an-plot>${grid}${zb}${bh}${sv}<div class="${K("brush")}" hidden></div><div class="${K("cur")}" hidden></div></div></div></div>`;
  }
  const xt = []; for (let x = Math.ceil(a / tick) * tick; x <= b + 1e-9; x += tick) { const pc = ((x - a) / span) * 100; xt.push(`<span style="left:${pc.toFixed(2)}%${pc > 93 ? ";transform:translateX(-100%)" : pc < 7 ? ";transform:none" : ""}">${st.mode === "t" ? mmss(x) : x.toFixed(x % 1 ? 2 : 0).replace(".", ",")}</span>`); }
  return h + `<div class="${K("xl")}">${xt.join("")}</div>`;
}

function ctlHtml(key) {
  const V = view(key), { D, st } = V, hasD = D.me.hasDist;
  const axis = `<div class="${K("seg")}" role="group" aria-label="Achse">${[["t", "Zeit"], ...(hasD ? [["d", "Distanz"]] : [])].map(([k, l]) => `<button type="button" aria-selected="${st.mode === k}" data-an-do="mode:${k}">${l}</button>`).join("")}</div>`;
  const cmp = !!D.pa, smoothable = D.keys.some((k) => MET[k].smooth) && !D.me.stepped;
  const pick = !cmp && D.keys.length > 1 ? `<button type="button" class="${K("chip")}" data-an-do="sheet">Diagramme · ${st.metrics.length}</button>` : "";
  const reset = cmp && (st.sel || st.a > 1e-9 || st.b < V.max - 1e-9) ? `<button type="button" class="${K("chip", "go")}" data-an-do="reset">Zoom zurücksetzen</button>` : "";
  const pop = smoothable ? `<div class="${K("pw")}"><button type="button" class="${K("iconbtn", "sq")}" data-an-do="smenu" aria-label="Glättung, aktuell ${st.smooth ? st.smooth + " s" : "aus"}" aria-haspopup="menu" aria-expanded="${!!st.smMenu}">${ico("M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6")}${st.smooth ? `<i class="${K("bd")}"></i>` : ""}</button>${st.smMenu ? `<div class="${K("popbg")}" data-an-do="smenux"></div><div class="${K("pop")}" role="menu" aria-label="Glättung"><div class="${K("pk")}">Glättung</div>${SMOOTH.map(([k, l]) => `<button type="button" role="menuitemradio" aria-checked="${st.smooth === k}" data-an-do="smooth:${k}"><span>${l}</span>${st.smooth === k ? ico("M5 12l5 5 9-10", 18) : ""}</button>`).join("")}</div>` : ""}</div>` : "";
  const sheet = st.sheet ? `<div class="${K("overlay")}" data-an-do="sheetx"><div class="${K("sheet")}" role="dialog" aria-label="Diagramme wählen"><h4>Diagramme</h4><p>Höchstens 6 gleichzeitig, mindestens 1.</p>${D.keys.map((k) => `<div class="${K("opt")}"><span class="${K("gr")}" aria-hidden="true">⋮⋮</span><label><input type="checkbox" data-an-metric="${k}"${st.metrics.includes(k) ? " checked" : ""}><i class="${K("dot")}" style="background:${MET[k].color}"></i><span>${MET[k].name}</span></label></div>`).join("")}${NOT_YET.map(([n, c]) => `<div class="${K("opt", "off")}"><span class="${K("gr")}" aria-hidden="true">⋮⋮</span><label><input type="checkbox" disabled><i class="${K("dot")}" style="background:${c}"></i><span>${n} <small>fehlt noch, Phase 2</small></span></label></div>`).join("")}<div class="${K("bar")}" style="margin:16px 0 0"><span class="${K("sp")}"></span><button type="button" class="${K("chip", "go")}" data-an-do="sheetclose">Fertig</button></div></div></div>` : "";
  return `${axis}<span class="${K("sp")}"></span>${pick}${reset}${pop}${sheet}`;
}

function resHint(V) {
  const { D } = V;
  const res = D.me.stepped ? "Nur Rundenwerte, keine Sekundendaten" : D.res <= 1.05 ? `Auflösung 1 s · ${D.S.t.length.toLocaleString("de-CH")} Messpunkte` : `Auflösung ${Math.round(D.res)} s (reduziert) · ${D.S.t.length.toLocaleString("de-CH")} Messpunkte`;
  return `<span class="${D.res > 1.05 || D.me.stepped ? K("warnt") : ""}">${res}</span>. Ziehen bewegt den Cursor, zwei Finger zoomen bis auf 10 Sekunden, Doppeltipp setzt zurück.`;
}

function rngHtml(key) {
  const V = view(key), { D, A } = V, [t0, t1] = rangeT(V), i0 = snapIndex(A.t, t0), i1 = Math.max(i0 + 1, snapIndex(A.t, t1)), dur = t1 - t0, dist = D.me.hasDist ? (D.S.d[i1] - D.S.d[i0]) : null;
  const hr = rangeStats(A, t0, t1, "hr"), pw = rangeStats(A, t0, t1, "pw");
  const c = [["Dauer", mmss(dur), "min"], ["Distanz", dist != null ? kmS(dist) : "–", dist != null ? "km" : ""]];
  if (D.keys.includes("pw") && !D.keys.includes("pace")) c.push(["Ø Leistung", pw ? r0(pw.avg) : "–", pw ? "W" : ""]); else c.push(["Ø Pace", dist != null && dist > 50 ? mmss(dur / (dist / 1000)) : "–", dist != null && dist > 50 ? "/km" : ""]);
  c.push(["Ø Puls", hr ? r0(hr.avg) : "–", hr ? "bpm" : ""]);
  const zoomed = V.st.sel || V.st.a > 1e-9 || V.st.b < V.max - 1e-9;
  return `<div class="${K("rng")}" data-an-rng="${key}" aria-live="polite"><div class="${K("kick")}"><span>${rangeLabel(V)}</span>${zoomed ? `<button type="button" data-an-do="reset" data-an-key="${key}">Zoom zurücksetzen</button>` : ""}</div><div class="${K("rc")}">${c.map((q) => `<div><small>${q[0]}</small><b>${q[1]}<em>${q[2]}</em></b></div>`).join("")}</div></div>`;
}

function valsHtml(key) {
  const V = view(key), { D, A } = V, [t0, t1] = rangeT(V), i0 = snapIndex(A.t, t0), i1 = Math.max(i0 + 1, snapIndex(A.t, t1));
  const rows = D.keys.map((k) => {
    const s = rangeStats(A, t0, t1, k); if (!s) return "";
    const m = MET[k], avg = k === "pace" && D.me.hasDist && D.S.d[i1] - D.S.d[i0] > 50 ? (t1 - t0) / ((D.S.d[i1] - D.S.d[i0]) / 1000) : s.avg;
    return `<div class="${K("tr", "vl")}"><span>${m.name} <small class="${K("mu")}">${m.unit}</small></span><span>${m.fmt(avg)}</span><span>${m.fmt(s.min)}</span><span>${m.fmt(k === "pace" ? Math.min(s.max, 600) : s.max)}</span></div>`;
  }).join("");
  return `<div class="${K("tr", "hd", "vl")}"><span>${rangeLabel(V)}</span><span>Ø</span><span>Min</span><span>Max</span></div>${rows}<p class="${K("note")}">Pace: Min ist der schnellste Wert. Pace, Leistung und Geschwindigkeit mit ${V.st.smooth ? "Glättung " + V.st.smooth + " s" : "Rohwerten"}, alle anderen Werte roh.</p>`;
}

/** HTML des Diagramm-Blocks (Steuerung, Cursor-Leiste, Stapel, Hinweis, Werte im Ausschnitt). Die Ausschnittsleiste folgt separat mit anRangeHtml(key). */
export function anChartHtml(key, D) {
  CTX.set(key, D);
  let st = STATES.get(key);
  if (!st || st.T !== D.T) { st = { T: D.T, mode: "t", metrics: D.defaults.slice(), a: 0, b: D.T, cur: null, sel: null, brush: null, sheet: false, smMenu: false, smooth: D.me.stepped ? 0 : GSMOOTH }; STATES.set(key, st); }
  if (D.pa) st.metrics = ["pace", "hr"].filter((k) => D.keys.includes(k));
  st.metrics = st.metrics.filter((k) => D.keys.includes(k)); if (!st.metrics.length) st.metrics = D.defaults.slice();
  const V = view(key);
  return `<div class="${K("chartwrap")}" data-an="${key}"><div class="${K("bar")}" data-an-ctl="${key}">${ctlHtml(key)}</div><div class="${K("strip", "idle")}" data-an-strip="${key}"></div><div class="${K("stack")}" data-an-stack="${key}" tabindex="0" role="group" aria-label="Diagramme. Pfeiltasten bewegen den Cursor, plus und minus zoomen">${stackHtml(key)}</div><p class="${K("hint")}" data-an-hint="${key}">${resHint(V)}</p><details class="${K("dtl")}"><summary><span>Werte im Ausschnitt</span>${ico("M6 9l6 6 6-6")}</summary><div data-an-vals="${key}">${valsHtml(key)}</div></details></div>`;
}
export const anRangeHtml = (key) => (CTX.has(key) ? rngHtml(key) : "");

/* ---------- Aktualisieren ---------- */
const $q = (sel) => document.querySelector(sel);
function paintAll(key) {
  if (!CTX.has(key)) return;
  const set = (sel, html) => { const e = $q(sel); if (e) e.innerHTML = html; };
  set(`[data-an-ctl="${key}"]`, ctlHtml(key));
  set(`[data-an-stack="${key}"]`, stackHtml(key));
  set(`[data-an-vals="${key}"]`, valsHtml(key));
  set(`[data-an-hint="${key}"]`, resHint(view(key)));
  const r = $q(`[data-an-rng="${key}"]`); if (r) r.outerHTML = rngHtml(key);
  markRows(key);
  paintCursor(key);
}
function markRows(key) {
  const st = STATES.get(key);
  document.querySelectorAll(`[data-an-sel^="${key}|"]`).forEach((r) => { const p = r.dataset.anSel.split("|"); r.classList.toggle("an3-on", !!st.sel && Math.abs(st.sel.t0 - +p[1]) < 1 && Math.abs(st.sel.t1 - +p[2]) < 1); });
}
function paintCursor(key) {
  const V = view(key), { st, A, xs, D } = V, stack = $q(`[data-an-stack="${key}"]`); if (!stack) return;
  const span = st.b - st.a, has = st.cur != null && st.cur >= st.a && st.cur <= st.b, i = has ? snapIndex(xs, st.cur) : null;
  stack.querySelectorAll(".an3-cur").forEach((c) => { c.hidden = !has; if (has) c.style.left = (((xs[i] - st.a) / span) * 100).toFixed(2) + "%"; });
  const [t0, t1] = rangeT(V), i0 = snapIndex(A.t, t0), i1 = Math.max(i0 + 1, snapIndex(A.t, t1));
  stack.querySelectorAll("[data-an-val]").forEach((el) => {
    const k = el.dataset.anVal, m = MET[k];
    let v = null;
    if (i != null) v = A[k][i];
    else if (k === "pace" && D.me.hasDist && D.S.d[i1] - D.S.d[i0] > 50) v = (t1 - t0) / ((D.S.d[i1] - D.S.d[i0]) / 1000);
    else { const s = rangeStats(A, t0, t1, k); v = s ? s.avg : null; }
    el.innerHTML = ok(v) ? m.fmt(v) + `<small>${m.unit}${i == null ? " Ø" : ""}</small>` : `<small>keine Messung</small>`;
  });
  const sp = $q(`[data-an-strip="${key}"]`);
  if (sp) {
    sp.className = K("strip", !has && "idle");
    if (has) { const t = A.t[i], q = D.sections.find((s) => t >= s.t0 && t < s.t1); sp.innerHTML = `<span>Zeit <b>${mmss(t)}</b></span>${D.me.hasDist ? `<span>Distanz <b>${kmS(D.S.d[i] || 0)} km</b></span>` : ""}${q ? `<span><b>${q.label}</b></span>` : ""}`; }
    else sp.innerHTML = `<span>Finger aufs Diagramm legen</span>`;
  }
}
const paintBrush = (key) => { const st = STATES.get(key), sp = st.b - st.a; document.querySelectorAll(`[data-an-stack="${key}"] .an3-brush`).forEach((b) => { b.hidden = !st.brush; if (st.brush) { b.style.left = (((st.brush[0] - st.a) / sp) * 100).toFixed(2) + "%"; b.style.width = (((st.brush[1] - st.brush[0]) / sp) * 100).toFixed(2) + "%"; } }); };

/** Nach dem Einsetzen einer Ansicht: alle Diagramme in der Seite mit der echten Breite zeichnen und Cursor-Leiste und Werte füllen. */
export function anPaintAll() { for (const key of CTX.keys()) if ($q(`[data-an-stack="${key}"]`)) paintAll(key); }

/** Auswahl eines Abschnitts von aussen (Tabellenzeile): Bereich markieren und darauf zoomen. */
export function anSelect(key, t0, t1, label) {
  if (!CTX.has(key)) return;
  const V = view(key), st = V.st;
  st.sel = { t0, t1, label };
  const pad = Math.max(V.st.mode === "t" ? 5 : 0.02, (V.xOf(t1) - V.xOf(t0)) * 0.03);
  [st.a, st.b] = clampView(V.xOf(t0) - pad, V.xOf(t1) + pad, V.max, V.minSpan);
  paintAll(key);
}

/* ---------- Bedienung ---------- */
let attached = false;
/** Einmal beim Start: Klicks (Menü, Zoom, Tabellenzeilen) und Zeiger (Cursor, Ziehen, Zwei-Finger-Zoom) im Diagramm-Stapel. */
export function attachAnChart(doc = document) {
  if (attached) return;
  attached = true;
  const keyOf = (el) => { const c = el && el.closest && el.closest("[data-an-stack]"); return c ? c.dataset.anStack : null; };
  const ptrs = new Map(); let pinch = null, down = null, lastTap = 0;
  const xAt = (key, cx) => { const st = STATES.get(key), p = $q(`[data-an-stack="${key}"] .an3-plot`); if (!p) return 0; const r = p.getBoundingClientRect(); return st.a + clamp((cx - r.left) / r.width, 0, 1) * (st.b - st.a); };

  doc.addEventListener("click", (e) => {
    const sel = e.target.closest && e.target.closest("[data-an-sel]");
    if (sel) { const p = sel.dataset.anSel.split("|"); anSelect(p[0], +p[1], +p[2], p[3]); return; }
    const b = e.target.closest && e.target.closest("[data-an-do]"); if (!b) return;
    const wrap = b.closest("[data-an]") || b.closest("[data-an-ctl]") || b.closest("[data-an-rng]"), key = (wrap && (wrap.dataset.an || wrap.dataset.anCtl || wrap.dataset.anRng)) || b.dataset.anKey; if (!key || !STATES.has(key)) return;
    const st = STATES.get(key), V = view(key), [act, arg] = b.dataset.anDo.split(":");
    if (act === "mode") { const ta = V.tOf(st.a), tb = V.tOf(st.b), zoomed = st.a > 1e-9 || st.b < V.max - 1e-9; st.mode = arg; st.cur = null; const V2 = view(key); if (st.sel) { st.sel = { ...st.sel }; [st.a, st.b] = clampView(V2.xOf(st.sel.t0), V2.xOf(st.sel.t1), V2.max, V2.minSpan); } else if (zoomed) [st.a, st.b] = clampView(V2.xOf(ta), V2.xOf(tb), V2.max, V2.minSpan); else { st.a = 0; st.b = V2.max; } }
    else if (act === "reset") { st.sel = null; st.a = 0; st.b = V.max; }
    else if (act === "sheet") st.sheet = true;
    else if (act === "sheetclose") st.sheet = false;
    else if (act === "sheetx") { if (e.target !== b) return; st.sheet = false; }
    else if (act === "smenu") st.smMenu = !st.smMenu;
    else if (act === "smenux") st.smMenu = false;
    else if (act === "smooth") { GSMOOTH = st.smooth = +arg; st.smMenu = false; }
    paintAll(key);
  });
  doc.addEventListener("change", (e) => {
    const c = e.target.closest && e.target.closest("[data-an-metric]"); if (!c) return;
    const key = c.closest("[data-an-ctl]").dataset.anCtl, st = STATES.get(key), D = CTX.get(key), k = c.dataset.anMetric;
    if (c.checked && st.metrics.length >= 6) { c.checked = false; return; }
    if (!c.checked && st.metrics.length <= 1) { c.checked = true; return; }
    st.metrics = D.keys.filter((q) => (q === k ? c.checked : st.metrics.includes(q)));
    const set = (sel, html) => { const x = $q(sel); if (x) x.innerHTML = html; };
    set(`[data-an-stack="${key}"]`, stackHtml(key)); const chip = $q(`[data-an-ctl="${key}"] [data-an-do="sheet"]`); if (chip) chip.textContent = "Diagramme · " + st.metrics.length; paintCursor(key);
  });
  doc.addEventListener("pointerdown", (e) => {
    const key = keyOf(e.target); if (!key) return; const st = STATES.get(key);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { e.target.closest("[data-an-stack]").setPointerCapture(e.pointerId); } catch (_) {}
    if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pinch = { key, d: Math.hypot(p.x - q.x, p.y - q.y), m: (p.x + q.x) / 2 }; down = null; st.brush = null; return; }
    down = { key, x: e.clientX, mouse: e.pointerType === "mouse", moved: false, x0: xAt(key, e.clientX) };
    st.cur = xAt(key, e.clientX); paintCursor(key);
  });
  doc.addEventListener("pointermove", (e) => {
    const key = keyOf(e.target); if (!key) return; const st = STATES.get(key);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pinch.key === key && ptrs.size >= 2) {
      const V = view(key), [p, q] = [...ptrs.values()], dist = Math.hypot(p.x - q.x, p.y - q.y), m = (p.x + q.x) / 2, pl = $q(`[data-an-stack="${key}"] .an3-plot`); if (!pl || !pinch.d) return;
      const r = pl.getBoundingClientRect(), k = pinch.d / Math.max(dist, 1), span = st.b - st.a, c = st.a + clamp((m - r.left) / r.width, 0, 1) * span, shift = ((pinch.m - m) / r.width) * span, a = c - (c - st.a) * k + shift;
      [st.a, st.b] = clampView(a, a + span * k, V.max, V.minSpan); pinch.d = dist; pinch.m = m; st.sel = null; paintAll(key); return;
    }
    const x = xAt(key, e.clientX);
    if (down && down.mouse && (e.buttons & 1)) { if (Math.abs(e.clientX - down.x) > 4) down.moved = true; if (down.moved) { st.brush = [Math.min(down.x0, x), Math.max(down.x0, x)]; paintBrush(key); } }
    if (down && !down.mouse && Math.abs(e.clientX - down.x) > 4) down.moved = true;
    st.cur = x; paintCursor(key);
  });
  const end = (e) => {
    const key = keyOf(e.target) || (down && down.key) || (pinch && pinch.key); ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (!key || !down) { if (!ptrs.size) down = null; return; }
    const st = STATES.get(key), V = view(key), x = xAt(key, e.clientX), now = Date.now();
    if (st.brush && st.brush[1] - st.brush[0] > (st.b - st.a) * 0.03) { st.sel = null;[st.a, st.b] = clampView(st.brush[0], st.brush[1], V.max, V.minSpan); st.brush = null; down = null; paintAll(key); return; }
    st.brush = null;
    if (!down.moved) {
      if (now - lastTap < 320) { lastTap = 0; down = null; st.sel = null; st.a = 0; st.b = V.max; paintAll(key); return; }
      lastTap = now;
      const t = V.tOf(x), band = V.D.bands.find((s) => t >= s.t0 && t < s.t1);
      if (band && !st.sel) { down = null; anSelect(key, band.t0, band.t1, band.label || "Abschnitt " + band.k); return; }
    }
    if (e.pointerType !== "mouse") st.cur = null;
    down = null; paintBrush(key); paintCursor(key);
  };
  doc.addEventListener("pointerup", end);
  doc.addEventListener("pointercancel", (e) => { ptrs.delete(e.pointerId); pinch = null; down = null; const k = keyOf(e.target); if (k) { STATES.get(k).brush = null; paintBrush(k); } });
  doc.addEventListener("wheel", (e) => {
    const key = keyOf(e.target); if (!key || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const st = STATES.get(key), V = view(key), x = xAt(key, e.clientX), k = e.deltaY > 0 ? 1.25 : 0.8;
    [st.a, st.b] = clampView(x - (x - st.a) * k, x + (st.b - x) * k, V.max, V.minSpan); st.sel = null; paintAll(key);
  }, { passive: false });
  doc.addEventListener("keydown", (e) => {
    const key = keyOf(e.target); if (!key) return;
    const st = STATES.get(key), V = view(key), sp = st.b - st.a, base = st.cur == null ? (st.a + st.b) / 2 : st.cur;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { st.cur = clamp(base + (e.key === "ArrowLeft" ? -1 : 1) * sp / 60, st.a, st.b); paintCursor(key); e.preventDefault(); }
    else if (e.key === "+" || e.key === "=" || e.key === "-") { const k = e.key === "-" ? 1.4 : 0.7; [st.a, st.b] = clampView(base - (base - st.a) * k, base + (st.b - base) * k, V.max, V.minSpan); st.sel = null; paintAll(key); e.preventDefault(); }
    else if (e.key === "Escape") { st.sel = null; st.a = 0; st.b = V.max; st.smMenu = false; st.sheet = false; paintAll(key); }
  });
  doc.addEventListener("pointerleave", (e) => { const key = keyOf(e.target); if (key && e.pointerType === "mouse" && !(e.buttons & 1)) { STATES.get(key).cur = null; paintCursor(key); } }, true);
}

/** Nur für Tests: Zustand eines Diagramms. */
export const _state = (key) => STATES.get(key);
export const _fmtSigned = sg;
