# Plan: Garmin-Runden den Planzeilen zuordnen

Stand 18.10.2026. Nur Plan, noch kein Code.

## Ziel

Bei Zirkeln, Compromised Running, Bricks und Simulationen drückt der Nutzer an der Uhr bei jedem Wechsel die Runden-Taste (Lauf → Station → Lauf …). Beim Übernehmen soll die App:

1. die Runden den Planzeilen zuordnen (welcher Lauf, welche Station),
2. pro Runde das **Kompromiss-Delta** berechnen (Laufsplit direkt nach einer Station minus frischer Vergleichssplit),
3. **nur die Planzeilen abhaken, die in den Runden wirklich vorkommen** (4 von 8 gemacht → 4 abgehakt),
4. bei reinen Läufen ohne Intervalle nur die Gesamtwerte übernehmen, keine Intervallzeiten.

## Ausgangslage im Code (gelesen)

- `strava-take` (index.html) hakt heute **alle** Zeilen ab (`p.i.forEach(... S.done = 1)`), schreibt `strava.summary(a)` in die erste Zeile und bei erkannten Intervallen `dash.repSummary` in die Intervall-Zeile.
- `dash.intervals()` erkennt Belastungsrunden nur über Pace (Lauf). Stationsrunden ohne Distanz fallen heraus (`paceOf` braucht ≥ 100 m).
- **Wichtig:** Die Edge Function `garmin` holt Runden (`/splits`) nur für die Gruppen `run, row, ride, ski` (supabase/functions/garmin/index.ts, `withLaps`). Ein Zirkel, der auf der Uhr als HIIT, Indoor-Cardio oder Krafttraining aufgezeichnet wird, landet in der Gruppe `strength` und **bekommt heute keine Runden**. Das muss als Erstes geändert werden.
- `normalizeLaps` liefert `{d, t, hr, w}`. Für Stationsrunden auf dem Laufband/Indoor ist `d` oft 0 oder ungenau.
- `fits()` erlaubt für `station` und `sim` schon `run, row, ski, strength`.

## 1. Garmin-Seite (Edge Function)

- `withLaps` um die Gruppe `strength` erweitern, aber nur für `hiit`, `indoor_cardio`, `training`, `other_fitness` und `running` (Krafttraining ohne Runden bleibt aussen vor, um Abrufe zu sparen).
- Limit 15 pro Abruf bleibt; bereits bekannte (`have`) werden nicht neu geholt.
- Zusätzlich pro Runde den **Aktivitätstyp der Runde** mitnehmen, falls Garmin ihn liefert (Multisport/HIIT kennt Intervall-Typen: `INTERVAL_ACTIVE`, `INTERVAL_REST`). Feld `k` in `normalizeLaps`: `"active" | "rest" | null`. Optional, der Algorithmus funktioniert auch ohne.

## 2. Zuordnungs-Algorithmus (neues Modul `src/laps.js`, reine Funktionen)

### 2.1 Plan-Vorlage aus dem Text ableiten: `planTemplate(day)`

Aus den Planzeilen eine erwartete Reihenfolge von Segmenten bauen: `[{type: "run"|"station"|"pause", dist?, label, row}]`. `row` = Index in `day.i`, damit später genau diese Zeile abgehakt wird.

| Plantext | Vorlage |
|---|---|
| `5′ Einlaufen` / `10′ Rad einfahren, 5′ Einlaufen` | `warmup` (optional) |
| `4 Runden mit Jimoh: 1 km @ R → 25 m Sandbag Lunges → 25 Wall Balls, 3′ Pause` | 4 × `[run 1000, station "Lunges", station "Wall Balls", pause]` |
| `3 Runden: 800 m @ R → 25 m Sled Push → 20 Wall Balls` | 3 × `[run 800, station, station, pause]` |
| `Run 1–4 mit SkiErg 1000 m, Sled Push 50 m, Sled Pull 50 m, BBJ 80 m` | `[run 1000, station Ski, run 1000, station Push, …]` |
| `Volle Simulation … 8×1 km und alle 8 Stationen` | 8 × `[run 1000, station i]` (Stationsreihenfolge fix) |
| `5×1 km mit Jimoh @ S, 90″ Trabpause` | 5 × `[run 1000, pause]` (reines Intervall) |
| `Lockerer Lauf 40′` | keine Vorlage → Modus „gleichmässig“ |
| `5′ Auslaufen` | `cooldown` (optional) |

Stationsnamen über die bestehende `stationIndex()` aus `src/testsync.js`. Rundenzahl aus `(\d+) Runden`, Laufdistanz aus `(\d+(?:,\d+)?) ?(km|m) @`.

### 2.2 Runden klassifizieren: `classifyLaps(laps)`

Pro Runde ein Typ, ohne Plan:

- **run**: `d ≥ 300 m` und Pace zwischen 2:45 und 7:30 /km.
- **station**: `d < 250 m` oder Pace > 8:00 /km oder keine Distanz, Dauer 20″ bis 8′.
- **pause**: Dauer < 20″ (Fehldruck) oder Garmin-Typ `rest`, oder Herzfrequenz deutlich unter dem Schnitt und kein Fortschritt.
- **warmup/cooldown**: erste bzw. letzte Runde, langsamer als Zone 2 + 30 s, länger als 4′.

### 2.3 Vorlage und Runden abgleichen: `matchLaps(template, laps)`

Sequenz-Abgleich (Needleman-Wunsch-artig, kleine Matrix, max. 80 Runden × 40 Segmente):

- Kosten 0 für passenden Typ, 1 für fehlendes Segment (nicht gemacht oder nicht gedrückt), 1 für zusätzliche Runde.
- Lauf-Runden zusätzlich nach Distanz gewichtet: Abweichung > 25 % kostet 0,5.
- Ergebnis: Liste `[{seg, lap | null}]` plus eine Güte `0–1` (Anteil sauber zugeordneter Segmente).

**Sonderfälle:**

| Fall | Erkennung | Behandlung |
|---|---|---|
| Auto-Lap (jeder km automatisch) | fast alle Runden 1000 m ± 20 m, gleichmässig | Bei Zirkeln Warnung „Auto-Lap ist an – bitte ausschalten“. Bei reinen Intervallen weiterhin `dash.intervals` nutzen |
| Runde vergessen (Lauf + Station in einer Runde) | Runde deutlich länger als Lauf, Pace zu langsam | Als `run+station` markieren, Laufsplit **nicht** für das Delta nutzen |
| Doppelt gedrückt | Runde < 20″ | mit der vorigen zusammenlegen |
| Pause als eigene Runde | Herzfrequenz fällt, kaum Distanz | `pause`, zählt nicht |
| Abgebrochen nach 4 von 8 | Vorlage länger als Runden | Nur zugeordnete Segmente zählen als gemacht |

Bei Güte < 0,6: keine automatische Zuordnung, nur die Gesamtwerte übernehmen und das Abhaken dem Nutzer überlassen (mit Hinweis).

### 2.4 Kompromiss-Delta: `compromise(matches)`

- **Frischer Vergleich**: der erste Laufsplit **ohne Station davor** (so steht es im Plan: „Die erste Runde ohne Station davor laufen“). Fehlt er, den schnellsten Laufsplit der Einheit nehmen und als „geschätzt“ markieren.
- **Delta pro Runde**: Pace des Laufs direkt nach einer Station minus frische Pace, in s/km. Läufe auf andere Distanz (800 m) über Pace vergleichen, nicht über Zeit.
- Ergebnis: `{fresh: 232, deltas: [{after: "Wall Balls", pace: 247, delta: +15}], avg: +12, worst: {after, delta}}`.

### 2.5 Abhaken und Werte: `applyLaps(day, matches)`

- Abgehakt wird eine Planzeile nur, wenn **alle** ihre Segmente eine Runde haben. „4 Runden: …“ als eine Zeile wird abgehakt, wenn mindestens die geplante Rundenzahl erreicht ist; sonst bleibt sie offen und bekommt den Wert „3 von 4 Runden“.
- Ein- und Auslaufen werden abgehakt, wenn eine Warmup- bzw. Cooldown-Runde da ist.
- Wert pro Zeile: Laufzeilen bekommen die Splits („3:52 · 3:58 · 4:01“), Stationszeilen die Stationszeit, die Rundenzeile eine Kurzfassung mit Delta („Ø Delta +12 s/km, schlimmste nach Wall Balls +21“).
- **Bestehende Handeinträge werden nie überschrieben** (wie bei testsync `onlyEmpty`).
- Reiner Lauf ohne Intervall-Vorlage (Lockerer Lauf, Zone 2): nur `strava.summary(a)` in die erste Zeile, keine Intervallzeiten.

## 3. Datenmodell

- Abhaken und Werte wie bisher in `S.done` und `S.val` (Schlüssel `datum|zeile`). Das ist schon synchronisiert.
- Neues Feld **`S.cr`** (compromised running) pro Datum: `{datum: {fresh, avg, worst: {after, delta}, deltas: [{after, delta}], src: "garmin", act: id}}`. Klein und für Verlauf/Wochenrückblick direkt lesbar.
- `S.cr` in `MAP_FIELDS` (src/merge.js), in `def()`, in `history.sql` (`plan_entries`) und in `swapDayData` (src/swap.js) aufnehmen, wie bei `later`.
- Backup nimmt den ganzen Zustand, braucht keine Änderung.

## 4. UI

### 4.1 Vorschau vor dem Übernehmen

Statt sofort abzuhaken, öffnet „Übernehmen“ eine Karte (in `stravaBox`):

```
Garmin · HIIT · 42:10 · Ø 158 bpm          Güte: gut
✓ 5′ Einlaufen                 5:12
✓ 4 Runden: 1 km → Lunges → WB  4/4
    1 km  3:58  (frisch)
    Lunges 1:05 · WB 1:20
    1 km  4:12  +14 s/km nach Wall Balls
    …
○ 5′ Auslaufen                 nicht erkannt
Kompromiss-Delta Ø +12 s/km (Ziel ≤ +15)
[Übernehmen]  [Nur Gesamtzeit]  [Abbrechen]
```

- Jede Zeile hat ein Häkchen, das der Nutzer vor dem Übernehmen noch ändern kann.
- „Nur Gesamtzeit“ = Verhalten wie bei einem reinen Lauf.
- Bei Auto-Lap oder schlechter Güte steht oben ein Hinweis mit dem Grund.

### 4.2 Anzeige danach

- In der Einheit unter der Rundenzeile: Delta pro Runde als kleiner Balken (grün ≤ +10, gelb ≤ +20, rot darüber).
- **Wochenrückblick**: neue Kennzahl „Kompromiss-Delta“ (Ø der Woche, Vergleich zur Vorwoche), in der Kachelreihe.
- **Dashboard**: Verlauf „Kompromiss-Delta pro Einheit“ (Liniendiagramm mit `dash.lineChart`, Zielband +10 bis +15 s). Die Meilensteine aus Plan v9 (W13 ≤ +15, W15 ≤ +10) als Markierung.

## 5. Anleitung für die Uhr (kommt in die App und ins Plan-PDF)

1. **Profil**: „HIIT“ oder „Laufen“ wählen. Bei „Laufen“ funktioniert GPS draussen, bei „HIIT“ / „Indoor Cardio“ drinnen. Krafttraining-Profil nicht nehmen (Satzerkennung stört die Runden).
2. **Auto-Lap ausschalten** (Einstellungen des Profils → Runden → Auto Lap → Aus). Sonst setzt die Uhr jeden Kilometer selbst eine Runde.
3. **Runde drücken**: am Start des Einlaufens, am Ende des Einlaufens, bei **jedem Wechsel** Lauf → Station und Station → Lauf, vor der Pause, nach der Pause, vor dem Auslaufen.
4. Doppelt gedrückt oder vergessen ist kein Problem, die App gleicht das aus. Nur nicht während einer Station mehrfach drücken.
5. Nach dem Training wie gewohnt synchronisieren und in der App „Übernehmen“ tippen.

## 6. Testfälle (`test/laps.test.js`, node --test)

```js
// Compromised Running W10: 4 Runden 1 km → Lunges → Wall Balls
const laps = [
  { d: 850, t: 300 },                  // Einlaufen 5′
  { d: 1000, t: 232 },                 // Lauf 1 (frisch)
  { d: 25, t: 65 }, { d: 0, t: 80 },   // Lunges, Wall Balls
  { d: 120, t: 180 },                  // Pause
  { d: 1000, t: 246 },                 // Lauf 2 nach WB: +14
  { d: 30, t: 70 }, { d: 0, t: 85 },
  { d: 100, t: 180 },
  { d: 1000, t: 251 },                 // Lauf 3: +19
  // abgebrochen nach Runde 3
];
```

| Test | Erwartung |
|---|---|
| `planTemplate` W10 Mittwoch | 4 × [run 1000, Lunges, WB, pause] plus Warmup/Cooldown |
| `classifyLaps` obige Runden | run, station, station, pause … |
| `matchLaps` bei Abbruch nach 3 von 4 | Güte ≥ 0,7, Rundenzeile „3 von 4“, **nicht** abgehakt, Einlaufen abgehakt |
| `compromise` | fresh 232, deltas [+14, +19], avg +16,5 |
| Auto-Lap (10 × 1000 m gleichmässig) bei Zirkel | Warnung „Auto-Lap“, keine Zuordnung |
| Doppeldruck (Runde 8″) | wird zusammengelegt, Ergebnis wie ohne |
| Vergessene Runde (Lauf + Station = 1 Runde, 1080 m in 5:40) | als run+station, kein Delta für diese Runde |
| Lockerer Lauf 40′ mit 8 Auto-Lap-Runden | nur Gesamtwerte, keine Intervallzeiten |
| Intervall `5×1 km` | wie bisher `repSummary`, Ergebnis unverändert |
| Handeintrag vorhanden | wird nicht überschrieben |
| Halb-Simulation „Run 1–4 mit SkiErg, Sled Push, Sled Pull, BBJ“ | 8 Segmente, Stationen in Reihenfolge erkannt |

Dazu ein Garmin-Test in `test/garmin.test.js`: `normalizeLaps` mit `intervalType` → Feld `k`.

## 7. Reihenfolge und Aufwand

| Schritt | Inhalt | Aufwand |
|---|---|---|
| 1 | **Sofort-Fix ohne Runden**: „Übernehmen“ hakt nicht mehr alles ab, sondern zeigt die Zeilen zum Auswählen (vorbelegt: alle bei vollständigem Plan-Match, sonst keine). Reiner Lauf ohne Intervallzeile: nur Gesamtwerte | 1–2 h |
| 2 | Edge Function: Runden auch für HIIT/Indoor-Cardio holen, `k` mitgeben, deployen | 1 h |
| 3 | `src/laps.js`: `planTemplate`, `classifyLaps`, `matchLaps`, `compromise`, `applyLaps` + Tests | 4–6 h |
| 4 | Vorschau-Karte im Tag, Übernahme schreibt `S.done`, `S.val`, `S.cr` | 2–3 h |
| 5 | `S.cr` in Sync, History, Swap, Backup prüfen | 0,5 h |
| 6 | Wochenrückblick-Kachel und Dashboard-Verlauf | 2 h |
| 7 | Anleitung in der App (Hilfe bei der Vorschau) und im Plan-PDF | 0,5 h |

Gesamt etwa 11–15 h. Schritt 1 löst das dringendste Problem (alles wird abgehakt) und lässt sich unabhängig vorziehen.

## 8. Offene Fragen

1. **Welches Profil nutzt du auf der Uhr für Zirkel** (HIIT, Indoor Cardio, Laufen)? Davon hängt ab, ob Garmin Distanzen pro Runde liefert.
2. Welches Uhrenmodell? Ältere Modelle liefern für HIIT keine Intervall-Typen.
3. Sollen auch **Zusatz-Einheiten** von Garmin automatisch angelegt werden (z. B. ein nicht geplanter Lauf am Ruhetag als Zusatz „Lauf Zone 2, 35′“)? Technisch passt das zu `reconcile` (Aktivität ohne Plan-Treffer) und `makeExtra`.
4. Jimoh zeichnet oft dieselbe Einheit auf: Soll sein Delta im Doubles-Vergleich auftauchen, oder nur das eigene?
5. Delta-Ziel: Plan v9 sagt ≤ +15 s (W13) und ≤ +10 s (W15). Passt das als Ampel-Grenze?
