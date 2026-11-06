import { randomUUID, createHash } from 'node:crypto';
import {
  type AdminStore, type CompanyInfo, type Permissions, type Role, type User,
  NAV, MODES, perms,
} from './types.ts';

const hashPw = (pw: string) => createHash('sha256').update(pw).digest('hex');

export function makeMemoryStore(): AdminStore {
  const roles = new Map<string, Role>();
  const users = new Map<string, User>();
  const passwords = new Map<string, string>();
  const sessions = new Map<string, string>();

  const adminRole: Role  = { id: randomUUID(), name: 'Administrator', description: 'Full access', permissions: perms(true) };
  const operatorRole: Role = { id: randomUUID(), name: 'Operator', description: 'View + control', permissions: perms(false) };
  const viewerRole: Role = { id: randomUUID(), name: 'Viewer', description: 'Read-only', permissions: perms(false) };
  NAV.forEach(k => { operatorRole.permissions.nav[k].view = true; });
  MODES.forEach(m => { operatorRole.permissions.controlModes[m].view = true; operatorRole.permissions.controlModes[m].edit = true; });
  operatorRole.permissions.nav.administration.view = false;
  NAV.forEach(k => { viewerRole.permissions.nav[k].view = k !== 'administration'; });
  MODES.forEach(m => { viewerRole.permissions.controlModes[m].view = true; });

  [adminRole, operatorRole, viewerRole].forEach(r => roles.set(r.id, r));

  const admin: User = {
    id: randomUUID(), username: 'admin', fullName: 'Plant Administrator',
    email: 'admin@example.com', roleId: adminRole.id, active: true,
  };
  users.set(admin.id, admin);
  passwords.set(admin.id, hashPw('admin'));

  let company: CompanyInfo = {
    name: 'Gujarat Metal Cast', address: '', phone: '', email: '', gstin: '', logoDataUrl: '',
  };

  return {
    async verifyLogin(username, password) {
      const u = [...users.values()].find(x => x.username === username && x.active);
      if (!u) return null;
      return passwords.get(u.id) === hashPw(password) ? u : null;
    },
    async createSession(userId) { const t = randomUUID(); sessions.set(t, userId); return t; },
    async endSession(token) { sessions.delete(token); },
    async userFromSession(token) {
      if (!token) return null;
      const id = sessions.get(token);
      return id ? users.get(id) ?? null : null;
    },
    async getRole(id) { return roles.get(id) ?? null; },

    async getCompany() { return { ...company }; },
    async setCompany(next) { company = { ...company, ...next }; return company; },

    async listRoles() { return [...roles.values()]; },
    async addRole(r) {
      const role: Role = { ...r, id: randomUUID(), permissions: r.permissions ?? perms(false) };
      roles.set(role.id, role); return role;
    },
    async updateRole(id, patch) {
      const r = roles.get(id); if (!r) return null;
      const next = { ...r, ...patch }; roles.set(id, next); return next;
    },
    async updateRolePermissions(id, p: Permissions) {
      const r = roles.get(id); if (!r) return null;
      const next = { ...r, permissions: p }; roles.set(id, next); return next;
    },
    async deleteRole(id) {
      const inUse = [...users.values()].some(u => u.roleId === id);
      if (inUse) return { ok: false, error: 'Role is assigned to one or more users.' };
      roles.delete(id); return { ok: true };
    },

    async listUsers() { return [...users.values()]; },
    async addUser(u) {
      if ([...users.values()].some(x => x.username === u.username)) throw new Error('Username already exists');
      if (!roles.has(u.roleId)) throw new Error('Unknown role');
      const { password, ...rest } = u;
      const user: User = { ...rest, id: randomUUID() };
      users.set(user.id, user); passwords.set(user.id, hashPw(password));
      return user;
    },
    async updateUser(id, patch) {
      const u = users.get(id); if (!u) return null;
      const { password, ...rest } = patch;
      const next = { ...u, ...rest }; users.set(id, next);
      if (password) passwords.set(id, hashPw(password));
      return next;
    },
    async deleteUser(id) {
      users.delete(id); passwords.delete(id);
      for (const [t, uid] of sessions) if (uid === id) sessions.delete(t);
    },
  };
}
