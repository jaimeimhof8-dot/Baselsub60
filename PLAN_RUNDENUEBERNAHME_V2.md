# Plan: Garmin-Rundenübernahme robust machen (v2)

Stand 10.11.2026. Nur Plan, kein Code. Ergänzt `PLAN_GARMIN_RUNDEN.md` (18.10., Konzept, nicht umgesetzt).

## 1. Ist-Zustand (im Code gelesen)

`src/laps.js` hat drei getrennte Verfahren, die sich nicht abstimmen:

| Verfahren | Regel | Schwäche |
|---|---|---|
| `alignSplits` | nur exakte Rundenzahl (`direct`, `work`, `alt`) | eine vergessene oder doppelte Runde → `times: null` |
| `alignFuzzy` | Zeit-DP, aber nur wenn `|Runden − Schritte| ≤ 3` und Kosten ≤ 0,4·n | Grenzen hart, gilt laut Kommentar „nicht für das Eintragen“ |
| `segmentRuns` | Pace-Schwelle ref·1,12 für Intervalle | eine schwache Runde reisst die Kette ab |

Folge (aus dem Code abgeleitet, noch nicht an echten Daten belegt): Es gibt ein Alles-oder-nichts-Verhalten. Passt die Rundenzahl knapp nicht, kommt „von Hand eintragen“ (index.html:22719). `strava-take` (index.html:24507) hakt zudem alle Zeilen ab, nicht nur die gelaufenen.
`PLAN_GARMIN_RUNDEN.md` nennt ausserdem: Runden werden nur für `run, row, ride, ski` geholt, HIIT/Indoor-Cardio (Gruppe `strength`) bekommt keine.

## 2. Ansatz: ein Verfahren statt drei

Kein GitHub-Projekt kopieren. Ehrlich: Ich kenne keine Bibliothek, die genau „Garmin-Runden gegen einen Trainingsplan“ löst, und habe nicht im Netz gesucht. Das Problem ist ein Standardfall der **Sequenzausrichtung** (Needleman-Wunsch / DTW), und `alignFuzzy` enthält die Grundform schon. Eine Abhängigkeit würde mehr Aufwand machen als 80 Zeilen DP. Session 1 prüft trotzdem kurz, ob es etwas Brauchbares gibt (Zeitbox 20 Min), bevor gebaut wird.

Neuer Kern `alignLaps(laps, steps) → {pairs, quality, notes}`:

1. **Vorbereiten**: Fehldrücker < 15 s mit Nachbarn verschmelzen, Auto-Lap-Muster (viele ~1000 m) erkennen.
2. **Kosten** je Paar Schritt/Runde aus drei Signalen: Typ (Lauf/Station/Pause über Distanz+Pace), Dauer gegen Planziel (log-Abstand), Distanz gegen Plan (bei Läufen).
3. **DP mit Operationen**: 1:1, Runde auslassen (Zusatzdruck), Schritt auslassen (nicht gelappt), 2 Runden zu 1 Schritt, 1 Runde zu 2 Schritten (Lauf+Station zusammen, dann kein Einzelwert). **Keine harte Obergrenze** der Rundenzahldifferenz mehr; stattdessen Kosten.
4. **Güte 0–1** = Anteil sauber zugeordneter Arbeitsschritte. Ab 0,6 automatisch übernehmen, darunter Vorschau mit Hinweis. Nie raten: nicht zugeordnete Schritte bleiben leer und offen.
5. `alignSplits`/`alignFuzzy` bleiben als Wrapper (alle bestehenden Aufrufer und Tests laufen weiter), die Logik liegt nur noch im neuen Kern.

Zusätzlich (aus dem Altplan, getrennt umsetzbar): Garmin-Edge-Function holt Runden auch für HIIT/Indoor-Cardio; Teil-Abhaken nur für tatsächlich gelaufene Zeilen; Vorschau-Karte vor dem Übernehmen.

## 3. Sessions

Regel: **Aufpasser (Opus)** schreibt nie Produktivcode, **Macher (Sonnet)** schreibt nie seine eigene Abnahme. Jede Session = eigenes Gespräch, Übergabe nur über Dateien im Repo.

### S0 – Aufpasser (Opus): Spezifikation und Abnahme
- Liest `src/laps.js`, `test/laps.test.js`, `PLAN_GARMIN_RUNDEN.md`, die Stellen in `index.html`.
- Schreibt `docs/laps-v2-spec.md`: Soll-Verhalten je Fall, Güte-Schwellen, **Abnahmetabelle** (Fall → erwartetes Ergebnis).
- Fixiert die Reihenfolge und diese Regel: Zeiten werden nur eingetragen, wenn Güte ≥ 0,6; Handeinträge werden nie überschrieben.
- **Stopp: Jaime bestätigt die Spezifikation.**

### S1 – Macher (Sonnet): Testfälle zuerst
- Erzeugt `test/fixtures/laps-*.json` aus realen Garmin-Aktivitäten von Jaime (siehe Frage 1), sonst synthetisch nach den Fällen unten.
- Schreibt `test/laps-v2.test.js` (rot). Noch kein Algorithmus.
- Zeitbox 20 Min: Repo-/Web-Suche nach Alignment-Code, Ergebnis in 5 Zeilen in die Spec.

### S2 – Macher (Sonnet): Kern `alignLaps`
- Implementiert den DP in `src/laps.js`, Wrapper für `alignSplits`/`alignFuzzy`.
- Ziel: neue Tests grün, **alle bisherigen Tests unverändert grün** (`npm test`). Keine Testanpassung, um grün zu werden.

### S3 – Aufpasser (Opus), blind: Review des Kerns
- Bekommt nur Spec, Diff und Testergebnis, nicht die Gedanken von S2.
- Prüft gegen die Abnahmetabelle, sucht eigene Gegenbeispiele (Fuzz: zufällig Runden löschen/doppeln, 200 Läufe, Ergebnis darf nie eine falsche Zeit in eine falsche Zeile schreiben).
- Ergebnis: `docs/laps-v2-review.md` mit „freigegeben“ oder Mängelliste. Erst dann S4.

### S4 – Macher (Sonnet): Anbindung
- `strava-take`: nur zugeordnete Zeilen abhaken, Wert „3 von 4 Runden“ bei Teilerfolg.
- Vorschau-Karte vor dem Übernehmen (Häkchen änderbar, „Nur Gesamtzeit“).
- Edge Function `garmin`: `withLaps` auch für HIIT/Indoor-Cardio (Limit 15 bleibt).
- Service-Worker-Version erhöhen (wie bei den letzten Commits).

### S5 – Aufpasser (Opus), blind: Endabnahme
- Geht die Abnahmetabelle Punkt für Punkt durch, mit den echten Fixtures. Sichtprüfung der Vorschau im Browser (Playwright-Screenshot).
- Erst nach „freigegeben“ Pull Request.

## 4. Abnahmefälle (Mindestumfang)

| # | Fall | Erwartung |
|---|---|---|
| 1 | Plan 8 Schritte, Uhr 8 Runden | alle 8 zugeordnet, Güte 1 |
| 2 | Eine Runde vergessen (7 von 8) | 7 zugeordnet, 1 leer, Güte ≈ 0,88 |
| 3 | Eine Runde doppelt gedrückt (< 15 s) | wird verschmolzen, alle 8 |
| 4 | Pausen nicht gelappt | Arbeitsschritte zugeordnet |
| 5 | Auto-Lap (1 km) bei Zirkel | Hinweis „Auto-Lap an“, keine Stationszeiten geraten |
| 6 | Lauf+Station in einer Runde | Gesamtzeit, kein Einzelsplit |
| 7 | 4 von 8 gemacht, abgebrochen | 4 abgehakt, 4 offen |
| 8 | Total anders (Güte < 0,6) | nur Gesamtwerte, Vorschau mit Hinweis |
| 9 | Handeintrag vorhanden | nicht überschrieben |
| 10 | Reiner Lauf ohne Intervalle | nur Gesamtwerte |

## 5. Annahmen (bitte korrigieren)

1. „Inkonsistent“ heisst: mal passt es, mal kommt „von Hand eintragen“ oder falsche Zeile. Das ist eine Vermutung aus dem Code, ich habe keine echte Aktivität gesehen.
2. Betroffen sind Zirkel/Compromised Running/Stationstage, weniger reine Intervalle (`repSummary`).
3. Die Plan-Struktur (Schritte mit Ziel) ist verlässlich, das Problem liegt bei den Uhr-Runden.
4. Sonnet-Sessions dürfen auf den Branch `claude/garmin-rundenuebernahme-fix-1sj1qc` pushen, PR erst nach S5.

## 6. Offene Fragen (Antworten ändern den Plan)

1. **Kannst du 2–3 echte Aktivitäten liefern**, bei denen es falsch lief (Export oder Datum, dann hole ich sie)? Das ist der wichtigste Punkt: Ohne echte Daten optimiere ich Annahmen.
2. Was ist das **falsche Ergebnis konkret**: keine Zuordnung, falsche Zeile, falsche Zeiten, oder alles abgehakt?
3. Drückst du **Runde bei jedem Wechsel** oder hast du Auto-Lap an? Das bestimmt, wie viel Toleranz der Algorithmus braucht.
4. Welches **Uhrenprofil** nutzt du für Zirkel (Laufen, HIIT, Indoor Cardio)?
