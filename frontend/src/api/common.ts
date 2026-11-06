import { api } from './client';
import { endpoints } from './endpoints';
import type { AuditEntry, Branding, LiveAlert, ShiftDef, ShiftInfo } from './types';

/** Shared by the header, navigation and every page */
export const commonApi = {
  shift: () => api.get<ShiftInfo>(endpoints.shift),
  shifts: () => api.get<ShiftDef[]>(endpoints.shifts),
  addShift: (b: Omit<ShiftDef, 'id'>) => api.post<ShiftDef[]>(endpoints.shifts, b),
  deleteShift: (id: string) => api.delete<ShiftDef[]>(`${endpoints.shifts}/${encodeURIComponent(id)}`),
  branding: () => api.get<Branding>(endpoints.branding),
  liveAlerts: () => api.get<LiveAlert[]>(endpoints.alerts.live),
  acknowledgeLiveAlert: (id: string) => api.post<LiveAlert>(endpoints.alerts.acknowledge(id)),
  auditLog: () => api.get<AuditEntry[]>(endpoints.auditLog),
};
