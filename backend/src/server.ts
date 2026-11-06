import 'dotenv/config';
// Plant clock: alert times, the header clock and shift all use the server's local time. Cloud hosts default to UTC,
// which showed 17:31 when the plant clock said 23:01. Set TZ in the environment to override.
process.env.TZ ||= 'Asia/Kolkata';
import './asyncSafe.ts'; // must come first: lets a failing async route return 500 instead of killing the process
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeStore } from './db.ts';
import { makeAdminStore } from './admin/store.ts';
import { pastRecordsRouter } from './routes/pastRecords.ts';
import { liveDashboardRouter } from './routes/liveDashboard.ts';
import { authRouter } from './routes/auth.ts';
import { authV1Router } from './routes/authV1.ts';
import { v1RecordsRouter } from './routes/v1Records.ts';
import { v1CommonRouter } from './routes/v1Common.ts';
import { v1DashboardRouter } from './routes/v1Dashboard.ts';
import { v1DbDetailsRouter } from './routes/v1DbDetails.ts';
import { v1PlcRouter } from './routes/v1Plc.ts';
import { v1EmailSettingsRouter } from './routes/v1EmailSettings.ts';
import { adminRouter } from './routes/admin.ts';
import { componentsRouter } from './routes/components.ts';
import { castingDetailsRouter } from './routes/castingDetails.ts';
import { machinesRouter } from './routes/machines.ts';
import { inoculantsRouter } from './routes/inoculants.ts';
import { alertsRouter } from './routes/alerts.ts';
import fs from 'node:fs';
import { log } from './lib/logger.ts';
import { startAlertMailer } from './routes/alertMailer.ts';
import { ensureDesktopShortcut } from './lib/desktopShortcut.ts';
import { needsSetup, runSetupMode } from './setup.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Fresh install (no database details yet): run the first-run setup page, then carry on with the real app.
  if (needsSetup()) {
    const dir = process.env.INODOSE_HOME ? path.join(process.env.INODOSE_HOME, 'public') : path.resolve(__dirname, '..', '..', 'frontend', 'dist');
    await runSetupMode(Number(process.env.PORT ?? 4000), dir);
  }
  const app = express();
  const store = makeStore();
  const admin = await makeAdminStore();

  app.use(express.json({ limit: '2mb' }));

  // Request logger: one short line per request. Strip the /api/v1 prefix,
  // skip cache-hit 304s (too chatty when the dashboard polls), and only show
  // duration when it's noticeable (≥10ms).
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      if (res.statusCode === 304) return;
      const ms = Date.now() - start;
      const path = req.originalUrl.replace(/^\/api\/v\d+/, '');
      const line = `${req.method} ${path} ${res.statusCode}${ms >= 10 ? ` ${ms}ms` : ''}`;
      if (res.statusCode >= 500) log.error(line);
      else if (res.statusCode >= 400) log.warn(line);
      else log.info(line);
    });
    next();
  });

  // ---- /api/v1 — matches the React frontend's contract ----
  app.use('/api/v1', authV1Router(admin));
  app.use('/api/v1', v1RecordsRouter(admin)); // real Past Records; must precede the v1Common stubs
  app.use('/api/v1', v1CommonRouter(admin));
  app.use('/api/v1', v1DashboardRouter(admin));
  app.use('/api/v1', v1DbDetailsRouter(admin));
  app.use('/api/v1', v1PlcRouter(admin));
  app.use('/api/v1', v1EmailSettingsRouter(admin));
  // Everything below is also exposed under /api/v1 so the frontend can reach
  // it via its default VITE_API_BASE_URL=/api/v1. Response shapes may still
  // differ from the mock — we align them one endpoint at a time.
  app.use('/api/v1', adminRouter(admin));
  app.use('/api/v1', alertsRouter(admin));
  app.use('/api/v1', componentsRouter(admin));
  app.use('/api/v1', machinesRouter(admin));
  app.use('/api/v1', inoculantsRouter(admin));
  app.use('/api/v1', castingDetailsRouter());
  app.use('/api/v1', pastRecordsRouter(store));
  app.use('/api/v1', liveDashboardRouter(store));

  // ---- Module-prefixed routes (used by the admin SPA / scripts) ----
  app.use('/api/auth', authRouter(admin));

  // Administration (users, roles, company, alerts)
  app.use('/api/administration', adminRouter(admin));
  app.use('/api/administration', alertsRouter(admin));

  // Configuration (components + machines)
  app.use('/api/configuration', componentsRouter(admin));
  app.use('/api/configuration', machinesRouter(admin));
  app.use('/api/configuration', inoculantsRouter(admin));

  // Dashboard / Control Panel / Past Records
  app.use('/api/dashboard', liveDashboardRouter(store));
  app.use('/api/controlpanel', liveDashboardRouter(store));
  app.use('/api/pastrecords', pastRecordsRouter(store));
  app.use('/api/pastrecords', castingDetailsRouter());

  // ---- Back-compat aliases (unprefixed /api/*) ----
  app.use('/api', authRouter(admin));
  app.use('/api', adminRouter(admin));
  app.use('/api', componentsRouter(admin));
  app.use('/api', castingDetailsRouter());
  app.use('/api', machinesRouter(admin));
  app.use('/api', inoculantsRouter(admin));
  app.use('/api', alertsRouter(admin));
  app.use('/api', pastRecordsRouter(store));
  app.use('/api', liveDashboardRouter(store));

  // Setup endpoints only work on an unconfigured install (see setup.ts); here the system is already configured.
  app.get('/api/v1/setup/status', (_req, res) => res.json({ setupRequired: false }));
  app.post('/api/v1/setup/:action', (_req, res) => res.status(403).json({ message: 'Already configured. Change the database in Administration → Settings → DB Details (or edit .env and restart).' }));

  app.get('/api/health', (_req, res) => res.json({
    ok: true,
    driver: process.env.DB_DRIVER ?? 'mock',
    adminDriver: process.env.ADMIN_DRIVER ?? 'memory',
  }));

  // ---- Serve the Vite build if it exists ----
  // During dev, the frontend runs on :5173 and proxies /api here, so dist/
  // doesn't need to exist. Only serve the SPA in production builds.
  const spaDir = process.env.INODOSE_HOME ? path.join(process.env.INODOSE_HOME, 'public') : path.resolve(__dirname, '..', '..', 'frontend', 'dist');
  const spaIndex = path.join(spaDir, 'index.html');
  const hasSpa = fs.existsSync(spaIndex);
  if (hasSpa) {
    app.use(express.static(spaDir));
    app.get('*', (_req, res) => res.sendFile(spaIndex));
  } else {
    app.get('/', (_req, res) => res.status(200).send(
      '<p>Backend running. Frontend dev server is on <a href="http://localhost:5173">http://localhost:5173</a>, ' +
      'or run <code>npm run build</code> in <code>frontend/</code> to serve it from here.</p>',
    ));
  }

  // Last-resort error handler: log the real error, answer this one request with a JSON 500, keep serving.
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error(`${req.method} ${req.originalUrl} failed`, err);
    if (res.headersSent) return;
    res.status(500).json({ message: 'Server error. Please try again.' });
  });

  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => {
    const driver = process.env.DB_DRIVER ?? 'mock';
    const admin = process.env.ADMIN_DRIVER ?? 'memory';
    startAlertMailer();
    void ensureDesktopShortcut(port, hasSpa);
    log.info(`backend ready on http://localhost:${port} (data: ${driver}, admin: ${admin})`);
  });
}

// Never let a stray error outside a request (timers, background tasks) take the whole backend down.
process.on('unhandledRejection', (e) => log.error('unhandled rejection (backend kept running)', e));
process.on('uncaughtException', (e) => log.error('uncaught exception (backend kept running)', e));

main().catch((e) => {
  log.error('startup failed', e);
  process.exit(1);
});
