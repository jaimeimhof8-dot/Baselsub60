# UI/UX-Audit Basel Sub-60

Stand 18.10.2026. Geprüft mit echten Full-Page-Screenshots (Edge headless über CDP, Mobile 390×844 und Desktop 1440×900) der Ansichten Heute, Woche, Coach, Dashboard, Wochenrückblick, Profil/Tests, Plan, Backup, Strava/Garmin und Menü.

## 1. Design-DNA (bleibt unangetastet)

- **Dunkles Glas-Design**: Hintergrund `--bg #06070a`, Karten `--card #0e1016` mit heller Oberkante (`--edge`), eingelassene Felder `--well`.
- **Ein Akzent**: Gelb `--accent #ffd21f` nur für die primäre Aktion, Auswahl und „heute“. Ampel `--ok / --warn / --danger`, Sportarten `--lauf / --kraft / --bike / --station`.
- **Zwei Schriften**: Barlow Condensed (`--f-head`) für Zahlen und Countdown, Systemschrift (SF Pro / Segoe) für Titel und Text.
- **4-px-Raster** `--s1…--s7`, Radien `--r-m`, Karten mit 16–20 px Innenabstand.
- **Layout**: Mobil Tab-Leiste unten (4 Tabs) + Menü-Drawer, Desktop Pillen-Navigation oben, Inhalte in `narrow` (Formulare, Rückblick) oder `wide` (Dashboard).
- **Tonalität**: Coach-Sprache, kurz und direkt, Deutsch (CH).

## 2. Top 10 UI/UX-Mängel (nach Schweregrad)

| # | Schwere | Ansicht / Stelle | Problem |
|---|---|---|---|
| 1 | Kritisch | Kopfzeile, `.menu-btn` (index.html) | Das Menü-Symbol ist ein Sonnen-/Zahnrad-Strahlenkranz und wird als Hell/Dunkel-Schalter gelesen. Dahinter liegen Wochenrückblick, Plan, Profil, Backup, Strava/Garmin – für Nutzer praktisch unsichtbar. |
| 2 | Hoch | Woche, Wochenübersicht `wsum` | „Einheiten 0/5“, während Dashboard und Wochenrückblick für dieselbe Woche „3/5“ zeigen. Die Woche zählte nur komplett abgehakte Tage, der Rest der App jede trainierte Einheit. |
| 3 | Hoch | Dashboard Desktop, Diagramme `.viz` | Die SVG-Diagramme (viewBox 320 px) werden auf bis zu 620 px gestreckt: Achsenbeschriftung wird ~23 px gross und dominiert die Karte. |
| 4 | Hoch | Alle Ansichten, `.btn.ghost` | Sekundäre Knöpfe („Details und alle Nächte“, „Muskelkater genau eintragen →“, „Ändern“, „Weniger anzeigen“) haben einen Rand mit 6 % Deckkraft: sie wirken wie eingerückter Fliesstext, nicht wie Knöpfe. |
| 5 | Mittel | Menü-Drawer | Titel „Einstellungen“, Inhalt sind aber Training und Navigation (Wochenrückblick, Plan). Erwartung und Inhalt passen nicht. |
| 6 | Mittel | Dashboard Desktop, `.dgrid` | Ohne Kraft-Daten bleibt „Erholung im Verlauf“ halb breit, rechts klafft eine leere Spalte. |
| 7 | Mittel | Fokus (Tastatur) | `:focus-visible` nur für `button`. Haltbare Übungen (`[role=button]`), `summary` („Wie wird gerechnet?“, Muskelkater) und Links haben keinen sichtbaren Fokus. |
| 8 | Mittel | Touch-Ziele | „Wie wird gerechnet?“ (`.rv-how summary`) nur 32 px hoch, Saison-Kacheln 40 px – unter 44×44 px. |
| 9 | Niedrig | Hover (Desktop) | Menüzeilen `.mi`, Wochen-Kacheln und Tageszeilen reagieren nicht auf Hover; nur Knöpfe tun es. Klickbarkeit ist mit der Maus nicht erkennbar. |
| 10 | Niedrig | Typografie | Titel brechen mit einzelnen Wörtern um („…Punkten zum / Beobachten.“), Fliesstext ohne `text-wrap: pretty`; auf Desktop laufen Hinweise im Dashboard über 100 Zeichen pro Zeile. |

Geprüft und ohne Befund: kein horizontales Scrollen auf 390 px (scrollWidth = 390 in allen Ansichten), keine verzerrten Bilder (die App nutzt nur SVG-Icons), Kontrast Text/Hintergrund `#f5f5f7` auf `#0e1016` ≈ 17:1, `--muted #9a9ba3` auf `#0e1016` ≈ 7:1 (WCAG AA erfüllt).

## 3. Korrektur-Spezifikationen

1. **Menü-Symbol**: Drei Linien (Hamburger, 24-px-Raster, Strich 1,9 px, runde Enden), `aria-label="Menü öffnen"`. Grösse bleibt 44×44 px Glas-Knopf.
2. **Einheiten zählen**: Woche nutzt dieselbe Regel wie Dashboard/Rückblick: `trained(i)` (mindestens eine Übung abgehakt, RPE eingetragen oder passende Aktivität).
3. **Diagramme**: `.viz` max. 480 px breit. Ab 600 px Fensterbreite Achsenschrift 8,5 Einheiten → gerendert 12–13 px; auf dem Handy unverändert (12–14 px).
4. **Ghost-Knöpfe**: Rand `rgba(255,255,255,0.16)`, Hover `0.28` + Hintergrund `--surface2`; Höhe ≥ 44 px bleibt.
5. **Drawer**: Titel und Dialog-Name „Menü“, Schliessen-Knopf „Menü schliessen“.
6. **Dashboard-Raster**: `.dgrid > section:only-child { grid-column: 1 / -1 }`.
7. **Fokus**: `[role=button]`, `summary`, `a`, `[tabindex="0"]` erhalten `outline: 2px solid var(--accent); outline-offset: 2px` bei `:focus-visible`.
8. **Touch-Ziele**: `.rv-how summary` min-height 44 px, Saison-Kacheln min-height 44 px.
9. **Hover** (nur `@media (hover: hover)`): `.mi`, `.rv-wk-c`, `.day`, `.blk` erhalten Hintergrund `--surface2`, Übergang 0,2 s `var(--ease)`.
10. **Typografie**: `h1, h2, h3 { text-wrap: balance }`, `p, li { text-wrap: pretty }`, Hinweistexte `.sub` in breiten Ansichten max. 70ch.

## 4. Umsetzung und Nachher-Check

Alle zehn Punkte sind umgesetzt (index.html, CSS und Markup). Nachher-Screenshots in beiden Grössen geprüft:

| # | Ergebnis |
|---|---|
| 1 | Menü-Knopf zeigt drei Linien, Screenreader liest „Menü öffnen“. |
| 2 | Woche zeigt 3/5 wie Dashboard und Wochenrückblick. |
| 3 | Desktop-Diagramme max. 480 px, Achsenschrift ~12–13 px statt ~23 px. |
| 4 | Sekundäre Knöpfe haben einen sichtbaren Rand und einen Hover-Zustand. |
| 5 | Drawer heisst „Menü“. Reihenfolge nach Nutzen: Training (Wochenrückblick, Plan, Strava/Garmin) vor Daten (Backup). Plan hat ein eigenes Fahnen-Symbol statt Linien (sonst gleich wie das Menü-Symbol). |
| 6 | „Erholung im Verlauf“ nimmt ohne Kraft-Daten die ganze Breite ein. |
| 7 | Fokusring für `[role=button]`, `[tabindex=0]`, `summary`, `a`. |
| 8 | „Wie wird gerechnet?“ 44 px hoch mit Pfeil, der beim Aufklappen dreht. Saison-Kacheln 44 px. |
| 9 | Hover für Menüzeilen, Plan-Blöcke, Tage und Saison-Kacheln (nur bei Maus). |
| 10 | `text-wrap: balance` für Titel und das Urteil im Wochenrückblick, `pretty` für Fliesstext, Hinweise im Dashboard max. 70ch. |

Unverändert: Farben, Schriften, Radien, Raster, Navigation und Tonalität. Auf 390 px kein horizontales Scrollen (scrollWidth = 390 in allen Ansichten).

**Build:** Das Projekt hat bewusst keinen Build-Schritt (Vanilla-JS-PWA, ES-Module, GitHub Pages). `npm run build` gibt es nicht. Stattdessen laufen die Tests mit `npm test`: 165 von 165 grün. Service-Worker-Cache auf v54 erhöht, damit Handys die neue Version laden.
