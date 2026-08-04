# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "garminconnect>=0.3.2",
#   "curl_cffi",
#   "requests",
#   "typing_extensions",
# ]
# ///
"""
Phase 0 des Spikes zu Issue #38 — Wegwerf-Diagnose, kein Produktionscode.

Beantwortet genau eine Frage: **Kommt der Garmin-Login ohne TLS-Impersonation
durch?** Denn nur das ist im Cloudflare-Worker überhaupt möglich — curl_cffi
gibt es dort nicht.

Zwei getrennte Messungen:

  raw        Hand-gebauter Mobile-Flow mit plain `requests`, ohne jede
             Impersonation, mit vollem HTTP-Logging. Das ist zugleich die
             Spezifikation für die TS-Portierung: Login -> Service-Ticket ->
             DI-Token-Tausch -> displayName.

  strategies Die fuenf Strategien aus garminconnect 0.3.2 einzeln und isoliert
             (frischer Client je Strategie), damit sichtbar wird, welche
             tatsaechlich traegt statt in der Kette verschluckt zu werden.
             Die interne Fingerprint-Rotation wird auf *einen* Versuch
             gestutzt, damit ein Lauf nicht 12 Login-POSTs verbrennt.

Rate-Limit: Garmin limitiert den Login pro IP aggressiv. Jeder Lauf kostet
Budget, das in Phase 3 (Messung aus dem Worker) fehlt. Deshalb ein Versuch je
Strategie und Pausen dazwischen.

Aufruf:
    uv run spike/phase0_login_strategies.py raw        [--real]
    uv run spike/phase0_login_strategies.py strategies [--real]

Ohne --real laeuft alles gegen GARMIN_TEST_EMAIL/-PASSWORD (Konto ohne MFA).
Mit --real gegen GARMIN_EMAIL/-PASSWORD (Konto mit MFA) — dort ist
MFA_REQUIRED das *erwartete* Ergebnis und zaehlt als Erfolg des Login-Schritts.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import sys
import time
from typing import Any

import requests

# -- Konstanten, 1:1 aus garminconnect/client.py uebernommen ---------------

SSO = "https://sso.garmin.com"
CONNECTAPI = "https://connectapi.garmin.com"
DI_TOKEN_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token"
DI_GRANT_TYPE = (
    "https://connectapi.garmin.com/di-oauth2-service/oauth/grant/service_ticket"
)
DI_CLIENT_IDS = (
    "GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2",
    "GARMIN_CONNECT_MOBILE_ANDROID_DI_2024Q4",
    "GARMIN_CONNECT_MOBILE_ANDROID_DI",
    "GARMIN_CONNECT_MOBILE_IOS_DI",
)

IOS_SSO_CLIENT_ID = "GCM_IOS_DARK"
IOS_SERVICE_URL = "https://mobile.integration.garmin.com/gcm/ios"
IOS_LOGIN_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
)

NATIVE_API_USER_AGENT = "GCM-Android-5.23"
NATIVE_X_GARMIN_USER_AGENT = (
    "com.garmin.android.apps.connectmobile/5.23; ; Google/sdk_gphone64_arm64/google; "
    "Android/33; Dalvik/2.1.0"
)

# Header, die verraten, ob Cloudflare eingegriffen hat.
TELLTALE_HEADERS = (
    "cf-ray",
    "cf-mitigated",
    "server",
    "retry-after",
    "x-ratelimit-remaining",
    "set-cookie",
)


def log(msg: str = "") -> None:
    print(msg, file=sys.stderr, flush=True)


def native_headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    headers = {
        "User-Agent": NATIVE_API_USER_AGENT,
        "X-Garmin-User-Agent": NATIVE_X_GARMIN_USER_AGENT,
        "X-Garmin-Paired-App-Version": "10861",
        "X-Garmin-Client-Platform": "Android",
        "X-App-Ver": "10861",
        "X-Lang": "en",
        "X-GCExperience": "GC5",
        "Accept-Language": "en-US,en;q=0.9",
    }
    if extra:
        headers.update(extra)
    return headers


def basic_auth(client_id: str) -> str:
    return "Basic " + base64.b64encode(f"{client_id}:".encode()).decode()


def describe(resp: requests.Response, label: str) -> None:
    """Alles protokollieren, was fuer die Worker-Frage relevant ist."""
    log(f"   {label}: HTTP {resp.status_code} ({len(resp.content)} bytes)")
    for h in TELLTALE_HEADERS:
        if h in resp.headers:
            value = resp.headers[h]
            if h == "set-cookie":
                names = [c.split("=", 1)[0].strip() for c in value.split(",")]
                value = f"[{len(names)} cookies] {', '.join(names[:6])}"
            log(f"     {h}: {value[:160]}")
    ctype = resp.headers.get("content-type", "")
    if "json" not in ctype:
        # Nicht-JSON ist bei sso.garmin.com fast immer eine Cloudflare-Seite.
        log(f"     content-type: {ctype}")
        log(f"     body[:300]: {resp.text[:300]!r}")


def credentials(real: bool) -> tuple[str, str]:
    prefix = "GARMIN" if real else "GARMIN_TEST"
    email = os.environ.get(f"{prefix}_EMAIL")
    password = os.environ.get(f"{prefix}_PASSWORD")
    if not email or not password:
        raise SystemExit(f"{prefix}_EMAIL / {prefix}_PASSWORD nicht gesetzt")
    return email, password


# =========================================================================
#  raw — hand-gebauter Mobile-Flow, plain requests, keine Impersonation
# =========================================================================


def raw_probe(email: str, password: str) -> dict[str, Any]:
    """
    Der Pfad, den ein Worker gehen koennte. Bewusst ohne curl_cffi — auch beim
    DI-Tausch, den garminconnect selbst dann impersoniert, wenn die Login-
    Strategie 'plain' heisst (`Client._http_post`). Genau diese Unehrlichkeit
    wuerde die Messung wertlos machen.
    """
    sess = requests.Session()

    log("== Schritt 1: POST /mobile/api/login (plain requests, iOS-UA)")
    login_params = {
        "clientId": IOS_SSO_CLIENT_ID,
        "locale": "en-US",
        "service": IOS_SERVICE_URL,
    }
    resp = sess.post(
        f"{SSO}/mobile/api/login",
        params=login_params,
        headers={
            "User-Agent": IOS_LOGIN_UA,
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json",
            "Origin": SSO,
        },
        json={
            "username": email,
            "password": password,
            "rememberMe": True,
            "captchaToken": "",
        },
        timeout=30,
    )
    describe(resp, "login")

    if resp.status_code == 429:
        return {"outcome": "429", "step": "login"}

    try:
        body = resp.json()
    except Exception:
        return {"outcome": "non-json", "step": "login", "status": resp.status_code}

    resp_type = body.get("responseStatus", {}).get("type")
    log(f"   responseStatus.type: {resp_type}")

    if resp_type == "MFA_REQUIRED":
        mfa_info = body.get("customerMfaInfo") or {}
        log(f"   customerMfaInfo: {json.dumps(mfa_info)[:200]}")
        log("   -> Login-Schritt hat getragen; MFA waere jetzt Phase 2.")
        cookie_names = sorted(c.name for c in sess.cookies)
        log(f"   Session-Cookies fuer den Resume: {cookie_names}")
        return {"outcome": "mfa_required", "cookies": cookie_names}

    if resp_type != "SUCCESSFUL":
        log(f"   body: {json.dumps(body)[:400]}")
        return {"outcome": "login-failed", "type": resp_type}

    ticket = body["serviceTicketId"]
    log(f"   serviceTicketId: {ticket[:24]}… ({len(ticket)} Zeichen)")

    log()
    log("== Schritt 2: POST diauth /oauth/token (service_ticket-Grant, plain)")
    tokens = None
    for client_id in DI_CLIENT_IDS:
        r = requests.post(
            DI_TOKEN_URL,
            headers=native_headers(
                {
                    "Authorization": basic_auth(client_id),
                    "Accept": "application/json,text/html;q=0.9,*/*;q=0.8",
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Cache-Control": "no-cache",
                }
            ),
            data={
                "client_id": client_id,
                "service_ticket": ticket,
                "grant_type": DI_GRANT_TYPE,
                "service_url": IOS_SERVICE_URL,
            },
            timeout=30,
        )
        describe(r, f"di[{client_id}]")
        if not r.ok:
            continue
        data = r.json()
        tokens = {
            "di_token": data["access_token"],
            "di_refresh_token": data.get("refresh_token"),
            "di_client_id": client_id,
            "expires_in": data.get("expires_in"),
            "scope": data.get("scope"),
        }
        log(f"   -> getauscht mit client_id={client_id}")
        break

    if not tokens:
        return {"outcome": "di-exchange-failed"}

    log()
    log("== Schritt 3: GET /userprofile-service/socialProfile (displayName)")
    r = requests.get(
        f"{CONNECTAPI}/userprofile-service/socialProfile",
        headers=native_headers(
            {
                "Authorization": f"Bearer {tokens['di_token']}",
                "Accept": "application/json",
            }
        ),
        timeout=30,
    )
    describe(r, "profile")
    display_name = r.json().get("displayName") if r.ok else None
    log(f"   displayName: {display_name}")

    return {
        "outcome": "success",
        "display_name": display_name,
        "di_client_id": tokens["di_client_id"],
        "expires_in": tokens["expires_in"],
        "scope": tokens["scope"],
        "has_refresh_token": bool(tokens["di_refresh_token"]),
    }


# =========================================================================
#  strategies — die fuenf Bibliotheks-Strategien, einzeln und isoliert
# =========================================================================


def run_strategies(email: str, password: str, only: set[str] | None = None) -> list[dict[str, Any]]:
    from garminconnect import client as gc_client
    from garminconnect.client import Client, _MFARequired
    from garminconnect.exceptions import (
        GarminConnectAuthenticationError,
        GarminConnectTooManyRequestsError,
    )

    if not gc_client.HAS_CFFI:
        raise SystemExit(
            "curl_cffi ist nicht geladen — die cffi-Strategien wuerden still "
            "uebersprungen und die Messung waere wertlos."
        )

    # Interne Fingerprint-Rotation auf einen Versuch stutzen: sonst kostet ein
    # Lauf bis zu 12 Login-POSTs statt 5.
    gc_client.MOBILE_IMPERSONATIONS = ("safari_ios",)
    gc_client.PORTAL_IMPERSONATIONS = ("safari",)

    strategies = [
        ("1 mobile+cffi", "_mobile_login_cffi"),
        ("2 mobile+requests", "_mobile_login_requests"),
        ("3 widget+cffi", "_widget_web_login"),
        ("4 portal+cffi", "_portal_web_login_cffi"),
        ("5 portal+requests", "_portal_web_login_requests"),
    ]

    if only:
        strategies = [s for s in strategies if s[0][0] in only]

    results: list[dict[str, Any]] = []
    for i, (name, method) in enumerate(strategies):
        if i:
            log()
            log("   … 20 s Pause (nicht wie ein Burst aussehen)")
            time.sleep(20)
        log()
        log(f"== Strategie {name}")
        c = Client()
        started = time.monotonic()
        try:
            getattr(c, method)(email, password)
            outcome = "success" if c.di_token else "success-but-no-di-token"
            detail = f"di_client_id={c.di_client_id} jwt_web={bool(c.jwt_web)}"
        except _MFARequired:
            outcome = "mfa_required"
            detail = f"flow={getattr(c, '_mfa_flow', '?')} method={getattr(c, '_mfa_method', '?')}"
        except GarminConnectTooManyRequestsError as e:
            outcome = "429"
            detail = str(e)[:200]
        except GarminConnectAuthenticationError as e:
            outcome = "auth-error"
            detail = str(e)[:200]
        except Exception as e:  # noqa: BLE001
            outcome = "error"
            detail = f"{type(e).__name__}: {str(e)[:200]}"
        elapsed = time.monotonic() - started
        log(f"   -> {outcome} ({elapsed:.1f}s) {detail}")
        results.append(
            {"strategy": name, "outcome": outcome, "detail": detail, "seconds": round(elapsed, 1)}
        )
    return results


def main() -> None:
    args = sys.argv[1:]
    mode = args[0] if args else "raw"
    real = "--real" in args
    verbose = "--verbose" in args

    if verbose:
        logging.basicConfig(level=logging.DEBUG, stream=sys.stderr)

    email, password = credentials(real)
    konto = "ECHT (mit MFA)" if real else "TEST (ohne MFA)"
    log(f"Konto: {konto} — {email}")
    log(f"Modus: {mode}")
    log()

    if mode == "raw":
        result = raw_probe(email, password)
    elif mode == "strategies":
        picked = [a for a in args[1:] if not a.startswith("--")]
        only = set("".join(picked).replace(",", "")) if picked else None
        result = run_strategies(email, password, only)
    else:
        raise SystemExit(f"Unbekannter Modus: {mode!r} (raw | strategies)")

    log()
    log("== Ergebnis")
    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
