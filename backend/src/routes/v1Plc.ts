/**
 * PLC (Allen-Bradley SLC) settings + writes.
 *
 *   GET  /administration/plc-config           ip + tag table
 *   PUT  /administration/plc-config
 *   POST /administration/plc-config/test      write ONE tag/value (Test button)
 *   POST /machines/:id/manual-operations/:key {action:'start'|'stop'} -> writes the open/close tag
 *   POST /machines/:id/settings               Control Panel Apply (Auto Mode writes pouring time + flow rate tags)
 *   GET  /plc-logs[?machineId=m1]              change log of every Apply (new + previous values, PLC result)
 *
 * Writes go through tools/plc_write.py (pycomm3 SLCDriver), the same call used in bench testing.
 */
import { Router } from 'express';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import type { AdminStore } from '../admin/store.ts';
import type { User } from '../admin/types.ts';
import { log } from '../lib/logger.ts';

const plcLog = log.child('plc');
import { requireAuthV1, requirePerm } from './authV1.ts';

const SCRIPT = process.env.INODOSE_HOME ? path.join(process.env.INODOSE_HOME, 'tools', 'plc_write.py') : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tools/plc_write.py');
const PYTHON = process.env.PYTHON_BIN ?? 'python';

type DataType = 'boolean' | 'integer' | 'float';
const DATA_TYPES: DataType[] = ['boolean', 'integer', 'float'];
/** boolean is the default (editable per tag in Administration → PLC Details) */
const asType = (t: unknown): DataType => (DATA_TYPES.includes(t as DataType) ? (t as DataType) : 'boolean');
interface Tag { key: string; label: string; dataType?: DataType; openTag: string; openValue: number; closeTag: string; closeValue: number }
/** Auto Mode setpoint tags: the applied pouring time / flow rate are written here on Control Panel "Apply". */
interface SetpointTag { tag: string; dataType: DataType }
interface Setpoints { pouringTime: SetpointTag; flowRate: SetpointTag }
interface Row extends RowDataPacket { ip_address: string; tags: Tag[] | string; setpoint_tags: Setpoints | string | null }

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

/** Pouring time is a whole number of seconds (N file), flow rate a decimal (F file) unless changed in PLC Details. */
function parseSetpoints(v: unknown): Setpoints {
  let o: Partial<Record<keyof Setpoints, Partial<SetpointTag>>> = {};
  try { o = (typeof v === 'string' ? JSON.parse(v) : v) ?? {}; } catch { /* keep defaults */ }
  const one = (x: Partial<SetpointTag> | undefined, def: DataType): SetpointTag => ({
    tag: String(x?.tag ?? '').trim(),
    dataType: DATA_TYPES.includes(x?.dataType as DataType) ? (x!.dataType as DataType) : def,
  });
  return { pouringTime: one(o.pouringTime, 'integer'), flowRate: one(o.flowRate, 'float') };
}

const PLANT_TZ = process.env.PLANT_TZ || 'Asia/Kolkata';
function plantParts(d: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: PLANT_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(d).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
}
/** "13-11-2026 10:30:15" in the plant timezone (same zone the alerts use). */
function plantDateTime(d: Date): string {
  const p = plantParts(d);
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

/** Control Panel values are temporary: they end 3 hours after Apply, or at plant midnight, whichever comes first. */
const OVERRIDE_MS = 3 * 60 * 60 * 1000;
function overrideEndsAt(appliedAt: Date): Date {
  const p = plantParts(appliedAt);
  const [y, mo, d] = [Number(p.year), Number(p.month) - 1, Number(p.day)];
  const offset = Date.UTC(y, mo, d, Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(appliedAt.getTime() / 1000) * 1000;
  const nextMidnight = Date.UTC(y, mo, d + 1) - offset;
  return new Date(Math.min(appliedAt.getTime() + OVERRIDE_MS, nextMidnight));
}

const machineNum = (param: string) => Number(String(param).replace(/^m/, '')) || 1;
const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

interface LogRow {
  machineId: number; username: string; fullName: string | null; mode: string; prevMode: string | null;
  componentId: string | null; componentName: string | null; prevComponentName: string | null;
  pouringTime: number | null; prevPouringTime: number | null; flowRate: number | null; prevFlowRate: number | null;
  status: 'ok' | 'failed' | 'skipped'; message: string | null;
}
async function insertLog(p: Pool, l: LogRow) {
  try {
    await p.query(
      `INSERT INTO plc_change_log (machine_id, username, full_name, mode, prev_mode, component_id, component_name, prev_component_name,
         pouring_time, prev_pouring_time, flow_rate, prev_flow_rate, plc_status, plc_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [l.machineId, l.username, l.fullName, l.mode, l.prevMode, l.componentId, l.componentName, l.prevComponentName,
        l.pouringTime, l.prevPouringTime, l.flowRate, l.prevFlowRate, l.status, l.message?.slice(0, 500) ?? null],
    );
  } catch (e) {
    plcLog.error(`plc_change_log insert failed: ${(e as Error).message}`);
  }
}

export function v1PlcRouter(store: AdminStore) {
  const r = Router();
  const auth = requireAuthV1(store);

  async function load() {
    const p = getPool();
    if (!p) return null;
    const [rows] = await p.query<Row[]>('SELECT ip_address, tags, setpoint_tags FROM plc_config WHERE id = 1 LIMIT 1');
    return rows[0] ? { ip: rows[0].ip_address, tags: parseTags(rows[0].tags), setpoints: parseSetpoints(rows[0].setpoint_tags) } : null;
  }

  /**
   * Control Panel state. While Control Panel values are applied (until resetExpiredOverrides clears them — 3 hours
   * or the next plant day) it shows the applied component and values. Otherwise the running / last dosed
   * component with its component master values.
   */
  async function controlPanelState(machineParam: string) {
    const p = getPool();
    if (!p) return null;
    const mid = Number(String(machineParam).replace(/^m/, '')) || 1;
    const [ms] = await p.query<RowDataPacket[]>('SELECT mode, applied_component_id, applied_pouring_time, applied_flow_rate, UNIX_TIMESTAMP(applied_at) AS applied_ts FROM machine_state WHERE machine_id = ? LIMIT 1', [mid]);
    const [comps] = await p.query<RowDataPacket[]>('SELECT * FROM components ORDER BY id ASC');
    const [latest] = await p.query<RowDataPacket[]>('SELECT `COMPONENT ID` AS cid, datetime FROM innodose_casting_details_v2 ORDER BY datetime DESC LIMIT 1');
    const [cnt] = await p.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM innodose_casting_details_v2 WHERE DATE(datetime) = CURDATE()');
    const byId = new Map(comps.map((c) => [c.component_id as string, c]));
    const applied = ms[0]?.applied_component_id ? byId.get(ms[0].applied_component_id) : undefined;
    const pick = applied || (latest[0]?.cid && byId.get(latest[0].cid)) || comps[0];
    const appliedTs = num(ms[0]?.applied_ts);
    const overrideUntil = applied && appliedTs ? overrideEndsAt(new Date(appliedTs * 1000)) : null;
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
        pouringTimeSec: Number((applied && ms[0]?.applied_pouring_time ? ms[0].applied_pouring_time : pick?.pouring_time_sec) ?? 0),
        flowRateGmsPerSec: Number((applied && ms[0]?.applied_flow_rate ? ms[0].applied_flow_rate : pick?.flow_rate_gms_sec) ?? 0),
      },
      /** applied (temporary) values: when they go back to the component master; null = master values shown */
      overrideUntil: overrideUntil ? overrideUntil.toISOString() : null,
      overrideUntilText: overrideUntil ? plantDateTime(overrideUntil).slice(0, 16) : null,
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
    const setpoints = parseSetpoints(req.body?.setpoints);
    for (const [label, s] of [['Pouring Time', setpoints.pouringTime], ['Flow Rate', setpoints.flowRate]] as const) {
      if (s.tag && !TAG_RE.test(s.tag)) return res.status(400).json({ message: `${label}: "${s.tag}" is not a valid tag address (e.g. N7:10)` });
    }
    const clean = tags.map((t) => ({
      key: String(t.key), label: String(t.label), dataType: asType(t.dataType),
      openTag: String(t.openTag ?? '').trim(), openValue: Number(t.openValue),
      closeTag: String(t.closeTag ?? '').trim(), closeValue: Number(t.closeValue),
    }));
    await p.query('UPDATE plc_config SET ip_address = ?, tags = ?, setpoint_tags = ? WHERE id = 1', [ip, JSON.stringify(clean), JSON.stringify(setpoints)]);
    res.json({ ip, tags: clean, setpoints });
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

  // Control Panel "Apply": in Auto Mode write pouring time + flow rate to the PLC first; only when that works,
  // remember mode + component + values so the Live Dashboard switches to them (temporary — the component
  // master is not changed). Every attempt, including a failed PLC write, goes to plc_change_log.
  r.post('/machines/:id/settings', auth, requirePerm(store, 'control-panel', 'edit', (req) => (['auto', 'joystick', 'manual'].includes(req.body?.mode) ? req.body.mode : undefined)), async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'State store unavailable' });
    const mode = String(req.body?.mode ?? '');
    if (!['auto', 'joystick', 'manual'].includes(mode)) return res.status(400).json({ message: 'Unknown operating mode' });
    const prm = req.body?.params ?? {};
    const [c] = await p.query<RowDataPacket[]>('SELECT component_id, name FROM components WHERE name = ? LIMIT 1', [String(prm.componentName ?? '')]);
    if (!c[0]) return res.status(400).json({ message: 'Unknown component' });
    const pouringTime = Number(prm.pouringTimeSec);
    const flowRate = Number(prm.flowRateGmsPerSec);
    if (!(pouringTime >= 1 && pouringTime <= 300)) return res.status(400).json({ message: 'Pouring time must be 1 – 300 sec' });
    if (!(flowRate >= 0.1 && flowRate <= 50)) return res.status(400).json({ message: 'Flow rate must be 0.1 – 50 gms/sec' });
    const mid = machineNum(String(req.params.id));
    const prev = await controlPanelState(String(req.params.id));
    const user = (req as typeof req & { user: User }).user;

    const writeLog = (status: 'ok' | 'failed' | 'skipped', message: string | null) =>
      insertLog(p, {
        machineId: mid, username: user.username, fullName: user.fullName || null, mode, prevMode: prev?.appliedMode ?? null,
        componentId: c[0].component_id, componentName: c[0].name, prevComponentName: prev?.params.componentName || null,
        pouringTime, prevPouringTime: num(prev?.params.pouringTimeSec), flowRate, prevFlowRate: num(prev?.params.flowRateGmsPerSec),
        status, message,
      });

    let plcStatus: 'ok' | 'skipped' = 'skipped';
    let plcMessage: string | null = 'Not sent to PLC (only Auto Mode writes pouring time / flow rate)';
    if (mode === 'auto') {
      const cfg = await load();
      const sp = cfg?.setpoints;
      if (!cfg || !sp?.pouringTime.tag || !sp.flowRate.tag) {
        const msg = 'PLC tags for Pouring Time and Flow Rate are not set. Set them in Administration → PLC Details.';
        await writeLog('failed', msg);
        return res.status(409).json({ message: msg });
      }
      const out = await plcWrite(cfg.ip, [
        [sp.pouringTime.tag, pouringTime, sp.pouringTime.dataType],
        [sp.flowRate.tag, flowRate, sp.flowRate.dataType],
      ]);
      if (!out.ok) {
        const msg = `PLC write failed — settings not applied. ${out.error ?? JSON.stringify(out.results)}`;
        await writeLog('failed', msg);
        return res.status(502).json({ message: msg });
      }
      plcStatus = 'ok';
      plcMessage = `Wrote ${pouringTime} to ${sp.pouringTime.tag}, ${flowRate} to ${sp.flowRate.tag} (${cfg.ip})`;
    }

    await p.query(
      `INSERT INTO machine_state (machine_id, mode, applied_component_id, applied_pouring_time, applied_flow_rate, applied_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE mode = VALUES(mode), applied_component_id = VALUES(applied_component_id),
         applied_pouring_time = VALUES(applied_pouring_time), applied_flow_rate = VALUES(applied_flow_rate),
         applied_at = CURRENT_TIMESTAMP`,
      [mid, mode, c[0].component_id, pouringTime, flowRate],
    );
    await writeLog(plcStatus, plcMessage);
    res.json(await controlPanelState(String(req.params.id)));
  });

  /**
   * Applied values are temporary. Every minute: for each machine whose applied values are older than 3 hours or
   * from an earlier plant day, go back to the component master — in Auto Mode the master pouring time / flow rate
   * are written to the PLC first (only when the applied values differ from the master). If that PLC write fails
   * the applied values stay (the PLC still has them) and it is retried next minute.
   */
  const failureLoggedAt = new Map<number, number>();
  let resetting = false;
  async function resetExpiredOverrides() {
    const p = getPool();
    if (!p || resetting) return;
    resetting = true;
    try {
      const [rows] = await p.query<RowDataPacket[]>(
        `SELECT ms.machine_id, ms.mode, ms.applied_component_id, ms.applied_pouring_time, ms.applied_flow_rate,
                UNIX_TIMESTAMP(ms.applied_at) AS applied_ts, c.name, c.pouring_time_sec, c.flow_rate_gms_sec
           FROM machine_state ms LEFT JOIN components c ON c.component_id = ms.applied_component_id
          WHERE ms.applied_component_id IS NOT NULL`,
      );
      for (const row of rows) {
        const appliedTs = num(row.applied_ts);
        if (appliedTs && Date.now() < overrideEndsAt(new Date(appliedTs * 1000)).getTime()) continue;
        const mid = Number(row.machine_id);
        const masterPt = num(row.pouring_time_sec);
        const masterFlow = num(row.flow_rate_gms_sec);
        const appliedPt = num(row.applied_pouring_time);
        const appliedFlow = num(row.applied_flow_rate);
        const differs = (appliedPt != null && appliedPt !== masterPt) || (appliedFlow != null && appliedFlow !== masterFlow);
        const base = {
          machineId: mid, username: 'system', fullName: 'System (auto reset)', mode: String(row.mode), prevMode: String(row.mode),
          componentId: row.applied_component_id as string, componentName: row.name ?? row.applied_component_id, prevComponentName: row.name ?? row.applied_component_id,
          pouringTime: masterPt, prevPouringTime: appliedPt, flowRate: masterFlow, prevFlowRate: appliedFlow,
        };
        const why = 'Applied values ended (3 hours / new day) — back to component master.';
        let status: LogRow['status'] = 'skipped';
        let message = `${why} ${differs ? 'Not sent to PLC (not Auto Mode).' : 'Values already match the component master; nothing to write.'}`;
        if (row.mode === 'auto' && differs && masterPt && masterFlow) {
          const cfg = await load();
          const sp = cfg?.setpoints;
          if (!cfg || !sp?.pouringTime.tag || !sp.flowRate.tag) {
            message = `${why} PLC tags for Pouring Time / Flow Rate are not set, so master values were not written.`;
          } else {
            const out = await plcWrite(cfg.ip, [
              [sp.pouringTime.tag, masterPt, sp.pouringTime.dataType],
              [sp.flowRate.tag, masterFlow, sp.flowRate.dataType],
            ]);
            if (!out.ok) {
              // keep the applied values (the PLC still runs them) and retry next minute; log at most once an hour
              const last = failureLoggedAt.get(mid) ?? 0;
              if (Date.now() - last > 60 * 60 * 1000) {
                failureLoggedAt.set(mid, Date.now());
                await insertLog(p, { ...base, status: 'failed', message: `${why} PLC write failed, retrying every minute. ${out.error ?? JSON.stringify(out.results)}` });
              }
              continue;
            }
            status = 'ok';
            message = `${why} Wrote ${masterPt} to ${sp.pouringTime.tag}, ${masterFlow} to ${sp.flowRate.tag} (${cfg.ip})`;
          }
        }
        // Clear only if nobody applied new values in the meantime.
        const [upd] = await p.query<ResultSetHeader>(
          `UPDATE machine_state SET applied_component_id = NULL, applied_pouring_time = NULL, applied_flow_rate = NULL, applied_at = NULL
            WHERE machine_id = ? AND ${appliedTs ? 'UNIX_TIMESTAMP(applied_at) = ?' : 'applied_at IS NULL'}`,
          appliedTs ? [mid, appliedTs] : [mid],
        );
        if (upd.affectedRows) {
          failureLoggedAt.delete(mid);
          await insertLog(p, { ...base, status, message });
          plcLog.info(`machine ${mid}: applied values ended, back to component master (${status})`);
        }
      }
    } catch (e) {
      plcLog.error(`auto reset failed: ${(e as Error).message}`);
    } finally {
      resetting = false;
    }
  }
  setTimeout(() => void resetExpiredOverrides(), 10_000).unref();
  setInterval(() => void resetExpiredOverrides(), 60_000).unref();

  // PLC Logs (Control Panel + Administration → PLC Details): who changed mode / component / pouring time /
  // flow rate, when, the previous values, and whether the PLC write worked. ?machineId=m1 narrows to one machine.
  r.get('/plc-logs', auth, async (req, res) => {
    const u = (req as typeof req & { user: User }).user;
    const perms = (await store.getRole(u.roleId))?.permissions;
    if (!perms?.nav?.['control-panel']?.view && !perms?.nav?.administration?.view) {
      return res.status(403).json({ message: 'Your role does not have view access to the PLC logs.' });
    }
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Log store unavailable' });
    const limit = Math.min(Math.max(Number(req.query.limit) || 300, 1), 2000);
    const machine = req.query.machineId ? machineNum(String(req.query.machineId)) : null;
    const [rows] = await p.query<RowDataPacket[]>(
      `SELECT l.*, UNIX_TIMESTAMP(l.created_at) AS ts, m.name AS machine_name
         FROM plc_change_log l LEFT JOIN machines m ON m.id = l.machine_id
        ${machine ? 'WHERE l.machine_id = ?' : ''}
        ORDER BY l.created_at DESC, l.id DESC LIMIT ?`,
      machine ? [machine, limit] : [limit],
    );
    res.json(rows.map((r) => {
      const at = new Date(Number(r.ts) * 1000);
      return {
        id: Number(r.id),
        at: at.toISOString(),
        atText: plantDateTime(at),
        machineId: `m${r.machine_id}`,
        machineName: r.machine_name ?? `Machine ${r.machine_id}`,
        user: r.full_name || r.username,
        username: r.username,
        mode: r.mode, prevMode: r.prev_mode,
        componentName: r.component_name, prevComponentName: r.prev_component_name,
        pouringTimeSec: num(r.pouring_time), prevPouringTimeSec: num(r.prev_pouring_time),
        flowRateGmsPerSec: num(r.flow_rate), prevFlowRateGmsPerSec: num(r.prev_flow_rate),
        plcStatus: r.plc_status, plcMessage: r.plc_message,
      };
    }));
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
