# Plan: Rundenübernahme Compromised Running (v3)

Stand 28.11.2026. Nur Analyse und Plan, kein Produktivcode geändert. Baut auf `PLAN_RUNDENUEBERNAHME_V2.md` auf.

## 1. Befund: Warum «nicht zuordenbar»?

Der Abruf ist nicht das Problem. Die Runden kommen über `/activity-service/activity/{id}/splits` an. Es scheitert an der Zuordnung.

### Ursache A (Hauptursache, nachgestellt): Eine einzige Unregelmässigkeit macht den ganzen Rest «unsicher»

`src/align.js:103–118`: Sobald vor einem Schritt irgendetwas nicht 1:1 passt, wird `rigid = false`. Danach wird für **keinen** weiteren Schritt die Eindeutigkeit geprüft (`alt = null`), und alle folgenden Schritte sind «nicht sicher». Als Unregelmässigkeit zählt schon:
- eine zusätzliche Runde ab 20 s (Übergang, doppelt gedrückt),
- ein vergessener Druck (zwei Schritte in einer Runde) oder ein Schritt ganz ohne Runde,
- ein einziger Schritt, der selbst als unsicher gilt.

Eine Abweichung vom Planziel über 13 % (`anomaly`, Zeile 97) setzt `rigid` nicht. Sie verschärft aber die Prüfung (`distinct`): Der Schritt muss sich dann klar von seinen Nachbarschritten abheben.

Nachgestellt mit `src/align.js` (Plan: 4 × SkiErg 500 m (Ziel 1:55) → 1 km (4:05) → 120 s Pause; ✓ = sicher, ? = unsicher, – = Pause):

| Fall | Ergebnis heute |
|---|---|
| 12 Runden, genau wie geplant | alles übernommen (`alignSplits` «direct») |
| Läufe 5:00 statt 4:05, Ski 2:30 statt 1:55 | alles übernommen (Rundenzahl stimmt, es wird gar nicht geprüft) |
| **+1 Übergangsrunde 25 s nach Runde 1** | `✓✓-??-??-??-`, Güte 0,25 |
| 1 Druck vergessen in Runde 2 | `✓?-??-??-??-`, Güte 0,13 |
| Pausen nicht gelappt + 1 Übergang | `✓?-??-??-??-`, Güte 0,13 |
| Absturz nach 7 Runden | `✓✓-✓✓-??-??-`, Güte 0,80 |

Fazit: Die Regel ist widersprüchlich. Stimmt die Rundenzahl genau, wird **blind** übernommen, auch bei 30 % Abweichung. Ist eine harmlose 25-s-Runde zu viel, wird ab dort **nichts** mehr übernommen. Bei 8 Runden (24 Schritten) ist eine solche Kleinigkeit fast sicher, darum scheitert es gerade bei langen Einheiten.

### Ursache B (strukturell): Station und Pause sind für den Algorithmus gleich

Die Kosten nutzen nur **Dauer** und **Distanz ≥ 300 m** (Zeilen 27–29). SkiErg 1:55 und Pause 2:00 sind nach Dauer gleich, und beide haben keine Strecke. Ohne einen weiteren Hinweis lässt sich eine Verschiebung um eine Runde nicht ausschliessen. **Der Puls wird nicht genutzt**, obwohl jede Runde ihn mitbringt (`hr`). In der Pause fällt er deutlich, auf der Station steigt er.

Experiment in einer Kopie (nicht im Repo): Ohne die `rigid`-Sperre steigt die Güte im Übergangsfall von 0,25 auf 0,50. Dafür **schlägt der Zufallstest fehl** (`test/align.test.js` #8, eine falsche Runde wird als «sicher» gemeldet). Die Sperre einfach zu lockern ist also falsch. Es fehlt ein zusätzliches Signal.

### Ursache C (wahrscheinlich, je nach Plantext): Manche Compromised-Running-Tage haben gar keine Schritte

`s7Steps` (`index.html:22854`) erzeugt Schritte nur aus Zeilen im Format `Runde N: Station (Ziel m:ss) → 1 km @ m:ss/km (m:ss), X Pause`. Zeilen wie **«Compromised Running 2×10′ Zone 3, 2′ Pause»** (`src/plan-data.js`, `src/plan-later.js`) ergeben `null`. Auch `parseReps` versteht nur Distanzen (`4×1 km`), keine Minuten. An solchen Tagen gibt es keinen Weg, der Runden zuordnet.

### Ursache D (Diagnose blind): Der Knopf zeigt den Grund nicht

`diagText` (`index.html:15328`) gibt die Ergebnisse von `alignSplits` und `alignFuzzy` aus (beide bei Abweichungen `null`) und dazu `watchCheck`. Das Ergebnis von `alignLaps` selbst fehlt: `sure` je Schritt, `quality`, `cost` und der **Grund**. Deshalb sagt die Diagnose nur «nicht zuordenbar».

### Nebenbefund (Abruf)

Antwortet Garmin auf `/splits` mit 404 oder leer, setzt `index.ts:183` trotzdem `lapsV = 3` mit `laps = []`. Die Einheit wird nie wieder abgefragt.

## 2. Lösungsansatz (Reihenfolge nach Nutzen/Aufwand)

1. **Diagnose ehrlich machen (klein, zuerst).** `alignLaps` vollständig in die Diagnose aufnehmen, dazu ein Grund je unsicherem Schritt (`"nach Zusatzrunde 4 (25 s)"`, `"Station/Pause nach Zeit nicht unterscheidbar"`). Die Rohfelder der Garmin-Runden (Feldnamen, ohne Werte) mitschicken, damit Punkt 5 prüfbar wird. In der App-Meldung den Grund in einem Satz anzeigen statt nur «nicht zuordnen».
2. **Übergangsrunden vor der Zuordnung bereinigen.** Runden < 45 s ohne Strecke (< 100 m), deren Dauer zu keinem Planschritt passt (kein Schritt mit Ziel < 60 s), als «Übergang» markieren und an die Nachbarrunde hängen. Sie zählen dann nicht mehr als Unregelmässigkeit. Damit fällt der häufigste Fall weg. Risiko (Prüfer): Echte kurze Runden könnten verschluckt werden, und die Zeit des Nachbarn wird länger. Deshalb die Übergangszeit getrennt ausweisen (`trans`) und nicht in die Schrittzeit rechnen.
3. **Puls als drittes Signal.** Typ-Kosten aus dem Pulsverlauf: Eine Pausenrunde hat einen deutlich tieferen Ø-Puls als die Arbeitsrunde davor (z. B. ≥ 8 Schläge oder ≥ 5 %). Damit lassen sich Station und Pause unterscheiden, und eine Verschiebung um eine Runde wird teuer. Fehlt der Puls, gilt das bisherige Verhalten.
4. **`rigid` ersetzen durch eine gezielte Verschiebungsprüfung.** Statt «nach der ersten Unregelmässigkeit nichts mehr» für jeden Schritt rechnen: beste Lösung, wenn dieser Schritt um ±1 Runde bzw. ±1 Planperiode verschoben ist. Sicher nur, wenn der Abstand ≥ `MARGIN` ist. Erst mit Punkt 3 einschalten, denn ohne Puls fällt der Zufallstest (siehe Experiment).
5. **Langfristig der robusteste Weg: Workout auf die Uhr schicken.** `push-workout` gibt es schon für Lauftage (`src/garmin-workout.js`). Für Compromised-Running-Tage ein strukturiertes Workout mit «Schritt endet per Lap-Taste» schicken. Dann führt die Uhr durch die Schritte, die Rundenzahl entspricht der Schrittzahl, und `alignSplits` «direct» greift. Möglicherweise liefert Garmin dazu je Runde den Workout-Schritt (`wktStepIndex`/`intensityType` in `lapDTOs`). **Nicht geprüft**, Punkt 1 klärt es mit echten Daten. Falls ja: Zuordnung über den Index, ohne jede Schätzung.
6. **Minuten-Intervalle verstehen (Ursache C).** Parser für `N×M′ …, P′ Pause` → Schritte Lauf (Ziel M·60 s) und Pause. Danach läuft dieselbe Zuordnung.
7. **Blinde Übernahme bei gleicher Rundenzahl absichern.** Auch bei «direct» Typ und Puls prüfen. Weicht etwas grob ab (z. B. Laufrunde ohne Strecke bei GPS-Profil), die Vorschau anzeigen statt still einzutragen.
8. **Nebenbefund beheben:** `lapsV = 3` nur setzen, wenn Garmin wirklich geantwortet hat. «Noch nicht verfügbar» (404/204 kurz nach dem Hochladen) von «Aktivität hat keine Runden» trennen, z. B. mit Wiederholung bis 48 h nach dem Start.

## 3. Sessions (Aufpasser schreibt keinen Produktivcode, Macher schreibt nicht seine eigene Abnahme)

- **S0 Aufpasser:** Spec-Ergänzung `docs/laps-v3-spec.md` mit Abnahmetabelle (Fälle unten). **Stopp: Jaime bestätigt.**
- **S1 Macher:** Punkt 1 (Diagnose) + 8 bauen. Jaime liefert 2–3 echte Diagnosen von Compromised-Running-Tagen → Fixtures `test/fixtures/laps-cr-*.json`.
- **S2 Macher:** Punkte 2, 3, 4 in `src/align.js`. Bestehende Tests bleiben unverändert grün, und der Zufallstest bekommt Puls-Varianten dazu.
- **S3 Aufpasser blind:** Fuzz-Review, mindestens 20 000 Läufe. Keine falsche «sichere» Zuordnung. Danach Abdeckung messen.
- **S4 Macher:** Punkte 6 und 7, danach Punkt 5, sofern S1 zeigt, dass Garmin den Schritt-Index liefert.
- **S5 Aufpasser:** Endabnahme mit echten Fixtures, Screenshot der Vorschau, dann PR.

## 4. Abnahmefälle (zusätzlich zu v2)

| # | Fall | Erwartung |
|---|---|---|
| 15 | +1 Übergangsrunde 25 s | alle Schritte sicher |
| 16 | +3 Übergangsrunden verteilt (8 Runden) | alle sicher |
| 17 | 1 Druck vergessen in Runde 2, Puls vorhanden | Runde 2 unsicher, **Runden 3–8 sicher** |
| 18 | wie 17, ohne Puls | Runde 2 unsicher, danach höchstens «unsicher», nie falsch |
| 19 | Station 1:55 und Pause 2:00, Puls fällt in der Pause | keine Verwechslung |
| 20 | «Compromised Running 2×10′, 2′ Pause» | 2 Läufe zugeordnet |
| 21 | gleiche Rundenzahl, aber Runden vertauscht (Lauf ohne Strecke) | Vorschau statt stiller Übernahme |
| 22 | Garmin `/splits` 404 | beim nächsten Sync neu gefragt |

Ziel: Güte ≥ 0,9 bei den Fällen 15–17. 0 falsche «sichere» Zuordnungen im Fuzz-Test.

## 5. Annahmen und offene Fragen

1. Deine Compromised-Running-Tage folgen dem Format `Runde N: … → 1 km …` (Ursache A/B). Bei `2×10′` greift Ursache C. **Welches Format haben deine betroffenen Tage?**
2. Du drückst bei jedem Wechsel die Lap-Taste, auch vor der Pause.
3. Der Puls ist in den Runden vorhanden (Brustgurt oder Handgelenk). Ohne Puls bringen Punkt 3 und 4 wenig.
4. Ob Garmin in `lapDTOs` den Workout-Schritt mitliefert, ist ungeprüft.
