/**
 * Which table + column the alert calculation reads the dosed amount from.
 * Table / column names come from the user, so they are only ever used after
 * being checked against information_schema (never concatenated unchecked).
 */
import type { Pool, RowDataPacket } from 'mysql2/promise';

export const DEFAULT_SOURCE = { table: 'innodose_casting_details_v2', column: 'WEIGHT OF INOCULANT' };

/** A usable source table must carry the columns the live-alert query joins on. */
const REQUIRED = ['id', 'datetime', 'COMPONENT ID', 'BOX COUNT'];
const NUMERIC = ['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'float', 'double', 'decimal'];

export interface SourceOptions { name: string; columns: string[] }

export async function listSourceOptions(p: Pool): Promise<SourceOptions[]> {
  const [rows] = await p.query<RowDataPacket[]>(
    `SELECT table_name AS t, column_name AS c, data_type AS d
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
      ORDER BY table_name, ordinal_position`,
  );
  const byTable = new Map<string, { name: string; type: string }[]>();
  for (const r of rows) {
    const t = String(r.t);
    (byTable.get(t) ?? byTable.set(t, []).get(t)!).push({ name: String(r.c), type: String(r.d).toLowerCase() });
  }
  const out: SourceOptions[] = [];
  for (const [name, cols] of byTable) {
    const has = new Set(cols.map((c) => c.name));
    if (!REQUIRED.every((c) => has.has(c))) continue;
    out.push({ name, columns: cols.filter((c) => NUMERIC.includes(c.type) && c.name !== 'id').map((c) => c.name) });
  }
  return out;
}

/** The saved choice, falling back to the default if it is missing or no longer valid. */
export async function getAlertSource(p: Pool): Promise<{ table: string; column: string }> {
  let saved = DEFAULT_SOURCE;
  try {
    const [rows] = await p.query<RowDataPacket[]>('SELECT table_name, dose_column FROM alert_source WHERE id = 1');
    if (rows[0]) saved = { table: String(rows[0].table_name), column: String(rows[0].dose_column) };
  } catch { /* table not migrated yet → default */ }
  const opts = await listSourceOptions(p);
  const ok = opts.find((o) => o.name === saved.table)?.columns.includes(saved.column);
  return ok ? saved : DEFAULT_SOURCE;
}

/** Validates then stores the choice. Returns an error message, or null when saved. */
export async function saveAlertSource(p: Pool, table: string, column: string): Promise<string | null> {
  const opts = await listSourceOptions(p);
  const t = opts.find((o) => o.name === table);
  if (!t) return `Table "${table}" cannot be used (it needs id, datetime, COMPONENT ID and BOX COUNT columns).`;
  if (!t.columns.includes(column)) return `Column "${column}" is not a numeric column of ${table}.`;
  await p.query(
    'INSERT INTO alert_source (id, table_name, dose_column) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE table_name = VALUES(table_name), dose_column = VALUES(dose_column)',
    [table, column],
  );
  return null;
}

/** Back-tick quote an identifier that has already been validated. */
export const q = (id: string) => '`' + id.replace(/`/g, '``') + '`';
