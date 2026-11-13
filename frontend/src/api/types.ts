/**
 * Data contracts between the Inodose frontend and the backend REST API.
 * Every endpoint in docs/API.md returns one of these shapes (JSON).
 */

/* ----------------------------- Auth ----------------------------- */
export type Role = 'Operator' | 'Supervisor' | 'Administrator';

export interface User {
  userId: string;
  name: string;
  role: Role;
  initials: string;
  /** The role's page / control-mode permissions (Administration → Permissions). Pages and controls follow these. */
  permissions?: import('./administration').Permissions;
}

export interface LoginRequest {
  userId: string;
  password: string;
  staySignedIn: boolean;
}

export interface LoginResponse {
  token: string;
  /** ISO timestamp when the token expires */
  expiresAt: string;
  user: User;
}

/* ---------------------------- Common ---------------------------- */
export interface Inoculant {
  id: string;
  name: string;
  /** id + name of the row in the inoculant_types table */
  typeId: string;
  type: string;
  application: string;
  /** grain size in mm, e.g. "0.2 – 0.7" */
  size: string;
  /** g/cm3 */
  specificGravity: number | null;
  /** content, % */
  contentPct: number | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}
export interface InoculantType { id: string; name: string }
export type InoculantInput = Omit<Inoculant, 'id' | 'typeId' | 'specificGravity' | 'contentPct' | 'updatedAt' | 'updatedBy'> & {
  specificGravity: number | string;
  contentPct: number | string;
};

export interface Machine {
  id: string;
  productId: string;
  machineName: string;
  productionLine: string;
  dateAdded: string;
  /** ISO timestamp; server-managed. */
  updatedAt?: string | null;
  /** Username of the person who last changed this row. */
  updatedBy?: string | null;
}

/** A configured plant shift. start/end are 24h "HH:MM"; start > end means it runs past midnight. */
export interface ShiftDef { id: string; name: string; start: string; end: string }

export interface ShiftInfo {
  /** e.g. "15:40:11" */
  time: string;
  /** e.g. "29 Aug 2026" */
  date: string;
  /** e.g. "Shift B" */
  shift: string;
}

export type MachineMode = 'auto' | 'joystick' | 'manual';
export type Level = 'High' | 'Medium' | 'Low';

/* --------------------------- Alerts ----------------------------- */
export interface LiveAlert {
  id: string;
  time: string;
  boxNo: string;
  type: string;
  acknowledged: boolean;
}

/* -------------------------- Dashboard --------------------------- */
export interface ProductionSummary {
  bunchWeight: number;
  bunchWeightUnit: string;
  targetPouringTime: number;
  targetPouringTimeUnit: string;
  targetPouringTempMin: number;
  targetPouringTempMax: number;
  targetPouringTempUnit: string;
  ladle: string;
  heat: string;
  grade: string;
  currentComponent: string;
}

export interface InoculationStatus {
  flowRateSetpoint: number;
  totalExpectedDose: number;
  tolerancePercent: number;
  totalActualDose: number;
  dosingStatus: 'In progress' | 'Stopped';
  mode: MachineMode;
  liveConnection: boolean;
}

export interface FlowStatus {
  pouringLabel: string;
  pouringTempC: number | null;
  pouringSeconds: number | null;
  dosingLabel: string;
  dosingSeconds: number | null;
  hopperLevel: Level;
}

export type BoxState = 'pending' | 'optimal' | 'over' | 'under' | 'miss' | 'not-poured' | 'current';

export interface DosageBox {
  id: string;
  label: string;
  state: BoxState;
  component: string;
  actualGms: number;
  expectedMinGms: number;
  expectedMaxGms: number;
  timestamp: string;
}

export interface CumulativePoint {
  time: string;
  grams: number;
  boxNo: string;
}

export interface CumulativeSeries {
  boxNo: string;
  /** every second on the x-axis, even before data arrives */
  timeAxis: string[];
  points: CumulativePoint[];
  tolerance: { min: number; max: number };
  /** true once every second of the pour has been recorded (the pour is over) */
  complete?: boolean;
  /** length of this pour in seconds (its pouring time), so the chart can fit the whole pour */
  pourSeconds?: number | null;
}

export interface AcrossMoldsBar {
  boxNo: string;
  grams: number;
  state: BoxState;
}

export interface AcrossMoldsSeries {
  component: string;
  bars: AcrossMoldsBar[];
  tolerance: { min: number; max: number };
}

export interface DashboardSnapshot {
  summary: ProductionSummary;
  inoculation: InoculationStatus;
  flow: FlowStatus;
  boxes: DosageBox[];
  boxesDosedToday: number;
  boxesDosedForCurrentComponent: number;
}

/** Full record of one box, shown in the box-detail pop-up */
export interface BoxDetail {
  /** Unique row id used for navigation; falls back to boxNo (mock data). */
  id?: string;
  boxNo: string;
  component: string;
  status: string;
  bunchWeight: string;
  pouringTime: string;
  pouringTarget: number;
  pouringTemp: string;
  pouringTempRange: string;
  ladle: string;
  heat: string;
  grade: string;
  shiftLabel: string;
  dosingTime: string;
  totalActualDose: number;
  expectedMin: number | null;
  expectedMax: number | null;
  flowRate: string;
  inoculantContent: string;
  /** first x-axis second, seconds since midnight */
  startSecond: number;
  /** cumulative grams per second; empty when not poured */
  points: number[];
  prevBoxId: string | null;
  nextBoxId: string | null;
}

/* ------------------------- Control Panel ------------------------ */
export interface MachineParams {
  componentName: string;
  pouringTimeSec: number;
  flowRateGmsPerSec: number;
}

export interface OperationStatus {
  machineStatus: string;
  boxesDosedToday: number;
}

export interface StorageStatus {
  mainHopperLevel: Level;
  storageHopperLevel: Level;
  intermediateChamberLevel: Level;
}

export type ManualOpKey = 'mixingChamber' | 'intermediateChamber' | 'purging' | 'vibrator';

export interface ManualOperation {
  key: ManualOpKey;
  label: string;
  kind: 'chamber' | 'motor';
  active: boolean;
  /** seconds since the operation started (null when inactive), at response time */
  elapsedSeconds: number | null;
  /** ISO time the operation started; the UI counts up from here */
  startedAt: string | null;
}

export interface ControlPanelState {
  machineId: string;
  connected: boolean;
  appliedMode: MachineMode;
  params: MachineParams;
  operation: OperationStatus;
  storage: StorageStatus;
  manualOps: ManualOperation[];
  inoculantDosedGms: number | null;
  /** Applied (temporary) values: when they go back to the component master (3 hours / next day). Absent/null = master values. */
  overrideUntil?: string | null;
  /** same, as "13-11-2026 14:30" in the plant timezone */
  overrideUntilText?: string | null;
}

export interface ApplySettingsRequest {
  mode: MachineMode;
  params: MachineParams;
}

/* ------------------------- Past Records ------------------------- */
export interface DoseCounts {
  totalBoxes: number;
  optimalDose: number;
  overDose: number;
  underDose: number;
  doseMiss: number;
  notPoured: number;
}

export interface DoseRecord {
  doseId: number;
  dosingTime: string;
  durationSec: number;
  machine: string;
  boxNo: string;
  status: string;
  totalActualDose: string;
  totalExpectedDose: string;
  inoculantFlowRate: string;
  inoculantContent: string;
  bunchWeight: string;
  pouringTime: string;
  pouringTarget: string;
  pouringTemp?: string;
  ladle?: string;
  heat?: string;
  grade?: string;
  pattern?: string;
  inoculantType?: string;
  dosagePerSec?: string;
  alerts?: string;
}

export interface ComponentDay extends DoseCounts {
  componentName: string;
}

export interface DayRecord extends DoseCounts {
  date: string;
  componentCount: number;
  components: ComponentDay[];
}

export interface AlertRecord {
  id: string;
  date: string;
  time: string;
  alertType: string;
  boxNo: string;
  doseId: number;
  component: string;
  machine: string;
  acknowledgedBy: string | null;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface RecordFilters {
  from: string;
  to: string;
  componentId: string; // 'all' or component id
  machineId: string;   // 'all' or machine id
  page: number;
}

export interface TimePoint {
  time: string;
  grams: number;
}

/* ------------------------ Configurations ------------------------ */
export interface Component {
  id: string;
  componentId: string;
  componentName: string;
  pouringTempMin: number;
  pouringTempMax: number;
  pouringTimeSec: number;
  inoculantFlowRate: number;
  expectedDosageGms: number;
  grade: string;
  /** foundry pattern used to cast the component */
  /** Pattern ID */
  pattern: string;
  /** linked row of the Inoculant Master */
  inoculantId?: string | null;
  inoculantName?: string | null;
  bunchWeightKg: number;
  /** ISO timestamp; server-managed. */
  createdAt?: string | null;
  /** ISO timestamp; server-managed. */
  updatedAt?: string | null;
  /** Username of the person who last changed this row. */
  updatedBy?: string | null;
}
export type ComponentInput = Omit<Component, 'id' | 'inoculantName' | 'createdAt' | 'updatedAt' | 'updatedBy'>;

export interface AlertSource {
  table: string;
  column: string;
  defaults: { table: string; column: string };
  /** tables usable as a source, each with its numeric columns */
  tables: { name: string; columns: string[] }[];
}

export interface AlertConfig {
  id: string;
  alertType: string;
  enabled: boolean;
  emails: string[];
  /** tolerance band for this alert (min / max) */
  minTolerance?: number;
  maxTolerance?: number;
}

export type MachineInput = Omit<Machine, 'id' | 'dateAdded'>;

export interface Branding {
  customerName: string;
  /** data: URL or absolute URL of the customer logo */
  logoUrl: string;
}

/* --------------------------- Audit ------------------------------ */
export interface AuditEntry {
  at: string;
  userId: string;
  role: Role;
  action: string;
  detail: string;
}
