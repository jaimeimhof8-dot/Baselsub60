# Gewichtsvorschlag und Gewichte pro Satz

## Was vorher passierte (Prüfung)
- Gespeichert wurde **ein Textwert pro Übung** (`S.val["datum|zeile"]`, z. B. `"80 kg"`), ohne Satzzahl und Wiederholungen.
- Der Vorschlag kam aus `lastEntry()` (index.html): letzter Eintrag derselben Übung, egal mit welchem Satzschema.
  `nextWeight()` (src/weights.js) rechnete nur nach RPE: ≤7 → +2,5 kg, ≥9 → −2,5 kg, sonst gleich.
- Zusätzlich übernahm das Gewichts-Sheet beim Öffnen das **letzte Gewicht als Vorbelegung** und speicherte es bei „Übernehmen“.
- **Fehler:** 3×5 mit 80 kg gestern → heute 2×8 → Vorschlag 80 kg (oder 82,5). Bei 8 Wiederholungen ist das deutlich zu schwer.
  `src/progression.js` existierte nicht, die Logik lag in `weights.js` und index.html.

## Was jetzt gilt (Korrektur von Jaime: keine Umrechnung)
1. **Satz-Struktur** (`parseSets`/`formatSets`, weights.js): weiterhin ein Text pro Übung, daher bleiben alte Werte, Backups und Import gültig.
   `"80 kg"` = ein Wert für alle Sätze (Standard), `"80 kg × 5 / 85 kg × 5 / 85 kg × 3"` = je Satz Gewicht und Wiederholungen.
   `parseKg` liefert weiter das schwerste Gewicht, alle bisherigen Leser funktionieren unverändert.
2. **Vergleichbar** (`comparable`, progression.js) heisst: gleiche Übung und **gleiche Sätze×Wiederholungen** (3×5 gegen 3×5; bei einem Plan-Bereich wie 3×6–8 zählt jede Wdh. darin). Der Arbeitssatz ist der schwerste Satz. Dann gilt die bisherige RPE-Regel (≤7 +2,5 kg, ≥9 −2,5 kg). Eine ältere vergleichbare Einheit (max. 8 Wochen) wird mit herangezogen.
3. **Keine vergleichbare Einheit → kein Vorschlag, keine Umrechnung** (kein 1RM, kein Epley). Es erscheint nur der getrennte Hinweis „letztes Mal anders: 3×5 mit 80 kg“.
4. **Fehlende Daten → kein Wert**, nur ein Hinweis („Noch kein Gewicht … eintragen“, „Wiederholungen unbekannt“, „im Plan kein Satzschema“).
5. Das Gewichts-Sheet belegt Felder nie mit dem Gewicht der letzten Einheit vor (nur mit eingetragenem oder geplantem Gewicht).

## Grenzen
- Wer das Schema wechselt (3×5 → 2×8), bekommt bewusst keinen Wert und muss selbst entscheiden.
- Die RPE gilt für die ganze Einheit, nicht je Übung.
- Ohne eingetragene Wiederholungen wird der Plan als gemacht angenommen (untere Grenze des Bereichs).
- Schwellen (0 Toleranz, 8 Wochen) sind Konstanten oben in `src/progression.js`.
- Pro-Satz-Eingabe gibt es im Gewichts-Sheet nach der Einheit. Liste und Fokusmodus haben weiter ein Feld; dort ist pro Satz nur per Text („80/85/85“) möglich, die ±-Tasten verschieben alle Sätze gleich.
- Zurück auf „ein Wert für alle“ übernimmt den schwersten Satz (mit Hinweis, Unterschiede gehen verloren).
