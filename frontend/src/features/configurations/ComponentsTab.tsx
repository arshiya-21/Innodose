import { useMemo, useState } from 'react';
import { ApiError, configurationsApi } from '@/api';
import type { Component, ComponentInput, Inoculant } from '@/api/types';
import { Button, Checkbox, ConfirmDialog, ErrorBanner, LoadingBlock, Modal, Pagination, Select, Table, TableWrap, Td, TextField, Th, Tr, useToast } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { Toolbar } from './Toolbar';

const EMPTY: ComponentInput = { componentId: '', componentName: '', pouringTempMin: 0, pouringTempMax: 0, pouringTimeSec: 0, inoculantFlowRate: 0, expectedDosageGms: 0, grade: '', pattern: '', inoculantId: '', bunchWeightKg: 0 };
type Errors = Partial<Record<keyof ComponentInput, string>>;

function validate(c: ComponentInput): Errors {
  const e: Errors = {};
  if (!c.componentId.trim()) e.componentId = 'Component ID is required';
  if (!c.componentName.trim()) e.componentName = 'Component name is required';
  if (c.pouringTempMin <= 0) e.pouringTempMin = 'Enter a minimum temperature';
  if (c.pouringTempMax <= c.pouringTempMin) e.pouringTempMax = 'Maximum must be greater than minimum';
  if (c.pouringTimeSec <= 0) e.pouringTimeSec = 'Enter a pouring time';
  if (c.inoculantFlowRate <= 0) e.inoculantFlowRate = 'Enter a flow rate';
  if (c.expectedDosageGms <= 0) e.expectedDosageGms = 'Enter an expected dosage';
  if (!c.grade.trim()) e.grade = 'Grade is required';
  if (!c.pattern.trim()) e.pattern = 'Pattern ID is required';
  if (!c.inoculantId) e.inoculantId = 'Select an inoculant';
  if (c.bunchWeightKg <= 0) e.bunchWeightKg = 'Enter a bunch weight';
  return e;
}

/** Expected dosage = pouring time × inoculant flow-rate. */
const withDosage = (c: ComponentInput): ComponentInput => ({ ...c, expectedDosageGms: Math.round(c.pouringTimeSec * c.inoculantFlowRate * 100) / 100 });

/** API: GET/POST /components, PUT /components/:id, DELETE /components */
export function ComponentsTab() {
  const { can } = useAuth();
  const { toast } = useToast();
  const q = useApi(() => configurationsApi.components(), []);
  const inoculantsQ = useApi(() => configurationsApi.inoculants(), []);
  const inoculants: Inoculant[] = inoculantsQ.data ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ComponentInput>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  // Always listed in component-ID order (C-100, C-101, ... C-1000), numeric-aware
  const rows = useMemo(() => [...(q.data ?? [])].sort((a, b) => a.componentId.localeCompare(b.componentId, undefined, { numeric: true })), [q.data]);
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const all = pageRows.length > 0 && pageRows.every((r) => selected.includes(r.id));

  const openAdd = () => (setEditing(null), setForm(EMPTY), setErrors({}), setFormOpen(true));
  const openEdit = () => {
    const c = rows.find((r) => r.id === selected[0]);
    if (!c) return;
    const { id, inoculantName: _n, ...rest } = c;
    setEditing(id);
    setForm({ ...rest, inoculantId: rest.inoculantId ?? '' });
    setErrors({});
    setFormOpen(true);
  };

  async function save() {
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const saved = editing ? await configurationsApi.updateComponent(editing, form) : await configurationsApi.createComponent(form);
      q.setData((list) => (editing ? list?.map((c) => (c.id === editing ? saved : c)) : [...(list ?? []), saved]));
      setFormOpen(false);
      setSelected([]);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save the component.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await configurationsApi.deleteComponents(selected);
      q.setData((list) => list?.filter((c) => !selected.includes(c.id)));
      setSelected([]);
      setConfirm(false);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete.');
    } finally {
      setBusy(false);
    }
  }

  const num = (k: keyof ComponentInput) => ({
    type: 'number' as const,
    value: (form[k] as number) || '',
    error: errors[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: Number(e.target.value) }),
  });

  if (q.error) return <ErrorBanner message={q.error.message} onRetry={q.reload} />;
  if (!q.data) return <LoadingBlock />;

  return (
    <>
      <Toolbar selected={selected.length} onEdit={openEdit} onDelete={() => setConfirm(true)} onAdd={openAdd} addLabel="Add New Component" disabled={!can('editConfiguration')} />
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th className="w-10">
                <Checkbox checked={all} indeterminate={selected.length > 0 && !all} onChange={(v) => setSelected(v ? pageRows.map((r) => r.id) : selected.filter((id) => !pageRows.some((r) => r.id === id)))} label="Select all components" />
              </Th>
              <Th align="center">Component ID</Th>
              <Th className="min-w-[260px]">Component Name</Th>
              <Th align="center">Pattern ID</Th>
              <Th align="center">Inoculant Type</Th>
              <Th align="center">Pouring Temp.</Th>
              <Th align="center">Pouring Time</Th>
              <Th align="center">Inoculant Flow-Rate</Th>
              <Th align="center">Expected Dosage</Th>
              <Th align="center">Grade</Th>
              <Th align="center">Bunch Weight</Th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((c: Component) => {
              const sel = selected.includes(c.id);
              return (
                <Tr key={c.id} selected={sel}>
                  <Td>
                    <Checkbox checked={sel} onChange={(v) => setSelected((s) => (v ? [...s, c.id] : s.filter((x) => x !== c.id)))} label={`Select ${c.componentName}`} />
                  </Td>
                  <Td align="center">{c.componentId}</Td>
                  <Td className="font-semibold">{c.componentName}</Td>
                  <Td align="center">{c.pattern || '—'}</Td>
                  <Td align="center" className="whitespace-nowrap">{c.inoculantName || '—'}</Td>
                  <Td align="center">{c.pouringTempMin} - {c.pouringTempMax} °C</Td>
                  <Td align="center">{c.pouringTimeSec} sec</Td>
                  <Td align="center" className="bg-[#eef4ff]">{c.inoculantFlowRate} gms/sec</Td>
                  <Td align="center" className="bg-[#eef4ff]">{c.expectedDosageGms} gms</Td>
                  <Td align="center">{c.grade}</Td>
                  <Td align="center">{c.bunchWeightKg} kg</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
      {pageCount > 1 && <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} className="mt-4" />}

      <Modal
        open={formOpen}
        title={editing ? 'Edit Component' : 'Add New Component'}
        onClose={() => setFormOpen(false)}
        width="lg"
      >
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
          {/* Casting parameters */}
          <section className="flex flex-col gap-4">
            <h3 className="type-title-2 border-b-2 border-amber-600 pb-1 font-semibold text-amber-700">Casting Parameters</h3>
            <TextField label="Component ID" value={form.componentId} error={errors.componentId} onChange={(e) => setForm({ ...form, componentId: e.target.value })} />
            <TextField label="Component Name" value={form.componentName} error={errors.componentName} onChange={(e) => setForm({ ...form, componentName: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Pouring Temp. Min (°C)" {...num('pouringTempMin')} />
              <TextField label="Pouring Temp. Max (°C)" {...num('pouringTempMax')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Grade" value={form.grade} error={errors.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
              <TextField label="Pattern ID" placeholder="e.g. PTN-100" value={form.pattern} error={errors.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} />
            </div>
            <TextField label="Bunch Weight (kg)" {...num('bunchWeightKg')} />
          </section>

          {/* Inoculation parameters */}
          <section className="flex flex-col gap-4">
            <h3 className="type-title-2 border-b-2 border-dosing-blue pb-1 font-semibold text-dosing-blue">Inoculation Parameters</h3>
            {/* a <div>, not a <label>: a label forwarding its click to the Select button opens and closes it at once */}
            <div>
              <span className="block type-label-1 text-gray-800">Inoculant Type</span>
              <div className="mt-1">
                <Select<string>
                  ariaLabel="Inoculant type"
                  value={form.inoculantId ?? ''}
                  onChange={(v) => setForm({ ...form, inoculantId: v })}
                  options={inoculants.map((i) => ({ value: i.id, label: `${i.name} — ${i.type}` }))}
                  placeholder="Select an inoculant"
                />
              </div>
              {errors.inoculantId && <p role="alert" className="mt-1 type-body-2 text-brand-red">{errors.inoculantId}</p>}
            </div>
            <TextField label="Pouring Time (sec)" {...num('pouringTimeSec')} onChange={(e) => setForm(withDosage({ ...form, pouringTimeSec: Number(e.target.value) }))} />
            <TextField label="Inoculant Flow-Rate (gms/sec)" step="0.1" {...num('inoculantFlowRate')} onChange={(e) => setForm(withDosage({ ...form, inoculantFlowRate: Number(e.target.value) }))} />
            <div className="flex items-center justify-between rounded-sm bg-gray-100 px-3 py-2">
              <span className="type-body-2 text-gray-600">Expected Dosage</span>
              <span className="type-body-2 font-semibold text-gray-800">{form.expectedDosageGms || 0} gms</span>
            </div>
            {errors.expectedDosageGms && <p className="type-label-2 text-brand-red">{errors.expectedDosageGms}</p>}
          </section>
        </div>

        <div className="mt-8 flex justify-center gap-3">
          <Button variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>{editing ? 'Save Changes' : 'Save'}</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm}
        title="Delete component"
        message={`Delete ${selected.length} component${selected.length === 1 ? '' : 's'}? This cannot be undone.`}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
