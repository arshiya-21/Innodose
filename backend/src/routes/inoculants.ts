import { Router, type Request } from 'express';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import type { AdminStore } from '../admin/types.ts';

/**
 * Inoculant master.
 *   GET  /inoculant-types                       fixed list of types (own table `inoculant_types`)
 *   GET/POST /inoculants, PUT /inoculants/:id, DELETE /inoculants { ids }
 */
interface Row extends RowDataPacket {
  id: number; name: string; type_id: number; type_name: string; application: string;
  size_mm: string; specific_gravity: string | number | null; content_pct: string | number | null;
  updated_at: Date | string | null; updated_by: string | null;
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
    waitForConnections: true, connectionLimit: 3, dateStrings: true,
  });
  return pool;
}

async function usernameFrom(req: Request, store?: AdminStore): Promise<string | null> {
  const token = (req.header('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!store || !token) return null;
  return (await store.userFromSession(token))?.username ?? null;
}

const SELECT = `SELECT i.*, t.name AS type_name FROM inoculants i JOIN inoculant_types t ON t.id = i.type_id`;

const shape = (r: Row) => ({
  id: String(r.id),
  name: r.name,
  typeId: String(r.type_id),
  type: r.type_name,
  application: r.application,
  size: r.size_mm,
  specificGravity: r.specific_gravity == null ? null : Number(r.specific_gravity),
  contentPct: r.content_pct == null ? null : Number(r.content_pct),
  updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  updatedBy: r.updated_by ?? null,
});

function clean(b: Record<string, unknown> | undefined) {
  const s = (k: string) => String(b?.[k] ?? '').trim();
  const t = { name: s('name'), type: s('type'), application: s('application'), size: s('size') };
  const label: Record<string, string> = { name: 'Inoculant name', type: 'Type of inoculant', application: 'Application', size: 'Size' };
  const missing = Object.entries(t).find(([, x]) => !x)?.[0];
  if (missing) return { v: null, error: `${label[missing]} is required` };
  if (t.type.length > 100) return { v: null, error: 'Type of inoculant is too long (max 100 characters)' };
  const num = (k: string, name: string, max: number) => {
    const n = Number(b?.[k]);
    return b?.[k] === '' || b?.[k] == null || !Number.isFinite(n) || n <= 0 || n > max ? `${name} must be a number between 0 and ${max}` : null;
  };
  const err = num('specificGravity', 'Specific gravity', 20) ?? num('contentPct', 'Content', 100);
  if (err) return { v: null, error: err };
  return { v: { ...t, specificGravity: Number(b!.specificGravity), contentPct: Number(b!.contentPct) }, error: null };
}

/** Type is typed as text: reuse the matching row of inoculant_types, or create it. */
async function typeIdFor(p: Pool, name: string): Promise<number> {
  await p.query('INSERT IGNORE INTO inoculant_types (name, sort_order) SELECT ?, COALESCE(MAX(sort_order), 0) + 1 FROM inoculant_types', [name]);
  const [rows] = await p.query<RowDataPacket[]>('SELECT id FROM inoculant_types WHERE name = ? LIMIT 1', [name]);
  return Number(rows[0].id);
}

const problem = (e: unknown) => {
  const code = (e as { code?: string }).code;
  if (code === 'ER_DUP_ENTRY') return 'An inoculant with this name already exists';
  if (code === 'ER_NO_REFERENCED_ROW_2') return 'Type of inoculant must be one of the listed types';
  return (e as Error).message;
};

export function inoculantsRouter(adminStore?: AdminStore) {
  const r = Router();

  r.get('/inoculant-types', async (_req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const [rows] = await p.query<RowDataPacket[]>('SELECT id, name FROM inoculant_types ORDER BY sort_order, id');
    res.json(rows.map((t) => ({ id: String(t.id), name: t.name })));
  });

  r.post('/inoculant-types', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const name = String(req.body?.name ?? '').trim().replace(/\s+/g, ' ');
    if (!name) return res.status(400).json({ message: 'Type name is required' });
    if (name.length > 100) return res.status(400).json({ message: 'Type name is too long (max 100 characters)' });
    try {
      const [out] = await p.query(
        'INSERT INTO inoculant_types (name, sort_order) SELECT ?, COALESCE(MAX(sort_order), 0) + 1 FROM inoculant_types',
        [name],
      );
      res.status(201).json({ id: String((out as { insertId: number }).insertId), name });
    } catch (e) {
      res.status(400).json({ message: (e as { code?: string }).code === 'ER_DUP_ENTRY' ? 'This inoculant type already exists' : (e as Error).message });
    }
  });

  r.get('/inoculants', async (_req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const [rows] = await p.query<Row[]>(`${SELECT} ORDER BY i.id`);
    res.json(rows.map(shape));
  });

  r.post('/inoculants', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const { v, error } = clean(req.body);
    if (!v) return res.status(400).json({ message: error });
    try {
      const who = await usernameFrom(req, adminStore);
      const [out] = await p.query(
        'INSERT INTO inoculants (name, type_id, application, size_mm, specific_gravity, content_pct, updated_by) VALUES (?,?,?,?,?,?,?)',
        [v.name, await typeIdFor(p, v.type), v.application, v.size, v.specificGravity, v.contentPct, who],
      );
      const [rows] = await p.query<Row[]>(`${SELECT} WHERE i.id = ?`, [(out as { insertId: number }).insertId]);
      res.status(201).json(shape(rows[0]));
    } catch (e) {
      res.status(400).json({ message: problem(e) });
    }
  });

  r.put('/inoculants/:id', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const { v, error } = clean(req.body);
    if (!v) return res.status(400).json({ message: error });
    try {
      const who = await usernameFrom(req, adminStore);
      const [out] = await p.query(
        'UPDATE inoculants SET name=?, type_id=?, application=?, size_mm=?, specific_gravity=?, content_pct=?, updated_by=? WHERE id=?',
        [v.name, await typeIdFor(p, v.type), v.application, v.size, v.specificGravity, v.contentPct, who, req.params.id],
      );
      if (!(out as { affectedRows: number }).affectedRows) return res.status(404).json({ message: 'Not found' });
      const [rows] = await p.query<Row[]>(`${SELECT} WHERE i.id = ?`, [req.params.id]);
      res.json(shape(rows[0]));
    } catch (e) {
      res.status(400).json({ message: problem(e) });
    }
  });

  r.delete('/inoculants', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'MySQL not configured' });
    const ids: unknown = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids (non-empty array) is required.' });
    const nums = ids.map(Number).filter(Number.isFinite);
    if (nums.length) await p.query(`DELETE FROM inoculants WHERE id IN (${nums.map(() => '?').join(',')})`, nums);
    res.status(204).end();
  });

  return r;
}
