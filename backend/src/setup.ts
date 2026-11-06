/**
 * First-run setup mode.
 *
 * A fresh install has no database details yet (no MYSQL_HOST in the environment / .env). Instead of failing,
 * the backend starts a tiny server that serves the web UI plus three endpoints:
 *   GET  /api/v1/setup/status   → { setupRequired: true }
 *   POST /api/v1/setup/test     → try the connection, change nothing
 *   POST /api/v1/setup/save     → test, write the details into .env, then start the normal application
 *
 * These endpoints exist ONLY while the install is unconfigured. Once MYSQL_HOST is set, setup mode never runs
 * again (the normal app answers /setup/* with "already configured"), so nobody can re-point a live system at
 * another database through this door. Changing the details later means editing .env and restarting the service.
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import type { Server } from 'node:http';
import { log } from './lib/logger.ts';

const slog = log.child('setup');

export const envFilePath = () => path.join(process.env.INODOSE_HOME ?? process.cwd(), '.env');
export const needsSetup = () => !process.env.MYSQL_HOST;

interface Conn { host: string; port: string; user: string; password: string; database: string }

function parse(body: unknown): { c?: Conn; error?: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const s = (k: string) => String(b[k] ?? '').trim();
  const c: Conn = { host: s('host'), port: s('port') || '3306', user: s('user'), password: String(b.password ?? ''), database: s('database') };
  if (!c.host) return { error: 'Database host is required.' };
  if (!/^\d{1,5}$/.test(c.port)) return { error: 'Port must be a number.' };
  if (!c.user) return { error: 'Database user is required.' };
  if (!/^[A-Za-z0-9_$-]{1,64}$/.test(c.database)) return { error: 'Database name may only contain letters, numbers, _ $ and -.' };
  return { c };
}

/** Tries to connect; creates the database when it does not exist and the user is allowed to. Returns null on success. */
export async function tryConnect(c: Conn): Promise<string | null> {
  const base = { host: c.host, port: Number(c.port), user: c.user, password: c.password, connectTimeout: 8000 };
  try {
    let conn;
    try {
      conn = await mysql.createConnection({ ...base, database: c.database });
    } catch (e) {
      if ((e as { code?: string }).code !== 'ER_BAD_DB_ERROR') throw e;
      const admin = await mysql.createConnection(base);
      try {
        await admin.query(`CREATE DATABASE \`${c.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      } finally { await admin.end(); }
      conn = await mysql.createConnection({ ...base, database: c.database });
    }
    await conn.query('SELECT 1');
    await conn.end();
    return null;
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    const m = (e as Error).message;
    if (code === 'ER_ACCESS_DENIED_ERROR') return 'Login rejected: wrong user or password.';
    if (code === 'ER_DBACCESS_DENIED_ERROR' || code === 'ER_SPECIFIC_ACCESS_DENIED_ERROR') return `This user has no access to the database "${c.database}". Create it and grant access (see the guide).`;
    if (code === 'ER_BAD_DB_ERROR') return `Database "${c.database}" does not exist.`;
    if (/ENOTFOUND|EAI_AGAIN/.test(code + m)) return 'Server name not found. Check the host.';
    if (/ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH/.test(code + m)) return 'Could not reach the database server. Check the host, port and that MySQL is running.';
    return m || 'Could not connect.';
  }
}

/** Sets/adds KEY=value lines, keeping every other line of the existing file (comments included). */
export function writeEnv(values: Record<string, string>) {
  const file = envFilePath();
  let lines: string[] = [];
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/); } catch { /* new file */ }
  const left = new Map(Object.entries(values));
  lines = lines.map((l) => {
    const m = /^\s*([A-Z0-9_]+)\s*=/.exec(l);
    if (m && left.has(m[1])) { const v = left.get(m[1])!; left.delete(m[1]); return `${m[1]}=${v}`; }
    return l;
  });
  for (const [k, v] of left) lines.push(`${k}=${v}`);
  fs.writeFileSync(file, lines.join('\n').replace(/\n*$/, '\n'));
}

/** Runs the setup server until the details are saved, then resolves so the caller can start the real app. */
export function runSetupMode(port: number, spaDir: string): Promise<void> {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json({ limit: '50kb' }));
    let server: Server;

    app.get('/api/health', (_req, res) => res.json({ ok: true, setup: true }));
    app.get('/api/v1/setup/status', (_req, res) => res.json({ setupRequired: true }));

    app.post('/api/v1/setup/test', async (req, res) => {
      const { c, error } = parse(req.body);
      if (!c) return res.status(400).json({ message: error });
      const err = await tryConnect(c);
      res.status(err ? 400 : 200).json(err ? { message: err } : { ok: true });
    });

    app.post('/api/v1/setup/save', async (req, res) => {
      const { c, error } = parse(req.body);
      if (!c) return res.status(400).json({ message: error });
      const err = await tryConnect(c);
      if (err) return res.status(400).json({ message: err });
      try {
        writeEnv({
          PORT: String(port), ADMIN_DRIVER: 'mysql', DB_DRIVER: 'mock',
          MYSQL_HOST: c.host, MYSQL_PORT: c.port, MYSQL_USER: c.user, MYSQL_PASSWORD: c.password,
          MYSQL_DATABASE: c.database, MYSQL_DATA_DATABASE: c.database,
        });
      } catch (e) {
        return res.status(500).json({ message: `Could not write ${envFilePath()}: ${(e as Error).message}` });
      }
      Object.assign(process.env, {
        ADMIN_DRIVER: 'mysql', MYSQL_HOST: c.host, MYSQL_PORT: c.port, MYSQL_USER: c.user,
        MYSQL_PASSWORD: c.password, MYSQL_DATABASE: c.database, MYSQL_DATA_DATABASE: c.database,
      });
      slog.info(`database details saved to ${envFilePath()} — starting the application`);
      res.json({ ok: true });
      setTimeout(() => { server.close(() => resolve()); server.closeAllConnections?.(); }, 400);
    });

    if (fs.existsSync(path.join(spaDir, 'index.html'))) {
      app.use(express.static(spaDir));
      app.get('*', (_req, res) => res.sendFile(path.join(spaDir, 'index.html')));
    } else {
      app.get('/', (_req, res) => res.send('<p>Setup mode: build the frontend (npm run build in frontend/) or use the dev server on :5173.</p>'));
    }

    server = app.listen(port, () => slog.warn(`NOT CONFIGURED — open http://<this-server>:${port}/ in a browser to enter the database details`));
  });
}
