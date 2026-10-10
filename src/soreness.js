// Muskelkater-Melder: feine Muskelzonen (z. B. Brust oben/mitte/unten, links/rechts), Körperkarte (SVG),
// Abklingen über die Tage und welche Übung welche Zonen belastet. Reine Funktionen, ohne DOM.
// Gespeicherte Form: S.sore = {tagIndex: {zone: stärke 1–10}}, Zone = "gruppe.teil.seite" (z. B. "chest.upper.l").
// Ältere Meldungen mit reiner Gruppe ("quads") gelten für alle Zonen der Gruppe.

export const MIN = 1, MAX = 10;
export const GROUPS = {
  chest: "Brust", shoulders: "Schultern", biceps: "Bizeps", triceps: "Trizeps", forearms: "Unterarme",
  core: "Bauch / Rumpf", hips: "Hüfte / Adduktoren", quads: "Oberschenkel vorne", shins: "Schienbein",
  traps: "Nacken / Trapez", back: "Rücken", lowback: "Unterer Rücken", glutes: "Gesäss",
  hams: "Oberschenkel hinten", calves: "Waden",
};
const SIDE = { l: "links", r: "rechts", c: "" };

/* ---------- Körperkarte ----------
   viewBox 0 0 200 420, Körpermitte x = 100. Vorderansicht: die rechte Körperseite liegt links im Bild;
   Rückansicht: die linke Körperseite liegt links im Bild. Formen werden für die andere Seite gespiegelt. */
const ell = (cx, cy, rx, ry) => ({ t: "ellipse", cx, cy, rx, ry });
const rect = (x, y, w, h, r = 4) => ({ t: "rect", x, y, w, h, r });
const mirror = (s) => (s.t === "ellipse" ? { ...s, cx: 200 - s.cx } : { ...s, x: 200 - s.x - s.w });

// [gruppe, teil, label-teil, ansicht, form auf der linken Bildseite]
const DEF = [
  // vorne (linke Bildseite = rechte Körperseite)
  ["shoulders", "side", "seitlich", "front", ell(55, 100, 7, 14)],
  ["shoulders", "front", "vorne", "front", ell(67, 92, 11, 11)],
  ["chest", "upper", "oben", "front", rect(73, 85, 25, 12)],
  ["chest", "mid", "mitte", "front", rect(73, 98, 25, 12)],
  ["chest", "lower", "unten", "front", rect(73, 111, 25, 12)],
  ["biceps", "", "", "front", ell(54, 138, 9, 20)],
  ["forearms", "front", "innen", "front", ell(48, 186, 8, 22)],
  ["core", "upper", "oberer Bauch", "front", rect(86, 127, 13, 19)],
  ["core", "mid", "mittlerer Bauch", "front", rect(86, 147, 13, 19)],
  ["core", "lower", "unterer Bauch", "front", rect(86, 167, 13, 19)],
  ["core", "obl", "seitlich (Obliques)", "front", rect(73, 128, 11, 52, 5)],
  ["hips", "flexor", "Hüftbeuger", "front", ell(87, 199, 8, 8)],
  ["hips", "add", "Adduktoren", "front", ell(95, 236, 5, 19)],
  ["quads", "outer", "aussen", "front", ell(70, 250, 8, 30)],
  ["quads", "mid", "Mitte", "front", ell(82, 246, 7, 31)],
  ["quads", "inner", "innen (Knie)", "front", ell(89, 283, 6, 11)],
  ["shins", "", "", "front", ell(80, 352, 7, 32)],
  // hinten (linke Bildseite = linke Körperseite)
  ["traps", "upper", "oben", "back", ell(86, 80, 12, 7)],
  ["shoulders", "rear", "hinten", "back", ell(66, 94, 11, 11)],
  ["back", "upper", "oben (Rhomboiden)", "back", rect(76, 100, 13, 28, 5)],
  ["back", "lats", "Latissimus", "back", ell(78, 147, 10, 21)],
  ["triceps", "", "", "back", ell(54, 138, 9, 20)],
  ["forearms", "back", "aussen", "back", ell(48, 186, 8, 22)],
  ["lowback", "", "", "back", rect(88, 161, 11, 29, 4)],
  ["glutes", "upper", "oben", "back", ell(82, 200, 13, 8)],
  ["glutes", "lower", "unten", "back", ell(86, 219, 14, 12)],
  ["hams", "outer", "aussen", "back", ell(74, 267, 8, 30)],
  ["hams", "inner", "innen", "back", ell(89, 267, 7, 30)],
  ["calves", "outer", "aussen", "back", ell(74, 346, 7, 24)],
  ["calves", "inner", "innen", "back", ell(88, 346, 7, 24)],
];
const CENTER = [["traps", "mid", "Mitte", "back", rect(90, 88, 20, 26, 6)]];

const zoneLabel = (g, partLabel, side) => [GROUPS[g], partLabel, SIDE[side]].filter(Boolean).join(" ");
export const ZONES = [];
for (const [g, part, pl, view, shape] of DEF) {
  // Vorderansicht: linke Bildseite ist rechts am Körper
  const imgLeft = view === "front" ? "r" : "l", imgRight = imgLeft === "r" ? "l" : "r";
  for (const [side, s] of [[imgLeft, shape], [imgRight, mirror(shape)]])
    ZONES.push({ id: [g, part, side].filter(Boolean).join("."), group: g, side, view, shape: s, label: zoneLabel(g, pl, side) });
}
for (const [g, part, pl, view, shape] of CENTER) ZONES.push({ id: `${g}.${part}`, group: g, side: "c", view, shape, label: zoneLabel(g, pl, "c") });
export const ZONE = Object.fromEntries(ZONES.map((z) => [z.id, z]));
export const LABEL = Object.fromEntries([...ZONES.map((z) => [z.id, z.label]), ...Object.entries(GROUPS)]);
export const zonesOf = (group) => ZONES.filter((z) => z.group === group);
/** Zone auf der anderen Körperseite (oder null bei Zonen in der Mitte). */
export const mirrorZone = (id) => { const z = ZONE[id]; if (!z || z.side === "c") return null; return id.replace(/\.(l|r)$/, (m, s) => (s === "l" ? ".r" : ".l")); };

/** SVG-Element einer Zone (ohne schliessendes Tag-Ende), Attribute werden angehängt. */
export function shapeTag(z) {
  const s = z.shape;
  return s.t === "ellipse" ? ["ellipse", `cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}"`] : ["rect", `x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}"`];
}
/** Silhouette (nicht klickbar) als Orientierung hinter den Zonen. */
export const SILHOUETTE = [
  `<circle cx="100" cy="34" r="22"/>`, `<rect x="90" y="54" width="20" height="18" rx="4"/>`,
  `<rect x="62" y="74" width="76" height="128" rx="26"/>`, `<rect x="40" y="82" width="22" height="128" rx="11"/>`,
  `<rect x="138" y="82" width="22" height="128" rx="11"/>`, `<rect x="66" y="184" width="68" height="40" rx="16"/>`,
  `<rect x="64" y="210" width="34" height="180" rx="14"/>`, `<rect x="102" y="210" width="34" height="180" rx="14"/>`,
].join("");

/* ---------- Werte ---------- */
/** Wie stark wirkt eine Meldung nach n Tagen noch? Muskelkater klingt meist in 2–3 Tagen ab. */
const DECAY = [1, 0.7, 0.4];
const expand = (id) => (ZONE[id] ? [id] : GROUPS[id] ? zonesOf(id).map((z) => z.id) : []);

/**
 * Wirksamer Muskelkater an Tag x aus allen Meldungen (höchster Wert je Zone, abgeklungen).
 * @returns {Record<string, number>} {zone: 1–10}
 */
export function effective(reports, x) {
  const out = {};
  for (let n = 0; n < DECAY.length; n++) {
    const r = reports && reports[x - n]; if (!r) continue;
    for (const [id, v] of Object.entries(r)) {
      const lv = Math.round(Math.max(MIN, Math.min(MAX, +v || 0)) * DECAY[n]);
      if (lv < 1) continue;
      for (const z of expand(id)) if (lv > (out[z] || 0)) out[z] = lv;
    }
  }
  return out;
}
/** Höchster Wert je Muskelgruppe. */
export function groupLevels(levels) {
  const out = {};
  for (const [id, v] of Object.entries(levels || {})) { const g = (ZONE[id] || {}).group || (GROUPS[id] ? id : null); if (g && v > (out[g] || 0)) out[g] = v; }
  return out;
}

/** Ampel für den Check-in ("Muskelkater"): ab 7 rot, ab 4 gelb, sonst grün. null = nichts gemeldet. */
export function checkinLevel(levels) {
  const vals = Object.values(levels || {}); if (!vals.length) return null;
  const top = Math.max(...vals);
  return top >= 7 ? "r" : top >= 4 ? "y" : "g";
}
export const strength = (v) => (v >= 7 ? "stark" : v >= 4 ? "mittel" : "leicht");

/* ---------- Belastung ----------
   Muster: "chest" = alle Brust-Zonen, "chest.mid" = mittlere Brust beidseitig, "chest.mid.l" = genau eine Zone. */
const EX = [
  [/back squat|front squat|kniebeuge/i, ["quads", "glutes.lower", "hips.add", "lowback", "core.lower"]],
  [/bulgarian|split squat|lunge|ausfallschritt/i, ["quads", "glutes", "hips.flexor", "hips.add"]],
  [/deadlift|kreuzheben|good morning/i, ["hams", "glutes", "lowback", "back.upper", "forearms", "traps"]],
  [/box ?jump|kastensprung/i, ["quads", "glutes.lower", "calves"]],
  [/bench|bankdr/i, ["chest.mid", "chest.lower", "shoulders.front", "triceps"]],
  [/incline|schrägbank/i, ["chest.upper", "shoulders.front", "triceps"]],
  [/push-?up|liegestütz|dip/i, ["chest", "triceps", "shoulders.front"]],
  [/shoulder press|overhead|schulterdr/i, ["shoulders.front", "shoulders.side", "triceps", "chest.upper", "traps.upper"]],
  [/pull-?up|klimmzug|lat/i, ["back.lats", "back.upper", "biceps", "forearms", "shoulders.rear"]],
  [/row\b|rudern|rowerg/i, ["back", "biceps", "forearms", "shoulders.rear", "hams", "quads"]],
  [/plank|core|sit-?up|crunch/i, ["core"]],
  [/sled push|schlitten.*schieb/i, ["quads", "glutes.lower", "calves", "shoulders.front", "triceps", "chest.lower"]],
  [/sled pull|schlitten.*zieh/i, ["back", "biceps", "forearms", "hams", "glutes", "shoulders.rear"]],
  [/skierg|\bski\b/i, ["back.lats", "triceps", "core", "shoulders.rear"]],
  [/farmer|carry|tragen/i, ["forearms", "traps", "core.obl", "glutes.upper"]],
  [/burpee/i, ["chest", "quads", "shoulders.front", "triceps", "core"]],
  [/sandbag/i, ["quads", "glutes", "traps", "core", "hips.add"]],
  [/wall ?ball|thruster/i, ["quads", "glutes.lower", "shoulders.front", "shoulders.side", "triceps"]],
];
const RUN = ["calves", "hams", "quads", "hips.flexor", "shins", "glutes.upper"];
const KIND = {
  lauf: RUN, bike: ["quads", "glutes.lower", "calves"],
  station: ["quads", "glutes", "back", "shoulders", "forearms", "core"],
  sim: [...RUN, "back", "shoulders", "forearms", "core", "chest"], race: [...RUN, "back", "shoulders", "forearms", "core", "chest"],
};
const hits = (zone, pattern) => zone === pattern || zone.startsWith(pattern + ".");

/** Belastungsmuster einer Übungszeile. */
export function exercisePatterns(text) {
  const out = new Set();
  for (const [re, ps] of EX) if (re.test(text)) ps.forEach((p) => out.add(p));
  if (/lauf|run|\d+\s?km|\bkm\b/i.test(text) && !/einlaufen|auslaufen/i.test(text)) RUN.forEach((p) => out.add(p));
  return [...out];
}
/** Belastungsmuster einer Einheit: Art der Einheit + alle Übungen. */
export function loadOf(day) {
  if (!day || day.k === "rest" || day.inj) return [];
  const out = new Set(KIND[day.k] || []);
  for (const t of day.i || []) exercisePatterns(t).forEach((p) => out.add(p));
  return [...out];
}
/** Belastete Zonen einer Einheit. */
export const loadedZones = (day) => { const ps = loadOf(day); return ZONES.filter((z) => ps.some((p) => hits(z.id, p))).map((z) => z.id); };

/**
 * Wie stark trifft der Muskelkater eine Einheit?
 * {level, muscles:[{id,label,level}] (betroffene Zonen, stärkste zuerst), exercises, names}
 */
export function impact(day, levels) {
  const ps = loadOf(day);
  const muscles = Object.entries(levels || {}).filter(([id, v]) => v >= MIN && ps.some((p) => hits(id, p)))
    .map(([id, level]) => ({ id, label: LABEL[id] || id, level })).sort((a, b) => b.level - a.level);
  const sore = muscles.filter((m) => m.level >= 4).map((m) => m.id);
  const exercises = (day && day.i || []).filter((t) => exercisePatterns(t).some((p) => sore.some((z) => hits(z, p))));
  const names = [...new Set(exercises.map((t) => t.split(/\s\d|\s@|,/)[0].trim()))];
  return { level: muscles.length ? muscles[0].level : 0, muscles, exercises, names };
}
/** Betroffene Zonen kurz zusammenfassen: beide Seiten derselben Zone → "Brust mitte (beidseitig)". */
export function summarize(muscles, n = 3) {
  const seen = new Map();
  for (const m of muscles) {
    const z = ZONE[m.id], key = z && z.side !== "c" ? m.id.replace(/\.(l|r)$/, "") : m.id;
    const cur = seen.get(key);
    if (cur) { cur.both = true; cur.level = Math.max(cur.level, m.level); }
    else seen.set(key, { label: z && z.side !== "c" ? z.label.replace(/ (links|rechts)$/, "") : m.label, side: z ? SIDE[z.side] : "", level: m.level });
  }
  return [...seen.values()].sort((a, b) => b.level - a.level).slice(0, n)
    .map((x) => `${x.label}${x.both ? " beidseitig" : x.side ? " " + x.side : ""} ${x.level}/10`);
}
