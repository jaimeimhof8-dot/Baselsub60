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

# Garmin verbinden (optional, ca. 15 Minuten)

Garmin und Strava gehen gleichzeitig, beide im Tab **Strava / Garmin**. Dieselbe Einheit zählt nur einmal: Kommt ein Lauf über beide Wege, behält die App die Garmin-Version. Garmin liefert zusätzlich **HRV, Schlaf, Body Battery, Training Readiness und Ruhepuls**. Ist die Erholung schlecht und steht heute eine harte Einheit an, schlägt die App „entlasten“ vor. Ein eigener Check-in hat Vorrang.

**Inoffiziell:** Garmin hat keine API für Privatpersonen. Die App nutzt deshalb denselben Weg wie die Garmin-Connect-App (über `python-garminconnect`). Garmin kann das jederzeit ändern. Strava und der Datei-Import bleiben deshalb bestehen.

**Warum der Login am PC passiert:** Seit März 2026 blockiert Garmin Logins aus Rechenzentren. Deshalb meldet sich jeder einmal auf dem eigenen PC an. Hochgeladen wird nur die Token-Datei, nie das Passwort. Die Tokens liegen AES-verschlüsselt in `garmin_tokens`, ohne Zugriff aus der App. Die Edge Function `garmin` erneuert sie und holt die Daten.

## Einrichten (einmalig, durch den Admin)
1. `schema.sql` nochmals im SQL Editor ausführen. Das legt die Tabelle `garmin_tokens` an.
2. Zwei zufällige Werte erzeugen, z. B. mit `openssl rand -hex 32` oder einem Passwort-Generator mit 40 oder mehr Zeichen. Dann setzen und deployen (im Ordner `app/`):
   ```
   npx supabase secrets set GARMIN_TOKEN_KEY=<zufällig-1> GARMIN_CRON_SECRET=<zufällig-2>
   npx supabase functions deploy garmin --no-verify-jwt
   ```
   **`GARMIN_TOKEN_KEY` nie ändern.** Sonst lassen sich die gespeicherten Tokens nicht mehr entschlüsseln, und alle müssen ihre Datei neu hochladen.
3. `supabase/garmin-cron.sql` öffnen, `<GARMIN_CRON_SECRET>` durch den zweiten Wert ersetzen und im SQL Editor ausführen. Der Cron erneuert alle 6 Stunden die Tokens. Ohne ihn verfällt die Verbindung, wenn jemand 30 Tage die App nicht öffnet.

## Login-Server auf Vercel (einmalig, durch den Admin)
Damit sich jeder direkt in der App mit Garmin-E-Mail und Passwort anmelden kann, läuft der Login auf einem kleinen Python-Server (Ordner `garmin-login/`, gratis auf Vercel). Er prüft, dass der Aufrufer ein Mitglied der App ist, meldet sich bei Garmin an und gibt nur die Tokens zurück. Das Passwort wird nicht gespeichert. Verlangt Garmin einen Bestätigungscode, zeigt die App ein Code-Feld (Tabelle `garmin_pending`).

1. `npx vercel login` (mit GitHub).
2. Im Ordner `app/garmin-login/`:
   ```
   npx vercel link --yes --project hyrox-garmin-login
   npx vercel env add SUPABASE_URL production        # https://mwhbjrulzxiwtjvcwojo.supabase.co
   npx vercel env add SUPABASE_ANON_KEY production   # derselbe Key wie in config.js
   npx vercel deploy --prod
   ```
3. Die Adresse `https://<projekt>.vercel.app/api/login` in `config.js` bei `garminLoginUrl` eintragen.
4. Falls die App „Login-Server nicht erreichbar“ meldet: unter Vercel → Projekt → Settings → **Deployment Protection** die „Vercel Authentication“ für Production ausschalten.

Getestet am 13.10.2026: Der Login von Vercel klappt (Garmin blockiert dort die Mobile-Variante mit 429, die Bibliothek weicht automatisch auf eine andere aus). Die Anmeldung dauert deshalb rund 10 Sekunden. Klappt es nicht („Garmin blockiert die Anmeldung“), bleibt in der App die Alternative mit Login am PC und Datei-Upload (unten).

## Verbinden (jeder Nutzer selbst)
In der App: Menü → **Strava / Garmin** → Garmin-E-Mail und Passwort eingeben → **Mit Garmin anmelden**. Kommt ein Code per Mail, SMS oder Authenticator, diesen eingeben.

### Alternative: Login am PC und Datei hochladen
1. In der App: Menü → **Strava / Garmin** → „Anmeldung klappt nicht?“ öffnen. Die Schritte stehen auch dort.
2. Einmalig **uv** installieren:
   - Windows (PowerShell): `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
   - Mac: `curl -LsSf https://astral.sh/uv/install.sh | sh`
3. Terminal neu öffnen und den Befehl aus der App ausführen (**Kopieren**), z. B. `uv run "https://<deine-app>/garmin-login.py"`. Dann Garmin-E-Mail, Passwort und ggf. den MFA-Code eingeben. Das Skript speichert `garmin_tokens.json` im aktuellen Ordner.
4. In der App **garmin_tokens.json hochladen**, dann die Datei auf dem PC löschen. Die App erneuert die Tokens sofort, dadurch wird die Kopie auf dem PC ungültig.

Die Verbindung gilt danach auf allen Geräten dieses Kontos. **Trennen** löscht die Tokens vom Server.

Meldet die App „Garmin hat den Zugang abgelehnt“, die Schritte 3 und 4 wiederholen. Das passiert, wenn das Garmin-Passwort geändert, der Zugriff in Garmin widerrufen oder der Cron 30 Tage nicht gelaufen ist.

**Nicht gleichzeitig mit garmin_mcp oder anderen Tools dieselbe Datei verwenden:** Die Tokens rotieren bei jeder Erneuerung. Wer Garmin zusätzlich in Claude nutzt, meldet sich dort separat an.

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
