# /// script
# requires-python = ">=3.12"
# dependencies = ["garminconnect==0.3.17"]
# ///
"""Einmaliger Garmin-Login für die Hyrox-App.

Meldet dich mit deinem Garmin-Konto an (E-Mail, Passwort, ggf. MFA-Code) und speichert die Zugangs-Tokens
in garmin_tokens.json im aktuellen Ordner. Diese Datei lädst du danach in der App hoch (Menü → Strava / Garmin).
Dein Passwort wird nirgends gespeichert und verlässt diesen PC nur Richtung Garmin.

Start:  uv run <App-Adresse>/garmin-login.py
"""
import getpass
import os
import sys

from garminconnect import Garmin


def main() -> None:
    print("Garmin-Login für die Hyrox-App\n")
    email = input("Garmin E-Mail: ").strip()
    password = getpass.getpass("Garmin Passwort (Eingabe unsichtbar): ")
    g = Garmin(email, password, prompt_mfa=lambda: input("MFA-Code aus Mail/App: ").strip())
    try:
        g.login()
    except Exception as e:  # noqa: BLE001 – verständliche Meldung statt Traceback
        print(f"\nLogin fehlgeschlagen: {e}\nE-Mail/Passwort prüfen und in ein paar Minuten nochmals versuchen.")
        sys.exit(1)
    path = os.path.abspath("garmin_tokens.json")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(g.client.dumps())
    print(f"\nFertig. Datei gespeichert: {path}")
    print("Jetzt in der App unter Strava / Garmin → „Token-Datei hochladen“ wählen und die Datei danach löschen.")


if __name__ == "__main__":
    main()
