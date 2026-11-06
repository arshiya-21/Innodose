/**
 * Alert configuration: tolerances, per-alert enabled flag, and notification
 * recipient emails. Schema mirrors the innodose.alert_* tables.
 */
import { Router, type Request } from 'express';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import type { AdminStore } from '../admin/types.ts';
import { tolFor, type TolMap } from './alertRules.ts';
import { DEFAULT_SOURCE, getAlertSource, listSourceOptions, saveAlertSource } from './alertSource.ts';

async function usernameFrom(req: Request, store?: AdminStore): Promise<string | null> {
  if (!store) return null;
  const auth = req.header('authorization') || req.header('Authorization');
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const u = await store.userFromSession(token);
  return u?.username ?? null;
}

let pool: Pool | null = null;
function getPool(): Pool | null {
  if (pool) return pool;
  if ((process.env.ADMIN_DRIVER ?? 'memory') !== 'mysql') return null;
  pool = mysql.createPool({
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? 'inodose_test',
    waitForConnections: true, connectionLimit: 5,
  });
  return pool;
}

interface TolRow extends RowDataPacket {
  id: number; alert_type: string; min_tolerance: number; max_tolerance: number;
}
interface CfgRow extends RowDataPacket {
  alert_type: string; enabled: 0 | 1;
}
interface UserRow extends RowDataPacket {
  id: number; alert_name: string; email: string; enabled: 0 | 1;
}

export function alertsRouter(adminStore?: AdminStore) {
  const r = Router();

  // ---- Alert data source (table + dose column the calculation reads) ----
  r.get('/alert-source', async (_req, res) => {
    const p = getPool(); if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const [current, tables] = await Promise.all([getAlertSource(p), listSourceOptions(p)]);
    res.json({ table: current.table, column: current.column, defaults: DEFAULT_SOURCE, tables });
  });

  r.put('/alert-source', async (req, res) => {
    const p = getPool(); if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const { table, column } = req.body ?? {};
    if (typeof table !== 'string' || typeof column !== 'string') return res.status(400).json({ error: 'table and column are required' });
    const err = await saveAlertSource(p, table, column);
    if (err) return res.status(400).json({ error: err });
    res.json({ table, column });
  });

  // ---- Tolerances ----
  r.get('/alert-tolerances', async (_req, res) => {
    const p = getPool(); if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const [rows] = await p.query<TolRow[]>('SELECT * FROM alert_tolerances ORDER BY alert_type');
    res.json(rows.map(r => ({ id: r.id, alertType: r.alert_type, min: r.min_tolerance, max: r.max_tolerance })));
  });

  r.put('/alert-tolerances/:alertType', async (req, res) => {
    const p = getPool(); if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const { min, max } = req.body ?? {};
    if (typeof min !== 'number' || typeof max !== 'number') {
      return res.status(400).json({ error: 'min and max (number) are required' });
    }
    await p.query(
      `INSERT INTO alert_tolerances (alert_type, min_tolerance, max_tolerance)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE min_tolerance = VALUES(min_tolerance), max_tolerance = VALUES(max_tolerance)`,
      [req.params.alertType, min, max],
    );
    res.json({ alertType: req.params.alertType, min, max });
  });

  // ---- Alert config (enable/disable toggles) ----
  r.get('/alert-config', async (_req, res) => {
    const p = getPool(); if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const [rows] = await p.query<CfgRow[]>('SELECT * FROM alert_config ORDER BY alert_type');
    res.json(rows.map(r => ({ alertType: r.alert_type, enabled: !!r.enabled })));
  });

  r.put('/alert-config/:alertType', async (req, res) => {
    const p = getPool(); if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const enabled = !!req.body?.enabled;
    await p.query(
      `INSERT INTO alert_config (alert_type, enabled) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
      [req.params.alertType, enabled ? 1 : 0],
    );
    res.json({ alertType: req.params.alertType, enabled });
  });

  // ---- Alert recipients ----
  r.get('/alert-users', async (req, res) => {
    const p = getPool(); if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const alertName = req.query.alertName ? String(req.query.alertName) : null;
    const [rows] = alertName
      ? await p.query<UserRow[]>('SELECT * FROM alert_users WHERE alert_name = ? ORDER BY id', [alertName])
      : await p.query<UserRow[]>('SELECT * FROM alert_users ORDER BY alert_name, id');
    res.json(rows.map(r => ({ id: r.id, alertName: r.alert_name, email: r.email, enabled: !!r.enabled })));
  });

  r.post('/alert-users', async (req, res) => {
    const p = getPool(); if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const { alertName, email, enabled = true } = req.body ?? {};
    if (!alertName || !email) return res.status(400).json({ error: 'alertName and email are required' });
    const [out] = await p.query(
      'INSERT INTO alert_users (alert_name, email, enabled) VALUES (?, ?, ?)',
      [alertName, email, enabled ? 1 : 0],
    );
    res.status(201).json({ id: (out as { insertId: number }).insertId, alertName, email, enabled: !!enabled });
  });

  r.delete('/alert-users/:id', async (req, res) => {
    const p = getPool(); if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    await p.query('DELETE FROM alert_users WHERE id = ?', [req.params.id]);
    res.status(204).end();
  });

  // Wipe all alert recipients. Optional ?alertName=... narrows the delete to
  // a single alert type. Used for one-shot cleanup when duplicates piled up.
  r.delete('/alert-users', async (req, res) => {
    const p = getPool(); if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const alertName = req.query.alertName ? String(req.query.alertName) : null;
    const [out] = alertName
      ? await p.query('DELETE FROM alert_users WHERE alert_name = ?', [alertName])
      : await p.query('DELETE FROM alert_users');
    res.json({ deleted: (out as { affectedRows: number }).affectedRows });
  });

  // ---- Aggregated view used by the Configurations > Alerts UI ----
  // One row per alert type with its enabled flag and the list of recipient
  // emails, joined from alert_config + alert_users.
  r.get('/alert-configs', async (_req, res) => {
    const p = getPool(); if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const [cfg] = await p.query<CfgRow[]>('SELECT * FROM alert_config ORDER BY alert_type');
    const [users] = await p.query<UserRow[]>('SELECT * FROM alert_users WHERE enabled = 1 ORDER BY alert_name, id');
    const emailsByType = new Map<string, Set<string>>();
    for (const u of users) {
      const set = emailsByType.get(u.alert_name) ?? new Set<string>();
      set.add(u.email);
      emailsByType.set(u.alert_name, set);
    }
    const [tols] = await p.query<TolRow[]>("SELECT * FROM alert_tolerances");
    const tolMap: TolMap = new Map(tols.map((t) => [t.alert_type, { min: Number(t.min_tolerance), max: Number(t.max_tolerance) }]));
    res.json(
      cfg.map((c, i) => ({
        id: `ac${i + 1}`,
        alertType: c.alert_type,
        enabled: !!c.enabled,
        emails: [...(emailsByType.get(c.alert_type) ?? [])],
        minTolerance: tolFor(tolMap, c.alert_type).min,
        maxTolerance: tolFor(tolMap, c.alert_type).max,
      })),
    );
  });

  r.put('/alert-configs', async (req, res) => {
    const p = getPool(); if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const body = req.body;
    if (!Array.isArray(body)) return res.status(400).json({ error: 'Expected an array of alert configs' });
    const who = await usernameFrom(req, adminStore);
    const conn = await p.getConnection();
    try {
      await conn.beginTransaction();
      for (const item of body as Array<{ alertType: string; enabled: boolean; emails: string[]; minTolerance?: number; maxTolerance?: number }>) {
        if (!item?.alertType) continue;
        await conn.query(
          `INSERT INTO alert_config (alert_type, enabled, updated_by) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_by = VALUES(updated_by)`,
          [item.alertType, item.enabled ? 1 : 0, who],
        );
        if (Number.isFinite(Number(item.minTolerance)) && Number.isFinite(Number(item.maxTolerance))) {
          if (Number(item.minTolerance) > Number(item.maxTolerance)) throw new Error(`${item.alertType}: min tolerance cannot exceed max`);
          await conn.query(
            `INSERT INTO alert_tolerances (alert_type, min_tolerance, max_tolerance) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE min_tolerance = VALUES(min_tolerance), max_tolerance = VALUES(max_tolerance)`,
            [item.alertType, Number(item.minTolerance), Number(item.maxTolerance)],
          );
        }
        await conn.query('DELETE FROM alert_users WHERE alert_name = ?', [item.alertType]);
        const uniqueEmails = [...new Set((item.emails ?? []).map((e) => (e ?? '').trim()).filter(Boolean))];
        for (const email of uniqueEmails) {
          await conn.query(
            'INSERT INTO alert_users (alert_name, email, enabled, updated_by) VALUES (?, ?, 1, ?)',
            [item.alertType, email, who],
          );
        }
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      return res.status(500).json({ error: (e as Error).message });
    } finally {
      conn.release();
    }
    // Re-read so the client gets the canonical shape back.
    const [cfg] = await p.query<CfgRow[]>('SELECT * FROM alert_config ORDER BY alert_type');
    const [users] = await p.query<UserRow[]>('SELECT * FROM alert_users WHERE enabled = 1 ORDER BY alert_name, id');
    const emailsByType = new Map<string, Set<string>>();
    for (const u of users) {
      const set = emailsByType.get(u.alert_name) ?? new Set<string>();
      set.add(u.email);
      emailsByType.set(u.alert_name, set);
    }
    const [tols] = await p.query<TolRow[]>("SELECT * FROM alert_tolerances");
    const tolMap: TolMap = new Map(tols.map((t) => [t.alert_type, { min: Number(t.min_tolerance), max: Number(t.max_tolerance) }]));
    res.json(
      cfg.map((c, i) => ({
        id: `ac${i + 1}`,
        alertType: c.alert_type,
        enabled: !!c.enabled,
        emails: [...(emailsByType.get(c.alert_type) ?? [])],
        minTolerance: tolFor(tolMap, c.alert_type).min,
        maxTolerance: tolFor(tolMap, c.alert_type).max,
      })),
    );
  });

  return r;
}
