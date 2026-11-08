// Rückwirkende Auswertung: aus den gespeicherten Daten (Uhr-Aktivität mit Runden, Plan, Haken, RPE) wird für JEDE
// bisherige Einheit dieselbe Kennzahlen-Auswertung neu berechnet wie nach dem Training. Nichts davon wird gespeichert,
// darum sehen alte und neue Einheiten immer den aktuellen Rechenstand. Reine Funktionen, ohne DOM.
import { splitPhases, phaseStats, workDash, confText } from "./session-dash.js";
import { mmss } from "./util.js";

const SRC = { garmin: "Garmin", strava: "Strava" };

/**
 * Datenlage einer Einheit.
 *  act: Aktivität der Uhr oder null · garminOn: Garmin verbunden (Abruf möglich)
 * -> {state: "ok"|"partial"|"none", reason: Satz oder "", refetch: bool}
 *  none = keine Uhr-Daten, partial = Aktivität da, aber ohne Runden oder ohne Puls, ok = Runden und Puls da.
 */
export function dataState(act, { garminOn = false } = {}) {
  if (!act) return { state: "none", reason: garminOn ? "Keine passende Uhr-Aktivität gespeichert. Ein Abruf bei Garmin kann sie nachladen." : "Keine Uhr-Aktivität gespeichert und Garmin nicht verbunden.", refetch: garminOn };
  const laps = (act.laps || []).filter((l) => l && l.t > 0);
  const lapHr = laps.filter((l) => l.hr).length;
  const canRe = act.src === "garmin" && garminOn;
  if (!laps.length) {
    const waiting = act.src === "garmin" && act.lapsV !== 3;
    return { state: "partial", reason: waiting ? "Runden fehlen noch: sie wurden bei der Übernahme nicht mitgeladen. Erneut abrufen holt sie." : "Die Uhr hat keine Runden aufgezeichnet – nur Gesamtwerte, keine Trennung von Arbeit und Pause.", refetch: canRe };
  }
  if (!(act.hr || lapHr)) return { state: "partial", reason: "Kein Puls aufgezeichnet (Brustgurt/Uhr am Handgelenk prüfen) – Pulswerte fehlen.", refetch: canRe };
  if (lapHr < laps.length) return { state: "ok", reason: `Puls nur in ${lapHr} von ${laps.length} Runden – Pulswerte sind unvollständig.`, refetch: canRe };
  return { state: "ok", reason: "", refetch: false };
}

/**
 * Eine Einheit neu auswerten.
 *  e: {i, label (z. B. "Di 13.10."), title, kind, act, steps, planText, maxHr, done, n, rpe, garminOn}
 * -> {i, label, title, kind, src, data: dataState, conf, confInfo, st: phaseStats, wd: workDash, key: {hr, pace, drift, workS, comp}, done, n, rpe}
 */
export function reviewOne(e) {
  const act = e.act || null;
  const data = dataState(act, { garminOn: e.garminOn });
  const ph = splitPhases(act && act.laps, { steps: e.steps || null, planText: e.planText || "" });
  const st = phaseStats(ph, { steps: e.steps || null, maxHr: e.maxHr || null });
  const wd = workDash(st);
  const w = st.work;
  return {
    i: e.i, label: e.label, title: e.title, kind: e.kind, done: e.done, n: e.n, rpe: e.rpe ?? null,
    src: act ? SRC[act.src] || "Strava" : null, actId: act ? act.id : "",
    data, conf: st.conf, confInfo: confText(st.conf, st.mode), st, wd,
    key: {
      hr: w ? w.hr : null, pace: w ? w.pace : null,
      drift: st.drift ? st.drift.bpm : null, workS: st.time.work || null,
      comp: st.compromise ? st.compromise.avg : null,
      totalHr: st.total.hr || (act && act.hr) || null,
    },
  };
}

/** Alle Einheiten (neueste zuerst) mit Zählung der Datenlage. */
export function reviewAll(list) {
  const rows = list.map(reviewOne).sort((a, b) => b.i - a.i);
  const count = { ok: 0, partial: 0, none: 0 };
  rows.forEach((r) => count[r.data.state]++);
  return { rows, count };
}

/** Kurztext der Kennzahlen einer Zeile für die Übersicht («Ø Puls Arbeit 175 · 3:58/km · Drift +13»). */
export function keyLine(r) {
  const k = r.key, p = [];
  if (k.hr) p.push(`Puls Arbeit ${k.hr}`);
  else if (k.totalHr) p.push(`Ø Puls ${k.totalHr}`);
  if (k.pace) p.push(`${mmss(k.pace)}/km`);
  if (k.drift != null) p.push(`Drift ${k.drift > 0 ? "+" : k.drift < 0 ? "−" : "±"}${Math.abs(k.drift)}`);
  if (k.comp != null) p.push(`Kompromiss ${k.comp > 0 ? "+" : "−"}${Math.abs(k.comp)} s`);
  return p.join(" · ");
}
