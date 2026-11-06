/**
 * Seed data for the mock API (the values shown in the Figma design).
 * Pure data + pure functions only — no browser APIs — so it runs both in the
 * browser (VITE_USE_MOCK=true) and in the Express mock server (server/index.ts).
 */
import type {
  AlertConfig,
  AlertRecord,
  BoxState,
  Component,
  DosageBox,
  DoseRecord,
  FlowStatus,
  InoculationStatus,
  LiveAlert,
  Machine,
  ManualOperation,
  MachineParams,
  ProductionSummary,
  Role,
  StorageStatus,
} from '../types';

export interface SeedUser {
  userId: string;
  name: string;
  role: Role;
  initials: string;
  /** Mock only. A real backend stores salted password hashes, never plaintext. */
  password: string;
}

export const users: SeedUser[] = [
  { userId: 'admin', name: 'Plant Administrator', role: 'Administrator', initials: 'PA', password: 'Admin' },
  { userId: 'supervisor', name: 'Shift Supervisor', role: 'Supervisor', initials: 'SS', password: 'GdRC-MyAu-uS8L' },
  { userId: 'operator', name: 'Machine Operator', role: 'Operator', initials: 'MO', password: 'UmbN-haRr-da5D' },
];

export const shift = { time: '15:40:11', date: '29 Aug 2026', shift: 'Shift B' };

export const machines: Machine[] = [
  { id: 'm1', productId: '12335', machineName: 'Inodose Machine 1', productionLine: 'Production Line 1', dateAdded: '15 August 2026' },
  { id: 'm2', productId: '44511', machineName: 'Inodose Machine 2', productionLine: 'Production Line 2', dateAdded: '1 July 2026' },
  { id: 'm3', productId: '37722', machineName: 'Inodose Machine 3', productionLine: 'Production Line 3', dateAdded: '15 July 2026' },
];

export const summary: ProductionSummary = {
  bunchWeight: 50,
  bunchWeightUnit: 'kg',
  targetPouringTime: 20,
  targetPouringTimeUnit: 'sec',
  targetPouringTempMin: 1400,
  targetPouringTempMax: 1440,
  targetPouringTempUnit: '°C',
  ladle: 'L-03',
  heat: 'H-2622C1',
  grade: 'FG220',
  currentComponent: 'C.I. ADAPTER 2” TOP',
};

export const inoculation: InoculationStatus = {
  flowRateSetpoint: 4,
  totalExpectedDose: 80,
  tolerancePercent: 5,
  totalActualDose: 52,
  dosingStatus: 'In progress',
  mode: 'auto',
  liveConnection: true,
};

export const flow: FlowStatus = {
  pouringLabel: 'Pouring',
  pouringTempC: 1410,
  pouringSeconds: 12,
  dosingLabel: 'Dosing',
  dosingSeconds: 11,
  hopperLevel: 'Medium',
};

const boxStates: [string, BoxState][] = [
  ['B-53', 'pending'], ['B-54', 'pending'], ['B-55', 'pending'], ['B-56', 'optimal'], ['B-57', 'optimal'], ['B-58', 'optimal'],
  ['B-59', 'optimal'], ['B-60', 'over'], ['B-61', 'optimal'], ['B-62', 'optimal'], ['B-63', 'optimal'], ['B-64', 'current'],
  ['B-65', 'optimal'], ['B-66', 'under'], ['B-67', 'optimal'], ['B-68', 'optimal'], ['B-69', 'optimal'], ['B-70', 'optimal'],
  ['B-71', 'miss'], ['B-72', 'optimal'], ['B-73', 'optimal'], ['B-74', 'optimal'], ['B-1', 'optimal'], ['B-2', 'optimal'],
  ['B-3', 'optimal'], ['B-4', 'optimal'], ['B-5', 'not-poured'], ['B-6', 'optimal'], ['B-7', 'optimal'], ['B-8', 'optimal'],
  ['B-9', 'optimal'], ['B-10', 'optimal'], ['B-11', 'optimal'],
];

export const boxes: DosageBox[] = boxStates.map(([id, state]) => ({
  id,
  label: id,
  state,
  component: state === 'not-poured' ? 'C.I. ADAPTER 2” TOP' : 'C.I. ADAPTER 1.5” BOTTOM',
  actualGms: state === 'over' ? 130 : state === 'under' ? 70 : state === 'miss' || state === 'not-poured' ? 0 : 120,
  expectedMinGms: 115,
  expectedMaxGms: 125,
  timestamp: '13:15:36',
}));

export const liveAlerts: LiveAlert[] = [
  { id: 'a1', time: '14:00:23', boxNo: 'B-80', type: 'Over Dose', acknowledged: false },
  { id: 'a2', time: '13:25:10', boxNo: 'B-72', type: 'Flow Rate Low', acknowledged: false },
  { id: 'a3', time: '11:05:56', boxNo: 'B-55', type: 'Under Dose', acknowledged: true },
  { id: 'a4', time: '11:01:27', boxNo: 'B-40', type: 'Dose Miss', acknowledged: true },
  { id: 'a5', time: '09:30:10', boxNo: 'B-24', type: 'Pipe Choked', acknowledged: true },
];

export const cumulativePoints = [10, 15, 20, 24, 28, 38, 43, 46, 48, 52].map((grams, i) => ({
  time: `15:40:${String(i + 1).padStart(2, '0')}`,
  grams,
  boxNo: 'B-11',
}));
export const cumulativeAxis = Array.from({ length: 20 }, (_, i) => `15:40:${String(i + 1).padStart(2, '0')}`);
export const cumulativeTolerance = { min: 76, max: 84 };
export const acrossTolerance = { min: 80, max: 88 };

/** Dashboard "Dosage Across Molds (Today)" bars */
export function acrossMoldsToday(seed = 0) {
  const special: Record<string, number> = { 'B-79': 94, 'B-80': 92, 'B-83': 0, 'B-89': 75, 'B-91': 0, 'B-99': 73 };
  const notPoured = new Set(['B-91']);
  return Array.from({ length: 26 }, (_, i) => {
    const boxNo = `B-${75 + i}`;
    const grams = special[boxNo] ?? (seed ? 84 + (((i * 7 + seed) % 5) - 2) : 84);
    return { boxNo, grams, state: classify(boxNo, grams, notPoured) };
  });
}

/** Past Records "View Graph" bars */
export function acrossMoldsForDay(seed = 0) {
  const special: Record<string, number> = { 'B-69': 78, 'B-72': 0, 'B-77': 93, 'B-79': 73, 'B-85': 0, 'B-93': 90 };
  const notPoured = new Set(['B-72']);
  return Array.from({ length: 36 }, (_, i) => {
    const boxNo = `B-${65 + i}`;
    const grams = special[boxNo] ?? (seed ? 84 + (((i * 5 + seed) % 5) - 2) : 84);
    return { boxNo, grams, state: classify(boxNo, grams, notPoured) };
  });
}

function classify(boxNo: string, grams: number, notPoured: Set<string>): BoxState {
  if (notPoured.has(boxNo)) return 'not-poured';
  if (grams === 0) return 'miss';
  if (grams > acrossTolerance.max) return 'over';
  if (grams < acrossTolerance.min) return 'under';
  return 'optimal';
}

export const operation = { machineStatus: 'READY', boxesDosedToday: 104 };
export const storage: StorageStatus = { mainHopperLevel: 'Medium', storageHopperLevel: 'Low', intermediateChamberLevel: 'High' };
export const defaultParams: MachineParams = { componentName: 'C.I. ADAPTER 2” TOP', pouringTimeSec: 20, flowRateGmsPerSec: 4 };

export const manualOps: ManualOperation[] = [
  { key: 'mixingChamber', label: 'Mixing Chamber', kind: 'chamber', active: false, elapsedSeconds: null, startedAt: null },
  { key: 'intermediateChamber', label: 'Intermediate Chamber', kind: 'chamber', active: false, elapsedSeconds: null, startedAt: null },
  { key: 'purging', label: 'Purging', kind: 'motor', active: false, elapsedSeconds: null, startedAt: null },
  { key: 'vibrator', label: 'Vibrator', kind: 'motor', active: false, elapsedSeconds: null, startedAt: null },
];

const doseTemplate = { inoculantFlowRate: '4 gms/sec', inoculantContent: '0.16 %', bunchWeight: '50 kg', pouringTime: '22 sec', pouringTarget: 'Target - 20' };
export const doses: DoseRecord[] = [
  { doseId: 12345, dosingTime: '15:46:18 - 15:46:38', durationSec: 20, machine: 'Inodose Machine 1', boxNo: 'B-30', status: 'Optimal Dose', totalActualDose: '82 gms', totalExpectedDose: '80 - 88 gms', ...doseTemplate },
  { doseId: 12344, dosingTime: '15:45:55 - 15:46:15', durationSec: 20, machine: 'Inodose Machine 1', boxNo: 'B-39', status: 'Optimal Dose', totalActualDose: '80 gms', totalExpectedDose: '80 - 88 gms', ...doseTemplate },
  { doseId: 12343, dosingTime: '15:45:33 - 15:45:55', durationSec: 22, machine: 'Inodose Machine 2', boxNo: 'B-20', status: 'Optimal Dose', totalActualDose: '80 gms', totalExpectedDose: '80 - 88 gms', ...doseTemplate },
  { doseId: 12342, dosingTime: '15:45:55 - 15:46:15', durationSec: 20, machine: 'Inodose Machine 2', boxNo: 'B-19', status: 'Under Dose', totalActualDose: '75 gms', totalExpectedDose: '80 - 88 gms', ...doseTemplate },
  { doseId: 12341, dosingTime: '15:45:55 - 15:46:15', durationSec: 20, machine: 'Inodose Machine 1', boxNo: 'B-38', status: 'Optimal Dose', totalActualDose: '80 gms', totalExpectedDose: '80 - 88 gms', ...doseTemplate },
  { doseId: 12340, dosingTime: '15:45:55 - 15:46:15', durationSec: 20, machine: 'Inodose Machine 1', boxNo: 'B-37', status: 'Optimal Dose', totalActualDose: '80 gms', totalExpectedDose: '80 - 88 gms', ...doseTemplate },
  { doseId: 12339, dosingTime: '15:45:55 - 15:46:15', durationSec: 20, machine: 'Inodose Machine 2', boxNo: 'B-18', status: 'Optimal Dose', totalActualDose: '80 gms', totalExpectedDose: '80 - 88 gms', ...doseTemplate },
  { doseId: 12338, dosingTime: '15:45:55 - 15:46:15', durationSec: 20, machine: 'Inodose Machine 1', boxNo: 'B-36', status: 'Optimal Dose', totalActualDose: '80 gms', totalExpectedDose: '80 - 88 gms', ...doseTemplate },
  { doseId: 12337, dosingTime: '15:45:55 - 15:46:15', durationSec: 20, machine: 'Inodose Machine 1', boxNo: 'B-36', status: 'Over Dose', totalActualDose: '90 gms', totalExpectedDose: '80 - 88 gms', ...doseTemplate },
  { doseId: 12336, dosingTime: '15:45:55 - 15:46:15', durationSec: 20, machine: 'Inodose Machine 2', boxNo: 'B-17', status: 'Optimal Dose', totalActualDose: '80 gms', totalExpectedDose: '80 - 88 gms', ...doseTemplate },
];

const dayCounts = [
  { componentCount: 3, totalBoxes: 300, optimalDose: 200, overDose: 40, underDose: 50, doseMiss: 8, notPoured: 2 },
  { componentCount: 2, totalBoxes: 150, optimalDose: 115, overDose: 16, underDose: 14, doseMiss: 5, notPoured: 0 },
  { componentCount: 3, totalBoxes: 84, optimalDose: 72, overDose: 3, underDose: 3, doseMiss: 2, notPoured: 0 },
];
export const recordDates = [
  '05-Oct-2026', '04-Oct-2026', '03-Oct-2026', '02-Oct-2026', '01-Oct-2026', '30-Sep-2026', '29-Sep-2026',
  '28-Sep-2026', '27-Sep-2026', '26-Sep-2026', '25-Sep-2026', '24-Sep-2026', '23-Sep-2026',
];
export const dayRecords = recordDates.map((date, i) => ({ date, ...dayCounts[i % 3] }));

/** Component breakdown of one day (04-Oct is the design-file example; other days are split deterministically) */
export function componentBreakdown(date: string, componentNames: string[]) {
  if (date === '04-Oct-2026') {
    return [
      { componentName: 'C.I. ADAPTER 2” TOP', totalBoxes: 100, optimalDose: 70, overDose: 15, underDose: 10, doseMiss: 5, notPoured: 0 },
      { componentName: 'C.I. ADAPTER 1.5” BOTTOM', totalBoxes: 50, optimalDose: 45, overDose: 1, underDose: 4, doseMiss: 0, notPoured: 0 },
    ];
  }
  const day = dayRecords.find((d) => d.date === date);
  if (!day) return [];
  const n = Math.min(day.componentCount, componentNames.length);
  const keys = ['totalBoxes', 'optimalDose', 'overDose', 'underDose', 'doseMiss', 'notPoured'] as const;
  return Array.from({ length: n }, (_, i) => {
    const row: Record<string, number | string> = { componentName: componentNames[i] };
    for (const k of keys) {
      const base = Math.floor(day[k] / n);
      row[k] = i === 0 ? day[k] - base * (n - 1) : base;
    }
    return row as unknown as { componentName: string; totalBoxes: number; optimalDose: number; overDose: number; underDose: number; doseMiss: number; notPoured: number };
  });
}

export const alertRecords: AlertRecord[] = [
  { id: 'r1', date: '05-Oct-2026', time: '15:46:38', alertType: 'Over Dose', boxNo: 'B-100', doseId: 12345, component: 'C.I. ADAPTER 2” TOP', machine: 'Inodose Machine 1', acknowledgedBy: 'Vedank Paliwal' },
  { id: 'r2', date: '04-Oct-2026', time: '15:46:11', alertType: 'Under Dose', boxNo: 'B-99', doseId: 12344, component: 'C.I. ADAPTER 2” TOP', machine: 'Inodose Machine 2', acknowledgedBy: 'Manoj Paswan' },
  { id: 'r3', date: '03-Oct-2026', time: '15:45:00', alertType: 'Dose Miss', boxNo: 'B-98', doseId: 12343, component: 'C.I. ADAPTER 2” TOP', machine: 'Inodose Machine 1', acknowledgedBy: 'Sahil Shigwan' },
  { id: 'r4', date: '02-Oct-2026', time: '15:44:38', alertType: 'Pipe Choked', boxNo: 'B-97', doseId: 12342, component: 'C.I. ADAPTER 2” TOP', machine: 'Inodose Machine 1', acknowledgedBy: null },
  { id: 'r5', date: '01-Oct-2026', time: '14:46:38', alertType: 'Over Dose', boxNo: 'B-96', doseId: 12341, component: 'C.I. ADAPTER 2” TOP', machine: 'Inodose Machine 2', acknowledgedBy: 'Kartik Dhoke' },
  { id: 'r6', date: '30-Sep-2026', time: '14:15:38', alertType: 'Over Dose', boxNo: 'B-95', doseId: 12340, component: 'C.I. ADAPTER 2” TOP', machine: 'Inodose Machine 1', acknowledgedBy: 'Vedank Paliwal' },
  { id: 'r7', date: '29-Sep-2026', time: '14:55:00', alertType: 'Over Dose', boxNo: 'B-94', doseId: 12339, component: 'C.I. ADAPTER 2” TOP', machine: 'Inodose Machine 1', acknowledgedBy: 'Manoj Paswan' },
  { id: 'r8', date: '28-Sep-2026', time: '14:25:25', alertType: 'Over Dose', boxNo: 'B-93', doseId: 12338, component: 'C.I. ADAPTER 2” TOP', machine: 'Inodose Machine 3', acknowledgedBy: null },
  { id: 'r9', date: '27-Sep-2026', time: '14:09:40', alertType: 'Over Dose', boxNo: 'B-92', doseId: 12337, component: 'C.I. ADAPTER 2” TOP', machine: 'Inodose Machine 3', acknowledgedBy: null },
  { id: 'r10', date: '26-Sep-2026', time: '13:56:38', alertType: 'Over Dose', boxNo: 'B-91', doseId: 12336, component: 'C.I. ADAPTER 2” TOP', machine: 'Inodose Machine 1', acknowledgedBy: 'Vedank Paliwal' },
  { id: 'r11', date: '25-Sep-2026', time: '13:30:34', alertType: 'Over Dose', boxNo: 'B-90', doseId: 12335, component: 'C.I. ADAPTER 2” TOP', machine: 'Inodose Machine 3', acknowledgedBy: 'Manoj Paswan' },
  { id: 'r12', date: '24-Sep-2026', time: '13:23:23', alertType: 'Over Dose', boxNo: 'B-89', doseId: 12334, component: 'C.I. ADAPTER 2” TOP', machine: 'Inodose Machine 1', acknowledgedBy: 'Sahil Shigwan' },
  { id: 'r13', date: '23-Sep-2026', time: '13:10:12', alertType: 'Over Dose', boxNo: 'B-88', doseId: 12333, component: 'C.I. ADAPTER 2” TOP', machine: 'Inodose Machine 2', acknowledgedBy: 'Kartik Dhoke' },
];

/** Cumulative grams per second for a recorded dose */
const doseCurve = [6, 12, 14, 17, 22, 30, 33, 38, 40, 42, 46, 50, 57, 62, 65, 67, 67, 67, 67, 70];
export function doseSeries(start = '12:40:01') {
  const [h, m, s] = start.split(':').map(Number);
  const t0 = h * 3600 + m * 60 + s;
  return doseCurve.map((grams, i) => ({ time: hms(t0 + i), grams }));
}
export const doseSeriesScale = { max: 150, step: 15, tolerance: { min: 105, max: 125 } };

export const components: Component[] = [
  { id: 'c1', componentId: 'C-100', componentName: 'C.I. ADAPTER 2” TOP', pouringTempMin: 1400, pouringTempMax: 1440, pouringTimeSec: 20, inoculantFlowRate: 4, expectedDosageGms: 80, grade: 'FG220', pattern: 'PTN-100', bunchWeightKg: 50 },
  { id: 'c2', componentId: 'C-101', componentName: 'C.I. ADAPTER 1.5” BOTTOM', pouringTempMin: 1420, pouringTempMax: 1460, pouringTimeSec: 22, inoculantFlowRate: 6, expectedDosageGms: 132, grade: 'FG400', pattern: 'PTN-101', bunchWeightKg: 40 },
  { id: 'c3', componentId: 'C-102', componentName: 'Component 3', pouringTempMin: 1350, pouringTempMax: 1370, pouringTimeSec: 40, inoculantFlowRate: 3.5, expectedDosageGms: 140, grade: 'FG100', pattern: 'PTN-102', bunchWeightKg: 70 },
];

export const alertConfigs: AlertConfig[] = [
  { id: 'ac1', alertType: 'Over Dose', enabled: true, emails: ['vedank.paliwal@mpmindia.in'] },
  { id: 'ac2', alertType: 'Under Dose', enabled: true, emails: ['vedank.paliwal@mpmindia.in'] },
  { id: 'ac3', alertType: 'Dose Missed', enabled: true, emails: ['vedank.paliwal@mpmindia.in'] },
  { id: 'ac4', alertType: 'Pipe Choked', enabled: true, emails: [] },
  { id: 'ac5', alertType: 'Fault Pressure of Air', enabled: true, emails: ['vedank.paliwal@mpmindia.in', 'manoj.paswan@mpmindia.in', 'sahil.shigwan@mpmindia.in'] },
  { id: 'ac6', alertType: 'Fault Stepper Motor', enabled: false, emails: [] },
  { id: 'ac7', alertType: 'Warning Volume of Inoculant in Intermediate Chamber', enabled: true, emails: ['vedank.paliwal@mpmindia.in'] },
];

/** Default branding: empty logoUrl means "use the bundled default logo" */
export const branding = { customerName: 'Gujarat Metal Cast', logoUrl: '' };

export function hms(t: number) {
  t = ((t % 86400) + 86400) % 86400;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 3600))}:${p(Math.floor(t / 60) % 60)}:${p(t % 60)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "05-Oct-2026" -> "2026-10-05" */
export function toIso(d: string) {
  const [dd, mon, yyyy] = d.split('-');
  return `${yyyy}-${String(MONTHS.indexOf(mon) + 1).padStart(2, '0')}-${dd}`;
}
