import { Router, type Request } from 'express';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import type { AdminStore } from '../admin/types.ts';

interface MachineRow extends RowDataPacket {
  id: number;
  product_id: string;
  name: string;
  production_line: string;
  active: 0 | 1;
  date_added: string | Date;
  updated_at: Date | string | null;
  updated_by: string | null;
}

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
    dateStrings: true,
  });
  return pool;
}

function shape(r: MachineRow) {
  return {
    id: r.id,
    productId: r.product_id,
    name: r.name,
    machineName: r.name,
    productionLine: r.production_line,
    active: !!r.active,
    dateAdded: typeof r.date_added === 'string' ? r.date_added : r.date_added.toISOString().slice(0, 10),
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    updatedBy: r.updated_by ?? null,
  };
}

export function machinesRouter(adminStore?: AdminStore) {
  const r = Router();

  r.get('/machines', async (_req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const [rows] = await p.query<MachineRow[]>('SELECT * FROM machines ORDER BY id');
    res.json(rows.map(shape));
  });

  r.post('/machines', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const { productId, name, productionLine, dateAdded } = req.body ?? {};
    if (!productId || !name || !productionLine) {
      return res.status(400).json({ error: 'productId, name, productionLine are required' });
    }
    try {
      const who = await usernameFrom(req, adminStore);
      const [out] = await p.query(
        `INSERT INTO machines (product_id, name, production_line, date_added, updated_by)
         VALUES (?, ?, ?, COALESCE(?, CURRENT_DATE), ?)`,
        [productId, name, productionLine, dateAdded || null, who],
      );
      const [rows] = await p.query<MachineRow[]>('SELECT * FROM machines WHERE id = ?', [(out as { insertId: number }).insertId]);
      res.status(201).json(shape(rows[0]));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  r.put('/machines/:id', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const { productId, name, productionLine, active, dateAdded } = req.body ?? {};
    const [existing] = await p.query<MachineRow[]>('SELECT * FROM machines WHERE id = ?', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Not found' });
    const cur = existing[0];
    const who = await usernameFrom(req, adminStore);
    await p.query(
      `UPDATE machines SET product_id = ?, name = ?, production_line = ?, active = ?, date_added = ?, updated_by = ?
       WHERE id = ?`,
      [
        productId ?? cur.product_id,
        name ?? cur.name,
        productionLine ?? cur.production_line,
        active != null ? (active ? 1 : 0) : cur.active,
        dateAdded ?? (typeof cur.date_added === 'string' ? cur.date_added : cur.date_added.toISOString().slice(0, 10)),
        who,
        req.params.id,
      ],
    );
    const [rows] = await p.query<MachineRow[]>('SELECT * FROM machines WHERE id = ?', [req.params.id]);
    res.json(shape(rows[0]));
  });

  r.delete('/machines/:id', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    await p.query('DELETE FROM machines WHERE id = ?', [req.params.id]);
    res.status(204).end();
  });

  // Bulk delete: DELETE /machines  { ids: [...] }  (API contract)
  r.delete('/machines', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const ids: unknown = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids (non-empty array) is required.' });
    }
    // The "m1"/"m2" ids the frontend uses carry an "m" prefix we strip here
    // so the SQL WHERE matches the numeric primary key.
    const numeric = ids.map((x) => Number(String(x).replace(/^m/, '')));
    const placeholders = numeric.map(() => '?').join(',');
    await p.query(`DELETE FROM machines WHERE id IN (${placeholders})`, numeric);
    res.status(204).end();
  });

  return r;
}
