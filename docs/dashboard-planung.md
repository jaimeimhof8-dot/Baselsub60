# Planung: Dashboard nach dem Training

Stand: Entwurf, nichts in `index.html` oder `src/` geändert. Jedes Design ist ein eigenes Artefakt mit drei Screens (Kraft, Lauf-Intervall, Stationstag), privat, nur für Jaime:
1. Kacheln: https://claude.ai/artifact/T3Yt4Ag4HuLx5ohrXun2ox
2. Zeitleiste: https://claude.ai/artifact/3ZiBGxQy1EUTwQT2gDC1QQ
3. Plan gegen Ist: https://claude.ai/artifact/Fdhj9NaKB4ekngMQipgE7H
4. Urteil: https://claude.ai/artifact/CaAiZF4C8gK17Wh8eiv1bB

Die frühere Sammelseite (alles in einer Seite, mit Schaltern) war überladen und ist ersetzt. Die Screens zeigen bewusst wenig: 4 Zahlen oder eine Tabelle, Farbe nur für das, was nicht im Ziel war.

## 1. Blindspot-Pass

### Was Jaime nach dem Training wirklich wissen will
1. War die Einheit gut oder nicht? Ein Satz, bevor Zahlen kommen.
2. Ø Puls nur der Arbeitsphasen (Arbeitssätze, Intervalle), nicht des ganzen Trainings.
3. Wurden die Garmin-Daten übernommen, und was genau (Runden, Puls)?
4. Plan gegen Ist: je Satz (Kraft), je Intervall, je Station.
5. Vergleich mit der letzten gleichen Einheit (Pace, Puls, Gewichte, Anstrengung).
6. Kompromiss-Delta nach Station, und nach welcher Station am grössten.
7. Gewichte pro Satz: schwerer, gleich, leichter, und ob alle Wiederholungen kamen.
8. Hat das Tempo im Verlauf nachgelassen (Puls-Drift, Intervall 4 bis 6)?
9. War es so anstrengend wie vorgesehen (RPE gegen Vorgabe)?
10. Was ändere ich nächstes Mal, und wie sicher ist diese Aussage?

### Datenlage (aus dem Code: `analyse.js`, `session-dash.js`, `dash-all.js`, `laps.js`, `garmin.js`, `docs/gewichtsvorschlag.md`)
| Quelle | Vorhanden | Lücke |
|---|---|---|
| Garmin/Strava-Aktivität | Dauer, Distanz, Ø Puls, Max-Puls (Strava-Pfad), Kalorien | kann komplett fehlen (nicht verbunden, Zugang abgelehnt, nichts am Tag gefunden) |
| Runden | je Runde Zeit, Distanz, Ø Puls | Puls ist nur Rundenschnitt, «Spitze» ist kein echter Maximalpuls; Garmin-Runden evtl. noch nicht geholt (`lapsV`) |
| Plan-Zeilen, Haken | Haken je Übung, Skip | Haken ohne Gewicht: unklar, ob gemacht |
| Gewichte | ein Text je Übung, optional je Satz «80 kg × 5 / 85 kg × 5 / …» | Wiederholungen oft nicht eingetragen, dann gilt der Plan als gemacht |
| RPE | eine Zahl je Einheit | nicht je Übung, nicht je Satz |
| Stationstag-Splits | Runden nach Plan-Schritten zugeordnet | Zuordnung kann «unsicher» sein; nur ein Referenz-km |

### Datenlücken, die die Anzeige ehrlich zeigen muss
- **Krafttraining hat keinen Puls je Satz.** Die Uhr speichert es meist als 1 Runde. «Ø Puls nur der Arbeitssätze» ist deshalb heute nicht berechenbar. Nur mit Lap-Taste je Satz möglich. Das muss als «keine Daten, Grund: …» stehen und nicht als Gesamt-Puls getarnt werden.
- **Keine Uhr-Aktivität:** Puls, Pace, Phasen, Drift fallen weg. Haken und RPE bleiben.
- **Puls nur in einem Teil der Runden:** Kennzahl mit Abdeckung («5 von 6 Runden») zeigen.
- **Phasen-Erkennung nur «wahrscheinlich» oder «unsicher»:** Arbeits-Kennzahlen als geschätzt markieren.
- **Höchster Runden-Ø ist nicht der Maximalpuls.**
- **Kompromiss-Delta hängt an einem einzigen Referenz-km.**
- **Wiederholungen ohne Eintrag** zählen als Plan, nicht als Messwert.

### Annahmen (offen genannt)
- **Optik 1:1 aus der App** (Korrektur von Jaime nach Version 1): Tokens aus `:root`, Glas-Hintergrund, `.s6-card`, `.s6-btn` und die Bausteine von `.an-dash` (Ring mit Punktzahl, Kacheln `.dt`, Quelle `.dsrc`, `.dmore`, `.chip`, `.pbar`) sind übernommen. Neu gebaut sind nur Zeitleiste und Tabelle, aus denselben Flächen und Farben.
- Die App ist heute nur dunkel (`color-scheme: dark`, kein `prefers-color-scheme`). Der Hellmodus im Artefakt ist neu und kein Bestand.
- Beispieldaten sind erfunden. Alle Zielzeiten (Intervall 4:00/km, Läufe nach Station 4:10, SkiErg 4:00, Sled 1:30, Burpees 4:15, Rudern 4:00), die Vorwerte der letzten Einheit und die Zonengrenzen 60/70/80/90 % von 191 bpm sind Platzhalter, nicht deine Plan-Werte. Split Squat: 20 kg je Hand, Volumen je Seite einfach gezählt.
- Ob die Gewichts-Eingabe pro Satz nach der Einheit zuverlässig gefüllt wird, weiss ich nicht.

## 2. Die vier Designs
Alle drei Einheitenarten (Kraft, Lauf-Intervall, Stationstag) mit Beispieldaten, Handy 390 px, Hell und Dunkel, plus Schalter «Uhr-Daten fehlen».

Im Mockup gezeigte Lücken: keine Uhr-Aktivität (Schalter), Kraft ohne Puls je Satz, Rundenschnitt statt Maximalpuls, Wiederholungen/Gewicht ohne Eintrag, einzelner Referenz-km. **Nicht gezeigt** (nur hier beschrieben): Puls in nur einem Teil der Runden und Phasen-Erkennung «wahrscheinlich/unsicher».

1. **Kennzahlen-Kacheln, Detail darunter.** Sechs Kacheln, Quelle-Box, Phasenbalken, Details, Vergleich.
2. **Zeitleiste der Einheit.** Runde für Runde mit Startzeit, Tempo, Puls-Balken. Kraft nur als Reihenfolge.
3. **Plan gegen Ist.** Tabelle je Schritt oder je Satz, Δ eingefärbt, dazu Vergleich mit letztem Mal.
4. **Urteil zuerst.** Ampel und ein Satz, «Sicherheit des Urteils», Belegzeilen mit Zahl, «Nächstes Mal», Kennzahlen eingeklappt.

### Stärke, Schwäche, Aufwand
| | Stärke | Schwäche | Aufwand |
|---|---|---|---|
| 1 | Sechs Zahlen auf einen Blick, Lücken als gestrichelte Kachel mit Grund | kein Urteil, fast wie heute | klein: `sessionDash()`/`workDash()` liefern die Kacheln, neu sind Kraft-Kacheln (Volumen, Satzgewichte) |
| 2 | zeigt den Verlauf, Tempo-Einbruch sichtbar | bei Kraft keine Zeiten; lang zu scrollen | mittel bis hoch: kumulierte Startzeiten, Pulsbalken; Kraft nur mit Lap-Taste sinnvoll |
| 3 | genau dein Wunsch «Plan gegen Ist», gut für Stationstag und Kraft | enge Tabellen auf 390 px, kein Gesamturteil | mittel: `st.plan` existiert; Kraft braucht Soll-Ist je Satz (`parseSets`, `progression.js`) |
| 4 | beantwortet zuerst «war es gut, kann ich dem trauen?»; Lücken senken die Sicherheit sichtbar | Regelwerk kann danebenliegen; Zahlen erst eine Ebene tiefer | mittel: Verdict/Ampel in `analyse.js`; neu: Belegzeilen und Sicherheitsstufe aus `dataState` |

## 3. Empfehlung
**Design 4 als Kopf, Design 1 als eingeklappte Beleg-Ebene, Design 3 zusätzlich für Stationstag und Kraft.** Nach dem Training zählt zuerst: war es gut, und stimmen die Zahlen? Das beantwortet nur 4. Design 1 ist nahe am heutigen Dashboard und ändert allein zu wenig. Die Zeitleiste (2) bringt bei Kraft nichts und kostet am meisten, zurückstellen.

## 4. Offene Fragen an Jaime
1. Welches Design (oder welche Mischung)? Gerne auch nur: «4, aber ohne Nächstes Mal».
2. Soll es einen **Hellmodus** geben? Die App ist heute nur dunkel; das wäre eine eigene Aufgabe.
3. **Lap-Taste je Satz** bei Kraft: bereit, sie zu drücken? Nur dann ist «Ø Puls der Arbeitssätze» ehrlich berechenbar. Sonst bleibt es «keine Daten».
4. Soll «Nächstes Mal» konkrete Vorschläge machen (Regelwerk), oder nur Befunde nennen?
5. Welche Stationstag-Zielzeiten gelten wirklich (die im Entwurf sind Platzhalter)?
6. Gewichte pro Satz: trägst du Wiederholungen ein? Sonst sind Aussagen wie «Satz 3 nur 4 Wdh» nicht möglich.
7. Reicht ein einziger Referenz-km für das Kompromiss-Delta, oder soll ein zweiter eingeplant werden?
