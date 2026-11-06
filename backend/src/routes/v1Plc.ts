/**
 * PLC (Allen-Bradley SLC) settings + writes.
 *
 *   GET  /administration/plc-config           ip + tag table
 *   PUT  /administration/plc-config
 *   POST /administration/plc-config/test      write ONE tag/value (Test button)
 *   POST /machines/:id/manual-operations/:key {action:'start'|'stop'} -> writes the open/close tag
 *
 * Writes go through tools/plc_write.py (pycomm3 SLCDriver), the same call used in bench testing.
 */
import { Router } from 'express';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import type { AdminStore } from '../admin/store.ts';
import { requireAuthV1, requirePerm } from './authV1.ts';

const SCRIPT = process.env.INODOSE_HOME ? path.join(process.env.INODOSE_HOME, 'tools', 'plc_write.py') : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tools/plc_write.py');
const PYTHON = process.env.PYTHON_BIN ?? 'python';

type DataType = 'boolean' | 'integer' | 'float';
const DATA_TYPES: DataType[] = ['boolean', 'integer', 'float'];
/** boolean is the default (editable per tag in Administration → PLC Details) */
const asType = (t: unknown): DataType => (DATA_TYPES.includes(t as DataType) ? (t as DataType) : 'boolean');
interface Tag { key: string; label: string; dataType?: DataType; openTag: string; openValue: number; closeTag: string; closeValue: number }
interface Row extends RowDataPacket { ip_address: string; tags: Tag[] | string }

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
  });
  return pool;
}

function plcWrite(ip: string, writes: [string, number, DataType][]): Promise<{ ok: boolean; results: unknown[]; error: string | null }> {
  return new Promise((resolve) => {
    execFile(PYTHON, [SCRIPT, JSON.stringify({ ip, writes })], { timeout: 15000 }, (err, stdout) => {
      try { return resolve(JSON.parse(stdout.trim().split('\n').pop() ?? '')); } catch { /* fall through */ }
      resolve({ ok: false, results: [], error: err ? err.message : 'No response from PLC writer' });
    });
  });
}

const parseTags = (t: Tag[] | string): Tag[] => (typeof t === 'string' ? JSON.parse(t) : t).map((x: Tag) => ({ ...x, dataType: asType(x.dataType) }));
const TAG_RE = /^[A-Za-z]\d+:\d+(\/\d+)?$/; // e.g. F8:27, N7:3, B3:0/1

export function v1PlcRouter(store: AdminStore) {
  const r = Router();
  const auth = requireAuthV1(store);

  async function load() {
    const p = getPool();
    if (!p) return null;
    const [rows] = await p.query<Row[]>('SELECT ip_address, tags FROM plc_config WHERE id = 1 LIMIT 1');
    return rows[0] ? { ip: rows[0].ip_address, tags: parseTags(rows[0].tags) } : null;
  }

  /** Control Panel state: mode + component of the machine (auto + running/first component until something is applied). */
  async function controlPanelState(machineParam: string) {
    const p = getPool();
    if (!p) return null;
    const mid = Number(String(machineParam).replace(/^m/, '')) || 1;
    const [ms] = await p.query<RowDataPacket[]>('SELECT mode, applied_component_id, applied_pouring_time, applied_flow_rate FROM machine_state WHERE machine_id = ? LIMIT 1', [mid]);
    const [comps] = await p.query<RowDataPacket[]>('SELECT * FROM components ORDER BY id ASC');
    const [latest] = await p.query<RowDataPacket[]>('SELECT `COMPONENT ID` AS cid, datetime FROM innodose_casting_details_v2 ORDER BY datetime DESC LIMIT 1');
    const [cnt] = await p.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM innodose_casting_details_v2 WHERE DATE(datetime) = CURDATE()');
    const byId = new Map(comps.map((c) => [c.component_id as string, c]));
    // Show the component that is running / was last dosed (same as the Live Dashboard). Only fall back to the
    // last-applied component when there are no dosing records yet.
    const pick = (latest[0]?.cid && byId.get(latest[0].cid)) || (ms[0]?.applied_component_id && byId.get(ms[0].applied_component_id)) || comps[0];
    const lastMs = latest[0] ? new Date(latest[0].datetime instanceof Date ? latest[0].datetime : String(latest[0].datetime).replace(' ', 'T')).getTime() : 0;
    const connected = lastMs > 0 && Date.now() - lastMs < 120_000;
    const n = Number(cnt[0]?.n ?? 0);
    const level = n > 200 ? 'Low' : n > 80 ? 'Medium' : 'High';
    const cfg = await load();
    return {
      machineId: machineParam,
      connected,
      appliedMode: (ms[0]?.mode as string) ?? 'auto',
      params: {
        componentName: pick?.name ?? '',
        pouringTimeSec: Number((ms[0]?.applied_pouring_time && ms[0].applied_component_id === pick?.component_id ? ms[0].applied_pouring_time : pick?.pouring_time_sec) ?? 0),
        flowRateGmsPerSec: Number((ms[0]?.applied_flow_rate && ms[0].applied_component_id === pick?.component_id ? ms[0].applied_flow_rate : pick?.flow_rate_gms_sec) ?? 0),
      },
      operation: { machineStatus: connected ? 'Running' : 'Idle', boxesDosedToday: n },
      storage: { mainHopperLevel: level, storageHopperLevel: level, intermediateChamberLevel: level },
      manualOps: (cfg?.tags ?? []).map((t) => ({ key: t.key, label: t.label, kind: /chamber/i.test(t.key) ? 'chamber' : 'motor', active: false, elapsedSeconds: null, startedAt: null })),
      inoculantDosedGms: null,
    };
  }

  r.get('/machines/:id/control-panel', auth, async (req, res) => {
    const st = await controlPanelState(String(req.params.id));
    if (!st) return res.status(503).json({ message: 'State store unavailable' });
    res.json(st);
  });

  r.get('/administration/plc-config', auth, requirePerm(store, 'administration', 'view'), async (_req, res) => {
    const cfg = await load();
    if (!cfg) return res.status(503).json({ message: 'PLC config store unavailable — did migration 011 run?' });
    res.json(cfg);
  });

  r.put('/administration/plc-config', auth, requirePerm(store, 'administration', 'edit'), async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'PLC config store unavailable' });
    const ip = String(req.body?.ip ?? '').trim();
    const tags: Tag[] = Array.isArray(req.body?.tags) ? req.body.tags : [];
    if (!ip) return res.status(400).json({ message: 'PLC IP address is required' });
    for (const t of tags) {
      for (const a of [t.openTag, t.closeTag]) {
        if (a && !TAG_RE.test(a)) return res.status(400).json({ message: `${t.label}: "${a}" is not a valid tag address (e.g. F8:27)` });
      }
    }
    const clean = tags.map((t) => ({
      key: String(t.key), label: String(t.label), dataType: asType(t.dataType),
      openTag: String(t.openTag ?? '').trim(), openValue: Number(t.openValue),
      closeTag: String(t.closeTag ?? '').trim(), closeValue: Number(t.closeValue),
    }));
    await p.query('UPDATE plc_config SET ip_address = ?, tags = ? WHERE id = 1', [ip, JSON.stringify(clean)]);
    res.json({ ip, tags: clean });
  });

  r.post('/administration/plc-config/test', auth, requirePerm(store, 'administration', 'edit'), async (req, res) => {
    const ip = String(req.body?.ip ?? '').trim();
    const tag = String(req.body?.tag ?? '').trim();
    const value = Number(req.body?.value);
    if (!ip || !TAG_RE.test(tag) || !Number.isFinite(value)) return res.status(400).json({ message: 'Enter a valid IP, tag address and numeric value' });
    const type = asType(req.body?.dataType);
    const out = await plcWrite(ip, [[tag, value, type]]);
    res.status(out.ok ? 200 : 502).json({ ok: out.ok, message: out.ok ? `Wrote ${value} to ${tag}` : out.error ?? 'PLC write failed' });
  });

  // Control Panel "Apply": remember mode + component so the Live Dashboard switches to it.
  r.post('/machines/:id/settings', auth, requirePerm(store, 'control-panel', 'edit', (req) => (['auto', 'joystick', 'manual'].includes(req.body?.mode) ? req.body.mode : undefined)), async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'State store unavailable' });
    const mode = String(req.body?.mode ?? '');
    if (!['auto', 'joystick', 'manual'].includes(mode)) return res.status(400).json({ message: 'Unknown operating mode' });
    const prm = req.body?.params ?? {};
    const [c] = await p.query<RowDataPacket[]>('SELECT component_id FROM components WHERE name = ? LIMIT 1', [String(prm.componentName ?? '')]);
    if (!c[0]) return res.status(400).json({ message: 'Unknown component' });
    const mid = Number(String(req.params.id).replace(/^m/, '')) || 1;
    await p.query(
      `INSERT INTO machine_state (machine_id, mode, applied_component_id, applied_pouring_time, applied_flow_rate)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE mode = VALUES(mode), applied_component_id = VALUES(applied_component_id),
         applied_pouring_time = VALUES(applied_pouring_time), applied_flow_rate = VALUES(applied_flow_rate)`,
      [mid, mode, c[0].component_id, Number(prm.pouringTimeSec) || null, Number(prm.flowRateGmsPerSec) || null],
    );
    res.json(await controlPanelState(String(req.params.id)));
  });

  r.post('/machines/:id/manual-operations/:key', auth, requirePerm(store, 'control-panel', 'edit', 'manual'), async (req, res) => {
    // Manual operations only while the machine is in Manual mode (server-side, not just the UI).
    const pool = getPool();
    if (!pool) return res.status(503).json({ message: 'State store unavailable' });
    const mid = Number(String(req.params.id).replace(/^m/, '')) || 1;
    const [ms] = await pool.query<RowDataPacket[]>('SELECT mode FROM machine_state WHERE machine_id = ? LIMIT 1', [mid]);
    if (ms[0]?.mode !== 'manual') return res.status(409).json({ message: 'Machine is not in Manual mode. Apply Manual mode first.' });
    const cfg = await load();
    if (!cfg) return res.status(503).json({ message: 'PLC config store unavailable' });
    const t = cfg.tags.find((x) => x.key === req.params.key);
    if (!t) return res.status(404).json({ message: 'Unknown operation' });
    const start = req.body?.action === 'start';
    const tag = start ? t.openTag : t.closeTag;
    if (!tag) return res.status(409).json({ message: `No PLC tag configured for ${t.label} (${start ? 'open/start' : 'close/stop'}) — set it in Administration → DB Details.` });
    const out = await plcWrite(cfg.ip, [[tag, start ? t.openValue : t.closeValue, asType(t.dataType)]]);
    if (!out.ok) return res.status(502).json({ message: out.error ?? 'PLC write failed' });
    res.json({ ok: true, key: t.key, action: start ? 'start' : 'stop' });
  });

  return r;
}
