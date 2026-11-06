/**
 * Regenerates docs/API.md from the mock API, so every example is a real response.
 *   npx tsx scripts/gen-api-docs.ts
 */
import { writeFileSync } from 'node:fs';
import { dispatch } from '../src/api/mock/router';

const login = dispatch('POST', '/auth/login', { userId: 'admin', password: 'Admin', staySignedIn: true }, null).body as { token: string };
const T = login.token;

type Ep = { group: string; method: string; path: string; call?: string; role: string; desc: string; body?: unknown; query?: string; notes?: string };
const eps: Ep[] = [
  { group: 'Authentication', method: 'POST', path: '/auth/login', role: 'Public', desc: 'Sign in. Returns a bearer token and the user. 401 on wrong credentials; 429 after 5 failures (5-minute lock-out).', body: { userId: 'admin', password: '••••', staySignedIn: true } },
  { group: 'Authentication', method: 'GET', path: '/auth/me', role: 'Operator', desc: 'Current user for the token (used to restore the session on reload).' },
  { group: 'Authentication', method: 'POST', path: '/auth/logout', role: 'Operator', desc: 'Invalidate the token.' },
  { group: 'Common (header & navigation)', method: 'GET', path: '/shift', role: 'Operator', desc: 'Plant clock and current shift shown in the navigation / header.' },
  { group: 'Common (header & navigation)', method: 'GET', path: '/machines', role: 'Operator', desc: 'Machines for the header selector and Configurations → Machines.' },
  { group: 'Common (header & navigation)', method: 'GET', path: '/alerts/live', role: 'Operator', desc: "Today's alerts. Unacknowledged ones show in the header banner and the dashboard list. Polled every VITE_POLL_INTERVAL_MS." },
  { group: 'Common (header & navigation)', method: 'POST', path: '/alerts/live/a2/acknowledge', call: '/alerts/live/:id/acknowledge', role: 'Operator', desc: 'Acknowledge a live alert.' },
  { group: 'Common (header & navigation)', method: 'GET', path: '/branding', role: 'Public', desc: 'Customer name and logo (top-right). Empty logoUrl = use the bundled default logo.' },
  { group: 'Live Dashboard', method: 'GET', path: '/dashboard', query: '?machineId=m1', role: 'Operator', desc: 'Production summary, inoculation status, flow diagram values and today’s boxes. Polled.' },
  { group: 'Live Dashboard', method: 'GET', path: '/dashboard/cumulative', query: '?machineId=m1', role: 'Operator', desc: '“Cumulative Dosage Within Mold” for the box being dosed. Polled.' },
  { group: 'Live Dashboard', method: 'GET', path: '/dashboard/across-molds', query: '?machineId=m1&component=C.I.%20ADAPTER%202%E2%80%9D%20TOP', role: 'Operator', desc: '“Dosage Across Molds (Today)” for one component.' },
  { group: 'Live Dashboard', method: 'GET', path: '/dashboard/boxes/B-71', call: '/dashboard/boxes/:boxId', query: '?machineId=m1', role: 'Operator', desc: 'Full record of one box (box-detail pop-up). 404 for boxes not dosed yet.' },
  { group: 'Control Panel', method: 'GET', path: '/machines/m1/control-panel', call: '/machines/:id/control-panel', role: 'Operator', desc: 'Applied mode, parameters, operation/storage status, manual operations.' },
  { group: 'Control Panel', method: 'POST', path: '/machines/m1/settings', call: '/machines/:id/settings', role: 'Supervisor', desc: 'Apply operating mode + machine parameters (after the operator confirms). Validates ranges: pouring time 1–300 s, flow rate 0.1–50 g/s.', body: { mode: 'manual', params: { componentName: 'C.I. ADAPTER 2” TOP', pouringTimeSec: 25, flowRateGmsPerSec: 4 } } },
  { group: 'Control Panel', method: 'POST', path: '/machines/m1/manual-operations/mixingChamber', call: '/machines/:id/manual-operations/:key', role: 'Supervisor', desc: 'Open/Close a chamber or Start/Stop a motor. 409 unless Manual Mode is applied. key = mixingChamber | intermediateChamber | purging | vibrator.', body: { action: 'start' } },
  { group: 'Past Records', method: 'GET', path: '/records/dosage', query: '?from=2026-09-05&to=2026-10-05&componentId=all&machineId=all&page=1', role: 'Operator', desc: 'Day rows with dose counts and per-component breakdown (paged, 10 per page).' },
  { group: 'Past Records', method: 'GET', path: '/records/dosage/04-Oct-2026/components/C.I.%20ADAPTER%202%E2%80%9D%20TOP/doses', call: '/records/dosage/:date/components/:componentName/doses', query: '?page=1&machineId=all', role: 'Operator', desc: 'Individual doses of a component on a day (paged).' },
  { group: 'Past Records', method: 'GET', path: '/records/doses/12345/series', call: '/records/doses/:doseId/series', role: 'Operator', desc: 'Cumulative grams per second for one dose (dose pop-up).' },
  { group: 'Past Records', method: 'GET', path: '/records/across-molds', query: '?date=04-Oct-2026&component=C.I.%20ADAPTER%202%E2%80%9D%20TOP&machineId=m1', role: 'Operator', desc: '“View Graph”: final dosage per box for a component on a day.' },
  { group: 'Past Records', method: 'GET', path: '/records/alerts', query: '?from=2026-09-05&to=2026-10-05&componentId=all&machineId=all&page=1', role: 'Operator', desc: 'Alert history (paged).' },
  { group: 'Past Records', method: 'POST', path: '/records/alerts/r4/acknowledge', call: '/records/alerts/:id/acknowledge', role: 'Operator', desc: 'Acknowledge a past alert; acknowledgedBy is set to the signed-in user.' },
  { group: 'Configurations', method: 'GET', path: '/components', role: 'Operator', desc: 'Component master list.' },
  { group: 'Configurations', method: 'POST', path: '/components', role: 'Supervisor', desc: 'Add a component (400 with a message on validation errors).', body: { componentId: 'C-103', componentName: 'Bracket', pouringTempMin: 1380, pouringTempMax: 1420, pouringTimeSec: 18, inoculantFlowRate: 4, expectedDosageGms: 72, grade: 'FG250', bunchWeightKg: 45 } },
  { group: 'Configurations', method: 'PUT', path: '/components/c3', call: '/components/:id', role: 'Supervisor', desc: 'Replace a component.', body: { componentId: 'C-102', componentName: 'Component 3', pouringTempMin: 1350, pouringTempMax: 1370, pouringTimeSec: 40, inoculantFlowRate: 3.5, expectedDosageGms: 140, grade: 'FG100', bunchWeightKg: 70 } },
  { group: 'Configurations', method: 'DELETE', path: '/components', role: 'Supervisor', desc: 'Delete components by id.', body: { ids: ['c4'] } },
  { group: 'Configurations', method: 'GET', path: '/alert-configs', role: 'Operator', desc: 'Alert types, enabled flag and e-mail recipients.' },
  { group: 'Configurations', method: 'PUT', path: '/alert-configs', role: 'Supervisor', desc: 'Save all alert settings (full list).', body: '[ …AlertConfig ]' },
  { group: 'Configurations', method: 'POST', path: '/machines', role: 'Supervisor', desc: 'Add a machine.', body: { productId: '55500', machineName: 'Inodose Machine 4', productionLine: 'Production Line 4' } },
  { group: 'Configurations', method: 'PUT', path: '/machines/m3', call: '/machines/:id', role: 'Supervisor', desc: 'Update a machine.', body: { productId: '37722', machineName: 'Inodose Machine 3', productionLine: 'Production Line 3' } },
  { group: 'Configurations', method: 'DELETE', path: '/machines', role: 'Supervisor', desc: 'Delete machines by id.', body: { ids: ['m4'] } },
  { group: 'Configurations', method: 'PUT', path: '/branding', role: 'Administrator', desc: 'Set the customer logo. logoUrl must be a base64 PNG/JPG/SVG data URL, max 1 MB.', body: { customerName: 'Gujarat Metal Cast', logoUrl: 'data:image/png;base64,iVBORw0…' } },
  { group: 'Configurations', method: 'DELETE', path: '/branding', role: 'Administrator', desc: 'Restore the default logo.' },
  { group: 'Audit', method: 'GET', path: '/audit-log', role: 'Supervisor', desc: 'Who did what and when (sign-ins, denied actions, settings, manual operations, configuration changes). Newest first.' },
];

const trim = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.length > 3 ? [...v.slice(0, 3).map(trim), `… ${v.length - 3} more`] : v.map(trim);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x)]));
  return v;
};

let md = `# Inodose Monitoring — REST API contract

The frontend talks to the backend only through these endpoints (see \`src/api/\`).
Base URL: \`VITE_API_BASE_URL\` (default \`/api/v1\`). JSON in and out.

**Auth:** send \`Authorization: Bearer <token>\` from \`POST /auth/login\` on every call except login and branding.
**Errors:** non-2xx with \`{ "message": "Human-readable reason" }\` — the UI shows the message as-is.
\`401\` = session expired (the UI signs the user out), \`403\` = role not allowed, \`400\` = validation, \`404\` = not found, \`409\` = wrong machine state, \`429\` = locked out.

**Roles** (each role includes the ones before it): Operator → Supervisor → Administrator.
The backend **must** enforce the role on every call; the UI only hides/disables controls.

All examples below are real responses from the bundled mock API (\`src/api/mock\`), shortened to 3 items per list.

`;
let group = '';
for (const e of eps) {
  if (e.group !== group) {
    group = e.group;
    md += `\n## ${group}\n\n| Method | Path | Min. role | Purpose |\n|---|---|---|---|\n`;
    for (const x of eps.filter((y) => y.group === group)) md += `| \`${x.method}\` | \`${x.call ?? x.path}\` | ${x.role} | ${x.desc} |\n`;
  }
}
md += '\n## Examples\n';
for (const e of eps) {
  const body = typeof e.body === 'string' ? undefined : e.body;
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==';
  const realBody =
    e.path === '/auth/login' ? { userId: 'admin', password: 'Admin', staySignedIn: true }
    : e.method === 'PUT' && e.path === '/branding' ? { customerName: 'Gujarat Metal Cast', logoUrl: tinyPng }
    : body;
  const r = e.body === '[ …AlertConfig ]' ? dispatch('GET', '/alert-configs', undefined, T) : dispatch(e.method, e.path + (e.query ?? ''), realBody, e.role === 'Public' && e.path !== '/branding' ? null : T);
  md += `\n### ${e.method} ${e.call ?? e.path}\n${e.desc}\n\n`;
  md += `\`\`\`http\n${e.method} /api/v1${e.path}${e.query ?? ''}\n\`\`\`\n`;
  if (e.body !== undefined) md += `Request body:\n\`\`\`json\n${typeof e.body === 'string' ? e.body : JSON.stringify(e.body, null, 2)}\n\`\`\`\n`;
  const shown = r.body && typeof r.body === 'object' && 'logoUrl' in (r.body as object) && String((r.body as { logoUrl: string }).logoUrl).length > 40 ? { ...(r.body as object), logoUrl: 'data:image/png;base64,iVBORw0…' } : r.body;
  md += `Response \`${r.status}\`:\n\`\`\`json\n${shown == null ? '(empty)' : JSON.stringify(trim(shown), null, 2)}\n\`\`\`\n`;
}
md += `\n## TypeScript types\nEvery request and response shape is defined in \`src/api/types.ts\` — use it as the schema when building the backend.\n`;
writeFileSync(new URL('../docs/API.md', import.meta.url), md);
console.log('docs/API.md written:', eps.length, 'endpoints');
