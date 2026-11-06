/**
 * Mock implementation of the Inodose REST API (see docs/API.md).
 * Used in the browser when VITE_USE_MOCK=true, and by the Express mock server.
 * It keeps state in memory, enforces the same role rules the real backend must,
 * and writes an audit log — so the UI behaves exactly as it will against the backend.
 */
import type {
  AcrossMoldsSeries,
  AlertConfig,
  AuditEntry,
  BoxDetail,
  Branding,
  Component,
  ComponentInput,
  ControlPanelState,
  DashboardSnapshot,
  DayRecord,
  Machine,
  MachineInput,
  MachineMode,
  ManualOperation,
  MachineParams,
  Paged,
  Role,
  User,
} from '../types';
import * as seed from './seed';

export interface MockResponse {
  status: number;
  body: unknown;
}

/* ------------------------------ state ------------------------------ */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

interface MachineState {
  appliedMode: MachineMode;
  params: MachineParams;
  manualOps: ManualOperation[];
}

const db = {
  liveAlerts: clone(seed.liveAlerts),
  alertRecords: clone(seed.alertRecords),
  components: clone(seed.components),
  machines: clone(seed.machines),
  alertConfigs: clone(seed.alertConfigs),
  branding: clone(seed.branding) as Branding,
  audit: [] as AuditEntry[],
  machineState: new Map<string, MachineState>(),
};

function machineState(id: string): MachineState {
  let s = db.machineState.get(id);
  if (!s) {
    s = { appliedMode: 'auto', params: clone(seed.defaultParams), manualOps: clone(seed.manualOps) };
    db.machineState.set(id, s);
  }
  return s;
}

/* ------------------------------ auth ------------------------------- */
const RANK: Record<Role, number> = { Operator: 1, Supervisor: 2, Administrator: 3 };
const SESSION_MS = 12 * 60 * 60 * 1000;
const failures = new Map<string, { count: number; until: number }>();

/** Mock token = base64("userId|expiresAt"). A real backend issues a signed JWT / opaque session id. */
function makeToken(userId: string, expiresAt: number) {
  return 'mock.' + btoa(`${userId}|${expiresAt}`);
}
function userFromToken(token: string | null): User | null {
  if (!token || !token.startsWith('mock.')) return null;
  try {
    const [userId, exp] = atob(token.slice(5)).split('|');
    if (Date.now() > Number(exp)) return null;
    const u = seed.users.find((x) => x.userId === userId);
    return u ? publicUser(u) : null;
  } catch {
    return null;
  }
}
const publicUser = (u: seed.SeedUser): User => ({ userId: u.userId, name: u.name, role: u.role, initials: u.initials });

function audit(user: User | null, action: string, detail = '') {
  db.audit.unshift({ at: new Date().toISOString(), userId: user?.userId ?? '—', role: user?.role ?? 'Operator', action, detail });
  if (db.audit.length > 500) db.audit.length = 500;
}

/* ----------------------------- helpers ----------------------------- */
const ok = (body: unknown = null): MockResponse => ({ status: 200, body });
const created = (body: unknown): MockResponse => ({ status: 201, body });
const fail = (status: number, message: string): MockResponse => ({ status, body: { message } });

function paginate<T>(items: T[], page: number, pageSize = 10): Paged<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const p = Math.min(Math.max(1, page || 1), pageCount);
  return { items: items.slice((p - 1) * pageSize, p * pageSize), page: p, pageSize, total: items.length, pageCount };
}

function inRange(date: string, from?: string, to?: string) {
  const iso = seed.toIso(date);
  return (!from || iso >= from) && (!to || iso <= to);
}

function machineName(id: string) {
  return db.machines.find((m) => m.id === id)?.machineName;
}

function controlPanelState(machineId: string): ControlPanelState {
  const s = machineState(machineId);
  const now = Date.now();
  const ops = s.manualOps.map((o) => ({
    ...o,
    elapsedSeconds: o.active && o.startedAt ? Math.floor((now - Date.parse(o.startedAt)) / 1000) : null,
  }));
  const chamberSecs = ops.filter((o) => o.kind === 'chamber' && o.active).reduce((a, o) => a + (o.elapsedSeconds ?? 0), 0);
  return {
    machineId,
    connected: true,
    appliedMode: s.appliedMode,
    params: s.params,
    operation: seed.operation,
    storage: seed.storage,
    manualOps: ops,
    inoculantDosedGms: s.appliedMode === 'manual' && chamberSecs > 0 ? chamberSecs * s.params.flowRateGmsPerSec : null,
  };
}

/** Deterministic full record for one box (box-detail pop-up) */
function boxDetail(boxId: string): BoxDetail | null {
  const list = seed.boxes;
  const i = list.findIndex((b) => b.id === boxId);
  if (i < 0 || list[i].state === 'pending') return null;
  const b = list[i];
  const comp = db.components.find((c) => c.componentName === b.component) ?? db.components[0];
  const num = parseInt(b.id.replace(/\D/g, ''), 10) || 1;
  let r = (num * 7919 + 13) % 2147483647;
  const rnd = () => ((r = (r * 16807) % 2147483647) - 1) / 2147483646;
  const LABEL: Record<string, string> = { optimal: 'Optimal Dose', over: 'Over Dose', under: 'Under Dose', miss: 'Dose Miss', current: 'Dosing', 'not-poured': 'Not Poured' };
  const notPoured = b.state === 'not-poured';
  const steps = 20;
  const current = list.findIndex((x) => x.state === 'current');
  const end = 15 * 3600 + 40 * 60 + 21 - Math.max(0, current - i) * 47;
  const weights: number[] = [];
  let sum = 0;
  for (let k = 0; k < steps; k++) {
    const v = k < 2 || b.state === 'miss' ? 0 : 0.4 + rnd() * (k < steps * 0.6 ? 1.6 : 0.6);
    weights.push(v);
    sum += v;
  }
  const pts = [0];
  let acc = 0;
  for (let k = 0; k < steps; k++) {
    acc += sum ? (weights[k] / sum) * b.actualGms : 0;
    pts.push(Math.round(acc));
  }
  pts[pts.length - 1] = b.actualGms;
  const pourT = comp.pouringTimeSec + Math.round(rnd() * 3);
  const temp = comp.pouringTempMin + Math.round(rnd() * (comp.pouringTempMax - comp.pouringTempMin));
  const dosable = (j: number) => list[j] && list[j].state !== 'pending';
  let prev: string | null = null;
  let next: string | null = null;
  for (let j = i - 1; j >= 0; j--) if (dosable(j)) { prev = list[j].id; break; }
  for (let j = i + 1; j < list.length; j++) if (dosable(j)) { next = list[j].id; break; }
  return {
    boxNo: b.id,
    component: b.component,
    status: LABEL[b.state] ?? '',
    bunchWeight: `${comp.bunchWeightKg} kg`,
    pouringTime: notPoured ? '—' : `${pourT} sec`,
    pouringTarget: comp.pouringTimeSec,
    pouringTemp: notPoured ? '—' : `${temp} °C`,
    pouringTempRange: `${comp.pouringTempMin} - ${comp.pouringTempMax}`,
    ladle: 'L-03',
    heat: 'H-2622C1',
    grade: comp.grade,
    shiftLabel: `Today, ${seed.shift.shift}`,
    dosingTime: notPoured ? '—' : `${steps} sec`,
    totalActualDose: b.actualGms,
    expectedMin: b.expectedMinGms,
    expectedMax: b.expectedMaxGms,
    flowRate: `${comp.inoculantFlowRate} gms/sec`,
    inoculantContent: `${Math.round((b.actualGms / (comp.bunchWeightKg * 1000)) * 100 * 1000) / 1000} %`,
    startSecond: end - steps,
    points: notPoured ? [] : pts,
    prevBoxId: prev,
    nextBoxId: next,
  };
}

/* ------------------------------ routes ----------------------------- */
type Ctx = { params: Record<string, string>; query: URLSearchParams; body: any; user: User | null };
type Handler = (c: Ctx) => MockResponse;
interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  /** minimum role; undefined = public */
  role?: Role;
  handler: Handler;
}
const routes: Route[] = [];
function route(method: string, path: string, role: Role | undefined, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp('^' + path.replace(/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, pattern, keys, role, handler });
}

/* Auth */
route('POST', '/auth/login', undefined, ({ body }) => {
  const id = String(body?.userId ?? '').trim().toLowerCase();
  const f = failures.get(id);
  if (f && f.until > Date.now()) {
    audit(null, 'Login blocked (locked out)', id);
    return fail(429, `Too many failed attempts. Try again in ${Math.ceil((f.until - Date.now()) / 60000)} min.`);
  }
  const u = seed.users.find((x) => x.userId === id);
  if (!u || String(body?.password ?? '') !== u.password) {
    const n = (f?.count ?? 0) + 1;
    failures.set(id, n >= 5 ? { count: 0, until: Date.now() + 5 * 60 * 1000 } : { count: n, until: 0 });
    audit(null, 'Login failed', id);
    return fail(401, 'Incorrect User ID or Password');
  }
  failures.delete(id);
  const expiresAt = Date.now() + SESSION_MS;
  const user = publicUser(u);
  audit(user, 'Signed in');
  return ok({ token: makeToken(u.userId, expiresAt), expiresAt: new Date(expiresAt).toISOString(), user });
});
route('POST', '/auth/logout', 'Operator', ({ user }) => (audit(user, 'Signed out'), ok()));
route('GET', '/auth/me', 'Operator', ({ user }) => ok(user));

/* Common */
route('GET', '/shift', 'Operator', () => ok(seed.shift));
const mockShifts: { id: string; name: string; start: string; end: string }[] = [
  { id: 's1', name: 'A', start: '07:00', end: '15:00' },
  { id: 's2', name: 'B', start: '15:00', end: '07:00' },
];
route('GET', '/shifts', 'Operator', () => ok(mockShifts));
route('POST', '/shifts', 'Administrator', ({ body, user }) => {
  const name = String(body?.name ?? '').trim();
  if (!name) return fail(400, 'Shift name is required');
  if (!/^\d{2}:\d{2}$/.test(body?.start ?? '') || !/^\d{2}:\d{2}$/.test(body?.end ?? '')) return fail(400, 'Start and end time are required');
  if (body.start === body.end) return fail(400, 'Start and end time must be different');
  if (mockShifts.some((s) => s.name.toLowerCase() === name.toLowerCase())) return fail(409, `A shift named "${name}" already exists`);
  mockShifts.push({ id: `s${Date.now()}`, name, start: body.start, end: body.end });
  audit(user, 'Shift added', name);
  return ok(mockShifts);
});
route('DELETE', '/shifts/:id', 'Administrator', ({ params, user }) => {
  const i = mockShifts.findIndex((s) => s.id === params.id);
  if (i >= 0) { audit(user, 'Shift removed', mockShifts[i].name); mockShifts.splice(i, 1); }
  return ok(mockShifts);
});
route('GET', '/branding', undefined, () => ok(db.branding));
route('PUT', '/branding', 'Administrator', ({ body, user }) => {
  const url = String(body?.logoUrl ?? '');
  if (!/^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(url)) return fail(400, 'Use a PNG, JPG or SVG file.');
  if (url.length > 1.4 * 1024 * 1024) return fail(413, 'That file is over 1 MB. Use a smaller image.');
  db.branding = { customerName: String(body?.customerName || db.branding.customerName), logoUrl: url };
  audit(user, 'Customer logo changed');
  return ok(db.branding);
});
route('DELETE', '/branding', 'Administrator', ({ user }) => {
  db.branding = { ...db.branding, logoUrl: 'none' };
  audit(user, 'Customer logo removed');
  return ok(db.branding);
});
route('GET', '/audit-log', 'Supervisor', () => ok(db.audit));

/* Machines (also used by the header selector) */
route('GET', '/machines', 'Operator', () => ok(db.machines));
route('POST', '/machines', 'Supervisor', ({ body, user }) => {
  const err = validateMachine(body);
  if (err) return fail(400, err);
  const m: Machine = {
    id: `m${Date.now()}`,
    productId: String(body.productId).trim(),
    machineName: String(body.machineName).trim(),
    productionLine: String(body.productionLine).trim(),
    dateAdded: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
  db.machines.push(m);
  audit(user, 'Machine added', m.machineName);
  return created(m);
});
route('PUT', '/machines/:id', 'Supervisor', ({ params, body, user }) => {
  const m = db.machines.find((x) => x.id === params.id);
  if (!m) return fail(404, 'Machine not found');
  const err = validateMachine(body);
  if (err) return fail(400, err);
  Object.assign(m, { productId: String(body.productId).trim(), machineName: String(body.machineName).trim(), productionLine: String(body.productionLine).trim() });
  audit(user, 'Machine updated', m.machineName);
  return ok(m);
});
route('DELETE', '/machines', 'Supervisor', ({ body, user }) => {
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
  db.machines = db.machines.filter((m) => !ids.includes(m.id));
  audit(user, 'Machines deleted', `${ids.length}`);
  return ok();
});
function validateMachine(b: Partial<MachineInput> | undefined) {
  if (!String(b?.productId ?? '').trim()) return 'Product ID is required';
  if (!String(b?.machineName ?? '').trim()) return 'Machine name is required';
  if (!String(b?.productionLine ?? '').trim()) return 'Production line is required';
  return null;
}

/* Live alerts */
route('GET', '/alerts/live', 'Operator', () => ok(db.liveAlerts));
route('POST', '/alerts/live/:id/acknowledge', 'Operator', ({ params, user }) => {
  const a = db.liveAlerts.find((x) => x.id === params.id);
  if (!a) return fail(404, 'Alert not found');
  a.acknowledged = true;
  audit(user, 'Alert acknowledged', `${a.type} ${a.boxNo}`);
  return ok(a);
});

/* Dashboard */
route('GET', '/dashboard', 'Operator', ({ query }) => {
  const mid = query.get('machineId') || 'm1';
  const s = machineState(mid);
  const snap: DashboardSnapshot = {
    summary: { ...seed.summary, currentComponent: s.params.componentName },
    inoculation: { ...seed.inoculation, mode: s.appliedMode, flowRateSetpoint: s.params.flowRateGmsPerSec },
    flow: seed.flow,
    boxes: seed.boxes,
    boxesDosedToday: 84,
    boxesDosedForCurrentComponent: 10,
  };
  return ok(snap);
});
route('GET', '/dashboard/cumulative', 'Operator', () =>
  ok({ boxNo: 'B-11', timeAxis: seed.cumulativeAxis, points: seed.cumulativePoints, tolerance: seed.cumulativeTolerance }),
);
route('GET', '/dashboard/across-molds', 'Operator', ({ query }) => {
  const component = query.get('component') || db.components[0].componentName;
  const idx = Math.max(0, db.components.findIndex((c) => c.componentName === component));
  const body: AcrossMoldsSeries = { component, bars: seed.acrossMoldsToday(idx * 3), tolerance: seed.acrossTolerance };
  return ok(body);
});
route('GET', '/dashboard/boxes/:boxId', 'Operator', ({ params }) => {
  const d = boxDetail(params.boxId);
  return d ? ok(d) : fail(404, 'No record for this box yet');
});

/* Control panel */
route('GET', '/machines/:id/control-panel', 'Operator', ({ params }) => ok(controlPanelState(params.id)));
route('POST', '/machines/:id/settings', 'Supervisor', ({ params, body, user }) => {
  const mode = body?.mode as MachineMode;
  if (!['auto', 'joystick', 'manual'].includes(mode)) return fail(400, 'Unknown operating mode');
  const p = body?.params as MachineParams;
  if (!p || !db.components.some((c) => c.componentName === p.componentName)) return fail(400, 'Unknown component');
  if (!(p.pouringTimeSec >= 1 && p.pouringTimeSec <= 300)) return fail(400, 'Pouring time must be 1 – 300 sec');
  if (!(p.flowRateGmsPerSec >= 0.1 && p.flowRateGmsPerSec <= 50)) return fail(400, 'Flow rate must be 0.1 – 50 gms/sec');
  const s = machineState(params.id);
  s.appliedMode = mode;
  s.params = { componentName: p.componentName, pouringTimeSec: p.pouringTimeSec, flowRateGmsPerSec: p.flowRateGmsPerSec };
  if (mode !== 'manual') s.manualOps = clone(seed.manualOps);
  audit(user, 'Settings applied', `${machineName(params.id) ?? params.id}: ${mode}, ${p.componentName}, ${p.pouringTimeSec} sec, ${p.flowRateGmsPerSec} gms/sec`);
  return ok(controlPanelState(params.id));
});
route('POST', '/machines/:id/manual-operations/:key', 'Supervisor', ({ params, body, user }) => {
  const s = machineState(params.id);
  if (s.appliedMode !== 'manual') return fail(409, 'Manual operations need Manual Mode to be applied first');
  const op = s.manualOps.find((o) => o.key === params.key);
  if (!op) return fail(404, 'Unknown operation');
  const start = body?.action === 'start';
  op.active = start;
  op.startedAt = start ? new Date().toISOString() : null;
  audit(user, 'Manual operation', `${op.label}: ${start ? (op.kind === 'chamber' ? 'Open' : 'Start') : op.kind === 'chamber' ? 'Close' : 'Stop'}`);
  return ok(controlPanelState(params.id));
});

/* Past records */
route('GET', '/records/dosage', 'Operator', ({ query }) => {
  const from = query.get('from') || undefined;
  const to = query.get('to') || undefined;
  const compId = query.get('componentId') || 'all';
  const compName = db.components.find((c) => c.id === compId)?.componentName;
  const names = db.components.map((c) => c.componentName);
  const days: DayRecord[] = seed.dayRecords
    .filter((d) => inRange(d.date, from, to))
    .map((d) => ({ ...d, components: seed.componentBreakdown(d.date, names) }))
    .map((d) => {
      if (!compName) return d;
      const only = d.components.filter((c) => c.componentName === compName);
      if (!only.length) return null;
      const sum = (k: keyof (typeof only)[0]) => only.reduce((a, c) => a + Number(c[k]), 0);
      return { ...d, componentCount: only.length, components: only, totalBoxes: sum('totalBoxes'), optimalDose: sum('optimalDose'), overDose: sum('overDose'), underDose: sum('underDose'), doseMiss: sum('doseMiss'), notPoured: sum('notPoured') };
    })
    .filter(Boolean) as DayRecord[];
  return ok(paginate(days, Number(query.get('page') || 1)));
});
route('GET', '/records/dosage/:date/components/:component/doses', 'Operator', ({ query }) => {
  const mid = query.get('machineId') || 'all';
  const name = machineName(mid);
  const items = seed.doses.filter((d) => !name || d.machine === name);
  return ok(paginate(items, Number(query.get('page') || 1)));
});
route('GET', '/records/doses/:doseId/series', 'Operator', ({ params }) => {
  const d = seed.doses.find((x) => x.doseId === Number(params.doseId));
  return ok(seed.doseSeries(d?.dosingTime.split(' - ')[0]));
});
route('GET', '/records/across-molds', 'Operator', ({ query }) => {
  const component = query.get('component') || db.components[0].componentName;
  const mid = query.get('machineId') || 'm1';
  const seedN = Number(mid.replace(/\D/g, '') || 1) - 1;
  return ok({ component, bars: seed.acrossMoldsForDay(seedN * 4), tolerance: seed.acrossTolerance } as AcrossMoldsSeries);
});
route('GET', '/records/alerts', 'Operator', ({ query }) => {
  const from = query.get('from') || undefined;
  const to = query.get('to') || undefined;
  const compName = db.components.find((c) => c.id === query.get('componentId'))?.componentName;
  const mName = machineName(query.get('machineId') || 'all');
  const items = db.alertRecords.filter((a) => inRange(a.date, from, to) && (!compName || a.component === compName) && (!mName || a.machine === mName));
  return ok(paginate(items, Number(query.get('page') || 1)));
});
route('POST', '/records/alerts/:id/acknowledge', 'Operator', ({ params, user }) => {
  const a = db.alertRecords.find((x) => x.id === params.id);
  if (!a) return fail(404, 'Alert not found');
  a.acknowledgedBy = user?.name ?? 'Unknown';
  audit(user, 'Past alert acknowledged', `${a.alertType} ${a.boxNo}`);
  return ok(a);
});

/* Components */
route('GET', '/components', 'Operator', () => ok(db.components));
route('POST', '/components', 'Supervisor', ({ body, user }) => {
  const err = validateComponent(body);
  if (err) return fail(400, err);
  const c: Component = { ...(body as ComponentInput), id: `c${Date.now()}` };
  db.components.push(c);
  audit(user, 'Component added', c.componentName);
  return created(c);
});
route('PUT', '/components/:id', 'Supervisor', ({ params, body, user }) => {
  const i = db.components.findIndex((c) => c.id === params.id);
  if (i < 0) return fail(404, 'Component not found');
  const err = validateComponent(body);
  if (err) return fail(400, err);
  db.components[i] = { ...(body as ComponentInput), id: params.id };
  audit(user, 'Component updated', db.components[i].componentName);
  return ok(db.components[i]);
});
route('DELETE', '/components', 'Supervisor', ({ body, user }) => {
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
  db.components = db.components.filter((c) => !ids.includes(c.id));
  audit(user, 'Components deleted', `${ids.length}`);
  return ok();
});
function validateComponent(b: Partial<ComponentInput> | undefined) {
  if (!b || !String(b.componentId ?? '').trim()) return 'Component ID is required';
  if (!String(b.componentName ?? '').trim()) return 'Component name is required';
  if (!(Number(b.pouringTempMax) > Number(b.pouringTempMin) && Number(b.pouringTempMin) > 0)) return 'Check the pouring temperature range';
  if (!(Number(b.pouringTimeSec) > 0 && Number(b.inoculantFlowRate) > 0 && Number(b.expectedDosageGms) > 0 && Number(b.bunchWeightKg) > 0)) return 'All values must be greater than 0';
  if (!String(b.grade ?? '').trim()) return 'Grade is required';
  return null;
}

/* Alert data source (mock: the single default table) */
const mockSource = { table: 'innodose_casting_details_v2', column: 'WEIGHT OF INOCULANT' };
route('GET', '/alert-source', 'Operator', () => ok({ ...mockSource, defaults: { table: 'innodose_casting_details_v2', column: 'WEIGHT OF INOCULANT' }, tables: [{ name: 'innodose_casting_details_v2', columns: ['WEIGHT OF INOCULANT', 'WEIGHT OF CASTING', 'CONTENT OF INOCULANT', 'FLOW OF INOCULANT'] }] }));
route('PUT', '/alert-source', 'Supervisor', ({ body }) => {
  const b = (body ?? {}) as { table?: string; column?: string };
  if (!b.table || !b.column) return fail(400, 'table and column are required');
  mockSource.table = b.table; mockSource.column = b.column;
  return ok({ ...mockSource });
});

/* Alert configuration */
route('GET', '/alert-configs', 'Operator', () => ok(db.alertConfigs));
route('PUT', '/alert-configs', 'Supervisor', ({ body, user }) => {
  if (!Array.isArray(body)) return fail(400, 'Expected a list of alert settings');
  db.alertConfigs = (body as AlertConfig[]).map((a) => ({ id: a.id, alertType: a.alertType, enabled: !!a.enabled, emails: (a.emails || []).map(String), minTolerance: Number(a.minTolerance ?? 0), maxTolerance: Number(a.maxTolerance ?? 0) }));
  audit(user, 'Alert settings saved');
  return ok(db.alertConfigs);
});

/* --------------------------- dispatcher ---------------------------- */
export function dispatch(method: string, url: string, body: unknown, token: string | null): MockResponse {
  const [path, qs = ''] = url.split('?');
  const query = new URLSearchParams(qs);
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.pattern.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    const user = userFromToken(token);
    if (r.role) {
      if (!user) return fail(401, 'Your session has expired. Sign in again.');
      if (RANK[user.role] < RANK[r.role]) {
        audit(user, 'Action denied', `${method} ${path}`);
        return fail(403, `This action needs ${r.role} access.`);
      }
    }
    try {
      return r.handler({ params, query, body, user });
    } catch (e) {
      return fail(500, (e as Error).message || 'Server error');
    }
  }
  return fail(404, `No route for ${method} ${path}`);
}

/** Browser entry: same as dispatch, with simulated latency and abort support. */
export async function handleMockRequest(
  method: string,
  url: string,
  body: unknown,
  token: string | null,
  signal?: AbortSignal,
  latencyMs = 250,
): Promise<MockResponse> {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, latencyMs);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(new DOMException('Aborted', 'AbortError'))));
  });
  return dispatch(method, url, body === undefined ? undefined : clone(body), token);
}
