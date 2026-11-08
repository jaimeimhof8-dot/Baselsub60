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
2. **Dein "-1 s" ist kein Beweis, dass du nicht einbrichst.** In St. Gallen ist Lauf 8 bei allen Teams etwa 36 s schneller als Lauf 7, in den anderen Events ist er langsamer. Warum, sehe ich in den Daten nicht (möglich: kürzere oder anders gelegte letzte Strecke, Endspurt; das ist eine Vermutung). Vergleichen darfst du dich nur mit dem St.-Gallen-Feld: dort liegt Δ 5-8 bei -2,3 s (alle) und -5,0 s (Sub-60). Dein -1 s ist also **normal für diesen Austragungsort**, nicht besser (Vergleich Sub-60 mit n = 10).
3. **Ohne Lauf 8** verlieren Sub-60-Teams in den Läufen 5-7 gut 4 bis 6 s pro Kilometer gegenüber 2-4. Der grosse Sprung liegt zwischen Lauf 2 und Lauf 3 (+13 s), danach ist die Kurve flach: Lauf 5 gegen Lauf 4 +2,8 s, Lauf 7 gegen Lauf 4 +2,8 s.
4. **Deine eigenen Splits (Läufe 5-8 gegen 2-4, wie in `PLAN_13C_PLUS_V3.md`) kann ich nicht nachrechnen:** dein Rennen (63:21) steht nicht in der Datei, sie enthält 39 St.-Gallen-Teams bis 60:50. Deine Werte (-1 s, +29 s Lauf 3, 4:24 pro km) stammen aus der früheren Auswertung in `PLAN_13C_PLUS_V3.md`. Wenn du mir deine 8 Lauf-Splits gibst, rechne ich Läufe 5-7 und 5-8 sauber nach.

**Ehrliches Urteil:** Ein abrupter Einbruch ist in den Daten **nicht** zu sehen, aber ein stetiger kleiner Verlust: etwa 4 bis 6 s pro km in Lauf 5-7 (rund 12 bis 18 s über drei Läufe), und ausserhalb von St. Gallen ist Lauf 8 im Mittel zusätzlich 7 s (Sub-60) bis 14 s (62-64) langsamer als Lauf 7. Die St.-Gallen-Werte für Lauf 8 sind auffällig und mit n = 10 wenig belastbar. Gegen deine Hauptlücken ist das klein: Tempo-Niveau 4:24 gegen etwa 3:58 sind 26 s pro km, über 8 Läufe etwa 3:28 min, dazu Lauf 3 mit +29 s statt +13 s. "Läufe 5-8 trainieren" ist also **kein Scheinproblem, aber ein kleines**. Das Tempo-Niveau und Lauf 3 bleiben vorrangig. Was die Daten nicht sagen: ob Training mit längeren Ketten den Verlust verkleinert. Das ist aus Renndaten nicht ableitbar.

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

Abbruchregel, in `n` geschrieben: Vor Runde 5 prüfen. Bei Schmerz 3 oder mehr von 10 in Fuss, Wade oder Achillessehne, bei Hinken oder Puls über der Redline in Runde 4 nach Runde 4 aufhören, das war der v3-Umfang.

Was die Änderung **nicht** ist: Gleiche Kilometer sind nicht gleiche Belastung, weil 2 km Zone 2 durch 2 km bei 4:05 ersetzt werden (Woche 10 mit 32 km Umfang). Wenn du nach dem Di 15.12. (Über-Rennpace) müde bist, nimm die Änderung nicht an und bleib bei 4 Runden. Eine Wirkung auf deine Zielzeit oder die Erfolgschance behaupte ich nicht. Die Zielzeiten 1:30 und 1:36 sind eine Annahme: je 8 s schneller als am Sa 21.11. (1:38 und 1:44), so viel wie bei den Burpees; SkiErg und RowErg verbesserten sich nur um 2 s, Farmers um 4 s.

Anwenden: Die Tage in `changes.json` unter `days` in den Plan übernehmen. `weeks` ist leer, die Wochenkilometer ändern sich nicht.

## 5. Nachtrag mit deinen App-Daten (Backup vom 08.11.2026)

Quelle: dein Backup (Eingaben und Garmin-Runden). Die Datei liegt nicht im Repo. Die 1-km-Zeiten der Stationseinheiten stammen aus Lap-Tasten der Uhr; die Uhr misst dort keine brauchbare Distanz (Krafttyp: 20 bis 90 m, Laufband: 757 bis 772 m pro "Kilometer"). Ob jede Runde genau 1 km war, kann ich nicht prüfen.

| Datum | Einheit | Läufe (Reihenfolge) | Letzter minus erster |
|---|---|---|---|
| 13.10. | Pacing-Test 4×1 km (mit Jimoh) | 4:02, 4:10, 4:08, 4:18 | +16 s |
| 20.10. | Schwelle 2×2 km (Ziel 4:14) | 4:07, 4:06 | - |
| 23.10. | Mi-Einheit (Laufband) | 3:55 (frisch), 3:55, 3:55, 4:11 | +16 s |
| 25.10. | Halb-Simulation A (Run 1-4, Sled 175 kg, Burpees 80 m) | 3:56, 4:05, 4:15, 4:20 | **+24 s** |
| 27.10. | Schwelle 3×1,5 km (Ziel 4:10) | 4:13, 4:09, 4:08 pro km | - |
| 28.10. | Mi-Einheit | 3:58 (frisch), 4:02, 4:02, 4:07 | +9 s |
| 31.10. | Stationen-Ökonomie 1 (Garmin-Runden, Zuordnung zu Runde 1-4 unsicher) | 3:56, 4:21, 4:06, 4:12, 4:06 | - |
| 04.11. | Mi-Einheit (Entlastung) | 4:01 (frisch), 4:01, 3:58, 3:56 | -5 s |
| ohne Datum | "Tests" in der App (Lauf-Test) | 3:53, 3:58, 3:55, 4:00 (Ø 3:56,5) | +7 s |

Befunde:

1. **Dein frisches Tempo liegt bei etwa 3:55 bis 4:01 pro km**, nicht bei 4:24. Der St.-Gallen-Wert stammt aus Januar 2026 und ist für heute nicht mehr der richtige Ausgangspunkt. Der letzte Test-Kilometer ist 4:00, nicht 4:05 (ich hatte dich falsch gelesen).
2. **Mittwoch: kaum Kompromiss-Delta.** Läufe nach Station gegen die Referenz: +0, +0, +16 (23.10.), +4, +4, +9 (28.10.), 0, -3, -5 (04.11.), im Mittel etwa +3 s. Das Planziel ist höchstens 15 s. Einzige Ausnahme: der Lauf nach den 80 m Burpees (+16 s).
3. **Der Abfall zeigt sich in der Simulation, nicht am Mittwoch:** Halb-Simulation A mit Rennlasten (Sled 175 kg, Burpees 80 m) +24 s von Lauf 1 auf Lauf 4. Du bist mit 3:56 zu schnell gestartet (Plan: nicht schneller als 4:05). Sub-60-Teams verlieren von Lauf 1 auf Lauf 4 im Mittel 7 s. Die Mittwochs-Stationen sind kürzer (12,5 m Sled, 40 m Burpees) und erzeugen den Abfall vermutlich kaum. Das ist eine Vermutung, kein Beleg.
4. **Dein Tempo-Sprung ist kleiner als gerechnet.** Plan-Ziel 59:05 braucht 4:09 im Schnitt, 8×4:05 entsprechen 32:40. Dein frisches Niveau (ca. 3:57) plus der Abstand der Sub-60-Teams (frisch gegen Schnitt aller 8 Läufe etwa +7 s) ergäbe rund 4:04 bis 4:05. Wenn du so abfällst wie in Halb-Simulation A (Schnitt der vier Läufe 4:09, und mit 8 Läufen vermutlich mehr), liegst du eher bei 4:10 und mehr. Die Spanne 4:04 bis 4:12 ist eine Schätzung aus wenigen Werten.
5. **Die Stationen sind der grössere Hebel:** In der App-Analyse zur Stationen-Ökonomie 1 (31.10.) liegen Farmers, Lunges und Wall Balls 45 bis 58 s über Ziel, am 28.10. die Burpees (1:56 gegen 1:28). Das Laufen ist dort nahe am Plan.

Folgen für den Vorschlag in Abschnitt 4: Er bleibt, weil die Läufe 5 und 6 mit Vorermüdung sonst erst am 09.01. vorkommen. Wichtiger als die Kettenlänge ist, den ersten Lauf der Simulationen nicht schneller als 4:05 zu laufen. `changes.json` ändere ich deshalb nicht.

Offen: Die vier Test-Werte (3:53 bis 4:00) haben in der App kein Datum und ich finde keine passende Garmin-Aktivität. Der 03.11. war laut App ein Rad-Intervall (Nase). Von welchem Tag stammen sie?

## 6. Warum die Teams schneller laufen, wie du 4:05 über 8 Läufe hältst, und was das bringt

**Laufen die meisten Teams schneller als du?** Nicht die Sub-60-Teams. Die 235 Teams mit 58:30 bis 60:00 laufen im Mittel 3:57 pro km, Median 3:58, unteres Viertel 3:50, oberes Viertel 4:04. 144 von 235 sind unter 4:00. Dein frisches Niveau (3:55 bis 4:01) liegt mitten in dieser Gruppe. Schneller laufen die Teams unter 58:30 (3:44 und weniger), die sind aber nicht dein Vergleich.

**Dein Einwand zu den Stationen stimmt.** Die Zeiten im Plan passen nicht zu deinen Werten:

| Gruppe | Läufe | Stationen | Roxzone | Summe |
|---|---|---|---|---|
| Plan-Ziel Volle Simulation 23.01. | 33:12 (4:09) | **21:50** | 3:59 | 59:01 |
| Sub-60-Teams (Mittel, n = 235) | 31:35 (3:57) | **23:20** | 4:26 | 59:13 |
| Teams 55:00-58:30 (n = 471) | 29:54 (3:44) | 22:57 | 4:35 | 57:19 |
| Dein Benchmark vom 18.10. (solo 25:44, mal 0,95 für Doubles) | - | **ca. 24:27** | - | - |

Der Plan hatte die Läufe langsam (4:09, weil ich von 4:24 ausging) und die Stationen schnell (21:50, schneller als der Durchschnitt der Sub-60-Teams) angesetzt. Mit deinen heutigen Laufwerten kehrt sich das um: Läufe sind nicht dein Engpass, die Stationen sind es. Der Faktor 0,95 stammt aus `src/divisions.js` (Annahme), Jimohs Zeiten kenne ich nicht, dein Benchmark ist drei Wochen alt (Re-Test am 05.12.).

**Rechnung, ohne Wahrscheinlichkeit:** Zielzeit = Läufe + Stationen + Roxzone. Wie schnell müssen die Läufe im Schnitt sein, damit es 60:00 ergibt?

| Annahme für Stationen + Roxzone | Summe | Lauf-Ø höchstens | Gesamtzeit bei 8×4:05 |
|---|---|---|---|
| Plan-Ziel | 25:49 | 4:16 | 58:29 |
| Sub-60-Teams im Mittel | 27:46 | 4:02 | 60:26 |
| Deine Schätzung (24:27 + Roxzone 4:26) | 28:53 | 3:53 | 61:33 |

Was das heisst: **8×4:05 allein reichen nur, wenn die Stationen + Roxzone unter 27:20 bleiben** (60:00 minus 32:40). Jede Sekunde pro km über 8 Läufe sind 8 s. Wenn du dagegen auf 4:15 abfällst, kostet das 80 s (34:00 gegen 32:40), so viel wie 1:20 auf einer Station. Das ist die ganze Wirkung des Tempohaltens. Eine Erfolgschance berechne ich daraus nicht.

**Warum die Trainings nicht bis 8 Läufe gehen (Einschätzung):**
1. Eine 8er-Kette mit Rennlasten ist ein halbes Rennen und braucht danach mehrere Tage, bevor Qualität wieder geht. Wie viele, weiss ich für dich nicht.
2. Die Stationen zeigen den Abfall (Halb-Simulation A: +24 s von Lauf 1 auf 4), nicht die Länge der Laufkette. Die Kette ändert das Muster von Lauf 5 bis 8 laut Teamdaten kaum (Lauf 5 gegen Lauf 4 nur +2,8 s).
3. Fuss, Waden und Achillessehne sind dein bekanntes Risiko, und bei jedem Lauf nach Station kommt eine Station dazu.

**Wie du 4:05 hältst (aus deinen Daten):**
- **Start bremsen.** In der Halb-Simulation A bist du mit 3:56 gestartet und hast bis Lauf 4 4:20 erreicht. Am 04.11. bist du mit 4:01 gestartet und mit 3:56 geendet. Lauf 1 und 2 nicht schneller als 4:05, besser 4:07.
- **Lauf 3 und 4 sind die Prüfsteine:** nach Sled Push und Sled Pull. Dort gleich anlaufen wie im Plan (erste 200 m bei 4:15, dann 4:05).
- **Lauf 7 und 8 dürfen schneller werden** (bis 4:00), wenn Puls und Bein es erlauben: 4:08, 4:08, 4:05, 4:05, 4:05, 4:05, 4:02, 4:02 ergeben 32:40.
- **Stationen schneller machen, damit 4:05 reicht.** Schwächen laut App-Analyse: Burpee Broad Jumps, Wall Balls, Farmers, Lunges. Das ist der grössere Hebel.

**Die 8er-Kette als Option:** `changes_option_8_runden.json` ersetzt Sa 19.12. (statt der 6 Runden in `changes.json`) durch 8 Runden in Rennreihenfolge mit halber Stationslänge (Lauf 3 folgt dem Sled Push) und kürzt So 20.12. von 8 auf 4 km. **Ich empfehle sie nicht**, weil sie in Woche 10 (32 km, Dienstag 4×1,2 km @ 3:53) 8 harte Kilometer am Stück bringt, und die Daten keinen Nutzen von 8 gegenüber 6 Läufen zeigen. Wenn du es trotzdem willst, ist die Abbruchregel in der Notiz: vor Runde 5 und 7 prüfen, bei Schmerz 3 oder mehr, Hinken, Puls über Redline oder einer Runde langsamer als 4:12 aufhören. Nimm entweder `changes.json` oder die Option, nicht beide. Die beiden Dateien sind von mir geprüft, aber nicht von einem unabhängigen Prüfer.

## 7. Stationsziele angepasst und warum die Prognose mit 4:12 rechnet

### Stationsziele (`changes_stationen.json`)

Regel: Ziel = dein Benchmark vom 18.10. (solo) mal 0,97, im Team mal 0,95, und **nie schneller als vorher geplant**. Geändert wurden nur SkiErg, Burpee Broad Jumps, Farmers Carry und Wall Balls, in 17 Tagen (33, 40, 44, 47, 51, 54, 61, 65, 68, 69, 86, 89, 93, 100, 103, 107, 110). Row und Lunges waren schon langsamer geplant, als dein Benchmark hergibt. **Schlitten sind unverändert**, weil im Benchmark die Lasten fehlen.

| Station (Rennlänge, Team) | Plan vorher | Plan jetzt | Sub-60-Teams (Mittel) |
|---|---|---|---|
| SkiErg 1000 m | 3:35 | 3:38 | 3:39 |
| Burpee Broad Jumps 80 m | 2:08 | 2:57 | 2:14 |
| Farmers Carry 200 m | 1:12 | 1:40 | 1:29 |
| Wall Balls 100 | 3:05 | 4:40 | 3:43 |
| Sled Push, Pull, Row, Lunges | unverändert | unverändert | - |
| **Summe Volle Simulation 23.01.** | **21:50** | **24:45** | **23:20** |

In der Vollen Simulation (Tag 103) rechnet die Zeile jetzt: Läufe 32:40 (4:08, 4:08, dann viermal 4:05, zweimal 4:02) + Stationen 24:45 + Roxzone 3:59 = **61:24, für 60:00 fehlen 1:24**. Die 3/4-Simulation (Tag 89) und die Halb-Simulation B (Tag 61) tragen die neu gerechneten Summen. Der Satz "Die Zielzeit 59:05 ist die Hochrechnung für Sub-60" ist ersetzt.

Das ist ehrlich, aber unangenehm: Mit deinen Werten von heute plus 3 % ist 60:00 nicht erreicht. Die 1:24 müssen aus Wall Balls, Burpees (Aufteilung mit Jimoh) oder der Roxzone kommen. **Jimohs Zeiten fehlen in der App**, im Doubles kann er bei Burpees oder Wall Balls mehr übernehmen. Sobald seine Werte in "Tests" stehen, gehört dieser Teil neu gerechnet. Die 3 % sind eine Annahme, der Re-Test am 05.12. zeigt, ob sie stimmen. Unsicher bleiben ausserdem die Lasten im Benchmark und die Garmin-Runden, die Station und Anlauf manchmal in einer Runde zusammenfassen.

Anwenden: zuerst `changes.json` weglassen, dann nur `changes_stationen.json` (enthält schon die 6 Runden am 19.12. und das Kürzen am 20.12.) in den Plan übernehmen. Die Option mit 8 Runden und diese Datei ergänzen sich nicht, Tag 68 würde überschrieben.

### Warum die Prognose bei 4:12 steht

Das ist keine Pace, die ich oder der Plan setze, sondern die Formel in `src/forecast.js`:
- T = Mittel deiner Lauf-Testzeiten (3:53, 3:58, 3:55, 4:00 = 3:56,5).
- Plus **15 s Ermüdung** (`levelOf`, für alle Tempi unter 4:15) = **4:11,5, das sind die 4:12**.
- Plus **3 s pro Lauf ab Lauf 5** (`DRIFT`): Lauf 5 4:14,5, Lauf 6 4:17,5, Lauf 7 4:20,5, Lauf 8 4:23,5.
- Ergibt Läufe 34:02, im Schnitt 4:15.

Deine Daten sprechen für weniger Ermüdung: Mittwoch +3 s gegen die Referenz (Bereich -5 bis +16 s), Sub-60-Teams frisch gegen Schnitt aller 8 Läufe +7 s, deine Halb-Simulation A +12,5 s im Schnitt der ersten vier Läufe. Mit 8 s Ermüdung (statt 15) und 3 s Drift läge die Prognose bei Läufen von 33:06 (4:08 im Schnitt), mit 3 s Ermüdung bei 32:26 (4:03). Das spart 56 bis 96 s. **Ich habe den Code nicht geändert**: Die Konstanten sind Annahmen mit Tests (`test/forecast.test.js`, `test/review.test.js`) und die Änderung betrifft jedes Teammitglied. Der vorgesehene Weg ist, die Volle Simulation am 23.01. in der App einzutragen, dann eicht die Prognose das Laufen an deiner gemessenen Zeit (ab 85 % Intensität).

## Offen

- Deine 8 Lauf-Splits aus St. Gallen fehlen mir im Repo, ohne sie ist dein Wert für Läufe 5-8 nicht überprüfbar. Der Sub-60-Vergleichswert aus St. Gallen beruht nur auf 10 Teams; der Plantext nennt dort 12 Teams, die Datei enthält 10 (alter v3-Text, nicht von mir geprüft).
- Warum Lauf 8 in St. Gallen 36 s schneller ist, weiss ich nicht.
- Jimohs Daten fehlen, im Doubles zählt der Langsamere.
