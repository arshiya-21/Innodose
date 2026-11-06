import { useEffect, useState } from 'react';
import { ApiError, configurationsApi } from '@/api';
import type { Inoculant, InoculantInput } from '@/api/types';
import { Button, Checkbox, ConfirmDialog, ErrorBanner, LoadingBlock, Modal, Table, TableWrap, Td, TextField, Th, Tr, useToast } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { Toolbar } from './Toolbar';

const EMPTY: InoculantInput = { name: '', type: '', application: '', size: '', specificGravity: '', contentPct: '' };
type Errors = Partial<Record<keyof InoculantInput, string>>;

const isPositive = (v: number | string, max: number) => {
  const n = Number(v);
  return String(v).trim() !== '' && Number.isFinite(n) && n > 0 && n <= max;
};

/** Inoculant master. API: GET/POST /inoculants, PUT /inoculants/:id, DELETE /inoculants. The type is typed as text. */
export function InoculantsTab() {
  const { can } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Inoculant[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<InoculantInput>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    configurationsApi.inoculants().then(setRows).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load inoculants.'));
  useEffect(() => { void load(); }, []);

  const openAdd = () => (setEditing(null), setForm(EMPTY), setErrors({}), setFormOpen(true));
  const openEdit = () => {
    const r = rows?.find((x) => x.id === selected[0]);
    if (!r) return;
    setEditing(r.id);
    setForm({
      name: r.name, type: r.type, application: r.application, size: r.size,
      specificGravity: r.specificGravity ?? '', contentPct: r.contentPct ?? '',
    });
    setErrors({});
    setFormOpen(true);
  };

  async function save() {
    const e: Errors = {};
    if (!form.name.trim()) e.name = 'Inoculant name is required';
    if (!form.type.trim()) e.type = 'Type of inoculant is required';
    if (!form.application.trim()) e.application = 'Application is required';
    if (!form.size.trim()) e.size = 'Size is required';
    if (!isPositive(form.specificGravity, 20)) e.specificGravity = 'Enter a number greater than 0';
    if (!isPositive(form.contentPct, 100)) e.contentPct = 'Enter a % between 0 and 100';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (editing) await configurationsApi.updateInoculant(editing, form);
      else await configurationsApi.createInoculant(form);
      await load();
      setFormOpen(false);
      setSelected([]);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save the inoculant.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await configurationsApi.deleteInoculants(selected);
      await load();
      setSelected([]);
      setConfirm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete.');
    } finally {
      setBusy(false);
    }
  }

  if (!rows) return error ? <ErrorBanner message={error} /> : <LoadingBlock />;
  const all = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const text = (k: 'name' | 'type' | 'application' | 'size', label: string, placeholder?: string) => (
    <TextField label={label} placeholder={placeholder} value={form[k]} error={errors[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
  );
  const number = (k: 'specificGravity' | 'contentPct', label: string, placeholder: string) => (
    <TextField label={label} type="number" step="0.01" min="0" placeholder={placeholder} value={String(form[k])} error={errors[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
  );

  return (
    <>
      {error && <ErrorBanner message={error} />}
      <Toolbar selected={selected.length} onEdit={openEdit} onDelete={() => setConfirm(true)} onAdd={openAdd} addLabel="Add New Inoculant" disabled={!can('editConfiguration')} />
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th className="w-12">
                <Checkbox checked={all} indeterminate={selected.length > 0 && !all} onChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])} label="Select all inoculants" />
              </Th>
              <Th align="center">S.No</Th>
              <Th align="center">Inoculant Name</Th>
              <Th align="center">Type of Inoculant</Th>
              <Th align="center">Application</Th>
              <Th align="center">Size (mm)</Th>
              <Th align="center">Specific Gravity (g/cm³)</Th>
              <Th align="center">Content (%)</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const sel = selected.includes(r.id);
              return (
                <Tr key={r.id} selected={sel}>
                  <Td>
                    <Checkbox checked={sel} onChange={(v) => setSelected((s) => (v ? [...s, r.id] : s.filter((x) => x !== r.id)))} label={`Select ${r.name}`} />
                  </Td>
                  <Td align="center">{i + 1}</Td>
                  <Td align="center" className="font-semibold">{r.name}</Td>
                  <Td align="center">{r.type}</Td>
                  <Td align="center">{r.application}</Td>
                  <Td align="center">{r.size}</Td>
                  <Td align="center">{r.specificGravity ?? '—'}</Td>
                  <Td align="center">{r.contentPct ?? '—'}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>

      <Modal
        open={formOpen}
        title={editing ? 'Edit Inoculant' : 'Add New Inoculant'}
        onClose={() => setFormOpen(false)}
        width="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={busy}>{editing ? 'Save Changes' : 'Add Inoculant'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          {text('name', 'Inoculant Name', 'e.g. FeSi–Ca')}
          {text('type', 'Type of Inoculant', 'e.g. Calcium based inoculants')}
          {text('application', 'Application', 'e.g. Gray Iron')}
          {text('size', 'Size of Inoculant (mm)', 'e.g. 0.2 – 0.7')}
          {number('specificGravity', 'Specific Gravity (g/cm³)', 'e.g. 2.90')}
          {number('contentPct', 'Content of Inoculant (%)', 'e.g. 73')}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm}
        title="Delete inoculant"
        message={`Delete ${selected.length} inoculant${selected.length === 1 ? '' : 's'}? This cannot be undone.`}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
