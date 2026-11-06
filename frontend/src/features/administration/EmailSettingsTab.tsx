import { useEffect, useRef, useState } from 'react';
import { Button, Select, TextField } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { administrationApi, DB_PASSWORD_MASK, type EmailSettings } from '@/api/administration';
import { ApiError } from '@/api';

/**
 * Email Settings — the SMTP account used to send alert e-mails (recipients are set per alert in the Alerts tab).
 * Persisted to MySQL (`email_settings`). The password is shown as a mask when one is stored; leave it to keep
 * the current password or type a new one to replace it.
 */
type Security = EmailSettings['security'];
const DEFAULT_PORT: Record<Security, string> = { starttls: '587', ssl: '465', none: '25' };

const EMPTY: EmailSettings = {
  enabled: false, host: 'smtp.gmail.com', port: '587', security: 'starttls',
  user: '', password: '', fromName: 'Inodose Alerts', fromEmail: '',
};

export function EmailSettingsTab() {
  const { can } = useAuth();
  const allowed = can('editConfiguration');
  const [form, setForm] = useState<EmailSettings>(EMPTY);
  const [original, setOriginal] = useState<EmailSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const editingPw = useRef(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const d = await administrationApi.getEmailSettings();
      setForm(d); setOriginal(d); editingPw.current = false;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load.');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  const set = <K extends keyof EmailSettings>(k: K, v: EmailSettings[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true); setError(null); setStatus(null);
    try {
      const saved = await administrationApi.saveEmailSettings(form);
      setForm(saved); setOriginal(saved); editingPw.current = false;
      setStatus('Email settings saved.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
    } finally { setBusy(false); }
  }

  function reset() { setForm(original); setStatus(null); setError(null); editingPw.current = false; }

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;

  return (
    <div className="w-full max-w-[720px] space-y-6">
      <div>
        <h2 className="type-headline-1 text-gray-800">Email Settings</h2>
        <p className="mt-3 type-body-2 text-gray-600">
          The mail account used to send alert e-mails. Who receives each alert is set in the Alerts tab.
          For Gmail use smtp.gmail.com, port 587 (STARTTLS) and an app password, not your normal password.
        </p>
      </div>

      <label className="inline-flex items-center gap-2 type-body-2 text-gray-800 select-none">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => set('enabled', e.target.checked)}
          disabled={!allowed}
          className="h-4 w-4 accent-gray-800"
        />
        Send alert e-mails
      </label>

      <section className="grid grid-cols-2 gap-4">
        <TextField label="SMTP Host" value={form.host} onChange={(e) => set('host', e.target.value)} disabled={!allowed} />
        <TextField label="SMTP Port" value={form.port} onChange={(e) => set('port', e.target.value)} disabled={!allowed} />
        {/* A <div>, not a <label>: a label forwarding its click to the nested button makes Select open and close at once. */}
        <div>
          <span className="block type-label-1 text-gray-800">Security</span>
          <div className="mt-1">
            <Select<Security>
              ariaLabel="Security"
              value={form.security}
              onChange={(v) => setForm((f) => ({ ...f, security: v, port: f.port === DEFAULT_PORT[f.security] ? DEFAULT_PORT[v] : f.port }))}
              options={[
                { value: 'starttls', label: 'STARTTLS (587)' },
                { value: 'ssl', label: 'SSL / TLS (465)' },
                { value: 'none', label: 'None (25)' },
              ]}
              disabled={!allowed}
            />
          </div>
        </div>
        <TextField label="Username" value={form.user} onChange={(e) => set('user', e.target.value)} disabled={!allowed} />
        <TextField
          label="Password"
          type="password"
          value={form.password}
          placeholder={form.password === DB_PASSWORD_MASK ? '' : 'App password'}
          onFocus={() => {
            if (form.password === DB_PASSWORD_MASK && !editingPw.current) { editingPw.current = true; set('password', ''); }
          }}
          onChange={(e) => { editingPw.current = true; set('password', e.target.value); }}
          disabled={!allowed}
        />
        <TextField label="From Name" value={form.fromName} onChange={(e) => set('fromName', e.target.value)} disabled={!allowed} />
        <TextField label="From E-mail" value={form.fromEmail} onChange={(e) => set('fromEmail', e.target.value)} disabled={!allowed} />
      </section>

      <div className="flex items-center gap-2">
        <Button variant="primary" disabled={!allowed || !dirty || busy} loading={busy} onClick={save}>Save Changes</Button>
        <Button variant="secondary" disabled={!allowed || !dirty || busy} onClick={reset}>Reset</Button>
      </div>

      {!allowed && <p className="type-body-2 text-gray-500">Administrator access is needed to change e-mail settings.</p>}
      {error && <p role="alert" className="type-body-2 text-brand-red">{error}</p>}
      {status && <p role="status" className="type-body-2 text-dose-optimal">{status}</p>}
    </div>
  );
}
