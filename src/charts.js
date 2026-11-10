// Vergleichs-Diagramme im Garmin-Stil mit uPlot (vendor/uplot, Canvas): Puls (mit Zonen), Pace (invertiert, geglättet), Höhe, Kadenz und
// ein Differenz-Diagramm, übereinander mit gemeinsamer Zeit- oder Distanzachse und EINEM synchronen Fadenkreuz.
// Zoom: Ziehen, Mausrad, Pinch, Knöpfe, Tastatur. Der sichtbare Ausschnitt zeigt Durchschnitte für genau diesen Bereich. Runden als Bänder.
// Reine Teile (Formate, HTML-Gerüst) laufen ohne DOM in Node-Tests; die Einbindung (mount) braucht window.uPlot.
import { buildPlot, rangeStats, seriesOf, pairLaps, hrZones, timeGap, zoneTimes } from "./series.js";
import { mmss } from "./util.js";

export const COLORS = { me: "#e6b94d", pa: "#6aa9ff" };
const esc0 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const dec = (n, d = 1) => n.toFixed(d).replace(".", ",");

export const fmtTime = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
export const fmtDist = (m) => (m >= 1000 ? dec(m / 1000, m >= 10000 ? 1 : 2) : Math.round(m)) + (m >= 1000 ? " km" : " m");
export const fmtX = (xk, v) => (xk === "d" ? fmtDist(v) : fmtTime(v));
const sg = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n);

/** Messwerte der Diagramme: Beschriftung, Einheit, Formatierung. */
export const KINDS = {
  hr: { label: "Puls", unit: "bpm", fmt: (v) => String(Math.round(v)), dfmt: (d) => sg(Math.round(d)) + " bpm" },
  pace: { label: "Pace", unit: "/km", fmt: (v) => mmss(Math.round(v)), dfmt: (d) => sg(Math.round(d)) + " s/km", invert: true },
  el: { label: "Höhe", unit: "m", fmt: (v) => String(Math.round(v)), dfmt: (d) => sg(Math.round(d)) + " m", fill: true },
  cad: { label: "Kadenz", unit: "/min", fmt: (v) => String(Math.round(v)), dfmt: (d) => sg(Math.round(d)) },
  dist: { label: "Abstand", unit: "m", fmt: (v) => String(Math.round(v)), dfmt: (d) => sg(Math.round(d)) + " m" },
};
export const DIFFS = [["hr", "Puls"], ["pace", "Pace"], ["dist", "Abstand"]];

/** Nächster Rasterindex zu x (Raster gleichmäßig). */
export const idxOf = (P, x) => Math.max(0, Math.min(P.N - 1, Math.round((x / P.xmax) * (P.N - 1))));

/** Werte am Rasterindex i: {vals: [{who, v, text}], diff, diffText} – Differenz = ich minus Partner, nur wenn beide da sind. */
export function valuesAt(P, kind, i) {
  const K = KINDS[kind], out = [];
  for (const w of ["me", "pa"]) {
    const arr = P.persons[w] && P.persons[w][kind];
    const v = arr ? arr[i] : null;
    out.push({ who: w, v, text: v == null ? "–" : K.fmt(v) });
  }
  const d = out[0].v != null && out[1].v != null ? out[0].v - out[1].v : null;
  return { vals: out, diff: d, diffText: d == null ? null : K.dfmt(d) };
}

/* ---------- Zustand je Panel (überlebt jedes Neuzeichnen der Seite) ---------- */
const ZKEY = "hx:cmp-zones";
const zonesPref = () => { try { return localStorage.getItem(ZKEY) === "1"; } catch (_) { return false; } };
const saveZones = (on) => { try { localStorage.setItem(ZKEY, on ? "1" : "0"); } catch (_) {} };
const poss = (n) => n + (/[sxzß]$/i.test(n) ? "'" : "s");
const STATE = new Map();
const MOUNTS = new Map();

const stateOf = (id, model, ctx) => {
  let s = STATE.get(id);
  if (!s) { s = { xk: "t", dm: "hr", hidden: new Set(), zoom: null, sel: null, zones: zonesPref() }; STATE.set(id, s); }
  s.model = model; s.ctx = ctx;
  return s;
};

const tileHtml = (t, nm, esc) => {
  const side = (who, v) => `<span class="cmp-v"><i class="cmp-sw ${who}"></i><small>${esc(nm[who])}</small>${v == null ? `<em class="na">keine Daten</em>` : `<b>${esc(t.fmt(v))}</b>`}</span>`;
  return `<div class="cmp-tile"><span class="k">${esc(t.k)}</span>${side("me", t.me)}${side("partner", t.partner)}<span class="cmp-d">${t.diff == null ? "kein Unterschied berechnet" : "Unterschied " + esc(t.dfmt(t.diff))}</span></div>`;
};

/** Gerüst des Panels. Die Diagramme selbst setzt mount() ein, sobald das Gerüst im Dokument steht. ctx: {me, pa, steps, maxHr}. */
export function comparePanelHtml(id, model, esc = esc0, ctx = {}) {
  const s = stateOf(id, model, ctx), nm = model.names;
  const P = buildPlot(ctx.me, ctx.pa, { xk: s.xk });
  const meS = seriesOf(ctx.me), paS = seriesOf(ctx.pa);
  const lapOnly = [meS && meS.src === "laps" ? nm.me : "", paS && paS.src === "laps" ? nm.partner : ""].filter(Boolean);
  const gaps = [[ctx.me, nm.me], [ctx.pa, nm.partner]].map(([a, n]) => { const g = timeGap(a); return g != null && Math.abs(g) > 10 ? `${n}: Zeitreihe und Rundenzeiten weichen um ${Math.abs(g)} s ab (Pausen). Die Rundenbänder können gegen den Verlauf verschoben sein.` : ""; }).filter(Boolean);
  const notes = [model.note, ...(P ? gaps : []), P && lapOnly.length ? `Für ${lapOnly.join(" und ")} liegt nur der Rundendurchschnitt vor (keine Sekundenreihe): die Linie zeigt Stufen je Runde.` : ""].filter(Boolean);
  const seg = [["t", "Zeit"], ["d", "Distanz"]].map(([k, l]) => `<button type="button" role="radio" aria-checked="${k === s.xk}" class="cmp-m${k === s.xk ? " on" : ""}" data-cmp-x="${k}">${l}</button>`).join("");
  const leg = ["me", "pa"].map((w) => `<button type="button" class="cmp-lg${s.hidden.has(w) ? " off" : ""}" aria-pressed="${!s.hidden.has(w)}" data-cmp-hide="${w}"><i class="cmp-sw ${w === "pa" ? "partner" : "me"}"></i>${esc(nm[w === "pa" ? "partner" : "me"])}</button>`).join("");
  const zoom = `<div class="cmp-zoom" role="group" aria-label="Zoom"><button type="button" class="cmp-m" data-cmp-zoom="in" aria-label="Vergrößern">+</button><button type="button" class="cmp-m" data-cmp-zoom="out" aria-label="Verkleinern">−</button><button type="button" class="cmp-m" data-cmp-zoom="reset">Zurücksetzen</button></div>`;
  const dm = DIFFS.filter(([k]) => !(k === "dist" && s.xk === "d")).map(([k, l]) => `<button type="button" role="radio" aria-checked="${k === s.dm}" class="cmp-m sm${k === s.dm ? " on" : ""}" data-cmp-dm="${k}">${l}</button>`).join("");
  const body = !P
    ? `<p class="cmp-none">keine Daten, Grund: weder Zeitreihe noch Runden vorhanden</p>`
    : `<div class="cmp-read" aria-live="off"></div><div class="cmp-host" tabindex="0" role="group" aria-label="Diagramme. Pfeiltasten bewegen das Fadenkreuz, Plus und Minus zoomen, 0 setzt zurück"></div>${model.same ? `<div class="cmp-dmbar"><span class="k">Unterschied zeigt</span><div class="cmp-seg" role="radiogroup" aria-label="Messwert des Unterschieds">${dm}</div><span class="cmp-hintx">Jeweils ab Start der Aufzeichnung, nicht an derselben Stelle der Einheit.</span></div>` : ""}<p class="cmp-hintx">Ziehen wählt einen Ausschnitt, Strg oder Cmd mit Mausrad und zwei Finger zoomen, Doppelklick setzt zurück.</p><div class="cmp-zinfo"></div><div class="cmp-laps"></div><div class="cmp-lapinfo"></div>`;
  return `<div class="cmp" data-cmp="${esc(id)}">
    <div class="cmp-tiles">${model.tiles.map((t) => tileHtml(t, nm, esc)).join("")}</div>
    <div class="cmp-bar"><div class="cmp-seg" role="radiogroup" aria-label="Achse">${seg}</div><div class="cmp-leg" role="group" aria-label="Reihen ein- oder ausblenden">${leg}</div>${P && P.has.hr ? `<button type="button" class="cmp-lg cmp-zbtn${s.zones ? "" : " off"}" aria-pressed="${s.zones}" data-cmp-zones>Zonen</button>` : ""}${P ? zoom : ""}</div>
    ${notes.map((n) => `<p class="cmp-note">${esc(n)}</p>`).join("")}
    ${body}
    <p class="cmp-live" aria-live="polite" role="status"></p>
  </div>`;
}

/* ---------- Einbindung mit uPlot ---------- */
const AX = "#8b8d98", GRID = "rgba(255,255,255,.07)";

function plotSpecs(P, s) {
  const blank = P.grid.map(() => null), specs = [];
  for (const k of ["hr", "pace", "el", "cad"]) if (P.has[k]) specs.push({ kind: k, data: [P.grid, (P.persons.me || {})[k] || blank, (P.persons.pa || {})[k] || blank] });
  if (s.model.same && P.persons.me && P.persons.pa && P.diff[s.dm]) specs.push({ kind: "diff", data: [P.grid, P.diff[s.dm]] });
  return specs;
}

function destroyMount(id) {
  const m = MOUNTS.get(id);
  if (!m) return;
  m.ro && m.ro.disconnect();
  m.plots.forEach((p) => { try { p.u.destroy(); } catch (_) {} });
  MOUNTS.delete(id);
}

function mount(root) {
  const id = root.dataset.cmp, s = STATE.get(id), host = root.querySelector(".cmp-host");
  if (!s || !host) return;
  destroyMount(id);
  const U = window.uPlot;
  if (!U) { host.innerHTML = `<p class="cmp-none">Diagramm-Bibliothek nicht geladen (vendor/uplot).</p>`; return; }
  const P = buildPlot(s.ctx.me, s.ctx.pa, { xk: s.xk });
  if (!P) return;
  host.innerHTML = "";
  const names = { me: s.model.names.me, pa: s.model.names.partner }, specs = plotSpecs(P, s), plots = [], key = "cmp-" + id;
  const maxHr = s.ctx.maxHr || Math.max(0, ...(P.persons.me ? P.persons.me.hr.filter((v) => v != null) : [])) || null; // nur mein Maximalpuls, den des Partners kennen wir nicht
  const laps = pairLaps(s.ctx.me && s.ctx.me.laps, s.ctx.pa && s.ctx.pa.laps, s.ctx.steps);
  const xr = (o) => (s.xk === "d" ? [o.d0, o.d1] : [o.t0, o.t1]);
  let active = null, zoomGuard = false;
  const view = () => s.zoom || [0, P.xmax];

  const syncX = (mn, mx) => { zoomGuard = true; try { plots.forEach((p) => p.u.setScale("x", { min: mn, max: mx })); } finally { zoomGuard = false; } };
  const setZoom = (a, b, keepSel) => {
    const minSpan = P.xmax / 60;
    if (b - a < minSpan) { const c = (a + b) / 2; a = c - minSpan / 2; b = c + minSpan / 2; }
    a = Math.max(0, a); b = Math.min(P.xmax, b);
    s.zoom = a <= 0 && b >= P.xmax ? null : [a, b];
    if (!keepSel && !s.zoom) s.sel = null;
    syncX(a, b); stats(); syncLapUi();
  };
  root._zoom = { set: setZoom, reset: () => { s.sel = null; setZoom(0, P.xmax); }, view };

  function cursorText(i) {
    plots.forEach((p) => {
      const e = p.el.querySelector("[data-pv]");
      if (!e) return;
      if (i == null) { e.textContent = ""; return; }
      if (p.spec.kind === "diff") { const v = P.diff[s.dm] && P.diff[s.dm][i]; e.innerHTML = `${esc0(names.me)} − ${esc0(names.pa)}: <b>${v == null ? "–" : esc0(KINDS[s.dm].dfmt(v))}</b>`; return; }
      const a = valuesAt(P, p.spec.kind, i);
      e.innerHTML = `${s.hidden.has("me") ? "" : `<i class="cmp-sw me"></i><b>${esc0(a.vals[0].text)}</b>`}${s.hidden.has("pa") ? "" : `<i class="cmp-sw partner"></i><b>${esc0(a.vals[1].text)}</b>`}<small>${esc0(KINDS[p.spec.kind].unit)}</small>`;
    });
    const live = root.querySelector(".cmp-live");
    if (live && i != null) live.textContent = `${fmtX(s.xk, P.grid[i])}: ` + ["hr", "pace"].filter((k) => P.has[k]).map((k) => { const a = valuesAt(P, k, i); return `${KINDS[k].label} ${names.me} ${a.vals[0].text}, ${names.pa} ${a.vals[1].text}` + (a.diffText ? `, Unterschied ${a.diffText}` : ""); }).join("; ");
  }

  function stats() {
    const el = root.querySelector(".cmp-read");
    if (!el) return;
    const [a, b] = view();
    const rows = ["me", "pa"].filter((w) => P.persons[w] && !s.hidden.has(w)).map((w) => {
      const S = seriesOf(s.ctx[w]), r = S && rangeStats(S, s.xk, a, b);
      const c = (v, f) => (v == null ? "–" : f(v));
      const cell = (l, v) => `<span><small>${l}</small><b>${v}</b></span>`;
      return `<div class="cmp-rr"><span class="cmp-who"><i class="cmp-sw ${w === "pa" ? "partner" : "me"}"></i>${esc0(names[w])}</span>${cell("Puls", c(r && r.hr, String))}${cell("Pace", c(r && r.pace, (v) => mmss(Math.round(v))))}${cell("Distanz", c(r && r.dist, fmtDist))}${S && S.src === "series" ? cell("Höhe ↑", c(r && r.gain, (v) => v + " m")) : ""}${S && S.src === "series" && P.has.cad ? cell("Kadenz", c(r && r.cad, String)) : ""}</div>`;
    }).join("");
    el.innerHTML = `<div class="cmp-rh"><b>${s.zoom ? "Ausschnitt" : "Ganze Einheit"}</b><span>${esc0(fmtX(s.xk, a))} bis ${esc0(fmtX(s.xk, b))} · Durchschnitte</span></div>${rows}`;
  }

  function syncLapUi() {
    root.querySelectorAll("[data-cmp-lap]").forEach((b) => { const on = +b.dataset.cmpLap === s.sel; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    const info = root.querySelector(".cmp-lapinfo");
    if (!info) return;
    const pr = laps.pairs.find((p) => p.n === s.sel);
    if (!pr) {
      const tp = (L) => (L ? `<td class="n">${L.d >= 100 ? esc0(mmss(Math.round(L.t / (L.d / 1000)))) : "–"}</td><td class="n">${L.hr || "–"}</td>` : `<td class="n na">–</td><td class="n na">–</td>`);
      info.innerHTML = laps.pairs.length ? `<table class="v3-t cmp-lt"><caption>Alle Runden</caption><thead><tr><th>Runde</th><th class="n">${esc0(names.me)} Pace</th><th class="n">Puls</th>${laps.pairs.some((p) => p.pa) ? `<th class="n">${esc0(names.pa)} Pace</th><th class="n">Puls</th>` : ""}</tr></thead><tbody>${laps.pairs.map((p) => `<tr><td>${p.n}</td>${tp(p.me)}${laps.pairs.some((q) => q.pa) ? tp(p.pa) : ""}</tr>`).join("")}</tbody></table>` : "";
      plots.forEach((p) => p.u.redraw(false, false));
      return;
    }
    const row = (who, L) => {
      const sw = `<i class="cmp-sw ${who === "pa" ? "partner" : "me"}"></i>`;
      if (!L) return `<tr><td>${sw}${esc0(names[who])}</td><td colspan="4" class="na">keine Zuordnung</td></tr>`;
      return `<tr><td>${sw}${esc0(names[who])}</td><td class="n">${esc0(fmtDist(L.d))}</td><td class="n">${esc0(fmtTime(L.t))}</td><td class="n">${L.d >= 100 ? esc0(mmss(Math.round(L.t / (L.d / 1000)))) + "/km" : "–"}</td><td class="n">${L.hr ? L.hr : "–"}</td></tr>`;
    };
    info.innerHTML = `<table class="v3-t cmp-lt"><caption>Runde ${pr.n}</caption><thead><tr><th></th><th class="n">Distanz</th><th class="n">Zeit</th><th class="n">Pace</th><th class="n">Puls</th></tr></thead><tbody>${row("me", pr.me)}${row("pa", pr.pa)}</tbody></table>`;
    plots.forEach((p) => p.u.redraw(false, false));
  }

  // --- Plots anlegen
  specs.forEach((spec) => {
    const isDiff = spec.kind === "diff", K = isDiff ? KINDS[s.dm] : KINDS[spec.kind];
    const wrap = document.createElement("div");
    wrap.className = "cmp-pl";
    wrap.innerHTML = `<div class="cmp-ph"><b>${isDiff ? "Unterschied · " + esc0(KINDS[s.dm].label) : esc0(K.label)}</b><span class="cmp-pv" data-pv="${spec.kind}"></span></div>`;
    const mountEl = document.createElement("div");
    wrap.appendChild(mountEl);
    host.appendChild(wrap);
    const ser = isDiff
      ? [{}, { label: "Unterschied", stroke: "#cfd2dc", width: 1.6, points: { show: false }, fill: "rgba(207,210,220,.10)", fillTo: () => 0 }]
      : [{}, ...["me", "pa"].map((w) => ({ label: names[w], show: !s.hidden.has(w), stroke: COLORS[w], width: 2, dash: w === "pa" ? [7, 4] : undefined, points: { show: false }, fill: K.fill ? (w === "me" ? "rgba(230,185,77,.18)" : "rgba(106,169,255,.14)") : undefined, spanGaps: false }))];
    const rangeY = (u, mn, mx) => {
      if (isDiff) { const m = Math.max(1, Math.abs(mn), Math.abs(mx)); return [-m * 1.1, m * 1.1]; }
      if (spec.kind === "hr" && maxHr && s.zones) return [Math.max(0, Math.min(mn, maxHr * 0.5) - 3), Math.max(mx, maxHr * 0.9) + 3];
      const pad = (mx - mn || 1) * 0.12;
      return [mn - pad, mx + pad];
    };
    const opts = {
      width: Math.max(260, host.clientWidth), height: isDiff ? 120 : spec.kind === "hr" || spec.kind === "pace" ? 150 : 110,
      legend: { show: false }, padding: [6, 8, 0, 0],
      cursor: { sync: { key, scales: ["x", null] }, drag: { x: true, y: false, setScale: false }, points: { size: 7 }, bind: { dblclick: () => () => { root._zoom.reset(); return null; } } },
      scales: { x: { time: false, auto: false, min: view()[0], max: view()[1] }, y: { auto: true, dir: K.invert && !isDiff ? -1 : 1, range: rangeY } },
      axes: [
        { stroke: AX, grid: { stroke: GRID, width: 1 }, ticks: { show: false }, size: 26, font: "11px system-ui", values: (u, sp) => sp.map((v) => fmtX(s.xk, v)), incrs: s.xk === "d" ? [100, 200, 500, 1000, 2000, 5000, 10000] : [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600] },
        { stroke: AX, grid: { stroke: GRID, width: 1 }, ticks: { show: false }, size: 46, font: "11px system-ui", values: (u, sp) => sp.map((v) => (v == null ? "" : K.fmt(v))) },
      ],
      series: ser,
      hooks: {
        drawClear: [(u) => {
          // Runden als Bänder (jede zweite etwas heller), Zonen im Pulsdiagramm, gewählte Runde hervorgehoben
          const { ctx } = u, { left, top, width, height } = u.bbox;
          const band = (a, b, col) => { const x0 = Math.max(left, u.valToPos(a, "x", true)), x1 = Math.min(left + width, u.valToPos(b, "x", true)); if (x1 > x0) { ctx.fillStyle = col; ctx.fillRect(x0, top, x1 - x0, height); } };
          ctx.save();
          laps.pairs.forEach((p, k) => { const [a, b] = xr(p.me); band(a, b, p.n === s.sel ? "rgba(230,185,77,.16)" : k % 2 ? "rgba(255,255,255,.04)" : "rgba(255,255,255,0)"); });
          const sp = s.sel && laps.pairs.find((p) => p.n === s.sel);
          if (sp && sp.pa) { const [a, b] = xr(sp.pa); band(a, b, "rgba(106,169,255,.13)"); }
          if (spec.kind === "hr" && maxHr && s.zones) {
            const z = hrZones(maxHr);
            for (let i = 0; i < 5; i++) {
              const y1 = u.valToPos(z[i + 1], "y", true), y0 = u.valToPos(z[i], "y", true), t = Math.max(top, Math.min(y0, y1)), b = Math.min(top + height, Math.max(y0, y1));
              if (b <= t) continue;
              ctx.fillStyle = `rgba(255,255,255,${0.02 + i * 0.018})`; ctx.fillRect(left, t, width, b - t);
              ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.font = "10px system-ui"; ctx.textAlign = "right"; ctx.fillText("Z" + (i + 1), left + width - 4, Math.min(b - 3, t + 11));
            }
          }
          ctx.restore();
        }],
        setCursor: [(u) => { const i = u.cursor.left >= 0 ? u.cursor.idx : null; if (i !== active) { active = i == null ? null : i; cursorText(active); } }],
        setSelect: [(u) => {
          if (zoomGuard || u.select.width < 8) return;
          const a = u.posToVal(u.select.left, "x"), b = u.posToVal(u.select.left + u.select.width, "x");
          u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
          root._zoom.set(a, b);
        }],
      },
    };
    plots.push({ u: new U(opts, spec.data, mountEl), el: wrap, spec });
  });
  const zi = root.querySelector(".cmp-zinfo");
  if (zi) {
    if (s.zones && maxHr && P.has.hr) {
      const z = hrZones(maxHr), nm = poss(names.me);
      const rowsZ = ["me", "pa"].filter((w) => P.persons[w] && !s.hidden.has(w)).map((w) => { const t = zoneTimes(seriesOf(s.ctx[w]), maxHr); return `<div class="cmp-zr"><span class="cmp-who"><i class="cmp-sw ${w === "pa" ? "partner" : "me"}"></i>${esc0(names[w])}</span>${t ? t.map((v, k) => `<span><small>Z${k + 1}</small><b>${esc0(fmtTime(v))}</b></span>`).join("") : '<span class="na">keine Pulsdaten</span>'}</div>`; }).join("");
      zi.innerHTML = `<div class="cmp-zl"><b>Zonen nach ${esc0(nm)} Maximalpuls (${maxHr} bpm)</b><span>${[0, 1, 2, 3, 4].map((k) => `Z${k + 1} ${z[k]}–${z[k + 1]}`).join(" · ")}</span></div><div class="cmp-zt"><small>Zeit in den Zonen (gleiche Grenzen für beide)</small>${rowsZ}</div>`;
    } else zi.innerHTML = "";
  }
  const sumTxt = ["me", "pa"].filter((w) => P.persons[w]).map((w) => { const S = seriesOf(s.ctx[w]), r = S && rangeStats(S, s.xk, 0, P.xmax); return `${names[w]}: ${r && r.hr ? "Durchschnittspuls " + r.hr : "kein Puls"}${r && r.pace ? ", Pace " + mmss(Math.round(r.pace)) + " pro Kilometer" : ""}`; }).join(". ");
  host.setAttribute("aria-label", `Diagramme, ${plots.length} übereinander. ${sumTxt}. ${laps.pairs.length} Runden. Pfeiltasten bewegen das Fadenkreuz, Plus und Minus zoomen, 0 setzt zurück.`);
  const mnt = { plots, ro: null, P, laps };
  MOUNTS.set(id, mnt);
  root._mnt = mnt;
  if (window.ResizeObserver) {
    let last = host.clientWidth;
    mnt.ro = new ResizeObserver(() => { const w = host.clientWidth; if (w && Math.abs(w - last) > 1) { last = w; plots.forEach((p) => p.u.setSize({ width: Math.max(260, w), height: p.u.height })); } });
    mnt.ro.observe(host);
  }
  const lc = root.querySelector(".cmp-laps");
  if (lc) lc.innerHTML = laps.pairs.length ? `<span class="k">Runde antippen: Zoom und Rundenwerte beider</span><div class="cmp-chips">${laps.pairs.map((p) => `<button type="button" class="cmp-chip" data-cmp-lap="${p.n}" aria-pressed="false">${p.n}</button>`).join("")}</div>${laps.note ? `<p class="cmp-note">${esc0(laps.note)}</p>` : ""}` : "";
  stats(); syncLapUi();
}

/** Hängt Mounten und Bedienung einmal ans Dokument (Delegation: überlebt jedes Neuzeichnen der Seite). */
export function attachCharts(doc = document) {
  if (doc.__cmpAttached) return;
  doc.__cmpAttached = true;
  const scan = () => {
    for (const id of [...MOUNTS.keys()]) { const m = MOUNTS.get(id); if (!m.plots[0] || !m.plots[0].el.isConnected) destroyMount(id); }
    doc.querySelectorAll(".cmp[data-cmp]").forEach((root) => { const h = root.querySelector(".cmp-host"); if (h && !h.firstChild) mount(root); });
  };
  new MutationObserver((ms) => { if (ms.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && ((n.matches && n.matches(".cmp")) || (n.querySelector && n.querySelector(".cmp")))))) setTimeout(scan, 0); }).observe(doc.body, { childList: true, subtree: true });
  const ctx = (el) => { const root = el.closest && el.closest(".cmp"); return root ? { root, s: STATE.get(root.dataset.cmp) } : null; };
  const rebuild = (c) => { const h = c.root.querySelector(".cmp-host"); if (h) { h.innerHTML = ""; mount(c.root); } };
  const zoomBy = (c, f, cx) => {
    const z = c.root._zoom; if (!z) return;
    const [a, b] = z.view(), ctr = cx == null ? (a + b) / 2 : cx, k = Math.max(0, Math.min(1, (ctr - a) / (b - a))), span = (b - a) * f;
    z.set(ctr - span * k, ctr + span * (1 - k));
  };
  const xAt = (c, clientX) => { const m = c.root._mnt; if (!m || !m.plots[0]) return null; const u = m.plots[0].u, r = u.over.getBoundingClientRect(); return u.posToVal(clientX - r.left, "x"); };
  doc.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-cmp-x],[data-cmp-hide],[data-cmp-zoom],[data-cmp-lap],[data-cmp-dm],[data-cmp-zones]");
    if (!b) return;
    const c = ctx(b);
    if (!c || !c.s) return;
    const flip = (sel, attr, val, cls = "on", aria = "aria-checked") => c.root.querySelectorAll(sel).forEach((x) => { const on = x.dataset[attr] === val; x.classList.toggle(cls, on); x.setAttribute(aria, String(on)); });
    if (b.hasAttribute("data-cmp-zones")) { c.s.zones = !c.s.zones; saveZones(c.s.zones); b.classList.toggle("off", !c.s.zones); b.setAttribute("aria-pressed", String(c.s.zones)); rebuild(c); b.focus(); }
    else if (b.dataset.cmpX) { if (c.s.xk === b.dataset.cmpX) return; c.s.xk = b.dataset.cmpX; c.s.zoom = null; c.s.sel = null; flip("[data-cmp-x]", "cmpX", c.s.xk); const nodist = c.s.xk === "d"; if (nodist && c.s.dm === "dist") { c.s.dm = "hr"; flip("[data-cmp-dm]", "cmpDm", "hr"); } c.root.querySelectorAll('[data-cmp-dm="dist"]').forEach((x) => { x.hidden = nodist; }); rebuild(c); }
    else if (b.dataset.cmpHide) {
      const w = b.dataset.cmpHide;
      if (c.s.hidden.has(w)) c.s.hidden.delete(w); else c.s.hidden.add(w);
      b.classList.toggle("off", c.s.hidden.has(w)); b.setAttribute("aria-pressed", String(!c.s.hidden.has(w)));
      rebuild(c);
    } else if (b.dataset.cmpDm) { c.s.dm = b.dataset.cmpDm; flip("[data-cmp-dm]", "cmpDm", c.s.dm); rebuild(c); }
    else if (b.dataset.cmpZoom) { if (b.dataset.cmpZoom === "reset") c.root._zoom && c.root._zoom.reset(); else zoomBy(c, b.dataset.cmpZoom === "in" ? 0.5 : 2); }
    else if (b.dataset.cmpLap) {
      const n = +b.dataset.cmpLap, m = c.root._mnt, z = c.root._zoom;
      if (!m || !z) return;
      if (c.s.sel === n) { z.reset(); return; }
      const pr = m.laps.pairs.find((p) => p.n === n);
      if (!pr) return;
      const r = (o) => (c.s.xk === "d" ? [o.d0, o.d1] : [o.t0, o.t1]), A = r(pr.me), B = pr.pa ? r(pr.pa) : A;
      const lo = Math.min(A[0], B[0]), hi = Math.max(A[1], B[1]), pad = (hi - lo) * 0.08;
      c.s.sel = n; z.set(lo - pad, hi + pad, true);
    }
  });
  doc.addEventListener("wheel", (e) => {
    const host = e.target.closest && e.target.closest(".cmp-host");
    if (!host) return;
    const c = ctx(host);
    if (!c || !c.root._zoom || !(e.ctrlKey || e.metaKey)) return; // ohne Strg/Cmd normal scrollen
    e.preventDefault();
    zoomBy(c, e.deltaY < 0 ? 0.8 : 1.25, xAt(c, e.clientX));
  }, { passive: false });
  doc.addEventListener("keydown", (e) => {
    const host = e.target.closest && e.target.closest(".cmp-host");
    if (!host) return;
    const c = ctx(host), m = c && c.root._mnt;
    if (!m) return;
    const u = m.plots[0].u, i = u.cursor.left >= 0 ? u.cursor.idx : null, N = m.P.N, step = Math.max(1, Math.round(N / 60));
    let ni = null;
    if (e.key === "ArrowRight") ni = i == null ? 0 : Math.min(N - 1, i + step);
    else if (e.key === "ArrowLeft") ni = i == null ? N - 1 : Math.max(0, i - step);
    else if (e.key === "Home") ni = 0;
    else if (e.key === "End") ni = N - 1;
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); return zoomBy(c, 0.5); }
    else if (e.key === "-") { e.preventDefault(); return zoomBy(c, 2); }
    else if (e.key === "0") { e.preventDefault(); return c.root._zoom.reset(); }
    else if (e.key === "Escape") { u.setCursor({ left: -10, top: -10 }); return; }
    else return;
    e.preventDefault();
    const x = m.P.grid[ni], [a, b] = c.root._zoom.view();
    if (x < a || x > b) c.root._zoom.set(x - (b - a) / 2, x + (b - a) / 2);
    u.setCursor({ left: Math.round(u.valToPos(x, "x")), top: Math.round(u.over.clientHeight / 2) });
  });
  // Touch: ein Finger bewegt das Fadenkreuz, zwei Finger zoomen (Pinch)
  const touches = new Map();
  let pinch = null;
  const touchCursor = (c, x, y) => {
    const m = c.root._mnt; if (!m) return;
    const hit = m.plots.find((p) => { const r = p.u.over.getBoundingClientRect(); return y >= r.top - 20 && y <= r.bottom + 20; }) || m.plots[0];
    const r = hit.u.over.getBoundingClientRect();
    hit.u.setCursor({ left: Math.max(0, Math.min(r.width, x - r.left)), top: Math.max(0, Math.min(r.height, y - r.top)) });
  };
  doc.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    const host = e.target.closest && e.target.closest(".cmp-host");
    if (!host) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY, host });
    const c = ctx(host);
    if (!c || !c.root._zoom) return;
    if (touches.size === 2) { const [p, q] = [...touches.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), view: c.root._zoom.view() }; }
    else touchCursor(c, e.clientX, e.clientY);
  });
  doc.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "touch" || !touches.has(e.pointerId)) return;
    const t = touches.get(e.pointerId); t.x = e.clientX; t.y = e.clientY;
    const c = ctx(t.host); if (!c || !c.root._zoom) return;
    if (touches.size >= 2 && pinch) {
      const [p, q] = [...touches.values()], d = Math.hypot(p.x - q.x, p.y - q.y), mid = (p.x + q.x) / 2;
      const [a, b] = pinch.view, ctr = xAt(c, mid), k = Math.max(0, Math.min(1, (ctr - a) / (b - a))), span = (b - a) * (pinch.d / Math.max(10, d));
      c.root._zoom.set(ctr - span * k, ctr + span * (1 - k));
    } else touchCursor(c, e.clientX, e.clientY);
  });
  const up = (e) => { if (e.pointerType !== "touch") return; touches.delete(e.pointerId); if (touches.size < 2) pinch = null; };
  doc.addEventListener("pointerup", up);
  doc.addEventListener("pointercancel", up);
  scan();
}

/** Nur für Tests. */
export const _resetCharts = () => { for (const id of [...MOUNTS.keys()]) destroyMount(id); STATE.clear(); };
