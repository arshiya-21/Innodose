import { api } from './client';
import { endpoints } from './endpoints';
import type { ApplySettingsRequest, ControlPanelState, ManualOpKey } from './types';

/** Control Panel page */
export const controlPanelApi = {
  state: (machineId: string) => api.get<ControlPanelState>(endpoints.controlPanel.state(machineId)),
  /** Send operating mode + machine parameters (after the operator confirms) */
  apply: (machineId: string, body: ApplySettingsRequest) =>
    api.post<ControlPanelState>(endpoints.controlPanel.apply(machineId), body),
  /** Open/Close a chamber or Start/Stop a motor (Manual Mode only) */
  manualOperation: (machineId: string, key: ManualOpKey, action: 'start' | 'stop') =>
    api.post<ControlPanelState>(endpoints.controlPanel.manualOp(machineId, key), { action }),
};
