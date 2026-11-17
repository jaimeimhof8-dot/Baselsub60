# Analyse-Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Analyse-Tab nach `docs/analyse-tab-anforderungen.md` und dem Artefakt «Analyse-Tab Garmin-Stil» bauen, für Intervall-Lauf, Stationstag, Kompromiss-Einheit, lockeren Lauf und Zone-2-Velo.

**Architecture:** Reine Logik (Diagramm-Modell, Glättung, Ausdünnung, Ausschnitts-Kennzahlen, Zonen, Ansichts-Modell je Einheitstyp) lebt in neuen Modulen ohne DOM mit Node-Tests. `src/an-ui.js` bleibt die einzige Stelle für HTML und Zeiger-Bedienung. `index.html` ruft nur auf. Die Garmin-Edge-Function liefert die 1-s-Reihe, Garmin-Zonen und Training Effect.

**Tech Stack:** Vanilla-JS-PWA (ES-Module, kein Build), `node --test`, Supabase Edge Function (Deno), Garmin Connect (inoffiziell).

**Spec:** `docs/analyse-tab-anforderungen.md` (Abschnitte 6, 7, 12 bis 16), Artefakt https://claude.ai/artifact/KKYj8uB2Y6e5So1FPidVNk

## Global Constraints

- Kein Build-Schritt, keine neue Bibliothek. Diagramme als SVG mit eigenem Zeichnen (Min/Max je Pixelspalte), nicht uPlot.
- Nie eine Zahl erfinden: Fehlendes bleibt leer oder die Kachel entfällt.
- Deutsch (CH), Komma als Dezimaltrenner, `mm:ss`.
- Tippflächen mindestens 44 px, bei 390 px kein horizontales Scrollen, nichts abgeschnitten.
- Farben: Gold nur Auswahl/Aktion, Grün/Rot nur besser/schlechter bzw. Ziel erreicht/verfehlt, Orange nur Warnung, Blau/Rot/Violett nur Datenreihen.
- Ergebnis: eine Aussage, höchstens 3 Leistungszahlen, höchstens 3 Garmin-Zahlen, 1 Datenlage-Zeile.
- Ø Pace = Dauer ÷ Distanz, nie aus geglätteten Werten.
- Garmin-Pulszonen der Aktivität, Rückfall 50/60/70/80/90 % mit Hinweis «Zonen geschätzt».
- Kleinster Zoom 10 s bzw. 30 m. Glättung nur für Pace, Geschwindigkeit, Leistung (Aus, 5, 10, 30 s, Standard 10 s).
- Nichts committen, ausser der Nutzer verlangt es.

## Review Focus

- Aktivität ohne Sekundenreihe (alt): Rundenstufen mit Hinweis, keine erfundene Linie.
- Reihe mit Lücken (Puls null, Pause der Uhr): Linie bricht ab, Kennzahlen überspringen Lücken.
- Zoom über die Grenzen, Ausschnitt kleiner als Minimum, Distanz-Achse mit Stillstand (gleiche Distanz mehrfach).
- Indoor-Velo ohne Höhe und ohne Distanzreihe: Diagramm fehlt statt leer zu sein.
- Einheit ohne Plan-Zieltempo, ohne Runden, ohne Puls: jede Kachel einzeln leer mit Grund.

---

### Task 1: Diagramm-Rechenkern (`src/an-chart.js`)

**Files:**
- Create: `src/an-chart.js`, `test/an-chart.test.js`

**Interfaces:**
- Produces: `smoothMA(arr: (number|null)[], w: number): (number|null)[]`, `decimateMinMax(xs: number[], ys: (number|null)[], a: number, b: number, W: number): {x: number, y: number}[]` (alle Punkte wenn ≤ 2·W, sonst Min/Max je Spalte, Lücken als `null`-Marker `{x, y: null}`), `niceTicks(lo: number, hi: number, steps: number[]): number[]`, `rangeStats(S, t0: number, t1: number, key: string): {avg, min, max} | null`, `snapIndex(xs: number[], x: number): number`, `clampView(a: number, b: number, max: number, min: number): [number, number]`.
- Consumes: nichts.

- [ ] **Step 1: Tests** (`smoothMA` mit w 1 gibt Kopie, w 5 mittelt, Lücken bleiben Lücken; `decimateMinMax` behält Spitze bei 3000 Punkten und W 300; bei 100 Punkten alle Punkte; `niceTicks(3.9*60, 8*60, [30,60,120])` gibt `[240, 360, 480]`; `clampView(-5, 30, 100, 10)` gibt `[0, 35]`... exakt `[0, 35]`; `snapIndex([0,1,2,3], 1.6)` gibt 2).
- [ ] **Step 2: Run** `node --test test/an-chart.test.js` → FAIL.
- [ ] **Step 3: Implement** die sechs Funktionen (Präfixsummen für `smoothMA`).
- [ ] **Step 4: Run** → PASS.

### Task 2: Garmin-Daten (`supabase/functions/garmin/reduce.js`, `index.ts`, `src/series.js`)

**Files:**
- Modify: `supabase/functions/garmin/reduce.js` (`reduceSeries`, `normalizeAct`, neu `reduceZones`), `supabase/functions/garmin/index.ts:186`, `src/series.js` (`seriesOf` liest `pw`, `zoneTimes` nutzt Garmin-Grenzen), `test/garmin.test.js`, `test/series.test.js`

**Interfaces:**
- Produces: `reduceSeries(raw, maxN = 3700)` liefert zusätzlich `pw` (Watt) und `res` (Sekunden je Punkt, ganzzahlig); `normalizeAct` liefert `te: {a: number|null, n: number|null}` und `load: number|null`; `reduceZones(raw): {bounds: number[], secs: number[]} | null` (bounds = untere Grenzen Z1 bis Z5); `zoneTimes(S, maxHr, bounds?)` nutzt `bounds` wenn gegeben.
- Consumes: Garmin-Antworten `…/details` (Schlüssel `directPower`), `…/hrTimeInZones` (Liste mit `zoneLowBoundary`, `secsInZone`), Aktivitätsliste (`aerobicTrainingEffect`, `anaerobicTrainingEffect`, `activityTrainingLoad`). **Schlüsselnamen gegen die echte Antwort prüfen**, die Funktionen sind defensiv.

- [ ] **Step 1: Tests** (1-Hz-Fixture mit 3000 Zeilen bleibt 3000 Punkte; `res` 1; Leistung wird übernommen; `normalizeAct` mit TE; `reduceZones` mit der Fixture 114/141/157/167/175; `zoneTimes` mit `bounds` zählt 160 bpm in Zone 3).
- [ ] **Step 2: Run** `npm test` → neue Tests FAIL.
- [ ] **Step 3: Implement.** `index.ts`: `maxChartSize=4000`, nur die 10 neuesten Aktivitäten hochauflösend, übrige wie bisher 600; je Aktivität `hrTimeInZones` holen und als `a.zones` speichern.
- [ ] **Step 4: Run** `npm test` → alles PASS.

### Task 3: Ansichts-Modell je Einheitstyp (`src/an-session.js`)

**Files:**
- Create: `src/an-session.js`, `test/an-session.test.js`

**Interfaces:**
- Produces: `sessionKind(plan: {k, t, i}, act: {group}|null): "interval"|"station"|"compromise"|"easy"|"bike"|"strength"|"other"`, `anSessionModel({kind, act, d, ivs, zones, prev, forecast}): {headline: {big, label, status}, numbers: [{k, v, unit, tone}], garmin: [{k, v}], datenlage: string, chart: {keys: string[], bands: [], zoneBand: {lo, hi, label}|null}, tabs: string[], rows: {...}}`.
- Consumes: `dashV3`-Ergebnis `d` (`src/dash-v3.js`), `seriesOf` (`src/series.js`).
- Regeln je Typ: **interval** = «x von n Intervallen im Ziel», Zahlen Pace Arbeit, Puls Ø Arbeit, Puls-Drift; **station** = «x von 8 Stationen im Ziel», Zahlen Stationszeit, Kompromiss Ø, Schwächste, Reiter Stationen, kein Diagramm; **compromise** = «x von n Blöcken in Zone 3», Zahlen Pace Läufe, Puls Ø Läufe, Kompromiss-Delta, Diagramm Pace und Puls mit Zielband Zone 3; **easy** = «x % in Zone 2», Zahlen Ø Pace, Ø Puls, Puls-Drift, Reiter Kilometer; **bike** = «x % in Zone 2», Zahlen Ø Leistung, Ø Puls, Entkopplung Leistung zu Puls (erste zu zweiter Hälfte, %), Diagramm Puls, Leistung, Geschwindigkeit, Kadenz, Reiter Abschnitte (10 min).

- [ ] **Step 1: Tests** je Typ: `sessionKind` für «Zone 2 Bike» → `bike`, «Kraft 2 + Compromised Running» → `compromise`, Plan mit Zieltempo → `interval`, `{k:"lauf"}` ohne Zieltempo → `easy`; Modell `easy` mit 87 % Zeit in Zone 2 gibt `headline.big === "87 %"`; Modell `bike` ohne Leistungsreihe lässt Kachel Leistung als `na` mit Grund; Entkopplung 0 % bei gleichmässiger Aktivität.
- [ ] **Step 2: Run** `node --test test/an-session.test.js` → FAIL.
- [ ] **Step 3: Implement** `sessionKind`, `anSessionModel`, `zoneShare(S, bounds, zone): number`, `decoupling(S, key): number|null`.
- [ ] **Step 4: Run** → PASS.

### Task 4: Darstellung und Bedienung (`src/an-ui.js`, `index.html`)

**Files:**
- Modify: `src/an-ui.js` (neu geschrieben auf Basis von Task 1 und 3), `index.html` (`anTabView`, `anVerlaufView`, `anCmpView`, Menü `#msub`, CSS `.an2*`), `sw.js` (Cache-Version)

**Interfaces:**
- Produces: `anChartHtml(key, D, names)` bleibt, `D` bekommt `smooth`, `zoneBand`, `bands`; neu `anSessionHtml(model, ctx)`, `attachAnChart()` mit Pinch, Min/Max, Einrasten.
- Consumes: Task 1 und 3.

- [ ] **Step 1:** Menü: `#msub` enthält «Einheit», «Verlauf», «Vergleich mit Partner» (`data-v="analysis" | "analysisv" | "analysisc"`), sichtbar nur in den drei Ansichten. Kopfzeile zeigt den Ansichtsnamen als Titel, keine Reiterleiste.
- [ ] **Step 2:** `anTabView` ruft `anSessionModel` und `anSessionHtml`; Wähler mit Pfeilen (zentriert), Ergebnis, Prognose-Karte nur bei `|Δ| ≥ 1 s`, Diagramme mit Zeit/Distanz, Glättungsmenü (Regler-Knopf), Cursor-Leiste, Werte im Ausschnitt, Ausschnittsleiste, Reiter, Coach-Block.
- [ ] **Step 3:** Verlauf: Zeitraum-Schalter, Trend mit Achse und Zielline, Wochenumfang, Zonenverteilung, Liste. Blöcke unter 3 Datenpunkten zeigen «Noch zu wenig Daten (n von 3)».
- [ ] **Step 4:** Vergleich: gleicher Stapel mit Partner-Linie.
- [ ] **Step 5: Run** `npm test`, dann Test-Labor (`npm run dev`, Port 8081, `?seed=vergleich&heute=2026-10-13`) und Screenshots bei 390 px.

### Task 5: Abnahme

- [ ] `npm test` grün; `sw.js` Version erhöht; `UI_UX_AUDIT.md` und `docs/analyse-tab-anforderungen.md` nachgeführt; Screenshots der fünf Einheitstypen bei 390 px ohne Abschneidung.
