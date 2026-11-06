import { Router, type Request } from 'express';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import mysql from 'mysql2/promise';
import type { AdminStore } from '../admin/types.ts';

interface ComponentRow extends RowDataPacket {
  id: string;
  component_id: string;
  name: string;
  pouring_temp_min_c: number;
  pouring_temp_max_c: number;
  pouring_time_sec: number;
  flow_rate_gms_sec: string | number;
  expected_dosage_gms: number;
  grade: string;
  pattern: string;
  inoculant_id: number | null;
  inoculant_name: string | null;
  bunch_weight_kg: number;
  active: 0 | 1;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  updated_by: string | null;
}

const COMP_SELECT = 'SELECT c.*, i.name AS inoculant_name FROM components c LEFT JOIN inoculants i ON i.id = c.inoculant_id';

function shape(r: ComponentRow) {
  return {
    id: String(r.id),
    componentId: r.component_id,
    // Expose under both keys so the Configurations UI (componentName) and the
    // machine-params path (name) both keep working.
    componentName: r.name,
    name: r.name,
    pouringTempMin: r.pouring_temp_min_c,
    pouringTempMax: r.pouring_temp_max_c,
    pouringTempC: { min: r.pouring_temp_min_c, max: r.pouring_temp_max_c },
    pouringTimeSec: r.pouring_time_sec,
    inoculantFlowRate: Number(r.flow_rate_gms_sec),
    flowRateGmsPerSec: Number(r.flow_rate_gms_sec),
    expectedDosageGms: r.expected_dosage_gms,
    grade: r.grade,
    pattern: r.pattern ?? '',
    inoculantId: r.inoculant_id == null ? null : String(r.inoculant_id),
    inoculantName: r.inoculant_name ?? null,
    bunchWeightKg: r.bunch_weight_kg,
    active: !!r.active,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    updatedBy: r.updated_by ?? null,
  };
}

/**
 * Lazily open the same MySQL connection the admin store uses.
 * Returns null if MySQL isn't configured — endpoints then 503 cleanly.
 */
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

interface ComponentInput {
  componentId: string;
  name?: string;
  componentName?: string;
  pouringTempC?: { min: number; max: number };
  pouringTempMin?: number;
  pouringTempMax?: number;
  pouringTimeSec: number;
  flowRateGmsPerSec?: number;
  inoculantFlowRate?: number;
  expectedDosageGms: number;
  grade: string;
  pattern?: string;
  inoculantId?: string | number | null;
  bunchWeightKg: number;
  active?: boolean;
}

function fieldsFromInput(input: ComponentInput) {
  const min = input.pouringTempC?.min ?? input.pouringTempMin ?? 0;
  const max = input.pouringTempC?.max ?? input.pouringTempMax ?? 0;
  const name = input.componentName ?? input.name ?? '';
  const flow = input.inoculantFlowRate ?? input.flowRateGmsPerSec ?? 0;
  return {
    component_id: input.componentId,
    name,
    pouring_temp_min_c: Number(min),
    pouring_temp_max_c: Number(max),
    pouring_time_sec: Number(input.pouringTimeSec),
    flow_rate_gms_sec: Number(flow),
    expected_dosage_gms: Number(input.expectedDosageGms),
    grade: input.grade,
    pattern: String(input.pattern ?? '').trim(),
    inoculant_id: input.inoculantId ? Number(input.inoculantId) : null,
    bunch_weight_kg: Number(input.bunchWeightKg),
    active: input.active === false ? 0 : 1,
  };
}

/** Resolve the signed-in username from the Bearer token, or null. */
async function usernameFrom(req: Request, store?: AdminStore): Promise<string | null> {
  if (!store) return null;
  const auth = req.header('authorization') || req.header('Authorization');
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const u = await store.userFromSession(token);
  return u?.username ?? null;
}

export function componentsRouter(adminStore?: AdminStore) {
  const r = Router();

  r.get('/components', async (_req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'Components store unavailable' });
    const [rows] = await p.query<ComponentRow[]>(
      `${COMP_SELECT} WHERE c.active = 1 ORDER BY c.component_id`,
    );
    res.json(rows.map(shape));
  });

  r.get('/components/by-name/:name', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'Components store unavailable' });
    const [rows] = await p.query<ComponentRow[]>(
      `${COMP_SELECT} WHERE c.name = ? LIMIT 1`,
      [req.params.name],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Component not found' });
    res.json(shape(rows[0]));
  });

  r.get('/components/:componentId', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'Components store unavailable' });
    const [rows] = await p.query<ComponentRow[]>(
      `${COMP_SELECT} WHERE c.component_id = ? LIMIT 1`,
      [req.params.componentId],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Component not found' });
    res.json(shape(rows[0]));
  });

  r.post('/components', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'Components store unavailable' });
    try {
      const f = fieldsFromInput(req.body);
      const who = await usernameFrom(req, adminStore);
      const [out] = await p.query(
        `INSERT INTO components
          (component_id, name, pouring_temp_min_c, pouring_temp_max_c, pouring_time_sec,
           flow_rate_gms_sec, expected_dosage_gms, grade, pattern, inoculant_id, bunch_weight_kg, active, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [f.component_id, f.name, f.pouring_temp_min_c, f.pouring_temp_max_c, f.pouring_time_sec,
         f.flow_rate_gms_sec, f.expected_dosage_gms, f.grade, f.pattern, f.inoculant_id, f.bunch_weight_kg, f.active, who],
      );
      const id = (out as { insertId: number }).insertId;
      const [rows] = await p.query<ComponentRow[]>(`${COMP_SELECT} WHERE c.id = ?`, [id]);
      res.status(201).json(shape(rows[0]));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  r.put('/components/:id', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'Components store unavailable' });
    try {
      const f = fieldsFromInput(req.body);
      const who = await usernameFrom(req, adminStore);
      await p.query(
        `UPDATE components SET
           component_id = ?, name = ?, pouring_temp_min_c = ?, pouring_temp_max_c = ?,
           pouring_time_sec = ?, flow_rate_gms_sec = ?, expected_dosage_gms = ?,
           grade = ?, pattern = ?, inoculant_id = ?, bunch_weight_kg = ?, active = ?, updated_by = ?
         WHERE id = ?`,
        [f.component_id, f.name, f.pouring_temp_min_c, f.pouring_temp_max_c, f.pouring_time_sec,
         f.flow_rate_gms_sec, f.expected_dosage_gms, f.grade, f.pattern, f.inoculant_id, f.bunch_weight_kg, f.active, who,
         req.params.id],
      );
      const [rows] = await p.query<ComponentRow[]>(`${COMP_SELECT} WHERE c.id = ?`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(shape(rows[0]));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  r.delete('/components/:id', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'Components store unavailable' });
    await p.query('DELETE FROM components WHERE id = ?', [req.params.id]);
    res.status(204).end();
  });

  // Bulk delete: DELETE /components  { ids: [...] }  (API contract)
  r.delete('/components', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'Components store unavailable' });
    const ids: unknown = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids (non-empty array) is required.' });
    }
    const placeholders = ids.map(() => '?').join(',');
    await p.query(`DELETE FROM components WHERE id IN (${placeholders})`, ids as (string | number)[]);
    res.status(204).end();
  });

  return r;
}
