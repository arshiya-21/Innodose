import { useEffect, useState, type ReactNode } from 'react';
import { ApiError, configurationsApi } from '@/api';
import type { AlertConfig } from '@/api/types';
import { Button, Checkbox, ErrorBanner, Icon, LoadingBlock, Modal, Select, Table, TableWrap, Td, Th, Tr, useToast } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { administrationApi } from '@/api/administration';
import { useApi } from '@/hooks/useApi';

/** Which tolerance field each alert uses — mirrors backend/src/routes/alertRules.ts (and alert.py). */
const RULES: Record<string, { field: 'min' | 'max'; hint: string; rule: (v: number) => string; limit: (expected: number, v: number) => string }> = {
  'Over Dose': {
    field: 'max',
    hint: 'Uses Max: % above expected',
    rule: (v) => `dose is more than ${v}% above expected`,
    limit: (e, v) => `dose > ${(e * (1 + v / 100)).toFixed(1)} gms`,
  },
  'Under Dose': {
    field: 'max',
    hint: 'Uses Max: % below expected',
    rule: (v) => `dose is more than ${v}% below expected`,
    limit: (e, v) => `dose < ${(e * (1 - v / 100)).toFixed(1)} gms`,
  },
  'Pipe Chocked': {
    field: 'min',
    hint: 'Uses Min: % of expected (0 = off)',
    rule: (v) => `dose is below ${v}% of expected`,
    limit: (e, v) => `dose < ${((e * v) / 100).toFixed(1)} gms`,
  },
  'Dose Missed': {
    field: 'min',
    hint: 'Uses Min: % of expected (0 = off)',
    rule: (v) => `dose is below ${v}% of expected, or nothing was dosed`,
    limit: (e, v) => `dose < ${((e * v) / 100).toFixed(1)} gms`,
  },
};

/** Pick which table / column the dose is read from (default: innodose_casting_details_v2 → WEIGHT OF INOCULANT). */
function SourcePicker({ editable }: { editable: boolean }) {
  const { toast } = useToast();
  const src = useApi(() => configurationsApi.alertSource(), []);
  const [table, setTable] = useState('');
  const [column, setColumn] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (src.data) { setTable(src.data.table); setColumn(src.data.column); }
  }, [src.data]);
  if (src.error) return <p className="mt-2 text-brand-red">Could not load data sources: {src.error.message}</p>;
  if (!src.data) return <p className="mt-2 text-gray-500">Loading data sources…</p>;

  const d = src.data;
  const columns = d.tables.find((t) => t.name === table)?.columns ?? [];
  const changed = table !== d.table || column !== d.column;
  const isDefault = table === d.defaults.table && column === d.defaults.column;

  async function save() {
    setBusy(true);
    try {
      await configurationsApi.saveAlertSource({ table, column });
      src.reload();
      toast('Alert data source saved.');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-4">
      <div>
        <span className="block type-label-2 text-gray-600">Table</span>
        <Select
          ariaLabel="Source table"
          value={table}
          disabled={!editable}
          className="mt-1 w-[280px]"
          options={d.tables.map((t) => ({ value: t.name, label: t.name }))}
          onChange={(t) => { setTable(t); const cols = d.tables.find((x) => x.name === t)?.columns ?? []; setColumn(cols.includes(d.defaults.column) ? d.defaults.column : cols[0] ?? ''); }}
        />
      </div>
      <div>
        <span className="block type-label-2 text-gray-600">Dose column</span>
        <Select
          ariaLabel="Dose column"
          value={column}
          disabled={!editable}
          className="mt-1 w-[260px]"
          options={columns.map((c) => ({ value: c, label: c }))}
          onChange={setColumn}
        />
      </div>
      <Button variant="secondary" size="sm" disabled={!editable || !changed || !column} loading={busy} onClick={save}>Save source</Button>
      <Button variant="secondary" size="sm" disabled={!editable || isDefault} onClick={() => { setTable(d.defaults.table); setColumn(d.defaults.column); }}>Use default</Button>
    </div>
  );
}

function CalcSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-gray-200 bg-white p-5">
      <h3 className="type-title-1 text-gray-800">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CalculationPanel({ items, editable }: { items: AlertConfig[]; editable: boolean }) {
  const [expected, setExpected] = useState(100);
  return (
    <div className="flex flex-col gap-4 type-body-2 text-gray-800">
      <CalcSection title="Where the dose is read from">
        <p className="text-gray-600">Normally leave this on <b className="text-gray-800">innodose_casting_details_v2 → WEIGHT OF INOCULANT</b>. Only tables with id, datetime, COMPONENT ID and BOX COUNT columns, and numeric columns, are listed.</p>
        <div className="mt-3"><SourcePicker editable={editable} /></div>
      </CalcSection>

      <CalcSection title="How each dose is checked">
        <p><b>Expected dose</b> comes from the component master. <b>Dose</b> is the value in the column chosen above for the box.</p>
        <div className="mt-3 rounded-sm bg-gray-100 px-4 py-3 font-mono text-[13px] leading-6">
          <p>deviation % = (dose − expected) ÷ expected × 100</p>
          <p>% of expected = dose ÷ expected × 100</p>
        </div>
      </CalcSection>

      <CalcSection title="How to edit">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Change the <b>Max</b> box for Over Dose / Under Dose (a ±% band around the expected dose). Default is 5, i.e. ±5%.</li>
          <li>Change the <b>Min</b> box for Pipe Chocked / Dose Missed (the % of expected below which the alert fires). 0 turns that check off.</li>
          <li>Press <b>Save Changes</b> — new doses use the new values straight away.</li>
        </ol>
      </CalcSection>

      <CalcSection title="Try it">
        <label className="flex items-center gap-2">
          <span>Expected dose</span>
          <input
            type="number"
            min={0}
            value={expected}
            onChange={(e) => setExpected(Math.max(0, Number(e.target.value)))}
            className="h-9 w-24 rounded-sm border border-gray-300 bg-white px-2 text-center"
          />
          <span>gms</span>
        </label>
        <table className="mt-4 w-full border-collapse text-left">
          <thead>
            <tr className="bg-gray-100 text-gray-600">
              <th className="px-3 py-2 font-medium">Alert</th>
              <th className="px-3 py-2 font-medium">Value used</th>
              <th className="px-3 py-2 font-medium">Fires when</th>
              <th className="px-3 py-2 font-medium">For {expected} gms</th>
            </tr>
          </thead>
          <tbody>
            {items.filter((a) => RULES[a.alertType]).map((a) => {
              const r = RULES[a.alertType];
              const v = (r.field === 'max' ? a.maxTolerance : a.minTolerance) ?? 0;
              const off = r.field === 'min' && v === 0;
              return (
                <tr key={a.id} className="border-b border-gray-200 last:border-0">
                  <td className="px-3 py-2.5 font-medium">{a.alertType}</td>
                  <td className="px-3 py-2.5">{r.field === 'max' ? 'Max' : 'Min'} = {v}%</td>
                  <td className="px-3 py-2.5">{off ? <span className="text-gray-500">off</span> : r.rule(v)}</td>
                  <td className="px-3 py-2.5 font-mono text-[13px]">{off ? '—' : r.limit(expected, v)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CalcSection>
    </div>
  );
}

/** API: GET /alert-configs, PUT /alert-configs */
export function AlertSettingsTab() {
  const { can } = useAuth();
  const { toast } = useToast();
  const q = useApi(() => configurationsApi.alertConfigs(), []);
  const mail = useApi(() => administrationApi.emailStatus(), []);
  const [items, setItems] = useState<AlertConfig[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const editable = can('editConfiguration');

  useEffect(() => {
    if (q.data) setItems(q.data);
  }, [q.data]);

  const update = (id: string, patch: Partial<AlertConfig>) => {
    setItems((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setDirty(true);
  };

  const [showCalc, setShowCalc] = useState(false);

  async function save() {
    const badOne = items.find((a) => (a.minTolerance ?? 0) > (a.maxTolerance ?? 0));
    if (badOne) return toast(`${badOne.alertType}: minimum tolerance cannot exceed maximum.`);
    setBusy(true);
    try {
      q.setData(await configurationsApi.saveAlertConfigs(items));
      setDirty(false);
      toast('Alert settings saved.');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  if (q.error) return <ErrorBanner message={q.error.message} onRetry={q.reload} />;
  if (!q.data) return <LoadingBlock />;
  return (
    <>
      {mail.data && !mail.data.connected && (
        <div role="alert" className="mb-3 flex items-center gap-3 rounded-sm border border-amber-300 bg-amber-50 px-4 py-3 type-body-2 text-gray-800">
          <span aria-hidden>⚠</span>
          <span>Alert e-mails are <b>not being sent</b> because no e-mail account is connected. An administrator needs to set it up in <b>Administration → Settings → Email Alerts</b>.</span>
        </div>
      )}
      <div>
        <Button variant="secondary" size="sm" disabled={!dirty || !editable} loading={busy} onClick={save} icon={<Icon name="save" size={13} />}>
          Save Changes
        </Button>
      </div>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th align="center" className="w-[325px]">Alert Type</Th>
              <Th align="center" className="w-[325px]">Status</Th>
              <Th align="center">Email Notification (Optional)</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <Tr key={a.id}>
                <Td align="center" className="whitespace-normal">{a.alertType}</Td>
                <Td align="center">
                  <span className="inline-flex items-center gap-2">
                    <Checkbox checked={a.enabled} disabled={!editable} onChange={(v) => update(a.id, { enabled: v })} label={`${a.enabled ? 'Disable' : 'Enable'} ${a.alertType}`} />
                    <span className={a.enabled ? 'type-title-3 text-dosing-blue' : 'type-title-3 text-gray-600'}>{a.enabled ? 'Enabled' : 'Disabled'}</span>
                  </span>
                </Td>
                <Td>
                  <span className="flex flex-wrap gap-3">
                    {a.emails.map((email) => (
                      <span key={email} className="inline-flex items-center gap-3 rounded-sm bg-gray-200 px-3 py-1.5">
                        <span className="type-body-2 text-gray-800">{email}</span>
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => update(a.id, { emails: a.emails.filter((x) => x !== email) })}
                          aria-label={`Remove ${email} from ${a.alertType}`}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </span>
                    ))}
                  </span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <div className="mt-8 flex items-center gap-4">
        <h2 className="type-headline-1 text-gray-800">Alert Tolerance</h2>
        <Button variant="secondary" size="sm" onClick={() => setShowCalc(true)} aria-haspopup="dialog">
          Show calculation
        </Button>
      </div>
      <p className="mt-1 type-body-2 text-gray-600">Minimum and maximum tolerance for each alert.{!editable && ' You need configuration access to edit these.'}</p>
      <Modal open={showCalc} onClose={() => setShowCalc(false)} title="Alert calculation" width="xl">
        <CalculationPanel items={items} editable={editable} />
      </Modal>
      <TableWrap className="mt-3">
        <Table>
          <thead>
            <tr>
              <Th align="center" className="w-[325px]">Alert Type</Th>
              <Th align="center">Min</Th>
              <Th align="center">Max</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => {
              const bad = (a.minTolerance ?? 0) > (a.maxTolerance ?? 0);
              const field = (k: 'minTolerance' | 'maxTolerance') => (
                <input
                  type="number"
                  step="any"
                  min={0}
                  aria-label={`${a.alertType} ${k === 'minTolerance' ? 'minimum' : 'maximum'} tolerance`}
                  value={a[k] ?? 0}
                  disabled={!editable}
                  onChange={(e) => update(a.id, { [k]: Number(e.target.value) })}
                  className={`h-8 w-28 rounded-sm border bg-white px-2 text-center type-body-2 text-gray-800 disabled:bg-gray-100 disabled:text-gray-500 ${bad ? 'border-brand-red' : 'border-gray-300'}`}
                />
              );
              return (
                <Tr key={`tol-${a.id}`}>
                  <Td align="center" className="whitespace-normal">
                    {a.alertType}
                    {RULES[a.alertType] && <span className="block type-label-2 text-gray-500">{RULES[a.alertType].hint}</span>}
                    {bad &&<span className="block type-label-2 text-brand-red">Min cannot exceed max</span>}
                  </Td>
                  <Td align="center">{field('minTolerance')}</Td>
                  <Td align="center">{field('maxTolerance')}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}
