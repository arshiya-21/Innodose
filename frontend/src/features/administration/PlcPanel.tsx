import { useEffect, useState } from 'react';
import { Button, TextField } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { administrationApi, type PlcConfig, type PlcDataType, type PlcTag } from '@/api/administration';
import { ApiError } from '@/api';

/**
 * PLC details (Allen-Bradley SLC). For each manual operation, the tag + value written
 * to Open and to Close. "Test" writes that single tag/value to the PLC now.
 */
const EMPTY: PlcConfig = { ip: '192.168.0.12', tags: [] };

export function PlcPanel() {
  const { canNav } = useAuth();
  const allowed = canNav('administration', 'edit');
  const [form, setForm] = useState<PlcConfig>(EMPTY);
  const [original, setOriginal] = useState<PlcConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    administrationApi.getPlcConfig()
      .then((c) => { setForm(c); setOriginal(c); })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load PLC details.'))
      .finally(() => setLoading(false));
  }, []);

  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  const setTag = (key: string, patch: Partial<PlcTag>) =>
    setForm((f) => ({ ...f, tags: f.tags.map((t) => (t.key === key ? { ...t, ...patch } : t)) }));

  async function save() {
    setBusy(true); setError(null); setStatus(null);
    try {
      const saved = await administrationApi.savePlcConfig(form);
      setForm(saved); setOriginal(saved);
      setStatus('PLC details saved.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save PLC details.');
    } finally { setBusy(false); }
  }

  async function test(id: string, tag: string, value: number, dataType: PlcDataType) {
    setTesting(id); setError(null); setStatus(null);
    try {
      const r = await administrationApi.testPlcWrite({ ip: form.ip, tag, value, dataType });
      setStatus(r.message);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'PLC write failed.');
    } finally { setTesting(null); }
  }

  if (loading) return <div className="p-6 text-gray-500">Loading PLC details…</div>;

  const row = (t: PlcTag, kind: 'open' | 'close', label: string) => {
    const tagK = kind === 'open' ? 'openTag' : 'closeTag';
    const valK = kind === 'open' ? 'openValue' : 'closeValue';
    const id = `${t.key}-${kind}`;
    return (
      <div>
        <span className="mb-1 block type-body-2 text-gray-600">{label}</span>
        <div className="grid grid-cols-[minmax(0,1fr)_64px_auto] items-end gap-2">
          <TextField aria-label={`${t.label} ${label} tag`} placeholder="Tag e.g. F8:27" value={t[tagK]} onChange={(e) => setTag(t.key, { [tagK]: e.target.value })} disabled={!allowed} />
          <TextField aria-label={`${t.label} ${label} value`} type="number" title="Value" value={t[valK]} onChange={(e) => setTag(t.key, { [valK]: Number(e.target.value) })} disabled={!allowed} />
          <Button variant="secondary" loading={testing === id} disabled={!allowed || !t[tagK] || !form.ip || !!testing} onClick={() => test(id, t[tagK], t[valK], t.dataType ?? 'boolean')}>Test</Button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="type-headline-1 text-gray-800">PLC Details</h2>
        <p className="mt-3 type-body-2 text-gray-600">
          Allen-Bradley SLC PLC used for Manual Mode. The value is written to the tag when the operator presses Open or Close, using the data type chosen for each operation (Boolean by default).
        </p>
      </div>

      <TextField label="PLC IP Address" value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} disabled={!allowed} />

      {/* One card per operation, four across on wide screens (Tag + Value + Test inside each card) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {form.tags.map((t) => (
          <fieldset key={t.key} className="min-w-0 space-y-3 rounded-sm border border-gray-200 p-3">
            <legend className="px-1 type-title-3 text-gray-800">{t.label}</legend>
            <label className="flex items-center gap-2 type-label-1 text-gray-800">
              Data type
              <select
                value={t.dataType ?? 'boolean'}
                onChange={(e) => setTag(t.key, { dataType: e.target.value as PlcDataType })}
                disabled={!allowed}
                className="h-9 rounded-lg border border-gray-300 px-2 type-body-2 focus:border-gray-800 focus:outline-none disabled:bg-gray-100"
              >
                <option value="boolean">Boolean</option>
                <option value="integer">Integer</option>
                <option value="float">Float</option>
              </select>
            </label>
            {row(t, 'open', 'Open')}
            {row(t, 'close', 'Close')}
          </fieldset>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="primary" disabled={!allowed || !dirty || busy} loading={busy} onClick={save}>Save PLC Details</Button>
        <Button variant="secondary" disabled={!allowed || !dirty || busy} onClick={() => { setForm(original); setStatus(null); setError(null); }}>Reset</Button>
      </div>
      {error && <p role="alert" className="type-body-2 text-brand-red">{error}</p>}
      {status && <p role="status" className="type-body-2 text-dose-optimal">{status}</p>}
    </div>
  );
}
