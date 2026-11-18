# Bestandsaufnahme Basel Sub-60

Stand 18.11.2026. Grundlage: Code, Git-Verlauf, `npm test`, vorhandene Audits und Pläne. **Nicht** auf dem Handy durchgeklickt. Die Spalte "Gefühl" unter Abschnitt 3 füllst du aus, weil nur du weisst, was im Alltag hakt.

## 1. Kennzahlen

| Messwert | Wert | Einordnung |
|---|---|---|
| `index.html` | 25'982 Zeilen, 984 KB | Ganze App-Logik (11'000 Zeilen Skript) plus 14'300 Zeilen CSS in einer Datei |
| Logik-Module in `src/` | 60+ Dateien | Gut: Kernlogik ist ausgelagert und testbar |
| Unit-Tests | 489, alle grün | Stark für Logik. Für die Oberfläche testet `app-script.test.js` nur "Skript hat keine Syntaxfehler" |
| UI-Test-Werkzeug | `dev/testlab.js` (Durchklicken, Seeds) | Vorhanden, läuft nur in der Testkopie (Port 8081) und nicht als fester Ablauf vor Releases |
| Commits | 28 sichtbar im Verlauf (evtl. verkürzte Historie) | Viele Commits sind grosse Umbauten statt kleiner Schritte |
| UI/UX-Audit | `UI_UX_AUDIT.md`, 10 Punkte, alle umgesetzt | Gutes Vorbild, wurde aber nur einmal gemacht (Stand 18.10.) |

## 2. Befunde nach Thema

### A. Buttons und Touch-Ziele
- `.btn` ist **20-mal** definiert (Zeilen 946, 987, 2141 usw.), dazu `.btn.primary/.ghost/.strava/.garmin/.sm` mehrfach. Die letzte Regel gewinnt, das Aussehen hängt von der Reihenfolge ab.
- 317 `<button>`-Stellen. Mindesthöhen im CSS: 59× 44 px, aber auch 17× **unter 44 px** (28, 32, 36 px) und 12× 40 px. Das sind Treffer-Probleme mit dem Daumen.
- Neben `.btn` gibt es eigene Knopf-Klassen pro Bereich (`.s6-m`, `.s6-menu`, `.s6-seg button`, `.an-*`). Jeder Bereich hat seinen eigenen Look.
- Ausserdem 14 `confirm()/alert()`-Aufrufe: Browser-Dialoge passen nicht zum Design und verhalten sich in der installierten PWA unterschiedlich.

### B. Animationen
- Mindestens 12 verschiedene Dauern/Verläufe: 0.15 s, 0.2 s, 0.25 s, 0.28 s, 0.3 s, 0.34 s, 0.4 s, 0.45 s, 0.5 s.
- **Drei** Easing-Kurven (`--ease`, `--ios`, `--out`) plus freie `ease` / `ease-out` / `linear`.
- `transition: width` und `left` (Zeilen mit `width 0.25s`, `left 0.15s`) animieren Layout statt `transform`: ruckelt auf schwächeren Handys.
- `prefers-reduced-motion` ist beachtet (9 Regeln), das ist gut.

### C. Farben, Schrift, Abstände (Design-System)
- Tokens existieren (`--bg`, `--card`, `--accent`, `--s1…--s7`, 1284 Verwendungen von `var(--…)`). Das ist die gute Basis.
- Trotzdem **60 verschiedene Hex-Farben** direkt im CSS. `#9a9ba3` (185×), `#f5f5f7` (102×), `#161922` (74×), `#e0bf6a` (45×) und `#e6b94d` (11×, fast gleich wie Gold) sollten Tokens sein.
- Schriftgrössen: 11, 12, 13, 14, 15, 16, 17, 19, 20, 22, 24, 26 px. 12 Stufen sind zu viele, 6 reichen.
- Radien: 14 px (50×) und 22 px (30×) dominieren, daneben 10, 11, 16 px. Ungleichmässig.
- Die Doku nennt ein 4-px-Raster (`--s1…--s7`), im CSS stehen aber viele feste px-Werte.

### D. Struktur des Codes (Hauptursache für "immer wieder ein bisschen")
- CSS in **Generationen**: ~1074 `.s6-…`-Klassen und ~334 `.s7-…`-Klassen, dazu `.an-`, `.v3-`, `.dash-`. Jede Überarbeitung wurde über die alte gelegt. 104 `!important` zeigen, dass sich die Schichten bekämpfen.
- Eine Datei mit CSS, HTML und 11'000 Zeilen Skript: schwer zu überblicken, Änderungen an einer Stelle brechen leicht eine andere.
- `render()` ist ein zentraler Einstieg (Zeile 23855), die Ansichten sind über `data-v` gesteuert (Heute, Woche, Plan, Coach, Dashboard, Analyse (3 Varianten), Review, Profil, Tests, Strava, Backup, Import, Login). 133 Aktionen über `data-act`.

### E. Anzeichen für nicht zu Ende gedachte Funktionen (aus dem Git-Verlauf)
- **Garmin-Rundenübernahme / Lauftage:** 4 aufeinanderfolgende Review-Runden, 3 Pull Requests, Pläne v1 und v2, Diagnose-Knopf nachträglich. Zeigt: Die Fälle (Auto-Lap, fehlende Runden, Steigerungen, Rückweg) kamen erst im Betrieb heraus.
- **Analyse-Tab:** innerhalb weniger Tage dreimal neu (Heute-Screen → eigener Menü-Tab → "Garmin-Stil"), dann Korrektur der Leiste (sw v131/v132). Drei Analyse-Ansichten (`analysis`, `analysisc`, `analysisv`) existieren nebeneinander.
- **Vergleich-Tab:** Plan, Review und Umbau ("Linien" → "Rundenblöcke").
- Service-Worker-Version steht bei 132: bei jeder Änderung hochgezählt, fehleranfällig, wenn man es vergisst (alte Version bleibt im Cache).

### F. Zustände (leer, Fehler, offline)
- Offline-Hinweis ist vorhanden (gut).
- Für die anderen Zustände (leer, Fehler, sehr viele Daten, Garmin/Strava-Ausfall) gibt es keine systematische Prüfung. Das ist die typische Stelle, wo "nicht durchdachte Sachen" sitzen.

## 3. Funktionsliste zum Ausfüllen

Meine Einschätzung aus dem Code ("Test" = Tests vorhanden, "Churn" = oft geändert). Spalte "Gefühl" bitte du ausfüllen: ok / wackelig / kaputt, mit einem Satz warum.

| Funktion | Test | Churn | Meine Risiko-Einschätzung | Gefühl (du) |
|---|---|---|---|---|
| Heute | teilw. | mittel | mittel | |
| Woche | ja | niedrig | niedrig (Zählregel behoben) | |
| Plan (Import, Export, Teilen) | ja | mittel | mittel | |
| Coach / KI | ja | niedrig | mittel (Netzabhängig) | |
| Dashboard | ja | mittel | mittel | |
| **Analyse (3 Varianten)** | ja (Logik) | **hoch** | **hoch** | |
| **Lauftag / Garmin-Runden** | ja, viele | **sehr hoch** | **hoch** (Randfälle) | |
| Vergleich (ich gegen Partner) | ja | hoch | mittel | |
| Wochenrückblick | ja | niedrig | niedrig | |
| Profil / Tests | ja | niedrig | niedrig | |
| Strava / Garmin Login | ja | mittel | mittel | |
| Backup / Import | ja | niedrig | **hoch bei Fehler** (Datenverlust) | |
| Wasser-Erinnerung / Push | ja | niedrig | mittel (iOS-PWA) | |
| Menü, Navigation, Animationen | nein | mittel | **hoch** (nur manuell) | |

## 4. Priorisierte nächste Schritte

1. **Design-Tokens vervollständigen:** Hex-Farben, Schriftstufen (6), Radien, Dauern (z. B. 150 / 250 / 400 ms) und genau eine Easing-Kurve als Variablen. Danach alle freien Werte ersetzen.
2. **Eine Button-Komponente:** `.btn` einmal sauber definieren (primär / sekundär / gefährlich / klein, min. 44 px, Press-Zustand), die 20 Duplikate und die bereichseigenen Knopf-Klassen darauf zurückführen.
3. **Animationsregeln:** nur `transform` und `opacity`, `width`/`left` umbauen, Dauern aus den Tokens.
4. **Release-Checkliste** (Handy): siehe `docs/RELEASE_CHECKLIST.md` (noch zu schreiben): Flugmodus, Hintergrund und zurück, leere App, alte Daten, kleines Handy, Tastatur, Hoch/Quer. `dev/testlab.js` als automatisches "alle Knöpfe durchklicken" vor jedem Release laufen lassen.
5. **Analyse- und Lauftag-Bereich nachspezifizieren:** je eine Seite mit Ablauf, Zuständen (leer, Fehler, 200 Runden) und "Fertig, wenn". Danach die drei Analyse-Varianten auf eine reduzieren.
6. **CSS-Altlasten abbauen:** `.s6`/`.s7`-Schichten Bereich für Bereich zusammenführen, `!important` entfernen. Eine Ansicht pro Schritt, mit Vorher/Nachher-Screenshots.
7. **`confirm()/alert()` ersetzen** durch ein eigenes Bestätigungs-Sheet im App-Design.
8. **Dateien aufteilen** (langfristig): CSS und Skript aus `index.html` in eigene Dateien (`styles/`, `app/`), damit Änderungen überschaubar bleiben.

## 5. Umgesetzt: Tokens und Buttons (sw v133)

- **Tokens:** neu `--tap` (44 px), `--dur-1/2/3` (150/250/400 ms), `--line-strong`. 496 freie Hex-Farben im CSS ersetzt durch `var(--muted/--text/--well/--card/--surface2/--accent/--ok/--warn/--danger/--on-accent/--lauf)`. Übrig: 109 seltene Farben (z. B. `#e6b94d`, Verläufe), bewusst nicht angefasst.
- **Dauern:** 31 Übergänge (0.15 bis 0.3 s) auf `--dur-1` und `--dur-2` gesetzt. Seitenwechsel (0.34 bis 0.5 s, `--ios`) unverändert.
- **`.btn`:** von 17 verstreuten Regeln auf einen Block (Basis, primary/strava, ghost, garmin, sm, active) zusammengeführt. Aussehen unverändert, `min-height: var(--tap)`.
- **Touch-Ziele:** 19 antippbare Elemente von 28 bis 40 px auf 44 px (Zurück-Knöpfe, Segmente, Chips, Auswahlzeilen). Desktop-Pillen, Zeileneingabefelder (`.f7-wl .ri` 28 px) und der Avatar (40 px) bleiben.
- **Geprüft:** `npm test` 489/489, App lädt auf 375 px ohne Konsolenfehler. Nicht auf einem echten Handy geprüft.
