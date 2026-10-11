// Wandelt den Text eines Trainingsplan-PDFs in Tageseinheiten um: {days: {idx: day}, meta}.
// Erwartete Struktur (wie im Coach-PDF): "Block X – Name (dd.mm. – dd.mm.yyyy)", optional
// "Woche N – Name (dd.mm. – dd.mm.)", darunter Absätze "Montag – Titel. Text…", "Samstag. Text…",
// "Wochenende. Text…". In Blöcken ohne Wochen-Überschrift beschreibt ein Absatz alle 4 Wochen,
// mit "Woche 1: …", "In Woche 2 …", "Wochen 3 und 4 …" als Abschnittsmarken.
import { idxFromDayMonth } from "./dates.js";
import { isHard } from "./util.js";
import { structureSession, structureKraft, patternSentences } from "./structure.js";
import { noChest, noChestDay } from "./exercises.js";

const WD = { montag: 0, dienstag: 1, mittwoch: 2, donnerstag: 3, freitag: 4, samstag: 5, sonntag: 6, wochenende: 5 };
const NUM = { zwei: 2, drei: 3, vier: 4, "fünf": 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, "zwölf": 12, "fünfzehn": 15, zwanzig: 20, dreissig: 30, "dreißig": 30 };
const NUM_ANY = { ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, einzelnen: 1, ...NUM };
const EXERCISES = [
  ["Back Squat", /Back Squats?/], ["Bulgarian Split Squat", /Bulgarian Split Squats?/], ["Bench Press", /Bench Press/],
  ["Shoulder Press", /Shoulder Press/], ["Pull-ups", /Pull-ups?/], ["Plank", /Plank/], ["Box Jumps", /Box Jumps?|Kastensprünge/]
];

const RE_BLOCK = /^Block ([A-Z]) [–-] (.+?) \((\d{1,2})\.(\d{1,2})\.(\d{4})? [–-] (\d{1,2})\.(\d{1,2})\.(\d{4})?/;
const RE_TAPER = /^Taper \((\d{1,2})\.(\d{1,2})\.(\d{4})? [–-] (\d{1,2})\.(\d{1,2})\.(\d{4})?/;
const RE_WEEK = /^Woche (\d+) [–-] (.+?) \((\d{1,2})\.(\d{1,2})\.(\d{4})? [–-] (\d{1,2})\.(\d{1,2})\.(\d{4})?\)/;
const RE_DAY = /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Wochenende)\b\s*(?:[–-]\s*|\.\s*|:\s*)/;
const RE_RACE = /^(\d{1,2})\.(\d{1,2})\.(\d{4}) [–-] (HYROX .+)$/;
const RE_STOP = /^(Monitoring|Wichtigste Annahmen|Quellen|Meine Annahmen)\b/;
const RE_WEEK_MARK = /\b(?:In )?(?:den )?(Wochen?) (\d)(?:(?:\s*(und|bis|,)\s*)(\d))?(?![-\d])/g;

const isHeading = (l) => RE_BLOCK.test(l) || RE_TAPER.test(l) || RE_WEEK.test(l) || RE_DAY.test(l) || RE_RACE.test(l) || RE_STOP.test(l) || /^Block [A-Z] [–-]/.test(l) || /^Taper \(/.test(l);

/** Zeilen zu Absätzen zusammensetzen; eine Überschrift beginnt jeweils einen neuen Absatz. */
export function toUnits(text) {
  const units = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const l = raw.replace(/\s+/g, " ").trim();
    if (!l) continue;
    if (isHeading(l) || !units.length) { units.push(l); continue; }
    const prev = units[units.length - 1];
    units[units.length - 1] = /[A-Za-zÄÖÜäöü]-$/.test(prev) ? prev + l : prev + " " + l;
  }
  return units;
}

export const sentences = (s) => String(s).split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])/).map((x) => x.trim()).filter(Boolean);
export const numWord = (w) => { if (w == null) return null; if (/^\d+$/.test(w)) return +w; return NUM_ANY[String(w).toLowerCase()] ?? null; };
/** Zahlwörter vor Einheiten in Ziffern umwandeln ("vier Wiederholungen à sechs Minuten" -> "4 Wiederholungen à 6 Minuten"). */
export const digits = (s) => String(s).replace(/\b(zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|fünfzehn|zwanzig)\b(?=\s+\S)/gi, (m) => String(NUM[m.toLowerCase()]));

function range(a, b) { return b != null ? `${a}–${b}` : `${a}`; }

/** Sätze×Wiederholungen, Prozent und RPE aus einem Textstück einer Übung lesen. */
function exerciseDetail(txt) {
  const out = {};
  const sets = txt.match(/(\S+) Sätzen?(?: \S+)? à (\S+)(?: beziehungsweise (\S+))? (Wiederholungen|Sekunden)/);
  if (sets) {
    out.sets = numWord(sets[1]); out.reps = numWord(sets[2]); out.reps2 = numWord(sets[3]); out.sec = sets[4] === "Sekunden";
  }
  const pct = txt.match(/(\d{2,3})(?: bis (\d{2,3}))? ?%/);
  if (pct) out.pct = range(pct[1], pct[2]);
  const rpe = txt.match(/RPE (\d+)(?: bis (\d+))?/);
  if (rpe) out.rpe = range(rpe[1], rpe[2]);
  if (/pro Seite/.test(txt)) out.side = true;
  return out;
}

function exerciseLine(name, d) {
  let s = name;
  if (d.sets && d.reps) s += ` ${d.sets}×${d.reps}${d.sec ? "″" : ""}`;
  if (d.side) s += " je Seite";
  if (d.pct) s += ` @${d.pct}%`;
  if (d.rpe) s += ` RPE ${d.rpe}`;
  return s;
}

/** Kraft-Absatz in Übungszeilen zerlegen. Gibt null zurück, wenn zu wenig Struktur erkennbar ist. */
export function parseExercises(body) {
  const hits = [];
  for (const [name, re] of EXERCISES) {
    const m = re.exec(body);
    if (m) hits.push({ name, at: m.index });
  }
  if (hits.length < 2) return null;
  hits.sort((a, b) => a.at - b.at);
  const preamble = body.slice(0, hits[0].at);
  const segs = hits.map((h, j) => body.slice(h.at, j + 1 < hits.length ? hits[j + 1].at : body.length));
  // Angaben können vor dem Namen stehen ("drei Sätze Plank à 50 Sekunden"): darum das Ende des
  // vorherigen Stücks ab dem letzten Komma/Punkt mit einbeziehen.
  const details = segs.map((seg, j) => {
    let tail = "";
    if (j === 0) tail = preamble.slice(-120);
    else {
      const prev = segs[j - 1], cut = Math.max(prev.lastIndexOf(","), prev.lastIndexOf("."));
      if (cut >= 0) tail = prev.slice(cut + 1);
    }
    return exerciseDetail(tail + seg);
  });
  // "…und Shoulder Press …, beide ebenfalls bei RPE 7": RPE nach vorne übernehmen.
  for (let j = 0; j < segs.length - 1; j++) {
    if (!details[j].rpe && details[j + 1].rpe && /\bbeide\b/.test(segs[j + 1])) details[j].rpe = details[j + 1].rpe;
  }
  // Kurze Segmente ("Bench Press und ") übernehmen die Angaben der folgenden Übung (gemeinsame Aussage).
  for (let j = segs.length - 2; j >= 0; j--) {
    if (!details[j].sets && segs[j].length - hits[j].name.length < 12 && details[j + 1].sets) {
      const n = details[j + 1];
      details[j] = { ...n, reps: n.reps, reps2: undefined };
      if (n.reps2) details[j + 1] = { ...n, reps: n.reps2, reps2: undefined };
      if (!details[j].side && /pro Seite/.test(segs[j])) details[j].side = true;
    }
  }
  if (details.filter((d) => d.sets).length < Math.ceil(hits.length / 2)) return null;
  const notes = sentences(body).filter((s) => !EXERCISES.some(([, re]) => re.test(s)) && !/Sätz/.test(s));
  return { items: hits.map((h, j) => exerciseLine(h.name, details[j])), note: notes.join(" ") };
}

function kindOf(title, body, wd) {
  const t = (title || "").toLowerCase(), b = (body || "").toLowerCase();
  if (/kraft 1/.test(t)) return "kraft";
  if (/kraft 2|station|renn-szenario|technik/.test(t)) return "station";
  if (/simulation|transition|drilling/.test(t)) return "sim";
  if (/lauf|intervall|schwelle|brick|scharf|schneller/.test(t)) return "lauf";
  if (/zone 2|rad\b/.test(t)) return "bike";
  if (/^rest\b|ruhe|erholung/.test(t)) return "rest";
  if (/simulation|transition drilling/.test(b)) return "sim";
  if (/check-in|rückblick/.test(b) && wd >= 5) return "rest";
  if (/\brad\b|fahrt|zone-2-rad/.test(b) && !/kein rad\b|kein zweiter bike/.test(b)) return "bike";
  if (/erholung|ruhetag|\brest\b/.test(b)) return "rest";
  return ["kraft", "lauf", "bike", "station", "rest", "bike", "rest"][wd];
}

function titleFor(kind, rawTitle, body) {
  if (rawTitle) {
    let t = rawTitle.split(/,\s*/).filter((p) => !/^(gemeinsam|mit Jimoh)/i.test(p)).join(", ")
      .replace(/\s+(gemeinsam )?mit Jimoh$/i, "").trim();
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (/^Kraft 2/.test(t) && /Compromised/i.test(rawTitle + body)) t = "Kraft 2 + Compromised Running";
    if (/^Rest$/i.test(t)) t = "Ruhetag";
    return t;
  }
  if (kind === "sim") return /Simulation/.test(body) ? "Doubles-Simulation" : "Doubles Transition Drilling";
  if (kind === "bike") return /lange|75 bis 90|75–90/.test(body) ? "Lange Fahrt Zone 2" : "Zone 2 Bike";
  if (kind === "rest") return /Check-in|Rückblick/.test(body) ? "Check-in + Rückblick" : "Ruhetag";
  return { kraft: "Kraft 1", lauf: "Lauf", station: "Kraft 2" }[kind] || "Einheit";
}

/** "Titel. Text" trennen – der Titel ist der erste kurze Satz direkt nach dem Wochentag. */
function splitTitle(rest, sep) {
  if (/^\./.test(sep)) return { title: "", body: rest };
  const m = rest.match(/^(.{2,110}?)\.(?:\s+|$)(.*)$/);
  if (!m) return { title: rest, body: "" };
  return { title: m[1], body: m[2] };
}

export function makeDay(wd, rawTitle, body, extra = {}) {
  const kind = kindOf(rawTitle, body, wd);
  const day = { t: titleFor(kind, rawTitle, body), k: kind, i: [], n: "" };
  if (kind === "rest") {
    // Check-in-Tag: eine abhakbare Zeile, die Erklärung als Hinweis
    const ci = /Check-in|Rückblick/.test(body);
    day.i = ci ? [/Rückblick/.test(body) ? "Ampelsystem-Check-in + Rückblick" : "Ampelsystem-Check-in"] : [];
    day.n = ci ? sentences(digits(body)).join(" ") : (sentences(body)[0] || "Echte Erholung.");
  } else if (kind === "kraft" && !/\d×\d/.test(body) && (parseExercises(body) || structureKraft(body, extra.common || "", extra.prev, extra.block))) {
    const ex = parseExercises(body) || structureKraft(body, extra.common || "", extra.prev, extra.block);
    day.i = ex.items; day.n = ex.note;
  } else {
    // Lauf, Rad, Stationen, Doubles und Kraft in Kurzschreibweise ("Back Squat 4×5 RPE 7."):
    // Zeilen mit Zahlen abhakbar, Erklärungen als Hinweis.
    // Im Block-Absatz ist der Wochentext die Aufgabe selbst – dort zählt auch der erste Satz ohne Zahl.
    const st = structureSession(body, { tasks: !!extra.block });
    day.i = st.items.length ? st.items : [day.t]; day.n = st.note;
    // Intervalle wie in Block A mit Ein- und Auslaufen
    if (extra.block && kind === "lauf" && day.i.some((x) => /\d×\d/.test(x)) && !/Einlaufen/.test(body)) day.i = ["15′ Einlaufen", ...day.i, "10′ Auslaufen"];
  }
  delete extra.common; delete extra.prev; delete extra.block;
  day.key = isHard(day);
  day.joint = /gemeinsam|mit Jimoh|ihr\b|Doubles/i.test((rawTitle || "") + " " + body) || ["sim", "race"].includes(kind);
  day.src = "pdf";
  // Kein Brusttraining: Bankdrücken & Co. werden zu Push Press
  return Object.assign(noChestDay(day), extra);
}

/** Absatz eines Blocks nach Wochenmarken ("Woche 1:", "Wochen 3 und 4") in Woche 1–4 aufteilen. */
export function splitByWeeks(body, nWeeks = 4) {
  const marks = [];
  RE_WEEK_MARK.lastIndex = 0;
  let m;
  while ((m = RE_WEEK_MARK.exec(body))) {
    const a = +m[2], b = m[4] != null ? +m[4] : null;
    if (a < 1 || a > nWeeks) continue;
    let weeks = [a];
    if (b != null) weeks = m[3] === "bis" ? Array.from({ length: b - a + 1 }, (_, k) => a + k) : [a, b];
    marks.push({ at: m.index, weeks });
  }
  const result = Array.from({ length: nWeeks }, () => "");
  if (!marks.length) return { weeks: result.map(() => body.trim()), common: "" };
  const common = body.slice(0, marks[0].at).trim();
  marks.forEach((mk, j) => {
    const seg = body.slice(mk.at, j + 1 < marks.length ? marks[j + 1].at : body.length).trim();
    for (const w of mk.weeks) result[w - 1] = (result[w - 1] ? result[w - 1] + " " : "") + seg;
  });
  return { weeks: result.map((seg) => (seg || common).trim()), common };
}

/**
 * "…bei gleichbleibendem Volumen": Kraftübungen ohne Sätze×Wdh übernehmen sie von derselben
 * Übung eine Woche vorher.
 */
function inheritVolume(days) {
  const vol = /\s(\d+×\d+″?)/;
  for (const k of Object.keys(days).map(Number).sort((a, b) => a - b)) {
    const d = days[k], prev = days[k - 7];
    if (d.k !== "kraft" || d.blk || !prev || prev.k !== "kraft") continue;
    d.i = d.i.map((line) => {
      if (vol.test(line)) return line;
      const name = EXERCISES.find(([n]) => line.startsWith(n));
      const old = name && prev.i.find((x) => x.startsWith(name[0]) && vol.test(x));
      return old ? line.replace(name[0], name[0] + " " + old.match(vol)[1]) : line;
    });
  }
}

/** Haupteinstieg: Text -> {days, meta}. */
export function parsePlanText(text) {
  const days = {};
  const meta = { blocks: [], weeks: [], warnings: [], race: null };
  let ctx = null; // {type:'block'|'week', start, weeks, block}
  const blockDays = []; // gesammelte Absätze eines Blocks ohne Wochen-Überschrift

  const flushBlock = () => {
    if (!ctx || ctx.type !== "block" || !blockDays.length) { blockDays.length = 0; return; }
    inheritVolume(days); // Vorblock vervollständigen, damit "gleiches Wellenmuster" Sätze×Wdh findet
    const hasSunday = blockDays.some((d) => d.wd === 6);
    for (const d of blockDays) {
      // Sätze über mehrere Wochen ("…in Woche 1 und 2, Spitze in Woche 3…") gelten für alle Wochen
      const { pattern, body } = patternSentences(d.body);
      const { weeks, common } = splitByWeeks(body, ctx.weeks);
      const shared = [common, pattern].filter(Boolean).join(" ");
      for (let w = 0; w < ctx.weeks; w++) {
        const idx = ctx.start + w * 7 + d.wd;
        // "im gleichen Wellenmuster": dieselbe Übung aus der gleichen Woche des Vorblocks
        const prev = (name) => { for (let x = idx - 28; x >= 0; x -= 28) { const p = days[x]; const hit = p && p.k === "kraft" && p.i.find((l) => l.startsWith(noChest(name))); if (hit) return hit; } return null; };
        const own = weeks[w] && weeks[w] !== common ? weeks[w] : "";
        const day = makeDay(d.wd, d.title, own || body, { common: own ? shared : pattern, prev, block: d.body });
        day.blk = 1; // Block-Absatz: kein Volumen aus der Vorwoche erben (Zirkel und Taper haben bewusst keins)
        // Gemeinsamer Einleitungssatz eines Wochen-Absatzes ("Über die vier Wochen …") als Hinweis.
        if (shared && own && day.k !== "kraft") day.n = [common, day.n].filter(Boolean).join(" ");
        days[idx] = day;
      }
      if (d.weekend && !hasSunday) {
        for (let w = 0; w < ctx.weeks; w++) days[ctx.start + w * 7 + 6] = makeDay(6, "Rest", "Echte Erholung.");
      }
    }
    blockDays.length = 0;
  };

  for (const u of toUnits(text)) {
    let m;
    if (RE_STOP.test(u)) { flushBlock(); ctx = null; continue; }
    if ((m = u.match(RE_BLOCK))) {
      flushBlock();
      const start = idxFromDayMonth(+m[3], +m[4], m[5] ? +m[5] : undefined);
      const end = idxFromDayMonth(+m[6], +m[7], m[8] ? +m[8] : undefined);
      ctx = { type: "block", block: m[1], start, weeks: Math.max(1, Math.round((end - start + 1) / 7)) };
      meta.blocks.push({ id: m[1], name: m[2].trim(), start, end });
      continue;
    }
    if ((m = u.match(RE_TAPER))) {
      flushBlock();
      const start = idxFromDayMonth(+m[1], +m[2], m[3] ? +m[3] : undefined);
      const end = idxFromDayMonth(+m[4], +m[5], m[6] ? +m[6] : undefined);
      ctx = { type: "block", block: "T", start, weeks: 1 };
      meta.blocks.push({ id: "T", name: "Taper", start, end });
      continue;
    }
    if ((m = u.match(RE_WEEK))) {
      if (ctx && ctx.type === "block") blockDays.length = 0; // Block mit Wochen-Überschriften: keine Blockmuster
      const start = idxFromDayMonth(+m[3], +m[4], m[5] ? +m[5] : undefined);
      ctx = { type: "week", start, weeks: 1, block: ctx ? ctx.block : null };
      meta.weeks.push({ n: +m[1], name: m[2].trim(), start });
      continue;
    }
    if ((m = u.match(RE_RACE))) {
      flushBlock();
      const idx = idxFromDayMonth(+m[1], +m[2], +m[3]);
      days[idx] = { t: m[4].replace(/\.$/, "").replace(/, Doubles.*$/, "") + " – Rennen", k: "race", i: [m[4].replace(/\.$/, "")], n: "", key: true, joint: true, race: true, src: "pdf" };
      meta.race = idx;
      ctx = null;
      continue;
    }
    if ((m = u.match(RE_DAY)) && ctx) {
      const wdName = m[1].toLowerCase();
      const { title, body } = splitTitle(u.slice(m[0].length), m[0].slice(m[1].length).trim());
      const wd = WD[wdName];
      if (ctx.type === "week") days[ctx.start + wd] = makeDay(wd, title, body);
      else blockDays.push({ wd, title, body, weekend: wdName === "wochenende" });
      continue;
    }
    // sonst: Einleitungstext – ignorieren
  }
  flushBlock();
  inheritVolume(days);
  for (const d of Object.values(days)) delete d.blk;
  if (!Object.keys(days).length) meta.warnings.push("Keine Trainingstage erkannt. Erwartet werden Überschriften wie „Block A – … (12.10. – 08.11.2026)“ und Absätze wie „Montag – Kraft 1. …“.");
  return { days, meta };
}
