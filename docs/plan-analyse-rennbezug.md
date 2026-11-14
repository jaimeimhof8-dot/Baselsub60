# Analyse-Tab: Rennbezug, Trends und mehr Tiefe pro Einheit

Entwurf vom 13.11.2026. Noch nichts in `index.html` oder `src/` geändert. Umsetzung erst nach Freigabe durch Jaime.

## Warum
Jaime will nach jeder Einheit sehen, ob das Team auf Kurs für HYROX Doubles unter 60:00 ist und was sich ändern muss. Dazu mehr Auswertung pro Einheit, und der Tab soll so vollständig wirken wie eine gute Sport-Analyse-App.

Heute beantwortet der Tab nur «Wie war diese Einheit gegen ihren eigenen Plan?». Der Bezug zum Rennen fehlt, und der Verlauf zeigt eine einzige Kurve: Pace der letzten 5 Lauftage. `anTrend` filtert heute nicht nach Intervall, lockere und zügige Dauerläufe stehen in derselben Kurve. Das ist ein bestehender Fehler, den Stufe 1b behebt.

## Entscheide von Jaime (13.11.2026)
1. Zweck: Kurs auf sub 60, einzelne Einheit tiefer, professioneller Eindruck. **Belastungssteuerung ist kein Ziel.**
2. **Nur Zahlen.** Die Regel vom 09.11. gilt weiter: keine Punktzahl, kein Ring, keine Ampel. Farbe nur für «nicht im Ziel».
3. Weg: **A, dann C** (siehe Wege).
4. Mit dem Renntempo verglichen werden **nur Arbeitsläufe von rund 1 km** (800 bis 1200 m). Entscheid vom 14.11.

## Ziele
- Stufe 1: Jede Lauf- und Stations-Einheit wird neben das Renntempo gestellt, das die Prognose annimmt und das sub 60 verlangt.
- Stufe 1: Der Verlauf zeigt wählbare Trends über 4 und 12 Wochen.
- Stufe 2: Mehr Kennzahlen pro Einheit aus Daten, die schon berechnet oder geladen sind.

## Nicht-Ziele
- Keine neue Prognose-Rechnung. `src/forecast.js` bleibt unverändert, die Karte im Wochenrückblick bleibt, wo sie ist.
- Keine Wochenbelastung, kein Fitness- oder Form-Wert, keine Erholungs-Auswertung (HRV, Schlaf).
- Kein vierter Menüpunkt. Es bleibt bei Heute, Verlauf, Vergleich.
- Kraft bleibt ohne Uhr-Auswertung (Entscheid 09.11.).
- Keine neuen Abrufe bei Garmin oder Strava, keine Änderung an Supabase.

## Was ein Fehlschlag wäre, auch wenn es läuft
- Eine Zahl, die so tut, als ändere ein normales Training die Prognose. Die Prognose bewegt sich nur durch Tests und Simulationen ab 85 %.
- Ein Urteil durch die Hintertür (Wörter wie «gut», «schlecht», «auf Kurs» als Etikett, grüne Punkte).
- Ein erfundener Wert, wo Daten fehlen. Regel wie bisher: Block weglassen oder «keine Daten, Grund: …».
- Ein voller, bunter Tab. Die Entwürfe vom 09.11. wurden genau deshalb verworfen.

## Rahmen
- Reine Funktionen ohne DOM in `src/`, mit Tests in `test/` (`node --test`). Anzeige-Bausteine in `src/an-ui.js`, Verdrahtung in `index.html`.
- Bestehende Optik: Klassen `an2-*`, dunkel, kein Hellmodus. Neue Blöcke nutzen dieselben Bausteine (`an2-sec`, `an2-dt`, `an2-lr`, `an2-trend`).
- Service-Worker-Version in `sw.js` bei jeder Auslieferung erhöhen (bisher so gehandhabt, zuletzt v130).
- Texte Deutsch (Schweiz), ohne «ß».

## Wege
- **A: Rennbrücke und Verlauf ausbauen.** Neuer Block «Gegen Rennplan» in Heute, wählbare Trends im Verlauf. Mittlerer Aufwand, nur vorhandene Daten.
- **B: Vierter Bereich «Rennen».** Prognose zieht aus dem Wochenrückblick um. Grösster Umbau, Prognose an zwei Orten oder ein gebrochener Wochenrückblick, kaum neue Erkenntnis. Verworfen.
- **C: Nur die Einheit vertiefen.** Kleinster Aufwand, aber das Hauptziel sub 60 bliebe offen.
- **Gewählt: A als Stufe 1, C als Stufe 2.** Jede Stufe wird einzeln ausgeliefert.

## Stufe 1a: Block «Gegen Rennplan» (Ansicht Heute)

Steht nach den Kennzahlen der Einheit, vor dem Diagramm. Erscheint nur, wenn eine Prognose vorhanden ist (`rvForecast()` liefert `total`) und die Einheit Arbeitsläufe mit Phasen-Sicherheit «sicher» oder «wahrscheinlich» hat.

Skizze:

```
GEGEN RENNPLAN
Pace Arbeit            4:12 /km
Prognose rechnet mit   4:31 /km     19 s schneller
Für 60:00 nötig        4:24 /km     12 s schneller
Kompromiss-Delta       +14 s/km
Prognose rechnet mit   +9 s/km      5 s mehr          (orange)
Prognose 61:40 · Stand Tests vom 02.11. · ändert sich nur durch Tests und Simulationen
```

Zeilen und Herkunft:

| Zeile | Rechnung | Quelle |
|---|---|---|
| Pace Arbeit | Schnitt der Arbeitsläufe | `phaseStats().work.pace` |
| Prognose rechnet mit | Mittel der 8 Laufzeiten der Prognose | `fc.paces` |
| Für 60:00 nötig | (3600 − Summe Stationen − Roxzone) ÷ 8 | `fc.stations`, `fc.rox`, `review.GOAL_S` |
| Kompromiss-Delta | nur Stationstage | `phaseStats().compromise.avg` |
| Prognose rechnet mit (Aufschlag) | Mittel `fc.paces` − `fc.T` | `fc.paces`, `fc.T` |

Regeln:
- Differenz immer als Sekunden mit Wort («schneller», «langsamer», «mehr», «weniger»). Orange nur, wenn langsamer oder mehr.
- Lockere Läufe (Zone 2, Ein-/Auslaufen): Block fehlt. Ein lockerer Lauf hat kein Renntempo.
- Kraft: Block fehlt.
- Ohne Prognose: eine Zeile «Noch keine Testwerte» mit dem bestehenden Link «Tests eintragen». Nur bei Einheiten, die den Block sonst zeigen würden, nie bei lockeren Läufen oder Kraft.
- Zeile «Prognose rechnet mit (Aufschlag)» fehlt, wenn der Wert nicht grösser als 0 ist. Grund: Eicht eine Simulation die Laufzeiten (`runCal` in `src/forecast.js`), ist die Differenz kein reiner Ermüdungsaufschlag mehr.
- «Für 60:00 nötig» fehlt, wenn die Rechnung unter `RUN_BOUNDS[0]` (2:30) (`src/forecast.js`) fällt, mit Grund: «Stationen und Roxzone allein lassen kein sub 60 zu».
- Stationszeiten einzelner Stationen werden **nicht** gegen die Prognose gestellt. Die Prognose rechnet Team-Zeiten über die volle Renndistanz, eine Trainingsrunde ist Solo und oft kürzer. Der Vergleich wäre falsch.

Neue reine Funktion `racePlanRows({ st, fc, goal })` in neuer Datei `src/race-link.js` mit Tests. Anzeige `anRaceHtml(rows)` in `src/an-ui.js`.

## Welche Läufe zählen (gilt für Block, Trend und Bestwerte)

Von Jaime bestätigt (14.11.2026):
- Mit dem Renntempo verglichen werden nur **Arbeitsläufe von 800 bis 1200 m**. Im Rennen sind es 8 × 1 km. Ein 400-m-Lauf ist immer schneller als Renntempo, die Zahl «50 s schneller» wäre irreführend.
- Hat eine Einheit keine solche Runde, fehlt der Block, mit einer Zeile: «Kein Vergleich: Intervalle sind nicht rund 1 km lang».
- Zügige Dauerläufe ohne Wiederholungen im Plan (Tempo-Lauf) zählen nicht als Intervall-Lauf. Sie erscheinen in keinem Trend der Stufe 1.
- «Schnellster 1-km-Lauf» bei den Bestwerten nutzt dieselbe Grenze.

## Stufe 1b: Trends im Verlauf

Ersetzt den heutigen Trend-Block (`anTrendHtml`). Oben eine Auswahl der Kennzahl, daneben der Zeitraum (4 Wochen, 12 Wochen). Darunter die grosse aktuelle Zahl, der Satz zum Unterschied und die Linie, wie heute. Die Liste der Einheiten darunter bleibt unverändert.

| Kennzahl | Einheiten | Wert |
|---|---|---|
| Pace Arbeit | Intervall-Läufe | `work.pace` |
| Puls-Drift | Intervall-Läufe | `drift.bpm` |
| Puls Ø Arbeit | Intervall-Läufe | `work.hr` |
| Kompromiss-Delta | Stationstage | `compromise.avg` |
| Lockerer Lauf | lockere Läufe | Pace gesamt und Ø Puls als zwei Linien |

Regeln:
- Ein Punkt je Einheit, nur bei Phasen-Sicherheit «sicher» oder «wahrscheinlich» (wie heute).
- Die Trennung Intervall-Lauf / lockerer Lauf gibt es im heutigen Trend nicht und muss neu gebaut werden (siehe «Welche Läufe zählen»).
- Bei «Pace Arbeit» liegt eine waagrechte Linie auf «Für 60:00 nötig», wenn eine Prognose da ist. Beschriftet, ohne Farbe als Urteil.
- Satz zum Unterschied: letzte Einheit gegen die davor **und** gegen die erste im Zeitraum («11 s schneller als vor 12 Wochen»).
- Weniger als 2 Punkte: «Zu wenig Einheiten mit Runden im Zeitraum (n)», keine Linie.
- Auswahl wird in `localStorage` gemerkt, mit `try/catch`.

Neue reine Funktion `trendPoints(sessions, metric, weeks)` in `src/race-link.js` mit Tests. `anTrendHtml` in `src/an-ui.js` wird erweitert.

## Stufe 2: Mehr Tiefe pro Einheit (Ansicht Heute, aufklappbare Details)

Neue Einträge in `anDetailsHtml`, alle zugeklappt:

| Eintrag | Inhalt | Quelle |
|---|---|---|
| Erholung in den Pausen | Puls-Abfall Arbeit zu Pause, Ø Pausendauer, je Pause eine Zeile | `phaseStats().recovery` liefert heute nur `{drop, n, restS}`. Die Liste je Pause muss ergänzt werden (`recovery.list`), mit Test |
| Gleichmässigkeit | schnellste und langsamste Pace der Arbeitsläufe, Spanne in s/km | `phaseStats().spread` (Pace, nicht Rundenzeit; nur ab 3 Arbeitsläufen) |
| Trittfrequenz je Intervall | Ø Schritte/min je Arbeitsrunde | Zeitreihe `cad`, Zeitbereiche aus `anIntervals` |
| Bestwerte | schnellster 1-km-Lauf und kleinstes Kompromiss-Delta, mit Datum; Zeile «heute» wenn die Einheit den Bestwert setzt | alle lokal vorhandenen Aktivitäten mit Runden |

**Hinweis auf eine Umkehr:** Am 09.11. fielen Erholung und Streuung aus dem Dashboard nach dem Training weg. Hier kommen sie zurück, aber nur zugeklappt im Analyse-Tab, nicht im Dashboard. Das ist ein Vorschlag von Claude, kein Entscheid von Jaime.

## Dem Bauenden überlassen
- Zwischenspeicher für die Trend-Berechnung, damit der Verlauf nicht bei jedem Zeichnen 12 Wochen neu rechnet.
- Genaue Abstände und Schriftgrössen innerhalb der bestehenden `an2-*`-Bausteine.
- Wie weit die lokal gespeicherten Aktivitäten mit Runden zurückreichen. Reichen sie keine 12 Wochen, zeigt der Trend, was da ist, und nennt die Anzahl.
- Erkennung «lockerer Lauf» über `isEasyRun` in `src/util.js`. Nicht `p.easy` (das heisst «entlastet») und nicht neu erfinden.

## Annahmen von Claude (bitte prüfen)
- «Prognose rechnet mit» als Mittel aller 8 Läufe ist die verständlichste Vergleichszahl. Alternative wäre der Pacing-Test-Schnitt `fc.T` ohne Ermüdung.
- Die Karte Rennprognose im Wochenrückblick behält ihren farbigen Punkt. Sie ist nicht Teil dieser Arbeit.
- Der Vergleich-Bereich (Partner) bleibt unverändert.
- Vor dem Bau der zwei neuen sichtbaren Blöcke (Gegen Rennplan, Trend-Auswahl) zeigt Claude vier Anordnungen im bestehenden Stil zur Auswahl.

## Reihenfolge
1. Stufe 1a bauen, prüfen, ausliefern.
2. Stufe 1b bauen, prüfen, ausliefern.
3. Stufe 2 bauen, prüfen, ausliefern.
Nach jeder Stufe Halt für Rückmeldung.
