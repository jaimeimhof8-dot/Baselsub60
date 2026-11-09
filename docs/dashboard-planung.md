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
- Quelle (umgesetzt): «Gut» und «Nicht gut» werden aus den gemessenen Zahlen berechnet (`src/dash-v3.js`), nicht aus dem Coach-Text. So gibt es sie auch ohne Coach-Analyse und immer mit Zahl vorn. «Nächstes Mal» ist `nextFocus` der Coach-Analyse, sonst eine feste Regel.

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

## Stand der Umsetzung in der App
- Neu: `src/dash-v3.js` (Kennzahlen, Plan gegen Ist, Vergleich, Analyse-Zeilen) mit Tests in `test/dash-v3.test.js` und `test/session-dash.test.js`. `phaseStats().compromise` liefert zusätzlich `list` (Delta je Station).
- Geändert: `index.html` (`s7DashParts` ersetzt `s7DashHtml`; Analyse-Karte; CSS), `sw.js` (Modul in der Cache-Liste, Version v116).
- Weg aus der Anzeige: Ring/Punktzahl, Kurzurteil, Chips, Anstrengung, Rundenbalken, Phasenbalken, Zonen, Erholung, Streuung, «Schnell-Check». Die alten Funktionen in `session-dash.js` bleiben im Code (andere Ansicht und Tests nutzen sie).
- Nicht angefasst: die Rückblick-Liste aller Einheiten (`dash-all.js`) zeigt weiter Anstrengung. Die Eingabe der RPE ist unverändert (Frage 1 offen).

## Nachbesserung 09.11.2026 (Rückmeldung von Jaime)
1. **Runden passen nicht zum Plan** (z. B. 13 Runden, 12 Planschritte): `alignFuzzy` (laps.js) ordnet nach Zeit zu und fasst eine Doppelrunde zusammen, überzählige Mini-Runden werden ausgelassen. Der Hinweis nennt das («nach Zeit zugeordnet … nicht einzeln bestätigt»), Zuordnung «wahrscheinlich». Klappt auch das nicht, wird nach Tempo geschätzt («unsicher») statt keine Analyse zu zeigen. Zum Eintragen von Zeiten bleibt die strenge Zuordnung.
2. **Rad Zone 2 und andere gleichmässige Einheiten** (Art «steady»): Ø Puls, Dauer (mit km), Puls-Drift; bei Zone 2 die Bewertung gegen 60 bis 70 % vom höchsten gemessenen Puls. Kein Pace beim Rad. Annahme: Zone 2 = 60 bis 70 % (so rechnet die App heute die Zonen), das kann für dich zu eng sein.
3. **Mehrere Aktivitäten an einem Tag:** Jede Aktivität hat einen eigenen Block mit Kopfzeile («Aktivität 2 von 2 · Rad · 18:40 · 40:00 min · 14 km · Zusätzlich») und eigener Analyse. «Geplant» ist die Aktivität, die zum Plan passt. Der Coach-Text hängt an der geplanten.
