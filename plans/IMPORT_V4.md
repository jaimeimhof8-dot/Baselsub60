# Import Plan 13c plus v4

Datei: `plans/plan13c_plus_v4.json` (Plan 13c plus v3 mit Tag 27 aus `plan13c_plus_v3_heute.json`, dazu die Änderungen aus `LAUF_5_BIS_8.md`: Stationsziele, Mittwoch in Rennreihenfolge, 6 Runden am Sa 19.12.).

Geändert gegenüber `plan13c_plus_v3_heute.json`: 20 Tage (30, 33, 40, 44, 47, 51, 54, 58, 61, 65, 68, 69, 86, 89, 93, 100, 103, 107, 110, 114). Alles bis Tag 26 und Tag 27 ist unverändert.

## Importieren
1. Backup: Menü → Backup → «Datei sichern».
2. Menü → Plan → Import-Ansicht → Datei `plan13c_plus_v4.json` wählen.
3. Prüfen: Sa 19.12. hat 6 Runden, Mi 11.11. hat Sled Push und Burpees (keine Wall Balls), Volle Simulation am Sa 23.01. nennt «Gesamt 61:24».

Abgehakte Übungen, Werte und Umplanungen bleiben erhalten (Hinweis in der Import-Ansicht der App). Tage vor dem 08.11. sind unverändert.

Die Prognose rechnet mit der neuen Ermüdung (8 s) erst nach dem Deploy von `src/forecast.js` und `sw.js` v114 (in diesem Merge).
