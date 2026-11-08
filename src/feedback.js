// Feedback-Modus für jedes Mitglied (eigene Einträge): Im Training ein Element antippen, kurz kommentieren, später gesammelt abarbeiten.
// Oben reine Funktionen (getestet in test/feedback.test.js), unten die Oberfläche (nur im Browser, nur wenn init() läuft).
import { esc } from "./util.js";

export const CATS = { fehler: "Fehler", plan: "Plan ändern", design: "Design", idee: "Idee" };
export const STATUS = { offen: "offen", erledigt: "erledigt" };
export const TABLE = "app_feedback";
const MAX_TEXT = 2000;

/* ---------- Reine Funktionen ---------- */

/** UUID v4; rnd() liefert Zufallszahlen 0..1 (für Tests ersetzbar). */
export function makeId(rnd = Math.random) {
  const c = globalThis.crypto;
  if (rnd === Math.random && c && typeof c.randomUUID === "function") return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = Math.floor(rnd() * 16);
    return (ch === "x" ? r : (r & 3) | 8).toString(16);
  });
}

const clip = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);

/** Neuer Eintrag. ctx = Beschreibung des Elements und der Ansicht. */
export function newItem({ text, cat, ctx, now, id }) {
  const t = String(text == null ? "" : text).trim().slice(0, MAX_TEXT);
  if (!t) return null;
  const at = new Date(now == null ? Date.now() : now).toISOString();
  return { id: id || makeId(), text: t, cat: CATS[cat] ? cat : "idee", status: "offen", ctx: ctx || {}, created_at: at, updated_at: at };
}

/** Beschreibt ein DOM-Element (nur über Standard-Eigenschaften, damit es sich testen lässt). */
export function describeElement(el, maxDepth = 5) {
  if (!el) return {};
  const seg = (e) => {
    const tag = String(e.tagName || "").toLowerCase();
    if (!tag) return "";
    if (e.id) return `${tag}#${e.id}`;
    const cls = [...(e.classList || [])].filter((c) => !/^(on|open|hide|hidden|active|fb-.*)$/.test(c)).slice(0, 2);
    let s = tag + cls.map((c) => "." + c).join("");
    const par = e.parentElement;
    if (par && par.children) {
      const same = [...par.children].filter((x) => x.tagName === e.tagName);
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
    }
    return s;
  };
  const parts = [];
  const data = {};
  let cur = el;
  for (let d = 0; cur && d < maxDepth; d++, cur = cur.parentElement) {
    const s = seg(cur);
    if (s) parts.unshift(s);
    for (const [k, v] of Object.entries(cur.dataset || {})) if (!(k in data) && String(v).length <= 40 && Object.keys(data).length < 8) data[k] = String(v);
    if (cur.id) break;
  }
  const lab = el.getAttribute ? el.getAttribute("aria-label") || el.getAttribute("title") || "" : "";
  return { tag: String(el.tagName || "").toLowerCase(), path: parts.join(" > "), text: clip(el.textContent, 140), label: clip(lab, 80), data };
}

/** Einheitliche Kontext-Zeile für Liste und Export: «Heute · 2026-11-06 · Kraft A · Schritt 3». */
export function ctxLine(ctx) {
  const c = ctx || {};
  const VIEW = { today: "Heute", week: "Woche", plan: "Plan", profile: "Profil", strava: "Strava/Garmin", backup: "Backup", coach: "Coach", dashboard: "Dashboard", review: "Wochenrückblick", focus: "Fokusmodus", import: "Import", edit: "Bearbeiten" };
  const out = [VIEW[c.view] || c.view || "Ansicht ?"];
  if (c.date) out.push(c.date);
  else if (c.day != null) out.push("Tag " + (c.day + 1));
  if (c.plan) out.push(c.plan);
  if (c.step != null) out.push("Schritt " + c.step);
  return out.join(" · ");
}

/* ---- Speicher (lokal) ---- */
export const emptyStore = () => ({ items: [], del: [] });

export function loadStore(raw) {
  let o = null;
  try {
    o = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (_) {}
  if (!o || typeof o !== "object") return emptyStore();
  const items = (Array.isArray(o.items) ? o.items : []).filter((x) => x && typeof x.id === "string" && typeof x.text === "string");
  return { items, del: (Array.isArray(o.del) ? o.del : []).filter((x) => typeof x === "string") };
}

export const saveStore = (st) => JSON.stringify({ items: st.items, del: st.del });

export const addItem = (st, it) => ({ ...st, items: [it, ...st.items.filter((x) => x.id !== it.id)] });

export function setStatus(st, id, status, now) {
  if (!STATUS[status]) return st;
  const at = new Date(now == null ? Date.now() : now).toISOString();
  return { ...st, items: st.items.map((x) => (x.id === id && x.status !== status ? { ...x, status, updated_at: at } : x)) };
}

export function setText(st, id, text, now) {
  const t = String(text == null ? "" : text).trim().slice(0, MAX_TEXT);
  if (!t) return st;
  const at = new Date(now == null ? Date.now() : now).toISOString();
  return { ...st, items: st.items.map((x) => (x.id === id && x.text !== t ? { ...x, text: t, updated_at: at } : x)) };
}

/** Löschen merkt sich die ID, damit die Cloud-Zeile beim nächsten Sync ebenfalls verschwindet. */
export function removeItem(st, id) {
  if (!st.items.some((x) => x.id === id)) return st;
  return { items: st.items.filter((x) => x.id !== id), del: st.del.includes(id) ? st.del : [...st.del, id] };
}

export function filterItems(items, f) {
  const l = f === "offen" || f === "erledigt" ? items.filter((x) => x.status === f) : items.slice();
  return l.sort((a, b) => ts(b.created_at) - ts(a.created_at));
}

/* ---- Cloud ---- */
export const toRow = (it) => ({ id: it.id, text: it.text, cat: it.cat, status: it.status, ctx: it.ctx || {}, created_at: it.created_at, updated_at: it.updated_at });
export const fromRow = (r) => ({ id: r.id, text: String(r.text || ""), cat: CATS[r.cat] ? r.cat : "idee", status: STATUS[r.status] ? r.status : "offen", ctx: r.ctx && typeof r.ctx === "object" ? r.ctx : {}, created_at: r.created_at, updated_at: r.updated_at || r.created_at, sy: r.updated_at || r.created_at });

const ts = (s) => Date.parse(s) || 0;

/**
 * Zusammenführen lokal/remote.
 * - Gleiche ID: der Eintrag mit dem neueren updated_at gewinnt.
 * - Nur lokal und noch nie hochgeladen: wird hochgeladen. Nur lokal, aber schon einmal synchronisiert (sy): woanders gelöscht, fällt weg.
 * - Nur remote: wird übernommen. Lokal gelöschte IDs (del) werden remote gelöscht und nie wieder übernommen.
 * Ergibt { items, push (Einträge zum Hochladen), remove (IDs zum Löschen in der Cloud) }.
 */
export function reconcile(local, remote, del = []) {
  const gone = new Set(del);
  const rm = new Map(remote.filter((r) => !gone.has(r.id)).map((r) => [r.id, r]));
  const items = [];
  const push = [];
  for (const l of local) {
    if (gone.has(l.id)) continue;
    const r = rm.get(l.id);
    if (!r) {
      if (!l.sy) {
        items.push(l);
        push.push(l);
      }
      continue;
    }
    rm.delete(l.id);
    if (ts(r.updated_at) > ts(l.updated_at)) items.push({ ...r, sy: r.updated_at });
    else {
      items.push(l);
      if (ts(l.updated_at) > ts(r.updated_at)) push.push(l);
      else if (!l.sy) items[items.length - 1] = { ...l, sy: l.updated_at };
    }
  }
  for (const r of rm.values()) items.push({ ...r, sy: r.updated_at });
  return { items: items.sort((a, b) => ts(b.created_at) - ts(a.created_at)), push, remove: [...gone] };
}

export const markSynced = (items, ids, at) => items.map((x) => (ids.includes(x.id) ? { ...x, sy: at } : x));

/* ---- Export ---- */
const dt = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return "?";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Text zum Weitergeben an Claude. */
export function toText(items, { filter = "offen", now = Date.now() } = {}) {
  const l = filterItems(items, filter);
  const n = items.filter((x) => x.status === "offen").length;
  let out = `# Basel Sub-60 – Feedback (Stand ${dt(new Date(now).toISOString())}, ${n} offen, Auswahl: ${filter})\n`;
  if (!l.length) return out + "\n(keine Einträge)\n";
  l.forEach((x, i) => {
    const c = x.ctx || {};
    out += `\n## ${i + 1}. [${CATS[x.cat] || x.cat}] ${x.status} · ${dt(x.created_at)}\n`;
    out += `Ansicht: ${ctxLine(c)}\n`;
    if (c.el && (c.el.text || c.el.label)) out += `Element-Text: «${c.el.label || c.el.text}»\n`;
    if (c.el && c.el.path) out += `CSS-Pfad: ${c.el.path}\n`;
    if (c.el && c.el.data && Object.keys(c.el.data).length) out += `data-Werte: ${Object.entries(c.el.data).map(([k, v]) => `${k}=${v}`).join(", ")}\n`;
    out += `Kommentar: ${x.text}\n`;
    out += `ID: ${x.id}\n`;
  });
  return out;
}

export const toJson = (items, { filter = "alle" } = {}) => JSON.stringify({ app: "basel-sub60", type: "feedback", items: filterItems(items, filter).map(toRow) }, null, 2);

/* ---------- Oberfläche (nur im Browser) ---------- */

let env = null; // { isOwner, ctx, sb, user, key, toast, closeMenu }
let store = emptyStore();
let storeKey = "";
let mode = false;
let filt = "offen";
let panel = null; // Listen-Overlay
let editor = null; // { ctx, el, cat, id? }
let syncMsg = "";
let syncT = 0;
let syncedFor = "";
let picked = null;

const lsGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch (_) {
    return null;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch (_) {}
};
const owner = () => !!env && !!env.isOwner();
const lk = () => (env ? env.key() + ":fb" : "hx:fb");

function load() {
  if (storeKey !== lk()) {
    storeKey = lk();
    store = loadStore(lsGet(storeKey));
    mode = lsGet(storeKey + ":mode") === "1";
  }
}
function persist() {
  lsSet(storeKey, saveStore(store));
  scheduleSync();
}

/** Cloud-Sync (still, wenn Supabase fehlt oder die Tabelle noch nicht angelegt ist). */
export async function sync() {
  load();
  const sb = env && env.sb();
  if (!owner() || !sb || !env.user() || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
  const before = saveStore(store);
  try {
    const { data, error } = await sb.from(TABLE).select("*");
    if (error) throw error;
    const r = reconcile(store.items, (data || []).map(fromRow), store.del);
    if (r.remove.length) {
      const d = await sb.from(TABLE).delete().in("id", r.remove);
      if (d.error) throw d.error;
    }
    if (r.push.length) {
      const u = await sb.from(TABLE).upsert(r.push.map(toRow), { onConflict: "id" });
      if (u.error) throw u.error;
    }
    const at = new Date().toISOString();
    // Wurde während des Syncs lokal etwas geändert, nichts überschreiben: der nächste Lauf holt es nach
    if (saveStore(store) !== before) return scheduleSync();
    store = { items: markSynced(r.items, r.push.map((x) => x.id), at), del: store.del.filter((id) => !r.remove.includes(id)) };
    lsSet(storeKey, saveStore(store));
    syncMsg = "Cloud: synchronisiert";
  } catch (e) {
    syncMsg = "Cloud-Sync fehlgeschlagen" + (e && e.message ? ` (${String(e.message).slice(0, 60)})` : "") + ". Einträge bleiben lokal.";
  }
  paint();
}
function scheduleSync() {
  clearTimeout(syncT);
  syncT = setTimeout(sync, 1200);
}

/* ---- CSS ---- */
const CSS = `
.fb-ui{position:fixed;z-index:1300;font:600 14px/1.3 -apple-system,system-ui,sans-serif;color:#f5f5f7}
.fb-ui *{box-sizing:border-box}
.fb-fab{right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 84px);display:flex;gap:6px;align-items:center;background:#16181a;border:1px solid #e0bf6a;border-radius:999px;padding:4px;box-shadow:0 6px 20px rgba(0,0,0,.5)}
.fb-fab button{min-height:44px;padding:0 14px;border:0;border-radius:999px;background:none;color:#f5f5f7;font:inherit;cursor:pointer}
.fb-fab .fb-list{background:#e0bf6a;color:#16181a}
.fb-fab small{padding-left:10px;color:#e0bf6a;font-weight:600}
.fb-sheet{left:0;right:0;bottom:0;background:#0e1016;border-top:1px solid rgba(255,255,255,.16);border-radius:18px 18px 0 0;padding:14px 14px calc(env(safe-area-inset-bottom,0px) + 14px);box-shadow:0 -10px 30px rgba(0,0,0,.6);max-height:70vh;overflow:auto}
.fb-sheet h3,.fb-panel h2{margin:0 0 6px;font-size:17px}
.fb-ctx{color:#9a9ba3;font-weight:500;font-size:13px;margin:0 0 10px;word-break:break-word}
.fb-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}
.fb-chips button,.fb-btn{min-height:44px;padding:0 14px;border:0;border-radius:12px;background:#1b1e29;color:#f5f5f7;font:inherit;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}
.fb-chips button.on,.fb-btn.gold{background:#e0bf6a;color:#16181a;box-shadow:none}
.fb-btn.red{color:#ff6961}
.fb-ui textarea{width:100%;min-height:84px;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:#161922;color:#f5f5f7;font-size:16px;line-height:1.4;font-weight:500;font-family:inherit;resize:vertical}
.fb-row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.fb-row .fb-btn{flex:1 1 auto}
.fb-panel{inset:0;background:#06070a;overflow:auto;padding:calc(env(safe-area-inset-top,0px) + 12px) 14px calc(env(safe-area-inset-bottom,0px) + 24px)}
.fb-card{background:#0e1016;border-radius:14px;padding:12px;margin:0 0 10px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.fb-card.done{opacity:.6}
.fb-card .fb-meta{color:#9a9ba3;font-weight:500;font-size:12px}
.fb-card p{margin:6px 0;font-weight:500;font-size:15px;white-space:pre-wrap;word-break:break-word}
.fb-tag{display:inline-block;padding:2px 8px;border-radius:999px;background:#1b1e29;color:#e0bf6a;font-size:12px}
.fb-sw{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:14px;background:#161922;margin:0 0 10px}
.fb-sw button{min-width:64px}
.fb-sel{outline:3px solid #e0bf6a !important;outline-offset:2px}
body.fb-armed{cursor:crosshair}
`;

function ensureCss() {
  if (document.getElementById("fb-css")) return;
  const s = document.createElement("style");
  s.id = "fb-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}

const isUi = (t) => !!(t && t.closest && t.closest("[data-fb-ui]"));

function fabHtml() {
  const n = store.items.filter((x) => x.status === "offen").length;
  return `<div class="fb-ui fb-fab" data-fb-ui><small>Element antippen</small><button type="button" class="fb-list" data-fb="list">Liste · ${n}</button><button type="button" data-fb="off" aria-label="Feedback-Modus aus">Aus</button></div>`;
}

function editorHtml() {
  const e = editor;
  const el = e.ctx.el;
  const what = el && (el.label || el.text) ? `«${esc((el.label || el.text).slice(0, 70))}»` : e.ctx.el ? esc(e.ctx.el.tag || "Element") : "ganze Ansicht";
  return `<div class="fb-ui fb-sheet" data-fb-ui role="dialog" aria-label="Feedback erfassen"><h3>Feedback</h3><p class="fb-ctx">${esc(ctxLine(e.ctx))}<br>${what}</p>
<div class="fb-chips" role="group" aria-label="Kategorie">${Object.entries(CATS).map(([k, v]) => `<button type="button" data-fb="cat" data-c="${k}" class="${e.cat === k ? "on" : ""}" aria-pressed="${e.cat === k}">${v}</button>`).join("")}</div>
<textarea id="fb-text" maxlength="${MAX_TEXT}" placeholder="Das sollte anders sein …" aria-label="Kommentar">${esc(e.text || "")}</textarea>
<div class="fb-row"><button type="button" class="fb-btn" data-fb="cancel">Abbrechen</button><button type="button" class="fb-btn gold" data-fb="save">Speichern</button></div></div>`;
}

function panelHtml() {
  const l = filterItems(store.items, filt);
  const cnt = (s) => store.items.filter((x) => x.status === s).length;
  const card = (x) => {
    const c = x.ctx || {};
    const el = c.el && (c.el.label || c.el.text) ? `<div class="fb-meta">Element: «${esc((c.el.label || c.el.text).slice(0, 80))}»</div>` : "";
    return `<div class="fb-card${x.status === "erledigt" ? " done" : ""}" data-id="${esc(x.id)}"><span class="fb-tag">${esc(CATS[x.cat] || x.cat)}</span> <span class="fb-meta">${esc(dt(x.created_at))} · ${esc(x.status)}</span>
<div class="fb-meta">${esc(ctxLine(c))}</div>${el}<p>${esc(x.text)}</p>
<div class="fb-row"><button type="button" class="fb-btn" data-fb="toggle" data-id="${esc(x.id)}">${x.status === "offen" ? "Erledigt" : "Wieder öffnen"}</button><button type="button" class="fb-btn" data-fb="edit" data-id="${esc(x.id)}">Text ändern</button><button type="button" class="fb-btn red" data-fb="del" data-id="${esc(x.id)}">Löschen</button></div></div>`;
  };
  return `<div class="fb-ui fb-panel" data-fb-ui role="dialog" aria-label="Feedback-Liste"><div class="fb-row" style="margin:0 0 10px"><h2 style="flex:1;align-self:center">Feedback</h2><button type="button" class="fb-btn" data-fb="close">Schliessen</button></div>
<div class="fb-sw"><span>Feedback-Modus<br><span class="fb-ctx" style="margin:0">${mode ? "an: Elemente antippen statt bedienen" : "aus: App läuft normal"}</span></span><button type="button" class="fb-btn ${mode ? "gold" : ""}" data-fb="mode" aria-pressed="${mode}">${mode ? "An" : "Aus"}</button></div>
<div class="fb-chips" role="group" aria-label="Filter">${[["offen", `Offen (${cnt("offen")})`], ["erledigt", `Erledigt (${cnt("erledigt")})`], ["alle", `Alle (${store.items.length})`]].map(([k, v]) => `<button type="button" data-fb="filter" data-f="${k}" class="${filt === k ? "on" : ""}">${v}</button>`).join("")}</div>
<div class="fb-row" style="margin:0 0 12px"><button type="button" class="fb-btn" data-fb="note">+ Notiz zu dieser Ansicht</button><button type="button" class="fb-btn" data-fb="copy">Als Text kopieren</button><button type="button" class="fb-btn" data-fb="json">JSON speichern</button></div>
<p class="fb-ctx">${esc(syncMsg || (env.sb() && env.user() ? "Cloud: noch nicht synchronisiert" : "Nur auf diesem Gerät gespeichert"))}</p>
${l.length ? l.map(card).join("") : `<p class="fb-ctx">Keine Einträge in dieser Auswahl.</p>`}</div>`;
}

let fabEl = null;
let edEl = null;
let panEl = null;
function mountOnly(cur, html, set) {
  if (cur) cur.remove();
  if (!html) return null;
  const t = document.createElement("div");
  t.innerHTML = html;
  const n = t.firstElementChild;
  document.body.appendChild(n);
  return set ? set(n) : n;
}
function paint() {
  if (!env || typeof document === "undefined") return;
  load();
  const on = owner();
  const showFab = on && mode;
  // FAB nur neu aufbauen, wenn sich etwas geändert hat (sonst verliert er beim Antippen den Fokus)
  const fh = showFab ? fabHtml() : "";
  if (!fabEl || fabEl.dataset.h !== fh) {
    fabEl = mountOnly(fabEl, fh);
    if (fabEl) fabEl.dataset.h = fh;
  }
  document.body.classList.toggle("fb-armed", showFab);
  if (!on) {
    panel = null;
    editor = null;
  }
  const sc = panEl ? panEl.scrollTop : 0;
  const hadFocus = document.activeElement && document.activeElement.id === "fb-text";
  panEl = mountOnly(panEl, panel && on ? panelHtml() : "");
  if (panEl && sc) panEl.scrollTop = sc;
  const keep = edEl && editor ? (document.getElementById("fb-text") || {}).value : undefined;
  if (editor && keep !== undefined) editor.text = keep;
  edEl = mountOnly(edEl, editor && on ? editorHtml() : "");
  if (hadFocus && edEl) {
    const t = document.getElementById("fb-text");
    if (t) t.focus({ preventScroll: true });
  }
  const mi = document.getElementById("fb-menu");
  if (mi) mi.hidden = !on;
}

function setMode(v) {
  load();
  mode = !!v;
  lsSet(storeKey + ":mode", mode ? "1" : "0");
  if (!mode) {
    clearSel();
    editor = null;
  } else if (env.toast) env.toast("Feedback-Modus an: Element antippen");
  paint();
}
function clearSel() {
  if (picked && picked.classList) picked.classList.remove("fb-sel");
  picked = null;
}

function pick(target) {
  clearSel();
  const el = target.closest ? target : target.parentElement;
  picked = el;
  el.classList.add("fb-sel");
  const keep = editor && !editor.id;
  editor = { ctx: { ...env.ctx(), el: describeElement(el) }, cat: (keep && editor.cat) || "fehler", text: keep ? (document.getElementById("fb-text") || {}).value || "" : "" };
  paint();
  const t = document.getElementById("fb-text");
  if (t) t.focus({ preventScroll: true });
}

function onCapture(e) {
  if (!mode || !owner() || isUi(e.target)) return;
  // pointerdown/touchstart/mousedown nur stoppen (Halten-/Zieh-Aktionen der App); preventDefault bliebe sonst ohne den Folgeklick
  e.stopPropagation();
  e.stopImmediatePropagation();
  if (e.type === "pointerdown" || e.type === "touchstart" || e.type === "mousedown") return;
  e.preventDefault();
  if (e.type === "click") pick(e.target);
}

function onUi(e) {
  const b = e.target.closest && e.target.closest("[data-fb]");
  if (!b || !isUi(b)) return;
  const a = b.dataset.fb;
  const id = b.dataset.id;
  if (a === "list") panel = true;
  else if (a === "close") panel = null;
  else if (a === "off") return setMode(false);
  else if (a === "mode") return setMode(!mode);
  else if (a === "filter") filt = b.dataset.f;
  else if (a === "cat") {
    editor.text = (document.getElementById("fb-text") || {}).value || "";
    editor.cat = b.dataset.c;
  } else if (a === "cancel") {
    editor = null;
    clearSel();
  } else if (a === "save") {
    const text = (document.getElementById("fb-text") || {}).value;
    if (editor.id) {
      if (!String(text || "").trim()) return env.toast && env.toast("Bitte einen Kommentar eingeben", true);
      store = setText(store, editor.id, text);
    } else {
      const it = newItem({ text, cat: editor.cat, ctx: editor.ctx });
      if (!it) return env.toast && env.toast("Bitte einen Kommentar eingeben", true);
      store = addItem(store, it);
    }
    persist();
    editor = null;
    clearSel();
    if (env.toast) env.toast("Feedback gespeichert");
  } else if (a === "toggle") {
    const x = store.items.find((i) => i.id === id);
    store = setStatus(store, id, x && x.status === "offen" ? "erledigt" : "offen");
    persist();
  } else if (a === "del") {
    if (!confirm("Diesen Feedback-Eintrag löschen?")) return;
    store = removeItem(store, id);
    persist();
  } else if (a === "edit") {
    const x = store.items.find((i) => i.id === id);
    if (x) editor = { id, ctx: x.ctx, cat: x.cat, text: x.text };
  } else if (a === "note") {
    editor = { ctx: env.ctx(), cat: "idee", text: "" };
  } else if (a === "copy") return copyText(toText(store.items, { filter: filt }));
  else if (a === "json") return download(toJson(store.items, { filter: filt }), "feedback.json", "application/json");
  paint();
}

async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
    if (env.toast) env.toast("Text kopiert: bei Claude einfügen");
  } catch (_) {
    download(t, "feedback.txt", "text/plain");
  }
}
function download(t, name, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([t], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

/** Öffnet die Liste (z. B. aus dem Menü). */
export function openList() {
  if (!owner()) return;
  load();
  panel = true;
  paint();
  sync();
}

/**
 * Einmal beim Start. env: { isOwner(), ctx(), sb(), user(), key(), toast(msg, warn), closeMenu() }
 * Danach bei jedem render() refresh() aufrufen (zeigt/versteckt Menüpunkt und Knopf, stösst den Sync an).
 */
export function init(e) {
  if (env || typeof document === "undefined") return;
  env = e;
  ensureCss();
  // Menüpunkt (nur für den Besitzer sichtbar)
  const nav = document.querySelector('#sheet .mnav[aria-label="Daten und Konto"]');
  if (nav) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mi";
    b.id = "fb-menu";
    b.hidden = true;
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg><span class="l">Feedback</span>`;
    b.addEventListener("click", () => {
      if (env.closeMenu) env.closeMenu();
      openList();
    });
    nav.appendChild(b);
  }
  // Abfangen nur, solange der Modus an ist (das prüft onCapture selbst); sonst läuft nichts dazwischen
  for (const t of ["click", "auxclick", "submit", "dblclick", "pointerdown", "touchstart", "mousedown"]) document.addEventListener(t, onCapture, true);
  document.addEventListener("click", onUi);
  window.addEventListener("online", scheduleSync);
  refresh();
}

export function refresh() {
  if (!env) return;
  load();
  // Leichtgewichtig (läuft bei jedem render()): Menüpunkt und Knopf nachführen, offene Eingabe in Ruhe lassen
  if (!owner()) {
    if (panel || editor || fabEl || panEl || edEl) {
      panel = null;
      editor = null;
      paint();
    }
  } else {
    const fh = mode ? fabHtml() : "";
    if ((fabEl ? fabEl.dataset.h : "") !== fh) paint();
    const mi = document.getElementById("fb-menu");
    if (mi) mi.hidden = false;
  }
  const uid = owner() && env.user() ? env.user().id || "x" : "";
  if (uid && syncedFor !== uid + storeKey) {
    syncedFor = uid + storeKey;
    sync();
  }
}
