import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  administrationApi,
  type AdminRole, type AdminUser, type NewAdminUser,
} from '@/api/administration';
import { ApiError } from '@/api';
import { Button, Modal, TextField } from '@/components/ui';
import { Toolbar } from '@/features/configurations/Toolbar';
import { useAuth } from '@/context/AuthContext';

export function UsersTab() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<NewAdminUser | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [u, r] = await Promise.all([administrationApi.listUsers(), administrationApi.listRoles()]);
      setUsers(u); setRoles(r); setSelected(new Set());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load users.');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? '—';
  const toggleOne = (id: string) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function removeSelected() {
    if (!confirm(`Delete ${selected.size} user${selected.size > 1 ? 's' : ''}?`)) return;
    for (const id of selected) await administrationApi.deleteUser(id);
    await load();
  }
  async function save() {
    try {
      if (editing) await administrationApi.updateUser(editing.id, editing);
      else if (creating) await administrationApi.createUser(creating);
      setEditing(null); setCreating(null); setError(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save user.');
    }
  }

  if (loading && users.length === 0) return <div className="p-6 text-gray-500">Loading…</div>;

  return (
    <div className="flex flex-col gap-3">
      <Toolbar
        selected={selected.size}
        onEdit={() => setEditing({ ...users.find((u) => selected.has(u.id))! })}
        onDelete={() => void removeSelected()}
        onAdd={() => setCreating({ username: '', fullName: '', email: '', roleId: '', active: true, password: '' })}
        addLabel="Add New User"
        disabled={!can('editConfiguration')}
      />

      {error && <div className="type-label-2 text-brand-red">{error}</div>}

      <div className="overflow-x-auto scroll-thin rounded-lg border border-gray-200">
        <table className="w-full min-w-[920px] type-body-2">
          <thead className="bg-gray-100">
            <tr className="text-left">
              <Th>
                <input type="checkbox"
                  checked={users.length > 0 && selected.size === users.length}
                  onChange={e => setSelected(e.target.checked ? new Set(users.map(u => u.id)) : new Set())}
                  className="mr-2" />
                SELECT ALL USERS
              </Th>
              <Th>USERNAME</Th><Th>FULL NAME</Th><Th>EMAIL</Th><Th>ROLE</Th><Th>STATUS</Th>
              <Th className="text-right">PERMISSIONS</Th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-gray-200 hover:bg-gray-50">
                <Td>
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} />
                    Select {u.username}
                  </label>
                </Td>
                <Td className="font-semibold">{u.username}</Td>
                <Td>{u.fullName}</Td>
                <Td>{u.email || '—'}</Td>
                <Td>{roleName(u.roleId)}</Td>
                <Td>
                  <span className={'inline-block px-2 py-0.5 type-label-2 rounded-full ' +
                    (u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                    {u.active ? 'Active' : 'Disabled'}
                  </span>
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <button onClick={() => navigate(`/administration/users/${u.id}/permissions`)}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1 type-label-1 hover:bg-gray-100">
                    Edit permissions →
                  </button>
                </Td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-gray-500">No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <UserModal
          title={`Edit ${editing.username}`} value={editing} roles={roles}
          onChange={v => setEditing(v as AdminUser)}
          onClose={() => { setEditing(null); setError(null); }}
          onSubmit={save} submitLabel="Save"
          error={error}
        />
      )}
      {creating && (
        <UserModal
          title="Add New User" value={creating} roles={roles}
          onChange={setCreating as (v: NewAdminUser) => void}
          onClose={() => { setCreating(null); setError(null); }}
          onSubmit={save} submitLabel="Create"
          error={error} withPassword
        />
      )}
    </div>
  );
}

/* ---------- User create/edit modal ---------- */

function UserModal<T extends { username: string; fullName: string; email: string; roleId: string; active: boolean; password?: string }>({
  title, value, roles, onChange, onClose, onSubmit, submitLabel, withPassword, error, busy,
}: {
  title: string; value: T; roles: AdminRole[];
  onChange: (v: T) => void; onClose: () => void; onSubmit: () => void;
  submitLabel: string; withPassword?: boolean; error: string | null; busy?: boolean;
}) {
  const set = <K extends keyof T>(k: K, v: T[K]) => onChange({ ...value, [k]: v });
  // Role is typed by name; value.roleId holds the matching role id ('' when nothing matches).
  const [roleText, setRoleText] = useState(() => roles.find(r => r.id === value.roleId)?.name ?? '');
  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onSubmit} loading={!!busy}>{submitLabel}</Button>
        </>
      }
    >
      <form onSubmit={e => { e.preventDefault(); onSubmit(); }} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Username"
            autoComplete="off"
            value={value.username}
            onChange={e => set('username', e.target.value as T[keyof T])}
          />
          <TextField
            label="Full name"
            value={value.fullName}
            onChange={e => set('fullName', e.target.value as T[keyof T])}
          />
          <TextField
            label="Email"
            type="email"
            autoComplete="off"
            value={value.email}
            onChange={e => set('email', e.target.value as T[keyof T])}
          />
          <div>
            <TextField
              label="Role"
              value={roleText}
              placeholder="Type the role name"
              onChange={e => {
                const text = e.target.value;
                setRoleText(text);
                const match = roles.find(r => r.name.trim().toLowerCase() === text.trim().toLowerCase());
                set('roleId', (match?.id ?? '') as T[keyof T]);
              }}
            />
            {roleText.trim() && !value.roleId && (
              <p className="mt-1 type-label-2 text-brand-red">No role named “{roleText.trim()}”. Check the spelling.</p>
            )}
          </div>
          {withPassword && (
            <TextField
              label="Password"
              type="password"
              autoComplete="new-password"
              value={value.password ?? ''}
              onChange={e => set('password', e.target.value as T[keyof T])}
            />
          )}
        </div>
        <label className="flex items-center gap-2 type-body-2">
          <input
            type="checkbox"
            checked={value.active}
            onChange={e => set('active', e.target.checked as T[keyof T])}
            className="h-4 w-4 accent-gray-800"
          />
          Active
        </label>
        {error && <div className="type-label-2 text-brand-red">{error}</div>}
      </form>
    </Modal>
  );
}

/* ---------- Primitives ---------- */

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={'px-3 py-2 type-label-1 uppercase tracking-wide text-gray-500 ' + className}>{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={'px-3 py-2 ' + className}>{children}</td>;
}

