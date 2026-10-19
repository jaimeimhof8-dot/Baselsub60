// Dynamisches Umplanen: aus Tages-Check-in (Ampel), RPE, Ausfällen und Strava Vorschläge ableiten.
// Rein funktional – die App übergibt einen Kontext mit Zugriffsfunktionen und wendet Vorschläge selbst an.
//
// ctx = {
//   today, last,                     Tag-Index heute / letzter Plantag
//   plan(i)     -> Tagesplan inkl. Umplanungen ({t,k,inj,easy,back,…}) oder null
//   status(i)   -> {n, done}         abgehakte Übungen
//   skipped(i)  -> bool              als ausgefallen markiert
//   off(i)      -> bool              "Heute nicht": gestrichen, wird weder nachgeholt noch umgeplant (optional)
//   rpe(i)      -> Zahl | undefined
//   checkin(i)  -> {sleep,sore,energy,pain} mit "g"|"y"|"r" | undefined
//   strava(i)   -> {match: bool} | undefined
//   moved       -> [{from, to, act}]  Strava-Aktivität passt zu einer Einheit an einem anderen Tag
//   dismissed   -> {id: 1}
//   sore(i)     -> {muskel: 1–10}     wirksamer Muskelkater (optional, aus dem Muskelkater-Melder)
//   extra(i)    -> [{id,type,min}]    Zusatz-Einheiten (optional) – zusätzliche Läufe zählen für die Überlastung
//   recovery(i) -> {level: "gut"|"mittel"|"schlecht"|null, why: [..]}  Garmin-Erholung (optional, src/garmin.js recoveryHint)
// }
import { impact, summarize, overloadText } from "./soreness.js";
import { overloadWithExtras } from "./extras.js";
// Vorschlag = {id, type: "swap"|"easy"|"alt", day, to?, title, why, extra?: true (durch Zusatz-Einheiten ausgelöst)}

export const CHECKIN_FIELDS = [
  ["sleep", "Schlaf"], ["sore", "Muskelkater"], ["energy", "Energie"], ["pain", "Schmerzen"]
];
const PTS = { g: 0, y: 1, r: 2 };
const HARD = ["kraft", "lauf", "station", "sim"];
const isHard = (p) => !!p && HARD.includes(p.k) && !p.inj;
const DOW_FRI = 4;

/** Ampel aus dem Check-in: "green" | "yellow" | "red" | null (unvollständig). */
export function readiness(c) {
  if (!c) return null;
  const vals = CHECKIN_FIELDS.map(([k]) => c[k]);
  if (vals.some((v) => !(v in PTS))) return null;
  const pts = vals.reduce((s, v) => s + PTS[v], 0), reds = vals.filter((v) => v === "r").length;
  if (c.pain === "r" || reds >= 2 || pts >= 6) return "red";
  if (reds >= 1 || pts >= 3) return "yellow";
  return "green";
}

/** Ruhetage, die nicht verplant werden sollen (Freitag ist laut Coach fix). */
export const isFixedRest = (p, i) => !!p && p.k === "rest" && (/\bfix/i.test(p.n || "") || ((i % 7) + 7) % 7 === DOW_FRI);

const isDone = (ctx, i) => {
  const s = ctx.status(i), st = ctx.strava && ctx.strava(i);
  return (s.n > 0 && s.done > 0) || ctx.rpe(i) != null || !!(st && st.match);
};

/** Wäre die Einheit von `from` an Tag `to` direkt neben einer anderen harten Einheit? */
function hardNeighbour(ctx, from, to) {
  const after = (x) => (x === to ? ctx.plan(from) : x === from ? ctx.plan(to) : ctx.plan(x));
  return isHard(after(to - 1)) || isHard(after(to + 1));
}

/** Nächster freier, nicht fixer Ruhetag ab `start` (bis `end`), möglichst ohne hart-auf-hart. */
export function findSlot(ctx, from, start, end, taken = new Set()) {
  let fallback = null;
  for (let x = Math.max(start, 0); x <= Math.min(end, ctx.last); x++) {
    const p = ctx.plan(x);
    if (!p || p.k !== "rest" || p.inj || isFixedRest(p, x) || taken.has(x)) continue;
    if (!hardNeighbour(ctx, from, x)) return x;
    if (fallback == null) fallback = x;
  }
  return fallback;
}

/** Nächste harte, noch nicht entlastete Einheit ab Tag `start` (max. 4 Tage voraus). */
function nextHard(ctx, start) {
  for (let x = Math.max(0, start); x <= Math.min(ctx.last, start + 4); x++) {
    const p = ctx.plan(x);
    if (isHard(p) && !p.easy && !p.back && !isDone(ctx, x)) return x;
  }
  return null;
}

export function suggest(ctx) {
  const out = [], taken = new Set(), eased = new Set();
  const T = ctx.today;
  const add = (s) => { if (!(ctx.dismissed || {})[s.id]) out.push(s); };
  if (T < 0 || T > ctx.last) return out;

  // 1) Tages-Check-in: rot/gelb -> heutige harte Einheit verschieben oder entlasten
  const today = ctx.plan(T), r = readiness(ctx.checkin(T));
  if (isHard(today) && !isDone(ctx, T) && (r === "red" || r === "yellow")) {
    const pain = ctx.checkin(T).pain === "r";
    if (r === "red" && pain) {
      add({ id: `alt:${T}`, type: "alt", day: T, title: "Heute Alternativtraining",
        why: "Check-in rot mit Schmerzen. Lockeres Bike + Mobility statt harter Einheit." });
    } else if (r === "red") {
      const slot = findSlot(ctx, T, T + 1, T + 3, taken);
      if (slot != null) {
        taken.add(slot);
        add({ id: `ready:${T}`, type: "swap", day: T, to: slot, title: `${today.t} verschieben`,
          why: "Check-in rot. Heute erholen, die Einheit auf den nächsten freien Tag legen." });
      } else {
        eased.add(T);
        add({ id: `easy:${T}`, type: "easy", day: T, title: `${today.t} entlasten`,
          why: "Check-in rot und kein freier Tag in Sicht. Volumen reduzieren, RPE max. 6." });
      }
    } else if (!today.easy) {
      eased.add(T);
      add({ id: `easy:${T}`, type: "easy", day: T, title: `${today.t} entlasten`,
        why: "Check-in gelb. Einheit machen, aber mit ca. 75 % Volumen und RPE max. 6." });
    }
  }

  // 1c) Garmin-Erholung schlecht (Readiness, HRV, Schlaf, Body Battery) -> heutige harte Einheit entlasten.
  //     Nur wenn der Check-in nicht schon reagiert hat; der eigene Check-in hat Vorrang vor der Uhr.
  const rec = ctx.recovery ? ctx.recovery(T) : null;
  if (rec && rec.level === "schlecht" && isHard(today) && !today.easy && !isDone(ctx, T) && !eased.has(T) && !taken.has(T) && !r) {
    eased.add(T);
    add({ id: `rec:${T}`, type: "easy", day: T, title: `${today.t} entlasten`,
      why: `Garmin meldet schlechte Erholung (${rec.why.join(", ")}). Ca. 75 % Volumen, RPE max. 6 – oder kurz einchecken, wenn du dich gut fühlst.` });
  }

  // 1a) Überlastung: Stelle seit 3+ Tagen über 6/10 oder Sehne zu oft hintereinander stossartig belastet
  //     -> bei anhaltendem Muskelkater verschieben (wenn ein freier Tag da ist), sonst entlasten.
  //     Vergangene Tage zählen nur, wenn trainiert wurde; kommende so, wie sie geplant sind.
  const happened = (d) => (d < 0 ? null : d < T ? (isDone(ctx, d) ? ctx.plan(d) : null) : ctx.plan(d));
  const extraAt = (d) => (ctx.extra ? ctx.extra(d) : []);
  for (const x of [T, T + 1]) {
    if (!ctx.sore || x > ctx.last || eased.has(x) || taken.has(x)) continue;
    const p = ctx.plan(x);
    if (!isHard(p) || p.easy || p.back || isDone(ctx, x)) continue;
    const { risk, byExtra, runs } = overloadWithExtras({ day: p, x, today: T, soreAt: ctx.sore, planAt: happened, extraAt });
    if (!risk.length) continue;
    const top = risk.slice(0, 2).map(overloadText).join("; ") + (byExtra && runs.length ? `. Mitverursacht durch Zusatz-Einheiten: ${runs.map((r) => r.label).join(", ")}` : "");
    const mark = byExtra ? { extra: true } : {};
    const slot = risk[0].kind === "sore" ? findSlot(ctx, x, x + 1, x + 3, taken) : null;
    if (slot != null) {
      taken.add(slot);
      add({ ...mark, id: `over:${x}`, type: "swap", day: x, to: slot, title: `Überlastung: ${p.t} verschieben`,
        why: `${top}. Die Stelle braucht Ruhe – Einheit auf einen freien Tag legen. Bei anhaltendem Schmerz ärztlich abklären.` });
    } else {
      eased.add(x);
      add({ ...mark, id: `over:${x}`, type: "easy", day: x, title: `Überlastung: ${p.t} entlasten`,
        why: `${top}. Sprünge, Lunges und Tempoläufe reduzieren oder durch Rad/Rudern ersetzen, ca. 75 % Volumen.` });
    }
  }

  // 1b) Muskelkater-Melder: harte Einheit heute/morgen trifft stark verkaterte Muskeln
  //     ab 8/10 verschieben (wenn ein freier Tag da ist), ab 5/10 entlasten
  for (const x of [T, T + 1]) {
    if (!ctx.sore || x > ctx.last || eased.has(x) || taken.has(x)) continue;
    const p = ctx.plan(x);
    if (!isHard(p) || p.easy || p.back || isDone(ctx, x)) continue;
    const hit = impact(p, ctx.sore(x));
    if (hit.level < 5) continue;
    const top = summarize(hit.muscles.filter((m) => m.level >= 5)).join(", ");
    const ex = hit.names.length ? ` Betrifft v. a. ${hit.names.slice(0, 3).join(", ")}.` : "";
    const when = x === T ? "Heute" : "Morgen";
    const slot = hit.level >= 8 ? findSlot(ctx, x, x + 1, x + 3, taken) : null;
    if (slot != null) {
      taken.add(slot);
      add({ id: `sore:${x}`, type: "swap", day: x, to: slot, title: `${p.t} verschieben`,
        why: `Starker Muskelkater: ${top}.${ex} ${when} erholen, die Einheit auf einen freien Tag legen.` });
    } else {
      eased.add(x);
      add({ id: `sore:${x}`, type: "easy", day: x, title: `${p.t} entlasten`,
        why: `Muskelkater: ${top}.${ex} Ca. 75 % Volumen, RPE max. 6, betroffene Übungen leichter.` });
    }
  }

  // 2) Strava: Einheit an einem anderen Tag gemacht -> Plan nachziehen
  for (const m of ctx.moved || []) {
    if (m.to > T || m.from < 0) continue;
    add({ id: `strava:${m.from}:${m.to}`, type: "swap", day: m.from, to: m.to,
      title: `Strava: ${m.act.label} am ${m.toLabel || "anderen Tag"}`,
      why: `Passt zur geplanten Einheit „${ctx.plan(m.from).t}“. Plan entsprechend tauschen?` });
    taken.add(m.from); taken.add(m.to);
  }

  // 3) Verpasste harte Einheiten der letzten 3 Tage nachholen
  for (let d = Math.max(0, T - 3); d < T; d++) {
    const p = ctx.plan(d);
    if (!isHard(p) || isDone(ctx, d) || taken.has(d)) continue;
    if (ctx.off && ctx.off(d)) continue; // "Heute nicht": bewusst gestrichen, nichts nachholen
    const slot = findSlot(ctx, d, T, T + 3, taken);
    if (slot == null) {
      if (ctx.skipped(d)) add({ id: `drop:${d}`, type: "info", day: d, title: `${p.t} nicht nachholen`,
        why: "Kein freier Tag ohne hart-auf-hart. Lieber auslassen und im Plan weitermachen." });
      continue;
    }
    taken.add(slot);
    add({ id: `miss:${d}`, type: "swap", day: d, to: slot, title: `${p.t} nachholen`,
      why: ctx.skipped(d) ? "Als ausgefallen markiert. Freier Tag gefunden." : "Nicht abgehakt. Auf einen freien Tag verschieben?" });
  }

  // 4) Ermüdung: hohe RPE-Werte oder mehrere schlechte Check-ins -> nächste harte Einheit entlasten
  const recent = [];
  for (let d = T - 1; d >= Math.max(0, T - 7); d--) if (ctx.rpe(d) != null) recent.push(+ctx.rpe(d));
  const veryHard = recent.filter((v) => v >= 9).length;
  const last3 = recent.slice(0, 3), mean3 = last3.length === 3 ? last3.reduce((a, b) => a + b, 0) / 3 : 0;
  let bad = 0;
  for (let d = T; d >= Math.max(0, T - 3); d--) { const rr = readiness(ctx.checkin(d)); if (rr === "yellow" || rr === "red") bad++; }
  const why = veryHard >= 2 ? `${veryHard}× RPE 9+ in den letzten 7 Tagen.`
    : mean3 >= 8.5 ? `Ø RPE ${mean3.toFixed(1)} über die letzten 3 Einheiten.`
    : bad >= 3 ? `${bad} gelbe/rote Check-ins in den letzten 4 Tagen.` : "";
  if (why) {
    const x = nextHard(ctx, T);
    if (x != null && !eased.has(x) && !taken.has(x)) {
      add({ id: `load:${x}`, type: "easy", day: x, title: `${ctx.plan(x).t} entlasten`,
        why: why + " Nächste harte Einheit mit ca. 75 % Volumen, RPE max. 6." });
    }
  }
  return out;
}
