// Plan v10: Überarbeitung von Block B bis Taper (Wochen 5–18) nach der Datenanalyse vom 06.11.2026.
// Gleiche Wochenstruktur wie vorher (Mo Kraft 1, Di Lauf, Mi lockerer Aufbau, Do Kraft 2/Stationen, Fr Ruhe, Sa Simulation/Lang, So Ruhe).
// Was sich ändert und warum, mit Zahlen: PLAN_V10.md. Reine Daten und Funktionen, ohne DOM.
//
// Annahmen, die in den Texten stehen und nach dem Re-Test am 10.11. nachgezogen werden:
//   T = 3:57/km (4×1-km-Pacing-Test vom 13.10.), Renn-Pace RP = 4:05/km (nötig für unter 60:00), Schwelle = T + 13–18 s/km.
// Die Pace-Angaben sind Kontrollwerte, geführt wird nach Puls und Gefühl.

const D = (t, k, i, n = "") => ({ t, k, i, n });

const STRIDES = "6×20″ Steigerungen locker, volle Pause";
const EASY = "@65–72% max HF, Gesprächstempo (ca. 5:20–5:50/km)";
const SPARE = "Bei Schienbein- oder Achillesbeschwerden: stattdessen 45–60′ Rad wie bisher. Beschwerden im Muskelkater-Melder eintragen.";
const RT = [
  "15′ Einlaufen",
  "4×1 km bei RPE 8–9 (wie am 13.10., GPS-geprüft, kein Sprint), 2′ Trab Pause",
  "10′ Auslaufen",
];
const RT_NOTE = "Gleiche Strecke, gleiche Uhr wie im Oktober, beide Uhren vergleichen. Danach unter Tests eintragen: die App rechnet Prognose und Paces neu.";

/** Tage, die komplett ersetzt werden. Schlüssel = Tag-Index (Tag 0 = Mo 12.10.2026). */
export const OVERRIDE = {
  // ---- Block B: Build I (W5–W8) --------------------------------------------------------------
  29: D("Pacing-Re-Test 4×1 km", "lauf", RT, RT_NOTE + " Statt Schwelle diese Woche: Der Test gibt T für alle Paces ab Block C."),
  36: D("Schwellenintervalle", "lauf", ["15′ Einlaufen", "4×8′ @82–85% max HF (ca. T + 13–18 s/km, bei T 3:57 etwa 4:10–4:15), 2′ Trab Pause", "10′ Auslaufen"], "Gesamt 32′ Schwelle. Der Aufbau kommt über die zusätzlichen lockeren Läufe, nicht über härtere Intervalle. Pace nur als Kontrolle, Puls führt."),
  43: D("Schwellenintervalle", "lauf", ["15′ Einlaufen", "4×10′ @85% max HF (ca. T + 13–15 s/km), 90″ Trab Pause", "10′ Auslaufen"], "Gesamt 40′ in langen Blöcken: Das ist die Renn-Ausdauer, nicht die Intervall-Spitze."),
  50: D("Pacing-Zwischentest 4×1 km", "lauf", RT, RT_NOTE + " Deload-Woche, frische Beine: Das ist euer Messwert für die Mitte von Build I."),
  // Mi: lockerer Dauerlauf statt Rad (Rad bleibt in Deload-Wochen)
  30: D("Lauf Zone 2", "lauf", [`20′ locker ${EASY}`, STRIDES], SPARE),
  37: D("Lauf Zone 2", "lauf", [`25′ locker ${EASY}`, STRIDES], SPARE),
  44: D("Lauf Zone 2", "lauf", [`25′ locker ${EASY}`, STRIDES], SPARE),
  // Sa: Transition Drilling mit Laufanteil, Halb-Simulation in W7
  33: D("Doubles Transition Drilling mit Laufen", "sim", [
    "Doubles Transition Drilling (Ziel: 8-Sekunden-Übergabe bis Blockende durchgehend)",
    "2× (1 km Lauf @4:10–4:15/km, dann Station-Übergabe auf Zeit: SkiErg, Sled, Row im Wechsel)",
  ], "Die Roxzone ist euer größter Hebel auf gleichem Kurs. Jede Übergabe stoppen und aufschreiben. Sonntag bleibt echte Erholung."),
  40: D("Doubles Transition Drilling mit Laufen", "sim", [
    "Doubles Transition Drilling (Ziel: 8-Sekunden-Übergabe bis Blockende durchgehend)",
    "2× (1 km Lauf @4:08–4:12/km, dann Station-Übergabe auf Zeit)",
    "Stationsaufteilung festlegen: Wer macht welche Meter an welcher Station (Tempo-Verhältnis aus den Benchmarks)",
  ], "Aufteilung ist bis 12.12. fix. Sonntag bleibt echte Erholung."),
  47: D("Doubles Halb-Simulation", "sim", [
    "Lauf 1–4 mit SkiErg, Sled Push, Sled Pull, Burpee Broad Jumps in Rennreihenfolge @75% Renngeschwindigkeit",
    "Zeit pro Segment und Roxzone mitstoppen, Aufteilung wie fixiert",
    "Danach Auswertung: Wo gehen Sekunden verloren (Übergabe, Lauf nach Sled Push, Burpees)?",
  ], "Erste Zeitmessung unter Renn-Aufbau, 2 Wochen früher als die erste volle Simulation. Sonntag bleibt echte Erholung."),

  // ---- Block C: Build II (W9–W12) -------------------------------------------------------------
  57: D("Schwelle + kurze Schnelle", "lauf", ["15′ Einlaufen", "3×10′ @85% max HF (ca. T + 13–15 s/km), 2′ Trab Pause", "4×2′ @ca. T − 5 s/km (bei T 3:57 etwa 3:52), 90″ Trab Pause", "10′ Auslaufen"], "Schwelle bleibt im Plan, bis die Bricks übernehmen."),
  64: D("Lange Schwelle", "lauf", ["15′ Einlaufen", "2×20′ @84–86% max HF (ca. T + 13–18 s/km), 3′ Trab Pause", "10′ Auslaufen"], "2 lange Blöcke: so läuft man später 8 km mit müden Beinen sauber."),
  71: D("Schnelle Intervalle + Schwelle", "lauf", ["15′ Einlaufen", "6×4′ @T (bei T 3:57), 90″ Trab Pause", "10′ Auslaufen"], "Feiertage: reduziertes Volumen. Wenn die Zeit knapp ist, auf 4×4′ kürzen."),
  78: D("Pacing-Re-Test 4×1 km", "lauf", RT, RT_NOTE + " Deload-Woche, frische Beine: Block-C-Check."),
  58: D("Lauf Zone 2", "lauf", [`40′ locker ${EASY}`, STRIDES], SPARE),
  65: D("Lauf Zone 2", "lauf", [`45′ locker ${EASY}`, STRIDES], SPARE),
  72: D("Lauf Zone 2", "lauf", [`40′ locker ${EASY}`, STRIDES], SPARE + " Feiertage: auch 30′ sind in Ordnung."),
  61: D("Doubles-Simulation #1 (75%)", "sim", [
    "Eine vollständige Doubles-Simulation: alle 8 Stationen, alle 8 Laufkilometer, mit der fixierten Stationsaufteilung @75% Renngeschwindigkeit",
    "Zeit pro Lauf, pro Station und die Roxzone-Summe stoppen",
    "In der App unter Rennprognose → Simulation eintragen (inkl. Laufen gesamt und Roxzone gesamt)",
  ], "Zählt für die Eichung der Prognose erst ab 85 %, zeigt aber eine Untergrenze. Sonntag bleibt echte Erholung."),
  68: D("Doubles-Simulation #2 (85%)", "sim", [
    "Eine vollständige Doubles-Simulation @85% Renngeschwindigkeit, mit Lauf nach dem Sled Push bewusst auf Pace",
    "Zeit pro Segment und Roxzone stoppen, in der App eintragen (inkl. Laufen gesamt und Roxzone gesamt)",
  ], "Ab hier eicht die Prognose ihre Stationen an euren echten Zeiten (vorher erst ab 23.01.). Sonntag bleibt echte Erholung."),
  75: D("Lauf Zone 2, lang", "lauf", [`45′ locker ${EASY}`, STRIDES], "Feiertage: Wenn nötig auf 30′ kürzen. " + SPARE),

  // ---- Block D: Peak (W13–W16) ----------------------------------------------------------------
  85: D("Brick-Sessions", "lauf", ["4 Bricks (je 1 km Lauf, eine Station, 1 km Lauf) @4:08–4:12/km, ohne lange Pause", "Station je Brick wechselnd: SkiErg, Sled Push, Burpees, Wall Balls"], "Lauf direkt nach der Station auf Pace halten (4:05–4:10). Das ist die Schwäche aus St. Gallen (Lauf 3: 29 s langsamer)."),
  92: D("Brick-Sessions", "lauf", ["5 Bricks @4:05–4:10/km, ohne lange Pause", "Stationen im Rennmodus mit Rennzeit-Zielen"], "Lauf nach den Sleds auf Pace halten."),
  99: D("Brick-Sessions", "lauf", ["6 Bricks @Renn-Pace 4:05/km", "Stationen wie im Rennen, Partner wechseln wie fixiert"], "Letzter harter Brick-Tag."),
  106: D("Pacing-Re-Test 4×1 km (Schluss-Check)", "lauf", RT, RT_NOTE + " Letzte frische Messung vor dem Taper: Sie bestimmt die Zielpace für Basel."),
  86: D("Lauf Zone 2", "lauf", [`40′ locker ${EASY}`, STRIDES], SPARE),
  93: D("Lauf Zone 2", "lauf", [`40′ locker ${EASY}`, STRIDES], SPARE),
  100: D("Lauf Zone 2", "lauf", [`40′ locker ${EASY}`, STRIDES], SPARE),
  89: D("Doubles-Simulation #3 (90%)", "sim", [
    "Eine vollständige Doubles-Simulation @90% Renngeschwindigkeit, Aufteilung und Übergaben wie fixiert",
    "Zeit pro Lauf, Station und Roxzone, danach in der App eintragen (inkl. Laufen gesamt und Roxzone gesamt)",
  ], "Zweite Eichung für die Prognose. Sonntag bleibt echte Erholung."),
  96: D("Lauf Zone 2, lang", "lauf", [`60′ locker ${EASY}`, "Letzte 10′ @ca. T + 10 s/km, wenn die Beine gut sind"], SPARE),
  103: D("Doubles-Simulation #4 (95%)", "sim", [
    "Letzte volle Doubles-Simulation @95% Renngeschwindigkeit, Rennreihenfolge, Rennverpflegung, Rennkleidung",
    "Zeit pro Lauf, Station und Roxzone, in der App eintragen",
  ], "Danach keine volle Simulation mehr: 3 Wochen bis zum Rennen sind genug zur Erholung. Sonntag bleibt echte Erholung."),
  110: D("Rennrhythmus-Check", "sim", [
    "Lauf 1–4 @Renn-Pace 4:05/km mit SkiErg, Sled Push, Sled Pull, Burpee BJ in Rennreihenfolge @80–85%",
    "Übergaben und Roxzone stoppen, nichts Neues ausprobieren",
  ], "Letzter Reiz vor dem Taper, ohne Erschöpfung. Sonntag bleibt echte Erholung."),

  // ---- Taper (W17–W18) ------------------------------------------------------------------------
  113: D("Kurz und scharf", "lauf", ["15′ Einlaufen", "4×3′ @Renn-Pace 4:05/km, 2′ Trab Pause", "10′ Auslaufen"], "Beine wach halten, nichts anhäufen."),
  114: D("Lauf Zone 2", "lauf", [`30′ locker ${EASY}`, "4×15″ Steigerungen"], SPARE),
  117: D("Renn-Aktivierung", "sim", [
    "3× (1 km Lauf @Renn-Pace 4:05/km, dann Station-Übergabe auf Zeit), zwischen den Wiederholungen 3′ locker",
    "Aufteilung und Wechsel im Kopf durchgehen: Wer startet an welcher Station?",
  ], "Statt der bisher geplanten Simulation 7 Tage vor dem Rennen: Das ist Aktivierung, kein Test. Sonntag bleibt echte Erholung."),
  120: D("Kurz und scharf", "lauf", ["15′ Einlaufen", "3×2′ @Renn-Pace 4:05/km, 2′ Trab Pause", "10′ Auslaufen"], "Zwei Tage Pause bis zum Rennen. Zahlen stehen jetzt, nichts Neues."),
  121: D("Lauf Zone 2", "lauf", [`20′ locker ${EASY}`, "4×15″ Steigerungen"], ""),
  122: D("Nur Technik", "station", ["Alle Stationen in kleinem Umfang ohne Zeitdruck, nur Bewegungsqualität", "Zwei Übergabe-Drills ohne Last"], "Kein Erschöpfungsreiz. Fr ist Ruhetag, Sa ist das Rennen."),
};

/** Zusatzzeilen für Tage, die sonst unverändert bleiben (Kraft 1 und Kraft 2/Stationen): Lunges und Wall Balls, Roxzone. */
const LW = (lunges, wb) => [`Finisher: Sandbag Lunges ${lunges} @Renngewicht 30 kg, danach Wall Balls ${wb} @9 kg`];
const RZ = "Bei jedem Stationswechsel die Übergabe stoppen (Ziel unter 8 s) und aufschreiben";
export const APPEND = {
  // Montag (Kraft 1): Beinkraft für Lunges/Wall Balls
  28: LW("2×20 m", "2×12"), 35: LW("3×20 m", "3×12"), 42: LW("3×25 m", "3×15"),
  56: LW("3×25 m", "3×15"), 63: LW("4×20 m", "3×15"), 70: LW("3×20 m", "3×12"),
  84: LW("3×25 m", "4×15"), 91: LW("4×25 m", "4×15"), 98: LW("3×25 m", "3×15"),
  // Donnerstag (Kraft 2/Stationen): Lunges und Wall Balls unter Ermüdung, Roxzone auf Zeit
  31: [`Lunges-Wall-Ball-Block: 3× (25 m Sandbag Lunges @30 kg, direkt danach 15 Wall Balls @9 kg), 90″ Pause`, RZ],
  38: [`Lunges-Wall-Ball-Block: 4× (25 m Sandbag Lunges @30 kg, direkt danach 15 Wall Balls @9 kg), 90″ Pause`, RZ],
  45: [`Lunges-Wall-Ball-Block: 4× (50 m Sandbag Lunges @30 kg, direkt danach 20 Wall Balls @9 kg), 2′ Pause`, RZ],
  59: [`Lunges-Wall-Ball-Block: 4× (50 m Sandbag Lunges @30 kg, direkt danach 20 Wall Balls @9 kg), 90″ Pause`, RZ],
  66: [`Lunges-Wall-Ball-Block: 5× (50 m Sandbag Lunges @30 kg, direkt danach 25 Wall Balls @9 kg), 90″ Pause`, RZ],
  73: [`Lunges-Wall-Ball-Block: 3× (50 m Sandbag Lunges @30 kg, direkt danach 20 Wall Balls @9 kg), 90″ Pause`, RZ],
  87: [`Lunges-Wall-Ball-Block: 3× (50 m Sandbag Lunges @30 kg, direkt danach 25 Wall Balls @9 kg), 90″ Pause`, RZ],
  94: [`Lunges-Wall-Ball-Block: 4× (50 m Sandbag Lunges @30 kg, direkt danach 25 Wall Balls @9 kg), 90″ Pause`, RZ],
  101: [`Lunges-Wall-Ball-Block: 2× (50 m Sandbag Lunges @30 kg, direkt danach 25 Wall Balls @9 kg), 2′ Pause`, RZ],
};

/**
 * Geplante Lauf-Kilometer pro Woche, aus den Einheiten geschätzt (Einlaufen 5:30/km, locker 5:35, Schwelle 4:13, T 3:57, Bricks 2 km, Simulation 8 km, ohne Rennen).
 * Vergleich: Block A lief etwa 8–17 km pro Woche, der bisherige Plan lag in Block C/D bei 7–13 km (nur die Simulationen) und in W7 bei 26.
 * Aufbau gegenüber der letzten Belastungswoche höchstens ca. +25 %, Deload und Taper reduziert.
 */
export const WEEK_KM = { 5: 21, 6: 26, 7: 31, 8: 11, 9: 28, 10: 29, 11: 27, 12: 12, 13: 27, 14: 32, 15: 31, 16: 18, 17: 17, 18: 10 };

/** Plan-v10-Tag aus dem Basis-Tag (LATER_DAYS oder Blockmuster) bauen. */
export function patchDay(idx, base) {
  if (OVERRIDE[idx]) return { ...OVERRIDE[idx], i: [...OVERRIDE[idx].i] };
  if (APPEND[idx] && base) return { ...base, i: [...(base.i || []), ...APPEND[idx]] };
  return base;
}
