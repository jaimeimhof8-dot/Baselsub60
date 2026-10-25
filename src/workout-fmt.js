// Strukturierte Darstellung von Planzeilen: Lauf- und Stationsschritte als Bausteine statt Fliesstext.
// fmtLine(text) liefert fertiges HTML (alle Texte escaped) oder null, wenn die Zeile nicht sicher erkannt wird.
// Schutz: Jede Zahl der Zeile muss im Ergebnis wieder vorkommen, sonst gibt es null und die App zeigt den Originaltext.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const RUN = /^(?:(\d+)×)?(\d+(?:,\d+)?) (km|m)( Zone 2)? @ (\d+:\d\d)\/km \((\d+:\d\d)\)(.*)$/;
const TRAB = /Trabpause (?:(\d+)×)?(\d+(?:,\d+)?) m @ (\d+:\d\d)\/km \((\d+:\d\d)\)/;
const STRIDE = /^Steigerungen (\d+)×(\d+(?:,\d+)?) m @ (\d+:\d\d)\/km \((\d+:\d\d)\)$/;
const STN_NAMES = "SkiErg|RowErg|Sled Push|Sled Pull|Burpee Broad Jumps|Farmers Carry|Sandbag Lunges|Wall Balls";
const STN = new RegExp(`^(?:(\\d+) )?(${STN_NAMES})(.*)$`);
const LABEL = /^((?:Abschnitt \d+: )?(?:Run \d+|Runde \d+ frisch ohne Station|Runden? \d+(?:[–-]\d+)?(?: und \d+)?(?: mit Jimoh)?|\d+ Runden mit Jimoh)): (.*)$/;
const PAUSE = /,\s*(\d+ (?:Min|s)) Pause$/;

/** Teilt an sep, aber nur außerhalb von Klammern. */
function splitTop(s, sep) {
  const out = [];
  let depth = 0,
    cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && s.startsWith(sep, i)) {
      out.push(cur);
      cur = "";
      i += sep.length - 1;
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const chip = (cls, label, big, mid, goal, note) =>
  `<div class="wx-s ${cls}">${label ? `<i>${esc(label)}</i>` : ""}<b>${esc(big)}</b>${mid ? `<em>${esc(mid)}</em>` : ""}${goal ? `<u>${esc(goal)}</u>` : ""}${note ? `<small>${esc(note)}</small>` : ""}</div>`;

function runStep(body, label) {
  const m = body.match(RUN);
  if (!m) return null;
  const [, reps, dist, unit, z2, pace, time, restRaw] = m;
  let rest = restRaw || "";
  const parts = [chip("run", label || (z2 ? "Zone 2" : "Lauf"), `${reps ? reps + " × " : ""}${dist} ${unit}`, `${pace}/km`, `Ziel ${time}${reps ? " je Wdh." : ""}`, "")];
  const tm = rest.match(TRAB);
  if (tm) {
    rest = rest.replace(TRAB, "");
    parts.push(chip("trab", "Trabpause", `${tm[1] ? tm[1] + " × " : ""}${tm[2]} m`, `${tm[3]}/km`, `Ziel ${tm[4]}${tm[1] ? " je Pause" : ""}`, ""));
  }
  rest = rest.replace(/^[\s,]+|[\s,]+$/g, "").replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",");
  if (rest) parts.push(`<div class="wx-n">${esc(rest)}</div>`);
  return parts.join("");
}

function stationStep(body) {
  const m = body.match(STN);
  if (!m) return null;
  const [, lead, name, restRaw] = m;
  let rest = restRaw.trim();
  let paren = "";
  const pm = rest.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (pm) {
    rest = pm[1].trim();
    paren = pm[2];
  }
  const mm = rest.match(/^(\d+(?:,\d+)?(?: m)?)?(?: @ (\d+:\d\d\/500 m))?(?: mit (.+))?$/);
  if (!mm) return null;
  const [, amt, split, load] = mm;
  const amount = lead ? lead : amt || "";
  if (!amount) return null;
  const big = [amount.match(/^\d+(?:,\d+)?$/) ? `${amount} Wdh.` : amount, load].filter(Boolean).join(" · ");
  let goal = "";
  const notes = [];
  const plates = [];
  for (const p of paren ? paren.split(/,\s+/) : []) {
    if (/^Ziel /.test(p)) goal = p;
    else if (/Platten$/.test(p)) plates.push(p);
    else notes.push(p);
  }
  const mid = [split, ...plates].filter(Boolean).join(" · ");
  return chip("stn", name, big, mid, goal, notes.join(" · "));
}

function oneStep(tok, label) {
  const t = tok.trim();
  const ez = t.match(/^(Einlaufen|Auslaufen) (.*)$/);
  if (ez) return runStep(ez[2], ez[1]);
  const sg = t.match(STRIDE);
  if (sg) return chip("run", "Steigerungen", `${sg[1]} × ${sg[2]} m`, `${sg[3]}/km`, `Ziel ${sg[4]} je Wdh.`, "");
  const ld = t.match(/^Leiter (.*)$/);
  if (ld) {
    const tm = ld[1].match(TRAB);
    const body = ld[1].replace(TRAB, "").replace(/[\s,]+$/, "");
    const runs = splitTop(body, ", ").map((x) => x.match(RUN));
    if (runs.length && runs.every(Boolean)) {
      const chips = runs.map((r, i) => chip("run", i === 0 ? "Leiter" : "", `${r[2]} ${r[3]}`, `${r[5]}/km`, `Ziel ${r[6]}`, "")).join("");
      const tr = tm ? chip("trab", "Trabpause", `${tm[1] ? tm[1] + " × " : ""}${tm[2]} m`, `${tm[3]}/km`, `Ziel ${tm[4]}${tm[1] ? " je Pause" : ""}`, "") : "";
      return chips + tr;
    }
    return null;
  }
  return runStep(t, label) || stationStep(t);
}

/** Alternativen "(mit Jimoh: … / allein: … / Heim-Ersatz: …)" der Feiertagswochen als Zeilen. */
function optionsStep(tok) {
  const inner = tok.trim().replace(/^\(/, "").replace(/\)$/, "");
  const opts = splitTop(inner, " / ");
  if (opts.length < 2 || !opts.every((o) => /^(mit Jimoh|allein|Heim-Ersatz): /.test(o))) return null;
  const rows = opts.map((o) => {
    const [, who, body] = o.match(/^(mit Jimoh|allein|Heim-Ersatz): (.*)$/);
    const chain = splitTop(body, " → ").map((x) => x.trim().replace(/^direkt /, ""));
    const steps = chain.map((c) => oneStep(c) || `<div class="wx-n">${esc(c)}</div>`);
    return `<div class="wx-o"><i>${esc(who)}</i><div class="wx-r">${steps.join('<div class="wx-a">↓</div>')}</div></div>`;
  });
  return `<div class="wx-opts">${rows.join("")}</div>`;
}

function digits(s) {
  return (String(s).match(/\d+/g) || []).sort().join(",");
}
function visible(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

export function fmtLine(text) {
  try {
    let line = String(text || "").trim().replace(/\.$/, "");
    if (!line) return null;
    const toks = splitTop(line, " → ");
    const blocks = [];
    let cur = null;
    let recognised = 0;
    const open = (label) => {
      cur = { label, steps: [], pause: "" };
      blocks.push(cur);
    };
    for (let k = 0; k < toks.length; k++) {
      let tok = toks[k].trim();
      const lm = tok.match(LABEL);
      let label = "";
      if (lm) {
        label = lm[1].replace(/: /, " · ");
        tok = lm[2];
        open(label);
      } else if (!cur) open("");
      let direct = false;
      if (/^direkt /.test(tok)) {
        direct = true;
        tok = tok.replace(/^direkt /, "");
      }
      let pause = "";
      const pm = tok.match(PAUSE);
      if (pm) {
        pause = pm[1];
        tok = tok.replace(PAUSE, "");
      }
      let html = null;
      if (/^\(.*\)$/.test(tok.trim()) && /mit Jimoh: /.test(tok)) html = optionsStep(tok);
      else html = oneStep(tok);
      if (html) recognised++;
      else html = `<div class="wx-n">${esc(tok)}</div>`;
      if (cur.steps.length) cur.steps.push(`<div class="wx-a">${direct ? "direkt " : ""}↓</div>`);
      cur.steps.push(html);
      if (pause) cur.pause = pause;
      // Mehrere Läufe in einer Zeile: ein neuer Block beginnt nur bei einer Beschriftung
    }
    if (!recognised) return null;
    const out = `<div class="wx">${blocks
      .map((b) => `<div class="wx-b">${b.label ? `<div class="wx-l">${esc(b.label)}</div>` : ""}<div class="wx-r">${b.steps.join("")}</div>${b.pause ? `<div class="wx-p">Pause ${esc(b.pause)}</div>` : ""}</div>`)
      .join("")}</div>`;
    // Keine Zahl darf verloren gehen
    if (digits(visible(out)) !== digits(text)) return null;
    return out;
  } catch (_) {
    return null;
  }
}


/** Rundennummern einer Beschriftung ("Runde 2 und 4", "Runden 2–4"), sonst null. */
function roundNums(label) {
  const a = label.match(/^Runde (\d+) und (\d+)/);
  if (a) return [+a[1], +a[2]];
  const b = label.match(/^Runden (\d+)[–-](\d+)/);
  if (b) {
    const r = [];
    for (let x = +b[1]; x <= +b[2]; x++) r.push(x);
    return r;
  }
  return null;
}

/**
 * Eingabefelder einer Lauf-Station-Zeile: je Lauf und je Station eine Zeit.
 * Gibt [{label, goal}] in Zeilenreihenfolge zurück oder null, wenn ein Feld genügt.
 */
export function lineSlots(text) {
  try {
    const line = String(text || "").trim().replace(/\.$/, "");
    if (!line) return null;
    const toks = splitTop(line, " → ");
    const blocks = [];
    let cur = null;
    for (let tok of toks) {
      tok = tok.trim();
      const lm = tok.match(LABEL);
      if (lm) {
        cur = { label: lm[1].replace(/: /, " · "), steps: [] };
        blocks.push(cur);
        tok = lm[2];
      } else if (!cur) {
        cur = { label: "", steps: [] };
        blocks.push(cur);
      }
      tok = tok.replace(/^direkt /, "").replace(PAUSE, "");
      if (/^(Einlaufen|Auslaufen|Steigerungen|Leiter)\b/.test(tok) || /^\(/.test(tok)) continue;
      const rm = tok.match(RUN);
      if (rm) {
        if (rm[1] || rm[4]) return null; // Wiederholungen oder Zone-2-Lauf: ein Feld genügt
        cur.steps.push({ label: "Lauf", goal: rm[6] });
        continue;
      }
      const sm = tok.match(STN);
      if (sm) cur.steps.push({ label: sm[2], goal: (tok.match(/Ziel (\d+:\d\d)/) || [])[1] || "" });
    }
    const out = [];
    for (const b of blocks) {
      if (/^\d+ Runden/.test(b.label)) return null;
      const rounds = roundNums(b.label);
      if (rounds) for (const n of rounds) for (const s of b.steps) out.push({ label: `R${n} ${s.label}`, goal: s.goal });
      else for (const s of b.steps) out.push({ label: blocks.length > 1 && b.label ? `${b.label} · ${s.label}` : s.label, goal: s.goal });
    }
    return out.length >= 2 ? out : null;
  } catch (_) {
    return null;
  }
}

export const _internal = { splitTop, digits, visible };
