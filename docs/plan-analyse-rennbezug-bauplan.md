# Analyse-Tab Rennbezug: Bauplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Analyse-Tab stellt jede Einheit neben das Renntempo für sub 60, zeigt wählbare Trends über 4/12 Wochen und mehr Kennzahlen pro Einheit.

**Architecture:** Alle Rechnungen als reine Funktionen in der neuen Datei `src/race-link.js` (ohne DOM, mit Tests). HTML-Bausteine in `src/an-ui.js`. `index.html` sammelt nur die Daten ein und ruft die Bausteine auf. `src/forecast.js` bleibt unverändert.

**Tech Stack:** Vanilla JS (ES-Module), `node --test`, PWA mit Service Worker.

**Spec:** `docs/plan-analyse-rennbezug.md`

## Global Constraints

- Nur Zahlen: keine Punktzahl, kein Ring, keine Ampel, kein Grün. Orange (`class="bad"`) nur für «langsamer» oder «mehr».
- Nie einen Wert erfinden: Zeile oder Block weglassen, oder «keine Daten, Grund: …».
- Mit dem Renntempo verglichen werden nur Arbeitsläufe von 800 bis 1200 m (`RACE_LAP = [800, 1200]`).
- Phasen-Sicherheit muss `"sure"` oder `"likely"` sein.
- Lockerer Lauf wird über `isEasyRun` (`src/util.js`) erkannt. Kraft bekommt nichts.
- Optik: nur bestehende `an2-*`-Bausteine, dunkel. Texte Deutsch (Schweiz), ohne «ß».
- `sw.js`: Cache-Version bei jeder Stufe um 1 erhöhen, neue Datei `src/race-link.js` in die Cache-Liste.
- Nach jeder Stufe: `npm test` grün, Sichtprüfung im Browser (`npm run dev`), separater Prüfer-Agent, dann Halt für Jaime.

## Review Focus

1. Prognose mit geeichten Laufzeiten (`fc.runCal`): Aufschlag kann 0 oder negativ sein → Zeile fehlt, kein «−3 s».
2. Runden ohne Puls oder mit `d = 0` → keine `NaN`, kein «Infinity /km».
3. Einheit mit 400-m-Intervallen → Hinweiszeile statt Vergleich.
4. Trend mit 0 oder 1 Punkt → Satz mit Anzahl, keine Linie, kein Absturz.
5. Zeitreihe ohne Trittfrequenz (Strava-Runden statt Garmin-Serie) → Eintrag fehlt.

---

## Stufe 1a

### Task 1: `racePlanRows` (reine Rechnung)

**Files:**
- Create: `src/race-link.js`
- Test: `test/race-link.test.js`

**Interfaces:**
- Consumes: `ph` aus `splitPhases` (`{laps:[{d,t,hr}], phase:[], sub:[], conf}`), `st` aus `phaseStats`, `fc` aus `buildForecast` (`{T, pace, paces, st, rox, total}`), `RUN_BOUNDS` aus `src/forecast.js`.
- Produces:
  - `RACE_LAP = [800, 1200]`
  - `raceLaps(ph) -> [{d,t,hr}]`: Runden mit Phase `work`, Sub `run` (oder leer), `d` in `RACE_LAP`.
  - `paceOfLaps(laps) -> number|null` (s/km, Summe t ÷ Summe d).
  - `racePlanRows({ ph, st, fc, goal = 3600, easy = false, kind }) -> null | { state, rows, foot }`
    - `null`: `kind` nicht `lauf`/`station`/`sim`, oder `easy`, oder `conf` nicht sure/likely, oder keine Arbeitsläufe.
    - `state: "nokm"`: Arbeitsläufe da, aber keiner in `RACE_LAP`. `rows = []`.
    - `state: "notests"`: Läufe passen, aber `fc` fehlt oder `fc.total` leer. `rows = []`.
    - `state: "ok"`: `rows = [{ id, k, v, d, bad }]` mit `id` in `pace | fc | need | comp | compfc`; `v` = Sekunden (Zahl), `d` = Differenz in Sekunden gegen «Pace Arbeit» bzw. gegen Kompromiss-Delta (Zahl oder `null`), `bad` = Ist langsamer / Delta grösser.
    - `need` hat `v: null, why: "Stationen und Roxzone allein lassen kein sub 60 zu"`, wenn der Wert unter `RUN_BOUNDS[0]` liegt.
    - `comp`/`compfc` nur mit `st.compromise`; `compfc` nur, wenn `fc.pace - fc.T > 0`.

- [ ] **Step 1: Tests schreiben** (`test/race-link.test.js`), Werte fest:
  - `ok`: 4 Arbeitsrunden 1000 m in 252 s, `fc = {T: 262, pace: 271, st: 1443, rox: 300, total: 3911}` → `pace.v === 252`, `fc.v === 271`, `fc.d === -19`, `fc.bad === false`, `need.v === 232` (gerundet aus (3600−1443−300)/8 = 232,1), `need.d === 20`, `need.bad === true`.
  - Kompromiss: `st.compromise.avg = 14` → `comp.v === 14`, `compfc.v === 9`, `compfc.d === 5`, `compfc.bad === true`.
  - `fc.pace === fc.T` → keine Zeile `compfc`.
  - 400-m-Runden → `state === "nokm"`.
  - `fc = null` → `state === "notests"`.
  - `easy: true`, `kind: "kraft"`, `conf: "unsure"` → jeweils `null`.
  - `st = 3400, rox = 300` → `need.v === null` und `need.why` gesetzt.
  - Runde mit `d: 0` und ohne `hr` daneben → kein `NaN` in irgendeinem `v`.
- [ ] **Step 2:** `node --test test/race-link.test.js` → FAIL (Modul fehlt).
- [ ] **Step 3:** `src/race-link.js` mit den vier Exporten schreiben.
- [ ] **Step 4:** `node --test test/race-link.test.js` → PASS. `npm test` → alles grün.
- [ ] **Step 5:** Commit «Rennbezug: Rechnung Gegen Rennplan».

### Task 2: Vier Anordnungen zur Auswahl

**Files:** Create: `dev/entwurf-rennbezug.html` (eigenständige Seite, nutzt die `an2-*`-Farben und Schriften aus `index.html`, Beispielzahlen aus Task 1).

- [ ] **Step 1:** Vier Varianten des Blocks «Gegen Rennplan» und der Trend-Auswahl nebeneinander bauen: (1) Zeilenliste wie Skizze im Entwurf, (2) zwei grosse Zahlen plus Zeilen, (3) Tabelle Ist / Prognose / Nötig, (4) eine Skala mit drei Marken (Ist, Prognose, 60:00-Tempo) plus Zeilen.
- [ ] **Step 2:** Bildschirmfotos bei 390 px Breite, Jaime zeigen. **Halt: Jaime wählt.**

### Task 3: Block anzeigen

**Files:**
- Modify: `src/an-ui.js` (neuer Export), `index.html` (`anBody`, CSS im Abschnitt `/* Analyse-Bereich nach dem Entwurf */`), `sw.js`
- Test: `test/race-link.test.js`

**Interfaces:**
- Consumes: `racePlanRows` (Task 1), `rvForecast()`, `s7Work(p, act)`, `isEasyRun(p)`, `S.tests.at`.
- Produces: `anRaceHtml(res, { total, testsAt }, esc) -> string` (leer bei `res === null`).

- [ ] **Step 1: Tests:** `anRaceHtml(null) === ""`; bei `ok` enthält das HTML «19 s schneller», «12 s langsamer» mit `class="bad"`, die Fusszeile «ändert sich nur durch Tests und Simulationen» und kein `#30d158` (kein Grün); bei `nokm` «Intervalle sind nicht rund 1 km lang»; bei `notests` den Link `data-v="profile"`.
- [ ] **Step 2:** Test läuft rot.
- [ ] **Step 3:** `anRaceHtml` in der von Jaime gewählten Anordnung bauen. Texte: Überschrift «Gegen Rennplan», Zeilen «Pace Arbeit», «Prognose rechnet mit», «Für 60:00 nötig», «Kompromiss-Delta», «Prognose rechnet mit». Differenz: `"<n> s schneller|langsamer"` bzw. `"<n> s mehr|weniger"`, bei 0 «gleich».
- [ ] **Step 4:** In `anBody` nach `anResultHtml(...)` und vor dem Diagramm einfügen, in `try/catch` wie die anderen Blöcke. `sw.js` Version +1, `src/race-link.js` in die Liste.
- [ ] **Step 5:** `npm test` grün. Im Browser mit `dev/seeds.js` prüfen: Intervall-Lauf, Stationstag, lockerer Lauf (kein Block), Kraft (kein Block), ohne Tests.
- [ ] **Step 6:** Commit, Prüfer-Agent, push. **Halt.**

## Stufe 1b

### Task 4: `trendPoints` und `trendText`

**Files:** Modify: `src/race-link.js` · Test: `test/race-link.test.js`

**Interfaces:**
- Produces:
  - `TREND_METRICS = [["pace","Pace Arbeit"],["drift","Puls-Drift"],["hr","Puls Ø Arbeit"],["comp","Kompromiss-Delta"],["easy","Lockerer Lauf"]]`
  - `trendPoints(sessions, metric, weeks, today) -> [{ i, v, v2 }]`, ältester zuerst. `sessions = [{ i, kind, easy, ph, st, act }]`, Fenster `i > today - weeks * 7`.
    - `pace`/`drift`/`hr`: nur `kind === "lauf"`, nicht `easy`, `raceLaps(ph).length > 0`, conf sure/likely. Werte: `paceOfLaps(raceLaps(ph))`, `st.drift.bpm`, `st.work.hr`.
    - `comp`: `st.compromise.avg`, conf sure/likely.
    - `easy`: `easy === true`, `v = act.time / (act.dist / 1000)`, `v2 = act.hr`; braucht `act.dist >= 1000`.
    - Einheiten ohne Wert werden ausgelassen.
  - `trendText(pts, metric, weeks) -> string`: bei `< 2` Punkten «Zu wenig Einheiten mit Runden im Zeitraum (n)». Sonst Vergleich letzte gegen vorletzte und gegen erste: «5 s schneller als bei der Einheit davor, 11 s schneller als vor 12 Wochen». Wörter je Kennzahl: Pace schneller/langsamer, Drift und Delta weniger/mehr, Puls tiefer/höher.

- [ ] **Step 1: Tests:** 6 Einheiten (2 lockere, 3 Intervall mit 1-km-Runden, 1 mit 400 m). `pace`, 12 Wochen → 3 Punkte in Reihenfolge; 4 Wochen → nur die im Fenster; `easy` → 2 Punkte mit `v2`; Einheit ohne `drift` fehlt bei `drift`; 1 Punkt → Text mit «(1)»; Text bei drei Punkten 262, 256, 251 → «5 s schneller als bei der Einheit davor, 11 s schneller als vor 12 Wochen».
- [ ] **Step 2–4:** rot, bauen, grün.
- [ ] **Step 5:** Commit.

### Task 5: Trend-Auswahl im Verlauf

**Files:** Modify: `src/an-ui.js` (`anTrendHtml`), `index.html` (`anTrend`, `anVerlaufView`, Klick-Behandlung, CSS), `sw.js`

**Interfaces:**
- Produces: `anTrendHtml({ pts, metric, weeks, text, need }, esc)`; `need` = Tempo für 60:00 in s/km oder `null` (nur bei `metric === "pace"` als beschriftete, graue waagrechte Linie). Auswahl-Knöpfe mit `data-act="an-trend"`, `data-m`, `data-w`.

- [ ] **Step 1: Tests:** HTML enthält alle 5 Kennzahl-Namen und «4 Wochen», «12 Wochen»; bei `need` die Beschriftung «60:00»; bei 1 Punkt kein `<path`; `easy` zeichnet zwei Linien.
- [ ] **Step 2:** `anTrend(today)` in `index.html` so umbauen, dass es einmal `sessions` für 12 Wochen sammelt (Zwischenspeicher pro Anzahl geladener Aktivitäten) und `trendPoints` ruft. Auswahl in `localStorage` (`an-trend`), mit `try/catch`, Standard `pace` / 12.
- [ ] **Step 3:** `npm test` grün, Sichtprüfung alle 5 Kennzahlen, beide Zeiträume, leerer Zustand. `sw.js` +1.
- [ ] **Step 4:** Commit, Prüfer-Agent, push. **Halt.**

## Stufe 2

### Task 6: Erholung je Pause, Trittfrequenz, Bestwerte (Rechnung)

**Files:** Modify: `src/session-dash.js` (`phaseStats`), `src/race-link.js` · Test: `test/session-dash.test.js`, `test/race-link.test.js`

**Interfaces:**
- Produces:
  - `phaseStats().recovery.list = [{ drop, rest, from, to }]` (bestehende Felder `drop`, `n`, `restS` bleiben).
  - `cadByInterval(series, ivs) -> [{ k, cad }]`: Mittel von `series.cad` zwischen `t0` und `t1` jedes Intervalls; `[]`, wenn keine Trittfrequenz.
  - `bests(sessions, today) -> { km: { v, i } | null, comp: { v, i } | null }`: schnellste einzelne Runde in `RACE_LAP` über alle Einheiten, kleinstes `compromise.avg`.

- [ ] **Step 1: Tests:** zwei Pausen (Arbeit 170 → Pause 140 in 90 s; 172 → 150 in 60 s) → `list` mit `drop` 30 und 22, `recovery.drop === 26`; `cadByInterval` mit Serie ohne `cad` → `[]`, mit Werten → gerundetes Mittel; `bests` wählt 238 s aus drei Einheiten und nennt deren `i`; leere Liste → beide `null`.
- [ ] **Step 2–4:** rot, bauen, grün. **Step 5:** Commit.

### Task 7: Details anzeigen

**Files:** Modify: `src/an-ui.js` (`anDetailsHtml`), `index.html` (`anBody`), `sw.js`

**Interfaces:**
- Consumes: Task 6. `anDetailsHtml({ d, ivs, zones, maxHr, recovery, spread, cad, bests, dayLabel })`.

- [ ] **Step 1: Tests:** vier neue `<details>` mit den Titeln «Erholung in den Pausen», «Gleichmässigkeit», «Trittfrequenz je Intervall», «Bestwerte», alle ohne `open`; jeder fehlt ganz, wenn seine Daten fehlen; Bestwert von heute trägt das Wort «heute».
- [ ] **Step 2:** bauen, verdrahten, `sw.js` +1. `npm test` grün, Sichtprüfung.
- [ ] **Step 3:** Commit, Prüfer-Agent, push. **Halt.**
