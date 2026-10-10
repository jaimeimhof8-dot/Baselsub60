// Fliesstext einer Einheit in kurze, abhakbare Zeilen umwandeln – für die Blöcke B bis Taper, die im
// Coach-PDF als Absatz pro Wochentag geschrieben sind ("Woche 1: vier Runden …, danach zwei Blöcke …").
// Reine Funktionen, ohne DOM. Erklärende Sätze ohne Zahlen landen im Hinweis statt als Checkbox.

const NUM = { ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, zwei: 2, drei: 3, vier: 4, "fünf": 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, "zwölf": 12, "fünfzehn": 15, zwanzig: 20 };
const NUM_RE = new RegExp(`\\b(${Object.keys(NUM).filter((k) => NUM[k] > 1).join("|")})\\b(?=[\\s-]+\\S)`, "gi");

/** Die Grundübungen aus Block A – "die Grundübungen" im Text meint genau diese. */
export const BASE_LIFTS = ["Back Squat", "Bulgarian Split Squat", "Bench Press", "Shoulder Press", "Pull-ups"];
export const LIFTS = [
  ["Back Squat", /Back Squats?/], ["Bulgarian Split Squat", /Bulgarian Split Squats?/], ["Bench Press", /Bench Press/],
  ["Shoulder Press", /Shoulder Press/], ["Pull-ups", /Pull-ups?/], ["Plank", /Plank/], ["Box Jumps", /Box Jumps?|Kastensprünge/]
];

export const sentencesOf = (s) => String(s).split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])/).map((x) => x.trim()).filter(Boolean);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// "Zone 2" allein ist keine Trainingsangabe
const hasData = (s) => /\d/.test(s.replace(/Zone[- ]\d(?:[–-]\d)?/g, ""));

/** Wochen-Einleitung entfernen: "In Woche 1 (moderat) läufst du …", "Woche 3, der Spitzenreiz, bringt …" */
function stripLead(s) {
  return s
    .replace(/^(?:In )?(?:den )?Wochen? \d(?:\s*(?:und|bis|,)\s*\d)?(?:\s*\([^)]*\))?\s*[:,]?\s*/i, "")
    .replace(/^(?:der |dem )?Spitzenreiz\s*[:,]\s*/i, "")
    .replace(/^ist Deload\s*:\s*/i, "")
    .replace(/^(?:absolviert ihr|übt ihr|läufst du|reduzierst du auf|reduziert auf|steigt (?:das )?auf|bringt|findet|folgen?)\s+/i, "")
    .replace(/^(?:Unverändert|Weiterhin|samstags oder sonntags)\s+/i, "")
    .trim();
}

/** Zahlwörter → Ziffern, Einheiten kürzen: "vier Wiederholungen à acht Minuten bei 82 bis 85 % maximaler Herzfrequenz" → "4×8′ @82–85% max HF" */
export function tidy(s) {
  return String(s)
    .replace(NUM_RE, (m) => String(NUM[m.toLowerCase()]))
    .replace(/Acht-Sekunden-Übergabe/g, "8-Sekunden-Übergabe")
    .replace(/(\d+) (?:lockere )?(?:Wiederholungen|Blöcken?|Bricks) (Compromised Running )?à (\d+) Minuten/g, (m, n, cr, d) => `${cr || ""}${n}×${d}′${/lockere/.test(m) ? " locker" : ""}`)
    .replace(/(\d+) (?:lockere )?Wiederholungen à (\d+) Minuten/g, "$1×$2′")
    .replace(/(\d+) (Blöcken?|Bricks) ([A-Z][\w-]*(?: [A-Z][\w-]*)*) à (\d+) Minuten/g, "$3 $1×$4′")
    .replace(/(\d+) bis (\d+)/g, "$1–$2")
    .replace(/(\d+) Minuten/g, "$1′").replace(/(\d+) Sekunden/g, "$1″")
    .replace(/\s?% (?:der )?maximaler? Herzfrequenz/g, "% max HF")
    .replace(/\bbei (?:rund |etwa )?(\d[\d–]*)\s?%/g, "@$1%")
    .replace(/,? (?:ebenfalls )?mit (\d[\d–]*[′″]) (?:Trab)?[Pp]ause/g, ", $1 Pause")
    .replace(/ steigt auf /g, " ").replace(/ statt\b/g, "")
    .replace(/,? mit dem Ziel, (?:die |den |das )?(.+?) zu erreichen/g, " (Ziel: $1)").replace(/ weiter(?= \(|$|,)/g, "")
    .replace(/,? (?:über alle \d+ Wochen|unverändert)\b/g, "")
    .replace(/ pro Kilometer/g, "/km").replace(/\bbeziehungsweise\b/g, "bzw.").replace(/\bin Zone\b/g, "Zone")
    .replace(/\s{2,}/g, " ").replace(/[.\s]+$/, "").trim();
}

/** Satz an Aufzählungsstellen in einzelne Einheiten teilen ("…, danach zwei Blöcke …", "… plus …"). */
const CLAUSE = /,\s*(?:danach|gefolgt von|kombiniert mit|dazu)\s+|\s+(?:gefolgt von|kombiniert mit)\s+|,\s*(?=Compromised Running\b)/;
function clauses(s) {
  return s.split(CLAUSE).map((c) => c.replace(/^(?:einem|einer|einen|die eine|der|die|das)\s+(?=\S)/i, "").trim()).filter(Boolean);
}

/**
 * Lauf-, Rad-, Stations- und Doubles-Einheiten: Zeilen mit Zahlen werden Checkbox-Zeilen,
 * reine Erklärungen werden Hinweis. Gibt {items, note} zurück.
 */
export function structureSession(body, { tasks = false } = {}) {
  const items = [], notes = [];
  sentencesOf(body).forEach((sen, k) => {
    for (const c of clauses(stripLead(sen))) {
      // Begründung nach Gedankenstrich oder "…, um …" gehört in den Hinweis
      const [head, ...why] = c.replace(/,\s+um\s+(?=\S)/, " – um ").split(/\s+[–—]\s+/);
      const t = tidy(head);
      if (why.length) notes.push(cap(tidy(why.join(" – "))) + ".");
      if (!t) continue;
      const task = hasData(t) || (tasks && k === 0 && !/Erholung/i.test(t));
      if (task) items.push(cap(t)); else notes.push(cap(t) + ".");
    }
  });
  return { items: items.slice(0, 8), note: notes.join(" ") };
}

/** Sätze×Wdh, Prozent, RPE, Durchgänge aus einem Textstück. */
function params(txt) {
  const t = tidy(txt), out = {};
  const sets = t.match(/(\d+) Sätzen? (?:\S+ )?à (\d+) (Wiederholungen|″)/);
  if (sets) { out.sets = +sets[1]; out.reps = +sets[2]; out.sec = sets[3] === "″"; }
  else { const s = t.match(/\((\d+) Sätze\)|(\d+) Sätze\b/); if (s) out.sets = +(s[1] || s[2]); }
  const pct = t.match(/@(\d[\d–]*)%/); if (pct) out.pct = pct[1];
  const rpe = t.match(/RPE (\d+)(?:[–-](\d+))?/); if (rpe) out.rpe = rpe[2] ? `${rpe[1]}–${rpe[2]}` : rpe[1];
  const rounds = t.match(/(\d+|ein) (?:lockerer? )?Durchg(?:ang|änge)/); if (rounds) out.rounds = rounds[1] === "ein" ? 1 : +rounds[1];
  return out;
}
function line(name, p, extra) {
  let s = name;
  if (p.sets && p.reps) s += ` ${p.sets}×${p.reps}${p.sec ? "″" : ""}`;
  else if (p.sets) s += ` ${p.sets} Sätze`;
  if (p.pct) s += ` @${p.pct}%`;
  if (p.rpe) s += ` RPE ${p.rpe}`;
  if (extra) s += `, ${extra}`;
  return s;
}

/**
 * Kraft-Einheit eines Blocks (ohne Übungsliste wie in Block A).
 * @param {string} week   Text dieser Woche ("In Woche 1 (moderat) läufst du vier Sätze à fünf Wiederholungen Back Squat …")
 * @param {string} common Text für alle Wochen (Einleitung, "Die Zusatzübungen – … – laufen im gleichen Wellenmuster mit")
 * @param {(name:string)=>string|null} prev  gleiche Übung aus dem Vorblock (für "gleiches Wellenmuster")
 * @returns {{items:string[], note:string}|null}
 */
export function structureKraft(week, common, prev = () => null, block = "") {
  const all = `${common} ${week}`;
  const named = (txt) => LIFTS.filter(([, re]) => re.test(txt)).map(([n]) => n);
  // Hauptübung = die vor den "Zusatzübungen" genannte Übung im ganzen Absatz (z. B. Back Squat mit Topsatz)
  const mainName = named((block || all).split(/Zusatzübungen/)[0]).find((n) => n !== "Plank") || null;
  let names = named(all); if (mainName && !names.includes(mainName)) names.unshift(mainName);
  if (/Grundübungen/.test(all)) names = [...new Set([...names.filter((n) => !BASE_LIFTS.includes(n)), ...BASE_LIFTS])];
  if (!names.length) return null;
  const items = [];
  // Hauptübung mit eigenen Angaben in dieser Woche, optional mit Topsatz
  const main = /Sätz|Topsatz/.test(week) && !/Zirkel|Durchg/.test(week) ? mainName : null;
  const [base, top] = week.split(/(?:,\s*)?(?:gefolgt von|plus|mit) (?:einem |einen )?(?:einzelnen )?Topsatz/);
  const shared = params(base), circuit = /Zirkel|Durchg/.test(all);
  for (const n of names) {
    if (n === main) {
      items.push(line(n, params(base)));
      if (top != null) { const p = params("1 Sätze à " + (tidy(top).match(/à (\d+) Wiederholungen/) || [, "1"])[1] + " Wiederholungen " + top); items.push(line(n, p, "Topsatz")); }
    } else if (/Zusatzübungen|Wellenmuster/.test(common) && prev(n)) {
      items.push(prev(n));
    } else {
      const p = { ...shared }; if (circuit) { delete p.sets; delete p.reps; }
      items.push(line(n, p, circuit && shared.rounds ? `Zirkel, ${shared.rounds} ${shared.rounds === 1 ? "Durchgang" : "Durchgänge"}` : ""));
    }
  }
  const note = sentencesOf(all).filter((s) => !/\d|Sätz|à/.test(tidy(s)) || /Zirkel|Pause/.test(s)).map((s) => tidy(s) + ".").join(" ");
  return { items, note };
}

/** Sätze, die mehrere Wochen gleichzeitig beschreiben ("Woche 1 und 2 …, Spitze in Woche 3, … in Woche 4") – gelten für alle Wochen. */
export function patternSentences(body) {
  const keep = [], rest = [];
  for (const s of sentencesOf(body)) {
    const weeks = new Set([...s.matchAll(/Wochen? (\d)/g)].map((m) => m[1]));
    (weeks.size >= 3 ? keep : rest).push(s);
  }
  return { pattern: keep.join(" "), body: rest.join(" ") };
}
