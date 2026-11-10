// Vergleich meiner Einheit mit der des Partners (Dashboard-Tab «Vergleich»). Reiner Kern ohne DOM.
// Regeln (docs/dashboard-planung.md): kein Urteil, keine Ampel, nie eine Zahl erfinden. Fehlt etwas: «keine Daten, Grund: …».
import { mmss } from "./util.js";

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const pos = (v) => (num(v) && v > 0 ? v : null);
const de = (n, d = 1) => n.toFixed(d).replace(".", ",");
const sg = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n);
const hms = (t) => (t >= 3600 ? Math.floor(t / 3600) + ":" + String(Math.floor((t % 3600) / 60)).padStart(2, "0") + " h" : mmss(t) + " min");

/** Pace einer Runde in s/km; null bei zu kurzer Runde (< 100 m) oder ohne Zeit. */
export const lapPace = (l) => (l && pos(l.d) && l.d >= 100 && pos(l.t) ? l.t / (l.d / 1000) : null);

/** Runden einer Aktivität: [{n (ab 1), d, t, pace, hr}]. Ohne Runden: []. */
export function lapSeries(act) {
  const laps = act && Array.isArray(act.laps) ? act.laps : [];
  return laps.map((l, i) => ({ n: i + 1, d: pos(l && l.d), t: pos(l && l.t), pace: lapPace(l), hr: pos(l && l.hr) }));
}

/** Aktivität des Tages wählen: bevorzugt gleiche Sportart, dann mit Runden, dann die längste. null ohne Aktivität. */
export function pickAct(acts, group = "") {
  const list = (acts || []).filter(Boolean);
  if (!list.length) return null;
  const score = (a) => (group && a.group === group ? 4e9 : 0) + (a.laps && a.laps.length ? 2e9 : 0) + (num(a.time) || 0);
  return [...list].sort((x, y) => score(y) - score(x))[0];
}

/**
 * Vergleich zweier Einheiten.
 *  me / partner: Aktivität {group, name, time, dist, hr, laps:[{d,t,hr}]} oder null · names: {me, partner}
 *  -> {ok:false, why} oder {ok:true, names, tiles, aligned, note, metrics:{hr, pace, dist}, same}
 *  Runden werden nur Runde für Runde gepaart (aligned), wenn beide gleich viele haben. Sonst steht jede Reihe für sich.
 *  tiles: [{k, me, partner, diff|null}] – diff = ich minus Partner, ohne Wertung.
 */
export function compareSessions(me, partner, names = {}) {
  const nm = { me: names.me || "Ich", partner: names.partner || "Partner" };
  if (!partner) return { ok: false, why: `${nm.partner} hat an diesem Tag keine Uhr-Aktivität geteilt.` };
  if (!me) return { ok: false, why: "Für diesen Tag gibt es bei dir keine Uhr-Aktivität zum Vergleichen." };
  const sameGroup = !!me.group && me.group === partner.group;
  const A = lapSeries(me), B = lapSeries(partner);
  const aligned = A.length > 0 && A.length === B.length;
  const paceOf = (a) => (a.dist && a.time && a.dist >= 500 ? a.time / (a.dist / 1000) : null);

  const tiles = [];
  const hrA = pos(me.hr), hrB = pos(partner.hr);
  tiles.push({ id: "hr", k: "Ø Puls", unit: "bpm", me: hrA && Math.round(hrA), partner: hrB && Math.round(hrB), fmt: (v) => String(v), diff: hrA && hrB ? Math.round(hrA) - Math.round(hrB) : null, dfmt: (d) => sg(d) + " bpm" });
  const pA = sameGroup && me.group !== "ride" ? paceOf(me) : null, pB = sameGroup && me.group !== "ride" ? paceOf(partner) : null;
  if (pA || pB || (sameGroup && me.group !== "ride")) tiles.push({ id: "pace", k: "Pace", unit: "/km", me: pA && Math.round(pA), partner: pB && Math.round(pB), fmt: (v) => mmss(v), diff: pA && pB ? Math.round(pA) - Math.round(pB) : null, dfmt: (d) => sg(d) + " s/km" });
  const tA = pos(me.time), tB = pos(partner.time);
  tiles.push({ id: "time", k: "Dauer", unit: "", me: tA && Math.round(tA), partner: tB && Math.round(tB), fmt: hms, diff: tA && tB ? Math.round(tA) - Math.round(tB) : null, dfmt: (d) => (d < 0 ? "−" : d > 0 ? "+" : "±") + mmss(Math.abs(d)) + " min" });
  const dA = pos(me.dist), dB = pos(partner.dist);
  tiles.push({ id: "dist", k: "Distanz", unit: "km", me: dA && Math.round(dA), partner: dB && Math.round(dB), fmt: (v) => de(v / 1000) + " km", diff: dA && dB ? Math.round(dA) - Math.round(dB) : null, dfmt: (d) => (d > 0 ? "+" : d < 0 ? "−" : "±") + de(Math.abs(d) / 1000, 2) + " km" });

  // Reihen je Runde. Fehlt ein Wert, bleibt die Lücke (y = null), es wird nie aufgefüllt.
  const pts = (S, key) => S.map((l) => ({ x: l.n, y: l[key] }));
  const has = (S, key) => S.some((l) => l[key] != null);
  const mk = (id, label, unit, key, fmt, invert) => {
    const series = [
      { id: "me", label: nm.me, pts: pts(A, key), has: has(A, key) },
      { id: "partner", label: nm.partner, pts: pts(B, key), has: has(B, key) },
    ];
    const ok = series.some((s) => s.has);
    return { id, label, unit, fmt, invert: !!invert, series, ok, why: ok ? "" : A.length || B.length ? `in den Runden fehlt der Wert (${label})` : "keine Runden aufgezeichnet" };
  };
  const metrics = {
    hr: mk("hr", "Puls", "bpm", "hr", (v) => String(Math.round(v))),
    pace: mk("pace", "Pace", "/km", "pace", (v) => mmss(Math.round(v)), true),
    dist: mk("dist", "Distanz", "m", "d", (v) => (v >= 1000 ? de(v / 1000, 2) + " km" : Math.round(v) + " m")),
  };
  const diffOk = aligned && sameGroup;
  Object.values(metrics).forEach((m) => { m.aligned = diffOk; });
  if (!sameGroup) tiles.forEach((t) => { t.diff = null; });
  const note = !sameGroup ? `Verschiedene Sportarten (${nm.me}: ${me.name || me.group || "?"}, ${nm.partner}: ${partner.name || partner.group || "?"}): es werden keine Unterschiede berechnet.`
    : !A.length && !B.length ? "Keine Runden in dieser Einheit: Diagramme brauchen die Runden der Uhr."
    : !aligned ? `Rundenzahl verschieden (${nm.me} ${A.length}, ${nm.partner} ${B.length}): Runden werden nicht gepaart, jede Reihe steht für sich.`
    : "";
  return { ok: true, names: nm, same: sameGroup, tiles, aligned, note, metrics, laps: { me: A.length, partner: B.length }, hasLaps: A.length > 0 || B.length > 0 };
}

/** Unterschied an Runde x: [{id, label, v, text}] mit ich, Partner, Differenz (ohne Wertung). null, wenn beide Werte fehlen. */
export function atLap(metric, x) {
  if (!metric) return null;
  const vals = metric.series.map((s) => ({ id: s.id, label: s.label, y: (s.pts.find((p) => p.x === x) || {}).y ?? null }));
  if (vals.every((v) => v.y == null)) return null;
  const both = metric.aligned !== false && vals[0].y != null && vals[1].y != null;
  let diff = null;
  if (both) {
    const r = Math.round(vals[0].y - vals[1].y);
    diff = metric.id === "dist" ? (r === 0 ? "±0 m" : sg(r) + " m") : metric.id === "pace" ? sg(r) + " s/km" : sg(r) + " bpm";
  }
  return { x, vals: vals.map((v) => ({ ...v, text: v.y == null ? "–" : metric.fmt(v.y) })), diff };
}
