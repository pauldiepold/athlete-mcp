# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "curl_cffi",
#   "requests",
#   "typing_extensions",
# ]
# ///
"""
Phase 0, Feinschnitt — Wegwerf-Diagnose zu Issue #38.

Genau *ein* Login-POST pro Lauf, mit waehlbarem Transport. Damit laesst sich
die eine Variable isolieren, um die es im Spike geht: der TLS-Fingerprint.
Alles andere (URL, Header, Body, IP) bleibt identisch.

    uv run spike/phase0_compare.py plain
    uv run spike/phase0_compare.py safari_ios      # curl_cffi-Impersonation
    uv run spike/phase0_compare.py chrome120
    uv run spike/phase0_compare.py plain --real    # Konto mit MFA

Jeder Lauf kostet Rate-Limit-Budget. Sparsam einsetzen.
"""

from __future__ import annotations

import json
import os
import sys

SSO = "https://sso.garmin.com"
IOS_SSO_CLIENT_ID = "GCM_IOS_DARK"
IOS_SERVICE_URL = "https://mobile.integration.garmin.com/gcm/ios"
IOS_LOGIN_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
)


def main() -> None:
    args = sys.argv[1:]
    transport = args[0] if args else "plain"
    real = "--real" in args

    prefix = "GARMIN" if real else "GARMIN_TEST"
    email = os.environ[f"{prefix}_EMAIL"]
    password = os.environ[f"{prefix}_PASSWORD"]

    if transport == "plain":
        import requests

        sess = requests.Session()
        kwargs = {}
    else:
        from curl_cffi import requests as cffi

        sess = cffi.Session(impersonate=transport)
        kwargs = {}

    print(f"transport={transport}  konto={prefix}  email={email}", file=sys.stderr)

    r = sess.post(
        f"{SSO}/mobile/api/login",
        params={
            "clientId": IOS_SSO_CLIENT_ID,
            "locale": "en-US",
            "service": IOS_SERVICE_URL,
        },
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
        **kwargs,
    )

    print(f"HTTP {r.status_code}", file=sys.stderr)
    for k, v in r.headers.items():
        if k.lower() in ("cf-ray", "cf-mitigated", "server", "retry-after", "content-type"):
            print(f"  {k}: {v}", file=sys.stderr)
    print(f"body: {r.text[:600]}", file=sys.stderr)

    try:
        body = r.json()
        rtype = body.get("responseStatus", {}).get("type")
    except Exception:
        rtype = None
    print(json.dumps({"transport": transport, "status": r.status_code, "type": rtype}))


if __name__ == "__main__":
    main()
