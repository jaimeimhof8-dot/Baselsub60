// Teilen ohne Server: eine Woche als Text oder als Lese-Link (Inhalt steckt komprimiert im URL-Hash).
import { DAYSF, dateFromIdx, fmt } from "./dates.js";
import { KIND_LABEL } from "./util.js";

/** Kompakte Wochen-Momentaufnahme: {v, w, from, by, title, days: [{t, k, i, n, done}]} */
export function weekSnapshot({ w, by, title, plan, status }) {
  const days = [];
  for (let d = 0; d < 7; d++) {
    const i = w * 7 + d, p = plan(i);
    if (!p) continue;
    const s = status ? status(i) : null;
    days.push({ t: p.t, k: p.k, i: p.i || [], n: p.n || "", ...(s && s.n && s.done === s.n ? { done: 1 } : {}) });
  }
  return { v: 1, w, by, title, days };
}

export function weekText(snap) {
  const lines = [`Basel Sub-60 · Woche ${snap.w + 1}${snap.title ? " – " + snap.title : ""}`, ""];
  snap.days.forEach((d, j) => {
    const date = fmt(dateFromIdx(snap.w * 7 + j));
    lines.push(`${DAYSF[j]}, ${date}: ${d.t}${d.k === "rest" ? "" : " (" + (KIND_LABEL[d.k] || d.k) + ")"}${d.done ? " ✓" : ""}`);
    for (const x of d.i) lines.push("  • " + x);
  });
  if (snap.by) lines.push("", "Geteilt von " + snap.by);
  return lines.join("\n");
}

// base64url über UTF-8, damit Umlaute und Sonderzeichen den Link überleben.
const toB64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64 = (s) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export const encodeSnapshot = (snap) => toB64(JSON.stringify(snap));
export function decodeSnapshot(code) {
  try {
    const o = JSON.parse(fromB64(String(code)));
    if (!o || o.v !== 1 || !Array.isArray(o.days) || !Number.isInteger(o.w) || o.w < 0 || o.w > 52) return null;
    // Fremde Links: nur erwartete Felder mit erwarteten Typen übernehmen.
    const str = (x) => (typeof x === "string" ? x.slice(0, 500) : "");
    return {
      v: 1, w: o.w, by: str(o.by), title: str(o.title),
      days: o.days.slice(0, 7).map((d) => ({
        t: str(d && d.t), k: str(d && d.k), n: str(d && d.n),
        i: Array.isArray(d && d.i) ? d.i.slice(0, 20).map(str) : [], ...(d && d.done ? { done: 1 } : {})
      }))
    };
  } catch (_) { return null; }
}
/** Lese-Link aus der aktuellen App-Adresse bauen. */
export const shareLink = (base, snap) => base.split("#")[0] + "#w=" + encodeSnapshot(snap);
export const linkCode = (hash) => { const m = String(hash || "").match(/[#&]w=([A-Za-z0-9_-]+)/); return m ? m[1] : null; };
