# Dashboard nach dem Training: welche Daten gezeigt werden

Neustart auf Wunsch von Jaime (09.11.2026). Kein Mockup, nur der Datenplan. Die früheren Entwurfsseiten sind verworfen (zu voll, zu bunt). Nichts in `index.html` oder `src/` geändert.

## Entscheidungen von Jaime
1. Immer sichtbar: **Ø Puls nur Arbeit** und **Datenlage der Uhr**.
2. Je Einheitenart eine Hauptzahl: **Kraft** Gewichte je Satz, **Lauf-Intervall** Pace Arbeit und Puls-Drift, **Stationstag** Kompromiss-Delta.
3. **Kein Urteil**: keine Punktzahl, kein Ring, keine Ampel, kein Satz. Nur Zahlen.
4. Aufklappbar: **Plan gegen Ist** und **Vergleich mit der letzten gleichen Einheit**. Alles, was nicht genannt wurde, fällt weg.

## Ebene 1: immer sichtbar
| Daten | Lauf-Intervall | Stationstag | Kraft | Quelle im Code |
|---|---|---|---|---|
| Datenlage | Garmin übernommen, Runden n, Puls in n von n Runden, Phasen-Erkennung | gleich | Garmin übernommen, «1 Runde» | `sourceInfo()`, `dataState()` (session-dash.js, dash-all.js) |
| Ø Puls nur Arbeit | Schnitt der Arbeitsrunden | Läufe und Stationen | **keine Daten, Grund: Uhr hat 1 Runde aufgezeichnet**; ganzes Training nur als kleine Zeile | `phaseStats().work.hr` |
| Hauptzahl 1 | Pace Arbeit (/km) | Kompromiss-Delta Ø (s/km) | Schwerster Satz je Übung | `work.pace`; `compromise.avg`; `parseSets()` (weights.js) |
| Hauptzahl 2 | Puls-Drift (bpm, erstes gegen letztes Drittel) | Delta je Station, schlechtester Wert markiert | ▲▼ gegen letzte vergleichbare Einheit, Wiederholungen unter Plan | `drift`; `compromise.worst`; `comparable()` (progression.js) |

Das sind höchstens 4 Zahlen plus 1 Zeile Datenlage pro Einheit.

## Ebene 2: aufklappbar
- **Plan gegen Ist:** Ziel, Ist, Δ je Intervall bzw. Station bzw. Satz. Quelle: `phaseStats().plan`. Für Kraft neu: Soll-Ist je Satz aus Plan-Schema und `parseSets()`.
- **Vergleich mit der letzten gleichen Einheit:** Pace, Puls, Gewichte. Quelle: `compareToPrev()`. Für Kraft neu: Vergleich der schwersten Sätze (Volumen nur, wenn alle Gewichte eingetragen sind).

## Fällt weg (heute vorhanden)
Punktzahl und Ring, Kurzurteil, Chips Form/Stärken/Schwächen/Anpassungen, «Nächstes Mal», Kachel Umsetzung (Haken-Quote), Kachel Anstrengung (RPE), Rundenbalken, Phasenbalken, Zeit in Zonen, Erholung in der Pause, Streuung der Läufe.
Folge: RPE und Haken verschwinden aus dem Dashboard. Sie bleiben in der App erfasst.

## Regeln für fehlende Daten (gelten überall)
- Nie eine Zahl erfinden oder einen Ersatz zeigen. Stattdessen **«keine Daten, Grund: …»** mit dem konkreten Grund (keine Uhr-Aktivität, 1 Runde, Puls nur in x von y Runden, kein Gewicht eingetragen).
- Keine Uhr-Aktivität: nur die Datenlage-Zeile mit Knopf «Jetzt abrufen». Plan gegen Ist zeigt das Ziel, Ist bleibt leer.
- «Höchster Wert» ist ein Rundenschnitt, kein Maximalpuls: so beschriften.
- Stationstag: Referenz ist nur 1 km, das als Hinweis bei Kompromiss-Delta.
- Phasen-Erkennung «wahrscheinlich/unsicher»: Arbeitszahlen mit Hinweis markieren (`confText()`).
- Wiederholungen ohne Eintrag zählen als Plan: nicht als gemessen darstellen.

## Optik
Wie die App: dunkel, Glas-Hintergrund, Kacheln und Karten der bestehenden Auswertung (`.an-dash`, `.dt`, `.dsrc`, `.dmore`), Farbe nur für «nicht im Ziel». Die App hat keinen Hellmodus: nicht Teil dieses Plans.

## Offene Fragen an Jaime
1. Bleibt der Analyse-Fließtext der App (Stärken, Schwächen, Anpassungen) unter dem Dashboard, oder fällt auch er weg? Heute steht er darunter.
2. Bei Kraft ist «Ø Puls Arbeitssätze» ohne Lap-Taste je Satz nicht berechenbar. Willst du die Lap-Taste drücken, oder bleibt es dauerhaft «keine Daten»?
3. Trägst du bei Kraft Wiederholungen je Satz ein? Ohne sie sind «Wiederholungen unter Plan» nicht möglich.
4. Ist es richtig, dass RPE und Haken im Dashboard ganz fehlen sollen (nur noch in der Erfassung)?

## Nächster Schritt
Du bestätigst oder korrigierst diesen Plan. Danach genau ein Mockup mit genau diesen Daten, nicht vier.
