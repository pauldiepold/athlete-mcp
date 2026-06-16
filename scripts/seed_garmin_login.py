# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "garminconnect>=0.2.19",
# ]
# ///
"""
Garmin-Seed-Login fürs Onboarding-CLI (Issue #8) — HITL.

Macht NUR den einmaligen Login (Passwort + interaktiver MFA-Code) und gibt das
DI-Token-Bündel plus displayName als JSON auf **stdout** aus. Alle menschlichen
Ein-/Ausgaben (Prompts, Status) laufen über **stderr**, damit stdout sauberes
JSON bleibt, das der TS-Orchestrator parst.

Nutzt `garminconnect` (denselben Pfad wie der funktionierende Spike #4) — der
einzige im Spike zuverlässige Weg durch Cloudflare/429. Garmin rate-limitet den
Login aggressiv: einzelne 429 sind normal, deshalb wird mit Backoff mehrfach
versucht, statt sofort abzubrechen. `client.dumps()` liefert das Bündel direkt
(`di_token`, `di_refresh_token`, `di_client_id`) — siehe
src/garmin/docs/garmin-connect-api.md.

Aufruf (vom CLI):
    uv run scripts/seed_garmin_login.py
    # Env: GARMIN_EMAIL / GARMIN_PASSWORD optional, sonst interaktiv.
"""

from __future__ import annotations

import json
import os
import sys
import time
from getpass import getpass

from garminconnect import Garmin

# Garmin/Cloudflare 429t den Login aggressiv; mehrere Anläufe mit Backoff.
MAX_ATTEMPTS = 8


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def ask(prompt: str) -> str:
    """Wie input(), aber der Prompt geht auf stderr — stdout bleibt sauberes JSON."""
    print(prompt, end="", file=sys.stderr, flush=True)
    return input().strip()


def is_rate_limit(exc: Exception) -> bool:
    msg = str(exc)
    return "429" in msg or "Too Many Requests" in msg


def login_with_retry(email: str, password: str):
    """
    Initialer Login (Schritt 1: Credentials → MFA-Mail). Einzelne 429 werden
    toleriert: Info loggen, kurz warten, frischen Client, erneut versuchen.
    Liefert (garmin, result) — result ist ("needs_mfa", state) oder Erfolg.
    """
    for attempt in range(1, MAX_ATTEMPTS + 1):
        garmin = Garmin(email=email, password=password, return_on_mfa=True)
        try:
            result = garmin.login()
            return garmin, result
        except Exception as exc:  # noqa: BLE001 - 429 tolerieren, Rest durchreichen
            if is_rate_limit(exc) and attempt < MAX_ATTEMPTS:
                wait = min(60, 5 * attempt)
                log(
                    f">> 429 Rate-Limit (Versuch {attempt}/{MAX_ATTEMPTS}) — "
                    f"warte {wait}s und versuche erneut … "
                    f"(eine Login-Mail kann trotzdem schon unterwegs sein)"
                )
                time.sleep(wait)
                continue
            raise


def resume_with_retry(garmin: Garmin, state, code: str) -> None:
    """Schritt 2: MFA-Code einlösen. Auch hier 429 tolerieren (Code bleibt gültig)."""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            garmin.resume_login(state, code)
            return
        except Exception as exc:  # noqa: BLE001
            if is_rate_limit(exc) and attempt < MAX_ATTEMPTS:
                wait = min(60, 5 * attempt)
                log(
                    f">> 429 beim MFA-Einlösen (Versuch {attempt}/{MAX_ATTEMPTS}) — "
                    f"warte {wait}s und versuche erneut …"
                )
                time.sleep(wait)
                continue
            raise


def resolve_display_name(garmin: Garmin) -> str:
    """
    displayName (für den Sleep-Endpoint-Pfad nötig). `garmin.display_name` ist je
    nach Login-Pfad nicht gesetzt; verlässlich ist der Social-Profile-Endpoint,
    den der Spike schon nutzte (authentifizierter Call nach erfolgtem Login).
    """
    name = getattr(garmin, "display_name", None)
    if name:
        return name
    profile = garmin.connectapi("/userprofile-service/socialProfile")
    if isinstance(profile, dict) and profile.get("displayName"):
        return profile["displayName"]
    raise RuntimeError("displayName konnte nicht ermittelt werden")


def main() -> None:
    email = os.environ.get("GARMIN_EMAIL") or ask("Garmin Email: ")
    password = os.environ.get("GARMIN_PASSWORD") or getpass("Garmin Passwort: ")

    log(f">> Garmin-Login {email} via garminconnect …")
    garmin, result = login_with_retry(email, password)

    if isinstance(result, tuple) and result[0] == "needs_mfa":
        code = ask("Garmin MFA-Code: ")
        resume_with_retry(garmin, result[1], code)
    log(">> Login ok.")

    # client.dumps() liefert das DI-Bündel direkt: di_token/di_refresh_token/di_client_id.
    bundle = json.loads(garmin.client.dumps())

    display_name = resolve_display_name(garmin)
    log(f">> displayName: {display_name}")

    out = {
        "di_token": bundle["di_token"],
        "di_refresh_token": bundle["di_refresh_token"],
        "di_client_id": bundle["di_client_id"],
        "display_name": display_name,
    }
    # Sauberes JSON exklusiv auf stdout — der TS-Orchestrator liest genau das.
    json.dump(out, sys.stdout)
    sys.stdout.flush()


if __name__ == "__main__":
    main()
