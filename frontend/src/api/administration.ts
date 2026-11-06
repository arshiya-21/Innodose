/**
 * Administration API: users, roles, and the per-role permission matrix.
 * Paths are relative to VITE_API_BASE_URL (/api/v1).
 */
import { api } from './client';

export type NavKey =
  | 'live-dashboard' | 'control-panel' | 'past-records'
  | 'configurations' | 'administration';
export type ControlMode = 'manual' | 'auto' | 'joystick';
export type ActionKey = 'add' | 'edit' | 'view' | 'delete';

export interface Permissions {
  nav: Record<NavKey, Record<ActionKey, boolean>>;
  controlModes: Record<ControlMode, Record<ActionKey, boolean>>;
}

export interface AdminRole {
  id: string;
  name: string;
  description?: string;
  permissions: Permissions;
}

export interface AdminUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  roleId: string;
  active: boolean;
}

export type NewAdminUser = Omit<AdminUser, 'id'> & { password: string };

export const NAV_ITEMS: { key: NavKey; label: string }[] = [
  { key: 'live-dashboard', label: 'Live Dashboard' },
  { key: 'control-panel',  label: 'Control Panel'  },
  { key: 'past-records',   label: 'Past Records'   },
  { key: 'configurations', label: 'Configurations' },
  { key: 'administration', label: 'Administration' },
];
export const CONTROL_MODES: { key: ControlMode; label: string }[] = [
  { key: 'manual',   label: 'Manual' },
  { key: 'auto',     label: 'Auto' },
  { key: 'joystick', label: 'Joystick' },
];
export const ACTIONS: { key: ActionKey; letter: string; label: string }[] = [
  { key: 'add',    letter: 'C', label: 'Create' },
  { key: 'edit',   letter: 'E', label: 'Edit'   },
  { key: 'view',   letter: 'V', label: 'View'   },
  { key: 'delete', letter: 'D', label: 'Delete' },
];

export function emptyPermissions(initial = false): Permissions {
  const row = () => ACTIONS.reduce((o, a) => ({ ...o, [a.key]: initial }), {} as Record<ActionKey, boolean>);
  return {
    nav: NAV_ITEMS.reduce((o, n) => ({ ...o, [n.key]: row() }), {} as Permissions['nav']),
    controlModes: CONTROL_MODES.reduce((o, m) => ({ ...o, [m.key]: row() }), {} as Permissions['controlModes']),
  };
}

export interface DbDetails {
  type: 'mysql' | 'postgres';
  host: string;
  port: string;
  user: string;
  /** Empty if no password is stored, otherwise the masked placeholder '•••••' */
  password: string;
  database: string;
  useSshTunnel: boolean;
  ssh: { host: string; port: string; user: string; privateKeyPath: string };
}

/** Allen-Bradley SLC tag per manual operation: write openValue to openTag to Open/Start, closeValue to closeTag to Close/Stop. */
export type PlcDataType = 'boolean' | 'integer' | 'float';
export interface PlcTag { key: string; label: string; /** how values are written; boolean by default */ dataType: PlcDataType; openTag: string; openValue: number; closeTag: string; closeValue: number }
export interface PlcConfig { ip: string; tags: PlcTag[] }

export interface EmailSettings {
  enabled: boolean;
  host: string;
  port: string;
  security: 'starttls' | 'ssl' | 'none';
  user: string;
  /** Empty if none stored, otherwise the masked placeholder '•••••' */
  password: string;
  fromName: string;
  fromEmail: string;
  /** a real login succeeded with the saved account: alert e-mails are being sent */
  connected?: boolean;
}

export const DB_PASSWORD_MASK = '•••••';

export const administrationApi = {
  listUsers: () => api.get<AdminUser[]>('/admin/users'),
  createUser: (body: NewAdminUser) => api.post<AdminUser>('/admin/users', body),
  updateUser: (id: string, body: Partial<AdminUser> & { password?: string }) =>
    api.put<AdminUser>(`/admin/users/${id}`, body),
  deleteUser: (id: string) => api.delete<void>(`/admin/users/${id}`),

  listRoles: () => api.get<AdminRole[]>('/admin/roles'),
  createRole: (body: { name: string; description?: string; permissions: Permissions }) =>
    api.post<AdminRole>('/admin/roles', body),
  updateRole: (id: string, body: { name?: string; description?: string }) =>
    api.put<AdminRole>(`/admin/roles/${id}`, body),
  updatePermissions: (roleId: string, p: Permissions) =>
    api.put<AdminRole>(`/admin/roles/${roleId}/permissions`, p),
  deleteRole: (id: string) => api.delete<void>(`/admin/roles/${id}`),

  getDbDetails: () => api.get<DbDetails>('/administration/db-details'),
  saveDbDetails: (body: DbDetails) => api.put<DbDetails>('/administration/db-details', body),

  /** Simple setup: just e-mail + app password. The server logs in for real before saving. */
  saveSimpleEmail: (body: { email: string; password: string }) => api.put<EmailSettings>('/administration/email-settings/simple', body),
  testEmail: (body: { email: string; password: string }) => api.post<{ ok: boolean; message: string }>('/administration/email-settings/test', body),
  emailStatus: () => api.get<{ connected: boolean; email: string }>('/email-status'),
  getEmailSettings: () => api.get<EmailSettings>('/administration/email-settings'),
  saveEmailSettings: (body: EmailSettings) => api.put<EmailSettings>('/administration/email-settings', body),

  getPlcConfig: () => api.get<PlcConfig>('/administration/plc-config'),
  savePlcConfig: (body: PlcConfig) => api.put<PlcConfig>('/administration/plc-config', body),
  testPlcWrite: (body: { ip: string; tag: string; value: number; dataType: PlcDataType }) =>
    api.post<{ ok: boolean; message: string }>('/administration/plc-config/test', body),
};
