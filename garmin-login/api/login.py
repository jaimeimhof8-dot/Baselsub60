"""Vercel-Funktion: Garmin-Login für die Hyrox-App.

Ablauf (POST /api/login, Header Authorization: Bearer <Supabase-Login-Token>, Body {email, password}):
1. Prüft bei Supabase, dass der Aufrufer ein freigeschaltetes Mitglied ist (is_member) – sonst kein Garmin-Login.
2. Meldet sich mit python-garminconnect bei Garmin an. Garmin akzeptiert Logins nur mit dem TLS-Fingerabdruck der
   Garmin-App; das kann nur diese Bibliothek (curl_cffi), nicht die Supabase Edge Function.
3. Will Garmin einen MFA-Code, schreibt die Funktion {status: "mfa"} in public.garmin_pending (mit dem Token des Nutzers,
   RLS: nur die eigene Zeile) und wartet bis 4 Min., bis die App den Code in dieselbe Zeile schreibt.
4. Gibt die Garmin-Tokens an die App zurück; die App reicht sie an die Edge Function "garmin" (verschlüsselt gespeichert).

Das Passwort wird nirgends gespeichert oder geloggt.
Env: SUPABASE_URL, SUPABASE_ANON_KEY, optional ALLOWED_ORIGINS (kommagetrennt; leer = alle Herkünfte)
"""
import json
import logging
import os
import time
from http.server import BaseHTTPRequestHandler

import requests
from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectTooManyRequestsError,
)

SB_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SB_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
# Bibliotheks-Logs stumm: Fehlermeldungen von Garmin-Seiten sollen nie im Vercel-Log landen.
logging.getLogger("garminconnect").setLevel(logging.CRITICAL)
logging.getLogger().setLevel(logging.CRITICAL)

MFA_WAIT = 240  # Sekunden; die Funktion darf 300 s laufen (vercel.json)


class Fail(Exception):
    def __init__(self, code: str, status: int):
        super().__init__(code)
        self.code, self.status = code, status


def sb(method: str, path: str, jwt: str, **kw):
    h = {"apikey": SB_KEY, "Authorization": "Bearer " + jwt, "Content-Type": "application/json"}
    h.update(kw.pop("headers", {}))
    return requests.request(method, SB_URL + path, headers=h, timeout=15, **kw)


def member(jwt: str) -> str:
    """User-ID des angemeldeten Mitglieds, sonst Fail."""
    r = sb("POST", "/rest/v1/rpc/is_member", jwt, json={})
    if r.status_code != 200 or r.json() is not True:
        raise Fail("forbidden", 403)
    u = sb("GET", "/auth/v1/user", jwt)
    uid = u.json().get("id") if u.status_code == 200 else None
    if not uid:
        raise Fail("forbidden", 403)
    return uid


def pending(jwt: str, uid: str, status: str | None):
    """Zeile in garmin_pending setzen (status) oder löschen (None)."""
    sb("DELETE", f"/rest/v1/garmin_pending?user_id=eq.{uid}", jwt)
    if status:
        sb("POST", "/rest/v1/garmin_pending", jwt, json={"user_id": uid, "status": status},
           headers={"Prefer": "return=minimal"})


def wait_code(jwt: str, uid: str) -> str:
    pending(jwt, uid, "mfa")
    end = time.time() + MFA_WAIT
    while time.time() < end:
        time.sleep(1.5)
        r = sb("GET", f"/rest/v1/garmin_pending?user_id=eq.{uid}&select=code,status", jwt)
        rows = r.json() if r.status_code == 200 else []
        if not rows:
            raise Fail("mfa_cancelled", 400)
        code = (rows[0].get("code") or "").strip()
        if code:
            return code
    raise Fail("mfa_timeout", 408)


def login(jwt: str, email: str, password: str) -> dict:
    uid = member(jwt)
    try:
        g = Garmin(email, password, prompt_mfa=lambda: wait_code(jwt, uid))
        g.login()
        return {"tokens": json.loads(g.client.dumps()), "name": getattr(g, "full_name", None) or getattr(g, "display_name", None)}
    except Fail:
        raise
    except GarminConnectTooManyRequestsError:
        raise Fail("rate", 429)
    except GarminConnectAuthenticationError as e:
        msg = str(e).lower()
        raise Fail("mfa_wrong" if "mfa" in msg else "credentials", 401)
    except GarminConnectConnectionError as e:
        raise Fail("rate" if "429" in str(e) else "garmin_down", 502)
    except Exception:  # noqa: BLE001 – keine Details (könnten Zugangsdaten enthalten) nach aussen
        raise Fail("garmin_down", 502)
    finally:
        try:
            pending(jwt, uid, None)
        except Exception:  # noqa: BLE001
            pass


class handler(BaseHTTPRequestHandler):
    def _cors(self):
        # Jede Herkunft erlaubt: geschützt wird über das Supabase-Login-Token (Bearer, keine Cookies), nicht über CORS.
        # ALLOWED_ORIGINS schränkt optional ein (leer = alle).
        origin = self.headers.get("Origin", "")
        if origin and (not ORIGINS or origin in ORIGINS):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def _json(self, status: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if not SB_URL or not SB_KEY:
            return self._json(500, {"error": "no_config"})
        auth = self.headers.get("Authorization", "")
        jwt = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
        try:
            n = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(min(n, 10000)) or b"{}")
        except Exception:  # noqa: BLE001
            body = {}
        email, password = str(body.get("email", "")).strip(), str(body.get("password", ""))
        if not jwt:
            return self._json(401, {"error": "forbidden"})
        if not email or not password or len(email) > 200 or len(password) > 200:
            return self._json(400, {"error": "bad_request"})
        try:
            return self._json(200, login(jwt, email, password))
        except Fail as f:
            return self._json(f.status, {"error": f.code})

    def log_message(self, *args):  # keine Request-Logs (enthalten nichts Geheimes, aber unnötig)
        pass
