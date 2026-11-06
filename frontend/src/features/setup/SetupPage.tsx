import { useState, type FormEvent } from 'react';
import { config } from '@/config';
import { Button } from '@/components/ui';
import logoMark from '@/assets/images/inodose-logo-mark.png';

/**
 * First-run page: shown only while the server has no database details yet (see backend/src/setup.ts).
 * The server tests the connection, saves it to its .env file and then starts the application.
 */
type Msg = { kind: 'ok' | 'error'; text: string } | null;

async function post(action: 'test' | 'save', body: unknown): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(`${config.apiBaseUrl}/setup/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, message: data.message ?? `Request failed (${res.status})` };
  } catch {
    return { ok: false, message: 'Could not reach the server.' };
  }
}

const field = 'mt-1 h-10 w-full rounded-sm border border-gray-300 bg-white px-3 type-body-1 text-gray-800 focus:border-gray-800 focus:outline-none';

export function SetupPage() {
  const [f, setF] = useState({ host: 'localhost', port: '3306', user: '', password: '', database: 'inodose' });
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function run(action: 'test' | 'save', e?: FormEvent) {
    e?.preventDefault();
    setMsg(null);
    setBusy(action);
    const r = await post(action, f);
    if (!r.ok) { setBusy(null); return setMsg({ kind: 'error', text: r.message ?? 'Failed.' }); }
    if (action === 'test') { setBusy(null); return setMsg({ kind: 'ok', text: 'Connection successful. Press "Save and start" to continue.' }); }
    setMsg({ kind: 'ok', text: 'Saved. Starting the application…' });
    // Wait until the real application answers (the setup server hands over to it), then go to the login page.
    for (let i = 0; i < 60; i++) {
      await new Promise((r2) => setTimeout(r2, 1500));
      try {
        const s = await (await fetch(`${config.apiBaseUrl}/setup/status`)).json();
        if (s.setupRequired === false) { window.location.hash = '#/login'; window.location.reload(); return; }
      } catch { /* still restarting */ }
    }
    setBusy(null);
    setMsg({ kind: 'error', text: 'The application did not come up. Check the service log on the server.' });
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-gray-100 px-4 py-10">
      <img src={logoMark} alt="Inodose" className="h-20 w-auto object-contain" />
      <form onSubmit={(e) => run('save', e)} className="mt-6 w-full max-w-[520px] rounded-lg bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.10)]">
        <h1 className="type-headline-1 text-gray-800">First-time setup</h1>
        <p className="mt-1 type-body-2 text-gray-600">Enter the MySQL database this installation should use. The database is created if it does not exist and the user is allowed to create it.</p>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <label className="col-span-2 type-label-2 text-gray-600">Database host<input className={field} value={f.host} onChange={set('host')} autoFocus /></label>
          <label className="type-label-2 text-gray-600">Port<input className={field} value={f.port} onChange={set('port')} inputMode="numeric" /></label>
          <label className="col-span-3 type-label-2 text-gray-600">Database name<input className={field} value={f.database} onChange={set('database')} /></label>
          <label className="col-span-3 type-label-2 text-gray-600">User<input className={field} value={f.user} onChange={set('user')} autoComplete="off" /></label>
          <label className="col-span-3 type-label-2 text-gray-600">Password<input className={field} type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></label>
        </div>

        {msg && <p role="status" className={`mt-4 type-body-2 ${msg.kind === 'ok' ? 'text-green-700' : 'text-brand-red'}`}>{msg.text}</p>}

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" loading={busy === 'test'} disabled={busy !== null} onClick={() => run('test')}>Test connection</Button>
          <Button type="submit" loading={busy === 'save'} disabled={busy !== null}>Save and start</Button>
        </div>
      </form>
    </div>
  );
}
