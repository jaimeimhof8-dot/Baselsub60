# Release-Checkliste (vor jedem Veröffentlichen)

Ziel: Dinge finden, die man auf einem statischen Design-Bild nicht sieht (verdeckte Knöpfe, Inhalt unter der Tab-Leiste, abgeschnittene Texte, hakende Animationen).

## 1. Automatischer Check (2 Minuten)

```bash
npm test
node scripts/serve.js
```

Danach im Browser `http://localhost:8081/?seed=voll&heute=2026-10-13` öffnen, Entwicklerwerkzeuge auf Handygrösse stellen (375×812, dann 320×568) und in der Konsole ausführen:

```js
await new Promise(r => { const s = document.createElement("script"); s.src = "/dev/ux-audit.js"; s.onload = r; document.head.append(s); });
await uxAudit(["today", "week", "plan", "coach", "dashboard", "review", "profile", "analysis", "analysisv", "analysisc"]);
```

Ergebnis: pro Ansicht eine Liste. Leer = gut. Der Check meldet:

| Meldung | Bedeutung |
|---|---|
| Verdeckt | Ein Knopf wird von einem anderen Element überdeckt, der Finger trifft ihn nicht |
| Unter Tab-Leiste | Der letzte Knopf der Seite liegt hinter der unteren Leiste und ist nicht erreichbar |
| Treffer zu klein | Antippbares Element unter 44 px |
| Seitlicher Überlauf | Die Seite ist breiter als der Bildschirm |
| Text abgeschnitten | Text wird ohne Auslassungspunkte abgeschnitten |
| JS-Fehler | Fehler während des Durchlaufs |

Das Ganze mit den Beispielständen `voll`, `leer`, `checkin`, `analyse` und `vergleich` wiederholen (`?seed=NAME`). Leere und überfüllte Zustände sind die häufigsten Stellen, an denen etwas bröckelt.

## 2. Von Hand auf dem echten Handy (5 Minuten)

Der Check sieht keine Animationen und kein Gefühl. Das prüfst du selbst:

- Tab-Wechsel schnell hintereinander antippen: keine Sprünge, kein Flackern.
- Zurück-Geste und Zurück-Knopf: gleiche Richtung der Animation.
- Menü, Sheets und Aufklapper: öffnen und schliessen, ohne dass Inhalt springt.
- Tastatur offen (Coach, Eingaben): Eingabefeld und Senden-Knopf sichtbar.
- Flugmodus: Hinweis erscheint, Einträge bleiben erhalten.
- App in den Hintergrund und zurück: Zustand noch da.
- Kleines und grosses Handy, Hoch- und Querformat.
- Zum Schluss `sw.js` Version hochgezählt?

## 3. Wenn etwas auffällt

Ansicht, Beispielstand und Handygrösse notieren (z. B. «Coach, voll, 320 px») und mit dem Check-Ergebnis zusammen melden. So lässt es sich genau nachstellen.
