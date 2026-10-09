# Login & Datenbank einrichten (einmalig, ca. 10 Minuten)

Ohne diese Schritte läuft die App wie bisher nur lokal auf dem Gerät.

## 1. Supabase-Projekt anlegen
1. Auf https://supabase.com mit GitHub oder E-Mail registrieren (gratis).
2. **New project**: Name `basel-sub60`, Region **Central EU (Frankfurt)**, Datenbank-Passwort generieren lassen (wird nicht gebraucht).

## 2. Datenbank-Tabellen erstellen
1. In `supabase/schema.sql` die Zeile `JIMOH-EMAIL-HIER-EINTRAGEN` durch Jimohs E-Mail ersetzen.
2. In Supabase links **SQL Editor** → Inhalt von `schema.sql` einfügen → **Run**.

## 3. E-Mail mit Code statt Link
Unter **Authentication → Emails → Templates** bei **Magic Link** *und* **Confirm signup** den Text ersetzen durch:

```
<h2>Dein Code für Basel Sub-60</h2>
<p style="font-size:28px;letter-spacing:4px"><b>{{ .Token }}</b></p>
```

## 4. Zugang in die App eintragen
Unter **Project Settings → API** die **Project URL** und den **anon public** Key kopieren und in `config.js` eintragen.

## 5. Anmelden
App öffnen → E-Mail eingeben → Code aus dem Mail eintippen. Nur die zwei E-Mails aus `schema.sql` kommen rein, jeder sieht nur seine eigenen Daten.

Bei der ersten Anmeldung fragt die App, ob die bisherigen Einträge auf dem Handy übernommen werden sollen. Beim eigenen Handy: **Ja**.

## Hinweise
- **Pausieren:** Gratis-Projekte pausieren nach 7 Tagen ohne Nutzung. Mit täglichem Training passiert das nicht, sonst im Dashboard auf „Restore“ klicken.
- **E-Mail-Limit:** Supabase verschickt mit dem eingebauten Mailserver nur wenige Mails pro Stunde. Für zwei Leute reicht das.
- **Fremde Anmeldungen:** Fremde können zwar ein Konto anlegen, sehen aber nichts. Wer das ganz ausschliessen will: nach der ersten Anmeldung von beiden unter **Authentication → Sign In / Providers** die Option „Allow new users to sign up“ ausschalten.
