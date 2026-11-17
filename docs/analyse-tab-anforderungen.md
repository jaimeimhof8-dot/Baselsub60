# Analyse-Tab: Anforderungen (Stand 17.11.2026)

Nur Plan, nichts gebaut. Reihenfolge: **1. Plan (dieses Dokument) → 2. Design (Artefakt «Analyse-Tab Garmin-Stil») → 3. Bauen** (erst nach deiner Freigabe).

Zweck dieses Dokuments: Du weisst vor dem ersten Code, **was** der Tab zeigt, **woher** jede Zahl kommt und **was bewusst fehlt**. Was nicht hier steht, kommt nicht hinein, ausser du änderst das Dokument.

---

## 1. Befund: der heutige Analyse-Tab

Gelesen: `src/an-ui.js` (311 Z.), Analyse-Bereich in `index.html` (ab «Analyse-Bereich (Menü)»), `src/series.js`, `src/charts.js`, `supabase/functions/garmin/reduce.js`, `docs/dashboard-planung.md`.

**Aufbau heute:** Menü → «Analyse» mit zwei Untereinträgen. Drei Ansichten:

| Ansicht | Inhalt heute |
|---|---|
| Heute / Einheit | Ergebnis («3 von 6 im Ziel», 3 Kennzahlen), **ein** Diagramm mit Dropdown «Diagramm» (Pace, Puls, Kadenz, Höhe, Pace+Puls, Abweichung) und Dropdown «Bereich» (Intervall), Zoom-Knöpfe − + ‹ › Alles, Ziehen = Auswahl, Tippen = Intervall; darunter Coach-Text (Gut / Nicht gut / Nächstes Mal), Planvorschlag, Details (Intervalle, Pulszonen, Vergleich letzte Einheit), Knopf «Coach-Analyse starten» |
| Verlauf | Pace-Trend der letzten 5 Intervall-Läufe, danach Liste der Tage |
| Vergleich | Zahlentabelle ich gegen Partner, Diagramm, Intervall-Paare |

### Was nicht stimmt (Ursachen dafür, dass du ständig nachbessern musstest)

1. **Zwei Diagramm-Motoren.** `an-ui.js` zeichnet eigenes SVG, `charts.js` nutzt uPlot (liegt in `vendor/uplot`). Gleiche Aufgabe, zwei Bedienungen, doppelter Pflegeaufwand.
2. **Ein Diagramm mit Dropdown statt Garmin-Stapel.** In Garmin Connect siehst du Höhe, Pace, Puls, Kadenz … **untereinander auf einer gemeinsamen Zeitachse**. Hier siehst du immer nur eine Grösse und musst umschalten, um Pace und Puls zu vergleichen.
3. **Zoom per Knöpfen.** Auf dem Handy erwartet man Zwei-Finger-Zoom und Wischen. Die Knöpfe − + ‹ › sind der Weg einer Desktop-Seite.
4. **Keine Zeit/Distanz-Umschaltung**, keine Vollbild-Ansicht, keine Überlagerung einer zweiten Grösse, kein Durchschnittsstrich.
5. **Daten dünn.** Die App holt nur Zeit, Distanz, Puls, Tempo, Höhe, Kadenz (je ≤ 600 Punkte) und Runden mit Distanz, Zeit, Puls, Watt. Garmin liefert für denselben Lauf viel mehr (siehe Abschnitt 4).
6. **Verlauf zeigt fast nichts.** Ein einziger Trend (Pace), kein Wochenumfang, keine Zonenverteilung, keine Rekorde.
7. **Der Tab hat keinen festen Informationsaufbau.** Heute, Verlauf, Vergleich hängen als Untermenü im Menü-Drawer. Was in welche Ebene gehört, war nie festgelegt, darum kam jedes Mal etwas dazu.
8. **Frühere Entscheidungen werden nicht durchgehalten** (`docs/dashboard-planung.md`): «Kein Urteil», «höchstens 4 Zahlen», «RPE fällt weg», «Kraft wird nicht getrackt». Der heutige Tab zeigt Gut/Nicht gut-Blöcke und Planänderungsvorschläge ohne klare Regel, wo sie hingehören.

---

## 2. Vorbild: Garmin Connect (im Browser geprüft, Aktivität «Thun Laufen», 10,68 km, Intervall-Lauf)

**Direkt beobachtet (Web):**

- **Kopf:** Titel, Distanz, Zeit, Ø Pace, Anstieg, Kalorien. Danach Karte.
- **Diagramm-Stapel** auf gemeinsamer Achse, jedes Diagramm mit eigener Farbe, Name, Durchschnittsstrich («Durchschnitt: 5:02 /km»): Höhe, Pace, Herzfrequenz, Leistungszustand, Schrittlänge, Schrittfrequenz, Leistung (W), Vertikales Verhältnis, Bodenkontaktzeit-Balance, Atemfrequenz, Laufen/Gehen.
- **«Zeit | Distanz»** schaltet die X-Achse für alle Diagramme.
- **Ziehen über ein Diagramm zoomt alle Diagramme gleichzeitig**, ein Knopf «Zoom zurücksetzen» erscheint; ein Punkt auf der Karte folgt dem Ausschnitt.
- **Aufweiten-Symbol** je Diagramm öffnet eine grosse Ansicht mit «Keine Überlagerung ▾» (zweite Grösse darüberlegen) und «Über Zeit | Über Distanz».
- **«Diagramme anpassen»:** Liste mit Häkchen und Ziehgriff (Reihenfolge ändern).
- **Unter den Diagrammen drei Reiter:** Statistiken | Intervalle | Zeit in Bereichen.
  - Intervalle: Tabelle Abschnittstyp (Warm up / Laufen / Pause) mit Runde, Zeit, Gesamtzeit, Distanz, aufklappbar je Intervall; Filter «Abschnittstyp».
  - Zeit in Bereichen: Pulszonen 1 bis 5 mit bpm-Grenzen, Zeit und Prozent.
- **Statistiken** gegliedert: Distanz, Ernährung/Flüssigkeit, Atemfrequenz, Ausführungswert, Training Effect (aerob 3,8 / anaerob 2,2), Belastungswert 187, Herzfrequenz, Zeitmessung (Zeit, in Bewegung, verstrichen), Leistung, Höhe, Pace, Laufeffizienz (Schrittfrequenz, Schrittlänge, vertikales Verhältnis, Bodenkontaktzeit), Intensitätsminuten, Body Battery.

**Nicht direkt gesehen (Handy-App):** Die native Garmin-Connect-App konnte ich nicht öffnen. Die folgende Handy-Bedienung ist **mein Wissen über die App, nicht von heute geprüft**: Finger auf das Diagramm legen und waagrecht ziehen bewegt einen Cursor mit Werten für alle Diagramme; Zwei-Finger-Spreizen zoomt die Zeitachse; ein Diagramm lässt sich einzeln gross öffnen. Bitte beim Review mit deiner App abgleichen (Abschnitt 9, Frage 1).

## 3. Vorbilder auf GitHub

| Projekt | Was daran nützlich ist | Einschränkung |
|---|---|---|
| [arpanghosh8453/fit-dashboard](https://github.com/arpanghosh8453/fit-dashboard) | Diagramme für Tempo, Puls, Kadenz, Höhe, Leistung mit **synchronisiertem Zoom und Verschieben** (ECharts); Karte mit Messwert beim Darüberfahren | Läuft auf Desktop/Docker, keine Runden- oder Intervall-Ansicht beschrieben, kein Handy-Fokus |
| [Nick2bad4u/FitFileViewer](https://github.com/Nick2bad4u/FitFileViewer) | Karte, Messwerte-Tabelle, wählbare Diagramme, Export | Electron-Desktop, Zoom/Runden nicht beschrieben |
| [dp-perry/fit-file-visualizer](https://github.com/dp-perry/fit-file-visualizer) | Pace, Puls, Kadenz, Höhe, Zonen für Läufe | Desktop, klein |
| [cprevallet/fitplot](https://github.com/cprevallet/fitplot) | Lauf-Auswertung aus FIT-Dateien | Desktop, ohne Interaktion |
| [endurain-project/endurain](https://github.com/endurain-project/endurain) | Selbst gehostet, Garmin-Anbindung | Ansichtsdetails nicht dokumentiert |

**Ergebnis der Suche:** Niemand hat die **Handy-Bedienung** besser gelöst als Garmin. Die Projekte sind Desktop-Programme. Übernehmenswert ist ein einziges Muster: **synchronisierter Zoom über alle Diagramme** (fit-dashboard), das Garmin ebenfalls so macht. Eine fremde Bibliothek bringt dir deshalb nichts, was du nicht schon hast: **uPlot liegt bereits im Projekt**, ist klein, offline-tauglich, und hat eingebaute **Cursor-Synchronisation** über mehrere Diagramme (`cursor.sync`) und Zoom per Ziehen. Das passt zum Muster ohne Build-Schritt.

---

## 4. Datenlage: was die App hat, was Garmin liefert

Regel: **Nie eine Zahl erfinden.** Fehlt ein Wert, bleibt die Stelle leer oder die Kachel entfällt.

| Grösse | Garmin zeigt | App hat heute | Quelle für «hinzufügen» |
|---|---|---|---|
| Distanz, Zeit, Ø Pace, Ø Puls, Max-Puls, Kalorien | ja | **ja** (`normalizeAct`) | – |
| Zeitreihe Puls, Tempo, Höhe, Kadenz, Distanz | ja | **ja** (`reduceSeries`, ≤ 600 Punkte) | – |
| Runden: Distanz, Zeit, Puls, Watt | ja | **ja** (`normalizeLaps`) | – |
| Abschnittstyp je Runde (Warm up / Laufen / Pause) | ja | berechnet (`align.js`, Phase-Erkennung mit Sicherheitsgrad) | Garmin-Abschnittstypen aus `…/typedSplits` (zu prüfen) |
| **Pulszonen mit Grenzen und Zeit** | ja | berechnet aus eigenem Max-Puls | Garmin `…/hrTimeInZones` (zu prüfen); sonst eigene Berechnung beibehalten |
| Schrittlänge, Bodenkontaktzeit, vertikale Bewegung/Verhältnis, Leistung (Reihe), Atemfrequenz, Temperatur | ja | **nein** | Zusätzliche Spalten aus `…/details` (`metricDescriptors`); Schlüsselnamen **gegen die echte Antwort prüfen** |
| Training Effect, Belastungswert, Ausführungswert, Intensitätsminuten, Body Battery-Auswirkung | ja | **nein** | Aktivitäts-Zusammenfassung (Felder vorhanden, aber nicht übernommen); **gegen echte Antwort prüfen** |
| Karte / Strecke | ja | **nein** (`maxPolylineSize=0`) | bewusst **ausgeschlossen** (siehe Nicht-Ziele) |

Grössenbudget: `plan_state` soll klein bleiben. Mehrere Reihen zu je ≤ 600 ganzen Zahlen sind akzeptabel (ca. 4 KB je Reihe als JSON). Die Reihen, die **nur auf Anforderung** gebraucht werden (Schrittlänge, Bodenkontakt …), nur laden, wenn das Diagramm dafür sichtbar ist **oder** beim Einlesen mitspeichern (Entscheidung: Abschnitt 9, Frage 4).

---

## 5. Ziel, Nicht-Ziele, Anti-Ziele

**Ziel:** Nach einer Einheit in unter 10 Sekunden beantworten: *Wie lief es gegen den Plan, wo genau (Intervall, Minute), und wie ändert sich das über die Wochen?* Bedienung der Diagramme wie in Garmin Connect, auf dem Handy mit einem Daumen.

**Nicht-Ziele (kommen nicht hinein, ausser du änderst dieses Dokument):**
- Karte / Strecke / Höhenprofil auf Karte
- Kraft-Auswertung mit Uhr-Daten (Kraft wird nicht getrackt; dort nur «x von y Übungen abgehakt»)
- RPE, Punktzahl, Ring, Ampel, Kurzurteil als Zahl
- Schlaf, HRV, Body Battery als eigene Ansichten (gehören in Dashboard/Erholung)
- Teilen, Kommentieren, Fotos
- Ändern von Aktivitäten (Name, Typ, Löschen)

**Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft):**
- Eine Ansicht mit mehr als **4 Kennzahlen im Kopf**.
- Zwei verschiedene Bedienungen für dasselbe Diagramm.
- Eine Zahl, die die App geraten hat, ohne «geschätzt» zu kennzeichnen.
- Ein Bedienelement, das nur auf dem Desktop funktioniert (Hover, Rechtsklick, Mausrad als einziger Weg).

---

## 6. Informationsaufbau (fest)

**Navigation (Entscheidung 17.11.):** Oben im Tab steht **kein** Reiter. Die drei Ansichten stehen im **Menü (Burger oben rechts)** als Untereinträge von «Analyse» und sind nur sichtbar, solange der Analyse-Tab offen ist (so wie `#msub` heute). Die Kopfzeile zeigt die aktive Ansicht als Titel.

```
Kopfzeile   ANALYSE · DI 17.11.        [☰]
            Einheit                      ← Titel = aktive Ansicht

Menü        Training
              Analyse
                · Einheit
                  Verlauf
                  Vergleich mit Partner
              Wochenrückblick, Plan, Dashboard
            Daten
              Strava und Garmin, Backup
```

### 6.1 Reiter «Einheit» (Standard)

Eine Einheit, von oben nach unten. **Jeder Block hat eine feste Aufgabe und eine Obergrenze.**

| # | Block | Inhalt | Obergrenze |
|---|---|---|---|
| 1 | **Einheiten-Wähler** | Pfeile ‹ › (in ihren Knöpfen zentriert, 48 × 48 px) zur älteren/neueren Einheit; Mitte: Datum und «Einheit 1 von 3». Die Liste aller Einheiten steht im Reiter Verlauf | 1 Zeile |
| 2 | **Ergebnis** | Art + Datum + Dauer + Distanz; Titel einmal; **die eine Aussage** («3 von 4», dazu Pille «1 verfehlt»); 3 Kennzahlen (Pace Arbeit, Puls Ø Arbeit, Puls-Drift); darunter eine Zeile **Datenlage** («Garmin · 9 Runden · Puls lückenlos · Phasen sicher erkannt», bei unsicherer Erkennung orange mit «Zuordnung ändern») | 1 Aussage + 3 Zahlen + 1 Zeile |
| 3 | **Diagramm-Stapel** | Standard: Pace, Puls, Höhe. Weitere über «Diagramme» zuschaltbar. Gemeinsame Zeitachse, gemeinsamer Cursor, gemeinsamer Zoom. Intervalle als dezente Bänder hinterlegt | 3 sichtbar, max. 6 wählbar |
| 4 | **Ausschnittsleiste** | Haftet unter dem Diagramm. Zeigt Dauer, Distanz, Ø Pace, Ø Puls des Ausschnitts bzw. der Auswahl; «Ganze Einheit», wenn nichts gewählt | 4 Werte |
| 5 | **Reiter unter dem Diagramm** | **Intervalle** (Plan gegen Ist, Tabelle wie Garmin; in Pausen der Puls-Abfall «↓14») · **Zonen** (Pulszonen für den gewählten Ausschnitt) · **Vorher** (gegenüber der letzten gleichen Einheit) · **Mehr** (Statistik, falls Garmin-Felder vorhanden) | 4 Reiter |
| 6 | **Coach** | Eingeklappt. «Gut / Nicht gut / Nächstes Mal» und Planvorschlag erst nach Tipp; «Coach-Analyse starten» nur, wenn noch keine existiert | 1 Zeile im Ruhezustand |

Leere Zustände (fest):
- Ruhetag: «Heute ist Ruhetag.»
- Einheit noch nicht erledigt: Hinweis, kein leeres Gerüst.
- Keine Zeitreihe (alte Aktivität): Diagramm zeigt **Rundenstufen** und trägt die Zeile «Nur Rundenwerte, keine Sekundendaten».
- Eine Reihe fehlt (z. B. keine Kadenz): Diagramm taucht in der Auswahl nicht auf.
- Kraft-/Stationstag: Kopf + «x von y Übungen abgehakt» + Stationszeiten, wenn vorhanden; sonst nichts.

### 6.1b Stationstag (Einheit ohne Diagramm)

Ergebnis «3 von 8 Stationen im Ziel» mit Pille «5 verfehlt»; 3 Zahlen: Stationszeit, **Kompromiss Ø** (s/km langsamer direkt nach einer Station als im Plan), Schwächste Station. Darunter Tabelle **Zeit je Station**: Station, Zeit, Ziel, Δ; die schlechteste trägt die Pille «Schwächste». Kein Diagramm, weil Kraft nicht mit der Uhr getrackt wird. Kraft-Tag: Ergebnis «x von y Übungen abgehakt», sonst nichts.

### 6.2 Reiter «Verlauf»

Beantwortet: *Werde ich schneller, wie viel laufe ich, wo verbringe ich Zeit?*

| # | Block | Inhalt |
|---|---|---|
| 1 | Zeitraum-Schalter | 4 Wochen · 12 Wochen · Saison |
| 2 | **Trend-Diagramm** | Pace Arbeit je Intervall-Lauf (heute schon vorhanden), Punkt antippen = Einheit öffnen |
| 3 | **Wochenumfang** | Balken Kilometer je Woche, getrennt nach Lauf / Station (Sportfarben der App) |
| 4 | **Zonenverteilung** | Gestapelter Balken je Woche, Zonen 1 bis 5 |
| 5 | **Liste der Einheiten** | Nach Wochen gruppiert, je Zeile: Tag, Titel, 1 Kennzahl; Tipp öffnet «Einheit» |

Ein Block erscheint **nur, wenn mindestens 3 Datenpunkte** vorliegen; sonst steht dort «Noch zu wenig Daten (n von 3)».

### 6.3 Reiter «Vergleich» (ich gegen Partner)

Nur Zahlen, **keine Wertung**. Gleicher Diagramm-Stapel wie in «Einheit», zweite Linie gestrichelt. Darunter Tabelle «Ich | Partner | Differenz» für Pace Arbeit, Puls Ø, Drift, Intervalle im Ziel, danach Intervall-Paare. Ohne Partner-Daten: Hinweis mit Grund (lädt / keine Aktivität).

---

## 7. Bedienung der Diagramme (verbindlich)

| Geste / Element | Handy | Desktop |
|---|---|---|
| **Cursor** | Finger auf das Diagramm legen und waagrecht ziehen; Cursor und Werte folgen in **allen** Diagrammen | Mauszeiger darüberfahren |
| **Seite scrollen** | Senkrechtes Wischen scrollt die Seite weiter (Diagramm hat `touch-action: pan-y`) | Mausrad |
| **Zoom** | Zwei-Finger-Spreizen/Zusammenziehen auf der Zeitachse (nur X) | Ziehen eines Bereichs; Strg + Mausrad |
| **Verschieben (im Zoom)** | Mit zwei Fingern verschieben | Ziehen mit Umschalt |
| **Zoom zurück** | Doppeltipp **und** Knopf «Zoom zurücksetzen» (erscheint nur im Zoom) | Knopf |
| **Bereich wählen** | Zeile in der Intervall-Tabelle antippen → Bereich ist gewählt, Diagramme zoomen darauf, Ausschnittsleiste zeigt dessen Werte | Ebenso |
| **Zeit ↔ Distanz** | Umschalter oberhalb des Stapels, wirkt auf alle Diagramme | Ebenso |
| **Diagramme wählen** | Knopf «Diagramme» öffnet ein Blatt mit Häkchenliste; Reihenfolge per Ziehgriff | Ebenso |
| **Vollbild/Überlagerung** | Symbol an jedem Diagramm; Querformat; Auswahl «Überlagern mit …» | Ebenso |
| **Zeilen und Ziele** | Alle Tippflächen ≥ 44 × 44 px | – |

Darstellung: Pace-Achse **invertiert** (schneller = oben), Pace über 12:00/km und Stehen als Lücke, nicht als Ausreisser. Durchschnittsstrich gestrichelt mit Beschriftung. Intervalle als hinterlegte Bänder mit Nummer. Einheitlich deutsche Zahlen (Komma), `mm:ss`, Einheiten klein neben dem Wert.

Barrierefreiheit: Diagramm erreichbar per Tastatur (Pfeile bewegen den Cursor, + / − zoomen), Werte des Cursors in einer `aria-live`-Zeile, Farben nie die einzige Information (Zonen und Abweichungen tragen zusätzlich Text), Kontrast ≥ 4,5 : 1.

---

## 8. Technische Entscheidungen (mein Vorschlag, du kannst widersprechen)

1. **Ein Diagramm-Motor: uPlot** (liegt schon im Projekt). `an-ui.js` wird die einzige Stelle für den Analyse-Tab; die eigene SVG-Zeichnung dort und die Doppelung zu `charts.js` entfallen. Cursor-Sync über `cursor.sync.key`, Zoom über `setScale` an alle Diagramme weitergereicht. **Prüfpunkt vor dem Bauen:** Pinch-Zoom und `touch-action` in uPlot sind nicht eingebaut und werden mit einem kleinen eigenen Touch-Modul (ca. 60 Zeilen) ergänzt.
2. **Kein Build-Schritt, kein neues Framework** (Vanilla-JS-PWA bleibt).
3. **Reine Berechnung getrennt von Darstellung:** Intervalle, Ausschnitts-Kennzahlen, Zonen, Wochenumfang liegen als reine Funktionen mit Tests (`test/*.test.js`), die Darstellung nur als Hülle.
4. **Offline:** Alles aus dem Cache (`sw.js` erhöhen); kein Netz nötig, ausser für «Coach-Analyse starten».
5. **Navigation:** Analyse bleibt im Menü. Einheit, Verlauf, Vergleich werden Untereinträge im Drawer (`#msub`, nur sichtbar im Analyse-Tab, heute schon so für Verlauf und Vergleich; neu kommt «Einheit» dazu). Im Tab selbst gibt es keine Reiterleiste.

---

## 9. Entscheidungen (17.11.)

1. **Handy-Bedienung:** stimmt mit deiner Garmin-App überein. ✔
2. **Pulszonen:** Garmin-Grenzen der Einheit (Abschnitt 15). ✔
3. **Coach-Text:** bleibt eingeklappt, wird ausführlicher (Abschnitt 16). ✔
4. **Training Effect und Belastungswert:** von Garmin übernehmen; die vier Laufeffizienz-Reihen (Schrittlänge, Bodenkontakt, vertikal, Leistung) erst Phase 2. ✔
5. **Prognose-Karte:** nur bei Änderung (Abschnitt 16). **Noch offen:** Zählt ein Intervall-Lauf mit allen Intervallen im Ziel für die Schwellen-Pace der Prognose?

## 10. Abnahme (so erkennst du, dass es fertig ist)

- [ ] Auf dem Handy: Finger auf Pace-Diagramm ziehen → Cursor und Werte in Pace, Puls, Höhe gleichzeitig.
- [ ] Zwei-Finger-Zoom zoomt **alle** Diagramme; «Zoom zurücksetzen» stellt die ganze Einheit wieder her.
- [ ] Antippen von «Intervall 3» in der Tabelle zoomt auf dessen Zeitbereich; Ausschnittsleiste zeigt dessen Pace und Puls.
- [ ] Zeit ↔ Distanz wechselt alle Diagramme.
- [ ] Alte Aktivität ohne Sekundenreihe zeigt Rundenstufen und den Hinweis, keine erfundene Linie.
- [ ] Kein Reiter zeigt mehr Zahlen als in Abschnitt 6 erlaubt.
- [ ] Kein horizontales Scrollen bei 390 px; alle Tippflächen ≥ 44 px.
- [ ] Alle bestehenden Tests grün; neue Tests für Ausschnitts-Kennzahlen, Intervall-Zuordnung, Zonenverteilung, Wochenumfang.
- [ ] Menü zeigt nur noch «Analyse» (ohne Untereinträge).

## 11. Bauphasen

0. **Daten zuerst:** 1-s-Reihe von Garmin holen und speichern (Abschnitt 14), Garmin-Zonen und Training Effect/Belastungswert mit einlesen. Ohne das bleiben alle Diagramme grob.
1. **Grundlage:** Diagramm-Stapel mit uPlot, Cursor-Sync mit Einrasten auf Messpunkte, Zoom bis 10 s (Touch und Maus), Zeit/Distanz, Glättung, Werte im Ausschnitt, Ausschnittsleiste. Alte Zeichnung in `an-ui.js` entfernen.
2. **Einheit komplett:** Kopf, Wähler, Reiter Intervalle/Zonen/Mehr, Coach eingeklappt, Leerzustände.
3. **Daten:** Training Effect, Belastungswert; Zonengrenzen; danach optional Laufeffizienz-Reihen.
4. **Verlauf:** Trend, Wochenumfang, Zonenverteilung, Liste.
5. **Vergleich:** Gleicher Stapel mit Partner-Linie.
6. **Aufräumen:** `sw.js`-Version, Tests, `UI_UX_AUDIT.md` nachführen.

## 12. Funktionsprüfung (17.11.): reicht das für eine eigenständige, professionelle Analyse?

Ehrliche Antwort: **Der erste Entwurf nicht ganz.** Gefunden und im Entwurf behoben:

| Lücke | Behebung |
|---|---|
| «Datenlage der Uhr» war in `docs/dashboard-planung.md` als immer sichtbar beschlossen, fehlte im Entwurf | Zeile unter dem Ergebnis |
| «Vergleich mit der letzten gleichen Einheit» war beschlossen, fehlte | Reiter **Vorher** |
| Stationstag (Kern des Ziels Hyrox unter 60:00) war nur ein Platzhalter | Eigene Ansicht 6.1b mit Kompromiss-Delta |
| Puls-Erholung in der Pause fehlte | «↓14» in den Pausenzeilen |
| Konstanz der Intervalle fehlte | Spanne schnellstes/langsamstes Intervall (Coach-Text, aus Daten berechnet) |
| Zahlen im Entwurf standen fest im Code und widersprachen sich (Ø Pace 5:22 im Diagramm, 5:01 in der Leiste) | Alles aus den Reihen berechnet; Ø Pace immer Dauer ÷ Distanz |

Weiterhin **offen** (bewusst Phase 2 oder nicht gebaut): steigungsangepasste Pace, Schrittlänge, Bodenkontaktzeit, Rekorde, Schuh-Kilometer, Wetter, manuelle Korrektur der Phasen-Zuordnung (nur Hinweis in der Datenlage-Zeile), Beitrag der Einheit zum Ziel unter 60:00 (Frage 5 unten).

Regel für Puls-Drift: Ø Puls des letzten Arbeitsintervalls minus Ø Puls des ersten. Warnfarbe ab **8 bpm**.

## 14. Genauigkeit der Diagramme (Messung im Code, 17.11.)

Frage: «Wie genau sind die Diagramme?» Antwort: **Heute nicht professionell.** Gemessen an einem 53:42-Lauf (3 222 s):

| Stufe | Heute | Wo im Code | Soll |
|---|---|---|---|
| Von Garmin geholt | `maxChartSize=1000` → 1 Punkt je 3,2 s | `supabase/functions/garmin/index.ts` | volle 1-s-Reihe (3 223 Punkte), Parameter erhöhen |
| Gespeichert | `reduceSeries` maxN 600 → Mittel über 2 Punkte, 5,4 s | `reduce.js` | 1 s, in eigener Tabelle |
| Diagramm-Raster | `N = min(500, …)` → 6,4 s, fest für die ganze Einheit | `an-ui.js anChartData` | 1 s, aus der Quelle im Ausschnitt neu abtasten |
| Glättung | fest: Pace 5 Rasterpunkte ≈ 32 s, Puls 3 ≈ 19 s | `an-ui.js` | Pace wählbar Aus / 5 / 10 / 30 s, Puls roh |
| Gezeichnet | höchstens ≈ 150 Punkte (`step = (i1−i0)/150`) → alle ≈ 19 s | `an-ui.js path` | jeder Punkt; sonst Min und Max je Pixelspalte |
| Wert am Cursor | nächster von 500 Rasterpunkten (6,4 s) | `an-ui.js` | nächster Messpunkt (1 s), Cursor rastet dort ein |
| Kleinster Zoom | 60 s, ohne mehr Detail, weil das Raster fix bleibt | `clampV` | 10 s mit Einzelsekunden |

Folge: Der Start eines Intervalls (Sprung von 5:36 auf 4:00) wird über etwa **30 Sekunden verschmiert**, Spitzen verschwinden, Zoomen bringt keine Details. Die Ursache ist nicht ein Fehler, sondern eine Kette von Verkleinerungen.

**Anforderungen**
1. **Auflösung 1 s** von Garmin bis in die Anzeige. Keine Mittelung beim Speichern.
2. **Speicherort:** Die 600-Punkte-Reihe bleibt als Rückfall in `plan_state`. Die 1-s-Reihe (Pace/Tempo, Puls, Kadenz, Höhe, Distanz) kommt als Delta-codierte Ganzzahlen in eine eigene Tabelle (ca. 25 KB je Einheit), wird nur für die geöffnete Einheit geladen und im Gerät zwischengespeichert. Erst prüfen, ob Garmin bei `maxChartSize` über 1000 liefert.
3. **Zeichnen ohne Verlust:** Passen weniger Punkte als Pixel in den Ausschnitt, wird jeder Punkt gezeichnet. Sonst Min/Max je Pixelspalte. Canvas (uPlot), keine SVG-Pfade mit Ausdünnung.
4. **Glättung** ist eine Anzeige-Option (Aus, 5, 10, 30 s) nur für die Pace, Standard 10 s. Berechnete Kennzahlen (Ø Pace, Intervall-Pace) nutzen nie die Glättung: Ø Pace = Dauer ÷ Distanz.
5. **Cursor** rastet auf den nächsten Messpunkt, zeigt Zeit, Distanz und Abschnitt (Lauf 2, Pause …) in einer festen Leiste über den Diagrammen.
6. **Zoom** bis 10 s (Distanz 30 m).
7. **Werte im Ausschnitt:** Ø, Min, Max je Grösse (Pace, Puls, Schrittfrequenz, Höhe) für den gewählten Ausschnitt.
8. **Auflösung sichtbar:** Unter dem Stapel steht «Auflösung 1 s · 3 223 Messpunkte · Quelle Garmin». Hat die Einheit nur die reduzierte Reihe, steht dort orange «Auflösung 5 s (reduziert)».
9. **Zeitachse** ist die Timer-Zeit wie bei Garmin (Pausen der Uhr zählen nicht).

**Abnahme:** Ein 4 × 1,5-km-Lauf zeigt den Intervallstart als Anstieg innerhalb von 5 Sekunden (Glättung Aus). Ein Zoom auf 10 s zeigt Einzelsekunden. Cursor-Werte stimmen mit den Rohwerten der Garmin-Aktivität überein.

## 15. Pulszonen (Prüfung gegen Garmin Connect, 17.11.)

Garmin Connect zeigt für «Thun Laufen»: **Z1 114 bis 140 · Z2 141 bis 156 · Z3 157 bis 166 · Z4 167 bis 175 · Z5 über 175 bpm** (Zeiten 14:46 · 8:18 · 5:12 · 15:37 · 4:23, zusammen 52:16 von 53:42, der Rest liegt unter Zone 1). Die App rechnet 50/60/70/80/90 % des **höchsten je gemessenen Pulses** (`hrZones` in `src/series.js`). Bei 187 bpm sind das 94/112/131/150/168. Ein Puls von 160 bpm ist bei Garmin Zone 3, in der App Zone 4.

**Entscheidung:** Die Grenzen der Einheit von Garmin übernehmen (`hrTimeInZones` je Aktivität, Schlüsselnamen gegen die echte Antwort prüfen). Die Zonen im Verlauf (Zonenverteilung) nutzen dieselben Grenzen. Fehlen sie, gilt der Rückfall auf die eigene Rechnung mit dem Hinweis «Zonen geschätzt». Die Zeit unter Zone 1 wird als eigene Zeile gezeigt.

## 16. Coach-Einschätzung, Training Effect, Prognose (entschieden 17.11.)

- **Coach bleibt eingeklappt**, die Kopfzeile zeigt ein Urteil in Worten und den Grund («Solide · 3 von 4 im Ziel, Intervall 4 fällt ab»). Aufgeklappt, in dieser Reihenfolge: **Gut, Nicht gut, Gegen den Plan, Gegen die letzte gleiche Einheit, Gegen deine Saison, Mögliche Ursache, Nächstes Mal**, dann der **Vorschlag für den Plan** (Nur für mich, Für uns beide, Verwerfen). Fuss: Zeitpunkt der Analyse, «Nochmals analysieren». Jede Aussage nennt Zahlen aus den Daten, keine Behauptung ohne Beleg (zum Beispiel «erholt weniger» nur, wenn der Puls-Abfall wirklich sinkt). Das Urteil ist Text, keine Punktzahl.
- **Training Effect (aerob, anaerob) und Belastungswert** werden von Garmin übernommen und als zwei graue Pillen im Ergebnis gezeigt, Details im Reiter Mehr. Fehlt der Wert, entfällt die Pille.
- **Prognose-Karte («Rennprognose Sub 60»)** unter dem Ergebnis, **nur wenn die Einheit die Prognose um mindestens 1 s verändert**: «59:41 → 59:33, −8 s», darunter was sich bewegt hat (Laufen, Stationen, Roxzone) und die Spanne. Technisch `buildForecast` vor und nach der Einheit, Unterschied mit `delta()`. **Wichtig:** Die Prognose nutzt heute nur Testzeiten und Simulationen. Ein normaler Intervall-Lauf ändert sie nicht. Offene Entscheidung: Soll ein Lauf, bei dem alle Intervalle im Ziel liegen, die Schwellen-Pace (`base`) der Prognose anheben? Ohne diese Regel erscheint die Karte nur nach Tests und Simulationen.

## 13. Gestaltungsregeln (aus der UX-Prüfung, gelten für alle Elemente)

- **Platz:** Seitenrand 16 px, Abstand zwischen Blöcken 28 px, in Karten 16 bis 20 px, Tippflächen mindestens 44 px (Wähler, Chips, Tabellenzeilen 48 px). Nichts wird abgeschnitten: Text umbricht oder steht in einem Container mit eigenem Scrollen. Geprüft bei 390 px.
- **Zentrierung:** Jedes Symbol und jeder Text in einem Knopf ist waagrecht und senkrecht zentriert (Pfeile, Menüsymbol, Segmente, Chips). Zahlenspalten rechtsbündig mit Tabellenziffern.
- **Hierarchie:** Pro Ansicht eine grosse Zahl (56 px), danach 3 mittlere (30 px), Tabellen 14 px, Labels 12 px Grossbuchstaben in Grau. Der Titel der Einheit steht nur einmal.
- **Farben:** Gold nur für Auswahl und primäre Aktion. Grün/Rot nur für Ziel erreicht/verfehlt. Orange nur für Warnung. Blau, Rot, Violett nur als Datenreihen (Pace, Puls, Höhe). Grau für Beschriftung und Pausen. Jede Wertung trägt zusätzlich Text («1 verfehlt», «+8 s»).
- **Konsistenz:** Dieselbe Komponente für Wähler (Einheit und Vergleich), Zahlentabellen und Pillen.

## 17. Bau-Stand (17.11.2026)

Gebaut und in der Testkopie (Port 8081, Beispielstand `?seed=analyse&heute=2026-10-22`) bei 390 px geprüft:

| Teil | Datei | Stand |
|---|---|---|
| Rechenkern Diagramme (Glättung, Min/Max-Ausdünnung, Ticks, Einrasten, Zoomgrenzen) | `src/an-chart.js` | fertig, 7 Tests |
| Ansichts-Modell je Typ (Intervall, Station, Kompromiss, lockerer Lauf, Velo Zone 2, Kraft), Zonen, Kilometer, 10-Min-Blöcke, Entkopplung, Drift, Datenlage | `src/an-session.js` | fertig, 17 Tests |
| Diagramm-Oberfläche (Stapel, Cursor, Zoom mit zwei Fingern, Glättungsmenü, Diagramm-Blatt, Werte im Ausschnitt) | `src/an-plot.js` | fertig, im echten Browser geprüft |
| Bausteine (Kopf, Wähler, Ergebnis, Tabellen, Coach, Verlauf, Vergleich) | `src/an-ui.js` | fertig, 5 Tests |
| Einbindung, Menü-Untereintrag «Einheit», Klick-Aktionen | `index.html` | fertig |
| Garmin: 1-s-Reihe (neueste 6), Leistung, Garmin-Zonen, Training Effect, Belastungswert | `supabase/functions/garmin/*`, `src/garmin.js`, `src/series.js` | Code fertig und getestet, **nicht gegen echte Garmin-Antwort geprüft, Edge Function nicht deployt** |
| Service Worker | `sw.js` | v131, neue Module eingetragen |

**Was noch von dir kommt, bevor es auf dem Handy so aussieht wie im Entwurf:**
1. Edge Function deployen: `supabase functions deploy garmin --no-verify-jwt`. Danach holt die nächste Garmin-Synchronisation für die 6 neuesten Einheiten die 1-s-Reihe und für alle die Zonen. Bis dahin steht in der Datenlage-Zeile «Auflösung 5 s (reduziert)» und «Zonen geschätzt», das ist gewollt.
2. Die Schlüsselnamen in der echten Antwort prüfen: `directPower` (Details), `zoneNumber`, `zoneLowBoundary`, `secsInZone` (hrTimeInZones), `aerobicTrainingEffect`, `anaerobicTrainingEffect`, `activityTrainingLoad` (Aktivitätsliste). Die Funktionen sind defensiv und lassen fehlende Felder weg.
3. Speicher: Die 6 neuesten Einheiten brauchen je etwa 100 KB in `plan_state` (vorher 16 KB). Gesamt etwa +0,5 MB. Wird das zu viel, kommt die eigene Tabelle aus Abschnitt 14.

**Bewusst noch nicht gebaut:** steigungsangepasste Pace, Schrittlänge, Bodenkontaktzeit (Phase 2); die Regel, dass ein Intervall-Lauf mit allen Intervallen im Ziel die Prognose bewegt (offene Entscheidung). Die Prognose-Karte erscheint heute nur nach Simulationen, weil nur diese die Prognose verändern.

**Diagramm-Motor:** Entgegen Abschnitt 8 Punkt 1 nutzt der Analyse-Tab nicht uPlot, sondern das im Entwurf geprüfte SVG-Zeichnen mit Min/Max je Pixelspalte (`src/an-plot.js`). uPlot bleibt für den Dashboard-Tab «Vergleich» (`src/charts.js`) bestehen.
