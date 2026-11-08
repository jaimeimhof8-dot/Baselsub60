# Läufe 5 bis 8: warum der Plan bei 4 aufhört und was ich ändere

Stand 08.11.2026, für Jaime. Grundlage: `plan13c_plus_v3.json`, `teams_stgallen_etc_clean.json` (1181 Doubles-Men-Pro-Rennen). Änderung: `changes.json` (nur Tage 68 und 69). Kein Pull Request, `index.html` unverändert.

## Kurzantwort

Deine Prämisse stimmt nur halb. Der Mittwoch geht bis "Runde 5", aber Runde 1 ist der frische Referenzlauf ohne Station, also sind es 4 Läufe nach einer Station. Samstags sind es 4 Läufe, Halb-Simulation A und Brick ebenfalls. Länger als 4 Läufe am Stück trainierst du nur in der 3/4-Simulation (6 Läufe, 09.01.) und der vollen Simulation (8 Läufe, 23.01.). Lauf 7 und 8 mit aufgebauter Ermüdung kommen **genau einmal** vor.

## 1. Zählung im Plan (ab heute, Tag 27)

"Nach Station" = 1-km-Läufe, die direkt auf eine Station folgen. "Höchste Nr." ist bei Mittwoch und Samstag die Rundennummer in der Einheit (Mittwoch: Runde 1 = Referenz ohne Station), bei Simulationen die Rennnummer.

| Datum | Einheit | 1-km-Läufe nach Station | Läufe gesamt | Höchste Nr. | Mit Ermüdung aus Läufen 1-4? |
|---|---|---|---|---|---|
| Mi 11.11. | Kompromiss (Push/Wall Balls) | 4 | 5 (Referenz + 4) | Runde 5 | nein |
| Sa 14.11. | Stationen-Ökonomie 2 | 4 | 4 | Runde 4 | nein |
| Mi 18.11. | Kompromiss (Pull/Lunges) | 4 | 5 | Runde 5 | nein |
| Sa 21.11. | Stationen-Ökonomie 1 | 4 | 4 | Runde 4 | nein |
| Mi 25.11. | Kompromiss (Push/Burpee) | 4 | 5 | Runde 5 | nein |
| Sa 28.11. | Brick-Simulation | 3 | 4 | Run 4 | nein |
| Mi 02.12. | Kompromiss (Entlastung) | 3 | 4 | Runde 4 | nein |
| Sa 05.12. | Stationen-Re-Test | 0 | 0 | - | nein |
| Mi 09.12. | Kompromiss (Lunges/Wall Balls) | 4 | 5 | Runde 5 | nein |
| Sa 12.12. | Halb-Simulation B | 3 | 4 | Run 8 (Etikett) | **nein**: Start kalt mit "Run 5", Stationen 5-8 stimmen, die Vorermüdung nicht |
| Mi 16.12. | Kompromiss (Burpee/Push) | 4 | 5 | Runde 5 | nein |
| Sa 19.12. | Stationen-Ökonomie 2 | 4 (v3) / **6 (Vorschlag)** | 4 / 6 | Runde 4 / **6** | nein / **ja für Lauf 5-6** |
| Mi 23.12. | Kompromiss (RowErg) | 3 | 4 | Runde 4 | nein |
| Mi 30.12. | Delta-Audit 2 (Push/Pull) | 4 | 5 | Runde 5 | nein |
| Mi 06.01. | Kompromiss | 3 | 4 | Runde 4 | nein |
| **Sa 09.01.** | **3/4-Simulation** | **5** | **6** | **Run 6** | **ja (Läufe 5 und 6)** |
| Mi 13.01., 20.01., 27.01., 03.02. | Kompromiss | je 3 | je 4 | Runde 4 | nein |
| **Sa 23.01.** | **Volle Simulation** | **7** | **8** | **Run 8** | **ja (Läufe 5 bis 8)** |
| Sa 30.01. | Schwachstellen-Simulation | 3 | 4 | Runde 4 | nein |

Alle anderen Mittwoche und Samstage vor Tag 27 (21.10., 28.10., 04.11., 24.10., 31.10.) liegen bei 3 bis 4 Läufen nach Station. Dienstag-Intervalle (z.B. 5×1 km, 6×1 km) sind lange Läufe-Ketten, aber ohne Station davor, zählen hier nicht.

**Ergebnis:** Läufe 5 bis 8 mit Ermüdung aus den Läufen davor gibt es an zwei Tagen im ganzen Plan (09.01. und 23.01.). Deine Vermutung "nur die Simulationen" stimmt. Die Halb-Simulation B trägt "Run 5-8" im Namen, startet aber kalt.

## 2. Renndaten: ist die Lücke real?

Alle Zahlen aus `teams_stgallen_etc_clean.json`, Mittelwerte der Teams in Sekunden pro Kilometer. Δ = Mittel Läufe 5-7 minus Mittel Läufe 2-4.

| Gruppe | n | Δ Läufe 5-7 gegen 2-4 | Lauf 8 minus Lauf 7 | Δ Läufe 5-8 gegen 2-4 |
|---|---|---|---|---|
| 58:30-60:00, alle Events | 235 | +6,0 s | +7,1 s | +7,9 s (Median +8,9) |
| 62:00-64:00, alle Events | 54 | +8,5 s | +13,9 s | +12,2 s (Median +14,0) |
| 58:30-60:00, nur St. Gallen | 10 | +4,1 s | **-36,4 s** | **-5,0 s** |
| alle Teams St. Gallen | 39 | +6,5 s | **-35,9 s** | **-2,3 s** |

Befunde:

1. **Die Zahlen "+9 bis +14 s" aus der früheren Auswertung lassen sich bestätigen** (Median +8,9 und +14,0 über alle Events).
2. **Dein "-1 s" ist kein Beweis, dass du nicht einbrichst.** In St. Gallen ist Lauf 8 bei allen Teams etwa 36 s schneller als Lauf 7, in den anderen Events ist er langsamer. Warum, sehe ich in den Daten nicht (möglich: kürzere oder anders gelegte letzte Strecke, Endspurt; das ist eine Vermutung). Vergleichen darfst du dich nur mit dem St.-Gallen-Feld: dort liegt Δ 5-8 bei -2,3 s (alle) und -5,0 s (Sub-60). Dein -1 s ist also **normal für diesen Austragungsort**, nicht besser.
3. **Ohne Lauf 8** verlieren Sub-60-Teams in den Läufen 5-7 gut 4 bis 6 s pro Kilometer gegenüber 2-4. Der grosse Sprung liegt zwischen Lauf 2 und Lauf 3 (+13 s), danach ist die Kurve flach: Lauf 5 gegen Lauf 4 +2,8 s, Lauf 7 gegen Lauf 4 +2,8 s.
4. **Deine eigenen Splits (Lauf 5-7 gegen 2-4) kann ich nicht nachrechnen:** dein Rennen (63:21) steht nicht in der Datei, sie enthält 39 St.-Gallen-Teams bis 60:50. Deine Werte (-1 s, +29 s Lauf 3, 4:24 pro km) stammen aus der früheren Auswertung in `PLAN_13C_PLUS_V3.md`. Wenn du mir deine 8 Lauf-Splits gibst, rechne ich Läufe 5-7 sauber nach.

**Ehrliches Urteil:** Ein echter Einbruch in Läufen 5-8 ist in den Daten **nicht** zu sehen, auch nicht bei den schnellen Teams. Der Verlust ist klein (etwa 4 bis 6 s pro km in Lauf 5-7, das sind rund 15 bis 20 s über drei Läufe) und flach. Gegen deine Hauptlücken ist das klein: Tempo-Niveau 4:24 gegen etwa 3:58 sind 26 s pro km, über 8 Läufe etwa 3:28 min, dazu Lauf 3 mit +29 s statt +13 s. "Läufe 5-8 trainieren" ist also **kein Scheinproblem, aber ein kleines**. Das Tempo-Niveau und Lauf 3 bleiben vorrangig. Was die Daten nicht sagen: ob Training mit längeren Ketten den Verlust verkleinert. Das ist aus Renndaten nicht ableitbar.

## 3. Für und gegen längere Ketten

**Belegt (aus den Dateien):**
- Der Verlust nach Lauf 4 ist klein und flach (siehe oben).
- Die Mittwochs-Einheit besteht schon aus 5 harten Kilometern bei 4:05 mit Stationen, plus Kraft am Tag selbst. Jede zusätzliche Runde dort ist ein weiterer harter Kilometer mit Belastung für Fuss und Wade (Burpees, Lunges, Wall Balls, Sleds).
- Der Plan enthält für Fuss, Waden und Achillessehne bereits eine Go/No-Go-Regel in jeder Einheit.

**Einschätzung (allgemeines Trainingswissen, in dieser Sitzung nicht mit Quellen geprüft, bitte so lesen):**
- Dafür: Das Tempogefühl bei aufgebauter Ermüdung und das Verpflegungs-/Pacing-Verhalten lassen sich am besten in langen Ketten üben. Die einzige Ausführung von Lauf 7-8 liegt 21 Tage vor dem Rennen, geht sie schief, bleibt wenig Zeit.
- Dagegen: Lastspitzen und rasche Steigerungen gelten als Risikofaktor für Überlastungen bei Fuss und Waden. Ich kenne keine kontrollierte Studie, die zeigt, dass mehr als 4 Stations-Läufe pro Woche die HYROX-Zeit verbessern. Wenn es sie gibt, kenne ich sie nicht.
- Fazit: Es gibt **keinen belegten Grund**, Ketten über 4 in die normale Woche zu legen. Es gibt einen schwachen Grund, die Zahl der Vorerfahrungen mit Läufen 5-8 von 2 auf 3 zu erhöhen.

## 4. Vorschlag (klein, mit einer Rücknahme-Regel)

Struktur Mo Kraft / Di Lauf / Mi Kompromiss / Do Rad oder Lauf / Fr Ruhe / Sa Stationen oder Simulation / So lockerer Lauf bleibt.

| Tag | Änderung | Begründung |
|---|---|---|
| Sa 19.12. (Tag 68) | Stationen-Ökonomie 2 von 4 auf **6 Runden**: neu Runde 5 Sandbag Lunges 50 m (Ziel 1:30) und Runde 6 Wall Balls 50 (Ziel 1:36), je 1 km @ 4:05/km, 15 s Pause | Läufe 5 und 6 mit Vorermüdung ein erstes Mal, drei Wochen vor der 3/4-Simulation. Lunges und Wall Balls statt Sleds und Burpees, weil ich sie für schonender für Fuss und Wade halte (Einschätzung, nicht belegt). |
| So 20.12. (Tag 69) | Lockerer Lauf von 8 auf **6 km** | Wochenkilometer bleiben gleich (+2 km Samstag, -2 km Sonntag). |
| Mittwoche | **unverändert** (Referenz + 3 oder 4 Runden) | Daten stützen längere Mittwochs-Ketten nicht. |
| 09.01. und 23.01. | **unverändert** | Sie sind die Läufe-5-bis-8-Einheiten. |
| 12.12. Halb-Simulation B | **unverändert** | Nur ein Hinweis: Sie misst Stationen 5-8, nicht Vorermüdung. |

Abbruchregel, in `n` geschrieben: Bei Schmerz 3 oder mehr von 10 in Fuss, Wade oder Achillessehne, bei Hinken oder Puls über der Redline in Runde 4: nach Runde 4 aufhören, das war der v3-Umfang.

Was die Änderung **nicht** ist: Gleiche Kilometer sind nicht gleiche Belastung, weil 2 km Zone 2 durch 2 km bei 4:05 ersetzt werden (Samstag in W10 mit 32 km). Wenn du nach dem Di 15.12. (Über-Rennpace) müde bist, nimm die Änderung nicht an und bleib bei 4 Runden. Eine Wirkung auf deine Zielzeit oder die Erfolgschance behaupte ich nicht. Die Zielzeiten 1:30 und 1:36 sind eine Annahme (gleiche Verbesserung wie die anderen Stationen von Sa 14.11. zu Sa 19.12.).

Anwenden: Die Tage in `changes.json` unter `days` in den Plan übernehmen. `weeks` ist leer, die Wochenkilometer ändern sich nicht.

## Offen

- Deine 8 Lauf-Splits aus St. Gallen fehlen mir im Repo, ohne sie ist dein Läufe-5-7-Wert nicht überprüfbar.
- Warum Lauf 8 in St. Gallen 36 s schneller ist, weiss ich nicht.
- Jimohs Daten fehlen, im Doubles zählt der Langsamere.
