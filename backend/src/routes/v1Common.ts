/**
 * Step-1 common endpoints that the frontend's header, sidebar, machine
 * selector, live-alerts banner and customer-logo pill rely on:
 *
 *   GET  /shift
 *   GET  /machines                  (shape from docs/API.md)
 *   GET  /branding                  (customerName + logoUrl from company_info)
 *   GET  /alerts/live               (today's non-optimal casting rows)
 *   POST /alerts/live/:id/acknowledge
 */
import { Router } from 'express';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import type { AdminStore } from '../admin/store.ts';
import { requireAuthV1 } from './authV1.ts';
import { classifyDose, type TolMap } from './alertRules.ts';
import { getAlertSource, q } from './alertSource.ts';

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

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatLongDate(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

function shiftFor(d: Date): string {
  const h = d.getHours();
  // Fallback when no shifts are configured: A = 07:00-15:00, B = the rest (matches the default seed).
  return h >= 7 && h < 15 ? 'Shift A' : 'Shift B';
}

function pad2(n: number) { return n.toString().padStart(2, '0'); }

/** In-memory acknowledge set, keyed by `<YYYY-MM-DD>:<id>`. Resets on restart. */
const ackedAlerts = new Set<string>();

interface MachineRow extends RowDataPacket {
  id: number;
  product_id: string;
  name: string;
  production_line: string;
  date_added: string;
}

interface CompanyRow extends RowDataPacket {
  name: string;
  logo_data_url: string;
}

interface CastingAlertRow extends RowDataPacket {
  id: number;
  datetime: string;
  box_count: number | null;
  component_id: string;
  weight_of_inoculant: number | null;
  expected_dosage_gms: number | null;
}

/** Tolerances + enabled flags from the Alerts admin screen (same tables alert.py reads). */
export async function loadAlertRules(p: Pool) {
  const [tolRows] = await p.query<RowDataPacket[]>('SELECT alert_type, min_tolerance, max_tolerance FROM alert_tolerances');
  const tols: TolMap = new Map(tolRows.map((t) => [String(t.alert_type), { min: Number(t.min_tolerance), max: Number(t.max_tolerance) }]));
  const off = new Set<string>();
  try {
    const [cfg] = await p.query<RowDataPacket[]>('SELECT alert_type, enabled FROM alert_config');
    for (const c of cfg) if (!c.enabled) off.add(String(c.alert_type));
  } catch { /* alert_config missing → everything enabled */ }
  return { tols, enabled: (t: string) => !off.has(t) };
}

/** Local calendar date (YYYY-MM-DD). toISOString() is UTC and flips the day 5.5 h late in India. */
function localDate(): string {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function v1CommonRouter(store: AdminStore) {
  const r = Router();
  const auth = requireAuthV1(store);

  // ---- /shift (current) + /shifts (configured list) ----
  const hhmm = (t: unknown) => String(t).slice(0, 5);
  async function loadShifts() {
    const p = getPool();
    if (!p) return [];
    const [rows] = await p.query<RowDataPacket[]>('SELECT id, name, start_time, end_time FROM shifts ORDER BY start_time');
    return rows.map((s) => ({ id: String(s.id), name: s.name as string, start: hhmm(s.start_time), end: hhmm(s.end_time) }));
  }
  r.get('/shift', auth, async (_req, res) => {
    const d = new Date();
    const now = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const hit = (await loadShifts()).find((s) => (s.start <= s.end ? now >= s.start && now < s.end : now >= s.start || now < s.end));
    res.json({
      time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`,
      date: `${pad2(d.getDate())} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      shift: hit ? `Shift ${hit.name}` : shiftFor(d),
    });
  });
  r.get('/shifts', auth, async (_req, res) => res.json(await loadShifts()));
  r.post('/shifts', auth, async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Shifts store unavailable' });
    const name = String(req.body?.name ?? '').trim();
    const start = String(req.body?.start ?? '');
    const end = String(req.body?.end ?? '');
    if (!name) return res.status(400).json({ message: 'Shift name is required' });
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return res.status(400).json({ message: 'Start and end time are required' });
    if (start === end) return res.status(400).json({ message: 'Start and end time must be different' });
    try {
      await p.query('INSERT INTO shifts (name, start_time, end_time) VALUES (?, ?, ?)', [name, `${start}:00`, `${end}:00`]);
    } catch (e) {
      if ((e as { code?: string }).code === 'ER_DUP_ENTRY') return res.status(409).json({ message: `A shift named "${name}" already exists` });
      throw e;
    }
    res.status(201).json(await loadShifts());
  });
  r.delete('/shifts/:id', auth, async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Shifts store unavailable' });
    await p.query('DELETE FROM shifts WHERE id = ?', [Number(req.params.id)]);
    res.json(await loadShifts());
  });

  // ---- /machines ----
  r.get('/machines', auth, async (_req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Machines store unavailable' });
    const [rows] = await p.query<MachineRow[]>(
      'SELECT id, product_id, name, production_line, date_added FROM machines ORDER BY id',
    );
    res.json(rows.map(m => ({
      id: `m${m.id}`,
      productId: m.product_id,
      machineName: m.name,
      productionLine: m.production_line,
      dateAdded: formatLongDate(m.date_added),
    })));
  });

  // ---- /branding ----
  // Public per docs/API.md (used on the login page), so no auth guard here.
  r.get('/branding', async (_req, res) => {
    const p = getPool();
    if (!p) return res.json({ customerName: '', logoUrl: '' });
    const [rows] = await p.query<CompanyRow[]>('SELECT name, logo_data_url FROM company_info WHERE id = 1 LIMIT 1');
    const r0 = rows[0];
    res.json({
      customerName: r0?.name ?? '',
      logoUrl: r0?.logo_data_url ?? '',
    });
  });

  // Update customer name and/or logo. The client sends { customerName, logoUrl }
  // where logoUrl is a data: URL (PNG/JPG/SVG, ≤ 1 MB) or an empty string to
  // keep the existing one. Returns the canonical branding shape.
  async function whoAmI(req: import('express').Request): Promise<string | null> {
    const h = req.header('authorization') || req.header('Authorization');
    if (!h) return null;
    const token = h.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;
    const u = await store.userFromSession(token);
    return u?.username ?? null;
  }

  r.put('/branding', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'Branding store unavailable' });
    const customerName = typeof req.body?.customerName === 'string' ? req.body.customerName.trim() : '';
    const logoUrl = typeof req.body?.logoUrl === 'string' ? req.body.logoUrl : '';
    if (logoUrl && !/^data:image\/(png|jpe?g|svg\+xml);/i.test(logoUrl)) {
      return res.status(400).json({ error: 'logoUrl must be a PNG, JPG or SVG data URL' });
    }
    if (logoUrl.length > 1_500_000) {
      return res.status(413).json({ error: 'Logo too large (max 1 MB)' });
    }
    const who = await whoAmI(req);
    await p.query(
      `INSERT INTO company_info (id, name, logo_data_url, updated_by)
       VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name          = COALESCE(NULLIF(VALUES(name), ''), name),
         logo_data_url = CASE WHEN VALUES(logo_data_url) = '' THEN logo_data_url ELSE VALUES(logo_data_url) END,
         updated_by    = VALUES(updated_by)`,
      [customerName, logoUrl, who],
    );
    const [rows] = await p.query<CompanyRow[]>('SELECT name, logo_data_url FROM company_info WHERE id = 1 LIMIT 1');
    const r0 = rows[0];
    res.json({ customerName: r0?.name ?? '', logoUrl: r0?.logo_data_url ?? '' });
  });

  // Clear the logo (keeps customerName). Returns the updated branding shape.
  r.delete('/branding', async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ error: 'Branding store unavailable' });
    const who = await whoAmI(req);
    // 'none' = logo deliberately removed (the UI then offers "Add logo"); '' = never customised (bundled default shows).
    await p.query('UPDATE company_info SET logo_data_url = \'none\', updated_by = ? WHERE id = 1', [who]);
    const [rows] = await p.query<CompanyRow[]>('SELECT name, logo_data_url FROM company_info WHERE id = 1 LIMIT 1');
    const r0 = rows[0];
    res.json({ customerName: r0?.name ?? '', logoUrl: r0?.logo_data_url ?? '' });
  });

  // ---- /alerts/live ----
  // Derive today's alerts from the casting history: non-optimal rows + any
  // rows without a master expected dosage get flagged. Acknowledged state is
  // tracked in memory (ackedAlerts). Resets on restart.
  r.get('/alerts/live', auth, async (_req, res) => {
    const p = getPool();
    if (!p) return res.json([]);

    const today = localDate();
    const src = await getAlertSource(p); // validated table + dose column (default: casting_details_v2 / WEIGHT OF INOCULANT)
    const [rows] = await p.query<CastingAlertRow[]>(
      `SELECT c.id,
              c.datetime,
              c.\`BOX COUNT\`           AS box_count,
              c.\`COMPONENT ID\`        AS component_id,
              c.${q(src.column)}       AS weight_of_inoculant,
              m.expected_dosage_gms    AS expected_dosage_gms
         FROM ${q(src.table)} c
         LEFT JOIN components m ON m.component_id = c.\`COMPONENT ID\`
        WHERE DATE(c.datetime) = ?
        ORDER BY c.datetime DESC
        LIMIT 100`,
      [today],
    );

    const rules = await loadAlertRules(p);
    const out = rows
      .map(r => ({ row: r, type: classifyDose(r.weight_of_inoculant, r.expected_dosage_gms, rules.tols, rules.enabled) }))
      .filter(x => x.type !== null)
      .slice(0, 20)
      .map(({ row, type }) => {
        const id = `a${row.id}`;
        const t = new Date(row.datetime);
        return {
          id,
          time: `${pad2(t.getHours())}:${pad2(t.getMinutes())}:${pad2(t.getSeconds())}`,
          boxNo: row.box_count != null ? `B-${row.box_count}` : '—',
          type: type!,
          acknowledged: ackedAlerts.has(`${today}:${id}`),
        };
      });

    res.json(out);
  });

  r.post('/alerts/live/:id/acknowledge', auth, async (req, res) => {
    const today = localDate();
    const key = `${today}:${req.params.id}`;
    ackedAlerts.add(key);

    // Re-read so we can respond with the just-acknowledged row's current state.
    const p = getPool();
    if (!p) return res.json({ id: req.params.id, time: '00:00:00', boxNo: '—', type: 'Over Dose', acknowledged: true });

    const numericId = Number(req.params.id.replace(/^a/, ''));
    const src = await getAlertSource(p);
    const [rows] = await p.query<CastingAlertRow[]>(
      `SELECT c.id, c.datetime, c.\`BOX COUNT\` AS box_count,
              c.\`COMPONENT ID\` AS component_id,
              c.${q(src.column)} AS weight_of_inoculant,
              m.expected_dosage_gms AS expected_dosage_gms
         FROM ${q(src.table)} c
         LEFT JOIN components m ON m.component_id = c.\`COMPONENT ID\`
        WHERE c.id = ? LIMIT 1`,
      [numericId],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Alert not found' });
    const t = new Date(row.datetime);
    const rules = await loadAlertRules(p);
    const type = classifyDose(row.weight_of_inoculant, row.expected_dosage_gms, rules.tols, rules.enabled) ?? 'Dose Miss';
    res.json({
      id: req.params.id,
      time: `${pad2(t.getHours())}:${pad2(t.getMinutes())}:${pad2(t.getSeconds())}`,
      boxNo: row.box_count != null ? `B-${row.box_count}` : '—',
      type,
      acknowledged: true,
    });
  });

  // ---- Stubs: Control Panel + Past Records ----
  // These endpoints have not been implemented against real plant data yet.
  // The frontend treats a 404 here as a hard error, so the stubs return
  // empty-but-valid shapes so the pages render instead of showing
  // "Request failed (404)". Replace with real implementations when ready.
  const emptyPage = (page = 1) => ({ items: [], page, pageSize: 10, total: 0, pageCount: 0 });

  r.post('/machines/:id/control-panel/apply', auth, (req, res) => res.json(req.body ?? {}));
  r.post('/machines/:id/control-panel/operations/:op', auth, (_req, res) => res.json({ ok: true }));

  r.get('/records/dosage', auth, (req, res) => {
    const page = Number(req.query.page ?? 1);
    res.json(emptyPage(page));
  });
  r.get('/records/dosage/:date/components/:component/doses', auth, (req, res) => {
    const page = Number(req.query.page ?? 1);
    res.json(emptyPage(page));
  });
  r.get('/records/doses/:id/series', auth, (_req, res) => res.json([]));
  r.get('/records/across-molds', auth, (req, res) => {
    res.json({ component: String(req.query.component ?? ''), bars: [], tolerance: { min: 0, max: 0 } });
  });
  r.get('/records/alerts', auth, (req, res) => {
    const page = Number(req.query.page ?? 1);
    res.json(emptyPage(page));
  });
  r.post('/records/alerts/:id/acknowledge', auth, (req, res) => {
    res.json({ id: req.params.id, acknowledged: true });
  });

  return r;
}
