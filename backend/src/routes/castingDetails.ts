/**
 * Reads the production `innodose_casting_details_v2` table and shapes rows
 * for the Past Records → expanded-component sub-table.
 *
 * Status (Optimal / Over / Under Dose) is derived by comparing each row's
 * `WEIGHT OF INOCULANT` against the expected dosage for its COMPONENT ID
 * from the `components` master table (±5% tolerance).
 *
 * The components master lives in the admin DB (MYSQL_DATABASE); the casting
 * details live in MYSQL_DATA_DATABASE — hence two pools.
 */
import { Router } from 'express';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';

let dataPool: Pool | null = null;
function getDataPool(): Pool | null {
  if (dataPool) return dataPool;
  if ((process.env.ADMIN_DRIVER ?? 'memory') !== 'mysql') return null;
  dataPool = mysql.createPool({
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATA_DATABASE ?? 'inodose_test',
    waitForConnections: true, connectionLimit: 5,
  });
  return dataPool;
}

interface V2Row extends RowDataPacket {
  id: number;
  datetime: Date;
  'WEIGHT OF CASTING': number | null;
  'CONTENT OF INOCULANT': number | null;
  'POURING TIME': number | null;
  'WEIGHT OF INOCULANT': number | null;
  'FLOW OF INOCULANT': number | null;
  'HEAT NO': string | null;
  'PATTERN ID': string | null;
  'COMPONENT ID': string | null;
  'BOX COUNT': number | null;
}
interface ExpectedRow extends RowDataPacket {
  component_id: string;
  name: string;
  expected_dosage_gms: number;
  pouring_time_sec: number;
  flow_rate_gms_sec: string | number;
  bunch_weight_kg: number;
  grade: string;
}

function classify(actual: number | null, expected: number): 'Optimal Dose' | 'Over Dose' | 'Under Dose' {
  if (actual == null) return 'Under Dose';
  const low = expected * 0.95;
  const high = expected * 1.05;
  if (actual < low) return 'Under Dose';
  if (actual > high) return 'Over Dose';
  return 'Optimal Dose';
}

function fmtTime(d: Date | string): string {
  const dt = new Date(d);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

export function castingDetailsRouter() {
  const r = Router();

  /**
   * GET /api/casting-details-v2?from=YYYY-MM-DD&to=YYYY-MM-DD&component=...&limit=50&offset=0
   */
  r.get('/casting-details-v2', async (req, res) => {
    const p = getDataPool();
    if (!p) return res.status(503).json({ error: 'Data store unavailable' });

    const from = String(req.query.from ?? '1970-01-01');
    const to = String(req.query.to ?? '2999-12-31');
    const componentId = req.query.component ? String(req.query.component) : null;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));

    const [rows] = await p.query<V2Row[]>(
      `SELECT id, datetime,
              \`WEIGHT OF CASTING\`, \`CONTENT OF INOCULANT\`, \`POURING TIME\`,
              \`WEIGHT OF INOCULANT\`, \`FLOW OF INOCULANT\`,
              \`HEAT NO\`, \`PATTERN ID\`, \`COMPONENT ID\`, \`BOX COUNT\`
       FROM innodose_casting_details_v2
       WHERE datetime BETWEEN ? AND ?
         AND (? IS NULL OR \`COMPONENT ID\` = ?)
       ORDER BY datetime DESC
       LIMIT ? OFFSET ?`,
      [`${from} 00:00:00`, `${to} 23:59:59`, componentId, componentId, limit, offset],
    );

    // Pull expected values from the components master (admin DB).
    const expectedMap = new Map<string, ExpectedRow>();
    const uniqueComponentIds = [...new Set(rows.map(r => r['COMPONENT ID']).filter(Boolean))] as string[];
    if (uniqueComponentIds.length) {
      const adminDb = process.env.MYSQL_DATABASE ?? 'inodose_test';
      const [expected] = await p.query<ExpectedRow[]>(
        `SELECT component_id, name, expected_dosage_gms, pouring_time_sec,
                flow_rate_gms_sec, bunch_weight_kg, grade
         FROM \`${adminDb}\`.components
         WHERE component_id IN (${uniqueComponentIds.map(() => '?').join(',')})`,
        uniqueComponentIds,
      );
      for (const e of expected) expectedMap.set(e.component_id, e);
    }

    const shaped = rows.map(r => {
      const cId = r['COMPONENT ID'] ?? '';
      const expected = expectedMap.get(cId);
      const actualDose = r['WEIGHT OF INOCULANT'];
      const expectedDose = expected?.expected_dosage_gms ?? 0;
      const status = expected ? classify(actualDose, expectedDose) : 'Optimal Dose';
      const low = Math.round(expectedDose * 0.95);
      const high = Math.round(expectedDose * 1.05);
      return {
        doseId: r.id,
        dosingTime: fmtTime(r.datetime),
        dateTime: r.datetime,
        machine: r['PATTERN ID'] ?? '—',
        boxNo: r['BOX COUNT'] != null ? `B-${r['BOX COUNT']}` : '—',
        status,
        totalActualDose: actualDose != null ? `${actualDose.toFixed(0)} gms` : '—',
        totalExpectedDose: expectedDose ? `${low} - ${high} gms` : '—',
        inoculantFlowRate: r['FLOW OF INOCULANT'] != null ? `${r['FLOW OF INOCULANT'].toFixed(1)} gms/sec` : '—',
        inoculantContent: r['CONTENT OF INOCULANT'] != null ? `${r['CONTENT OF INOCULANT'].toFixed(2)} %` : '—',
        bunchWeight: r['WEIGHT OF CASTING'] != null ? `${r['WEIGHT OF CASTING'].toFixed(0)} kg` : '—',
        pouringTime: r['POURING TIME'] != null && expected
          ? `${r['POURING TIME'].toFixed(0)} sec (Target - ${expected.pouring_time_sec})`
          : r['POURING TIME'] != null ? `${r['POURING TIME'].toFixed(0)} sec` : '—',
        heatNo: r['HEAT NO'] ?? '—',
        componentId: cId,
        componentName: expected?.name ?? cId,
      };
    });

    res.json({ rows: shaped, limit, offset, count: shaped.length });
  });

  return r;
}
