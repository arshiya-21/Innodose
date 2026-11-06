import { useEffect, useRef, useState } from 'react';
import { Button, TextField } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { administrationApi, DB_PASSWORD_MASK } from '@/api/administration';
import { ApiError } from '@/api';

/**
 * Email alerts — just an e-mail address and its app password.
 *  - Test  : logs in for real and sends a test mail to that address (nothing is saved).
 *  - Save  : logs in for real; only if that works is it saved and alert e-mails switched on.
 * While this is not connected, no alert e-mails are sent (the Alerts page tells the admin to set it up here).
 */
export function EmailPanel() {
  const { can } = useAuth();
  const allowed = can('editConfiguration');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const editingPw = useRef(false);

  useEffect(() => {
    administrationApi
      .getEmailSettings()
      .then((d) => {
        setEmail(d.user);
        setSavedEmail(d.user);
        setPassword(d.password);
        setConnected(!!d.connected);
        editingPw.current = false;
      })
      .catch(() => undefined);
  }, []);

  const ready = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && password.length > 0;
  const changed = email.trim() !== savedEmail || password !== DB_PASSWORD_MASK;

  async function test() {
    setBusy('test'); setMsg(null);
    try {
      const r = await administrationApi.testEmail({ email: email.trim(), password });
      setMsg({ ok: r.ok, text: r.message });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Test failed.' });
    } finally { setBusy(null); }
  }

  async function save() {
    setBusy('save'); setMsg(null);
    try {
      const d = await administrationApi.saveSimpleEmail({ email: email.trim(), password });
      setSavedEmail(d.user); setEmail(d.user); setPassword(d.password); setConnected(!!d.connected);
      editingPw.current = false;
      setMsg({ ok: true, text: 'Connected and saved. Alert e-mails will now be sent from this account.' });
    } catch (e) {
      setConnected(false);
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not save.' });
    } finally { setBusy(null); }
  }

  return (
    <section className="space-y-4 border-t border-gray-200 pt-6">
      <div className="flex items-center gap-3">
        <h2 className="type-headline-1 text-gray-800">Email Alerts</h2>
        <span className={connected ? 'rounded-circle bg-[#e8f7ee] px-3 py-0.5 type-label-2 text-dose-optimal' : 'rounded-circle bg-gray-200 px-3 py-0.5 type-label-2 text-gray-600'}>
          {connected ? `Connected · ${savedEmail}` : 'Not connected'}
        </span>
      </div>
      <p className="type-body-2 text-gray-600">
        Alert e-mails are sent from this account to the people chosen in the Alerts tab. Enter the e-mail address and its
        App Password, press Test, then Save. Until it is connected, no alert e-mails are sent.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alerts@yourcompany.com" disabled={!allowed} />
        <TextField
          label="App Password"
          type="password"
          value={password}
          placeholder="16-character app password"
          onFocus={() => {
            if (password === DB_PASSWORD_MASK && !editingPw.current) { editingPw.current = true; setPassword(''); }
          }}
          onChange={(e) => { editingPw.current = true; setPassword(e.target.value); }}
          disabled={!allowed}
        />
      </div>

      <details className="rounded-sm bg-gray-100 px-4 py-3 type-body-2 text-gray-700">
        <summary className="cursor-pointer font-semibold text-gray-800">Where do I get an App Password, and how?</summary>
        <div className="mt-3 space-y-3">
          <p>An App Password is a separate 16-letter password a mail account creates just for an app like Inodose. Your normal e-mail password will not work.</p>
          <div>
            <p className="font-semibold text-gray-800">Gmail / Google Workspace</p>
            <ol className="ml-5 list-decimal space-y-1">
              <li>Sign in to the Gmail account and turn on <b>2-Step Verification</b> (myaccount.google.com → Security). App passwords need it.</li>
              <li>Open <b>myaccount.google.com/apppasswords</b>, type a name such as “Inodose” and press <b>Create</b>.</li>
              <li>Copy the 16-letter password shown (spaces don’t matter) and paste it above.</li>
            </ol>
          </div>
          <div>
            <p className="font-semibold text-gray-800">Outlook / Microsoft 365</p>
            <ol className="ml-5 list-decimal space-y-1">
              <li>Turn on two-step verification (account.microsoft.com → Security → Advanced security options).</li>
              <li>In the same place choose <b>Create a new app password</b>, then copy it above.</li>
            </ol>
          </div>
          <p>Other providers: use an app-specific password from the mail provider’s security page.</p>
        </div>
      </details>

      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={!allowed || !ready || busy !== null} loading={busy === 'test'} onClick={test}>Test</Button>
        <Button variant="primary" disabled={!allowed || !ready || !changed || busy !== null} loading={busy === 'save'} onClick={save}>Save</Button>
      </div>

      {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'type-body-2 text-dose-optimal' : 'type-body-2 text-brand-red'}>{msg.text}</p>}
      {!allowed && <p className="type-body-2 text-gray-500">Administrator access is needed to change e-mail settings.</p>}
    </section>
  );
}
