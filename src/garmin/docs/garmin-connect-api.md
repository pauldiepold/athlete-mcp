# Garmin Connect API — Spike-Befunde (Issue #4)

Ergebnis des Discovery-Spikes über die inoffizielle Garmin-Connect-App-API.
Vorlage für `GarminAuth`, `GarminClient`, `formatKoerperdaten` und das
D1-Schema. Verifiziert am 2026-06-14 gegen Pauls echtes Konto.

> **Fixtures bleiben lokal, nicht im Repo.** Die rohen Antworten
> (`garmin-data/spike-out/`) und die getrimmten Metrik-Fixtures
> (`src/garmin/__fixtures__/`) enthalten echte Gesundheitsdaten und sind
> gitignored. Sie dienen Pauls lokalen `formatKoerperdaten`-Tests; die für die
> Implementierung nötige **Struktur** ist hier unten dokumentiert (Endpoints,
> Fehlerformen, Zielform). Wer ohne diese lokalen Dateien testen will, baut
> synthetische Fixtures nach der Zielform in §3.

> Verifikation erfolgte über die Python-Referenzlibrary `garth` bzw.
> `garminconnect` (nur als Spike-Werkzeug, kein Produktionscode). Die hier
> dokumentierten HTTP-Details sind die Vorlage zum Reimplementieren in TS.

## 1. Auth-/Token-Flow

Garmin nutzt das **DI (Digital Identity) OAuth2**-Modell. Das Token-Bündel, das
beim einmaligen lokalen Seed-Login entsteht und ins KV gehört, ist schlank:

```jsonc
// user:<userId>:garmin
{
  "di_token":         "<kurzlebiger OAuth2 Access-Token (JWT, Bearer)>",
  "di_refresh_token": "<langlebiger Refresh-Token>",
  "di_client_id":     "<Client-ID, steckt auch im JWT des di_token>"
}
```

### Seed-Login (einmalig, lokal, mit MFA) — nur im CLI

Passwort + MFA → DI-Token-Bündel. Ablauf (vom Spike bestätigt):

1. SSO-Sign-in gegen `sso.garmin.com` (Embed-/Mobile-Flow) → Service-Ticket;
   MFA-Code wird per Mail/App verlangt und interaktiv eingegeben.
2. Ticket einlösen → DI-OAuth2-Token (`POST .../di-oauth2-service/oauth/grant/service_ticket`
   bzw. der OAuth1→OAuth2-Tausch der `garth`-Variante).
3. Ergebnis: `di_token` + `di_refresh_token` + `di_client_id`.

> **Seed ist die fragile Stelle.** Garmin/Cloudflare rate-limitet den Login
> aggressiv (HTTP 429) und resettet TLS-Verbindungen mit
> curl-Impersonation-Fingerprint. Im Spike scheiterte der „mobile" Login-Pfad
> wiederholt; zuverlässig war der **Web-SSO-Embed-Flow** (`garth`, plain
> `requests`). Das CLI-Seeding sollte diesen Pfad nutzen und 429 tolerant
> behandeln (anderes Netz/IP, Wiederholung). **Dies betrifft nur das einmalige
> Seeding — nicht den Worker.**

### Refresh (laufend, im Worker) — `GarminAuth`

Der `di_token` ist kurzlebig und wird über einen **Standard-OAuth2-Refresh-Token-Grant**
nachgeladen — headless, ohne MFA, ohne OAuth1-Signierung:

```http
POST https://diauth.garmin.com/di-oauth2-service/oauth/token
Authorization: Basic base64("<di_client_id>:")   # client_id als User, leeres Passwort
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&client_id=<di_client_id>&refresh_token=<di_refresh_token>
```

Antwort: neuer `access_token` (→ `di_token`) und ggf. **rotierter** `refresh_token`
(dann zurück ins KV schreiben). Reißt der Refresh-Token ab, ist ein erneuter
lokaler Seed-Login (MFA) nötig — vgl. [ADR-0001](./adr/0001-koerperdaten-live-api-archive-first.md).

## 2. Endpoints pro Metrik

Basis: `https://connectapi.garmin.com`. Datum-Format durchgängig `YYYY-MM-DD`.
**Auth-Header für alle Daten-Calls:**

```http
Authorization: Bearer <di_token>
Accept: application/json
```

| Metrik | Methode + Pfad | Datums-Param |
|---|---|---|
| **HRV-Status** | `GET /hrv-service/hrv/{date}` | im Pfad |
| **Schlaf** (+ Hauttemperatur) | `GET /wellness-service/wellness/dailySleepData/{displayName}` | Query: `date={date}&nonSleepBufferMinutes=60` |
| **Stress** | `GET /wellness-service/wellness/dailyStress/{date}` | im Pfad |
| **Body Battery** | `GET /wellness-service/wellness/bodyBattery/reports/daily` | Query: `startDate={date}&endDate={date}` |
| **Training Readiness** | `GET /metrics-service/metrics/trainingreadiness/{date}` | im Pfad |

Anmerkungen:
- **Hauttemperatur hat keinen eigenen Endpoint.** Alle Kandidaten
  (`/biometric-service/stats/skinTemp/...`, `/skin-temp-service/...`) liefern 404.
  Die nächtliche Hauttemperatur kommt aus der **Schlaf-Antwort**:
  `avgSkinTempDeviationC` / `avgSkinTempDeviationF` (Abweichung vom Baseline),
  `skinTempDataExists`, `skinTempCalibrationDays`.
- `dailySleepData` braucht den **`displayName`** des Nutzers im Pfad (einmalig
  aus dem Profil holen, dann cachen).
- `bodyBattery/reports/daily` gibt eine **Liste** zurück (ein Eintrag pro Tag);
  `trainingreadiness` ebenfalls (Liste, neuester Eintrag zuerst).

### Fehlende Daten (Tag ohne getragene Uhr)

Wichtig für `formatKoerperdaten` — die Endpoints liefern **200 mit leeren
Hüllen**, kein 404:

| Metrik | Antwort ohne Daten |
|---|---|
| HRV | `{}` (leeres Objekt, kein `hrvSummary`) |
| Schlaf | `dailySleepDTO` vorhanden, alle Werte `null`; `skinTempDataExists: null` |
| Stress | Objekt mit `avgStressLevel: null`, `maxStressLevel: null` |
| Body Battery | Liste mit einem Eintrag, `charged`/`drained` = `null` |
| Training Readiness | `[]` (leere Liste) |

## 3. Schlanke Ziel-Körperdaten-Form

Abgeleitete Zielform für `formatKoerperdaten` (Pendant zu `formatWorkout`) und
das D1-Schema. Alle Felder sind `nullable` (Tag ohne Daten → `null`). Quelle je
Feld in Klammern.

```jsonc
{
  "date": "2026-06-13",

  "hrv": {                         // /hrv-service/hrv -> hrvSummary
    "status": "BALANCED",          // .status  (HRV-Status, vgl. Glossar)
    "last_night_avg": 37,          // .lastNightAvg
    "weekly_avg": 36,              // .weeklyAvg
    "baseline_low": 35,            // .baseline.balancedLow
    "baseline_high": 44            // .baseline.balancedUpper
  },

  "sleep": {                       // dailySleepData
    "duration_seconds": 25380,     // dailySleepDTO.sleepTimeSeconds
    "deep_seconds": 4620,          // dailySleepDTO.deepSleepSeconds
    "light_seconds": 15600,        // dailySleepDTO.lightSleepSeconds
    "rem_seconds": 5160,           // dailySleepDTO.remSleepSeconds
    "awake_seconds": 720,          // dailySleepDTO.awakeSleepSeconds
    "score": 77,                   // dailySleepDTO.sleepScores.overall.value
    "score_qualifier": "FAIR",     // dailySleepDTO.sleepScores.overall.qualifierKey
    "avg_stress": 28,              // dailySleepDTO.avgSleepStress
    "resting_heart_rate": 58       // restingHeartRate (top-level)
  },

  "stress": {                      // dailyStress
    "avg": 34,                     // .avgStressLevel
    "max": 90                      // .maxStressLevel
  },

  "body_battery": {                // bodyBattery/reports/daily -> [0]
    "charged": 43,                 // .charged
    "drained": 47                  // .drained
  },

  "training_readiness": {          // trainingreadiness -> [0]
    "score": 70,                   // .score (0–100, Training Readiness, vgl. Glossar)
    "level": "MODERATE",           // .level
    "feedback": "GOOD_SLEEP_HISTORY" // .feedbackShort
  },

  "skin_temp": {                   // aus dailySleepData (kein eigener Endpoint)
    "deviation_celsius": 0.3,      // avgSkinTempDeviationC
    "data_exists": true            // skinTempDataExists
  }
}
```

Diese Form ist bewusst flach und interpretationsfrei (rohe *Körperdaten*, nicht
die abgeleitete *Tagesform* — vgl. [CONTEXT.md](../CONTEXT.md)). Sie ist der
Vorschlag aus dem Spike; die genaue Feldauswahl wird beim Bau von
`formatKoerperdaten` final geschärft.
