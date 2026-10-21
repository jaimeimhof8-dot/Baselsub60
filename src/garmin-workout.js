// Lauf-Einheit aus dem Plan als Workout-Schritte für die Uhr. Gleiche Struktur wie im Plan: Einlaufen, Wiederholungen
// mit Trabpause, Auslaufen. Reine Funktionen, ohne DOM; die Edge Function "garmin" macht daraus das Garmin-Format.
//
// Schritt: {kind: "warmup"|"cooldown"|"interval"|"recovery", dist?: Meter, pace?: s/km, lap?: true}
//       oder {kind: "repeat", n, steps: [Schritt]}

const RUN = /^(?:(\d+)×)?(\d+(?:,\d+)?) (km|m)(?: Zone 2)? @ (\d+):(\d\d)\/km/;
const TRAB = /Trabpause (?:(\d+)×)?(\d+(?:,\d+)?) m @ (\d+):(\d\d)\/km/;
const STRIDE = /^Steigerungen (\d+)×(\d+(?:,\d+)?) m @ (\d+):(\d\d)\/km/;

const num = (s) => parseFloat(String(s).replace(",", "."));
const meters = (v, unit) => Math.round(num(v) * (unit === "km" ? 1000 : 1));
const pace = (m, s) => +m * 60 + +s;

/** Ein Lauf-Block "4×1 km @ 3:57/km …, Trabpause 3×300 m @ 6:30/km" (n Wiederholungen, Trabpause zwischen den Wiederholungen). */
function runBlock(text, kind) {
  const m = text.match(RUN);
  if (!m) return null;
  const [, reps, dist, unit, pm, ps] = m;
  const work = { kind, dist: meters(dist, unit), pace: pace(pm, ps) };
  const tm = text.match(TRAB);
  if (!reps) return [work];
  const n = +reps;
  if (!tm) return [{ kind: "repeat", n, steps: [{ ...work, kind: "interval" }] }];
  const rest = { kind: "recovery", dist: meters(tm[2], "m"), pace: pace(tm[3], tm[4]) };
  const gaps = tm[1] ? +tm[1] : 1;
  const iv = { ...work, kind: "interval" };
  // "Trabpause 2×200 m" = 2 Pausen zu je 200 m (zwischen den Wiederholungen). Jede Pause ein eigener Schritt, damit die Uhr alle zeigt.
  if (n <= 10) {
    const out = [];
    for (let k = 1; k <= n; k++) {
      out.push(iv);
      if (k <= gaps) out.push(rest);
    }
    return out;
  }
  return gaps === n - 1 ? [{ kind: "repeat", n: n - 1, steps: [iv, rest] }, iv] : [{ kind: "repeat", n, steps: [iv, rest] }];
}

/**
 * Schritte einer Lauf-Einheit.
 * @returns {{steps: Array, skipped: string[]}} skipped = Laufangaben, die nicht sicher erkannt wurden (werden nicht gesendet)
 */
export function planSteps(day) {
  const steps = [], skipped = [];
  if (!day || day.k !== "lauf") return { steps, skipped };
  for (const line of day.i || []) {
    for (let tok of String(line).split(" → ")) {
      tok = tok.trim().replace(/\.$/, "");
      let out = null;
      const ez = tok.match(/^(Einlaufen|Auslaufen) (.*)$/);
      const sg = tok.match(STRIDE);
      if (ez) out = runBlock(ez[2], ez[1] === "Einlaufen" ? "warmup" : "cooldown");
      else if (sg) out = [{ kind: "repeat", n: +sg[1], steps: [{ kind: "interval", dist: meters(sg[2], "m"), pace: pace(sg[3], sg[4]) }, { kind: "recovery", lap: true }] }];
      else out = runBlock(tok, "interval");
      if (out) steps.push(...out);
      else if (/\/km/.test(tok)) skipped.push(tok);
    }
  }
  return { steps, skipped };
}

/** Anzahl der Schritte, wie die Uhr sie zeigt (Wiederholungsgruppe = 1 + Inhalt). */
export const countSteps = (steps) => steps.reduce((s, x) => s + 1 + (x.steps ? countSteps(x.steps) : 0), 0);
