/**
 * Step-2 Dashboard endpoints — all backed by the MySQL casting-details-v2
 * table and the components master. Shapes match docs/API.md:
 *
 *   GET /dashboard                        — summary + inoculation + flow + today's boxes
 *   GET /dashboard/cumulative             — per-second grams for the box being dosed
 *   GET /dashboard/across-molds           — today's boxes for one component as bars
 *   GET /dashboard/boxes/:boxId           — full box record for the pop-up (404 if not dosed)
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
    waitForConnections: true, connectionLimit: 5,
    dateStrings: true,
  });
  return pool;
}

const pad2 = (n: number) => n.toString().padStart(2, '0');
const hms = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
// Local calendar date (not UTC): the DB stores local timestamps, and toISOString() flips the day 5.5 h late in India.
const todayStr = () => {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

type BoxState = 'pending' | 'optimal' | 'over' | 'under' | 'miss' | 'not-poured' | 'current';

function classify(actual: number | null, expected: number | null): BoxState {
  if (actual == null || expected == null || expected === 0) return 'miss';
  const r = actual / expected;
  if (r > 1.05) return 'over';
  if (r < 0.95) return 'under';
  return 'optimal';
}

function hopperLevel(countToday: number): 'High' | 'Medium' | 'Low' {
  if (countToday > 200) return 'Low';
  if (countToday > 80)  return 'Medium';
  return 'High';
}

interface CastingRow extends RowDataPacket {
  id: number;
  datetime: string;
  weight_of_casting: number | null;
  content_of_inoculant: number | null;
  pouring_time: number | null;
  weight_of_inoculant: number | null;
  flow_of_inoculant: number | null;
  component_id: string;
  box_count: number | null;
  heat_no: string | null;
  pattern_id: string | null;
  ladle: string | null;
  flow_rates: unknown; // read from the `DOSAGE / SEC` column (comma-separated string)
}

interface ComponentRow extends RowDataPacket {
  id: number; component_id: string; name: string;
  pouring_temp_min_c: number; pouring_temp_max_c: number;
  pouring_time_sec: number; flow_rate_gms_sec: number;
  expected_dosage_gms: number; grade: string; bunch_weight_kg: number;
}

async function loadComponents(p: Pool): Promise<Map<string, ComponentRow>> {
  const [rows] = await p.query<ComponentRow[]>('SELECT * FROM components');
  const map = new Map<string, ComponentRow>();
  for (const r of rows) map.set(r.component_id, r);
  return map;
}

/** Common SELECT. Flow rates are already stored as a comma-separated string. */
const CASTING_SELECT = `
  SELECT c.id, c.datetime,
         c.\`WEIGHT OF CASTING\`    AS weight_of_casting,
         c.\`CONTENT OF INOCULANT\` AS content_of_inoculant,
         c.\`POURING TIME\`         AS pouring_time,
         c.\`WEIGHT OF INOCULANT\`  AS weight_of_inoculant,
         c.\`FLOW OF INOCULANT\`    AS flow_of_inoculant,
         c.\`COMPONENT ID\`         AS component_id,
         c.\`BOX COUNT\`            AS box_count,
         c.\`HEAT NO\`              AS heat_no,
         c.\`PATTERN ID\`           AS pattern_id,
         c.\`LADLE\`                AS ladle,
         c.\`DOSAGE / SEC\`         AS flow_rates
    FROM innodose_casting_details_v2 c`;

function parseFlowRates(flow: unknown): number[] {
  if (typeof flow !== 'string' || !flow.length) return [];
  return flow.split(',').map(x => Number(x) || 0);
}

/** Cumulative grams per second for one row. Non-zero entries are kept;
 *  trailing zeros are trimmed so the "box being dosed" curve stops at the last real sample. */
function cumulativeFromFlowRates(flow: number[], pouringTime: number | null): number[] {
  const n = Math.max(1, Math.min(40, pouringTime ?? flow.length));
  const sliced = flow.slice(0, n);
  const out: number[] = [];
  let acc = 0;
  for (const v of sliced) {
    acc += v;
    out.push(Number(acc.toFixed(1)));
  }
  return out;
}

export function v1DashboardRouter(store: AdminStore) {
  const r = Router();
  const auth = requireAuthV1(store);

  // ---------- GET /dashboard ----------
  r.get('/dashboard', auth, async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Dashboard store unavailable' });

    const today = todayStr();
    const comps = await loadComponents(p);
    // Machine state: mode + the component the operator applied in the Control Panel.
    const machineNumericId =
      Number(String(req.query.machineId ?? '').replace(/^m/, '')) || 1;
    const [[mstate]] = await p.query<(RowDataPacket & { mode: 'auto' | 'manual' | 'joystick'; applied_component_id: string | null; applied_pouring_time: number | null; applied_flow_rate: number | null })[]>(
      'SELECT mode, applied_component_id, applied_pouring_time, applied_flow_rate FROM machine_state WHERE machine_id = ? LIMIT 1',
      [machineNumericId],
    ) as unknown as [[{ mode: 'auto' | 'manual' | 'joystick'; applied_component_id: string | null; applied_pouring_time: number | null; applied_flow_rate: number | null } | undefined]];
    // The dashboard shows ONE component: the one applied in the Control Panel,
    // or (nothing applied yet) whichever is running now. Applying a different
    // component in the Control Panel switches everything below to it.
    const activeId = mstate?.applied_component_id && comps.has(mstate.applied_component_id) ? mstate.applied_component_id : null;
    const [[latest]] = await p.query<CastingRow[]>(
      activeId
        ? `${CASTING_SELECT} WHERE DATE(c.datetime) = ? AND c.\`COMPONENT ID\` = ? ORDER BY c.datetime DESC LIMIT 1`
        : `${CASTING_SELECT} WHERE DATE(c.datetime) = ? ORDER BY c.datetime DESC LIMIT 1`,
      activeId ? [today, activeId] : [today],
    );
    const comp = activeId ? comps.get(activeId) : latest ? comps.get(latest.component_id) : undefined;
    const currentId = activeId ?? latest?.component_id ?? '';

    // Per-day totals
    const [[{ boxesDosedToday }]] = await p.query<(RowDataPacket & { boxesDosedToday: number })[]>(
      `SELECT COUNT(*) AS boxesDosedToday FROM innodose_casting_details_v2 WHERE DATE(datetime) = ?`,
      [today],
    ) as unknown as [[{ boxesDosedToday: number }]];
    // Today's boxes across ALL components (newest first). Box numbers restart per
    // component, so the id is the unique row id ("R<id>"); the label stays "B-<n>".
    const [boxRows] = await p.query<CastingRow[]>(
      `${CASTING_SELECT} WHERE DATE(c.datetime) = ? ORDER BY c.datetime DESC LIMIT 300`,
      [today],
    );
    // The box being poured right now (blue "Dosing"): the newest row, only while it is still receiving its
    // per-second samples. Once the pour is complete it takes its normal state (optimal / over / under).
    const newest = boxRows[0];
    const pouringNow = (() => {
      if (!newest) return false;
      const secs = Math.min(40, Number(newest.pouring_time ?? 0));
      const sampled = parseFlowRates(newest.flow_rates).length;
      const ageMs = Date.now() - new Date(newest.datetime).getTime();
      // keep blinking until the chart has drawn the last second (+2 s), not only until the last sample is stored
      return (sampled < secs || ageMs < (secs + 2) * 1000) && ageMs < (secs + 10) * 1000;
    })();
    const boxes = boxRows.map(row => {
      const m = comps.get(row.component_id);
      const expected = m?.expected_dosage_gms ?? null;
      const actual = row.weight_of_inoculant ?? null;
      const state: BoxState = pouringNow && row.id === newest?.id ? 'current' : classify(actual, expected);
      const t = new Date(row.datetime);
      const lo = expected ? Math.round(expected * 0.95) : 0;
      const hi = expected ? Math.round(expected * 1.05) : 0;
      return {
        id: `R${row.id}`,
        label: `B-${row.box_count ?? row.id}`,
        state,
        component: m?.name ?? row.component_id,
        actualGms: Number((actual ?? 0).toFixed(0)),
        expectedMinGms: lo,
        expectedMaxGms: hi,
        timestamp: hms(t),
      };
    });

    // Derive liveConnection from "did we get a row recently?" and mode from
    // machine_state. The frontend's active machine is machineId=m1 (first
    // machine) unless the request names a different one — grab mode for it.
    // Connection = the machine produced a row recently, whatever component it was (the shown
    // component can be a different, previously applied one).
    const [[anyLatest]] = await p.query<CastingRow[]>(`${CASTING_SELECT} ORDER BY c.datetime DESC LIMIT 1`);
    const latestMs = anyLatest ? new Date(anyLatest.datetime).getTime() : 0;
    const liveConnection = latestMs > 0 && Date.now() - latestMs < 120_000;
    // Values applied in the Control Panel for the shown component override the component master here.
    // Expected dose / flow / pouring time follow the component that is pouring right now (the one the chart
    // plots). If the machine is pouring something other than the applied component, use that component's master values.
    const pouring = liveConnection && anyLatest ? comps.get(anyLatest.component_id) : undefined;
    const followPour = !!pouring && pouring.component_id !== comp?.component_id;
    const ec = followPour ? pouring : comp;
    const ov = !followPour && activeId && comp && mstate?.applied_component_id === comp.component_id ? mstate : null;
    const pourT = ov?.applied_pouring_time ? Number(ov.applied_pouring_time) : Number(ec?.pouring_time_sec ?? 0);
    const flowSet = ov?.applied_flow_rate ? Number(ov.applied_flow_rate) : Number(ec?.flow_rate_gms_sec ?? 0);
    const expected = ov?.applied_pouring_time || ov?.applied_flow_rate ? Math.round(pourT * flowSet * 10) / 10 : ec?.expected_dosage_gms ?? 0;
    // Everything "current" (actual dose, ladle/heat, box count, summary cards) follows the same component.
    const curId = ec?.component_id ?? currentId;
    const curRow = followPour ? anyLatest : latest;
    const [[{ boxesCurrent }]] = await p.query<(RowDataPacket & { boxesCurrent: number })[]>(
      `SELECT COUNT(*) AS boxesCurrent FROM innodose_casting_details_v2
        WHERE DATE(datetime) = ? AND \`COMPONENT ID\` = ?`,
      [today, curId],
    ) as unknown as [[{ boxesCurrent: number }]];
    const actualNow = curRow?.weight_of_inoculant ?? 0;
    const inoculation = {
      flowRateSetpoint: flowSet,
      totalExpectedDose: Number(expected),
      tolerancePercent: 5,
      totalActualDose: Number((actualNow ?? 0).toFixed(0)),
      dosingStatus: (liveConnection ? 'In progress' : 'Stopped') as 'In progress' | 'Stopped',
      mode: (mstate?.mode ?? 'auto') as 'auto' | 'manual' | 'joystick',
      liveConnection,
    };

    // If there's no component dosed today, zero every numeric field. The UI
    // handles 0/empty as the empty state — no hardcoded placeholders.
    // Ladle / heat are not in the component master. With no pour of this component today,
    // read them from the component's most recent row in innodose_casting_details_v2 (any day).
    let pourInfo = curRow;
    if (!pourInfo && curId) {
      const [[prev]] = await p.query<CastingRow[]>(
        `${CASTING_SELECT} WHERE c.\`COMPONENT ID\` = ? ORDER BY c.datetime DESC LIMIT 1`,
        [curId],
      );
      pourInfo = prev;
    }
    // Component never poured: show the machine's most recent ladle / heat so the cards are never empty.
    pourInfo = pourInfo ?? anyLatest;
    const summary = {
      bunchWeight: ec?.bunch_weight_kg ?? 0,
      bunchWeightUnit: 'kg',
      targetPouringTime: pourT,
      targetPouringTimeUnit: 'sec',
      targetPouringTempMin: ec?.pouring_temp_min_c ?? 0,
      targetPouringTempMax: ec?.pouring_temp_max_c ?? 0,
      targetPouringTempUnit: '°C',
      ladle: pourInfo?.ladle ?? '—',
      heat:  pourInfo?.heat_no ?? '—',
      grade: ec?.grade ?? '—',
      currentComponent: ec?.name ?? curRow?.component_id ?? '—',
    };

    const pouringTemp =
      ec ? Math.round((ec.pouring_temp_min_c + ec.pouring_temp_max_c) / 2) : null;
    const flow = {
      pouringLabel: 'Pouring',
      pouringTempC: pouringTemp,
      // Pouring time isn't tracked separately from dosing in casting_details_v2;
      // leave null until a dedicated column (or PLC event) is wired.
      pouringSeconds: null,
      dosingLabel: 'Dosing',
      dosingSeconds: curRow?.pouring_time != null ? Math.round(curRow.pouring_time) : null,
      hopperLevel: hopperLevel(boxesDosedToday ?? 0),
    };

    res.json({
      summary, inoculation, flow,
      boxes,
      boxesDosedToday: boxesDosedToday ?? 0,
      boxesDosedForCurrentComponent: boxesCurrent ?? 0,
    });
  });

  // ---------- GET /dashboard/cumulative ----------
  r.get('/dashboard/cumulative', auth, async (_req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Dashboard store unavailable' });

    const today = todayStr();
    const [[row]] = await p.query<CastingRow[]>(
      `${CASTING_SELECT} WHERE DATE(c.datetime) = ? ORDER BY c.datetime DESC LIMIT 1`,
      [today],
    );
    const comps = await loadComponents(p);
    const comp = row ? comps.get(row.component_id) : undefined;
    // No current pour, no component ⇒ no tolerance band. The UI uses the
    // (0, 0) range as the "nothing to show" signal and doesn't draw the band.
    const expected = comp?.expected_dosage_gms ?? 0;
    const tolerance = expected
      ? { min: Math.round(expected * 0.95), max: Math.round(expected * 1.05) }
      : { min: 0, max: 0 };

    if (!row) {
      return res.json({ boxNo: 'B-0', timeAxis: [], points: [], tolerance });
    }

    const flow = parseFlowRates(row.flow_rates);
    const cumulative = cumulativeFromFlowRates(flow, row.pouring_time);
    const start = new Date(row.datetime);
    const timeAxis: string[] = [];
    const points: { time: string; grams: number; boxNo: string }[] = [];
    const boxNo = `B-${row.box_count ?? row.id}`;

    // The simulator / PLC logger stores a finished pour in one row. Reveal it second by second
    // from the row's start time, so the live chart draws the pour as it "happens".
    const elapsed = Math.max(1, Math.floor((Date.now() - start.getTime()) / 1000) + 1);
    const visible = Math.min(cumulative.length, elapsed);
    for (let i = 0; i < visible; i++) {
      const t = new Date(start.getTime() + i * 1000);
      const stamp = hms(t);
      timeAxis.push(stamp);
      points.push({ time: stamp, grams: cumulative[i], boxNo });
    }

    // complete = every second of this pour has been revealed, so the chart knows the pour is over right away
    // The simulator / PLC appends one sample per second, so "all stored samples shown" is NOT "pour over":
    // the pour is only complete once it has delivered every second of its POURING TIME.
    const expectedSamples = Math.max(1, Math.min(40, row.pouring_time ?? flow.length));
    res.json({ boxNo, timeAxis, points, tolerance, pourSeconds: expectedSamples, complete: flow.length >= expectedSamples && visible >= cumulative.length });
  });

  // ---------- GET /dashboard/across-molds ----------
  r.get('/dashboard/across-molds', auth, async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Dashboard store unavailable' });

    const comps = await loadComponents(p);
    const componentName = req.query.component ? String(req.query.component) : null;
    const match = componentName
      ? [...comps.values()].find(c => c.name === componentName) ?? null
      : null;

    // If no component passed, pick the most recent one today.
    let targetId: string | null = match?.component_id ?? null;
    if (!targetId) {
      const [[latest]] = await p.query<CastingRow[]>(
        `${CASTING_SELECT} WHERE DATE(c.datetime) = ? ORDER BY c.datetime DESC LIMIT 1`,
        [todayStr()],
      );
      targetId = latest?.component_id ?? null;
    }
    if (!targetId) return res.json({ component: '—', bars: [], tolerance: { min: 0, max: 0 } });

    const comp = comps.get(targetId);
    const expected = comp?.expected_dosage_gms ?? 80;
    const tolerance = { min: Math.round(expected * 0.95), max: Math.round(expected * 1.05) };

    const [rows] = await p.query<CastingRow[]>(
      `${CASTING_SELECT}
        WHERE DATE(c.datetime) = ? AND c.\`COMPONENT ID\` = ?
        ORDER BY c.datetime ASC`,
      [todayStr(), targetId],
    );

    // Every box dosed today, in order (the box counter can wrap, so a number may repeat later in the day).
    const bars = rows.map(r => {
      const actual = r.weight_of_inoculant ?? 0;
      return {
        boxNo: `B-${r.box_count ?? r.id}`,
        grams: Number(actual.toFixed(0)),
        state: classify(actual, expected),
      };
    });
    res.json({ component: comp?.name ?? targetId, bars, tolerance });
  });

  // ---------- GET /dashboard/boxes/:boxId ----------
  r.get('/dashboard/boxes/:boxId', auth, async (req, res) => {
    const p = getPool();
    if (!p) return res.status(503).json({ message: 'Dashboard store unavailable' });

    const comps = await loadComponents(p);
    // "R<rowId>" is the unique id; legacy "B-<n>" still resolves to the latest such box today.
    const boxParam = String(req.params.boxId);
    const rid = /^R(\d+)$/.exec(boxParam);
    const n = Number(boxParam.replace(/^B-/, ''));
    if (!rid && !Number.isFinite(n)) return res.status(404).json({ message: 'Box not found' });

    const [rows] = await p.query<CastingRow[]>(
      rid
        ? `${CASTING_SELECT} WHERE c.id = ? LIMIT 1`
        : `${CASTING_SELECT}
        WHERE DATE(c.datetime) = ? AND c.\`BOX COUNT\` = ?
        ORDER BY c.datetime DESC LIMIT 1`,
      rid ? [Number(rid[1])] : [todayStr(), n],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Box not yet dosed' });

    const comp = comps.get(row.component_id);
    const expected = comp?.expected_dosage_gms ?? null;
    const t = new Date(row.datetime);
    const flow = parseFlowRates(row.flow_rates);
    const points = cumulativeFromFlowRates(flow, row.pouring_time);

    // The first / last box of the day has no previous / next one: that query returns NO row. (Destructuring that
    // empty result used to throw, which crashed the whole backend whenever the newest box was opened.)
    const [[prevRow], [nextRow]] = await Promise.all([
      p.query<(RowDataPacket & { boxId: string })[]>(
        `SELECT CONCAT('R', id) AS boxId FROM innodose_casting_details_v2
          WHERE DATE(datetime) = ? AND id < ? ORDER BY id DESC LIMIT 1`,
        [todayStr(), row.id],
      ),
      p.query<(RowDataPacket & { boxId: string })[]>(
        `SELECT CONCAT('R', id) AS boxId FROM innodose_casting_details_v2
          WHERE DATE(datetime) = ? AND id > ? ORDER BY id ASC LIMIT 1`,
        [todayStr(), row.id],
      ),
    ]);
    const prevBoxId = prevRow[0]?.boxId ?? null;
    const nextBoxId = nextRow[0]?.boxId ?? null;

    const actual = row.weight_of_inoculant ?? 0;
    const state = classify(actual, expected);
    const status = state === 'optimal' ? 'Optimal Dose'
                 : state === 'over'    ? 'Over Dose'
                 : state === 'under'   ? 'Under Dose'
                 :                       'Dose Miss';

    res.json({
      id: `R${row.id}`,
      boxNo: `B-${row.box_count ?? row.id}`,
      component: comp?.name ?? row.component_id,
      status,
      bunchWeight: `${Math.round(row.weight_of_casting ?? 0)} kg`,
      pouringTime: `${Math.round(row.pouring_time ?? 0)} sec`,
      pouringTarget: comp?.pouring_time_sec ?? 0,
      pouringTemp: comp ? `${Math.round((comp.pouring_temp_min_c + comp.pouring_temp_max_c) / 2)} °C` : '—',
      pouringTempRange: comp ? `${comp.pouring_temp_min_c} - ${comp.pouring_temp_max_c}` : '—',
      ladle: row.ladle ?? '—',
      heat: row.heat_no ?? '—',
      grade: comp?.grade ?? '—',
      shiftLabel: 'Today',
      dosingTime: `${Math.round(row.pouring_time ?? 0)} sec`,
      totalActualDose: Number(actual.toFixed(0)),
      expectedMin: expected ? Math.round(expected * 0.95) : null,
      expectedMax: expected ? Math.round(expected * 1.05) : null,
      flowRate: `${Number(row.flow_of_inoculant ?? 0).toFixed(1)} gms/sec`,
      inoculantContent: `${Number(row.content_of_inoculant ?? 0).toFixed(2)} %`,
      startSecond: t.getHours() * 3600 + t.getMinutes() * 60 + t.getSeconds(),
      points,
      prevBoxId,
      nextBoxId,
    });
  });

  return r;
}
