# Plan v10 (ENTWURF vom 06.11.2026)

**Status: Entwurf auf dem Branch `claude/forecast-recalibration`, nicht gemergt.** Er baut auf dem eingebauten Plan «Stand 18.09.2026» auf. Die Planversion **13c**, die vorgesehen war, lag beim Bau nicht vor (nicht im Repo, nicht in Drive, nicht in Gmail). Sobald 13c da ist, wird dieser Entwurf darauf umgesetzt oder verworfen.

## Warum
Datenbasis: 1181 Men-Pro-Doubles-Teams, 151 Solo/Doubles-Paare und euer Rennen St. Gallen (16.01.2026, 63:21, Platz 58). Befund:
- Euer Rückstand zu einem 59:14-Team liegt zu etwa 70 % im **Laufen** (35:09 gegen etwa 31:44), dazu Lunges, Wall Balls und die Roxzone.
- Kein Sub-60-Team der Auswahl lief im Schnitt langsamer als 4:20/km.
- Der bisherige Plan hatte in Block C/D nur etwa 7–13 Lauf-km pro Woche (geschätzt, nur die Simulationen), die erste Simulation, die die Prognose eicht, lag am 23.01. und der Platzhalter-Pace 4:15 ist laut Test 18 s/km zu langsam.

## Struktur bleibt
Mo Kraft 1, Di Lauf, Mi lockerer Aufbau, Do Kraft 2/Stationen, Fr Ruhe, Sa Simulation oder langer Lauf, So Ruhe. Blöcke, Wochentypen und Deload-Wochen bleiben.

## Änderungen (Dateien: `src/plan-v10.js`, `src/plan-data.js`, `src/plan-store.js`)
| Was | Vorher | Neu |
|---|---|---|
| Mittwoch | Zone-2-Rad | Lauf Zone 2 (20–45′, Steigerungen), Rad bleibt in Deload-Wochen und als Ersatz bei Beschwerden |
| Pacing-Tests | nur 13.10. | Re-Tests 4×1 km am Di 10.11., 01.12., 29.12., 26.01. (immer frisch) |
| Schwelle | bis W7, dann weg | bis W11 (4×8′, 4×10′, 3×10′+4×2′, 2×20′, 6×4′) |
| Bricks | 3/4/5/2 | 4/5/6 + Re-Test in W16 |
| Simulationen | Drills, Sim 12.12./19.12., Sim 23.01./30.01., letzte 06.02. | Halb-Sim 28.11., volle Sims 12.12. (75 %), 19.12. (85 %), 09.01. (90 %), 23.01. (95 %), Rennrhythmus-Check 30.01., 06.02. nur Aktivierung |
| Lunges und Wall Balls | kaum | Mo-Finisher und Do-Block in jeder Aufbauwoche |
| Roxzone | nur Drills | Übergaben in jedem Drill und jeder Simulation auf Zeit, Aufteilung bis 12.12. fix |
| Lauf-km (geschätzt) | W5–W7: 19/21/26, danach 7–13 | 21/26/31, Deload 11, 28/29/27, Deload 12, 27/32/31, Deload 18, Taper 17/10 |

Weitere Dateien: `test/plan-v10.test.js` (neue Tests), Service Worker v101.

## Grenzen (ehrlich)
- Die Kilometer sind **Schätzungen** aus den Einheiten (Einlaufen 5:30, locker 5:35, Schwelle 4:13, T 3:57, Brick 2 km, Simulation 8 km). Die Do-Einheiten mit «Renn-Szenario-Bricks» sind darin kaum erfasst. Vergleich mit euren echten Strava-Kilometern fehlt.
- Der Aufbau liegt bei höchstens etwa +25 % pro Woche, in W5–W7 knapp darüber (Basis Block A: etwa 8–17 km). Bei Schienbein-, Achilles- oder Knieproblemen sofort zurück aufs Rad (steht in den Einheiten).
- Die Paces beruhen auf T = 3:57. Gilt die Strava-Reihe (Ø 4:09), verschieben sich alle Paces um etwa +12 s/km. Der Re-Test am 10.11. klärt das.

## Erfolgschance für unter 60:00 (Einschätzung, keine Messung)
Eine feste Zahl wie 50 bis 60 % kann ein Plan nicht herstellen. Sie hängt von eurer tatsächlichen Form ab. Meine ehrliche Einschätzung auf Basis der Daten:
- Mit dem alten Plan etwa 15 %, mit v10 etwa 30 % (Einschätzung des Prüf-Agenten, von mir nicht widerlegt).
- 50 % oder mehr sind realistisch nur, wenn der Re-Test am 10.11. frische 1-km-Zeiten um 3:50 oder besser zeigt (dann reicht eine Rennpace von 4:05 bei +15 s Ermüdung) und die Simulationen am 19.12. und 09.01. unter 60:00 hochrechnen.
- Bei +27 s Ermüdung wie in St. Gallen bleibt Sub-60 auch mit v10 unwahrscheinlich (unter 15 %).

## Offen
Planversion 13c, Strava-Kilometer der letzten 6 Wochen, welche Pacing-Reihe gilt, Verletzungsgeschichte, Strecke in Basel.
