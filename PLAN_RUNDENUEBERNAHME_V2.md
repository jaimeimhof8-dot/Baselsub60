# Plan: Garmin-Rundenübernahme robust machen (v2)

Stand 10.11.2026. Nur Plan, kein Code. Ergänzt `PLAN_GARMIN_RUNDEN.md` (18.10., Konzept, nicht umgesetzt).

## 1. Ist-Zustand (im Code gelesen)

`src/laps.js` hat drei getrennte Verfahren, die sich nicht abstimmen:

| Verfahren | Regel | Schwäche |
|---|---|---|
| `alignSplits` | nur exakte Rundenzahl (`direct`, `work`, `alt`) | eine vergessene oder doppelte Runde → `times: null` |
| `alignFuzzy` | Zeit-DP, aber nur wenn `|Runden − Schritte| ≤ 3` und Kosten ≤ 0,4·n | Grenzen hart, gilt laut Kommentar „nicht für das Eintragen“ |
| `segmentRuns` | Pace-Schwelle ref·1,12 für Intervalle | eine schwache Runde reisst die Kette ab |

Folge: Alles-oder-nichts. Passt die Rundenzahl nicht, kommt „von Hand eintragen“ (index.html:22719), und die Analyse hat keine Daten. `strava-take` (index.html:24507) hakt zudem alle Zeilen ab, nicht nur die gelaufenen.

**Befund nach Jaimes Antworten (10.11.)**: «Keine Zuordnung, vor allem bei vielen Runden; bei jedem Wechsel Runde gedrückt; Auto-Lap an; Profil: unbenanntes Cardio-Profil „Hyrox“.»
- **Wahrscheinliche Hauptursache:** `alignFuzzy` bricht bei `|Runden − Schritte| > 3` mit `null` ab. Auto-Lap plus Doppeldrücker plus Pausenrunden überschreiten das bei langen Einheiten fast immer. Je mehr Runden, desto sicherer null. Passt zu deiner Beobachtung, ist aber noch nicht an einer echten Aktivität bestätigt.
- **Zweite Ursache:** `normalizeLaps` (supabase/functions/garmin/reduce.js:39) schneidet bei 80 Runden ab. Lange Hyrox-Einheiten mit Auto-Lap können darüber liegen, dann fehlt das Ende.
- **Widerlegt:** Die Annahme aus dem Altplan, HIIT/Cardio bekomme keine Runden. Der Abruf in `index.ts:169` filtert nicht nach Gruppe, Cardio-Profile (`hyrox`, `indoor_cardio`) werden erkannt. Dieser Punkt entfällt aus dem Plan.
- **Ungeklärt:** Cardio-Profile liefern oft keine Distanz (`d = 0`). Dann fällt die Typ-Erkennung per Pace aus, und es bleibt nur die Dauer als Signal.

## 2. Ansatz: ein Verfahren statt drei

Kein GitHub-Projekt kopieren. Ehrlich: Ich kenne keine Bibliothek, die genau „Garmin-Runden gegen einen Trainingsplan“ löst, und habe nicht im Netz gesucht. Das Problem ist ein Standardfall der **Sequenzausrichtung** (Needleman-Wunsch / DTW), und `alignFuzzy` enthält die Grundform schon. Eine Abhängigkeit würde mehr Aufwand machen als 80 Zeilen DP. Session 1 prüft trotzdem kurz, ob es etwas Brauchbares gibt (Zeitbox 20 Min), bevor gebaut wird.

Neuer Kern `alignLaps(laps, steps) → {pairs, quality, notes}`:

1. **Vorbereiten**: Fehldrücker < 15 s mit Nachbarn verschmelzen. **Auto-Lap-Runden erkennen und rausrechnen**: Eine Runde ~1000 m (±15 m) die *direkt auf eine Runde im selben Segment folgt* ohne Pause dazwischen, wird mit dem Rest des Segments zusammengefasst. Dadurch entspricht ein 3-km-Lauf wieder einem Schritt.
2. **Kosten** je Paar Schritt/Runde aus drei Signalen: Typ (Lauf/Station/Pause über Distanz+Pace), Dauer gegen Planziel (log-Abstand), Distanz gegen Plan (bei Läufen).
3. **DP mit Operationen**: 1:1, Runde auslassen (Zusatzdruck), Schritt auslassen (nicht gelappt), **beliebig viele Runden zu 1 Schritt** (nicht nur 2), 1 Runde zu 2 Schritten (Lauf+Station zusammen, dann kein Einzelwert). **Keine harte Obergrenze** der Rundenzahldifferenz mehr (bisher 3); stattdessen Kosten. Rechenaufwand bei 80 Runden × 40 Schritten unproblematisch.
3a. **Anker-Strategie bei vielen Runden**: Erst die auffälligsten Runden fest zuordnen (längste Lauf-Runden, Stationen mit klarer Dauer), dann den Rest dazwischen. Das hält die Zuordnung auch bei 60+ Runden stabil.
4. **Güte 0–1** = Anteil sauber zugeordneter Arbeitsschritte. Ab 0,6 automatisch übernehmen, darunter Vorschau mit Hinweis. Nie raten: nicht zugeordnete Schritte bleiben leer und offen.
5. `alignSplits`/`alignFuzzy` bleiben als Wrapper (alle bestehenden Aufrufer und Tests laufen weiter), die Logik liegt nur noch im neuen Kern.

Zusätzlich (aus dem Altplan, getrennt umsetzbar): Teil-Abhaken nur für tatsächlich gelaufene Zeilen; Vorschau-Karte vor dem Übernehmen; Rundenlimit in `normalizeLaps` von 80 auf 200 anheben.

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
- `normalizeLaps`: Limit 80 → 200 (Edge Function neu deployen, Jaime muss das auslösen).
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

## 6. Offene Fragen (Stand nach Antworten)

Beantwortet: Fehlerbild (keine Zuordnung bei vielen Runden), Runde bei jedem Wechsel, Auto-Lap an (Laufen), Profil «Hyrox» (Cardio).

1. **Ist Auto-Lap auch im Profil „Hyrox“ an**, oder nur im Lauf-Profil? Wenn ja, mit welcher Distanz/Zeit?
2. **Eine echte Aktivität, bei der es nicht klappte** (Datum reicht, ich hole die Runden). Damit wird die Ursache bestätigt statt vermutet. Ohne sie baut S1 synthetische Testfälle.
3. Schalten wir Auto-Lap im Hyrox-Profil trotzdem aus (einfachste Abhilfe), oder soll die App damit klarkommen? Plan geht von «App kommt klar» aus.
