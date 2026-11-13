export type Action = 'view' | 'add' | 'edit' | 'delete';
export type NavKey =
  | 'live-dashboard' | 'control-panel' | 'past-records'
  | 'configurations' | 'administration';
export type ControlMode = 'manual' | 'auto' | 'joystick';

export interface Permissions {
  nav: Record<NavKey, Record<Action, boolean>>;
  controlModes: Record<ControlMode, Record<Action, boolean>>;
}
export interface Role {
  id: string; name: string; description?: string;
  permissions: Permissions;
}
export interface User {
  id: string; username: string; fullName: string; email: string;
  roleId: string; active: boolean;
}
export interface CompanyInfo {
  name: string; address: string; phone: string; email: string;
  gstin?: string; logoDataUrl?: string;
}

/** Administrator account created on a fresh install (and restored by tools/reset-admin.mjs). Change the password after first login. */
export const DEFAULT_ADMIN = { username: 'inodose', password: 'inodose@2026' } as const;

export const NAV: NavKey[] =['live-dashboard', 'control-panel', 'past-records', 'configurations', 'administration'];
export const MODES: ControlMode[] = ['manual', 'auto', 'joystick'];
export const ACTIONS: Action[] = ['view', 'add', 'edit', 'delete'];

export function perms(all: boolean): Permissions {
  const row = () => ACTIONS.reduce((o, a) => ({ ...o, [a]: all }), {} as Record<Action, boolean>);
  return {
    nav: NAV.reduce((o, k) => ({ ...o, [k]: row() }), {} as Permissions['nav']),
    controlModes: MODES.reduce((o, k) => ({ ...o, [k]: row() }), {} as Permissions['controlModes']),
  };
}

export interface AdminStore {
  // auth
  verifyLogin(username: string, password: string): Promise<User | null>;
  /** hours: how long the session lasts (default = the store's normal session length) */
  createSession(userId: string, hours?: number): Promise<string>;
  endSession(token: string): Promise<void>;
  userFromSession(token: string | undefined): Promise<User | null>;
  getRole(id: string): Promise<Role | null>;
  // company
  getCompany(): Promise<CompanyInfo>;
  setCompany(next: CompanyInfo): Promise<CompanyInfo>;
  // roles
  listRoles(): Promise<Role[]>;
  addRole(r: Omit<Role, 'id'>): Promise<Role>;
  updateRole(id: string, patch: Partial<Omit<Role, 'id' | 'permissions'>>): Promise<Role | null>;
  updateRolePermissions(id: string, p: Permissions): Promise<Role | null>;
  deleteRole(id: string): Promise<{ ok: true } | { ok: false; error: string }>;
  // users
  listUsers(): Promise<User[]>;
  addUser(u: Omit<User, 'id'> & { password: string }): Promise<User>;
  updateUser(id: string, patch: Partial<Omit<User, 'id'>> & { password?: string }): Promise<User | null>;
  deleteUser(id: string): Promise<void>;
}
