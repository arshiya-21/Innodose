# Inodose Backend

Node + Express + TypeScript. Serves `/api/*` **and** the V11 frontend on the same origin, so you avoid CORS and can keep CSP tight.

## Run

```powershell
cd D:\Innodose\backend
npm install
copy .env.example .env    # edit if using Postgres
npm run dev
```

Opens on http://localhost:4000. The V11 UI is served at `/`, API at `/api/*`.

Verify:
- http://localhost:4000/              → V11 UI (same as the `frontend/` folder)
- http://localhost:4000/api/health    → `{ "ok": true, "driver": "mock" }`
- http://localhost:4000/api/past-records?from=2026-09-05&to=2026-10-05 → mock rows

Stop whatever was running `npx serve .` — you don't need it anymore, Express serves the same files.

## Switch to Postgres

1. Create a database and run your schema. The queries in `src/db.ts` expect two views:
   - `v_past_records_summary(date, components_count, total_boxes, optimal_dose, over_dose, under_dose, dose_miss, not_poured, components text[], machines text[])`
   - `v_live_boxes_today(box_id, status)`
   Rename / adjust to match your real tables.
2. Fill in `.env`:
   ```
   DB_DRIVER=pg
   PGHOST=... PGPORT=5432 PGUSER=... PGPASSWORD=... PGDATABASE=...
   ```
3. Restart `npm run dev`. Health endpoint will report `"driver": "pg"`.

## Swap to MySQL or MSSQL

In `src/db.ts`, add a new `mysqlDriver()` / `mssqlDriver()` case next to `pgDriver()`. Install the driver (`mysql2` or `mssql`) and mirror the two methods on `DataStore`. The routes and the API shape stay identical.

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | driver status |
| GET | `/api/past-records?from&to&component&machine` | `{ data: DayGroup[] }` |
| GET | `/api/live/snapshot` | `{ boxes: [{id, status}] }` |

Shapes are typed in `src/db.ts` — share these types with any future React client.

## Important caveat about V11

V11's React bundle has its data **baked in**. Just serving it from this backend does NOT make it call `/api/*`. To actually consume these endpoints you need to either:

- Rebuild the client (see `D:\Innodose\inodose-react\`) and point its data layer at `/api/*`, **or**
- Add a shim script that patches V11's runtime data before React mounts (fragile — not recommended).

Build the API shape now (what you're doing); migrate the frontend to the rewrite over time.
