# Inodose Monitoring — REST API contract

The frontend talks to the backend only through these endpoints (see `src/api/`).
Base URL: `VITE_API_BASE_URL` (default `/api/v1`). JSON in and out.

**Auth:** send `Authorization: Bearer <token>` from `POST /auth/login` on every call except login and branding.
**Errors:** non-2xx with `{ "message": "Human-readable reason" }` — the UI shows the message as-is.
`401` = session expired (the UI signs the user out), `403` = role not allowed, `400` = validation, `404` = not found, `409` = wrong machine state, `429` = locked out.

**Roles** (each role includes the ones before it): Operator → Supervisor → Administrator.
The backend **must** enforce the role on every call; the UI only hides/disables controls.

All examples below are real responses from the bundled mock API (`src/api/mock`), shortened to 3 items per list.


## Authentication

| Method | Path | Min. role | Purpose |
|---|---|---|---|
| `POST` | `/auth/login` | Public | Sign in. Returns a bearer token and the user. 401 on wrong credentials; 429 after 5 failures (5-minute lock-out). |
| `GET` | `/auth/me` | Operator | Current user for the token (used to restore the session on reload). |
| `POST` | `/auth/logout` | Operator | Invalidate the token. |

## Common (header & navigation)

| Method | Path | Min. role | Purpose |
|---|---|---|---|
| `GET` | `/shift` | Operator | Plant clock and current shift shown in the navigation / header. |
| `GET` | `/machines` | Operator | Machines for the header selector and Configurations → Machines. |
| `GET` | `/alerts/live` | Operator | Today's alerts. Unacknowledged ones show in the header banner and the dashboard list. Polled every VITE_POLL_INTERVAL_MS. |
| `POST` | `/alerts/live/:id/acknowledge` | Operator | Acknowledge a live alert. |
| `GET` | `/branding` | Public | Customer name and logo (top-right). Empty logoUrl = use the bundled default logo. |

## Live Dashboard

| Method | Path | Min. role | Purpose |
|---|---|---|---|
| `GET` | `/dashboard` | Operator | Production summary, inoculation status, flow diagram values and today’s boxes. Polled. |
| `GET` | `/dashboard/cumulative` | Operator | “Cumulative Dosage Within Mold” for the box being dosed. Polled. |
| `GET` | `/dashboard/across-molds` | Operator | “Dosage Across Molds (Today)” for one component. |
| `GET` | `/dashboard/boxes/:boxId` | Operator | Full record of one box (box-detail pop-up). 404 for boxes not dosed yet. |

## Control Panel

| Method | Path | Min. role | Purpose |
|---|---|---|---|
| `GET` | `/machines/:id/control-panel` | Operator | Applied mode, parameters, operation/storage status, manual operations. |
| `POST` | `/machines/:id/settings` | Supervisor | Apply operating mode + machine parameters (after the operator confirms). Validates ranges: pouring time 1–300 s, flow rate 0.1–50 g/s. |
| `POST` | `/machines/:id/manual-operations/:key` | Supervisor | Open/Close a chamber or Start/Stop a motor. 409 unless Manual Mode is applied. key = mixingChamber | intermediateChamber | purging | vibrator. |

## Past Records

| Method | Path | Min. role | Purpose |
|---|---|---|---|
| `GET` | `/records/dosage` | Operator | Day rows with dose counts and per-component breakdown (paged, 10 per page). |
| `GET` | `/records/dosage/:date/components/:componentName/doses` | Operator | Individual doses of a component on a day (paged). |
| `GET` | `/records/doses/:doseId/series` | Operator | Cumulative grams per second for one dose (dose pop-up). |
| `GET` | `/records/across-molds` | Operator | “View Graph”: final dosage per box for a component on a day. |
| `GET` | `/records/alerts` | Operator | Alert history (paged). |
| `POST` | `/records/alerts/:id/acknowledge` | Operator | Acknowledge a past alert; acknowledgedBy is set to the signed-in user. |

## Configurations

| Method | Path | Min. role | Purpose |
|---|---|---|---|
| `GET` | `/components` | Operator | Component master list. |
| `POST` | `/components` | Supervisor | Add a component (400 with a message on validation errors). |
| `PUT` | `/components/:id` | Supervisor | Replace a component. |
| `DELETE` | `/components` | Supervisor | Delete components by id. |
| `GET` | `/alert-configs` | Operator | Alert types, enabled flag and e-mail recipients. |
| `PUT` | `/alert-configs` | Supervisor | Save all alert settings (full list). |
| `POST` | `/machines` | Supervisor | Add a machine. |
| `PUT` | `/machines/:id` | Supervisor | Update a machine. |
| `DELETE` | `/machines` | Supervisor | Delete machines by id. |
| `PUT` | `/branding` | Administrator | Set the customer logo. logoUrl must be a base64 PNG/JPG/SVG data URL, max 1 MB. |
| `DELETE` | `/branding` | Administrator | Restore the default logo. |

## Audit

| Method | Path | Min. role | Purpose |
|---|---|---|---|
| `GET` | `/audit-log` | Supervisor | Who did what and when (sign-ins, denied actions, settings, manual operations, configuration changes). Newest first. |

## Examples

### POST /auth/login
Sign in. Returns a bearer token and the user. 401 on wrong credentials; 429 after 5 failures (5-minute lock-out).

```http
POST /api/v1/auth/login
```
Request body:
```json
{
  "userId": "admin",
  "password": "••••",
  "staySignedIn": true
}
```
Response `200`:
```json
{
  "token": "mock.YWRtaW58MTc5Mzg5OTY1MTQxMg==",
  "expiresAt": "2026-11-05T17:27:31.412Z",
  "user": {
    "userId": "admin",
    "name": "Plant Administrator",
    "role": "Administrator",
    "initials": "PA"
  }
}
```

### GET /auth/me
Current user for the token (used to restore the session on reload).

```http
GET /api/v1/auth/me
```
Response `200`:
```json
{
  "userId": "admin",
  "name": "Plant Administrator",
  "role": "Administrator",
  "initials": "PA"
}
```

### POST /auth/logout
Invalidate the token.

```http
POST /api/v1/auth/logout
```
Response `200`:
```json
(empty)
```

### GET /shift
Plant clock and current shift shown in the navigation / header.

```http
GET /api/v1/shift
```
Response `200`:
```json
{
  "time": "15:40:11",
  "date": "29 Aug 2026",
  "shift": "Shift B"
}
```

### GET /machines
Machines for the header selector and Configurations → Machines.

```http
GET /api/v1/machines
```
Response `200`:
```json
[
  {
    "id": "m1",
    "productId": "12335",
    "machineName": "Inodose Machine 1",
    "productionLine": "Production Line 1",
    "dateAdded": "15 August 2026"
  },
  {
    "id": "m2",
    "productId": "44511",
    "machineName": "Inodose Machine 2",
    "productionLine": "Production Line 2",
    "dateAdded": "1 July 2026"
  },
  {
    "id": "m3",
    "productId": "37722",
    "machineName": "Inodose Machine 3",
    "productionLine": "Production Line 3",
    "dateAdded": "15 July 2026"
  }
]
```

### GET /alerts/live
Today's alerts. Unacknowledged ones show in the header banner and the dashboard list. Polled every VITE_POLL_INTERVAL_MS.

```http
GET /api/v1/alerts/live
```
Response `200`:
```json
[
  {
    "id": "a1",
    "time": "14:00:23",
    "boxNo": "B-80",
    "type": "Over Dose",
    "acknowledged": false
  },
  {
    "id": "a2",
    "time": "13:25:10",
    "boxNo": "B-72",
    "type": "Flow Rate Low",
    "acknowledged": false
  },
  {
    "id": "a3",
    "time": "11:05:56",
    "boxNo": "B-55",
    "type": "Under Dose",
    "acknowledged": true
  },
  "… 2 more"
]
```

### POST /alerts/live/:id/acknowledge
Acknowledge a live alert.

```http
POST /api/v1/alerts/live/a2/acknowledge
```
Response `200`:
```json
{
  "id": "a2",
  "time": "13:25:10",
  "boxNo": "B-72",
  "type": "Flow Rate Low",
  "acknowledged": true
}
```

### GET /branding
Customer name and logo (top-right). Empty logoUrl = use the bundled default logo.

```http
GET /api/v1/branding
```
Response `200`:
```json
{
  "customerName": "Gujarat Metal Cast",
  "logoUrl": ""
}
```

### GET /dashboard
Production summary, inoculation status, flow diagram values and today’s boxes. Polled.

```http
GET /api/v1/dashboard?machineId=m1
```
Response `200`:
```json
{
  "summary": {
    "bunchWeight": 50,
    "bunchWeightUnit": "kg",
    "targetPouringTime": 20,
    "targetPouringTimeUnit": "sec",
    "targetPouringTempMin": 1400,
    "targetPouringTempMax": 1440,
    "targetPouringTempUnit": "°C",
    "ladle": "L-03",
    "heat": "H-2622C1",
    "grade": "FG220",
    "currentComponent": "C.I. ADAPTER 2” TOP"
  },
  "inoculation": {
    "flowRateSetpoint": 4,
    "totalExpectedDose": 80,
    "tolerancePercent": 5,
    "totalActualDose": 52,
    "dosingStatus": "In progress",
    "mode": "auto",
    "liveConnection": true
  },
  "flow": {
    "pouringLabel": "Pouring",
    "pouringTempC": 1410,
    "pouringSeconds": 12,
    "dosingLabel": "Dosing",
    "dosingSeconds": 11,
    "hopperLevel": "Medium"
  },
  "boxes": [
    {
      "id": "B-53",
      "label": "B-53",
      "state": "pending",
      "component": "C.I. ADAPTER 1.5” BOTTOM",
      "actualGms": 120,
      "expectedMinGms": 115,
      "expectedMaxGms": 125,
      "timestamp": "13:15:36"
    },
    {
      "id": "B-54",
      "label": "B-54",
      "state": "pending",
      "component": "C.I. ADAPTER 1.5” BOTTOM",
      "actualGms": 120,
      "expectedMinGms": 115,
      "expectedMaxGms": 125,
      "timestamp": "13:15:36"
    },
    {
      "id": "B-55",
      "label": "B-55",
      "state": "pending",
      "component": "C.I. ADAPTER 1.5” BOTTOM",
      "actualGms": 120,
      "expectedMinGms": 115,
      "expectedMaxGms": 125,
      "timestamp": "13:15:36"
    },
    "… 30 more"
  ],
  "boxesDosedToday": 84,
  "boxesDosedForCurrentComponent": 10
}
```

### GET /dashboard/cumulative
“Cumulative Dosage Within Mold” for the box being dosed. Polled.

```http
GET /api/v1/dashboard/cumulative?machineId=m1
```
Response `200`:
```json
{
  "boxNo": "B-11",
  "timeAxis": [
    "15:40:01",
    "15:40:02",
    "15:40:03",
    "… 17 more"
  ],
  "points": [
    {
      "time": "15:40:01",
      "grams": 10,
      "boxNo": "B-11"
    },
    {
      "time": "15:40:02",
      "grams": 15,
      "boxNo": "B-11"
    },
    {
      "time": "15:40:03",
      "grams": 20,
      "boxNo": "B-11"
    },
    "… 7 more"
  ],
  "tolerance": {
    "min": 76,
    "max": 84
  }
}
```

### GET /dashboard/across-molds
“Dosage Across Molds (Today)” for one component.

```http
GET /api/v1/dashboard/across-molds?machineId=m1&component=C.I.%20ADAPTER%202%E2%80%9D%20TOP
```
Response `200`:
```json
{
  "component": "C.I. ADAPTER 2” TOP",
  "bars": [
    {
      "boxNo": "B-75",
      "grams": 84,
      "state": "optimal"
    },
    {
      "boxNo": "B-76",
      "grams": 84,
      "state": "optimal"
    },
    {
      "boxNo": "B-77",
      "grams": 84,
      "state": "optimal"
    },
    "… 23 more"
  ],
  "tolerance": {
    "min": 80,
    "max": 88
  }
}
```

### GET /dashboard/boxes/:boxId
Full record of one box (box-detail pop-up). 404 for boxes not dosed yet.

```http
GET /api/v1/dashboard/boxes/B-71?machineId=m1
```
Response `200`:
```json
{
  "boxNo": "B-71",
  "component": "C.I. ADAPTER 1.5” BOTTOM",
  "status": "Dose Miss",
  "bunchWeight": "40 kg",
  "pouringTime": "23 sec",
  "pouringTarget": 22,
  "pouringTemp": "1448 °C",
  "pouringTempRange": "1420 - 1460",
  "ladle": "L-03",
  "heat": "H-2622C1",
  "grade": "FG400",
  "shiftLabel": "Today, Shift B",
  "dosingTime": "20 sec",
  "totalActualDose": 0,
  "expectedMin": 115,
  "expectedMax": 125,
  "flowRate": "6 gms/sec",
  "inoculantContent": "0 %",
  "startSecond": 56401,
  "points": [
    0,
    0,
    0,
    "… 18 more"
  ],
  "prevBoxId": "B-70",
  "nextBoxId": "B-72"
}
```

### GET /machines/:id/control-panel
Applied mode, parameters, operation/storage status, manual operations.

```http
GET /api/v1/machines/m1/control-panel
```
Response `200`:
```json
{
  "machineId": "m1",
  "connected": true,
  "appliedMode": "auto",
  "params": {
    "componentName": "C.I. ADAPTER 2” TOP",
    "pouringTimeSec": 20,
    "flowRateGmsPerSec": 4
  },
  "operation": {
    "machineStatus": "READY",
    "boxesDosedToday": 104
  },
  "storage": {
    "mainHopperLevel": "Medium",
    "storageHopperLevel": "Low",
    "intermediateChamberLevel": "High"
  },
  "manualOps": [
    {
      "key": "mixingChamber",
      "label": "Mixing Chamber",
      "kind": "chamber",
      "active": false,
      "elapsedSeconds": null,
      "startedAt": null
    },
    {
      "key": "intermediateChamber",
      "label": "Intermediate Chamber",
      "kind": "chamber",
      "active": false,
      "elapsedSeconds": null,
      "startedAt": null
    },
    {
      "key": "purging",
      "label": "Purging",
      "kind": "motor",
      "active": false,
      "elapsedSeconds": null,
      "startedAt": null
    },
    "… 1 more"
  ],
  "inoculantDosedGms": null
}
```

### POST /machines/:id/settings
Apply operating mode + machine parameters (after the operator confirms). Validates ranges: pouring time 1–300 s, flow rate 0.1–50 g/s.

```http
POST /api/v1/machines/m1/settings
```
Request body:
```json
{
  "mode": "manual",
  "params": {
    "componentName": "C.I. ADAPTER 2” TOP",
    "pouringTimeSec": 25,
    "flowRateGmsPerSec": 4
  }
}
```
Response `200`:
```json
{
  "machineId": "m1",
  "connected": true,
  "appliedMode": "manual",
  "params": {
    "componentName": "C.I. ADAPTER 2” TOP",
    "pouringTimeSec": 25,
    "flowRateGmsPerSec": 4
  },
  "operation": {
    "machineStatus": "READY",
    "boxesDosedToday": 104
  },
  "storage": {
    "mainHopperLevel": "Medium",
    "storageHopperLevel": "Low",
    "intermediateChamberLevel": "High"
  },
  "manualOps": [
    {
      "key": "mixingChamber",
      "label": "Mixing Chamber",
      "kind": "chamber",
      "active": false,
      "elapsedSeconds": null,
      "startedAt": null
    },
    {
      "key": "intermediateChamber",
      "label": "Intermediate Chamber",
      "kind": "chamber",
      "active": false,
      "elapsedSeconds": null,
      "startedAt": null
    },
    {
      "key": "purging",
      "label": "Purging",
      "kind": "motor",
      "active": false,
      "elapsedSeconds": null,
      "startedAt": null
    },
    "… 1 more"
  ],
  "inoculantDosedGms": null
}
```

### POST /machines/:id/manual-operations/:key
Open/Close a chamber or Start/Stop a motor. 409 unless Manual Mode is applied. key = mixingChamber | intermediateChamber | purging | vibrator.

```http
POST /api/v1/machines/m1/manual-operations/mixingChamber
```
Request body:
```json
{
  "action": "start"
}
```
Response `200`:
```json
{
  "machineId": "m1",
  "connected": true,
  "appliedMode": "manual",
  "params": {
    "componentName": "C.I. ADAPTER 2” TOP",
    "pouringTimeSec": 25,
    "flowRateGmsPerSec": 4
  },
  "operation": {
    "machineStatus": "READY",
    "boxesDosedToday": 104
  },
  "storage": {
    "mainHopperLevel": "Medium",
    "storageHopperLevel": "Low",
    "intermediateChamberLevel": "High"
  },
  "manualOps": [
    {
      "key": "mixingChamber",
      "label": "Mixing Chamber",
      "kind": "chamber",
      "active": true,
      "elapsedSeconds": 0,
      "startedAt": "2026-11-05T05:27:31.414Z"
    },
    {
      "key": "intermediateChamber",
      "label": "Intermediate Chamber",
      "kind": "chamber",
      "active": false,
      "elapsedSeconds": null,
      "startedAt": null
    },
    {
      "key": "purging",
      "label": "Purging",
      "kind": "motor",
      "active": false,
      "elapsedSeconds": null,
      "startedAt": null
    },
    "… 1 more"
  ],
  "inoculantDosedGms": null
}
```

### GET /records/dosage
Day rows with dose counts and per-component breakdown (paged, 10 per page).

```http
GET /api/v1/records/dosage?from=2026-09-05&to=2026-10-05&componentId=all&machineId=all&page=1
```
Response `200`:
```json
{
  "items": [
    {
      "date": "05-Oct-2026",
      "componentCount": 3,
      "totalBoxes": 300,
      "optimalDose": 200,
      "overDose": 40,
      "underDose": 50,
      "doseMiss": 8,
      "notPoured": 2,
      "components": [
        {
          "componentName": "C.I. ADAPTER 2” TOP",
          "totalBoxes": 100,
          "optimalDose": 68,
          "overDose": 14,
          "underDose": 18,
          "doseMiss": 4,
          "notPoured": 2
        },
        {
          "componentName": "C.I. ADAPTER 1.5” BOTTOM",
          "totalBoxes": 100,
          "optimalDose": 66,
          "overDose": 13,
          "underDose": 16,
          "doseMiss": 2,
          "notPoured": 0
        },
        {
          "componentName": "Component 3",
          "totalBoxes": 100,
          "optimalDose": 66,
          "overDose": 13,
          "underDose": 16,
          "doseMiss": 2,
          "notPoured": 0
        }
      ]
    },
    {
      "date": "04-Oct-2026",
      "componentCount": 2,
      "totalBoxes": 150,
      "optimalDose": 115,
      "overDose": 16,
      "underDose": 14,
      "doseMiss": 5,
      "notPoured": 0,
      "components": [
        {
          "componentName": "C.I. ADAPTER 2” TOP",
          "totalBoxes": 100,
          "optimalDose": 70,
          "overDose": 15,
          "underDose": 10,
          "doseMiss": 5,
          "notPoured": 0
        },
        {
          "componentName": "C.I. ADAPTER 1.5” BOTTOM",
          "totalBoxes": 50,
          "optimalDose": 45,
          "overDose": 1,
          "underDose": 4,
          "doseMiss": 0,
          "notPoured": 0
        }
      ]
    },
    {
      "date": "03-Oct-2026",
      "componentCount": 3,
      "totalBoxes": 84,
      "optimalDose": 72,
      "overDose": 3,
      "underDose": 3,
      "doseMiss": 2,
      "notPoured": 0,
      "components": [
        {
          "componentName": "C.I. ADAPTER 2” TOP",
          "totalBoxes": 28,
          "optimalDose": 24,
          "overDose": 1,
          "underDose": 1,
          "doseMiss": 2,
          "notPoured": 0
        },
        {
          "componentName": "C.I. ADAPTER 1.5” BOTTOM",
          "totalBoxes": 28,
          "optimalDose": 24,
          "overDose": 1,
          "underDose": 1,
          "doseMiss": 0,
          "notPoured": 0
        },
        {
          "componentName": "Component 3",
          "totalBoxes": 28,
          "optimalDose": 24,
          "overDose": 1,
          "underDose": 1,
          "doseMiss": 0,
          "notPoured": 0
        }
      ]
    },
    "… 7 more"
  ],
  "page": 1,
  "pageSize": 10,
  "total": 13,
  "pageCount": 2
}
```

### GET /records/dosage/:date/components/:componentName/doses
Individual doses of a component on a day (paged).

```http
GET /api/v1/records/dosage/04-Oct-2026/components/C.I.%20ADAPTER%202%E2%80%9D%20TOP/doses?page=1&machineId=all
```
Response `200`:
```json
{
  "items": [
    {
      "doseId": 12345,
      "dosingTime": "15:46:18 - 15:46:38",
      "durationSec": 20,
      "machine": "Inodose Machine 1",
      "boxNo": "B-30",
      "status": "Optimal Dose",
      "totalActualDose": "82 gms",
      "totalExpectedDose": "80 - 88 gms",
      "inoculantFlowRate": "4 gms/sec",
      "inoculantContent": "0.16 %",
      "bunchWeight": "50 kg",
      "pouringTime": "22 sec",
      "pouringTarget": "Target - 20"
    },
    {
      "doseId": 12344,
      "dosingTime": "15:45:55 - 15:46:15",
      "durationSec": 20,
      "machine": "Inodose Machine 1",
      "boxNo": "B-39",
      "status": "Optimal Dose",
      "totalActualDose": "80 gms",
      "totalExpectedDose": "80 - 88 gms",
      "inoculantFlowRate": "4 gms/sec",
      "inoculantContent": "0.16 %",
      "bunchWeight": "50 kg",
      "pouringTime": "22 sec",
      "pouringTarget": "Target - 20"
    },
    {
      "doseId": 12343,
      "dosingTime": "15:45:33 - 15:45:55",
      "durationSec": 22,
      "machine": "Inodose Machine 2",
      "boxNo": "B-20",
      "status": "Optimal Dose",
      "totalActualDose": "80 gms",
      "totalExpectedDose": "80 - 88 gms",
      "inoculantFlowRate": "4 gms/sec",
      "inoculantContent": "0.16 %",
      "bunchWeight": "50 kg",
      "pouringTime": "22 sec",
      "pouringTarget": "Target - 20"
    },
    "… 7 more"
  ],
  "page": 1,
  "pageSize": 10,
  "total": 10,
  "pageCount": 1
}
```

### GET /records/doses/:doseId/series
Cumulative grams per second for one dose (dose pop-up).

```http
GET /api/v1/records/doses/12345/series
```
Response `200`:
```json
[
  {
    "time": "15:46:18",
    "grams": 6
  },
  {
    "time": "15:46:19",
    "grams": 12
  },
  {
    "time": "15:46:20",
    "grams": 14
  },
  "… 17 more"
]
```

### GET /records/across-molds
“View Graph”: final dosage per box for a component on a day.

```http
GET /api/v1/records/across-molds?date=04-Oct-2026&component=C.I.%20ADAPTER%202%E2%80%9D%20TOP&machineId=m1
```
Response `200`:
```json
{
  "component": "C.I. ADAPTER 2” TOP",
  "bars": [
    {
      "boxNo": "B-65",
      "grams": 84,
      "state": "optimal"
    },
    {
      "boxNo": "B-66",
      "grams": 84,
      "state": "optimal"
    },
    {
      "boxNo": "B-67",
      "grams": 84,
      "state": "optimal"
    },
    "… 33 more"
  ],
  "tolerance": {
    "min": 80,
    "max": 88
  }
}
```

### GET /records/alerts
Alert history (paged).

```http
GET /api/v1/records/alerts?from=2026-09-05&to=2026-10-05&componentId=all&machineId=all&page=1
```
Response `200`:
```json
{
  "items": [
    {
      "id": "r1",
      "date": "05-Oct-2026",
      "time": "15:46:38",
      "alertType": "Over Dose",
      "boxNo": "B-100",
      "doseId": 12345,
      "component": "C.I. ADAPTER 2” TOP",
      "machine": "Inodose Machine 1",
      "acknowledgedBy": "Vedank Paliwal"
    },
    {
      "id": "r2",
      "date": "04-Oct-2026",
      "time": "15:46:11",
      "alertType": "Under Dose",
      "boxNo": "B-99",
      "doseId": 12344,
      "component": "C.I. ADAPTER 2” TOP",
      "machine": "Inodose Machine 2",
      "acknowledgedBy": "Manoj Paswan"
    },
    {
      "id": "r3",
      "date": "03-Oct-2026",
      "time": "15:45:00",
      "alertType": "Dose Miss",
      "boxNo": "B-98",
      "doseId": 12343,
      "component": "C.I. ADAPTER 2” TOP",
      "machine": "Inodose Machine 1",
      "acknowledgedBy": "Sahil Shigwan"
    },
    "… 7 more"
  ],
  "page": 1,
  "pageSize": 10,
  "total": 13,
  "pageCount": 2
}
```

### POST /records/alerts/:id/acknowledge
Acknowledge a past alert; acknowledgedBy is set to the signed-in user.

```http
POST /api/v1/records/alerts/r4/acknowledge
```
Response `200`:
```json
{
  "id": "r4",
  "date": "02-Oct-2026",
  "time": "15:44:38",
  "alertType": "Pipe Choked",
  "boxNo": "B-97",
  "doseId": 12342,
  "component": "C.I. ADAPTER 2” TOP",
  "machine": "Inodose Machine 1",
  "acknowledgedBy": "Plant Administrator"
}
```

### GET /components
Component master list.

```http
GET /api/v1/components
```
Response `200`:
```json
[
  {
    "id": "c1",
    "componentId": "C-100",
    "componentName": "C.I. ADAPTER 2” TOP",
    "pouringTempMin": 1400,
    "pouringTempMax": 1440,
    "pouringTimeSec": 20,
    "inoculantFlowRate": 4,
    "expectedDosageGms": 80,
    "grade": "FG220",
    "bunchWeightKg": 50
  },
  {
    "id": "c2",
    "componentId": "C-101",
    "componentName": "C.I. ADAPTER 1.5” BOTTOM",
    "pouringTempMin": 1420,
    "pouringTempMax": 1460,
    "pouringTimeSec": 22,
    "inoculantFlowRate": 6,
    "expectedDosageGms": 132,
    "grade": "FG400",
    "bunchWeightKg": 40
  },
  {
    "id": "c3",
    "componentId": "C-102",
    "componentName": "Component 3",
    "pouringTempMin": 1350,
    "pouringTempMax": 1370,
    "pouringTimeSec": 40,
    "inoculantFlowRate": 3.5,
    "expectedDosageGms": 140,
    "grade": "FG100",
    "bunchWeightKg": 70
  }
]
```

### POST /components
Add a component (400 with a message on validation errors).

```http
POST /api/v1/components
```
Request body:
```json
{
  "componentId": "C-103",
  "componentName": "Bracket",
  "pouringTempMin": 1380,
  "pouringTempMax": 1420,
  "pouringTimeSec": 18,
  "inoculantFlowRate": 4,
  "expectedDosageGms": 72,
  "grade": "FG250",
  "bunchWeightKg": 45
}
```
Response `201`:
```json
{
  "componentId": "C-103",
  "componentName": "Bracket",
  "pouringTempMin": 1380,
  "pouringTempMax": 1420,
  "pouringTimeSec": 18,
  "inoculantFlowRate": 4,
  "expectedDosageGms": 72,
  "grade": "FG250",
  "bunchWeightKg": 45,
  "id": "c1793856451416"
}
```

### PUT /components/:id
Replace a component.

```http
PUT /api/v1/components/c3
```
Request body:
```json
{
  "componentId": "C-102",
  "componentName": "Component 3",
  "pouringTempMin": 1350,
  "pouringTempMax": 1370,
  "pouringTimeSec": 40,
  "inoculantFlowRate": 3.5,
  "expectedDosageGms": 140,
  "grade": "FG100",
  "bunchWeightKg": 70
}
```
Response `200`:
```json
{
  "componentId": "C-102",
  "componentName": "Component 3",
  "pouringTempMin": 1350,
  "pouringTempMax": 1370,
  "pouringTimeSec": 40,
  "inoculantFlowRate": 3.5,
  "expectedDosageGms": 140,
  "grade": "FG100",
  "bunchWeightKg": 70,
  "id": "c3"
}
```

### DELETE /components
Delete components by id.

```http
DELETE /api/v1/components
```
Request body:
```json
{
  "ids": [
    "c4"
  ]
}
```
Response `200`:
```json
(empty)
```

### GET /alert-configs
Alert types, enabled flag and e-mail recipients.

```http
GET /api/v1/alert-configs
```
Response `200`:
```json
[
  {
    "id": "ac1",
    "alertType": "Over Dose",
    "enabled": true,
    "emails": [
      "vedank.paliwal@mpmindia.in"
    ]
  },
  {
    "id": "ac2",
    "alertType": "Under Dose",
    "enabled": true,
    "emails": [
      "vedank.paliwal@mpmindia.in"
    ]
  },
  {
    "id": "ac3",
    "alertType": "Dose Missed",
    "enabled": true,
    "emails": [
      "vedank.paliwal@mpmindia.in"
    ]
  },
  "… 4 more"
]
```

### PUT /alert-configs
Save all alert settings (full list).

```http
PUT /api/v1/alert-configs
```
Request body:
```json
[ …AlertConfig ]
```
Response `200`:
```json
[
  {
    "id": "ac1",
    "alertType": "Over Dose",
    "enabled": true,
    "emails": [
      "vedank.paliwal@mpmindia.in"
    ]
  },
  {
    "id": "ac2",
    "alertType": "Under Dose",
    "enabled": true,
    "emails": [
      "vedank.paliwal@mpmindia.in"
    ]
  },
  {
    "id": "ac3",
    "alertType": "Dose Missed",
    "enabled": true,
    "emails": [
      "vedank.paliwal@mpmindia.in"
    ]
  },
  "… 4 more"
]
```

### POST /machines
Add a machine.

```http
POST /api/v1/machines
```
Request body:
```json
{
  "productId": "55500",
  "machineName": "Inodose Machine 4",
  "productionLine": "Production Line 4"
}
```
Response `201`:
```json
{
  "id": "m1793856451417",
  "productId": "55500",
  "machineName": "Inodose Machine 4",
  "productionLine": "Production Line 4",
  "dateAdded": "5 November 2026"
}
```

### PUT /machines/:id
Update a machine.

```http
PUT /api/v1/machines/m3
```
Request body:
```json
{
  "productId": "37722",
  "machineName": "Inodose Machine 3",
  "productionLine": "Production Line 3"
}
```
Response `200`:
```json
{
  "id": "m3",
  "productId": "37722",
  "machineName": "Inodose Machine 3",
  "productionLine": "Production Line 3",
  "dateAdded": "15 July 2026"
}
```

### DELETE /machines
Delete machines by id.

```http
DELETE /api/v1/machines
```
Request body:
```json
{
  "ids": [
    "m4"
  ]
}
```
Response `200`:
```json
(empty)
```

### PUT /branding
Set the customer logo. logoUrl must be a base64 PNG/JPG/SVG data URL, max 1 MB.

```http
PUT /api/v1/branding
```
Request body:
```json
{
  "customerName": "Gujarat Metal Cast",
  "logoUrl": "data:image/png;base64,iVBORw0…"
}
```
Response `200`:
```json
{
  "customerName": "Gujarat Metal Cast",
  "logoUrl": "data:image/png;base64,iVBORw0…"
}
```

### DELETE /branding
Restore the default logo.

```http
DELETE /api/v1/branding
```
Response `200`:
```json
{
  "customerName": "Gujarat Metal Cast",
  "logoUrl": ""
}
```

### GET /audit-log
Who did what and when (sign-ins, denied actions, settings, manual operations, configuration changes). Newest first.

```http
GET /api/v1/audit-log
```
Response `200`:
```json
[
  {
    "at": "2026-11-05T05:27:31.432Z",
    "userId": "admin",
    "role": "Administrator",
    "action": "Customer logo restored to default",
    "detail": ""
  },
  {
    "at": "2026-11-05T05:27:31.432Z",
    "userId": "admin",
    "role": "Administrator",
    "action": "Customer logo changed",
    "detail": ""
  },
  {
    "at": "2026-11-05T05:27:31.431Z",
    "userId": "admin",
    "role": "Administrator",
    "action": "Machines deleted",
    "detail": "1"
  },
  "… 12 more"
]
```

## TypeScript types
Every request and response shape is defined in `src/api/types.ts` — use it as the schema when building the backend.
