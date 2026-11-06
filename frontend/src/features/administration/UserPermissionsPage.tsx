import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  administrationApi,
  ACTIONS, CONTROL_MODES, NAV_ITEMS, emptyPermissions,
  type ActionKey, type AdminRole, type AdminUser, type ControlMode,
  type NavKey, type Permissions,
} from '@/api/administration';
import { ApiError } from '@/api';

export function UserPermissionsPage() {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [draft, setDraft] = useState<Permissions>(() => emptyPermissions(false));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);
  async function load() {
    if (!userId) return;
    setLoading(true); setError(null);
    try {
      const [users, roles] = await Promise.all([administrationApi.listUsers(), administrationApi.listRoles()]);
      const u = users.find(x => x.id === userId) ?? null;
      const r = u ? roles.find(x => x.id === u.roleId) ?? null : null;
      setUser(u); setRole(r);
      setDraft(ensure(r?.permissions));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load.');
    } finally { setLoading(false); }
  }

  function ensure(p?: Permissions): Permissions {
    const base = emptyPermissions(false);
    if (!p) return base;
    return {
      nav: { ...base.nav, ...p.nav },
      controlModes: { ...base.controlModes, ...p.controlModes },
    };
  }

  const dirty = useMemo(() =>
    JSON.stringify(role?.permissions) !== JSON.stringify(draft),
    [role, draft],
  );

  async function save() {
    if (!role) return;
    setSaving(true); setError(null);
    try {
      await administrationApi.updatePermissions(role.id, draft);
      await load();
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
    } finally { setSaving(false); }
  }

  const toggleNav = (nav: NavKey, a: ActionKey) =>
    setDraft(d => ({ ...d, nav: { ...d.nav, [nav]: { ...d.nav[nav], [a]: !d.nav[nav][a] } } }));
  const toggleMode = (m: ControlMode, a: ActionKey) =>
    setDraft(d => ({ ...d, controlModes: { ...d.controlModes, [m]: { ...d.controlModes[m], [a]: !d.controlModes[m][a] } } }));
  const toggleRow = (type: 'nav' | 'mode', key: string, on: boolean) => {
    const row = ACTIONS.reduce((o, a) => ({ ...o, [a.key]: on }), {} as Record<ActionKey, boolean>);
    if (type === 'nav') setDraft(d => ({ ...d, nav: { ...d.nav, [key]: row } }));
    else setDraft(d => ({ ...d, controlModes: { ...d.controlModes, [key]: row } }));
  };

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (!user) return <div className="p-6 text-brand-red">User not found.</div>;

  type Row = { key: string; label: string; indent: number; kind: 'nav' | 'mode' };
  const rows = NAV_ITEMS.flatMap<Row>(n =>
    n.key === 'control-panel'
      ? [
          { key: n.key, label: n.label, indent: 0, kind: 'nav' as const },
          ...CONTROL_MODES.map(m => ({ key: m.key, label: m.label, indent: 1, kind: 'mode' as const })),
        ]
      : [{ key: n.key, label: n.label, indent: 0, kind: 'nav' as const }],
  );

  return (
    <div className="flex flex-col gap-4 px-6 py-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/administration/users')}
          className="rounded-lg border border-gray-300 px-3 py-1.5 type-body-2 hover:bg-gray-100"
        >
          ← Back
        </button>
        <div className="flex-1">
          <h2 className="type-title-2 text-gray-800">Permissions · {user.fullName}</h2>
          <p className="type-label-2 text-gray-500">
            Role: {role?.name ?? '—'} · changes apply to everyone with this role
          </p>
        </div>
        {savedAt && <span className="type-label-2 text-gray-500">Saved {savedAt}</span>}
        <button
          onClick={save}
          disabled={!role || !dirty || saving}
          className="rounded-lg bg-gray-800 px-4 py-2 type-body-2 font-semibold text-white hover:bg-black disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && <div className="type-label-2 text-brand-red">{error}</div>}

      {/* Matrix */}
      <div className="overflow-x-auto scroll-thin rounded-lg border border-gray-200">
        <table className="w-full min-w-[640px] type-body-2">
          <thead className="bg-gray-100">
            <tr className="text-left">
              <th className="px-3 py-2 type-label-1 uppercase tracking-wide text-gray-500">Item</th>
              {ACTIONS.map(a => (
                <th
                  key={a.key}
                  className="px-3 py-2 type-label-1 uppercase tracking-wide text-gray-500 text-center w-14"
                  title={a.label}
                >
                  {a.letter}
                </th>
              ))}
              <th className="px-3 py-2 type-label-1 uppercase tracking-wide text-gray-500 text-center">All</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const v = row.kind === 'nav'
                ? draft.nav[row.key as NavKey]
                : draft.controlModes[row.key as ControlMode];
              const allOn = ACTIONS.every(a => v[a.key]);
              return (
                <tr key={`${row.kind}:${row.key}`} className="border-t border-gray-200">
                  <td className="px-3 py-2">
                    <span style={{ paddingLeft: row.indent * 20 }}>
                      {row.indent > 0 ? '↳ ' : ''}{row.label}
                    </span>
                  </td>
                  {ACTIONS.map(a => (
                    <td key={a.key} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!v[a.key]}
                        onChange={() => row.kind === 'nav'
                          ? toggleNav(row.key as NavKey, a.key)
                          : toggleMode(row.key as ControlMode, a.key)}
                        aria-label={`${row.label} ${a.label}`}
                        className="h-4 w-4 accent-gray-800"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => toggleRow(row.kind, row.key, !allOn)}
                      className="text-xs underline text-gray-500"
                    >
                      {allOn ? 'none' : 'all'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="type-label-2 text-gray-500">
        C = Create · E = Edit · V = View · D = Delete
      </div>
    </div>
  );
}
