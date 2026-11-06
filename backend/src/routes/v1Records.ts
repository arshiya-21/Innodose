/**
 * Past Records (Dosage tab), backed by innodose_casting_details_v2 + the components master.
 *
 *   GET /records/dosage                                   day-wise summary (+ per-component breakdown)
 *   GET /records/dosage/:date/components/:name/doses      every dose of one component on one day
 *   GET /records/doses/:id/series                         cumulative curve of one dose
 *   GET /records/across-molds                             one component's boxes on a day, as bars
 */
import { Router } from 'express';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import type { AdminStore } from '../admin/store.ts';
import { requireAuthV1 } from './authV1.ts';

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
    waitForConnections: true, connectionLimit: 3,
    dateStrings: true,
  });
  return pool;
}

const PAGE_SIZE = 10;
const pad2 = (n: number) => String(n).padStart(2, '0');
const hms = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
/** MySQL "YYYY-MM-DD HH:MM:SS" (dateStrings) -> local Date */
const parseDt = (s: string) => new Date(String(s).replace(' ', 'T'));
const num = (v: unknown) => (v == null || v === '' ? null : Number(v));

type State = 'optimal' | 'over' | 'under' | 'miss' | 'not-poured';
const LABEL: Record<State, string> = { optimal: 'Optimal Dose', over: 'Over Dose', under: 'Under Dose', miss: 'Dose Miss', 'not-poured': 'Not Poured' };

function classify(actual: number | null, expected: number | null): State {
  if (actual == null || !expected) return 'miss';
  if (actual === 0) return 'not-poured';
  const r = actual / expected;
  if (r > 1.05) return 'over';
  if (r < 0.95) return 'under';
  return 'optimal';
}

interface Row extends RowDataPacket {
  id: number; datetime: string; weight_of_inoculant: number | null; content_of_inoculant: number | null;
  pouring_time: number | null; component_id: string; box_count: number | null;
  heat_no: string | null; ladle: string | null; flow_rates: unknown;
}
interface Comp extends RowDataPacket {
  component_id: string; name: string; pouring_temp_min_c: number; pouring_temp_max_c: number;
  pouring_time_sec: number; flow_rate_gms_sec: number; expected_dosage_gms: number; grade: string; bunch_weight_kg: number;
  pattern: string; inoculant_name: string | null;
}

const SELECT = `
  SELECT c.id, c.datetime,
         c.\`WEIGHT OF INOCULANT\`  AS weight_of_inoculant,
         c.\`CONTENT OF INOCULANT\` AS content_of_inoculant,
         c.\`POURING TIME\`         AS pouring_time,
         c.\`COMPONENT ID\`         AS component_id,
         c.\`BOX COUNT\`            AS box_count,
         c.\`HEAT NO\`              AS heat_no,
         c.\`LADLE\`                AS ladle,
         c.\`DOSAGE / SEC\`         AS flow_rates
    FROM innodose_casting_details_v2 c`;

async function loadComps(p: Pool) {
  const [rows] = await p.query<Comp[]>(
    'SELECT c.*, i.name AS inoculant_name FROM components c LEFT JOIN inoculants i ON i.id = c.inoculant_id',
  );
  return rows;
}
const flowList = (f: unknown) => (typeof f === 'string' && f.length ? f.split(',').map((x) => Number(x) || 0) : []);

export function v1RecordsRouter(store: AdminStore) {
  const r = Router();
  const auth = requireAuthV1(store);

  /** filter value (components.id or component_id, or 'all') -> component_id */
  const resolveComponent = (comps: Comp[], v: unknown): string | null => {
    const s = String(v ?? 'all');
    if (!s || s === 'all' || s === 'All') return null;
    const hit = comps.find((c) => String((c as unknown as { id: number }).id) === s || c.component_id === s || c.name === s);
    return hit ? hit.component_id : s;
  };

  async function machineName(p: Pool, machineId: unknown): Promise<string> {
    const n = Number(String(machineId ?? '').replace(/^m/, '')) || 1;
    const [rows] = await p.query<(RowDataPacket & { name: string })[]>('SELECT name FROM machines WHERE id = ? LIMIT 1', [n]);
    return rows[0]?.name ?? `Inodose Machine ${n}`;
  }

  r.get('/records/dosage', auth, async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Records store unavailable' });
    const page = Math.max(1, Number(req.query.page ?? 1));
    const from = String(req.query.from ?? '0000-01-01');
    const to = String(req.query.to ?? '9999-12-31');
    const comps = await loadComps(p);
    const compId = resolveComponent(comps, req.query.componentId);
    const byId = new Map(comps.map((c) => [c.component_id, c]));

    const [rows] = await p.query<Row[]>(
      `${SELECT} WHERE DATE(c.datetime) BETWEEN ? AND ? ${compId ? 'AND c.`COMPONENT ID` = ?' : ''} ORDER BY c.datetime DESC`,
      compId ? [from, to, compId] : [from, to],
    );

    const empty = () => ({ totalBoxes: 0, optimalDose: 0, overDose: 0, underDose: 0, doseMiss: 0, notPoured: 0 });
    const bump = (c: ReturnType<typeof empty>, s: State) => {
      c.totalBoxes++;
      if (s === 'optimal') c.optimalDose++;
      else if (s === 'over') c.overDose++;
      else if (s === 'under') c.underDose++;
      else if (s === 'miss') c.doseMiss++;
      else c.notPoured++;
    };
    const days = new Map<string, { counts: ReturnType<typeof empty>; comps: Map<string, ReturnType<typeof empty>> }>();
    for (const row of rows) {
      const date = String(row.datetime).slice(0, 10);
      const comp = byId.get(row.component_id);
      const state = classify(num(row.weight_of_inoculant), comp?.expected_dosage_gms ?? null);
      const day = days.get(date) ?? { counts: empty(), comps: new Map() };
      days.set(date, day);
      bump(day.counts, state);
      const name = comp?.name ?? row.component_id;
      const cc = day.comps.get(name) ?? empty();
      day.comps.set(name, cc);
      bump(cc, state);
    }
    const all = [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    const items = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(([date, d]) => ({
      date, componentCount: d.comps.size, ...d.counts,
      components: [...d.comps.entries()].map(([componentName, c]) => ({ componentName, ...c })),
    }));
    res.json({ items, page, pageSize: PAGE_SIZE, total: all.length, pageCount: Math.max(1, Math.ceil(all.length / PAGE_SIZE)) });
  });

  r.get('/records/dosage/:date/components/:component/doses', auth, async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Records store unavailable' });
    const page = Math.max(1, Number(req.query.page ?? 1));
    const comps = await loadComps(p);
    const ids = comps.filter((c) => c.name === req.params.component || c.component_id === req.params.component).map((c) => c.component_id);
    if (!ids.length) return res.json({ items: [], page, pageSize: PAGE_SIZE, total: 0, pageCount: 1 });
    const byId = new Map(comps.map((c) => [c.component_id, c]));
    const machine = await machineName(p, req.query.machineId && req.query.machineId !== 'all' ? req.query.machineId : 'm1');

    const where = 'DATE(c.datetime) = ? AND c.`COMPONENT ID` IN (?)';
    const [[{ total }]] = (await p.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM innodose_casting_details_v2 c WHERE ${where}`, [req.params.date, ids],
    )) as unknown as [[{ total: number }]];
    const [rows] = await p.query<Row[]>(
      `${SELECT} WHERE ${where} ORDER BY c.datetime DESC LIMIT ? OFFSET ?`,
      [req.params.date, ids, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    );

    const items = rows.map((row) => {
      const comp = byId.get(row.component_id);
      const actual = num(row.weight_of_inoculant);
      const state = classify(actual, comp?.expected_dosage_gms ?? null);
      const dur = Math.round(row.pouring_time ?? 0);
      const start = parseDt(row.datetime);
      const end = new Date(start.getTime() + dur * 1000);
      const exp = comp?.expected_dosage_gms ?? 0;
      return {
        doseId: row.id,
        dosingTime: `${hms(start)} - ${hms(end)}`,
        durationSec: dur,
        machine,
        boxNo: `B-${row.box_count ?? row.id}`,
        status: LABEL[state],
        totalActualDose: `${actual == null ? 0 : Math.round(actual)} gms`,
        totalExpectedDose: exp ? `${Math.round(exp * 0.95)} - ${Math.round(exp * 1.05)} gms` : '—',
        inoculantFlowRate: `${comp?.flow_rate_gms_sec ?? 0} gms/sec`,
        inoculantContent: row.content_of_inoculant == null ? '—' : `${row.content_of_inoculant} %`,
        bunchWeight: `${comp?.bunch_weight_kg ?? 0} kg`,
        pouringTime: `${dur} sec`,
        pouringTarget: `Target - ${comp?.pouring_time_sec ?? 0}`,
        pouringTemp: comp ? `${Math.round((comp.pouring_temp_min_c + comp.pouring_temp_max_c) / 2)} °C (${comp.pouring_temp_min_c} - ${comp.pouring_temp_max_c})` : '—',
        ladle: row.ladle ?? '—',
        heat: row.heat_no ?? '—',
        grade: comp?.grade ?? '—',
        pattern: comp?.pattern || '—',
        inoculantType: comp?.inoculant_name ?? '—',
        dosagePerSec: flowList(row.flow_rates).slice(0, dur || undefined).join(', ') || '—',
        alerts: state === 'over' || state === 'under' || state === 'miss' ? LABEL[state] : '_',
      };
    });
    res.json({ items, page, pageSize: PAGE_SIZE, total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
  });

  r.get('/records/doses/:id/series', auth, async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Records store unavailable' });
    const [rows] = await p.query<Row[]>(`${SELECT} WHERE c.id = ? LIMIT 1`, [Number(req.params.id)]);
    const row = rows[0];
    if (!row) return res.json([]);
    const start = parseDt(row.datetime);
    const flow = flowList(row.flow_rates).slice(0, Math.max(1, Math.min(40, Math.round(row.pouring_time ?? 40))));
    let acc = 0;
    res.json(flow.map((v, i) => {
      acc += v;
      return { time: hms(new Date(start.getTime() + i * 1000)), grams: Number(acc.toFixed(1)) };
    }));
  });

  r.get('/records/across-molds', auth, async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Records store unavailable' });
    const component = String(req.query.component ?? '');
    const comps = await loadComps(p);
    const comp = comps.find((c) => c.name === component || c.component_id === component);
    if (!comp) return res.json({ component, bars: [], tolerance: { min: 0, max: 0 } });
    const [rows] = await p.query<Row[]>(
      `${SELECT} WHERE DATE(c.datetime) = ? AND c.\`COMPONENT ID\` = ? ORDER BY c.datetime ASC`,
      [String(req.query.date ?? ''), comp.component_id],
    );
    const exp = comp.expected_dosage_gms;
    res.json({
      component,
      bars: rows.map((row) => ({
        boxNo: `B-${row.box_count ?? row.id}`,
        grams: Math.round(num(row.weight_of_inoculant) ?? 0),
        state: classify(num(row.weight_of_inoculant), exp),
      })),
      tolerance: { min: Math.round(exp * 0.95), max: Math.round(exp * 1.05) },
    });
  });


  // ---- Alerts tab: every non-optimal dose in the range is an alert. Acknowledgements are kept in memory (like /alerts/live). ----
  const acked = new Map<string, string>();
  const alertId = (id: number) => `R${id}`;

  r.get('/records/alerts', auth, async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Records store unavailable' });
    const page = Math.max(1, Number(req.query.page ?? 1));
    const from = String(req.query.from ?? '0000-01-01');
    const to = String(req.query.to ?? '9999-12-31');
    const comps = await loadComps(p);
    const compId = resolveComponent(comps, req.query.componentId);
    const byId = new Map(comps.map((c) => [c.component_id, c]));
    const machine = await machineName(p, req.query.machineId && req.query.machineId !== 'all' ? req.query.machineId : 'm1');
    const [rows] = await p.query<Row[]>(
      `${SELECT} WHERE DATE(c.datetime) BETWEEN ? AND ? ${compId ? 'AND c.`COMPONENT ID` = ?' : ''} ORDER BY c.datetime DESC`,
      compId ? [from, to, compId] : [from, to],
    );
    const all = rows
      .map((row) => {
        const comp = byId.get(row.component_id);
        const state = classify(num(row.weight_of_inoculant), comp?.expected_dosage_gms ?? null);
        return { row, comp, state };
      })
      .filter((x) => x.state !== 'optimal');
    const items = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ row, comp, state }) => {
      const t = parseDt(row.datetime);
      return {
        id: alertId(row.id),
        date: String(row.datetime).slice(0, 10),
        time: hms(t),
        alertType: LABEL[state],
        boxNo: `B-${row.box_count ?? row.id}`,
        doseId: row.id,
        component: comp?.name ?? row.component_id,
        machine,
        acknowledgedBy: acked.get(alertId(row.id)) ?? null,
      };
    });
    res.json({ items, page, pageSize: PAGE_SIZE, total: all.length, pageCount: Math.max(1, Math.ceil(all.length / PAGE_SIZE)) });
  });

  r.post('/records/alerts/:id/acknowledge', auth, async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Records store unavailable' });
    const h = (req.header('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const u = (await store.userFromSession(h)) as { name?: string; username?: string } | null;
    const aid = String(req.params.id);
    acked.set(aid, u?.name ?? u?.username ?? 'Unknown');
    const id = Number(aid.replace(/^R/, ''));
    const [rows] = await p.query<Row[]>(`${SELECT} WHERE c.id = ? LIMIT 1`, [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Alert not found' });
    const comps = await loadComps(p);
    const comp = comps.find((c) => c.component_id === row.component_id);
    const state = classify(num(row.weight_of_inoculant), comp?.expected_dosage_gms ?? null);
    res.json({
      id: aid, date: String(row.datetime).slice(0, 10), time: hms(parseDt(row.datetime)), alertType: LABEL[state],
      boxNo: `B-${row.box_count ?? row.id}`, doseId: row.id, component: comp?.name ?? row.component_id,
      machine: await machineName(p, 'm1'), acknowledgedBy: acked.get(aid),
    });
  });
  return r;
}
