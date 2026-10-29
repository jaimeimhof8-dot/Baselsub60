// Einheiten-Analyse: bewertet eine fertige Einheit (Umsetzung, Anstrengung, Werte, Uhrdaten) und sagt,
// was gut war, was schlecht war und ob am Workout etwas angepasst werden sollte.
// Regelbasiert (läuft offline, sofort, nachvollziehbar). Reine Funktionen, ohne DOM.
import { paceOf, intervals, parseReps } from "./dashboard.js";
import { mmss } from "./util.js";

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const kgOf = (v) => { const m = /(\d+(?:[.,]\d+)?)\s*kg/i.exec(String(v || "")); return m ? parseFloat(m[1].replace(",", ".")) : null; };
const plannedRpe = (items) => {
  const r = items.map((x) => /RPE\s*(\d+(?:[.,]\d+)?)(?:\s*[–-]\s*(\d+(?:[.,]\d+)?))?/i.exec(x.t)).filter(Boolean)
    .map((m) => (parseFloat(m[1].replace(",", ".")) + parseFloat((m[2] || m[1]).replace(",", "."))) / 2);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
};
const de = (n, d = 1) => n.toFixed(d).replace(".", ",");

/**
 * @param {object} a
 *  kind: "kraft"|"lauf"|"station"|"sim"|"bike"|"race", title, easy (lockerer Lauf)
 *  wave: Wochentyp, rpe (1–10 oder null), rpeMax (Obergrenze der Woche)
 *  items: [{t, done, skip, val, prevVal}] ohne Füllzeilen
 *  act: {time (s), dist (m), hr, laps} der passenden Uhr-/Strava-Aktivität oder null
 *  ready: "green"|"yellow"|"red"|null (Check-in des Tages), note: Freitext, sore: höchster Muskelkater-Wert (0–10) oder null
 *  prevRpe: [RPE der letzten gleichartigen Einheiten, neueste zuletzt]
 * @returns {score, tone, verdict, good: [text], bad: [text], exec, workout, adjust: [text]}
 */
export function analyseSession(a) {
  const items = a.items || [];
  const good = [], bad = [], adjust = [];
  let score = 70;
  const G = (t, p = 0) => { good.push(t); score += p; };
  const B = (t, p = 0) => { bad.push(t); score -= p; };

  // 1. Umsetzung: wie viel vom Plan wurde gemacht?
  const live = items.filter((x) => !x.skip), n = live.length, done = live.filter((x) => x.done).length;
  const skipped = items.length - n, open = live.filter((x) => !x.done);
  const quota = n ? done / n : 1;
  let exec;
  if (!n) exec = "Keine Übungen im Plan – nichts zu bewerten.";
  else if (quota >= 0.999) { exec = `Komplett umgesetzt: ${done} von ${n} Übungen.`; G("Alles wie geplant durchgezogen.", 12); }
  else if (quota >= 0.75) { exec = `Gut umgesetzt: ${done} von ${n} Übungen.`; B(`Offen geblieben: ${open.map((x) => x.t.split(/\s\d|\s@/)[0]).join(", ")}.`, 6); }
  else if (quota >= 0.5) { exec = `Teilweise umgesetzt: ${done} von ${n} Übungen.`; B(`Nur ${Math.round(quota * 100)} % des Plans gemacht.`, 16); adjust.push("Wenn die Zeit regelmässig fehlt: Einheit kürzen statt hinten wegzulassen – lieber die Kernübungen sauber als alles halb."); }
  else { exec = `Wenig umgesetzt: ${done} von ${n} Übungen.`; B(`Weniger als die Hälfte des Plans gemacht (${done}/${n}).`, 28); adjust.push("Einheit realistisch kürzen oder die offenen Teile über «Offene verschieben» nachholen."); }
  if (skipped) B(`${skipped} ${skipped === 1 ? "Übung" : "Übungen"} bewusst gestrichen.`, Math.min(8, skipped * 2));

  // 2. Anstrengung gegen Plan und Wochenobergrenze
  const rpe = num(a.rpe), lim = num(a.rpeMax), pr = plannedRpe(items);
  const target = pr != null ? pr : (a.easy ? 4 : null);
  if (rpe == null) B("Keine Anstrengung (RPE) eingetragen – ohne sie lässt sich die Belastung nicht einordnen.", 6);
  else {
    if (target != null) {
      const diff = rpe - target;
      if (Math.abs(diff) <= 1) G(`Anstrengung ${rpe} passt zur Vorgabe (≈ ${de(target, 0)}).`, 8);
      else if (diff > 1) { B(`Anstrengung ${rpe} – deutlich härter als vorgesehen (≈ ${de(target, 0)}).`, diff > 2 ? 14 : 8); adjust.push(a.easy ? "Lockere Läufe wirklich locker halten: Tempo so wählen, dass du noch in ganzen Sätzen sprechen kannst." : "Beim nächsten Mal Tempo/Gewicht etwas zurücknehmen und die Vorgabe-Anstrengung treffen."); }
      else { G(`Anstrengung ${rpe} – leichter als vorgesehen (≈ ${de(target, 0)}).`, 2); if (!a.easy && diff < -2) adjust.push("Die Einheit war deutlich zu leicht: nächstes Mal Gewicht (+2,5 kg) oder Tempo moderat erhöhen."); }
    } else if (lim != null) {
      if (rpe > lim + 1) B(`Anstrengung ${rpe} liegt klar über dem Limit der ${a.wave}-Woche (${de(lim)}).`, 12);
      else if (rpe > lim) B(`Anstrengung ${rpe} liegt leicht über dem Limit der ${a.wave}-Woche (${de(lim)}).`, 5);
      else G(`Anstrengung ${rpe} liegt im Rahmen der ${a.wave}-Woche.`, 6);
    }
    // Trend über die letzten gleichartigen Einheiten
    const pv = (a.prevRpe || []).filter((v) => num(v) != null).slice(-2);
    if (pv.length === 2 && pv.every((v) => v >= rpe + 1) ) G(`Gleiche Art Einheit fühlt sich leichter an (Anstrengung ${pv[0]} → ${pv[1]} → ${rpe}) – Fitness steigt.`, 4);
    if (pv.length === 2 && pv.every((v) => v <= rpe - 1) && rpe >= 8) { B(`Anstrengung steigt von Einheit zu Einheit (${pv[0]} → ${pv[1]} → ${rpe}).`, 4); adjust.push("Anstrengung wächst bei gleicher Aufgabe – auf Schlaf und Essen achten und die nächste Einheit der Art nicht zusätzlich verschärfen."); }
  }

  // 3. Werte / Dokumentation (Kraft: Gewichtsentwicklung)
  const valued = live.filter((x) => String(x.val || "").trim()).length;
  let up = 0, down = 0, same = 0;
  for (const x of live) {
    const k = kgOf(x.val), p = kgOf(x.prevVal);
    if (k != null && p != null) { if (k > p) up++; else if (k < p) down++; else same++; }
  }
  if (up) G(`${up} ${up === 1 ? "Übung" : "Übungen"} mit mehr Gewicht als beim letzten Mal.`, Math.min(10, up * 4));
  if (down) { B(`${down} ${down === 1 ? "Übung" : "Übungen"} mit weniger Gewicht als beim letzten Mal.`, down * 4); if (a.ready !== "red") adjust.push("Gewicht gesunken: Schlaf/Erholung prüfen; bleibt es so, in der nächsten Einheit das Gewicht wieder auf den Vorwert setzen."); }
  if (!up && !down && same >= 2 && rpe != null && rpe <= 6.5) adjust.push("Gewichte gleich geblieben und es war nicht hart: beim nächsten Mal +2,5 kg an den Hauptübungen probieren.");
  if (n >= 3 && done >= 3 && valued === 0 && ["kraft", "station", "sim"].includes(a.kind)) B("Keine Werte (Gewichte/Zeiten) eingetragen – so ist kein Fortschritt messbar.", 4);
  else if (n >= 3 && valued / n >= 0.6) G("Werte sauber eingetragen – Fortschritt ist nachvollziehbar.", 3);

  // 4. Uhrdaten: Intervall-Qualität (Tempo-Konstanz)
  const act = a.act;
  if (act && Array.isArray(act.laps) && act.laps.length > 1) {
    const planned = items.map((x) => x.t).find((t) => parseReps(t)) || "";
    const iv = intervals(act.laps, planned);
    if (iv.kind === "intervals" && iv.work.length >= 3) {
      const p = iv.work.map((k) => paceOf(act.laps[k])).filter(Boolean);
      if (p.length >= 3) {
        const first = p[0], last = p[p.length - 1], best = Math.min(...p), worst = Math.max(...p);
        const fade = last / first - 1, spread = worst / best - 1;
        if (fade > 0.04) { B(`Tempo-Einbruch: letzte Wiederholung ${mmss(last)}/km, erste ${mmss(first)}/km (+${Math.round(fade * 100)} %).`, 8); adjust.push("Zu schnell gestartet: erste Wiederholung bewusst 3–5 s/km langsamer, dann gleichmässig halten."); }
        else if (spread <= 0.025) G(`Sehr gleichmässig gelaufen: ${mmss(best)}–${mmss(worst)}/km über ${p.length} Wiederholungen.`, 8);
        else if (last <= first * 0.99) G(`Negativ gesplittet: letzte Wiederholung ${mmss(last)}/km schneller als die erste (${mmss(first)}/km).`, 8);
        else G(`Wiederholungen zwischen ${mmss(best)} und ${mmss(worst)}/km.`, 2);
      }
    }
  }
  if (act && num(act.hr) && a.easy && act.hr > 0 && a.maxHr && act.hr / a.maxHr > 0.8)
    { B(`Ø Puls ${act.hr} ist für einen lockeren Lauf hoch (${Math.round(act.hr / a.maxHr * 100)} % vom Maximalpuls).`, 6); adjust.push("Langsamer laufen, bis der Puls unter ~75 % des Maximalpulses bleibt."); }

  // 5. Zustand vor der Einheit
  if (a.ready === "red" && quota >= 0.75) B("Check-in war rot und du hast trotzdem voll trainiert.", 6), adjust.push("Bei rotem Check-in lieber auf locker wechseln – Tag im Plan über «Entlasten» anpassen.");
  else if (a.ready === "green" && quota >= 0.999 && rpe != null && rpe <= 8) G("Frisch gestartet und sauber durchgezogen.", 2);
  if (a.sore != null && a.sore >= 7) { B(`Hoher Muskelkater (${a.sore}/10) im Umfeld der Einheit.`, 4); adjust.push("Muskelkater ≥ 7: nächste Einheit gleicher Muskeln leichter gestalten oder einen Tag verschieben."); }
  if (/schmerz|zwick|stech|knie|achilles|schulter|rücken|verletz/i.test(a.note || "")) { B("In der Notiz steht ein möglicher Schmerzhinweis.", 8); adjust.push("Schmerzstelle beobachten; wenn sie bleibt, im Coach unter «Verletzt / krank» eintragen und nicht durchtrainieren."); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const tone = score >= 78 ? "green" : score >= 55 ? "yellow" : "red";
  const verdict = score >= 85 ? "Sehr gute Einheit" : score >= 78 ? "Gute Einheit" : score >= 65 ? "Solide Einheit" : score >= 55 ? "Durchwachsen" : "Schwache Einheit";

  let workout;
  if (!adjust.length) workout = "Das Workout hat zur Form gepasst – keine Anpassung nötig.";
  else if (rpe != null && target != null && rpe - target > 1) workout = "Das Workout war für den Tag etwas zu hart.";
  else if (rpe != null && target != null && rpe - target < -2) workout = "Das Workout war zu leicht.";
  else workout = "Das Workout selbst ist in Ordnung, kleine Stellschrauben unten.";
  if (!good.length) good.push("Du hast die Einheit angefangen und eingetragen – das zählt.");
  return { score, tone, verdict, good, bad, exec, workout, adjust: [...new Set(adjust)].slice(0, 4) };
}
