# Review: Tab «Vergleich» (Aufpasser)

Stand: 10.11.2026. Teil A sind die Prüfkriterien (Schritt 1). Teil B (Befunde, nach Schwere) folgt, sobald der Macher fertig ist.

## Teil A: Prüfkriterien für `supabase/partner_session.sql`

Referenz ist `partner_profile()` in `supabase/schema.sql:43-58`. Relevante Fakten aus dem Schema: Aktivitäten liegen in `plan_state.data -> 'strava' -> 'acts'` (Objekt, Schlüssel = Aktivitäts-ID), Garmin-Wellness (Schlaf, HRV usw.) in `data -> 'garmin' -> 'well'`. Beides steckt im selben jsonb wie Notizen und Check-ins. Darum muss die Funktion **positiv auswählen** (Whitelist), nie «alles ausser …».

### 1. Was herausgeht (Datenminimierung)
- [ ] Rückgabe ist eine Whitelist fester Felder: Datum, Art/Sportart, Start, Dauer, Distanz, Ø/Max-Puls, Runden (Index, Dauer, Distanz, Ø-Puls, Pace), Puls-Reihe. Kein `to_jsonb(act)`, kein `data -> 'strava'` als Ganzes, kein `select *`.
- [ ] Nicht enthalten: Notizen, Check-ins, Gewichte, Tests, `garmin.well` (Schlaf/HRV/Ruhepuls), Umplanungen, Chat-Verlauf, Onboarding-Flags, E-Mail, `user_id`, Strava-/Garmin-Tokens (`garmin_tokens` wird gar nicht angefasst).
- [ ] Aktivitätsfelder mit Freitext oder Ort sind raus: Name/Titel (kann Notiz sein), Beschreibung, Karte/Polyline/GPS, Start-Koordinaten, Gerätename, Strava-ID/Links. Falls der Macher eines davon bewusst behält: im Befund begründen lassen.
- [ ] Puls-Reihe ist die einzige «grosse» Reihe; kein GPS-Stream mitgeben.
- [ ] Bei fehlenden Daten: leere Menge bzw. `null`-Felder, keine Platzhalterzahlen.

### 2. Nur Team, nur Partner
- [ ] Filter exakt wie `partner_profile`: `m.team = public.my_team()` **und** `lower(m.email) <> lower(auth.jwt() ->> 'email')`.
- [ ] Nicht-Mitglieder bekommen nichts (`my_team()` ist null, Vergleich null ergibt keine Zeile). Prüfen, dass kein `coalesce(my_team(), 'basel')` o. Ä. eingebaut ist.
- [ ] Test-Konten in anderem Team bleiben unter sich.
- [ ] Gibt nur die Daten des Partners heraus, nie die eigenen (die hat die App schon).

### 3. Parameter und Schutz vor Auslesen ganzer Historien
- [ ] Genau ein Datum als Parameter, Typ `date` (kein Text, kein Bereich, kein Array). Kein Parameter für «von/bis», `limit`, Suchtext.
- [ ] `NULL` als Datum ergibt keine Zeilen (kein «alle»).
- [ ] Datums-Vergleich ist exakt auf den lokalen Kalendertag (Zeitzone Europe/Zurich beachten: eine Abendeinheit um 23:30 darf nicht am Folgetag erscheinen oder umgekehrt). Kein `>=`/`<=`-Fenster.
- [ ] Obergrenze für Zeilen (z. B. max. wenige Aktivitäten pro Tag) per `limit`, damit auch ein Datenfehler nicht alles ausgibt.
- [ ] Beschränkung auf plausible Daten: kein Datum in der Zukunft; Entscheidung dokumentieren, ob Daten weit in der Vergangenheit erlaubt sind. Realistisch: Jaime und Jimoh vertrauen sich, das Datum durchzuprobieren ist nicht zu verhindern. Ziel ist nur, dass **ein Aufruf = ein Tag** gilt, nie die Historie am Stück. Rate-Limit ist im Supabase-Setup nicht sinnvoll machbar; im Befund nur als bekannte Restgrenze notieren.
- [ ] Optional/Bonus: Funktion gibt nur Tage heraus, an denen auch der Aufrufer selbst eine Aktivität hat (verhindert «Historie durchblättern»). Nur empfehlen, nicht verlangen.

### 4. Funktionsdefinition und Rechte
- [ ] `security definer` mit `set search_path = public` (wie `partner_profile`); Verweise auf `auth.users` mit Schema-Präfix. Kein `search_path`-freies `security definer`.
- [ ] `stable`, `language sql` oder plpgsql ohne dynamisches SQL (`execute`/`format`): sonst SQL-Injection-Prüfung.
- [ ] `create or replace function` und Skript erneut ausführbar (idempotent). Bei geänderter Signatur: `drop function if exists`, sonst bleibt eine alte Überladung mit Rechten stehen.
- [ ] `revoke execute on function public.partner_session(date) from public, anon;` **mit exakter Signatur** (Argumenttyp `date`), sonst greift das revoke ins Leere.
- [ ] `grant execute on function public.partner_session(date) to authenticated;`
- [ ] Kein `grant` an `anon`/`public`, keine neue Tabelle ohne RLS, keine neuen Policies auf `plan_state` (die Funktion ersetzt Lesezugriff, sie öffnet ihn nicht).
- [ ] Datei lässt sich zusätzlich in `schema.sql` aufnehmen oder ist klar als eigenes Skript benannt; Hinweis, in welcher Reihenfolge ausführen (nach `schema.sql`).
- [ ] Wurde **nicht** gegen die echte Datenbank ausgeführt (Vorgabe aus dem Plan).

### 5. Client-Aufruf (`index.html` / Datenschicht)
- [ ] Aufruf über `rpc('partner_session', { ... })` mit genau einem Datum; nur beim Öffnen des Vergleich-Tabs, nicht in einer Schleife über Tage.
- [ ] Antwort wird nicht in `localStorage`/Plan-State des Nutzers persistiert und nicht in `plan_state` zurückgeschrieben (sonst würden Partnerdaten in die eigene Zeile wandern und beim Sync hochgeladen).
- [ ] Fehler (RPC fehlt, noch nicht ausgeführt, offline) ergeben den ruhigen Hinweis «keine Daten, Grund: …», keinen Crash und keine Zahlen.
- [ ] Kein Partner-Name/E-Mail aus anderer Quelle als `team()`.

## Teil B: Weitere Prüfpunkte (Code, nach Fertigstellung)

### `src/compare.js`
- [ ] Ausrichtung der Runden: gleiche Plan-Schritte werden gepaart, nicht nach Index, wenn die Rundenzahl abweicht (Plan 12, Uhr 13; `alignFuzzy` aus `laps.js` wiederverwenden oder bewusst begründen). Unterschiedliche Rundenzahlen von ich/Partner brechen nicht.
- [ ] Fehlende Runden, fehlender Puls in einzelnen Runden, Partner ohne Uhr, Partner mit anderer Einheit (Kraft vs. Lauf), mehrere Aktivitäten am Tag: je ein definierter Ausgang «keine Daten, Grund: …». Keine `0`, kein `NaN`, kein Auffüllen/Interpolieren als Messwert.
- [ ] Differenzen: Vorzeichen und Einheit eindeutig (Pace in s/km, kleiner = schneller); Division durch 0 bei Distanz 0; Mittelwerte distanzgewichtet statt Rundenmittel, oder dokumentiert.
- [ ] Kein Urteil: keine Wörter wie «schneller/besser/gewonnen/Sieger», keine Ampel, keine Rangfolge, keine Punktzahl. Neutrale Differenz («+0:12 /km») ist ok.
- [ ] Kraft ist kein Fehlerfall: kein Warnton bei fehlenden Uhr-Daten.
- [ ] Reine Funktionen ohne DOM, Tests mit Fixture-Fällen (gleich lang, ungleich lang, Lücken, leer, Partner null).

### `src/charts.js` (Interaktivität, Barrierefreiheit)
- [ ] Hover **und** Touch (`pointer`-Events, nicht nur `mouse*`), Tooltip bleibt im Viewport bei 375 px, Fadenkreuz folgt dem nächsten Datenpunkt; `touch-action` so, dass Seiten-Scrollen nicht blockiert wird.
- [ ] Tastatur: Diagramm fokussierbar, Pfeiltasten wechseln Datenpunkt, Esc schliesst, sichtbarer Fokusring; Legende und Metrik-Umschalter sind echte `<button>`/`role="tab"` mit `aria-pressed`/`aria-selected`.
- [ ] Screenreader: `role="img"` mit `aria-label`/`<title>`+`<desc>` oder Datentabelle als Alternative; Tooltip-Werte per `aria-live="polite"` oder gleichwertig.
- [ ] Reihen nicht nur per Farbe unterscheidbar (Linienstil/Marker/Legendentext «Ich»/Jimoh); Kontrast gegen dunklen Hintergrund ≥ 3:1.
- [ ] `prefers-reduced-motion` abgefragt. Keine externen Skripte/Bibliotheken (CSP erlaubt nur self + jsdelivr; Plan sagt: keine externe Lib).
- [ ] Textinhalte aus Daten werden nicht per `innerHTML` ungefiltert eingesetzt (Partnername, Aktivitätsnamen: XSS aus Fremddaten); eigener Escape-Helfer oder `textContent`.
- [ ] Leere/einpunktige/konstante Reihen: keine Division durch 0 in Skalen, kein `NaN` in SVG-Attributen. Y-Achse beginnt nicht irreführend, Achsen beschriftet mit Einheit.
- [ ] Ausgeblendete Reihe: Skala und Tooltip verhalten sich konsistent; nicht beide Reihen ausblendbar zu leerem Diagramm ohne Hinweis.

### Tab-UI, Service Worker, Regression
- [ ] Tab erscheint erst nach dem Training und nur mit Partner-Daten; sonst ruhiger Hinweis. Tab-Leiste mit ARIA-Rollen und Tastaturbedienung.
- [ ] `sw.js`: `src/compare.js`, `src/charts.js` in Cache-Liste, Version erhöht.
- [ ] `index.html`: CSP unverändert gültig (keine neue Quelle nötig), Modul-Import-Pfade stimmen.
- [ ] Auswertungs-Tab (`s7DashParts`) rendert unverändert (Kacheln, Plan gegen Ist, Analyse, Mehrfach-Aktivitäten); Garmin-Import, Plan-Sync nicht berührt.
- [ ] `npm test` grün, neue Tests vorhanden; Browser-Check Desktop + 375 px mit `test/fixtures/dash-seed.js`.
- [ ] Texte deutsch (CH-Stil wie sonst: «ss» statt «ß» ist in der App gemischt, nicht beanstanden).

## Teil C: Befunde

Geprüft am 10.11.2026: `supabase/partner_session.sql`, `src/compare.js`, `src/charts.js`, `test/compare.test.js` und die Diffs von `index.html` und `sw.js`. `npm test`: 372 grün. Nicht im Browser getestet, nur Code gelesen. Es wurde nichts am Feature-Code geändert.

**Gesamturteil Datenschutz:** Die SQL-Funktion besteht die Prüfung bis auf zwei kleine Punkte (C5, C6). Es gibt keinen Befund der Schwere «blockierend».

### Hoch

**C1. Tastatur: Der Tab «Vergleich» ist nicht erreichbar.** `index.html:20742`: Die Tab-Leiste hat `role="tab"` und gibt dem nicht gewählten Tab `tabindex="-1"` (Roving-Tabindex). Es gibt aber keinen Pfeiltasten-Handler (nur der `click`-Zweig `cmp-tab`, Zeile ~24029). Wer nur mit Tastatur arbeitet, kommt mit Tab nie auf «Vergleich» (und aus «Vergleich» nie zurück). Das verletzt die geforderte Tastaturbedienung.
Fix-Vorschlag, eine der beiden: (a) `tabindex` bei beiden Tabs weglassen (beide bleiben per Tab erreichbar, einfachster Weg), oder (b) `ArrowLeft/ArrowRight/Home/End` auf dem Tablist ergänzen und nach `render()` den Fokus auf den gewählten Tab setzen.

### Mittel

**C2. Differenz in Tooltip und Screenreader-Text steht auch bei ungleicher Rundenzahl.** `src/compare.js:77-87` (`atLap`) paart nach Rundennummer, ohne `aligned` zu prüfen. Bei ich 12 / Partner 13 Runden zeigt der Tooltip «Unterschied −0:08 /km» für «Runde 5 gegen Runde 5», obwohl die Notiz darüber sagt, die Runden würden nicht gepaart. Das ist eine erfundene Gegenüberstellung. Fix: `atLap` bekommt `aligned` mit; bei `false` keine `diff` und kein «Unterschied»-Satz (Werte bleiben je Reihe). Dazu ein Test (12 gegen 13 Runden, `diff === null`).

**C3. Keine Ausrichtung an den Plan-Schritten.** Der Plan (Phase 2) verlangt «gleiche Plan-Schritte/Runden». Umgesetzt ist nur «gleich viele Runden → nach Nummer». Schon eine Mini-Runde mehr bei einem von beiden (kommt laut `dashboard-planung.md` vor: 13 Runden, 12 Schritte) schaltet den Vergleich Runde für Runde ganz ab. Das ist ehrlich, aber für den Hauptnutzen schwach. Vorschlag: `alignFuzzy`/`alignSplits` aus `src/laps.js` für beide Seiten verwenden, oder bewusst so lassen und mit Jaime besprechen. Keine Dringlichkeit, solange C2 behoben ist.

**C4. Kacheln vergleichen auch verschiedene Sportarten ohne Hinweis.** `compareSessions` setzt `same` (Zeile 39), die UI zeigt es nirgends. Läuft ich und der Partner fährt Rad, stehen Ø Puls, Dauer und Distanz mit «Unterschied» nebeneinander, nur Pace entfällt. `pickAct(e.acts, me.group)` fällt ausdrücklich auf eine beliebige Aktivität zurück. Vorschlag: bei `same === false` eine neutrale Zeile («Verschiedene Sportarten: Ich Lauf, Jimoh Rad») und keine Differenzen, oder den Tab dann gar nicht anbieten.

**C5. Tab verschwindet kurz beim Auffrischen der Partnerdaten.** `index.html` (`loadPartnerSession`): Nach 5 Minuten setzt jedes `render()` den Eintrag auf `busy` mit `acts: []`. Solange der Abruf läuft, liefert `s7CmpParts` keine Tabs. Wer im Tab «Vergleich» ist, sieht für einen Moment wieder die Auswertung, Layout springt. Fix: bei erneutem Laden die alten `acts` behalten (`{ state: "busy", acts: e ? e.acts : [] }`) und `busy` nur beim ersten Mal wie «keine Tabs» behandeln.

### Niedrig

**C6. SQL gibt `name` der Aktivität heraus, wird aber nirgends angezeigt.** `partner_session.sql`: `'name', a.v -> 'name'`. Der Titel ist Freitext (bei Strava vom Nutzer änderbar, kann Persönliches enthalten). Der Client braucht ihn nicht (`compare.js`/`charts.js` lesen `name` nie). Datenminimierung: Zeile streichen. Gleiches gilt für `start` und `maxHr` (nur `group`, `time`, `dist`, `hr`, Runden werden verwendet); `start` nur behalten, wenn es die Reihenfolge braucht (dann dafür `order by` stehen lassen, aber nicht ausgeben).

**C7. Kein Zeilenlimit.** `jsonb_agg` ohne `limit`. Ein Tag hat praktisch wenige Aktivitäten; Absicherung nur der Vollständigkeit halber (Kriterium 3).

**C8. `partner_session` wird beim Anzeigen jedes Tages mit eigener Aktivität abgerufen**, nicht erst beim Öffnen des Tabs (Cache 5 min, ein Aufruf je Tag). Es wird immer nur ein Datum je Aufruf abgefragt, nichts wird gespeichert (nur Arbeitsspeicher `PSES`, nicht in `S`/`plan_state`): datenschutzrechtlich in Ordnung. Nur Hinweis: Wenn eine Ansicht viele Tage nacheinander rendert, entstehen entsprechend viele Aufrufe.

**C9. Diagramm: Fokus und Cursor gehen bei jedem `render()` der App verloren.** `stateOf` legt bei neuem `model`-Objekt (jedes Render) den Cursor neu an. Wer mit den Pfeiltasten durch Runden geht und dabei ein App-Render auslöst, verliert Fokus und Position. Metrik und Ausblendung bleiben erhalten. Selten, nur erwähnt.

**C10. Touch: Tooltip bleibt stehen**, bis man eine andere Runde antippt oder die Metrik wechselt (kein «Tippen daneben schliesst»). `Esc` schliesst nur per Tastatur. Kein Fehler, nur Komfort.

**C11. Nicht umgesetzt aus dem Plan:** «Runden-Balken antippbar» (Balken nur bei Distanz, Cursor wählt die Runde, das genügt in der Praxis); Puls-Reihe als Zeitverlauf fehlt, es gibt nur den Rundenpuls (Plan Phase 1 sprach von «Puls-Reihe»; Daten dafür liegen vermutlich gar nicht in `plan_state`). Mit Jaime klären, ob das reicht.

### Bestanden (Auszug)
- **SQL:** Whitelist statt `to_jsonb`; keine Notizen, Check-ins, Gewichte, `garmin.well`, Tokens, IDs, Kalorien; Team- und Nicht-Selbst-Filter exakt wie `partner_profile`; `p_date is not null`; Datum als `date`, Vergleich gegen `a.v ->> 'date'` (= `isoDay(start_date_local)` in `src/strava.js:35`, also lokaler Kalendertag, kein Zeitzonenproblem); `security definer` + `search_path`; `revoke … from public, anon` und `grant … to authenticated` mit Signatur `(date)`; nicht gegen die Datenbank ausgeführt; Clientaufruf `rpc('partner_session', { p_date })` passt zum Parameternamen.
- **Daten im Client:** Partnerdaten nur im Speicher (`PSES`), nicht in `S`, nicht synchronisiert; Fehler/RPC fehlt ergibt «keine Daten, Grund: …».
- **compare.js:** Zahlen werden nur als endliche Zahlen > 0 übernommen (`pos`), Lücken bleiben `null`, keine Interpolation; Pace nur ab 100 m / 500 m; Differenz = ich minus Partner ohne Wertung; kein «besser/schneller»; Kraft ohne Uhr-Aktivität zeigt gar keinen Tab (kein Fehler).
- **charts.js:** Nur SVG, keine Bibliothek; Pointer-Events (Maus, Touch, `touch-action: pan-y`); Pfeiltasten/Pos1/Ende/Esc im Diagramm; Legende als `aria-pressed`-Buttons, Metrik als Radiogruppe; `aria-live`-Text; Reihen zusätzlich über Linienart/Marker unterscheidbar; `prefers-reduced-motion` beachtet; Texte durch `esc` bzw. `esc0` geschickt; leere/konstante Reihen und beide ausgeblendet behandelt (`niceTicks`, «Beide Reihen ausgeblendet»); Pace-Achse korrekt invertiert.
- **sw.js:** `compare`, `charts` in der Cache-Liste, Version v117.
- **Regression Auswertung:** Der Auswertungs-Zweig ist unverändert (nur `cmp.tabs` davor und `cmp.hint` danach angehängt). Bei fehlenden Partnerdaten bleibt die Ansicht wie vorher, plus ein ruhiger Hinweis. Kein Eingriff in Plan, Garmin-Import oder Sync.

### Vorschlag zur Reihenfolge
C1 und C2 vor dem Einspielen beheben (klein). C6 vor dem Ausführen der SQL-Datei streichen. C3/C4/C11 mit Jaime besprechen. Danach einmal im Browser (Desktop und 375 px) mit `test/fixtures/dash-seed.js` prüfen; das habe ich nicht getan.

---

## Teil D: Zweite Prüfung nach dem Umbau auf uPlot (10.11.2026)

Geprüft: `supabase/partner_session.sql` (neu), `supabase/functions/garmin/reduce.js` (`reduceSeries`), `src/series.js`, `src/charts.js`, `index.html`, `sw.js`, `vendor/uplot/`, `dev/seeds.js`. `npm test`: 384 grün. Nur gelesen und gerechnet, nicht im Browser getestet, nichts geändert.

### Stand der Befunde aus Teil C
| Befund | Stand |
|---|---|
| C1 Tab per Tastatur nicht erreichbar | behoben (`tabindex` entfernt, beide Tabs per Tab erreichbar; Pfeiltasten nach ARIA-Muster fehlen weiterhin, sind aber kein Hindernis mehr) |
| C2 Differenz bei ungleicher Rundenzahl | erledigt durch den Umbau: Differenz kommt jetzt aus dem Zeitraster, nicht aus Rundennummern |
| C3 Ausrichtung an Plan-Schritten | behoben: `pairLaps` nutzt `alignFuzzy`, mit Hinweistext |
| C5 Tab verschwindet beim Auffrischen | behoben (`acts` bleiben beim erneuten Laden erhalten) |
| C6 `name` in der SQL | behoben (`name`, `start`, `maxHr` entfernt) |
| C7 Zeilenlimit | behoben (`limit 20`) |
| C4 Verschiedene Sportarten ohne Hinweis | offen, siehe D8 |

### Hoch

**D1. Zeitreihen blähen `plan_state` unbegrenzt auf und gehen mehrfach durch den Speicher.** Gemessen mit `reduceSeries` auf einer synthetischen 1-Stunden-Aktivität: **600 Punkte = rund 16 KB JSON je Aktivität**. Aktivitäten werden nie gekürzt (`purgeActs` entfernt nur «irrelevante», keine alten). Bei 100 Aktivitäten sind das rund 1,6 MB, bei einem Jahr Training (200 bis 300) 3 bis 5 MB. Dieser Stand wird:
- bei jedem Sync komplett heruntergeladen und wieder hochgeladen (`doSync`, `index.html` ~18722-18760, ganzes `S` in einer jsonb-Zeile);
- im `localStorage` doppelt gehalten (`LSK` = `JSON.stringify(S)` und `baseKey()` = `snap`), dazu Backups. Das Kontingent liegt je nach Browser bei etwa 5 MB. `lsSet` schluckt den Fehler still (`catch → false`); es gibt nur eine Meldung in Zeile ~14636. Ohne Gegenmassnahme lässt sich der lokale Stand irgendwann nicht mehr speichern.

Vorschlag (eine Variante genügt): (a) Zeitreihe nur für die letzten N Aktivitäten (z. B. 30) oder die letzten 60 Tage behalten, ältere beim Zusammenführen entfernen; (b) Reihe nicht in `plan_state.data`, sondern in eigener Tabelle `activity_series` (mit RLS wie `plan_state`) halten und `partner_session` von dort lesen; (c) weniger Punkte (300) und kürzere Zahlen. Vor dem Ausrollen mit einem Konto mit realer Historie messen (`JSON.stringify(S).length`). Das ist der wichtigste Punkt dieser Prüfung, weil es still und erst Monate später bricht.

### Mittel

**D2. Mausrad-Zoom fängt das Seiten-Scrollen ab.** `charts.js`, `wheel`-Listener mit `passive: false` und `preventDefault()` auf dem ganzen `.cmp-host` (vier bis fünf gestapelte Diagramme, fast die ganze Bildschirmhöhe). Wer am Desktop die Seite mit dem Rad scrollt und über den Diagrammen steht, zoomt statt zu scrollen. Vorschlag: Zoom per Mausrad nur mit gedrückter Strg-/Cmd-Taste (`e.ctrlKey || e.metaKey`), sonst normal scrollen; Hinweistext anpassen.

**D3. Pulszonen «Z1 bis Z5» im Pulsdiagramm.** `charts.js` zeichnet Zonen aus dem höchsten gemessenen Puls **von mir** (`index.html`: `maxHr` aus `S.strava.acts`) auch hinter die Linie des Partners. Zwei Probleme: (1) Die Zonen gelten für Jimoh nicht, sein Maximalpuls ist ein anderer. (2) `docs/dashboard-planung.md` nennt «Zonen» unter «Fällt weg». Entscheidung mit Jaime: Zonen entfernen, pro Person getrennt anzeigen, oder bewusst als «nach meinem Maximalpuls» beschriften.

**D4. Lücke zwischen Rundenbändern und Zeitreihe möglich.** `reduceSeries` nimmt `sumDuration` als Zeitachse, `normalizeAct`/`normalizeLaps` verwenden `duration` (laut Kommentar bewusst die Zeit «wie in Garmin Connect», nicht nur bewegte Zeit). Bei Auto-Pause können Diagrammachse und Runden (`t0/t1` aus `lap.t`) auseinanderlaufen, die Rundenbänder liegen dann neben dem Verlauf. Mit einer echten Aktivität mit Pause prüfen; falls es abweicht, `sumElapsedDuration` (falls Garmin es liefert) verwenden und den Fall testen.

**D5. Screenreader und Datenzugang.** Die Diagramme sind Canvas ohne `role="img"`/Textalternative; nur der Container hat eine Beschriftung, der `aria-live`-Satz erscheint nur bei Cursorbewegung. Wer weder sieht noch Pfeiltasten benutzt, hat nur die Kacheln und die Ausschnitt-Zeile (`.cmp-read`, reiner Text, gut). Mindestens: kurzer Zusammenfassungssatz im Container (Ø Puls und Pace beider, Rundenzahl) und die Rundentabelle (`.cmp-lt`) auch ohne Auswahl anzeigen. Die Runden-Knöpfe (`.cmp-chip`) sind bereits gut bedienbar.

### Niedrig

**D6. Diagramm «Abstand» verschwindet leise bei Achse «Distanz».** `buildPlot`: `diff.dist` ist bei `xk === "d"` null, `plotSpecs` lässt das Diagramm weg, der Knopf «Abstand» bleibt aber gewählt. Knopf ausblenden oder «nicht berechenbar bei Distanzachse» anzeigen.

**D7. Differenz-Diagramme vergleichen gleiche Zeit seit Start (oder gleiche Distanz).** Hat einer ein Warm-up mehr oder startet die Aufzeichnung später, ist das nicht dieselbe Stelle der Einheit. Kurzer Hinweis neben «Unterschied zeigt» erwägen («jeweils ab Start der Aufzeichnung»).

**D8. (aus C4) Verschiedene Sportarten:** weiterhin nicht gekennzeichnet; `pickAct(e.acts, me.group)` fällt auf eine beliebige Aktivität zurück. Eine Hinweiszeile genügt.

**D9. MutationObserver auf dem ganzen `body`.** `attachCharts` ruft bei jeder DOM-Änderung `scan()` auf. Jede Cursorbewegung schreibt `innerHTML` in `.cmp-pv` (im beobachteten Bereich) und löst so einen Scan aus. Funktioniert, ist aber Verschwendung. Besser: nach `render()` scannen oder Änderungen in `.cmp-host` ignorieren.

**D10. Test-Haken im Produktivcode.** `loadPartnerSession` liest `window.TL_PARTNER_DEMO`. Gesetzt wird er nur in `dev/seeds.js`, das Panel zeigt «DEMO-DATEN (Testkopie)». Unkritisch, solange `dev/` nicht ausgeliefert wird; das kurz prüfen.

**D11. Höhenmeter («Höhe ↑»)** werden aus der reduzierten, gemittelten Reihe summiert; GPS-Rauschen summiert sich. Als Richtwert verstehen, ggf. «ca.» davor.

**D12. Partnerdaten nicht streng typgeprüft.** Die SQL prüft nur `jsonb_typeof(series->'t') = 'array'`; `seriesOf`/`arr` prüfen die Länge, nicht den Zahlentyp. Strings in Jimohs Zeile könnten `NaN` in Texten erzeugen. Kein XSS (alles läuft durch `esc0` oder Zahlenformate), unter zwei vertrauten Nutzern vernachlässigbar.

### Datenschutz der erweiterten `partner_session`

| Prüfpunkt | Ergebnis |
|---|---|
| Nur der gewählte Tag | Ja: `date`-Parameter, `NULL` ergibt nichts, Vergleich auf `value ->> 'date'` (lokaler Tag), `limit 20` |
| Whitelist statt Ganzes | Ja: `group, time, dist, hr, laps (d,t,hr), series (n,t,d,hr,v,el,cad)` |
| Zeitreihe nur Puls, Tempo, Höhe, Kadenz | Ja (dazu `t` = Sekunden seit Start und `d` = Meter als Achsen) |
| Keine GPS-Koordinaten | Ja. Der Abruf sendet `maxPolylineSize=0`, `reduceSeries` liest nur die sechs benannten Spalten, die SQL gibt nur die genannten Arrays heraus. Koordinaten können nicht in `series` gelangen |
| Restrisiko Höhenprofil | `el` mit `d` ergibt ein Höhenprofil, das eine Strecke grob wiedererkennbar macht (kein Ort, keine Uhrzeit). Für zwei Trainingspartner angemessen, bewusst so lassen |
| Gegenüber Teil C entfernt | `name`, `start`, `maxHr` |
| Team- und Partner-Filter, `security definer`, `search_path`, `revoke`/`grant` mit Signatur `(date)` | unverändert korrekt |
| Nicht herausgegeben | Notizen, Check-ins, Gewichte, RPE, Wellness, Kalorien, IDs, Tokens, andere Tage |
| Client speichert Partnerdaten nicht | Ja: nur im Arbeitsspeicher `PSES`, nicht in `S` |

### Korrektheit der Reduktion (`reduceSeries`, `series.js`)
- Einheiten stimmen: Tempo m/s × 100 = cm/s, Höhe m × 10 = dm, Kadenz Schritte/min unverändert, Zeit in Sekunden, `d` in Metern. Die Rückrechnung in `series.js` (`1e5 / v`, `el / 10`) passt dazu.
- Blockmittelung bei mehr als 600 Rohpunkten (`step = ceil(n / 600)`): `t` und `d` vom letzten Punkt des Blocks, `hr/v/el/cad` gemittelt, Lücken bleiben `null`. Reihe ohne Messspalte oder mit weniger als 2 Punkten ergibt `null` (nichts erfunden); nicht aufsteigende Zeit ergibt `null`.
- Pace: unter 0,6 m/s oder langsamer als 12:00/km wird `null` (Stehen). Mittelung des Tempos über Blöcke (nicht des Paces) ist richtig.
- `resample` interpoliert nur zwischen echten Nachbarpunkten, ausserhalb der Reihe und neben Lücken `null`; `smooth` lässt Lücken stehen. Fehlt die Sekundenreihe, werden Stufen aus Rundenmitteln gezeichnet und der Hinweistext sagt das ausdrücklich: «nie Zahlen erfinden» ist eingehalten.
- Tests (`test/series.test.js`, neue Fälle in `test/garmin.test.js`) laufen grün. Wünschenswert zusätzlich: ein Fall mit Pause (Zeitlücke) und einer mit fehlendem `sumDuration` (nur `directTimestamp`).

### uPlot-Einbindung
- Version fest: 1.6.31, lokal unter `vendor/uplot/`. **Beide Dateien sind byte-gleich mit dem offiziellen npm-Paket `uplot@1.6.31`** (SHA-256 verglichen).
- Offline: beide Dateien stehen in `sw.js` (`FILES`), Cache v118, neue Module `compare`, `series`, `charts` in der Liste. `addAll` bricht ab, wenn eine Datei fehlt; alle existieren.
- CSP unverändert gültig (`script-src 'self'`, `style-src 'self' 'unsafe-inline'`), kein CDN.
- Ladereihenfolge: `<script defer>` im Kopf vor dem Modulcode; `mount()` prüft `window.uPlot` und zeigt sonst einen Hinweis statt abzustürzen.
- Fehlt: die MIT-Lizenzdatei von uPlot (`vendor/uplot/LICENSE`, liegt im npm-Paket). Die Lizenz verlangt, den Hinweis mitzuliefern. Kleinigkeit.

### Interaktion
Im Code geprüft: Zoom per Ziehen, Pinch mit zwei Fingern, Knöpfe «+/−/Zurücksetzen», Tastatur (`+`, `-`, `0`, Pfeile, Pos1/Ende, Esc), Doppelklick setzt zurück, Runden-Knöpfe zoomen auf die Runde beider und zeigen eine Tabelle, EIN synchrones Fadenkreuz über `cursor.sync`, Reihen ausblendbar, Achse Zeit/Distanz, Zoom bleibt beim Neuzeichnen erhalten. Touch: `touch-action: pan-y` auf den Diagrammen, ein Finger bewegt das Fadenkreuz, vertikales Wischen scrollt weiter. Offen: D2 (Mausrad), D5 (Screenreader), D6 (Abstand-Knopf). Auf einem echten Touch-Gerät nicht ausprobiert.

### Regeln aus `docs/dashboard-planung.md`
- Kein Urteil, keine Ampel, keine Punktzahl: eingehalten («Unterschied», «Durchschnitte», «Nur Zahlen, keine Wertung»). Farbe nur Gold und Blau, der Partner zusätzlich gestrichelt. **Ausnahme: Zonen, siehe D3.**
- Nie Zahlen erfinden: eingehalten (Lücken bleiben Lücken, «keine Daten, Grund: …», Stufen nur aus echten Rundenwerten und so benannt).
- Kraft kein Fehlerfall: Ohne Uhr-Aktivität erscheint gar kein Tab.
- Dunkles Design wie die App: ja (`--well`, `--edge`).

### Vorschlag zur Reihenfolge
1. D1 vor dem Aktivieren entscheiden (Aufbewahrung begrenzen oder auslagern), sonst wächst der Cloud- und Lokalstand für jeden Nutzer unbemerkt.
2. D2 (Mausrad nur mit Strg) und D3 (Zonen) klären; beides ist klein.
3. D4 an einer echten Aktivität mit Pause prüfen, D5 mit einem Zusammenfassungssatz abfangen.
4. LICENSE-Datei nachlegen, D6/D7/D8 nach Gelegenheit.
5. Einmal im Browser prüfen (Desktop und 375 px, Touch).
