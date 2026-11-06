import { useState } from 'react';
import { ApiError, configurationsApi } from '@/api';
import type { MachineInput } from '@/api/types';
import { Button, Checkbox, ConfirmDialog, ErrorBanner, LoadingBlock, Modal, Pagination, Table, TableWrap, Td, TextField, Th, Tr, useToast } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useMachine } from '@/context/MachineContext';
import { Toolbar } from './Toolbar';

const EMPTY: MachineInput = { productId: '', machineName: '', productionLine: '' };
type Errors = Partial<Record<keyof MachineInput, string>>;

/** API: GET/POST /machines, PUT /machines/:id, DELETE /machines */
export function MachinesTab() {
  const { can } = useAuth();
  const { toast } = useToast();
  const { machines, reloadMachines } = useMachine();
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<MachineInput>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(machines.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = machines.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const all = pageRows.length > 0 && pageRows.every((m) => selected.includes(m.id));

  const openAdd = () => (setEditing(null), setForm(EMPTY), setErrors({}), setFormOpen(true));
  const openEdit = () => {
    const m = machines.find((x) => x.id === selected[0]);
    if (!m) return;
    setEditing(m.id);
    setForm({ productId: m.productId, machineName: m.machineName, productionLine: m.productionLine });
    setErrors({});
    setFormOpen(true);
  };

  async function save() {
    const e: Errors = {};
    if (!form.productId.trim()) e.productId = 'Product ID is required';
    if (!form.machineName.trim()) e.machineName = 'Machine name is required';
    if (!form.productionLine.trim()) e.productionLine = 'Production line is required';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (editing) await configurationsApi.updateMachine(editing, form);
      else await configurationsApi.createMachine(form);
      await reloadMachines();
      setFormOpen(false);
      setSelected([]);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save the machine.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await configurationsApi.deleteMachines(selected);
      await reloadMachines();
      setSelected([]);
      setConfirm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete.');
    } finally {
      setBusy(false);
    }
  }

  if (!machines) return <LoadingBlock />;
  return (
    <>
      {error && <ErrorBanner message={error} />}
      <Toolbar selected={selected.length} onEdit={openEdit} onDelete={() => setConfirm(true)} onAdd={openAdd} addLabel="Add New Machine" disabled={!can('editConfiguration')} />
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th className="w-12">
                <Checkbox checked={all} indeterminate={selected.length > 0 && !all} onChange={(v) => setSelected(v ? pageRows.map((m) => m.id) : selected.filter((id) => !pageRows.some((m) => m.id === id)))} label="Select all machines" />
              </Th>
              <Th align="center">Product ID</Th>
              <Th align="center">Machine Name</Th>
              <Th align="center">Production Line</Th>
              <Th align="center">Date Added</Th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((m) => {
              const sel = selected.includes(m.id);
              return (
                <Tr key={m.id} selected={sel}>
                  <Td>
                    <Checkbox checked={sel} onChange={(v) => setSelected((s) => (v ? [...s, m.id] : s.filter((x) => x !== m.id)))} label={`Select ${m.machineName}`} />
                  </Td>
                  <Td align="center">{m.productId}</Td>
                  <Td align="center" className="font-semibold">{m.machineName}</Td>
                  <Td align="center">{m.productionLine}</Td>
                  <Td align="center">{m.dateAdded}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
      {pageCount > 1 && <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} className="mt-4" />}

      <Modal
        open={formOpen}
        title={editing ? 'Edit Machine' : 'Add New Machine'}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={busy}>{editing ? 'Save Changes' : 'Add Machine'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Product ID" value={form.productId} error={errors.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} />
          <TextField label="Machine Name" value={form.machineName} error={errors.machineName} onChange={(e) => setForm({ ...form, machineName: e.target.value })} />
          <TextField label="Production Line" value={form.productionLine} error={errors.productionLine} onChange={(e) => setForm({ ...form, productionLine: e.target.value })} />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm}
        title="Delete machine"
        message={`Delete ${selected.length} machine${selected.length === 1 ? '' : 's'}? This cannot be undone.`}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
