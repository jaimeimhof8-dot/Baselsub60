// Coach-Chat: bereitet Plan-Kontext + Nutzertext für die Edge Function "coach" vor (dort ruft ein LLM
// Claude auf) und prüft die zurückgegebenen Änderungsvorschläge, bevor die App sie anwenden darf.
// Reine Funktionen – der Plan wird über Callbacks gelesen, damit alles in Node testbar bleibt.
import { dateFromIdx, DAYSF, dow } from "./dates.js";
import { cleanExtras, extraLabel } from "./extras.js";

export const COACH_PAST = 7;      // Tage Rückblick (erledigt, RPE, ausgefallen)
export const COACH_AHEAD = 21;    // Tage Vorschau, die der Coach ändern darf
export const MAX_MSG = 2000;      // Zeichen pro Nachricht
export const MAX_HISTORY = 12;    // frühere Nachrichten, die mitgeschickt werden
export const ACTION_TYPES = ["swap", "easy", "skip", "edit"];
export const EDIT_KINDS = ["kraft", "lauf", "station", "sim", "bike"]; // Disziplinen, die ein "edit" setzen darf

const pad = (n) => String(n).padStart(2, "0");
export const isoFromIdx = (i) => { const d = dateFromIdx(i); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

/**
 * Kompakte Sicht auf den Plan für das LLM.
 * ctx: {today, last, plan(i), status(i)->{n,done}, rpe(i), skipped(i), checkin, me, partner, extra(i)?}
 */
export function planContext(ctx) {
  const today = Math.max(0, Math.min(ctx.last, ctx.today));
  const day = (i) => {
    const p = ctx.plan(i); if (!p) return null;
    const d = { date: isoFromIdx(i), weekday: DAYSF[dow(i)], kind: p.k, title: p.t };
    if (p.i && p.i.length) d.items = p.i;
    if (p.n) d.note = p.n;
    const flags = [];
    if (p.moved != null) flags.push("verschoben");
    if (p.easy) flags.push("entlastet");
    if (p.back) flags.push("comeback");
    if (p.inj) flags.push("verletzt");
    if (p.edited) flags.push("angepasst");
    if (p.race) flags.push("rennen");
    if (p.solo) flags.push("solo ohne Partner");
    if (flags.length) d.flags = flags;
    // Zusatz-Einheiten neben dem Plan (z. B. "Zone 2 Lauf · 30′") – zählen für die Belastung
    const x = ctx.extra ? cleanExtras(ctx.extra(i)) : [];
    if (x.length) d.extra = x.map(extraLabel);
    return d;
  };
  const recent = [];
  for (let i = Math.max(0, today - COACH_PAST); i < today; i++) {
    const d = day(i); if (!d) continue;
    const s = ctx.status(i);
    delete d.items; delete d.note;
    if (s.n) d.done = `${s.done}/${s.n}`;
    const r = ctx.rpe(i); if (r != null) d.rpe = r;
    if (ctx.skipped(i)) d.skipped = true;
    recent.push(d);
  }
  const upcoming = [];
  for (let i = today; i <= Math.min(ctx.last, today + COACH_AHEAD - 1); i++) {
    const d = day(i); if (!d) continue;
    if (ctx.skipped(i)) d.skipped = true;
    upcoming.push(d);
  }
  // soreness: Muskelkater-Melder, {Muskelgruppe: 1–10}
  return { athlete: ctx.me, partner: ctx.partner, today: isoFromIdx(today), checkin: ctx.checkin || null,
    soreness: ctx.soreness && Object.keys(ctx.soreness).length ? ctx.soreness : null, recent, upcoming };
}

/**
 * Chatverlauf → API-Nachrichten (nur Text). Beginnt mit user, wechselt sauber ab und endet mit assistant –
 * die neue Nachricht hängt die Edge Function an. Unbeantwortete Fragen (App während der Anfrage
 * geschlossen, Fehler) würden sonst zwei user-Nachrichten hintereinander erzeugen.
 */
export function toApiHistory(chat) {
  const msgs = [];
  for (const m of (Array.isArray(chat) ? chat : []).slice(-MAX_HISTORY)) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.text !== "string" || !m.text.trim()) continue;
    const content = m.role === "assistant" && m.actions && m.actions.length
      ? `${m.text}\n[Vorschläge: ${m.actions.map(actionLabel).join("; ")} – ${m.state === "applied" ? "übernommen" : m.state === "dismissed" ? "verworfen" : "offen"}]`
      : m.text;
    const prev = msgs[msgs.length - 1];
    if (prev && prev.role === m.role) prev.content += "\n\n" + content; else msgs.push({ role: m.role, content });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  while (msgs.length && msgs[msgs.length - 1].role !== "assistant") msgs.pop();
  return msgs;
}

/** Fehlermeldung für die App aus Status/Fehlercode der Edge Function. */
export function coachErrorText(status, code) {
  if (status === 404) return "Der Coach ist noch nicht eingerichtet: Die Supabase-Funktion „coach“ fehlt (siehe SETUP.md → Coach-Chat einrichten).";
  if (status === 401 || code === "forbidden") return "Nicht berechtigt – bitte ab- und wieder anmelden.";
  if (status === 429 || code === "rate_limit") return "Gerade zu viele Anfragen. Bitte kurz warten.";
  if (code === "bad_request") return "Die Anfrage war ungültig.";
  if (code === "no_key") return "Auf dem Server fehlt der Claude-API-Key (Secret ANTHROPIC_API_KEY).";
  if (status === 0) return "Keine Verbindung. Bitte Internet prüfen.";
  return "Der Coach ist gerade nicht erreichbar. Bitte später nochmals versuchen.";
}

/** Request-Body für die Edge Function. Wirft bei leerer oder zu langer Nachricht. */
export function buildCoachRequest({ context, chat, message }) {
  const text = String(message || "").trim();
  if (!text) throw Object.assign(new Error("Bitte beschreibe kurz, was nicht passt."), { code: "empty" });
  if (text.length > MAX_MSG) throw Object.assign(new Error(`Bitte höchstens ${MAX_MSG} Zeichen.`), { code: "too_long" });
  return { context, history: toApiHistory(chat || []), message: text };
}

/** Automatische Nachricht, wenn eine Einheit als ausgefallen markiert wird. */
export function skipMessage(i, title) {
  return `Meine Einheit am ${DAYSF[dow(i)]} ${isoFromIdx(i)} („${title}“) fällt aus – ich habe sie als ausgefallen markiert. Bitte plane die nächsten Tage so um, dass möglichst wenig verloren geht.`;
}

export function actionLabel(a) {
  if (a.type === "swap") return `${a.date} ↔ ${a.to} tauschen`;
  if (a.type === "easy") return `${a.date} entlasten`;
  if (a.type === "skip") return `${a.date} ausfallen lassen`;
  if (a.type === "edit") return `${a.date} Übungen ändern`;
  return a.type;
}

/**
 * Vorschläge des LLM prüfen. Nur Tage ab heute (bis Planende) dürfen geändert werden.
 * ctx: {today, last, idxOf(iso), plan(i)}
 * Gibt {valid:[{...a, i, j?}], invalid:[{action, why}]} zurück.
 */
export function validateActions(actions, ctx) {
  const valid = [], invalid = [];
  const min = Math.max(0, ctx.today);
  const dayIdx = (s) => {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const i = ctx.idxOf(s);
    return i >= min && i <= ctx.last ? i : null;
  };
  for (const a of Array.isArray(actions) ? actions : []) {
    const bad = (why) => invalid.push({ action: a, why });
    if (!a || !ACTION_TYPES.includes(a.type)) { bad("unbekannte Aktion"); continue; }
    const i = dayIdx(a.date);
    if (i == null) { bad("Datum liegt nicht im änderbaren Bereich"); continue; }
    const p = ctx.plan(i);
    if (!p) { bad("kein Plantag"); continue; }
    if (p.race) { bad("Renntag wird nicht geändert"); continue; }
    if (a.type === "swap") {
      const j = dayIdx(a.to);
      if (j == null || j === i) { bad("Zieltag ungültig"); continue; }
      if (ctx.plan(j) && ctx.plan(j).race) { bad("Renntag wird nicht geändert"); continue; }
      valid.push({ ...a, i, j }); continue;
    }
    if (a.type === "easy" && p.k === "rest") { bad("Ruhetag kann nicht entlastet werden"); continue; }
    if (a.type === "edit") {
      const items = Array.isArray(a.items) ? a.items.map((x) => String(x).trim()).filter(Boolean).slice(0, 30) : [];
      if (!items.length) { bad("keine Übungen angegeben"); continue; }
      // Ohne gültige Disziplin (z. B. ältere Vorschläge) bleibt die bisherige
      const kind = EDIT_KINDS.includes(a.kind) ? a.kind : p.k;
      valid.push({ ...a, i, items, kind, title: String(a.title || p.t).slice(0, 120), note: String(a.note || "").slice(0, 500) }); continue;
    }
    valid.push({ ...a, i });
  }
  // Pro Tag nur eine Änderung – sonst hängt das Ergebnis von der Reihenfolge ab
  const seen = new Set();
  const out = [];
  for (const a of valid) {
    const days = a.type === "swap" ? [a.i, a.j] : [a.i];
    if (days.some((d) => seen.has(d))) { invalid.push({ action: a, why: "Tag kommt mehrfach vor" }); continue; }
    days.forEach((d) => seen.add(d)); out.push(a);
  }
  return { valid: out, invalid };
}

/** Antwort der Edge Function prüfen: {reply: string, actions: []} */
export function parseCoachResponse(r) {
  if (!r || typeof r.reply !== "string") throw Object.assign(new Error("Ungültige Antwort vom Coach"), { code: "bad_response" });
  return { reply: r.reply, actions: Array.isArray(r.actions) ? r.actions : [] };
}
