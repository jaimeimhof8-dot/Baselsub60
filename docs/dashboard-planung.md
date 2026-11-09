# Dashboard nach dem Training: welche Daten gezeigt werden

Neustart auf Wunsch von Jaime (09.11.2026). Nur der Datenplan, kein Mockup. Die früheren Entwurfsseiten sind verworfen (zu voll, zu bunt). Nichts in `index.html` oder `src/` geändert.

## Entscheidungen von Jaime
1. Immer sichtbar: **Ø Puls nur Arbeit** und **Datenlage der Uhr**.
2. Hauptzahlen: **Lauf-Intervall** Pace Arbeit und Puls-Drift, **Stationstag** Kompromiss-Delta.
3. **Kein Urteil**: keine Punktzahl, kein Ring, keine Ampel. Nur Zahlen.
4. Aufklappbar: **Plan gegen Ist** und **Vergleich mit der letzten gleichen Einheit**. Alles andere fällt weg.
5. **Kraft wird nicht getrackt** (keine Uhr-Daten, keine Lap-Taste). Gemacht wird, was im Plan steht.
6. **RPE fällt ganz weg.**
7. Die **Analyse bleibt**, soll aber ebenfalls ein Design bekommen (Vorschlag unten).

## Ebene 1: immer sichtbar
| Daten | Lauf-Intervall | Stationstag | Kraft | Quelle im Code |
|---|---|---|---|---|
| Datenlage | Garmin übernommen, Runden n, Puls in n von n Runden, Phasen-Erkennung | gleich | **«Kraft wird nicht mit der Uhr getrackt»** als normale Zeile, kein Fehler | `sourceInfo()`, `dataState()` |
| Ø Puls nur Arbeit | Arbeitsrunden | Läufe und Stationen | entfällt (keine Daten, gewollt) | `phaseStats().work.hr` |
| Hauptzahl 1 | Pace Arbeit (/km) | Kompromiss-Delta Ø (s/km) | **Umsetzung: x von y Übungen abgehakt** | `work.pace`; `compromise.avg`; Haken aus der Plan-Liste |
| Hauptzahl 2 | Puls-Drift (bpm) | Delta je Station, schlechtester markiert | offen gebliebene Übungen beim Namen | `drift`; `compromise.worst` |

Höchstens 4 Zahlen plus 1 Zeile Datenlage.

## Ebene 2: aufklappbar
- **Plan gegen Ist:** nur für Lauf und Stationstag (Ziel, Ist, Δ je Intervall bzw. Station). Quelle `phaseStats().plan`. **Für Kraft entfällt es**, weil es kein Ist gibt, nur den Haken.
- **Vergleich mit der letzten gleichen Einheit:** Pace, Puls, Kompromiss-Delta. Quelle `compareToPrev()`. Für Kraft entfällt es.

## Fällt weg
Punktzahl und Ring, Kurzurteil, Chips Form/Stärken/Schwächen/Anpassungen, Kachel Anstrengung und **alle RPE-Zeilen** (auch in der regelbasierten Analyse `analyse.js`), Rundenbalken, Phasenbalken, Zonen, Erholung, Streuung, Gewichts-▲▼ und Wiederholungen je Satz bei Kraft.

## Vorschlag Analyse (statt Fließtext)
Heute: Überschrift, dann Fließtext mit Stärken, Schwächen, Anpassungen (`coach.parseAnalysis`, Bereich `.s7-an`). Vorschlag: gleiche Inhalte, aber als kurze Zeilen und ohne Prosa.

- **Drei Blöcke, jeder höchstens 2 Zeilen:** «Gut», «Nicht gut», «Nächstes Mal». Leer = Block fehlt ganz.
- **Jede Zeile beginnt mit der Zahl, danach ein Satz.** Beispiel: «3 von 6 · Intervall 4 bis 6 über 4:00». Die Zahl steht in Barlow wie in den Kacheln.
- **Keine Farbe ausser bei «Nicht gut»** (Orange-Punkt). Kein Grün, keine Ampel.
- **Kraft:** nur Haken-Aussagen («1 von 5 offen: Wadenheben»), nie Aussagen zu Gewicht, Puls oder Anstrengung, weil es dazu keine Daten gibt.
- **Ganzer Text bleibt eingeklappt** hinter «Ganze Analyse lesen» (existiert schon, `an-toggle`).
- Quelle: `strengths`, `weaknesses`, `adjustments`, `nextFocus` der Coach-Analyse. Das ist hauptsächlich Darstellung, die Daten gibt es schon.

## Regeln für fehlende Daten
- Nie eine Zahl erfinden. Stattdessen **«keine Daten, Grund: …»** mit konkretem Grund.
- **Kraft ist kein Fehlerfall:** keine rote oder orange Warnung wegen fehlender Uhr-Daten (heute meldet `dataState` dort «keine Uhr-Aktivität»; das muss für Kraft ruhig und neutral sein).
- Lauf/Station ohne Uhr-Aktivität: nur die Datenlage-Zeile mit «Jetzt abrufen», Plan gegen Ist zeigt das Ziel, Ist leer.
- «Höchster Wert» ist ein Rundenschnitt, kein Maximalpuls.
- Stationstag: Referenz ist nur 1 km, als Hinweis bei Kompromiss-Delta.
- Phasen «wahrscheinlich/unsicher»: Arbeitszahlen markieren (`confText()`).

## Optik
Wie die App: dunkel, Glas-Hintergrund, Kacheln und Karten der bestehenden Auswertung (`.an-dash`, `.dt`, `.dsrc`, `.dmore`). Farbe nur für «nicht im Ziel». Kein Hellmodus (hat die App nicht).

## Annahmen (bitte prüfen)
- «Ich mache es so, wie auf dem Plan steht» heisst: Bei Kraft gibt es nur Haken, keine Ist-Gewichte und keine Wiederholungen. Falls du Gewichte doch änderst und einträgst, würde ich das wieder aufnehmen.
- «RPE ganz weg» gilt für Dashboard und Analyse. Ob auch die Eingabe der RPE in der App entfällt, habe ich nicht angenommen.

## Offene Fragen an Jaime
1. Soll die RPE-Eingabe in der App ebenfalls weg, oder nur die Anzeige?
2. Reicht bei Kraft «x von y abgehakt» als einzige Zahl, oder soll das Dashboard dort gar nichts Zahlenmässiges zeigen?
3. Passen die drei Analyse-Blöcke (Gut, Nicht gut, Nächstes Mal), oder willst du andere Überschriften?

## Nächster Schritt
Du bestätigst oder korrigierst diesen Plan. Danach genau ein Mockup mit genau diesen Daten, inklusive der Analyse-Karte.
