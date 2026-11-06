# Inodose Monitoring — Frontend (React + Tailwind)

Web HMI for the **Inodose stream inoculation dosing machine** (MPM Infosoft).
This is the source project: React 19, TypeScript, Tailwind CSS v4, React Router 7 and Recharts 3, built with Vite.
Every page loads its data through a typed API layer.

The UI is the final approved design. It includes all 38 UI-designer feedback points (26 in round 1, 12 minor updates in round 2) and the Figma alignment.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173  (mock API inside the browser, no backend needed)
```

Sign in with one of the mock accounts:

| User ID | Password | Role |
|---|---|---|
| `admin` | `Admin` | Administrator |
| `supervisor` | `GdRC-MyAu-uS8L` | Supervisor |
| `operator` | `UmbN-haRr-da5D` | Operator |

These exist only in the mock (`src/api/mock/seed.ts`); the real backend owns users and passwords.

### Run against a real HTTP API

```bash
npm run dev:api                      # Express mock API on http://localhost:4000/api/v1
VITE_USE_MOCK=false npm run dev      # the UI now sends real HTTP requests; Vite proxies /api to :4000
```

To point at the real backend, set `API_PROXY_TARGET=http://<backend-host>` for development, or `VITE_API_BASE_URL` for a build.

### Build

```bash
npm run build            # production build → dist/   (VITE_USE_MOCK=false, talks to /api/v1)
npm run build:preview    # static demo build → dist/  (mock API inside the browser)
npm run typecheck
```

`dist/` is a static site that can be hosted on nginx, IIS, S3 or the backend itself. It uses hash routing, so no server rewrites are needed.

---

## Environment variables (`.env*`)

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | `/api/v1` | Base URL of the REST API |
| `VITE_USE_MOCK` | `true` (dev/preview), `false` (production) | Answer API calls in the browser from `src/api/mock` |
| `VITE_MOCK_LATENCY_MS` | `250` | Simulated network delay for the mock |
| `VITE_POLL_INTERVAL_MS` | `5000` | Live-data refresh interval (dashboard, alerts) |
| `API_PROXY_TARGET` | `http://localhost:4000` | Dev-server proxy target for `/api` |

---

## API per page

Pages never call `fetch` directly. Each page uses its own service in `src/api/`, and every service goes through `src/api/client.ts`. The client adds the bearer token, handles errors and signs the user out on a 401. The full contract, with real request and response examples, is in **[docs/API.md](docs/API.md)**.

| Page | Service | Endpoints |
|---|---|---|
| Login | `authApi` (`src/api/auth.ts`) | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` |
| Header / navigation | `commonApi` (`src/api/common.ts`) | `GET /shift`, `GET /machines`, `GET /alerts/live`, `POST /alerts/live/:id/acknowledge`, `GET /branding`, `GET /audit-log` |
| Live Dashboard | `dashboardApi` (`src/api/dashboard.ts`) | `GET /dashboard`, `GET /dashboard/cumulative`, `GET /dashboard/across-molds`, `GET /dashboard/boxes/:boxId` |
| Control Panel | `controlPanelApi` (`src/api/controlPanel.ts`) | `GET /machines/:id/control-panel`, `POST /machines/:id/settings`, `POST /machines/:id/manual-operations/:key` |
| Past Records | `pastRecordsApi` (`src/api/pastRecords.ts`) | `GET /records/dosage`, `GET /records/dosage/:date/components/:name/doses`, `GET /records/doses/:id/series`, `GET /records/across-molds`, `GET /records/alerts`, `POST /records/alerts/:id/acknowledge` |
| Configurations | `configurationsApi` (`src/api/configurations.ts`) | `/components`, `/alert-configs`, `/machines`, `/branding` (GET / POST / PUT / DELETE) |

All request and response types are defined in `src/api/types.ts`; the backend should return exactly these shapes. Endpoint paths are all in `src/api/endpoints.ts`.

**Mock backend.** `src/api/mock/router.ts` implements every endpoint in memory. It enforces the same validation and roles the backend must, and writes an audit log. The same code runs in the browser (`VITE_USE_MOCK=true`) and behind Express (`server/index.ts`). Regenerate `docs/API.md` from it with `npm run docs:api`.

---

## Project structure

```
src/
  main.tsx                 providers (toast → branding → auth → machine/alerts) + app
  App.tsx                  routes (hash router) + auth guard
  config.ts                env-based runtime config
  styles/index.css         Tailwind import, design tokens (@theme), type scale, scrollbars, motion
  api/                     client, endpoints, types, one service per page, mock/
  context/                 AuthContext (user, roles), MachineContext (selected machine, shift),
                           AlertsContext (live alerts, header banner), BrandingContext (customer logo)
  hooks/                   useApi (load + poll + abort), useDismiss, useNow
  lib/                     cn(), permissions, formatters
  components/ui/           Button, Select, Checkbox, Tabs, Pagination, Modal, ConfirmDialog, Table,
                           StatCard, Pill/LevelPill, Tooltip, TextField/DateField/EditableNumber, Toast, Icon
  components/layout/       AppLayout, ScaleToFit (1920 px artboard), Header, Sidebar, AccountMenu, AuditLogDialog
  features/auth/           LoginPage
  features/dashboard/      DashboardPage, charts, FlowDiagram, DosageHistory, AlertsList, BoxDetailDialog
  features/control-panel/  ControlPanelPage
  features/past-records/   PastRecordsPage (dosage + alerts tabs, graph pop-ups)
  features/configurations/ ConfigurationsPage + Components / Alerts / Machines / Administration tabs
  assets/icons/            design-file SVG icons (exported from Figma)
  assets/images/, fonts/   logos, machine image, self-hosted Noto Sans
server/index.ts            Express mock API (same handlers as the in-browser mock)
scripts/gen-api-docs.ts    regenerates docs/API.md
docs/API.md                REST contract with examples
```

---

## Design system

- **Tokens** live in `src/styles/index.css` under `@theme` and are used as normal Tailwind classes:
  - colours: `bg-gray-100`, `text-gray-800`, `text-brand-red`, `bg-dosing-blue`, `text-dosing-blue-dark`, `bg-status-high`…
  - radius: `rounded-lg` (4 px), `rounded-dialog` (8 px, pop-ups only), `rounded-circle`
- **Type scale:** `type-display-1/2`, `type-headline-1`, `type-title-1/3`, `type-body-1/2`, `type-label-1/2`.
- **Scale:** the layout is drawn on a 1920 px artboard with a 14 px root, so Tailwind `1` = 3.5 px. `ScaleToFit` zooms it to the window. Exact designer pixel values are written as `[24px]`.
- **Icons:** `<Icon name="edit" size={20} />` draws `src/assets/icons/edit.svg` as a mask, so it takes the text colour. To change an icon, replace its SVG; to add one, drop a new SVG in the folder and add its name to `IconName`.

## Roles

`src/lib/permissions.ts`:

| Permission | Minimum role |
|---|---|
| View everything, acknowledge alerts | Operator |
| Operate the machine (mode, parameters, manual operations), edit configuration, audit log | Supervisor |
| Customer logo | Administrator |

The UI disables controls a role can't use. The backend must also reject those calls with 403.

## Notes for the backend team

- Tokens: the mock issues an unsigned token. The real API should issue a signed token (JWT or an opaque session) with a 12-hour expiry; "Stay signed in" decides whether the UI keeps it in `localStorage` or `sessionStorage`.
  - An HttpOnly session cookie also works: `client.ts` already sends `credentials: 'include'`.
- Lock out after 5 failed logins (return 429 with a message).
- Machine safety interlocks must be enforced by the controller, not only by the UI.
- `GET /alerts/live`, `/dashboard` and `/dashboard/cumulative` are polled every `VITE_POLL_INTERVAL_MS`. They can be moved to WebSocket/SSE later without touching the pages: only `useApi` and `AlertsContext` would change.
