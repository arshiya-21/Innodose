import type { ActionKey, ControlMode, NavKey, Permissions } from '@/api/administration';
import type { Role } from '@/api/types';

const RANK: Record<Role, number> = { Operator: 1, Supervisor: 2, Administrator: 3 };

/**
 * What each role may do in the UI. The backend enforces the same rules (403 otherwise);
 * the UI uses them to disable controls and explain why.
 */
export const PERMISSIONS = {
  viewAll: 'Operator',
  acknowledgeAlerts: 'Operator',
  operateMachine: 'Supervisor', // apply mode/parameters, manual operations
  editConfiguration: 'Supervisor', // components, alert settings, machines
  viewAuditLog: 'Supervisor',
  editBranding: 'Administrator',
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role | undefined, p: Permission) {
  return !!role && RANK[role] >= RANK[PERMISSIONS[p]];
}

/**
 * Page / control-mode access from the role's permission matrix. Without a matrix
 * (older backend) viewing is allowed and editing falls back to the role rank.
 */
export function canAccess(p: Permissions | undefined, role: Role | undefined, nav: NavKey, action: ActionKey = 'view', mode?: ControlMode) {
  if (!p) return action === 'view' ? !!role : hasPermission(role, 'operateMachine');
  return !!p.nav?.[nav]?.[action] && (!mode || !!p.controlModes?.[mode]?.[action]);
}
