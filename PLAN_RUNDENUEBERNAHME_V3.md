# Plan: Rundenübernahme Compromised Running (v3)

Stand 28.11.2026. Nur Analyse und Plan, kein Produktivcode geändert. Baut auf `PLAN_RUNDENUEBERNAHME_V2.md` auf.

## 1. Befund: Warum «nicht zuordenbar»?

Der Abruf ist nicht das Problem. Die Runden kommen über `/activity-service/activity/{id}/splits` an. Es scheitert an der Zuordnung.

### Ursache A (Hauptursache, nachgestellt): Eine einzige Unregelmässigkeit macht den ganzen Rest «unsicher»

`src/align.js:103–118`: Sobald vor einem Schritt irgendetwas nicht 1:1 passt, wird `rigid = false`. Danach wird für **keinen** weiteren Schritt die Eindeutigkeit geprüft (`alt = null`), und alle folgenden Schritte sind «nicht sicher». Als Unregelmässigkeit zählt schon:
- eine zusätzliche Runde ab 20 s (Übergang, doppelt gedrückt),
- ein vergessener Druck (zwei Schritte in einer Runde) oder ein Schritt ganz ohne Runde,
- ein einziger Schritt, der selbst als unsicher gilt.

Eine Abweichung vom Planziel über 13 % (`anomaly`, Zeile 97) setzt `rigid` nicht. Sie verschärft aber die Prüfung (`distinct`): Der Schritt muss sich dann klar von seinen Nachbarschritten abheben.

Nachgestellt mit `src/align.js` (Plan: 4 × SkiErg 500 m (Ziel 1:55) → 1 km (4:05) → 120 s Pause; ✓ = sicher, ? = unsicher, – = Pause):

| Fall | Ergebnis heute |
|---|---|
| 12 Runden, genau wie geplant | alles übernommen (`alignSplits` «direct») |
| Läufe 5:00 statt 4:05, Ski 2:30 statt 1:55 | alles übernommen (Rundenzahl stimmt, es wird gar nicht geprüft) |
| **+1 Übergangsrunde 25 s nach Runde 1** | `✓✓-??-??-??-`, Güte 0,25 |
| 1 Druck vergessen in Runde 2 | `✓?-??-??-??-`, Güte 0,13 |
| Pausen nicht gelappt + 1 Übergang | `✓?-??-??-??-`, Güte 0,13 |
| Absturz nach 7 Runden | `✓✓-✓✓-??-??-`, Güte 0,80 |

Fazit: Die Regel ist widersprüchlich. Stimmt die Rundenzahl genau, wird **blind** übernommen, auch bei 30 % Abweichung. Ist eine harmlose 25-s-Runde zu viel, wird ab dort **nichts** mehr übernommen. Bei 8 Runden (24 Schritten) ist eine solche Kleinigkeit fast sicher, darum scheitert es gerade bei langen Einheiten.

### Ursache B (strukturell): Station und Pause sind für den Algorithmus gleich

Die Kosten nutzen nur **Dauer** und **Distanz ≥ 300 m** (Zeilen 27–29). SkiErg 1:55 und Pause 2:00 sind nach Dauer gleich, und beide haben keine Strecke. Ohne einen weiteren Hinweis lässt sich eine Verschiebung um eine Runde nicht ausschliessen. **Der Puls wird nicht genutzt**, obwohl jede Runde ihn mitbringt (`hr`). In der Pause fällt er deutlich, auf der Station steigt er.

Experiment in einer Kopie (nicht im Repo): Ohne die `rigid`-Sperre steigt die Güte im Übergangsfall von 0,25 auf 0,50. Dafür **schlägt der Zufallstest fehl** (`test/align.test.js` #8, eine falsche Runde wird als «sicher» gemeldet). Die Sperre einfach zu lockern ist also falsch. Es fehlt ein zusätzliches Signal.

### Ursache C (wahrscheinlich, je nach Plantext): Manche Compromised-Running-Tage haben gar keine Schritte

`s7Steps` (`index.html:22854`) erzeugt Schritte nur aus Zeilen im Format `Runde N: Station (Ziel m:ss) → 1 km @ m:ss/km (m:ss), X Pause`. Zeilen wie **«Compromised Running 2×10′ Zone 3, 2′ Pause»** (`src/plan-data.js`, `src/plan-later.js`) ergeben `null`. Auch `parseReps` versteht nur Distanzen (`4×1 km`), keine Minuten. An solchen Tagen gibt es keinen Weg, der Runden zuordnet.

### Ursache D (Diagnose blind): Der Knopf zeigt den Grund nicht

`diagText` (`index.html:15328`) gibt die Ergebnisse von `alignSplits` und `alignFuzzy` aus (beide bei Abweichungen `null`) und dazu `watchCheck`. Das Ergebnis von `alignLaps` selbst fehlt: `sure` je Schritt, `quality`, `cost` und der **Grund**. Deshalb sagt die Diagnose nur «nicht zuordenbar».

### Nebenbefund (Abruf)

Antwortet Garmin auf `/splits` mit 404 oder leer, setzt `index.ts:183` trotzdem `lapsV = 3` mit `laps = []`. Die Einheit wird nie wieder abgefragt.

## 2. Lösungsansatz (Reihenfolge nach Nutzen/Aufwand)

1. **Diagnose ehrlich machen (klein, zuerst).** `alignLaps` vollständig in die Diagnose aufnehmen, dazu ein Grund je unsicherem Schritt (`"nach Zusatzrunde 4 (25 s)"`, `"Station/Pause nach Zeit nicht unterscheidbar"`). Die Rohfelder der Garmin-Runden (Feldnamen, ohne Werte) mitschicken, damit Punkt 5 prüfbar wird. In der App-Meldung den Grund in einem Satz anzeigen statt nur «nicht zuordnen».
2. **Übergangsrunden vor der Zuordnung bereinigen.** Runden < 45 s ohne Strecke (< 100 m), deren Dauer zu keinem Planschritt passt (kein Schritt mit Ziel < 60 s), als «Übergang» markieren und an die Nachbarrunde hängen. Sie zählen dann nicht mehr als Unregelmässigkeit. Damit fällt der häufigste Fall weg. Risiko (Prüfer): Echte kurze Runden könnten verschluckt werden, und die Zeit des Nachbarn wird länger. Deshalb die Übergangszeit getrennt ausweisen (`trans`) und nicht in die Schrittzeit rechnen.
3. **Puls als drittes Signal.** Typ-Kosten aus dem Pulsverlauf: Eine Pausenrunde hat einen deutlich tieferen Ø-Puls als die Arbeitsrunde davor (z. B. ≥ 8 Schläge oder ≥ 5 %). Damit lassen sich Station und Pause unterscheiden, und eine Verschiebung um eine Runde wird teuer. Fehlt der Puls, gilt das bisherige Verhalten.
4. **`rigid` ersetzen durch eine gezielte Verschiebungsprüfung.** Statt «nach der ersten Unregelmässigkeit nichts mehr» für jeden Schritt rechnen: beste Lösung, wenn dieser Schritt um ±1 Runde bzw. ±1 Planperiode verschoben ist. Sicher nur, wenn der Abstand ≥ `MARGIN` ist. Erst mit Punkt 3 einschalten, denn ohne Puls fällt der Zufallstest (siehe Experiment).
5. **Langfristig der robusteste Weg: Workout auf die Uhr schicken.** `push-workout` gibt es schon für Lauftage (`src/garmin-workout.js`). Für Compromised-Running-Tage ein strukturiertes Workout mit «Schritt endet per Lap-Taste» schicken. Dann führt die Uhr durch die Schritte, die Rundenzahl entspricht der Schrittzahl, und `alignSplits` «direct» greift. Möglicherweise liefert Garmin dazu je Runde den Workout-Schritt (`wktStepIndex`/`intensityType` in `lapDTOs`). **Nicht geprüft**, Punkt 1 klärt es mit echten Daten. Falls ja: Zuordnung über den Index, ohne jede Schätzung.
6. **Minuten-Intervalle verstehen (Ursache C).** Parser für `N×M′ …, P′ Pause` → Schritte Lauf (Ziel M·60 s) und Pause. Danach läuft dieselbe Zuordnung.
7. **Blinde Übernahme bei gleicher Rundenzahl absichern.** Auch bei «direct» Typ und Puls prüfen. Weicht etwas grob ab (z. B. Laufrunde ohne Strecke bei GPS-Profil), die Vorschau anzeigen statt still einzutragen.
8. **Nebenbefund beheben:** `lapsV = 3` nur setzen, wenn Garmin wirklich geantwortet hat. «Noch nicht verfügbar» (404/204 kurz nach dem Hochladen) von «Aktivität hat keine Runden» trennen, z. B. mit Wiederholung bis 48 h nach dem Start.

## 3. Sessions (Aufpasser schreibt keinen Produktivcode, Macher schreibt nicht seine eigene Abnahme)

- **S0 Aufpasser:** Spec-Ergänzung `docs/laps-v3-spec.md` mit Abnahmetabelle (Fälle unten). **Stopp: Jaime bestätigt.**
- **S1 Macher:** Punkt 1 (Diagnose) + 8 bauen. Jaime liefert 2–3 echte Diagnosen von Compromised-Running-Tagen → Fixtures `test/fixtures/laps-cr-*.json`.
- **S2 Macher:** Punkte 2, 3, 4 in `src/align.js`. Bestehende Tests bleiben unverändert grün, und der Zufallstest bekommt Puls-Varianten dazu.
- **S3 Aufpasser blind:** Fuzz-Review, mindestens 20 000 Läufe. Keine falsche «sichere» Zuordnung. Danach Abdeckung messen.
- **S4 Macher:** Punkte 6 und 7, danach Punkt 5, sofern S1 zeigt, dass Garmin den Schritt-Index liefert.
- **S5 Aufpasser:** Endabnahme mit echten Fixtures, Screenshot der Vorschau, dann PR.

## 4. Abnahmefälle (zusätzlich zu v2)

| # | Fall | Erwartung |
|---|---|---|
| 15 | +1 Übergangsrunde 25 s | alle Schritte sicher |
| 16 | +3 Übergangsrunden verteilt (8 Runden) | alle sicher |
| 17 | 1 Druck vergessen in Runde 2, Puls vorhanden | Runde 2 unsicher, **Runden 3–8 sicher** |
| 18 | wie 17, ohne Puls | Runde 2 unsicher, danach höchstens «unsicher», nie falsch |
| 19 | Station 1:55 und Pause 2:00, Puls fällt in der Pause | keine Verwechslung |
| 20 | «Compromised Running 2×10′, 2′ Pause» | 2 Läufe zugeordnet |
| 21 | gleiche Rundenzahl, aber Runden vertauscht (Lauf ohne Strecke) | Vorschau statt stiller Übernahme |
| 22 | Garmin `/splits` 404 | beim nächsten Sync neu gefragt |

Ziel: Güte ≥ 0,9 bei den Fällen 15–17. 0 falsche «sichere» Zuordnungen im Fuzz-Test.

## 5. Annahmen und offene Fragen

1. Deine Compromised-Running-Tage folgen dem Format `Runde N: … → 1 km …` (Ursache A/B). Bei `2×10′` greift Ursache C. **Welches Format haben deine betroffenen Tage?**
2. Du drückst bei jedem Wechsel die Lap-Taste, auch vor der Pause.
3. Der Puls ist in den Runden vorhanden (Brustgurt oder Handgelenk). Ohne Puls bringen Punkt 3 und 4 wenig.
4. Ob Garmin in `lapDTOs` den Workout-Schritt mitliefert, ist ungeprüft.

## 6. Umgesetzt (28.11.2026)

Jaime: Format A («Runde N: SkiErg … → 1 km …, Pause»), Pulsgurt vorhanden. Umgesetzt: Punkte 1, 2, 3, 4, 7, 8. Nicht umgesetzt: 5 (Workout auf die Uhr), 6 (Minuten-Intervalle).

**`src/align.js` (alignLaps)**
- Übergangsrunden: kurz (< 35 % des kürzesten Planschritts, max. 45 s), ohne Strecke → stören die Verankerung nicht mehr.
- Puls als Typ-Signal (nur wenn ≥ 80 % der Runden Puls haben und er ≥ 10 Schläge schwankt): Pause = Pulsabfall gegenüber der Runde davor, Arbeit = kein Pulstal. Dazu: Pause mit Arbeitspuls (über 12 Schläge über den Pausen in der Nähe) ist nie sicher.
- Neue Operation «eine Runde für zwei Schritte» (vergessener Druck), nur wenn die Runde zur Summe der Ziele deutlich besser passt als zu jedem einzelnen.
- `rigid` ersetzt: sicher ist ein Schritt, wenn er vom **Start** oder vom **Ende** her lückenlos verankert ist (Ende nur bei vollständiger Aufzeichnung), und der nächste Schritt in Richtung Störung auch sauber passt. Zwischen zwei Störungen ist nie etwas sicher.
- Abweichung vom Ziel relativ zum Tagesniveau (Median der gleichen Schrittart ohne den Schritt selbst): ein langsamer Tag ist keine Störung.
- Station mit Strecke ist plausibel, wenn der Plan die Strecke vorsieht («SkiErg 500 m»).
- Neu im Ergebnis: `why` (Grund je unsicherem Schritt), `span`, `pair`, `hrUsed`.

**`src/laps.js`**
- `alignSplits` (gleiche Rundenzahl) trägt nicht mehr blind ein: `layoutOk` (Strecke, Puls, Dauer bis Faktor 1,65) und Bestätigung durch alignLaps für jeden Schritt mit Ziel. Behebt u. a. «Absturz nach 16 von 24 Runden» = scheinbar «Pausen nicht gelappt» (vorher still falsche Zeiten).
- `watchCheck` liefert `reason` (erster Grund in Klartext).

**`index.html`**: Prüfliste und Meldung nennen den Grund. «Diagnose kopieren» (v2) enthält das volle alignLaps-Ergebnis je Schritt.

**`supabase/functions/garmin/index.ts`**: Leere `/splits`-Antwort in den ersten 2 Tagen nach der Einheit → beim nächsten Abruf nochmals versuchen. **Wirkt erst nach Neu-Deployen der Edge Function.**

**Nacharbeit nach Prüfer-Review 1 («nicht freigegeben»: Rückschritt bei sauberen Einheiten mit kurzen Pausen)**
- Grenze «harmlose Kurzrunde» ohne festes 20-s-Minimum (15-s-Pausen sind Pausen, keine Störung). Überzählige Runde nur billig, wenn harmlos.
- Zusammenfassen zweier echter Runden kostet mehr (0,5 extra).
- Letzte Runde < 15 s wird nur abgeschnitten, wenn sie auch für den letzten Planschritt zu kurz ist (geplante 15-s-Schlusspause bleibt).
- Pausen-Puls als Beleg erst ab 45 s Planpause. Mit Puls dürfen Pausen bis Faktor 1,65 vom Ziel abweichen (man erholt sich nach Bedarf).
- Arbeitsschritt mit Pausenpuls (über 20 Schläge unter gleichartigen Schritten in der Nähe) ist nie sicher.
- Verankerung vom Ende verlangt den doppelten Mindestabstand (ein Absturz plus Zusatzrunden kann wie ein vollständiges Ende aussehen).
- Ergometer-Strecke: Haben die anderen Stationen mit derselben Planstrecke Meter, muss die Runde auch welche haben.
- Feste Zuordnung (gleiche Rundenzahl): Bestätigung nur noch für Arbeitsschritte verlangt, bei Pausen genügt dieselbe Runde.

**Messung saubere Einheiten** (8 × SkiErg 500 m → 1 km → Pause, Streuung ±7 % Arbeit / ±15 % Pause, je 100 Einheiten; Anteil Arbeitsschritte, die in der App übernommen werden; alt = 100 %, weil gleiche Rundenzahl blind übernommen wurde):

| Pause | 15 s | 30 s | 60 s | 90 s | 120 s | 180 s |
|---|---|---|---|---|---|---|
| mit Puls | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % |
| ohne Puls | 85 % | 91 % | 97 % | 40 % | 35 % | 82 % |

Ohne Puls bei 90–120-s-Pausen bleibt es schwach: SkiErg 1:55 und Pause 2:00 sind nur über die Zeit nicht trennbar, sobald eine Runde deutlich abweicht. Mit Pulsgurt kein Thema.

**Messung gestörte Einheiten** (36 000 Zufallseinheiten, 6 Plan-Layouts, Puls ±3/±8/ohne, 1–3 Störungen je Einheit aus vergessen, doppelt, Zusatz, Übergang, Trinken, Abbruch, fehlt (höchstens einmal)):

| | alt | neu |
|---|---|---|
| in der App übernommene Arbeitsschritte | 32,2 % | 33,3 % |
| still falsch eingetragen (gleiche Rundenzahl, blind übernommen) | 38 386 | 2 |
| falsch als «sicher» (vorsichtige Zuordnung) | 18 | 16 |

Die verbleibenden 16 + 2 Fälle enthalten alle die Störung «fehlt» (Runde samt Zeit weg), meist zusammen mit einer Trink-Runde, die genau so lang ist wie der fehlende Schritt. Das ist aus Zeit, Strecke und Puls nicht erkennbar.

Jaimes Szenarien (8 Runden, mit Puls): +1 oder +4 Übergangsrunden 25–30 s → 100 %. Vergessener Druck Ski+Lauf in Runde 2 → 88 % (Maximum). Lauf+Pause → 75 %. Zusatzrunde 70 s (Trinken) → 88 %. Absturz nach 16 von 24 Runden → alle vorhandenen Arbeitsschritte bis auf den letzten sicher. Übergangsrunden über 35 % des kürzesten Planschritts (bei 60-s-Pausen: über 21 s) gelten nicht mehr als harmlos, ebenso Übergänge mit ≥ 100 m (Gehen). Dann sinkt die Abdeckung (Prüfer: 77 % bzw. 32 % bei 60-s-Pausen).

**Bekannte Grenzen** (kein Verfahren kann das aus Zeit, Strecke und Puls erkennen):
- Eine ganze Runde ausgelassen bei lauter gleichen Intervallen: welche, ist offen.
- Uhr zu spät gestartet (erste Runde fehlt ganz): der Start gilt als fest, ohne Puls wird verschoben zugeordnet.
- Eine Trink-Runde, die genau wie ein fehlender Schritt aussieht.
- Ein Lap-Druck zur falschen Zeit (Runde enthält Teile zweier Schritte).
- Edge Function: Solange eine junge Einheit (< 2 Tage) leere Runden liefert, belegt sie bei jedem Abruf einen der 15 Plätze und der Client rechnet ab Planstart neu. Wirkt erst nach Neu-Deployen.

Tests: 515 grün (`npm test`), davon 18 neue Zufallstests (Puls ±3, ±8, ohne; je 300 Einheiten) sowie Szenarien für Format A. Laufzeit laut Prüfer: 24 Schritte × 40 Runden ≤ 30 ms.
