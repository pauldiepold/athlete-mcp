"""
Final Surge MCP Server
=======================
Stellt geplante Trainings aus Final Surge als MCP-Tools bereit, damit Claude
sie live abrufen kann.

Die Final Surge API ist inoffiziell (die App-API), aber stabil und verifiziert:
  Base:    https://beta.finalsurge.com/api
  Login:   POST /login        -> liefert user_key + token
  Plan:    GET  /WorkoutList  -> geplante + absolvierte Workouts im Datumsbereich

Setup:
  pip install fastmcp httpx
  export FINAL_SURGE_EMAIL="..."
  export FINAL_SURGE_PASSWORD="..."
  python server.py            # laueft per stdio (lokal) oder als HTTP-Server (gehostet)
"""

from __future__ import annotations

import os
import datetime as dt
from dataclasses import dataclass

import httpx
from fastmcp import FastMCP

FINAL_SURGE_API = "https://beta.finalsurge.com/api"

mcp = FastMCP("Final Surge")


@dataclass
class Session:
    """Ein Login-Zustand: user_key + Bearer-Token, mit Ablaufzeit gecacht."""
    user_key: str
    token: str
    obtained_at: dt.datetime


# einfacher In-Memory-Cache, damit nicht jeder Tool-Call neu einloggt
_session: Session | None = None
# Token sicherheitshalber alle 6 h erneuern
_SESSION_TTL = dt.timedelta(hours=6)


async def _login(client: httpx.AsyncClient) -> Session:
    email = os.environ["FINAL_SURGE_EMAIL"]
    password = os.environ["FINAL_SURGE_PASSWORD"]

    resp = await client.post(
        f"{FINAL_SURGE_API}/login",
        json={
            "email": email,
            "password": password,
            "deviceManufacturer": "",
            "deviceModel": "MCPServer",
            "deviceOperatingSystem": "Linux",
        },
        headers={"Content-Type": "application/json"},
    )
    resp.raise_for_status()
    body = resp.json()
    if not body.get("success", False):
        raise RuntimeError(
            f"Login fehlgeschlagen: {body.get('error_description', 'unbekannt')}"
        )
    data = body["data"]
    return Session(
        user_key=data["user_key"],
        token=data["token"],
        obtained_at=dt.datetime.now(dt.timezone.utc),
    )


async def _get_session(client: httpx.AsyncClient) -> Session:
    global _session
    now = dt.datetime.now(dt.timezone.utc)
    if _session is None or (now - _session.obtained_at) > _SESSION_TTL:
        _session = await _login(client)
    return _session


async def _fetch_workouts(start: dt.date, end: dt.date) -> list[dict]:
    async with httpx.AsyncClient(timeout=15) as client:
        sess = await _get_session(client)
        resp = await client.get(
            f"{FINAL_SURGE_API}/WorkoutList",
            params={
                "scope": "USER",
                "scopekey": sess.user_key,
                "startdate": start.isoformat(),
                "enddate": end.isoformat(),
            },
            headers={"Authorization": f"Bearer {sess.token}"},
        )
        resp.raise_for_status()
        body = resp.json()
        if not body.get("success", False):
            raise RuntimeError(
                f"WorkoutList fehlgeschlagen: {body.get('error_description', 'unbekannt')}"
            )
        return body.get("data", [])


def _format_workout(w: dict) -> dict:
    """Roh-Eintrag auf das Wesentliche reduzieren."""
    raw_date = w.get("workout_date", "")
    # Format ist z.B. "2026-06-05T00:00:00"
    date_only = raw_date.split("T")[0] if raw_date else ""

    activities = w.get("activities", [])
    activity_names = [a.get("activity_type_name", "") for a in activities]
    is_rest = len(activities) == 1 and activity_names[0].lower() == "rest day"

    return {
        "date": date_only,
        "rest_day": is_rest,
        "activities": activity_names,
        "description": (w.get("description") or "").strip(),
    }


@mcp.tool()
async def get_planned_workouts(start_date: str, end_date: str) -> list[dict]:
    """Geplante Trainings aus Final Surge fuer einen Datumsbereich abrufen.

    Args:
        start_date: Startdatum im Format YYYY-MM-DD (inklusive).
        end_date:   Enddatum im Format YYYY-MM-DD (inklusive).

    Returns:
        Liste von Workouts mit date, rest_day, activities und description
        (der Trainingstext vom Coach).
    """
    start = dt.date.fromisoformat(start_date)
    end = dt.date.fromisoformat(end_date)
    raw = await _fetch_workouts(start, end)
    return [_format_workout(w) for w in raw]


@mcp.tool()
async def get_upcoming_workouts(days: int = 7) -> list[dict]:
    """Die naechsten N Tage geplanter Trainings abrufen (Default: 7).

    Args:
        days: Anzahl Tage ab heute (inklusive heute).

    Returns:
        Liste von Workouts wie bei get_planned_workouts.
    """
    today = dt.date.today()
    end = today + dt.timedelta(days=max(0, days - 1))
    raw = await _fetch_workouts(today, end)
    return [_format_workout(w) for w in raw]


if __name__ == "__main__":
    # Lokal (stdio) zum Testen. Fuer gehostet: mcp.run(transport="http", host="0.0.0.0", port=8000)
    transport = os.environ.get("MCP_TRANSPORT", "stdio")
    if transport == "http":
        mcp.run(transport="http", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
    else:
        mcp.run()