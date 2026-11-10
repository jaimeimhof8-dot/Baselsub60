# Plan: Tab «Vergleich» im Dashboard nach dem Training

Ziel (Jaime, 10.11.2026): Nach dem Training erscheint im Dashboard ein zweiter Tab. Er sieht aus wie Garmin Connect
(Diagramme, interaktiv) und vergleicht meine Einheit mit der meines Partners (Jimoh): wer wie abgeschnitten hat.

## Ausgangslage im Code
- Dashboard: `s7DashParts` in `index.html` (~Zeile 20760), Logik in `src/dash-v3.js`, `src/session-dash.js`, Runden in `src/laps.js`.
- Eigene Aktivitäten + Runden liegen in `plan_state.data` (je Nutzer). Der Partner ist NICHT lesbar: `partner_profile()` gibt nur Gewichte + Tests heraus.
- Es gibt noch keine Diagramm-Bibliothek; vorhandene Mini-SVG-Helfer in `src/dashboard.js` (z. B. gruppierte Balken ich vs. Partner).
- Regeln aus `docs/dashboard-planung.md`: kein Urteil/Ampel/Punktzahl, nie Zahlen erfinden, Kraft ist kein Fehlerfall, dunkles Design wie die App.

## Phasen
1. **Daten teilen (Backend)**: neue SQL-Funktion `partner_session(date)` (security definer, wie `partner_profile`): gibt NUR die Aktivität(en) + Runden + Puls-Reihe des Partners für ein Datum zurück, nichts sonst (keine Notizen, Check-ins). Nur Teammitglieder. Datei `supabase/partner_session.sql`.
2. **Reiner Vergleichs-Kern** (`src/compare.js`, ohne DOM, mit Tests): richtet beide Einheiten aus (gleiche Plan-Schritte/Runden), liefert Reihen für Pace, Puls, Distanz je Runde, Summen und Differenzen. Fehlt der Partner oder die Uhr-Daten: «keine Daten, Grund: …».
3. **Diagramme** (`src/charts.js`, SVG, keine externe Lib): Linien-/Flächendiagramm im Garmin-Stil (Puls, Pace je Runde), zwei Reihen (ich = Farbe A, Partner = Farbe B), Hover/Touch-Tooltip mit Fadenkreuz (beide Werte + Differenz), Legende zum Ein-/Ausblenden jeder Reihe, Umschalter Metrik (Puls / Pace / Distanz), Runden-Balken antippbar. Tastatur- und Touch-bedienbar, `prefers-reduced-motion` beachten.
4. **Tab-UI** in `index.html`: Tab-Leiste «Auswertung | Vergleich» im Dashboard nach dem Training, Tab nur wenn der Partner an dem Tag Daten hat (sonst ruhiger Hinweis). Kennzahlen-Kacheln oben (Ø Puls, Pace, Dauer beider), darunter Diagramme. `sw.js`: neue Module in Cache-Liste, Version erhöhen.
5. **Test + Review**: `npm test` grün, neue Tests für `compare.js`/`charts.js`, manuell im Browser (Desktop + 375 px) mit Seed-Daten aus `test/fixtures/dash-seed.js`.

## Aufgabenverteilung
- **Macher (Sonnet)**: Phasen 2, 3, 4, 5 (Code, Tests, Browser-Check). Phase 1 nur als SQL-Datei schreiben, NICHT gegen die echte Datenbank ausführen.
- **Aufpasser (Opus)**: prüft Phase 1 (Datenschutz: gibt die Funktion wirklich nur das Nötige heraus? RLS, grant/revoke wie bei `partner_profile`), liest danach den Code des Machers, prüft gegen `docs/dashboard-planung.md` und die Abnahme unten. Schreibt keinen Feature-Code, nur Befunde (und kleine Fixes nur nach Rücksprache).

## Abnahme
- Vergleich-Tab erscheint erst nach dem Training und nur mit Partner-Daten; sonst klarer Hinweis, keine erfundenen Zahlen.
- Diagramme reagieren auf Hover/Touch, Reihen lassen sich ausblenden, Metrik umschaltbar.
- Partner-Funktion gibt nur die Einheit des gewählten Tages heraus.
- `npm test` grün; keine Regression an Auswertungs-Tab, Plan, Garmin-Import.
