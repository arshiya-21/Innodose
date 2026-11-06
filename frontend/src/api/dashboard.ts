import { api } from './client';
import { endpoints } from './endpoints';
import type { AcrossMoldsSeries, BoxDetail, CumulativeSeries, DashboardSnapshot } from './types';

/** Live Dashboard page */
export const dashboardApi = {
  /** Production summary, inoculation status, flow diagram, today's boxes */
  snapshot: (machineId: string) => api.get<DashboardSnapshot>(endpoints.dashboard.snapshot, { query: { machineId } }),
  /** "Cumulative Dosage Within Mold" chart for the box being dosed */
  cumulative: (machineId: string) => api.get<CumulativeSeries>(endpoints.dashboard.cumulative, { query: { machineId } }),
  /** "Dosage Across Molds (Today)" chart for one component */
  acrossMolds: (machineId: string, component: string) =>
    api.get<AcrossMoldsSeries>(endpoints.dashboard.acrossMolds, { query: { machineId, component } }),
  /** Box-detail pop-up (click a box in Today's Dosage History) */
  box: (machineId: string, boxId: string) => api.get<BoxDetail>(endpoints.dashboard.box(boxId), { query: { machineId } }),
};
