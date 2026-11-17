// Analyse-Bereich nach dem Entwurf «Analyse-Tab Garmin-Stil» (docs/analyse-tab-anforderungen.md): Kopf, Wähler, Ergebnis, Tabellen, Coach, Verlauf, Vergleich.
// Reine HTML-Bausteine ohne App-Zustand. Das Diagramm steckt in src/an-plot.js. Fehlende Daten bleiben leer, nie erfundene Zahlen. Klassen tragen das Präfix an3-.
import { mmss } from "./util.js";
import { ico } from "./an-plot.js";
export { anChartData, anChartHtml, anRangeHtml, anSelect, anPaintAll, attachAnChart } from "./an-plot.js";

const esc0 = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const K = (...a) => a.filter(Boolean).join(" ").split(/\s+/).map((x) => "an3-" + x).join(" ");
const f1 = (v) => v.toFixed(1);
const sg = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n);

/** Kopfzeile: Kicker, Titel = aktive Ansicht, Menü-Knopf (die drei Ansichten stehen im Menü unter «Analyse»). */
export const anHead = (kick, title) =>
  `<header class="${K("head")}"><div><div class="${K("kick")}">${kick}</div><h1>${title}</h1></div><button type="button" class="${K("iconbtn")}" data-act="menu" aria-label="Menü öffnen" aria-controls="sheet" aria-haspopup="dialog">${ico("M4 7h16M4 12h16M4 17h16", 22)}</button></header>`;

/** Einheiten-Wähler: Pfeile in ihren Knöpfen zentriert, Mitte Datum und Zeile darunter. prev/next = Tagesindex oder null (dann gesperrt). */
export const anPicker = ({ date, sub, prev = null, next = null, go = "" }) =>
  `<div class="${K("picker")}"><button type="button" class="${K("iconbtn", "sq")}" data-act="an-pick" data-i="${prev == null ? "" : prev}"${go ? ` data-go="${go}"` : ""} aria-label="Ältere Einheit"${prev == null ? " disabled" : ""}>${ico("M15 5l-7 7 7 7")}</button><div class="${K("ttl")}"><b>${date}</b><small>${sub}</small></div><button type="button" class="${K("iconbtn", "sq")}" data-act="an-pick" data-i="${next == null ? "" : next}"${go ? ` data-go="${go}"` : ""} aria-label="Neuere Einheit"${next == null ? " disabled" : ""}>${ico("M9 5l7 7-7 7")}</button></div>`;

const fmtSub = (n) => n;

/**
 * Ergebnis: Art und Datum, Titel, die eine Aussage, bis zu 3 Leistungszahlen, bis zu 3 Garmin-Zahlen, Datenlage. model aus src/an-session.js.
 */
export function anResultHtml(model, { meta, title, color }, esc = esc0) {
  const h = model.headline, tone = (t) => (t === "bad" ? "bad" : t === "ok" ? "ok" : t === "warn" ? "warn" : "mu");
  const big = h.big && h.big !== "–" ? `<div class="${K("big")}"><b>${esc(h.big)}</b><span>${esc(h.label)}</span>${h.status ? `<span class="${K("pill", tone(h.status.tone))}">${esc(h.status.text)}</span>` : ""}</div>` : "";
  const col = (n) => `<div class="${K(n.tone === "warn" && "warn")}"><div class="${K("k")}">${esc(n.k)}</div><div class="${K("v")}"${n.na ? ` title="${esc(n.why || "")}"` : ""}>${esc(n.v)}${n.unit ? `<small>${esc(n.unit)}</small>` : ""}</div></div>`;
  const lead = h.big === "–" && h.label ? `<p class="${K("note")}" style="margin:0 0 16px">${esc(h.label)}</p>` : "";
  const nums = model.numbers.length ? `<div class="${K("cols")}">${model.numbers.map(col).join("")}</div>` : "";
  const whys = model.numbers.filter((n) => n.na && n.why).map((n) => `${n.k}: ${n.why}`);
  const gar = model.garmin.length ? `<div class="${K("gh")}">Laut Garmin</div><div class="${K("cols", "g")}">${model.garmin.map((g) => `<div><div class="${K("k")}">${esc(g.k)}</div><div class="${K("v")}">${esc(g.v)}</div></div>`).join("")}</div>` : "";
  const ds = model.dataState;
  return `<section class="${K("res")}" aria-label="Ergebnis"><div class="${K("meta")}"><i style="background:${color}"></i>${esc(meta)}</div><h2>${esc(title)}</h2>${big}${lead}${nums}${whys.length ? `<p class="${K("note")}" style="margin:12px 0 0">${esc(whys.join(". "))}.</p>` : ""}${gar}<div class="${K("dl")}"><i class="${K(ds.tone === "warn" && "warn")}"></i><span>${esc(ds.text)}</span></div></section>`;
}

/** Prognose-Karte, nur wenn sich die Prognose geändert hat. fc: {from, to (s), parts: {run, st, rox (s)}, lo, hi}. */
export function anProgHtml(fc) {
  if (!fc || Math.abs(fc.to - fc.from) < 1) return "";
  const d = Math.round(fc.to - fc.from), p = fc.parts || {};
  return `<section class="${K("prog")}" aria-label="Rennprognose"><div class="${K("kick")}">Rennprognose Sub 60</div><div class="${K("pr")}"><span class="${K("mu")}">${mmss(fc.from)}</span>${ico("M5 12h14M13 6l6 6-6 6", 18)}<b>${mmss(fc.to)}</b><span class="${K("pill", d < 0 ? "ok" : "bad")}">${sg(d)} s</span></div><p class="${K("note")}" style="margin:8px 0 0">Laufen ${sg(Math.round(p.run || 0))} s, Stationen ${sg(Math.round(p.st || 0))} s, Roxzone ${sg(Math.round(p.rox || 0))} s.${fc.lo && fc.hi ? ` Spanne ${mmss(fc.lo)} bis ${mmss(fc.hi)}.` : ""} Diese Karte erscheint nur, wenn die Einheit die Prognose um mindestens 1 s verändert.</p></section>`;
}

/** Abschnitt mit Überschrift. */
export const anSection = (title, inner, right = "") => `<section class="${K("sec")}" aria-label="${esc0(title)}"><h3><span>${esc0(title)}</span>${right ? `<span class="${K("cl")}">${right}</span>` : ""}</h3>${inner}</section>`;

/** Reiter unter dem Diagramm (Zustand hält die App: data-act="an-sub"). */
export const anTabsHtml = (tabs, active) => (tabs.length ? `<div class="${K("tabs")}" role="tablist" aria-label="Details">${tabs.map((t) => `<button type="button" role="tab" aria-selected="${t === active}" data-act="an-sub" data-t="${esc0(t)}">${esc0(t)}</button>`).join("")}</div>` : "");

/**
 * Tabelle. cols: CSS-Spalten («minmax(0,1fr) 52px …»), head: Beschriftungen, rows: [{cells: [text | {t, c}], sel: "key|t0|t1|Name" (Zeile antippbar), pause, on}].
 * Zellen-Klassen c: ok, bad, mu. Die erste Spalte linksbündig, alle anderen rechtsbündig mit Tabellenziffern.
 */
export function anTableHtml({ cols, head, rows, note = "" }, esc = esc0) {
  const st = `style="grid-template-columns:${cols}"`;
  const cell = (c) => (c && typeof c === "object" ? `<span class="${K(c.c)}">${esc(c.t)}</span>` : `<span>${esc(c == null ? "" : c)}</span>`);
  const hd = `<div class="${K("tr", "hd")}" ${st}>${head.map((h) => `<span>${esc(h)}</span>`).join("")}</div>`;
  const body = rows.map((r) => (r.sel ? `<button type="button" class="${K("tr", r.pause && "pause", r.on && "on")}" ${st} data-an-sel="${esc(r.sel)}">${r.cells.map(cell).join("")}</button>` : `<div class="${K("tr", r.pause && "pause")}" ${st}>${r.cells.map(cell).join("")}</div>`)).join("");
  return `<div class="${K("tbl")}">${hd}${body}</div>${note ? `<p class="${K("note")}">${esc(note)}</p>` : ""}`;
}

/** Zonen-Balken. rows: [{label, sub, secs, pct, color}] von Zone 5 nach Zone 1. */
export function anZonesHtml(rows, note = "", esc = esc0) {
  return `<div style="margin-top:8px">${rows.map((r) => `<div class="${K("z")}"><span class="${K("mu")}">${esc(r.label)}</span><div><div class="${K("t")}"><i style="width:${Math.max(r.secs > 0 ? 1 : 0, Math.round(r.pct))}%;background:${r.color}"></i></div><small>${esc(r.sub)}</small></div><span>${mmss(r.secs)}</span></div>`).join("")}</div>${note ? `<p class="${K("note")}">${esc(note)}</p>` : ""}`;
}

/** Liste Label/Wert. */
export const anKvHtml = (pairs, note = "", esc = esc0) => `<div class="${K("kv")}" style="margin-top:8px">${pairs.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join("")}</div>${note ? `<p class="${K("note")}">${esc(note)}</p>` : ""}`;

/** Leerer Zustand. */
export const anEmpty = (msg) => `<p class="${K("empty")}">${msg}</p>`;

/**
 * Coach-Einschätzung, eingeklappt. c: {teaser, tone, sections: [{cls: ok|bad|mu|warn|acc, t, html}], prop (HTML des Planvorschlags | ""), foot (HTML)}.
 * Jede Aussage trägt Zahlen aus den Daten (die Texte baut die App), das Urteil ist Text, keine Punktzahl.
 */
export function anCoachHtml(c) {
  const secs = c.sections.filter((s) => s && s.html).map((s) => `<div class="${K("cs")}"><div class="${K("h", s.cls)}">${s.t}</div><p>${s.html}</p></div>`).join("");
  return `<details class="${K("coach")}"><summary><span class="${K("ct")}"><b>Coach-Einschätzung</b>${c.teaser ? `<small>${c.tone ? `<span class="${K(c.tone)}">${c.verdict || ""}</span>${c.verdict ? " · " : ""}` : ""}${c.teaser}</small>` : ""}</span>${ico("M6 9l6 6 6-6")}</summary><div class="${K("in")}">${secs}${c.prop || ""}${c.foot || ""}</div></details>`;
}

/** Planvorschlag des Coaches. items: [{text, why}]. */
export function anProposalHtml(items, i, canAll, esc = esc0) {
  if (!items.length) return "";
  return `<div class="${K("prop")}"><div class="${K("kick")}">Vorschlag für den Plan</div>${items.map((x) => `<p>${esc(x.text)}${x.why ? ` <small class="${K("mu")}">${esc(x.why)}</small>` : ""}</p>`).join("")}<div class="${K("bar")}" style="margin:12px 0 0"><button type="button" class="${K("chip", "go")}" data-act="an-apply" data-i="${i}">Nur für mich</button>${canAll ? `<button type="button" class="${K("chip")}" data-act="an-apply-all" data-i="${i}">Für uns beide</button>` : ""}</div><button type="button" class="${K("linkb")}" data-act="an-dismiss" data-i="${i}">Verwerfen</button></div>`;
}

/** Fuss des Coach-Blocks: Stand und Knopf. */
export const anCoachFoot = (txt, btn, i, busy) => `<div class="${K("cfoot")}"><span>${txt}</span><button type="button" class="${K("chip")}" data-act="an-run" data-i="${i}"${busy ? " disabled" : ""}>${btn}</button></div>`;

/* ---------- Verlauf ---------- */
/** Zeitraum-Schalter: opts [[Wert, Beschriftung]]. */
export const anPeriodHtml = (opts, cur) => `<div class="${K("seg")}" role="group" aria-label="Zeitraum" style="display:grid;grid-template-columns:repeat(${opts.length},1fr)">${opts.map(([k, l]) => `<button type="button" aria-selected="${k === cur}" data-act="an-period" data-p="${k}">${l}</button>`).join("")}</div>`;

/** Trend mit Achse, Werten, Datum und Ziellinie. pts: [{pc (s/km), label}] (ältestes zuerst), goal: s/km oder null. */
export function anTrendHtml(pts, goal = null, title = "Pace in Intervall-Läufen") {
  if (pts.length < 3) return `<section class="${K("card")}"><div class="${K("kick")}">${title}</div><p class="${K("note")}" style="margin:8px 0 0">Noch zu wenig Daten (${pts.length} von 3).</p></section>`;
  const tr = pts.map((p) => p.pc), last = tr[tr.length - 1], prev = tr[tr.length - 2], d = Math.round(last - prev);
  const lo = Math.floor((Math.min(...tr, goal || 1e9) - 4) / 5) * 5, hi = Math.ceil((Math.max(...tr) + 4) / 5) * 5, X0 = 40, X1 = 300, Y0 = 26, Y1 = 122;
  const yOf = (v) => Y0 + ((v - lo) / (hi - lo)) * (Y1 - Y0), xy = tr.map((p, i) => [X0 + 14 + (i * (X1 - X0 - 28)) / (tr.length - 1), yOf(p)]);
  let gy = ""; for (let v = lo; v <= hi; v += 5) gy += `<line x1="${X0}" x2="${X1}" y1="${f1(yOf(v))}" y2="${f1(yOf(v))}" stroke="#ffffff" stroke-opacity=".09"/><text x="${X0 - 6}" y="${f1(yOf(v) + 4)}" text-anchor="end" fill="#a1a2aa" font-size="11">${mmss(v)}</text>`;
  const gl = goal ? `<line x1="${X0}" x2="${X1}" y1="${f1(yOf(goal))}" y2="${f1(yOf(goal))}" stroke="#e0bf6a" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${X0 + 4}" y="${f1(yOf(goal) - 5)}" fill="#e0bf6a" font-size="11" font-weight="600">Ziel ${mmss(goal)}</text>` : "";
  const path = xy.map((p, i) => (i ? "L" : "M") + f1(p[0]) + " " + f1(p[1])).join(" ");
  const dots = xy.map((p, i) => `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${i === xy.length - 1 ? 5.5 : 4}" fill="${i === xy.length - 1 ? "#64a8ff" : "#0e1016"}" stroke="#64a8ff" stroke-width="2"/><text x="${f1(p[0])}" y="${f1(p[1] + 17)}" text-anchor="middle" fill="#f5f5f7" font-size="12" font-weight="${i === xy.length - 1 ? 700 : 500}">${mmss(tr[i])}</text><text x="${f1(p[0])}" y="${Y1 + 22}" text-anchor="middle" fill="#a1a2aa" font-size="11">${esc0(pts[i].label)}</text>`).join("");
  const gain = tr[0] - last, toGoal = goal ? Math.round(last - goal) : null;
  return `<section class="${K("card")}" aria-label="Trend"><div class="${K("kick")}">${title}</div><div class="${K("big")}" style="margin:8px 0"><b>${mmss(last)}</b><span>/km · ${Math.abs(d)} s ${d <= 0 ? "schneller" : "langsamer"} als davor</span></div><svg viewBox="0 0 310 152" width="100%" role="img" aria-label="Pace je Intervall-Lauf: ${pts.map((p) => esc0(p.label) + " " + mmss(p.pc)).join(", ")}"><text x="2" y="12" fill="#a1a2aa" font-size="11">↑ schneller</text>${gy}${gl}<path d="${path}" fill="none" stroke="#64a8ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg><p class="${K("note")}" style="margin:8px 0 0">Jeder Punkt ist die Ø Pace der Arbeits-Intervalle einer Einheit, darunter das Datum. Oben ist schneller. Seit ${esc0(pts[0].label)} ${gain >= 0 ? Math.round(gain) + " s schneller" : Math.abs(Math.round(gain)) + " s langsamer"}${toGoal != null ? (toGoal <= 0 ? ", Ziel erreicht." : ", noch " + toGoal + " s bis zum Ziel.") : "."}</p></section>`;
}

/** Balken je Woche. rows: [{label, parts: [{v, color}], total: Text}], legend: [{label, color}]. Ab 3 Wochen, sonst Hinweis. */
export function anWeeksHtml(title, rows, legend = [], note = "") {
  if (rows.length < 3) return `<section class="${K("card")}"><div class="${K("kick")}">${title}</div><p class="${K("note")}" style="margin:8px 0 0">Noch zu wenig Daten (${rows.length} von 3).</p></section>`;
  const mx = Math.max(...rows.map((r) => r.parts.reduce((s, p) => s + p.v, 0)), 1);
  return `<section class="${K("card")}" aria-label="${esc0(title)}"><div class="${K("kick")}">${title}</div>${legend.length ? `<div class="${K("leg")}" style="margin:12px 0">${legend.map((l) => `<span><i style="border-color:${l.color}"></i>${esc0(l.label)}</span>`).join("")}</div>` : ""}<div class="${K("wk")}">${rows.map((r) => `<div class="${K("wr")}"><span>${esc0(r.label)}</span><div class="${K("tr2")}">${r.parts.map((p) => `<i style="width:${(p.v / mx) * 100}%;background:${p.color}"></i>`).join("")}</div><b>${esc0(r.total)}</b></div>`).join("")}</div>${note ? `<p class="${K("note")}" style="margin:12px 0 0">${esc0(note)}</p>` : ""}</section>`;
}

/** Liste der Einheiten im Verlauf. rows: {w} (Wochenkopf) oder {x, dow, day, color, title, sub}. */
export function anListHtml(rows, esc = esc0) {
  return `<div class="${K("lst")}">${rows.map((r) => (r.w ? `<h3>Woche ${r.w}</h3>` : `<button type="button" class="${K("row")}" data-act="an-pick" data-i="${r.x}" data-go="analysis"><span class="${K("d")}"><small>${esc(r.dow)}</small><b>${r.day}</b></span><span class="${K("t")}"><span><i style="background:${r.color}"></i>${esc(r.title)}</span><small>${esc(r.sub)}</small></span>${ico("M9 5l7 7-7 7", 18)}</button>`)).join("")}</div>`;
}

/** Vergleichstabelle: head [Spalten], rows [{k, a, b, d}], nur Zahlen, keine Wertung. */
export function anCmpHtml({ names, rows, pairs, chart, range }, esc = esc0) {
  const t = (cols, head, rs) => anTableHtml({ cols, head, rows: rs.map((r) => ({ cells: r })) }, esc);
  return `<section class="${K("res")}"><div class="${K("meta")}"><i></i>Nur Zahlen, keine Wertung</div><div style="margin-top:12px">${t("minmax(0,1fr) 64px 64px 56px", ["", names.me, names.pa, "Diff."], rows.map((r) => [{ t: r.k, c: "mu" }, r.a, r.b, { t: r.d || "", c: "mu" }]))}</div></section>${anSection("Diagramme", chart || anEmpty("Keine Zeitreihe zum Vergleichen."))}${range || ""}${pairs.length ? anSection("Pace je Intervall", t("minmax(0,1fr) 64px 64px 56px", ["Nr.", names.me, names.pa, "Diff."], pairs.map((r) => [`Lauf ${r.k}`, r.a, r.b, { t: r.d, c: "mu" }]))) : ""}`;
}

export { fmtSub };
