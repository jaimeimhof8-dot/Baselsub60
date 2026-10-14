// Dashboard: Intervalle aus Runden (Laps) erkennen, Wochenwerte berechnen und kleine SVG-Diagramme bauen.
// Reine Funktionen ohne DOM – die App setzt die Bausteine in vDashboard() zusammen.
// Diagramm-Regeln (dataviz): eine Achse pro Diagramm, dünne Marken mit 4-px-Rundung an der Datenseite,
// 2-px-Abstand zwischen Balken, zurückhaltendes Raster, Werte in Textfarbe, Hover-Tooltip über data-tip.
import { esc, mmss, exName } from "./util.js";
import { parseKg, isLift, label as liftLabel } from "./weights.js";

const pad = (n) => String(n).padStart(2, "0");

/* ---------- Runden & Intervalle ---------- */

/** "4×1km", "6 x 400 m", "3×2 km" im Plantext -> {n, dist (m)} oder null */
export function parseReps(text) {
  const m = String(text || "").match(/(\d{1,2})\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*(km|m)\b/i);
  if (!m) return null;
  const v = parseFloat(m[2].replace(",", "."));
  const dist = m[3].toLowerCase() === "km" ? v * 1000 : v;
  return dist >= 100 && dist <= 10000 ? { n: +m[1], dist } : null;
}

/** Runden aus Garmin (/activity-service/activity/{id}/splits) oder Strava (/activities/{id}/laps) -> [{d, t, hr, w}] */
export function normalizeLaps(raw) {
  const list = Array.isArray(raw) ? raw : (raw && (raw.lapDTOs || raw.laps)) || [];
  return list.slice(0, 80).map((l) => ({
    d: Math.round(+l.distance || 0),
    t: Math.round(+l.movingDuration || +l.moving_time || +l.duration || +l.elapsed_time || 0),
    hr: Math.round(+l.averageHR || +l.average_heartrate || 0) || null,
    w: Math.round(+l.averagePower || +l.average_watts || 0) || null,
  })).filter((l) => l.t > 0);
}

/** Pace in s/km (nur sinnvoll ab 100 m) */
export const paceOf = (l) => (l && l.d >= 100 && l.t ? l.t / (l.d / 1000) : null);
export const fmtPace = (p) => (p ? mmss(p) + "/km" : "–");

/**
 * Welche Runden sind Belastungs-Intervalle?
 * Mit Plan-Vorgabe ("4×1km"): die n schnellsten Runden mit passender Distanz (±15 %), in zeitlicher Reihenfolge.
 * Sonst: Runden innerhalb von 8 % der schnellsten Pace; sind das fast alle Runden, ist es ein gleichmässiger Lauf.
 * -> {kind: "intervals"|"steady"|"none", work: [Index], reps?: {n, dist}}
 */
export function intervals(laps, planText = "") {
  const L = (laps || []).map((l, i) => ({ ...l, i, p: paceOf(l) }));
  const valid = L.filter((l) => l.p && l.t >= 30);
  if (valid.length < 2) return { kind: "none", work: [] };
  const reps = parseReps(planText);
  if (reps) {
    const fit = valid.filter((l) => Math.abs(l.d - reps.dist) <= reps.dist * 0.15).sort((a, b) => a.p - b.p).slice(0, reps.n);
    if (fit.length >= Math.min(2, reps.n)) return { kind: "intervals", work: fit.map((l) => l.i).sort((a, b) => a - b), reps };
  }
  const best = Math.min(...valid.map((l) => l.p));
  const work = valid.filter((l) => l.p <= best * 1.08).map((l) => l.i);
  if (work.length >= valid.length * 0.8 || work.length < 2) return { kind: "steady", work: valid.map((l) => l.i) };
  return { kind: "intervals", work };
}

/** Kurztext der Intervalle: "4×1 km: 4:02 · 4:10 · 4:08 · 4:18 (Ø 4:09/km)" bzw. Zeiten bei kurzen/ungleichen Runden */
export function repSummary(act, planText = "") {
  const laps = (act && act.laps) || [];
  const iv = intervals(laps, planText);
  if (iv.kind !== "intervals") return "";
  const W = iv.work.map((i) => laps[i]);
  const sameKm = W.every((l) => Math.abs(l.d - 1000) <= 150);
  const dist = Math.round(W.reduce((s, l) => s + l.d, 0) / W.length);
  const head = `${W.length}×${dist >= 1000 ? (dist / 1000).toFixed(dist % 1000 ? 1 : 0).replace(".", ",") + " km" : dist + " m"}`;
  const vals = W.map((l) => (sameKm ? mmss(paceOf(l)) : mmss(l.t)));
  const avgPace = W.reduce((s, l) => s + l.t, 0) / (W.reduce((s, l) => s + l.d, 0) / 1000);
  return `${head}: ${vals.join(" · ")} (Ø ${mmss(avgPace)}/km)`;
}

/** Pace pro Intervall (s/km) – z. B. für den Pacing-Test */
export const repPaces = (act, planText = "") => {
  const iv = intervals((act && act.laps) || [], planText);
  return iv.kind === "intervals" ? iv.work.map((i) => paceOf(act.laps[i])) : [];
};

/* ---------- Wochenwerte ---------- */

/** Aktivitäten pro Planwoche: [{w, min, runKm, n}] für Wochen 0..upTo. idxOf(iso) -> Tag-Index ab Planstart */
export function weekly(acts, idxOf, upTo) {
  const out = Array.from({ length: Math.max(0, upTo + 1) }, (_, w) => ({ w, min: 0, runKm: 0, n: 0 }));
  for (const a of acts || []) {
    const i = idxOf(a.date); if (i == null || i < 0) continue;
    const w = Math.floor(i / 7); if (w > upTo) continue;
    out[w].min += (a.time || 0) / 60; out[w].n++;
    if (a.group === "run") out[w].runKm += (a.dist || 0) / 1000;
  }
  return out.map((x) => ({ ...x, min: Math.round(x.min), runKm: Math.round(x.runKm * 10) / 10 }));
}

/** h:mm aus Minuten */
export const hm = (min) => `${Math.floor(min / 60)}:${pad(Math.round(min % 60))} h`;

/* ---------- SVG-Diagramme ---------- */
const W0 = 320, PADL = 40, PADR = 8, PADT = 10, PADB = 22;
const niceMax = (v) => { if (!(v > 0)) return 1; const e = 10 ** Math.floor(Math.log10(v)); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };
let gradSeq = 0;
const tip = (s) => `data-tip="${esc(s)}"`;
/** Balken mit 4-px-Rundung oben, unten flach auf der Grundlinie */
const barPath = (x, y, w, h) => { const r = Math.min(4, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
function axis(max, h, fmt) {
  const ticks = [0, max / 2, max];
  return ticks.map((t) => { const y = PADT + (h - (t / max) * h); return `<line class="grid" x1="${PADL}" x2="${W0 - PADR}" y1="${y}" y2="${y}"/><text class="ax" x="${PADL - 6}" y="${y + 4}" text-anchor="end">${esc(fmt(t))}</text>`; }).join("");
}

/**
 * Balkendiagramm (eine Reihe). data: [{label, value, tip, hi?}] · hi = hervorgehoben (z. B. aktuelle Woche)
 * fmt formatiert die Achse. Gibt <svg> mit Hover-Zielen (ganze Spaltenhöhe) zurück.
 */
export function barChart(data, { height = 140, fmt = (v) => String(Math.round(v)), color = "var(--viz-1)", label = "" } = {}) {
  const H = height - PADT - PADB, n = data.length || 1, max = niceMax(Math.max(...data.map((d) => d.value || 0)));
  const slot = (W0 - PADL - PADR) / n, bw = Math.max(4, Math.min(24, slot * 0.62));
  let s = `<svg class="viz" viewBox="0 0 ${W0} ${height}" role="img" aria-label="${esc(label)}">${axis(max, H, fmt)}`;
  data.forEach((d, i) => {
    const x = PADL + i * slot + (slot - bw) / 2, h = Math.max(0, ((d.value || 0) / max) * H), y = PADT + H - h;
    s += `<g class="hit" ${tip(d.tip || `${d.label}: ${fmt(d.value || 0)}`)}><rect x="${PADL + i * slot}" y="${PADT}" width="${slot}" height="${H}" fill="transparent"/>`;
    if (h > 0) s += `<path class="bar" d="${barPath(x, y, bw, h)}" fill="${color}" opacity="${d.hi ? 1 : 0.75}"/>`;
    s += `</g>`;
    if (n <= 16 || i % 2 === 0) s += `<text class="ax" x="${x + bw / 2}" y="${height - 6}" text-anchor="middle">${esc(d.label)}</text>`;
  });
  return s + `<line class="base" x1="${PADL}" x2="${W0 - PADR}" y1="${PADT + H}" y2="${PADT + H}"/></svg>`;
}

/**
 * Liniendiagramm (eine Reihe) mit Lücken bei fehlenden Werten. points: [{label, value|null, tip}]
 * min/max optional (sonst aus den Daten mit etwas Luft). invert: kleiner = besser (nur für Hinweise, Achse bleibt normal).
 */
export function lineChart(points, { height = 120, fmt = (v) => String(Math.round(v)), color = "var(--viz-1)", label = "", min, max } = {}) {
  const vals = points.map((p) => p.value).filter((v) => v != null && !isNaN(v));
  if (!vals.length) return "";
  let lo = min ?? Math.min(...vals), hi = max ?? Math.max(...vals);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  // Runde Achsenwerte (z. B. 50/60/70 statt 57/71/86): Schrittweite 1-2-2,5-5 × 10^n
  const raw = (hi - lo) / 3, e = 10 ** Math.floor(Math.log10(raw)), f = raw / e, tick = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  if (min == null) lo = Math.max(0, Math.floor(lo / tick) * tick);
  if (max == null) hi = Math.ceil(hi / tick) * tick;
  if (hi - lo < tick * 2) hi = lo + tick * 2;
  const ticks = []; for (let t = lo; t <= hi + tick / 1000 && ticks.length < 6; t += tick) ticks.push(t);
  const H = height - PADT - PADB, n = points.length, step = (W0 - PADL - PADR) / Math.max(1, n - 1);
  const X = (i) => PADL + (n === 1 ? (W0 - PADL - PADR) / 2 : i * step), Y = (v) => PADT + H - ((v - lo) / (hi - lo)) * H;
  let s = `<svg class="viz" viewBox="0 0 ${W0} ${height}" role="img" aria-label="${esc(label)}">`;
  ((min != null && max != null) ? [lo, (lo + hi) / 2, hi] : ticks).forEach((t) => { const y = Y(t); s += `<line class="grid" x1="${PADL}" x2="${W0 - PADR}" y1="${y}" y2="${y}"/><text class="ax" x="${PADL - 6}" y="${y + 4}" text-anchor="end">${esc(fmt(t))}</text>`; });
  // Linie mit Lücken; darunter eine dezente Verlaufsfläche je zusammenhängendem Abschnitt
  let d = "", pen = false, area = "", seg = [];
  const flush = () => { if (seg.length > 1) area += `M${seg[0][0]},${PADT + H}${seg.map(([x, y]) => `L${x},${y}`).join("")}L${seg[seg.length - 1][0]},${PADT + H}Z`; seg = []; };
  points.forEach((p, i) => { if (p.value == null || isNaN(p.value)) { pen = false; flush(); return; } const x = X(i).toFixed(1), y = Y(p.value).toFixed(1); d += `${pen ? "L" : "M"}${x},${y}`; seg.push([x, y]); pen = true; });
  flush();
  const gid = "lg" + (++gradSeq);
  if (area) s += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path class="area" d="${area}" fill="url(#${gid})"/>`;
  s += `<path class="ln" d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  // Letzter Wert als Punkt + Hover-Ziele je Tag (Fadenkreuz und Punkt erscheinen beim Überfahren)
  const lastI = points.map((p) => p.value != null && !isNaN(p.value)).lastIndexOf(true);
  if (lastI >= 0) s += `<circle class="last" cx="${X(lastI)}" cy="${Y(points[lastI].value)}" r="4" fill="${color}" stroke="var(--card)" stroke-width="2"/>`;
  points.forEach((p, i) => {
    const ok = p.value != null && !isNaN(p.value), x = X(i), w = n === 1 ? 40 : step;
    s += `<g class="hit pt" ${tip(p.tip || `${p.label}: ${ok ? fmt(p.value) : "keine Daten"}`)}><rect x="${x - w / 2}" y="${PADT}" width="${w}" height="${H}" fill="transparent"/><line class="cross" x1="${x}" x2="${x}" y1="${PADT}" y2="${PADT + H}"/>${ok ? `<circle class="dot" cx="${x}" cy="${Y(p.value)}" r="4.5" fill="${color}" stroke="var(--card)" stroke-width="2"/>` : ""}</g>`;
  });
  const first = points[0], last = points[n - 1];
  s += `<text class="ax" x="${X(0)}" y="${height - 6}" text-anchor="start">${esc(first.label)}</text>`;
  if (n > 1) s += `<text class="ax" x="${X(n - 1)}" y="${height - 6}" text-anchor="end">${esc(last.label)}</text>`;
  return s + `</svg>`;
}

/**
 * Gruppierte Balken für zwei Reihen (z. B. ich vs. Partner). groups: [{label, values:[a|null, b|null]}]
 * Kleiner = schneller wird nicht umgedreht: Balken zeigen die Zeit, die Achse beginnt bei lo (Zeiten liegen nah beieinander).
 */
export function pairChart(groups, { height = 150, fmt = (v) => String(v), afmt = fmt, names = ["A", "B"], label = "", lo } = {}) {
  const vals = groups.flatMap((g) => g.values).filter((v) => v != null && !isNaN(v));
  if (!vals.length) return "";
  // Zeiten liegen nah beieinander: Achse ab knapp unter dem kleinsten Wert, auf 5er gerundet (sonst sähe man keine Unterschiede)
  const min = lo ?? Math.floor(Math.min(...vals) * 0.97 / 5) * 5, max = Math.max(min + 5, Math.ceil(Math.max(...vals) * 1.01 / 5) * 5);
  const H = height - PADT - PADB, n = groups.length, slot = (W0 - PADL - PADR) / n, bw = Math.min(22, (slot - 10) / 2);
  const Y = (v) => PADT + H - ((v - min) / (max - min)) * H;
  let s = `<svg class="viz" viewBox="0 0 ${W0} ${height}" role="img" aria-label="${esc(label)}">`;
  [min, Math.round((min + max) / 2), max].forEach((t) => { const y = Y(t); s += `<line class="grid" x1="${PADL}" x2="${W0 - PADR}" y1="${y}" y2="${y}"/><text class="ax" x="${PADL - 6}" y="${y + 4}" text-anchor="end">${esc(afmt(t))}</text>`; });
  groups.forEach((g, i) => {
    const x0 = PADL + i * slot + (slot - (bw * 2 + 2)) / 2;
    g.values.forEach((v, k) => {
      if (v == null || isNaN(v)) return;
      const x = x0 + k * (bw + 2), y = Y(v), h = PADT + H - y;
      s += `<g class="hit" ${tip(`${g.label} · ${names[k]}: ${fmt(v)}`)}><rect x="${x - 1}" y="${PADT}" width="${bw + 2}" height="${H}" fill="transparent"/><path class="bar" d="${barPath(x, y, bw, Math.max(1, h))}" fill="var(--viz-${k + 1})"/></g>`;
    });
    s += `<text class="ax" x="${PADL + i * slot + slot / 2}" y="${height - 6}" text-anchor="middle">${esc(g.label)}</text>`;
  });
  return s + `<line class="base" x1="${PADL}" x2="${W0 - PADR}" y1="${PADT + H}" y2="${PADT + H}"/></svg>`;
}

/**
 * Ring-Anzeige (0–100 %) für Kennzahlen wie Plan-Fortschritt oder Readiness.
 * Der Ring wird über stroke-dashoffset gefüllt (data-pct für die Einblend-Animation), die Zahl steht in Textfarbe.
 */
export function ringGauge(pct, { label = "", value = "", sub = "", color = "var(--viz-1)", size = 132 } = {}) {
  const p = Math.max(0, Math.min(100, +pct || 0)), r = 52, c = 2 * Math.PI * r;
  return `<div class="ring" style="--ring:${color}"><svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${esc(label)}: ${esc(String(value).replace(/<[^>]*>/g, ""))}">
    <circle cx="60" cy="60" r="${r}" class="ring-bg"/>
    <circle cx="60" cy="60" r="${r}" class="ring-fg"${p ? "" : ' opacity="0"'} stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - p / 100)).toFixed(1)}" data-pct="${p}" data-c="${c.toFixed(1)}" transform="rotate(-90 60 60)"/>
  </svg><div class="ring-t"><b>${value}</b><span>${esc(label)}</span>${sub ? `<em>${sub}</em>` : ""}</div></div>`;
}

/* ---------- Kraft: Gewichtsverlauf ---------- */

/**
 * Gewichtsverlauf pro Übung aus den Einträgen der Krafteinheiten.
 * days: [{date: "YYYY-MM-DD", k: Art, items: [{t: Plantext, v: Eintrag}]}] (chronologisch)
 * -> [{key, label, points: [{date, kg}], start, last, best, n}] sortiert nach Anzahl Einträge (meiste zuerst).
 * Pro Tag zählt der schwerste Eintrag einer Übung; Zeit/Pace-Einträge werden ignoriert.
 */
export function liftHistory(days) {
  const map = new Map();
  for (const d of days || []) {
    for (const it of d.items || []) {
      if (!it || !String(it.v || "").trim() || !isLift(d.k, it.t)) continue;
      const kg = parseKg(it.v); if (!(kg > 0)) continue;
      const key = exName(it.t), lab = liftLabel(it.t);
      if (!key || !lab) continue;
      const e = map.get(key) || { key, label: lab, byDay: new Map() };
      e.byDay.set(d.date, Math.max(e.byDay.get(d.date) || 0, kg));
      map.set(key, e);
    }
  }
  return [...map.values()].map((e) => {
    const points = [...e.byDay].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, kg]) => ({ date, kg }));
    return { key: e.key, label: e.label, points, start: points[0].kg, last: points[points.length - 1].kg, best: Math.max(...points.map((p) => p.kg)), n: points.length };
  }).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}
