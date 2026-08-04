# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "curl_cffi",
#   "requests",
#   "typing_extensions",
# ]
# ///
"""
Phase 0, Kernexperiment — Wegwerf-Diagnose zu Issue #38.

Der Widget-Flow ist der einzige Login-Pfad, der aktuell traegt (Strategie 3 der
garminconnect-Kette). In der Bibliothek existiert er nur *mit* curl_cffi. Die
Frage des Spikes ist aber, ob er auch **ohne TLS-Impersonation** durchkommt —
denn nur das kann ein Cloudflare-Worker.

Dieses Skript baut den Flow von Hand nach und macht den Transport waehlbar:

    uv run spike/phase0_widget.py plain     # keine Impersonation
    uv run spike/phase0_widget.py chrome    # curl_cffi, wie die Bibliothek

Damit der Vergleich ehrlich ist, sendet die Plain-Variante **dieselben
Browser-Header** wie die Impersonation. curl_cffi setzt Header *und* TLS-
Fingerprint; wuerde man plain mit `python-requests/2.x` als User-Agent
losschicken, maesse man den Header-Unterschied statt des Fingerprints.
Uebrig bleibt als einzige Variable: TLS/HTTP2-Fingerprint.

Der komplette Pfad wird gegangen — Embed -> CSRF -> Signin -> Service-Ticket ->
DI-Token-Tausch -> displayName —, damit nicht nur der Login gemessen wird,
sondern jeder Schritt, den ein Worker gehen muesste.
"""

from __future__ import annotations

import json
import os
import random
import re
import sys
import time

SSO_BASE = "https://sso.garmin.com/sso"
SSO_EMBED = f"{SSO_BASE}/embed"
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

# Was curl_cffi bei impersonate="chrome" ohnehin mitschickt — hier explizit,
# damit die Plain-Variante headerseitig nicht schlechter dasteht.
CHROME_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "Upgrade-Insecure-Requests": "1",
}

NATIVE_HEADERS = {
    "User-Agent": "GCM-Android-5.23",
    "X-Garmin-User-Agent": (
        "com.garmin.android.apps.connectmobile/5.23; ; Google/sdk_gphone64_arm64/google; "
        "Android/33; Dalvik/2.1.0"
    ),
    "X-Garmin-Paired-App-Version": "10861",
    "X-Garmin-Client-Platform": "Android",
    "X-App-Ver": "10861",
    "X-Lang": "en",
    "X-GCExperience": "GC5",
    "Accept-Language": "en-US,en;q=0.9",
}

_CSRF_RE = re.compile(r'name="_csrf"\s+value="(.+?)"')
_TITLE_RE = re.compile(r"<title>(.+?)</title>")
_TICKET_RE = re.compile(r'embed\?ticket=([^"]+)"')


def log(msg: str = "") -> None:
    print(msg, file=sys.stderr, flush=True)


def describe(resp, label: str) -> None:
    log(f"   {label}: HTTP {resp.status_code} ({len(resp.content)} bytes)")
    for h in ("cf-ray", "cf-mitigated", "server", "retry-after", "content-type"):
        if h in resp.headers:
            log(f"     {h}: {resp.headers[h][:120]}")
    title = _TITLE_RE.search(resp.text or "")
    if title:
        log(f"     <title>: {title.group(1)!r}")


def make_session(transport: str):
    if transport == "plain":
        import requests

        return requests.Session(), requests
    from curl_cffi import requests as cffi

    return cffi.Session(impersonate=transport), cffi


def main() -> None:
    args = sys.argv[1:]
    transport = args[0] if args and not args[0].startswith("--") else "plain"
    real = "--real" in args

    prefix = "GARMIN" if real else "GARMIN_TEST"
    email = os.environ[f"{prefix}_EMAIL"]
    password = os.environ[f"{prefix}_PASSWORD"]

    sess, http = make_session(transport)
    log(f"transport={transport}  konto={prefix}  email={email}")
    log()

    embed_params = {
        "id": "gauth-widget",
        "embedWidget": "true",
        "gauthHost": SSO_BASE,
    }
    signin_params = {
        **embed_params,
        "gauthHost": SSO_EMBED,
        "service": SSO_EMBED,
        "source": SSO_EMBED,
        "redirectAfterAccountLoginUrl": SSO_EMBED,
        "redirectAfterAccountCreationUrl": SSO_EMBED,
    }

    log("== Schritt 1: GET /sso/embed (Session-Cookies)")
    r = sess.get(SSO_EMBED, params=embed_params, headers=CHROME_HEADERS, timeout=30)
    describe(r, "embed")
    if r.status_code == 429:
        return finish({"outcome": "429", "step": "embed", "transport": transport})
    if not r.ok:
        return finish({"outcome": "blocked", "step": "embed", "status": r.status_code, "transport": transport})

    log()
    log("== Schritt 2: GET /sso/signin (CSRF-Token)")
    r = sess.get(
        f"{SSO_BASE}/signin",
        params=signin_params,
        headers={**CHROME_HEADERS, "Referer": SSO_EMBED},
        timeout=30,
    )
    describe(r, "signin-get")
    if r.status_code == 429:
        return finish({"outcome": "429", "step": "signin-get", "transport": transport})

    csrf = _CSRF_RE.search(r.text)
    if not csrf:
        log(f"     body[:400]: {r.text[:400]!r}")
        return finish({"outcome": "no-csrf", "step": "signin-get", "status": r.status_code, "transport": transport})
    log(f"     _csrf: {csrf.group(1)[:24]}…")

    delay = random.uniform(3.0, 8.0)  # noqa: S311
    log(f"   … {delay:.0f}s Anti-WAF-Pause zwischen GET und POST")
    time.sleep(delay)

    log()
    log("== Schritt 3: POST /sso/signin (Credentials)")
    r = sess.post(
        f"{SSO_BASE}/signin",
        params=signin_params,
        headers={
            **CHROME_HEADERS,
            "Referer": r.url,
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": "https://sso.garmin.com",
        },
        data={
            "username": email,
            "password": password,
            "embed": "true",
            "_csrf": csrf.group(1),
        },
        timeout=30,
    )
    describe(r, "signin-post")
    if r.status_code == 429:
        return finish({"outcome": "429", "step": "signin-post", "transport": transport})

    title_match = _TITLE_RE.search(r.text or "")
    title = title_match.group(1) if title_match else ""

    if "MFA" in title:
        cookies = sorted(c.name for c in sess.cookies)
        log("   -> MFA verlangt; Login-Schritt hat getragen.")
        log(f"     Cookies fuer den Resume: {cookies}")
        return finish({"outcome": "mfa_required", "title": title, "cookies": cookies, "transport": transport})

    if title != "Success":
        log(f"     body[:400]: {r.text[:400]!r}")
        return finish({"outcome": "login-failed", "title": title, "transport": transport})

    ticket_match = _TICKET_RE.search(r.text)
    if not ticket_match:
        return finish({"outcome": "no-ticket", "transport": transport})
    ticket = ticket_match.group(1)
    log(f"   serviceTicket: {ticket[:24]}… ({len(ticket)} Zeichen)")

    log()
    log("== Schritt 4: POST diauth /oauth/token (service_ticket-Grant)")
    tokens = None
    for client_id in DI_CLIENT_IDS:
        rr = http.post(
            DI_TOKEN_URL,
            headers={
                **NATIVE_HEADERS,
                "Authorization": "Basic "
                + __import__("base64").b64encode(f"{client_id}:".encode()).decode(),
                "Accept": "application/json,text/html;q=0.9,*/*;q=0.8",
                "Content-Type": "application/x-www-form-urlencoded",
                "Cache-Control": "no-cache",
            },
            data={
                "client_id": client_id,
                "service_ticket": ticket,
                "grant_type": DI_GRANT_TYPE,
                "service_url": SSO_EMBED,
            },
            timeout=30,
            **({"impersonate": transport} if transport != "plain" else {}),
        )
        describe(rr, f"di[{client_id}]")
        if not rr.ok:
            continue
        data = rr.json()
        tokens = {
            "di_token": data["access_token"],
            "di_refresh_token": data.get("refresh_token"),
            "di_client_id": client_id,
            "expires_in": data.get("expires_in"),
        }
        log(f"   -> getauscht mit client_id={client_id}")
        break

    if not tokens:
        return finish({"outcome": "di-exchange-failed", "transport": transport})

    log()
    log("== Schritt 5: GET /userprofile-service/socialProfile (displayName)")
    rr = http.get(
        f"{CONNECTAPI}/userprofile-service/socialProfile",
        headers={
            **NATIVE_HEADERS,
            "Authorization": f"Bearer {tokens['di_token']}",
            "Accept": "application/json",
        },
        timeout=30,
        **({"impersonate": transport} if transport != "plain" else {}),
    )
    describe(rr, "profile")
    display_name = rr.json().get("displayName") if rr.ok else None
    log(f"   displayName: {display_name}")

    finish(
        {
            "outcome": "success",
            "transport": transport,
            "display_name": display_name,
            "di_client_id": tokens["di_client_id"],
            "expires_in": tokens["expires_in"],
            "has_refresh_token": bool(tokens["di_refresh_token"]),
        }
    )


def finish(result: dict) -> None:
    log()
    log("== Ergebnis")
    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
