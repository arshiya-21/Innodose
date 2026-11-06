/**
 * Thin DB layer. Swap DB_DRIVER in .env between "mock" and "pg".
 * Add drivers (mysql2, mssql, ...) by extending the switch at the bottom.
 */
import pg from 'pg';

export interface DoseRow {
  id: number;
  dosingTime: string;
  machine: string;
  boxNo: string;
  status: string;
  totalActualDose: string;
  totalExpectedDose: string;
  flowRate: string;
  content: string;
  bunchWeight: string;
  pouringTime: string;
}
export interface ComponentGroup {
  name: string;
  totalBoxes: number;
  optimalDose: number; overDose: number; underDose: number;
  doseMiss: number;   notPoured: number;
  rows: DoseRow[];
}
export interface DayGroup {
  date: string;
  componentsCount: number;
  totalBoxes: number;
  optimalDose: number; overDose: number; underDose: number;
  doseMiss: number;   notPoured: number;
  components: ComponentGroup[];
}

export interface DataStore {
  listPastRecords(from: string, to: string, component?: string, machine?: string): Promise<DayGroup[]>;
  liveSnapshot(): Promise<{ boxes: Array<{ id: number; status: string }> }>;
}

/* ---------------- mock driver (default) ---------------- */

function sampleRows(seed: number): DoseRow[] {
  return Array.from({ length: 11 }).map((_, i) => {
    const id = 12345 - i - seed * 100;
    const s =
      i % 4 === 3 ? 'Under Dose' : i === 9 ? 'Over Dose' : 'Optimal Dose';
    const dose = s === 'Over Dose' ? '90 gms' : s === 'Under Dose' ? '75 gms' : '80 gms';
    return {
      id,
      dosingTime: '15:45:55 - 15:46:15 (20 sec)',
      machine: i % 2 === 0 ? 'Inodose Machine 1' : 'Inodose Machine 2',
      boxNo: `B-${40 - i}`,
      status: s,
      totalActualDose: dose,
      totalExpectedDose: '80 - 88 gms',
      flowRate: '4 gms/sec',
      content: '0.16 %',
      bunchWeight: '50 kg',
      pouringTime: '22 sec (Target - 20)',
    };
  });
}

const mock: DataStore = {
  async listPastRecords() {
    return [
      {
        date: '04-Oct-2026', componentsCount: 2, totalBoxes: 150,
        optimalDose: 115, overDose: 16, underDose: 14, doseMiss: 5, notPoured: 0,
        components: [
          { name: 'C.I. ADAPTER 2” TOP',     totalBoxes: 100, optimalDose: 70, overDose: 15, underDose: 10, doseMiss: 5, notPoured: 0, rows: sampleRows(0) },
          { name: 'C.I. ADAPTER 1.5” BOTTOM', totalBoxes: 50,  optimalDose: 45, overDose: 1,  underDose: 4,  doseMiss: 0, notPoured: 0, rows: sampleRows(1) },
        ],
      },
    ];
  },
  async liveSnapshot() {
    return {
      boxes: Array.from({ length: 160 }).map((_, i) => ({
        id: i + 1,
        status: i % 11 === 0 ? 'Over Dose' : i % 7 === 0 ? 'Dosing' : i % 5 === 0 ? 'Not Poured' : 'Optimal Dose',
      })),
    };
  },
};

/* ---------------- postgres driver ---------------- */

function pgDriver(): DataStore {
  const pool = new pg.Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });

  return {
    async listPastRecords(from, to, component, machine) {
      // TODO: real schema. This is a placeholder shape — join your own tables here.
      const r = await pool.query(
        `select date, components_count, total_boxes,
                optimal_dose, over_dose, under_dose, dose_miss, not_poured
         from v_past_records_summary
         where date between $1 and $2
           and ($3::text is null or components @> array[$3])
           and ($4::text is null or machines  @> array[$4])
         order by date desc`,
        [from, to, component ?? null, machine ?? null],
      );
      // For brevity: each day returned here has an empty components[]. Add a second
      // query (or a lateral join) to hydrate component groups and rows.
      return r.rows.map((row) => ({
        date: row.date,
        componentsCount: row.components_count,
        totalBoxes: row.total_boxes,
        optimalDose: row.optimal_dose,
        overDose: row.over_dose,
        underDose: row.under_dose,
        doseMiss: row.dose_miss,
        notPoured: row.not_poured,
        components: [],
      }));
    },

    async liveSnapshot() {
      const r = await pool.query(
        `select box_id as id, status
         from v_live_boxes_today
         order by box_id`,
      );
      return { boxes: r.rows };
    },
  };
}

/* ---------------- selector ---------------- */

export function makeStore(): DataStore {
  switch (process.env.DB_DRIVER) {
    case 'pg': return pgDriver();
    case 'mock':
    default: return mock;
  }
}
