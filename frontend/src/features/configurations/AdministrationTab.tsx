import { useEffect, useRef, useState } from 'react';
import { Button, Icon } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useMachine } from '@/context/MachineContext';
import { LOGO_MAX_BYTES, LOGO_TYPES, useBranding } from '@/context/BrandingContext';
import { Modal, TextField } from '@/components/ui';
import { commonApi } from '@/api/common';
import type { ShiftDef } from '@/api/types';

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
/** Minute ranges on a 24 h clock; a shift that crosses midnight becomes two ranges. */
const ranges = (s: { start: string; end: string }): [number, number][] => {
  const a = toMin(s.start), b = toMin(s.end);
  return a < b ? [[a, b]] : [[a, 1440], [0, b]];
};
const overlaps = (x: { start: string; end: string }, y: { start: string; end: string }) =>
  ranges(x).some(([a1, b1]) => ranges(y).some(([a2, b2]) => a1 < b2 && a2 < b1));
const durationLabel = (start: string, end: string) => {
  const mins = (toMin(end) - toMin(start) + 1440) % 1440;
  return `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ''}`;
};
const PRESETS = [
  { label: 'Morning', start: '07:00', end: '15:00' },
  { label: 'Evening', start: '15:00', end: '23:00' },
  { label: 'Night', start: '23:00', end: '07:00' },
];
const timeInput = 'mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 type-body-2 tabular-nums focus:border-gray-800 focus:outline-none';

/** Shifts: list (current one highlighted) + "Add Shift" pop-up. Name is free text (A/B/C, 1/2/3, …). */
function ShiftsSection({ allowed }: { allowed: boolean }) {
  const { shift: current } = useMachine();
  const [shifts, setShifts] = useState<ShiftDef[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { commonApi.shifts().then(setShifts).catch(() => undefined); }, []);

  function openAdd() { setName(''); setStart(''); setEnd(''); setErr(null); setOpen(true); }

  // Live validation so the button explains itself instead of failing after a click.
  const clash = start && end && start !== end ? shifts.find((s) => overlaps({ start, end }, s)) : undefined;
  const dup = shifts.some((s) => s.name.toLowerCase() === name.trim().toLowerCase());
  const problem = !name.trim() ? 'Enter a shift name.'
    : dup ? `A shift named "${name.trim()}" already exists.`
    : !start || !end ? 'Pick a start and end time.'
    : start === end ? 'Start and end time must be different.'
    : clash ? `Overlaps Shift ${clash.name} (${clash.start} – ${clash.end}).`
    : null;

  async function add() {
    if (problem) return setErr(problem);
    setBusy(true); setErr(null);
    try {
      setShifts(await commonApi.addShift({ name: name.trim(), start, end }));
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add the shift.');
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { setShifts(await commonApi.deleteShift(id)); } catch { /* keep list */ }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="type-label-1 text-gray-800">Shifts</span>
        <Button variant="primary" disabled={!allowed} onClick={openAdd}>Add Shift</Button>
      </div>
      {shifts.length > 0 ? (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-300 bg-gray-100">
          {shifts.map((s) => {
            const isNow = current?.shift === `Shift ${s.name}`;
            return (
              <li key={s.id} className="flex items-center gap-4 px-4 py-2 type-body-2 text-gray-800">
                <span className="w-24 font-semibold">Shift {s.name}</span>
                <span className="tabular-nums">{s.start} – {s.end}{s.start > s.end && <span className="text-gray-500"> (next day)</span>}</span>
                {isNow && <span className="rounded-circle bg-dosing-blue px-2 py-0.5 type-label-2 text-white">Current</span>}
                <button type="button" disabled={!allowed} onClick={() => remove(s.id)} aria-label={`Remove shift ${s.name}`} className="ml-auto text-gray-600 hover:text-gray-800 disabled:opacity-40">
                  <Icon name="close" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="type-body-2 text-gray-500">No shifts yet. Add one to see the current shift in the sidebar.</p>
      )}

      <Modal open={open} title="Add Shift" onClose={() => setOpen(false)}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={busy} disabled={!!problem} onClick={add}>Add Shift</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); void add(); }} className="space-y-5">
          <TextField label="Shift name" placeholder="e.g. A, B, C or 1, 2, 3" autoComplete="off" autoFocus value={name} onChange={(e) => setName(e.target.value)} />

          <div>
            <span className="block type-label-1 text-gray-800">Timing</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const on = start === p.start && end === p.end;
                return (
                  <button key={p.label} type="button" onClick={() => { setStart(p.start); setEnd(p.end); setErr(null); }}
                    className={`rounded-circle border px-3 py-1 type-label-2 ${on ? 'border-gray-800 bg-gray-800 text-white' : 'border-gray-300 text-gray-800 hover:bg-gray-100'}`}>
                    {p.label} · {p.start}–{p.end}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <label className="block">
                <span className="block type-label-2 text-gray-600">Start time</span>
                <input type="time" value={start} onChange={(e) => { setStart(e.target.value); setErr(null); }} className={timeInput} />
              </label>
              <label className="block">
                <span className="block type-label-2 text-gray-600">End time</span>
                <input type="time" value={end} onChange={(e) => { setEnd(e.target.value); setErr(null); }} className={timeInput} />
              </label>
            </div>
            {start && end && start !== end && (
              <p className="mt-2 type-label-2 text-gray-600">
                {durationLabel(start, end)} · {start} → {end}{start > end ? ' (ends next day)' : ''}
              </p>
            )}
          </div>

          {(err ?? (name || start || end ? problem : null)) && (
            <p role="alert" className="type-label-2 text-brand-red">{err ?? problem}</p>
          )}
        </form>
      </Modal>
    </section>
  );
}

/**
 * Customer Info — editable customer name + optional logo.
 * API: GET/PUT/DELETE /branding
 *
 * When no logo has been uploaded we render a plain placeholder frame rather
 * than falling back to the bundled default (which stays in the header only).
 */
export function AdministrationTab() {
  const { raw, branding, upload, updateName, reset } = useBranding();
  const { can } = useAuth();
  const allowed = can('editBranding');

  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(raw.customerName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Keep the name field in sync when the server-side value changes.
  useEffect(() => { setName(raw.customerName ?? ''); }, [raw.customerName]);

  // The logo shown in the header (custom or the bundled default) counts as "there"; after Remove there is none.
  const hasLogo = !!branding.logoUrl;

  async function onFile(file?: File) {
    if (!file) return;
    setError(null); setStatus(null); setBusy(true);
    try {
      await upload(file);
      setStatus('Logo updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    if (!name.trim()) { setError('Customer name is required.'); return; }
    setError(null); setStatus(null); setBusy(true);
    try {
      await updateName(name.trim());
      setStatus('Customer name saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    setError(null); setStatus(null); setBusy(true);
    try {
      await reset();
      setStatus('Logo removed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the logo.');
    } finally {
      setBusy(false);
    }
  }

  const dirty = name.trim() !== (raw.customerName ?? '').trim();

  return (
    <div className="max-w-[720px] space-y-6">
      <div>
        <h2 className="type-headline-1 text-gray-800">Customer Info</h2>
        <p className="mt-3 type-body-2 text-gray-600">
          Shown in the top-right of every screen. PNG, JPG or SVG, up to 1 MB. For the sharpest result use a logo about 194&nbsp;×&nbsp;64 or larger with the same proportions.
        </p>
      </div>

      {/* Name */}
      <section className="space-y-2">
        <label className="block">
          <span className="block type-label-1 text-gray-800">Customer name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!allowed}
            placeholder="e.g. Gujarat Metal Cast"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 type-body-2 focus:border-gray-800 focus:outline-none disabled:bg-gray-100"
          />
        </label>
        <div>
          <Button variant="primary" disabled={!allowed || !dirty || busy} loading={busy} onClick={saveName}>
            Save name
          </Button>
        </div>
      </section>

      <ShiftsSection allowed={allowed} />

      {/* Logo */}
      <section className="space-y-2">
        <label className="block type-label-1 text-gray-800">Logo</label>
        <div className="flex items-center gap-8 rounded-lg border border-gray-300 bg-gray-100 p-5">
          <div className="flex h-16 w-[194px] shrink-0 items-center justify-center rounded-sm border border-gray-300 bg-white">
            {hasLogo
              ? <img src={branding.logoUrl} alt={name || 'Customer logo'} className="max-h-12 max-w-[178px] object-contain" />
              : <span className="type-label-2 text-gray-400">No logo</span>}
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={input}
                type="file"
                accept={LOGO_TYPES.join(',')}
                className="sr-only"
                onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ''))}
              />
              <Button
                variant="primary"
                disabled={!allowed}
                loading={busy}
                onClick={() => input.current?.click()}
                icon={<Icon name="image-up" size={14} />}
              >
                {hasLogo ? 'Replace logo' : 'Add logo'}
              </Button>
              {hasLogo && (
                <Button
                  variant="secondary"
                  disabled={!allowed || busy}
                  onClick={onReset}
                  icon={<Icon name="reset" size={14} />}
                >
                  Remove logo
                </Button>
              )}
            </div>
            <p className="type-label-2 text-gray-500">Maximum {Math.round(LOGO_MAX_BYTES / 1024)} KB.</p>
          </div>
        </div>
      </section>

      {/* Status / errors */}
      {!allowed && <p className="type-body-2 text-gray-500">Administrator access is needed to change customer info.</p>}
      {error && <p role="alert" className="type-body-2 text-brand-red">{error}</p>}
      {status && !error && <p role="status" className="type-body-2 text-dose-optimal">{status}</p>}
    </div>
  );
}
