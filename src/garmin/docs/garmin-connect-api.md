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
    "drained": 47,                 // .drained
    "events": [                    // .bodyBatteryActivityEvent, fehlt wenn leer
      { "type": "SLEEP",           // .eventType
        "start": "2026-06-12T23:17",  // .eventStartTimeGmt + .timezoneOffset (lokal!)
        "duration_minutes": 435,   // .durationInMilliseconds / 60000
        "impact": 41,              // .bodyBatteryImpact
        "feedback": "NONE" },      // .shortFeedback (nicht .feedbackType)
      { "type": "ACTIVITY", "start": "2026-06-13T08:15",
        "duration_minutes": 505, "impact": -26,
        "feedback": "MAINTAINING_AEROBIC_BASE" }
    ]
  },

  "training_readiness": [          // trainingreadiness, alle Readings des Tages,
                                   // aufsteigend nach time; null wenn keine
    { "time": "2026-06-13T06:37",  // .timestampLocal, Sekunden gekappt
      "score": 73,                 // .score (0–100, Training Readiness, vgl. Glossar)
      "level": "MODERATE",         // .level
      "feedback": "GOOD_SLEEP_HISTORY", // .feedbackShort
      "trigger": "AFTER_WAKEUP_RESET",  // .inputContext, roh durchgereicht
      "recovery_time_minutes": 752,     // .recoveryTime (ist bereits Minuten)
      "acute_load": 436 },              // .acuteLoad
    { "time": "2026-06-13T17:22", "score": 70, "level": "MODERATE",
      "feedback": "GOOD_SLEEP_HISTORY", "trigger": "AFTER_POST_EXERCISE_RESET",
      "recovery_time_minutes": 1048, "acute_load": 502 }
  ],

  "skin_temp": {                   // aus dailySleepData (kein eigener Endpoint)
    "deviation_celsius": 0.3,      // avgSkinTempDeviationC
    "data_exists": true            // skinTempDataExists
  }
}
```

Diese Form ist bewusst interpretationsfrei (rohe *Körperdaten*, nicht die
abgeleitete *Tagesform* — vgl. [CONTEXT.md](../CONTEXT.md)).

Die **Asymmetrie ist beabsichtigt**: Was sich über den Tag ändert, steht als
Liste (Training Readiness, Body-Battery-Events); was mit dem Aufwachen feststeht
(HRV, Schlaf, Hauttemperatur, Ruhepuls), bleibt skalar. Die Form folgt damit der
Änderungscharakteristik der Quelle — vgl.
[ADR-0002](./adr/0002-koerperdaten-intraday-ereignisbasiert.md).

Zur Unterscheidung „leer" vs. „nicht vorhanden": `training_readiness` ist `null`,
wenn Garmin keine Readings liefert — nie `[]`. `body_battery.events` fehlt ganz,
wenn keine Events in der Antwort stehen.

### Leitlinie für `formatKoerperdaten`

**So wenig an Garmins Werten ändern wie möglich.** Umgeformt wird nur, wo die
Rohform für Claude im Chat schlecht lesbar wäre:

- **Schlüssel** werden nach `snake_case` umbenannt und flach geschachtelt.
- **Werte** bleiben unverändert — kein Enum-Mapping, keine Übersetzung.
  Unbekannte Garmin-Codes (`inputContext`, `feedbackShort`) reichen wir roh
  durch; ein unvollständiges Mapping würde stillschweigend Werte verschlucken.
  Einzige Ausnahme sind **Einheiten**: Millisekunden werden zu Minuten gerundet
  (`durationInMilliseconds` → `duration_minutes`), Zeitstempel auf die Minute
  gekappt. Das ändert keine Aussage, nur die Lesbarkeit im Chat.
- **Weggelassen** wird nur, was (a) Metadaten ohne Aussage sind (`userProfilePK`,
  `deviceId`, `calendarDate`) oder (b) an anderer Stelle im Blob schon steht.
  Beispiel: Jedes Training-Readiness-Reading trägt `hrvWeeklyAverage` und
  `sleepScore` mit — identisch zu `hrv.weekly_avg` bzw. `sleep.score`. Bei
  mehreren Readings pro Tag wäre das reine Vervielfachung.

Kürzen ist also kein Widerspruch zur Leitlinie: Wir verlieren keine Information,
wir wiederholen sie nur nicht.

## 4. Ungenutzte Intraday-Zeitreihen

Die Antworten enthalten neben den Summary-Feldern **dichte Messreihen über den
Tag**, die `formatKoerperdaten` bewusst verwirft. Hier dokumentiert, falls ein
späterer Anwendungsfall sie braucht — sie kosten **keinen zusätzlichen Abruf**,
sie liegen in den Antworten, die wir ohnehin holen.

| Feld | Endpoint | Form | Raster |
|---|---|---|---|
| `stressValuesArray` | `dailyStress/{date}` | `[epoch_ms, stressLevel]` | 3 min (~480 Punkte/Tag) |
| `bodyBatteryValuesArray` | `bodyBattery/reports/daily` | `[epoch_ms, bodyBatteryLevel]` | ungeprüft, Fixture ist getrimmt |
| `hrvReadings` | `hrv-service/hrv/{date}` | `{hrvValue, readingTimeLocal}` | 5 min, **nur während des Schlafs** |
| `sleepLevels` | `dailySleepData` | Schlafphasen-Segmente | Phasenwechsel |

**Falle:** `dailyStress` enthält ebenfalls ein `bodyBatteryValuesArray` — das
trägt aber den `bodyBatteryStatus` (`"MEASURED"`), nicht den Level. Der Level
steht nur in `bodyBattery/reports/daily`.

**Warum ungenutzt:** Für die Trainingssteuerung zählt *warum* sich ein Wert
geändert hat, nicht der Minutenverlauf — das beantworten die ereignisbasierten
Felder (`trainingreadiness[].inputContext`, `bodyBatteryActivityEvent[]`) zu
einem Bruchteil der Tokens. Ein Tag Kurvendaten ist rund 50× so groß wie der
gesamte übrige Körperdaten-Blob und würde `get_koerperdaten_range` über eine
Woche unbrauchbar aufblähen. Käme ein Anwendungsfall dazu (z. B.
Regenerationsgeschwindigkeit nach Intervallen), gehören die Kurven in eine
eigene Tabelle und hinter ein eigenes Tool — nicht in den Tagesblob.
