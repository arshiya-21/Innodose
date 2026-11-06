import { api } from './client';
import { endpoints } from './endpoints';
import type { AlertConfig, AlertSource, Branding, Component, ComponentInput, Inoculant, InoculantInput, InoculantType, Machine, MachineInput } from './types';

/** Configurations page (Components, Alerts, Machines, Administration tabs) */
export const configurationsApi = {
  components: () => api.get<Component[]>(endpoints.components.list),
  createComponent: (body: ComponentInput) => api.post<Component>(endpoints.components.list, body),
  updateComponent: (id: string, body: ComponentInput) => api.put<Component>(endpoints.components.one(id), body),
  deleteComponents: (ids: string[]) => api.delete<void>(endpoints.components.list, { ids }),

  alertConfigs: () => api.get<AlertConfig[]>(endpoints.alertConfigs),
  saveAlertConfigs: (items: AlertConfig[]) => api.put<AlertConfig[]>(endpoints.alertConfigs, items),

  /** Table + column the alert calculation reads the dosed amount from */
  alertSource: () => api.get<AlertSource>(endpoints.alertSource),
  saveAlertSource: (body: { table: string; column: string }) => api.put<{ table: string; column: string }>(endpoints.alertSource, body),

  inoculantTypes: () => api.get<InoculantType[]>(endpoints.inoculantTypes),
  createInoculantType: (name: string) => api.post<InoculantType>(endpoints.inoculantTypes, { name }),
  inoculants: () => api.get<Inoculant[]>(endpoints.inoculants.list),
  createInoculant: (body: InoculantInput) => api.post<Inoculant>(endpoints.inoculants.list, body),
  updateInoculant: (id: string, body: InoculantInput) => api.put<Inoculant>(endpoints.inoculants.one(id), body),
  deleteInoculants: (ids: string[]) => api.delete<void>(endpoints.inoculants.list, { ids }),

  machines: () => api.get<Machine[]>(endpoints.machines.list),
  createMachine: (body: MachineInput) => api.post<Machine>(endpoints.machines.list, body),
  updateMachine: (id: string, body: MachineInput) => api.put<Machine>(endpoints.machines.one(id), body),
  deleteMachines: (ids: string[]) => api.delete<void>(endpoints.machines.list, { ids }),

  branding: () => api.get<Branding>(endpoints.branding),
  /** logoUrl must be a PNG/JPG/SVG data URL, max 1 MB */
  saveBranding: (body: Branding) => api.put<Branding>(endpoints.branding, body),
  resetBranding: () => api.delete<Branding>(endpoints.branding),
};
