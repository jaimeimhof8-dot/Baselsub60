# Login & Datenbank einrichten (einmalig, ca. 10 Minuten)

Ohne diese Schritte läuft die App wie bisher nur lokal auf dem Gerät.

## 1. Supabase-Projekt anlegen
1. Auf https://supabase.com mit GitHub oder E-Mail registrieren (gratis).
2. **New project**: Name `basel-sub60`, Region **Central EU (Frankfurt)**, Datenbank-Passwort generieren lassen (wird nicht gebraucht).

## 2. Datenbank-Tabellen erstellen
1. In `supabase/schema.sql` die Zeile `JIMOH-EMAIL-HIER-EINTRAGEN` durch Jimohs E-Mail ersetzen.
2. In Supabase links **SQL Editor** → Inhalt von `schema.sql` einfügen → **Run**.

## 3. Konten mit Passwort anlegen
Unter **Authentication → Users → Add user → Create new user** für beide E-Mails aus `schema.sql` ein Konto mit Passwort anlegen und **Auto Confirm User** anhaken. Danach unter **Authentication → Sign In / Providers** die Option „Allow new users to sign up“ ausschalten. Es braucht keine Mails.

**Test-Konto:** `test@gmail.com` steht in `schema.sql` im eigenen Team `test`. Es sieht Jaime und Jimoh nicht und erscheint bei ihnen nicht als Partner. Zum Testen genauso wie oben ein Konto mit Passwort anlegen (Auto Confirm User). Meldet die App „Diese E-Mail ist für die App nicht freigeschaltet“, fehlt die E-Mail in `public.members`: `schema.sql` nochmals ausführen.

## 4. Zugang in die App eintragen
Unter **Project Settings → API** die **Project URL** und den **anon public** Key kopieren und in `config.js` eintragen.

## 5. Anmelden
App öffnen → E-Mail und Passwort eingeben → **Anmelden**. Nur die zwei E-Mails aus `schema.sql` kommen rein, jeder sieht nur seine eigenen Daten.

**Datentrennung:** Die Datenbank selbst (Row Level Security) liefert jedem Konto nur die eigene Zeile aus `plan_state`. Das gilt auch, wenn jemand den öffentlichen anon-Key direkt benutzt. Die Mitgliederliste ist aus der App nicht lesbar, die App bekommt über `team()` nur die beiden Namen. Auf dem Gerät liegen Plan-Stand und Strava-Verbindung pro Konto getrennt. Beim Abmelden werden sie vom Gerät gelöscht, sofern alles in der Cloud gespeichert ist. Läuft eine Anmeldung ab, schickt die App zurück zum Login.

Wer `schema.sql` schon einmal ausgeführt hat, führt die neue Version einfach nochmals aus. Sie ist dafür ausgelegt.

Bei der ersten Anmeldung fragt die App, ob die bisherigen Einträge auf dem Handy übernommen werden sollen. Beim eigenen Handy: **Ja**.

## Hinweise
- **Pausieren:** Gratis-Projekte pausieren nach 7 Tagen ohne Nutzung. Mit täglichem Training passiert das nicht, sonst im Dashboard auf „Restore“ klicken.
- **Fremde Anmeldungen:** Ist „Allow new users to sign up“ ausgeschaltet (Schritt 3), kann niemand sonst ein Konto anlegen. Auch mit Konto sähe ein Fremder nichts, solange seine E-Mail nicht in `schema.sql` steht.
- **Passwort vergessen:** Im Dashboard unter **Authentication → Users** beim Konto ein neues Passwort setzen.

# Strava verbinden (optional, ca. 10 Minuten)

Der Token-Tausch läuft über die Supabase Edge Function `strava`. Client-ID und Client-Secret liegen nur auf dem Server, nie im Browser. Im Browser bleiben nur das Access- und das Refresh-Token; ohne Secret kann damit niemand neue Tokens holen.

1. Auf https://www.strava.com/settings/api eine API-App anlegen. **Authorization Callback Domain** = Domain, auf der die App läuft (z. B. `deinname.github.io`, lokal `localhost`).
2. Supabase CLI verbinden (falls noch nicht, siehe Coach-Chat unten): `npx supabase login` und `npx supabase link --project-ref <Projekt-ID>` (im Ordner `app/`).
3. Secrets setzen und Funktion deployen:
   ```
   npx supabase secrets set STRAVA_CLIENT_ID=12345 STRAVA_CLIENT_SECRET=dein-secret
   npx supabase functions deploy strava --no-verify-jwt
   ```
   `--no-verify-jwt` ist nötig wie beim Coach: Die Funktion prüft selbst, ob der Aufrufer ein freigeschaltetes Mitglied ist (`is_member()`).
4. In der App: Menü → **Strava** → **Mit Strava verbinden**. Es gibt kein Secret-Feld mehr.

Wer Strava schon vorher verbunden hatte: Die Verbindung bleibt bestehen, das alte Secret wird beim nächsten Login vom Gerät gelöscht. Damit das Token weiter erneuert werden kann, muss `STRAVA_CLIENT_ID` dieselbe Strava-API-App sein wie bisher.

Ohne Cloud (Vorschau-Modus) gibt es zum Ausprobieren weiterhin die Eingabe von Client-ID und Secret direkt in der App. Das Secret liegt dann im Browser-Speicher dieses Geräts.

Ohne API-App geht es auch per Datei: Strava → Einstellungen → Mein Konto → Account-Daten herunterladen → aus dem ZIP `activities.csv` in der App importieren.

# Coach-Chat einrichten (optional, ca. 10 Minuten)

Der Coach-Chat (Menü → Coach-Chat) schickt deinen Plan der nächsten drei Wochen, die letzten 7 Tage und deine Nachricht an die Supabase Edge Function `coach`. Diese fragt Claude (`claude-opus-5-5`) und gibt Vorschläge zurück (tauschen, entlasten, ausfallen lassen, Übungen ändern). Die App prüft jeden Vorschlag und wendet ihn erst an, wenn du **Übernehmen** tippst. Vergangene Tage und den Renntag kann der Coach nicht ändern.

1. API-Key auf https://platform.claude.com erstellen. Jede Nachricht kostet ein paar Rappen.
2. Supabase CLI installieren und mit dem Projekt verbinden: `npx supabase login`, dann `npx supabase link --project-ref <Projekt-ID>` (im Ordner `app/`).
3. Key als Secret hinterlegen: `npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`. **Nie** in `config.js` eintragen.
4. Funktion hochladen: `npx supabase functions deploy coach --no-verify-jwt`. Der Zusatz ist nötig, weil das Projekt die neuen API-Keys nutzt. Die Funktion prüft das Login selbst und antwortet nur Mitgliedern aus `schema.sql`.
5. Testen: In der App Menü → Coach → Chat, eine Nachricht senden. Steht dort „Der Coach ist noch nicht eingerichtet“, fehlt Schritt 4. Steht „Auf dem Server fehlt der Claude-API-Key“, fehlt Schritt 3.

Die Funktion antwortet nur angemeldeten Mitgliedern aus `schema.sql`. Ohne Cloud-Login bereitet die App die Anfrage nur vor („Anfrage kopieren“). Für Antworten, die abgelehnt würden, ist der automatische Fallback der API eingeschaltet (`fallbacks: "default"`).

# Backup

Menü → Backup → **Export Backup** lädt eine `.json`-Datei herunter. **Import Backup** zeigt vor dem Überschreiben, was in der Datei steckt. Ältere Text-Backups funktionieren auch.

# Testen mit simuliertem Datum

`index.html?heute=2026-10-20` öffnet die App, als wäre heute der 20.10.2026 (gelber Balken oben). Praktisch, um Check-in, Vorschläge und Strava-Abgleich vor dem Planstart auszuprobieren.

# Lokal starten

`npm run dev` → http://localhost:8080 (ES-Module funktionieren nicht über `file://`). Tests: `npm test`.
