# Gewichtsvorschlag und Gewichte pro Satz

## Was vorher passierte (Prüfung)
- Gespeichert wurde **ein Textwert pro Übung** (`S.val["datum|zeile"]`, z. B. `"80 kg"`), ohne Satzzahl und Wiederholungen.
- Der Vorschlag kam aus `lastEntry()` (index.html): letzter Eintrag derselben Übung, egal mit welchem Satzschema.
  `nextWeight()` (src/weights.js) rechnete nur nach RPE: ≤7 → +2,5 kg, ≥9 → −2,5 kg, sonst gleich.
- Zusätzlich übernahm das Gewichts-Sheet beim Öffnen das **letzte Gewicht als Vorbelegung** und speicherte es bei „Übernehmen“.
- **Fehler:** 3×5 mit 80 kg gestern → heute 2×8 → Vorschlag 80 kg (oder 82,5). Bei 8 Wiederholungen ist das deutlich zu schwer.
  `src/progression.js` existierte nicht, die Logik lag in `weights.js` und index.html.

## Was jetzt gilt
1. **Satz-Struktur** (`parseSets`/`formatSets`, weights.js): weiterhin ein Text pro Übung, daher bleiben alte Werte, Backups und Import gültig.
   `"80 kg"` = ein Wert für alle Sätze (Standard), `"80 kg × 5 / 85 kg × 5 / 85 kg × 3"` = je Satz Gewicht und Wiederholungen.
   `parseKg` liefert weiter das schwerste Gewicht, alle bisherigen Leser funktionieren unverändert.
2. **Vergleichbar** (`comparable`, progression.js): Arbeitssatz (schwerster Satz) hat Wdh. im Soll-Bereich ±1 und Satzzahl ±1.
   Dann gilt die bisherige RPE-Regel. Eine ältere vergleichbare Einheit (max. 8 Wochen) schlägt eine Umrechnung.
3. **Nicht vergleichbar → Schätzung** über 1RM nach Epley: `1RM = kg × (1 + Wdh/30)`, Zielgewicht = `1RM / (1 + Ziel-Wdh/30)`, gerundet auf 2,5 kg.
   Ziel-Wdh = Obergrenze des Plan-Bereichs. Entlastung (RPE 5 im Plan) −10 %.
4. **Fehlende Daten → kein Wert**, nur Hinweis („Noch kein Gewicht … eintragen“, „Wiederholungen unbekannt“, „über 12 Wdh. zu ungenau“, „im Plan kein Satzschema“).
5. Anzeige mit Herkunft: „letztes Mal 3×5 mit 80 kg, Schätzung für 2×8: 72.5 kg“. Das Sheet belegt Felder nie mehr mit dem letzten Gewicht vor.

## Grenzen (ehrlich)
- Epley ist eine Faustformel, ±5–10 % Abweichung sind normal, ab ca. 10–12 Wdh. wird sie unzuverlässig (dort: kein Vorschlag).
- Die RPE gilt für die ganze Einheit, nicht je Übung. Sie fliesst nur in die Progression bei gleicher Struktur ein, nicht in die Umrechnung.
- Ohne eingetragene Wiederholungen wird der Plan als gemacht angenommen (untere Grenze des Bereichs).
- Schwellen (±1 Wdh., ±1 Satz, 8 Wochen, max. 12 Wdh.) sind Annahmen, Konstanten oben in `src/progression.js`.
- Pro-Satz-Eingabe gibt es im Gewichts-Sheet nach der Einheit. Liste und Fokusmodus haben weiter ein Feld; dort ist pro Satz nur per Text („80/85/85“) möglich, die ±-Tasten verschieben alle Sätze gleich.
- Zurück auf „ein Wert für alle“ übernimmt den schwersten Satz (mit Hinweis, Unterschiede gehen verloren).
