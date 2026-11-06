import { useState } from 'react';
import { Modal } from '@/components/ui';
import { authApi } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/api';

export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!user) return null;

  const reset = () => {
    setCurrent(''); setNext(''); setConfirm('');
    setError(null); setSuccess(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (next.length < 4) { setError('New password must be at least 4 characters.'); return; }
    if (next !== confirm) { setError('New password and confirmation do not match.'); return; }
    setBusy(true);
    try {
      await authApi.changePassword({ currentPassword: current, newPassword: next });
      setSuccess('Password changed.');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Profile">
      <div className="space-y-5">
        {/* User info */}
        <section>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#c9d94a] type-body-1 font-semibold text-gray-800">
              {user.initials}
            </span>
            <div>
              <div className="type-body-1 text-gray-800">{user.name}</div>
              <div className="type-label-2 text-gray-500">{user.userId} · {user.role}</div>
            </div>
          </div>
        </section>

        {/* Reset password */}
        <section>
          <h3 className="type-title-3 text-gray-800">Reset Password</h3>
          <form className="mt-3 space-y-3" onSubmit={submit}>
            <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
            <PasswordField label="New password"     value={next}    onChange={setNext}    autoComplete="new-password" />
            <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            {error && <div className="type-label-2 text-brand-red">{error}</div>}
            {success && <div className="type-label-2 text-emerald-600">{success}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { reset(); onClose(); }}
                className="rounded-lg border border-gray-300 px-4 py-2 type-body-2 text-gray-800 hover:bg-gray-100">
                Close
              </button>
              <button type="submit" disabled={busy}
                className="rounded-lg bg-gray-800 px-4 py-2 type-body-2 text-white hover:bg-black disabled:opacity-50">
                {busy ? 'Saving…' : 'Update password'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </Modal>
  );
}

function PasswordField({ label, value, onChange, autoComplete }:
  { label: string; value: string; onChange: (v: string) => void; autoComplete?: string }) {
  return (
    <label className="block">
      <span className="block type-label-1 text-gray-800">{label}</span>
      <input
        type="password"
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-800 focus:border-gray-800 focus:outline-none"
      />
    </label>
  );
}
