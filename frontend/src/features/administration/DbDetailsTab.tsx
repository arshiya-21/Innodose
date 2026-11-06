import { useEffect, useRef, useState } from 'react';
import { Button, Select, TextField } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { administrationApi, DB_PASSWORD_MASK, type DbDetails } from '@/api/administration';
import { ApiError } from '@/api';
import { config } from '@/config';
import { PlcPanel } from './PlcPanel';
import { EmailPanel } from './EmailPanel';

/**
 * DB Details — MySQL connection + optional SSH tunnel.
 *
 * Persisted to MySQL (`db_details` table). Nothing here changes the live
 * connection the server is currently using — it records what the plant
 * admin wants that connection to be. Password is shown as a mask (`•••••`)
 * when a value exists on the server; leave it as-is to keep the current
 * password, or type a new one to overwrite.
 */
type DbType = 'mysql' | 'postgres';

const DEFAULT_PORT: Record<DbType, string> = { mysql: '3306', postgres: '5432' };

const EMPTY: DbDetails = {
  type: 'mysql',
  host: 'localhost',
  port: '3306',
  user: 'root',
  password: '',
  database: 'inodose_test',
  useSshTunnel: false,
  ssh: { host: '', port: '22', user: '', privateKeyPath: '' },
};

export function DbDetailsTab() {
  const { can } = useAuth();
  const allowed = can('editConfiguration');
  const [form, setForm] = useState<DbDetails>(EMPTY);
  const [original, setOriginal] = useState<DbDetails>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // Tracks whether the password field is still showing the server-side mask.
  // While true, we send the mask back on save → the backend keeps the stored
  // password untouched. The moment the user types, we drop into "edit" mode.
  const editingPw = useRef(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const d = await administrationApi.getDbDetails();
      setForm(d); setOriginal(d);
      editingPw.current = false;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load.');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const dirty = JSON.stringify(form) !== JSON.stringify(original);

  async function save() {
    setBusy(true); setError(null); setStatus(null);
    try {
      const saved = await administrationApi.saveDbDetails(form) as DbDetails & { restarting?: boolean };
      setForm(saved); setOriginal(saved);
      editingPw.current = false;
      if (saved.restarting) {
        setStatus('Connection tested and saved. The application is restarting with the new database…');
        // The service manager starts it again; wait until it answers, then reload so everything uses the new database.
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          try { if ((await fetch(`${config.apiBaseUrl}/setup/status`)).ok) { window.location.reload(); return; } } catch { /* still restarting */ }
        }
        setStatus('Saved, but the application has not come back yet. Check that it runs as a service that restarts automatically.');
      } else {
        setStatus('Saved.');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setForm(original); setStatus(null); setError(null);
    editingPw.current = false;
  }

  const set = <K extends keyof DbDetails>(k: K, v: DbDetails[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setSsh = <K extends keyof DbDetails['ssh']>(k: K, v: DbDetails['ssh'][K]) =>
    setForm((f) => ({ ...f, ssh: { ...f.ssh, [k]: v } }));

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;

  return (
    <div className="grid w-full grid-cols-1 gap-10 xl:grid-cols-2">
    <div className="w-full space-y-6">
      <div>
        <h2 className="type-headline-1 text-gray-800">Database Details</h2>
        <p className="mt-3 type-body-2 text-gray-600">
          MySQL connection used by the backend admin store. Add SSH tunnel details if the database is only reachable through a bastion host.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4">
        {/* NOTE: the field intentionally uses <div>, not <label>. A <label>
            forwarding its click to the nested <button> causes Select to open
            and immediately close on one tap. */}
        <div>
          <span className="block type-label-1 text-gray-800">Database Type</span>
          <div className="mt-1">
            <Select<DbType>
              ariaLabel="Database type"
              value={form.type}
              onChange={(v) => {
                setForm((f) => ({
                  ...f,
                  type: v,
                  port: f.port === DEFAULT_PORT[f.type] ? DEFAULT_PORT[v] : f.port,
                }));
              }}
              options={[
                { value: 'mysql',    label: 'MySQL' },
                { value: 'postgres', label: 'PostgreSQL' },
              ]}
              disabled={!allowed}
            />
          </div>
        </div>
        <TextField label="Host" value={form.host} onChange={(e) => set('host', e.target.value)} disabled={!allowed} />
        <TextField label="Port" value={form.port} onChange={(e) => set('port', e.target.value)} disabled={!allowed} />
        <TextField label="Username" value={form.user} onChange={(e) => set('user', e.target.value)} disabled={!allowed} />
        <TextField
          label="Password"
          type="password"
          value={form.password}
          placeholder={form.password === DB_PASSWORD_MASK ? '' : 'Leave blank for no password'}
          onFocus={() => {
            // If the server sent the mask, clear the input the moment the user focuses
            // so they start with a blank field instead of overwriting bullets.
            if (form.password === DB_PASSWORD_MASK && !editingPw.current) {
              editingPw.current = true;
              set('password', '');
            }
          }}
          onChange={(e) => { editingPw.current = true; set('password', e.target.value); }}
          disabled={!allowed}
        />
        <TextField label="Database" value={form.database} onChange={(e) => set('database', e.target.value)} disabled={!allowed} />
      </section>

      <section className="space-y-4">
        <label className="inline-flex items-center gap-2 type-body-2 text-gray-800 select-none">
          <input
            type="checkbox"
            checked={form.useSshTunnel}
            onChange={(e) => set('useSshTunnel', e.target.checked)}
            disabled={!allowed}
            className="h-4 w-4 accent-gray-800"
          />
          Use SSH tunnel
        </label>
        {form.useSshTunnel && (
          <div className="grid grid-cols-2 gap-4">
            <TextField label="SSH Host" value={form.ssh.host} onChange={(e) => setSsh('host', e.target.value)} disabled={!allowed} />
            <TextField label="SSH Port" value={form.ssh.port} onChange={(e) => setSsh('port', e.target.value)} disabled={!allowed} />
            <TextField label="SSH User" value={form.ssh.user} onChange={(e) => setSsh('user', e.target.value)} disabled={!allowed} />
            <TextField label="Private Key Path" value={form.ssh.privateKeyPath} onChange={(e) => setSsh('privateKeyPath', e.target.value)} disabled={!allowed} />
          </div>
        )}
      </section>

      <div className="flex items-center gap-2">
        <Button variant="primary" disabled={!allowed || !dirty || busy} loading={busy} onClick={save}>Save Changes</Button>
        <Button variant="secondary" disabled={!allowed || !dirty || busy} onClick={reset}>Reset</Button>
      </div>

      {!allowed && <p className="type-body-2 text-gray-500">Administrator access is needed to change database details.</p>}
      {error && <p role="alert" className="type-body-2 text-brand-red">{error}</p>}
      {status && <p role="status" className="type-body-2 text-dose-optimal">{status}</p>}
    </div>
    {/* Email sits beside the database panel (same row, same height); PLC goes below them */}
    <div className="border-gray-200 xl:border-l xl:pl-10"><EmailPanel /></div>
    <div className="border-t border-gray-200 pt-8 xl:col-span-2"><PlcPanel /></div>
    </div>
  );
}
