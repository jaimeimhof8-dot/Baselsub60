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
export function buildCoachRequest({ context, chat, message, mode }) {
  const text = String(message || "").trim();
  if (!text) throw Object.assign(new Error("Bitte beschreibe kurz, was nicht passt."), { code: "empty" });
  if (text.length > MAX_MSG) throw Object.assign(new Error(`Bitte höchstens ${MAX_MSG} Zeichen.`), { code: "too_long" });
  return { context, history: toApiHistory(chat || []), message: text, ...(mode === "explain" || mode === "analyse" ? { mode } : {}) };
}

/** Frage „Erkläre mir diese Einheit“: enthält die Einheit selbst, damit sie auch ausserhalb der Plan-Vorschau verständlich ist. */
export function explainMessage(i, p) {
  const items = (p.i || []).map((x) => "– " + x).join("\n");
  const note = p.n ? "\nHinweis im Plan: " + p.n : "";
  const msg = "Erkläre mir bitte genauer, was ich in dieser Einheit machen soll (" + DAYSF[dow(i)] + " " + isoFromIdx(i) + ", „" + p.t + "“):\n" + items + note +
    "\nWie läuft sie Schritt für Schritt ab, mit welchem Tempo/Gewicht/Gefühl, worauf achte ich bei der Technik und wozu ist sie gut?";
  return msg.length > MAX_MSG ? msg.slice(0, MAX_MSG - 1) + "…" : msg;
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

/* ---------- Einheiten-Analyse (Modus "analyse") ---------- */
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);

/**
 * Kontext für die Analyse: Plan-Kontext + "session" (alles, was zur fertigen Einheit bekannt ist).
 * Kürzt Texte und Rundenlisten, damit die Anfrage klein bleibt (Edge Function erlaubt 60 kB).
 * session: {date, weekday, title, kind, planNote, wave, block, week, daysToRace, items:[{plan,status,value,prev}], rpe, note,
 *   checkin, garmin, soreness, watch:{name,type,dist,time,hr,watts,laps:[{d,t,hr}]}, similar:[...], weekDone:{done,plan}, tests}
 */
export function analysisContext(base, session) {
  const s = { ...session };
  s.title = clip(s.title, 120); s.planNote = clip(s.planNote, 400); s.note = clip(s.note, 600);
  s.items = (s.items || []).slice(0, 30).map((x) => ({ ...x, plan: clip(x.plan, 160), value: clip(x.value, 120),
    ...(x.prev ? { prev: { ...x.prev, value: clip(x.prev.value, 120) } } : {}) }));
  if (s.watch) s.watch = { ...s.watch, name: clip(s.watch.name, 80), laps: (s.watch.laps || []).slice(0, 60) };
  s.splits = Array.isArray(s.splits) ? s.splits.slice(0, 60) : s.splits || null;
  s.similar = (s.similar || []).slice(0, 4).map((x) => ({ ...x, values: (x.values || []).slice(0, 8) }));
  return { ...base, session: s };
}

/** Standard-Frage an den Coach für die Analyse (die Daten stehen im Kontext). */
export function analyseMessage(i, p) {
  return "Analysiere meine abgeschlossene Einheit am " + DAYSF[dow(i)] + " " + isoFromIdx(i) + " („" + clip(p.t, 100) + "“) wie ein erfahrener Coach: Stärken, Schwächen, Umsetzung, Pausen, was ich am Workout oder am Plan ändern sollte.";
}

const list = (v, f) => (Array.isArray(v) ? v.map(f).filter(Boolean).slice(0, 8) : []);
const txt = (v, n = 800) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const ADJ_AREAS = ["session", "rest", "load", "tempo", "plan", "recovery"];

/** Antwort der Edge Function im Analyse-Modus prüfen und säubern. Wirft bei unbrauchbarer Antwort. */
export function parseAnalysis(r) {
  // Alte Edge-Function-Version kennt den Modus nicht und antwortet im Chat-Format {reply, actions}
  if (r && typeof r.reply === "string" && typeof r.headline !== "string")
    throw Object.assign(new Error("Die Coach-Funktion auf dem Server ist noch die alte Version. Bitte neu deployen: npx supabase functions deploy coach --no-verify-jwt"), { code: "old_function" });
  if (!r || typeof r.headline !== "string" || typeof r.summary !== "string")
    throw Object.assign(new Error("Ungültige Analyse vom Coach"), { code: "bad_response" });
  const pair = (x) => (x && txt(x.title, 120) && txt(x.detail) ? { title: txt(x.title, 120), detail: txt(x.detail) } : null);
  const ex = r.execution || {};
  return {
    headline: txt(r.headline, 300), summary: txt(r.summary, 1500),
    form: r.form && txt(r.form.text) ? { rating: txt(r.form.rating, 40), text: txt(r.form.text) } : null,
    insights: list(r.insights, pair),
    strengths: list(r.strengths, pair), weaknesses: list(r.weaknesses, pair),
    execution: { pacing: txt(ex.pacing), rest: txt(ex.rest), technique: txt(ex.technique) },
    adjustments: list(r.adjustments, (x) => (x && txt(x.change) ? { area: ADJ_AREAS.includes(x.area) ? x.area : "session", change: txt(x.change), why: txt(x.why) } : null)),
    nextFocus: txt(r.next_focus), dataGaps: list(r.data_gaps, (x) => txt(x, 300) || null),
    actions: Array.isArray(r.actions) ? r.actions : [],
  };
}
