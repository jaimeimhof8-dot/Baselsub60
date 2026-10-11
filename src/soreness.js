// Muskelkater-Melder: Muskeln und Gelenke in vier Bereichen (Beine, Gelenke & Sehnen, Oberkörper, Rumpf),
// Abklingen über die Tage und welche Übung welche Stellen belastet. Reine Funktionen, ohne DOM.
// Gespeicherte Form: S.sore = {tagIndex: {zone: stärke 1–10}}, Zone z. B. "quads", "achilles".
// Ältere Meldungen der früheren Körperkarte ("chest.upper.l", "hips.add", "quads") werden umgedeutet.

export const MIN = 1, MAX = 10;

/** Bereiche und ihre Einträge in der Reihenfolge der Anzeige: [id, Bereich, [[zone, Label], …]] */
export const SECTIONS = [
  ["legs", "Beine & Unterkörper", [
    ["quads", "Quadrizeps"], ["hams", "Hamstrings"], ["calves", "Waden"],
    ["shins", "Schienbeinkante / Tibialis Anterior"], ["glutes", "Gesäss (Gluteus)"], ["adductors", "Adduktoren / Abduktoren"],
  ]],
  ["joints", "Gelenke & Sehnen", [
    ["knee", "Patellasehne / Knie"], ["achilles", "Achillessehne"], ["hipflexor", "Hüftbeuger / Leiste"], ["plantar", "Plantarfaszie (Fusssohle)"],
  ]],
  ["upper", "Oberkörper & Griffkraft", [
    ["forearms", "Unterarme & Griffkraft"], ["upback", "Oberer Rücken & Lats"], ["lowback", "Unterer Rücken"],
    ["shoulders", "Schultern"], ["chest", "Brust"], ["arms", "Bizeps / Trizeps"],
  ]],
  ["core", "Rumpf / Core", [
    ["abs", "Gerade Bauchmuskeln"], ["obliques", "Schräge Bauchmuskeln (Obliques)"],
  ]],
];
export const ZONES = SECTIONS.flatMap(([sec, , zs]) => zs.map(([id, label]) => ({ id, section: sec, label })));
export const ZONE = Object.fromEntries(ZONES.map((z) => [z.id, z]));
export const LABEL = Object.fromEntries(ZONES.map((z) => [z.id, z.label]));
export const zonesOf = (section) => ZONES.filter((z) => z.section === section);

/* Frühere Zonen der Körperkarte → neue Einträge (erster Treffer zählt, spezifisch vor allgemein) */
const LEGACY = [
  ["hips.add", ["adductors"]], ["hips.flexor", ["hipflexor"]], ["hips", ["hipflexor", "adductors"]],
  ["core.obl", ["obliques"]], ["core.", ["abs"]], ["core", ["abs", "obliques"]],
  ["back", ["upback"]], ["traps", ["upback"]], ["biceps", ["arms"]], ["triceps", ["arms"]],
];
const LEGACY_SAME = ["quads", "hams", "calves", "shins", "glutes", "forearms", "lowback", "shoulders", "chest"];
/** Gespeicherte Zone (neu oder alt) → aktuelle Zonen. */
export function expand(id) {
  if (ZONE[id]) return [id];
  const g = String(id).split(".")[0];
  for (const [p, zs] of LEGACY) if (id === p || id.startsWith(p.endsWith(".") ? p : p + ".")) return zs;
  return LEGACY_SAME.includes(g) ? [g] : [];
}

/* ---------- Werte ---------- */
/** Wie stark wirkt eine Meldung nach n Tagen noch? Muskelkater klingt meist in 2–3 Tagen ab. */
const DECAY = [1, 0.7, 0.4];

/**
 * Wirksamer Muskelkater an Tag x aus allen Meldungen (höchster Wert je Zone, abgeklungen).
 * @returns {Record<string, number>} {zone: 1–10}
 */
export function effective(reports, x) {
  const out = {};
  for (let n = 0; n < DECAY.length; n++) {
    const r = reports && reports[x - n]; if (!r) continue;
    for (const [id, v] of Object.entries(r)) {
      const lv = Math.round(Math.min(MAX, +v || 0) * DECAY[n]);
      if (lv < MIN) continue;
      for (const z of expand(id)) if (lv > (out[z] || 0)) out[z] = lv;
    }
  }
  return out;
}
/** Höchster Wert je Bereich. */
export function sectionLevels(levels) {
  const out = {};
  for (const [id, v] of Object.entries(levels || {})) { const s = (ZONE[id] || {}).section; if (s && v > (out[s] || 0)) out[s] = v; }
  return out;
}

/** Bereiche, die aufgeklappt starten: alle mit Meldungen, sonst nur der erste (Beine). */
export function openSections(levels) {
  const s = Object.keys(sectionLevels(levels));
  return s.length ? SECTIONS.map(([id]) => id).filter((id) => s.includes(id)) : [SECTIONS[0][0]];
}

/** Ampel für den Check-in ("Muskelkater"): ab 7 rot, ab 4 gelb, sonst grün. null = nichts gemeldet. */
export function checkinLevel(levels) {
  const vals = Object.values(levels || {}); if (!vals.length) return null;
  const top = Math.max(...vals);
  return top >= 7 ? "r" : top >= 4 ? "y" : "g";
}
export const strength = (v) => (!v ? "keine" : v >= 7 ? "stark" : v >= 4 ? "mittel" : "leicht");

/* ---------- Belastung ---------- */
const EX = [
  [/back squat|front squat|kniebeuge/i, ["quads", "glutes", "adductors", "knee", "lowback", "abs"]],
  [/bulgarian|split squat|lunge|ausfallschritt/i, ["quads", "glutes", "hipflexor", "adductors", "knee"]],
  [/deadlift|kreuzheben|good morning/i, ["hams", "glutes", "lowback", "upback", "forearms"]],
  [/box ?jump|kastensprung/i, ["quads", "glutes", "calves", "knee", "achilles"]],
  [/bench|bankdr/i, ["chest", "shoulders", "arms"]],
  [/incline|schrägbank/i, ["chest", "shoulders", "arms"]],
  [/push-?up|liegestütz|dip/i, ["chest", "arms", "shoulders"]],
  [/shoulder press|overhead|schulterdr/i, ["shoulders", "arms", "upback"]],
  [/pull-?up|klimmzug|lat/i, ["upback", "arms", "forearms", "shoulders"]],
  [/row\b|rudern|rowerg/i, ["upback", "arms", "forearms", "lowback", "hams", "quads"]],
  [/plank|core|sit-?up|crunch/i, ["abs", "obliques"]],
  [/sled push|schlitten.*schieb/i, ["quads", "glutes", "calves", "achilles", "knee", "shoulders", "arms", "chest"]],
  [/sled pull|schlitten.*zieh/i, ["upback", "arms", "forearms", "hams", "glutes", "lowback"]],
  [/skierg|\bski\b/i, ["upback", "arms", "abs", "shoulders"]],
  [/farmer|carry|tragen/i, ["forearms", "upback", "obliques", "glutes"]],
  [/burpee/i, ["chest", "quads", "shoulders", "arms", "abs", "plantar"]],
  [/sandbag/i, ["quads", "glutes", "upback", "abs", "adductors", "knee"]],
  [/wall ?ball|thruster/i, ["quads", "glutes", "shoulders", "arms", "knee"]],
];
const RUN = ["calves", "hams", "quads", "hipflexor", "shins", "glutes", "achilles", "plantar", "knee"];
const KIND = {
  lauf: RUN, bike: ["quads", "glutes", "calves", "knee"],
  station: ["quads", "glutes", "upback", "shoulders", "forearms", "abs"],
  sim: [...RUN, "upback", "shoulders", "forearms", "abs", "chest"], race: [...RUN, "upback", "shoulders", "forearms", "abs", "chest"],
};

/** Belastete Zonen einer Übungszeile. */
export function exercisePatterns(text) {
  const out = new Set();
  for (const [re, zs] of EX) if (re.test(text)) zs.forEach((z) => out.add(z));
  // "run" nur als Wort ("Run 1–4", "Compromised Running"), nicht in "Runden"
  if (/lauf|\brun(?:ning)?\b|\d+\s?km|\bkm\b/i.test(text) && !/einlaufen|auslaufen/i.test(text)) RUN.forEach((z) => out.add(z));
  return [...out];
}
/** Belastete Zonen einer Einheit: Art der Einheit + alle Übungen. */
export function loadOf(day) {
  if (!day || day.k === "rest" || day.inj) return [];
  const out = new Set(KIND[day.k] || []);
  for (const t of day.i || []) exercisePatterns(t).forEach((z) => out.add(z));
  return [...out];
}

/**
 * Wie stark trifft der Muskelkater eine Einheit?
 * {level, muscles:[{id,label,level}] (betroffene Zonen, stärkste zuerst), exercises, names}
 */
export function impact(day, levels) {
  const load = new Set(loadOf(day));
  const muscles = Object.entries(levels || {}).filter(([id, v]) => v >= MIN && load.has(id))
    .map(([id, level]) => ({ id, label: LABEL[id] || id, level })).sort((a, b) => b.level - a.level);
  const sore = muscles.filter((m) => m.level >= 4).map((m) => m.id);
  const exercises = (day && day.i || []).filter((t) => exercisePatterns(t).some((z) => sore.includes(z)));
  // Name ohne Satz-/RPE-Angaben; Zeilen, die mit einer Zahl beginnen („4×1km zusammen, …“), bis zum ersten Komma
  const nameOf = (t) => { const n = t.split(/\s\d|\s@|,|\sRPE\b/i)[0].trim(); return n.length >= 3 && !/^\d/.test(n) ? n : t.split(",")[0].trim(); };
  const names = [...new Set(exercises.map(nameOf))];
  return { level: muscles.length ? muscles[0].level : 0, muscles, exercises, names };
}
/** Betroffene Zonen kurz zusammenfassen: "Quadrizeps 7/10". */
export const summarize = (muscles, n = 3) => [...muscles].sort((a, b) => b.level - a.level).slice(0, n).map((m) => `${m.label} ${m.level}/10`);

/* ---------- Überlastung: anhaltender Muskelkater und wiederholte Sehnenbelastung ---------- */
export const HIGH = 7; // "über 6/10"
/**
 * Wie viele Tage in Folge (bis einschliesslich Tag x) lag eine Stelle über 6/10?
 * soreAt(d) → wirksamer Muskelkater an Tag d ({zone: 1–10}).
 * @returns {Record<string, number>} {zone: tage} – nur Stellen, die an Tag x über 6 liegen
 */
export function soreStreaks(soreAt, x, min = HIGH) {
  const out = {};
  for (const z of Object.keys(soreAt(x) || {})) {
    let n = 0; while (n < 14 && ((soreAt(x - n) || {})[z] || 0) >= min) n++;
    if (n) out[z] = n;
  }
  return out;
}

export const TENDONS = ["knee", "achilles", "shins", "plantar"];
// Stossartige Belastung (Laufen, Sprünge, Lunges, Squats, Sled Push, Wall Balls) – Rad und Rudern zählen nicht
const IMPACT = /box ?jump|kastensprung|burpee|lunge|ausfallschritt|sled push|wall ?ball|squat|kniebeuge|thruster/i;
/** Sehnen/Gelenke, die eine Einheit stossartig belastet. */
export function tendonLoad(day) {
  if (!day || day.k === "rest" || day.inj || day.k === "bike") return [];
  const out = new Set(["lauf", "sim", "race"].includes(day.k) ? RUN : []);
  for (const t of day.i || []) if (IMPACT.test(t) || /lauf|\brun(?:ning)?\b|\d+\s?km/i.test(t)) exercisePatterns(t).forEach((z) => out.add(z));
  return TENDONS.filter((z) => out.has(z));
}

/**
 * Überlastungsrisiko einer Einheit an Tag x.
 * - "sore": eine Stelle, die die Einheit belastet, liegt seit 3+ Tagen (bis heute) über 6/10
 * - "load": eine Sehne wäre am 3. Tag in Folge bzw. zum 5. Mal in 7 Tagen stossartig belastet
 * soreAt(d) → wirksamer Muskelkater, planAt(d) → Einheit, die an Tag d stattfand/stattfindet (null = keine)
 * @returns {{id,label,kind:"sore"|"load",days,level}[]} stärkstes Risiko zuerst
 */
export function overloadRisk(day, x, today, soreAt, planAt) {
  if (!day || day.k === "rest" || day.inj) return [];
  const out = [], load = new Set(loadOf(day)), streaks = soreStreaks(soreAt, today);
  for (const [z, n] of Object.entries(streaks))
    if (n >= 3 && load.has(z)) out.push({ id: z, label: LABEL[z], kind: "sore", days: n, level: soreAt(today)[z] });
  for (const z of tendonLoad(day)) {
    if (out.some((o) => o.id === z)) continue;
    let streak = 0; while (streak < 7 && tendonLoad(planAt(x - 1 - streak)).includes(z)) streak++;
    let week = 0; for (let d = x - 7; d < x; d++) if (tendonLoad(planAt(d)).includes(z)) week++;
    if (streak >= 2 || week >= 5) out.push({ id: z, label: LABEL[z], kind: "load", days: streak >= 2 ? streak + 1 : week, week: streak < 2 });
  }
  return out.sort((a, b) => (a.kind === b.kind ? b.days - a.days : a.kind === "sore" ? -1 : 1));
}
/** Kurztext für eine Überlastung, z. B. "Patellasehne / Knie seit 3 Tagen über 6/10". */
export const overloadText = (o) => o.kind === "sore" ? `${o.label} seit ${o.days} Tagen über 6/10 (aktuell ${o.level}/10)`
  : o.week ? `${o.label} ${o.days}× in 7 Tagen stossartig belastet` : `${o.label} am ${o.days}. Tag in Folge belastet`;
