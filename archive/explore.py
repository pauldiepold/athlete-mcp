"""
Discovery-Spike (WEGWERF-CODE, kein Teil des MCP).
Loggt sich bei Final Surge ein, zieht die WorkoutList der aktuellen Woche
(Mo–So) und gibt das ROHE JSON aus, damit wir das echte Schema sehen —
insbesondere ob strukturierte Workouts (Intervalle, Pace-Targets) eigene
Felder haben oder alles im `description`-Freitext steckt.

Nur stdlib, keine Installation nötig:
    1. cp .env.example .env  und Credentials eintragen
    2. python explore.py
Ergebnis: workoutlist-raw.json (komplettes Roh-JSON) + Feld-Übersicht im Terminal.
"""

from __future__ import annotations

import json
import datetime as dt
import urllib.request
import urllib.parse
from pathlib import Path

API = "https://beta.finalsurge.com/api"


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = Path(__file__).parent / ".env"
    if not path.exists():
        raise SystemExit("Keine .env gefunden. Erst `cp .env.example .env` und Credentials eintragen.")
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def post_json(url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def get_json(url: str, params: dict, token: str) -> dict:
    full = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(full, headers={"Authorization": f"Bearer {token}"}, method="GET")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def week_bounds(today: dt.date) -> tuple[dt.date, dt.date]:
    monday = today - dt.timedelta(days=today.weekday())
    return monday, monday + dt.timedelta(days=6)


def main() -> None:
    env = load_env()
    email, password = env.get("FINAL_SURGE_EMAIL"), env.get("FINAL_SURGE_PASSWORD")
    if not email or not password:
        raise SystemExit("FINAL_SURGE_EMAIL / FINAL_SURGE_PASSWORD fehlen in .env")

    print("Login …")
    login = post_json(f"{API}/login", {
        "email": email, "password": password,
        "deviceManufacturer": "", "deviceModel": "MCPSpike", "deviceOperatingSystem": "Linux",
    })
    if not login.get("success"):
        raise SystemExit(f"Login fehlgeschlagen: {login.get('error_description')}")
    user_key = login["data"]["user_key"]
    token = login["data"]["token"]
    print(f"OK – user_key={user_key[:8]}…")

    start, end = week_bounds(dt.date.today())
    print(f"WorkoutList {start} … {end} …")
    res = get_json(f"{API}/WorkoutList", {
        "scope": "USER", "scopekey": user_key,
        "startdate": start.isoformat(), "enddate": end.isoformat(),
    }, token)
    if not res.get("success"):
        raise SystemExit(f"WorkoutList fehlgeschlagen: {res.get('error_description')}")

    workouts = res.get("data", [])
    Path("workoutlist-raw.json").write_text(json.dumps(res, indent=2, ensure_ascii=False))
    print(f"\n{len(workouts)} Einträge -> workoutlist-raw.json\n")

    # Feld-Übersicht: welche Keys existieren, wo steckt Struktur?
    all_keys: set[str] = set()
    activity_keys: set[str] = set()
    for w in workouts:
        all_keys.update(w.keys())
        for a in (w.get("activities") or []):
            activity_keys.update(a.keys())

    print("== Keys pro Workout ==")
    print("  " + ", ".join(sorted(all_keys)) or "  (keine)")
    print("\n== Keys pro Activity ==")
    print("  " + ", ".join(sorted(activity_keys)) or "  (keine)")

    print("\n== Pro Tag ==")
    for w in workouts:
        date = (w.get("workout_date") or "")[:10]
        desc = (w.get("description") or "").replace("\n", " ⏎ ")
        acts = [a.get("activity_type_name") for a in (w.get("activities") or [])]
        nonempty = [k for k, v in w.items() if v not in (None, "", [], {})]
        print(f"  {date} | activities={acts} | desc={desc[:70]!r}")
        print(f"           nicht-leere Felder: {nonempty}")


if __name__ == "__main__":
    main()
