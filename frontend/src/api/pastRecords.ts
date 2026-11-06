import { api } from './client';
import { endpoints } from './endpoints';
import type { AcrossMoldsSeries, AlertRecord, DayRecord, DoseRecord, Paged, RecordFilters, TimePoint } from './types';

/** Past Records page (Dosage and Alerts tabs) */
export const pastRecordsApi = {
  dosageDays: (f: RecordFilters) => api.get<Paged<DayRecord>>(endpoints.records.dosage, { query: { ...f } }),
  doses: (date: string, componentName: string, page: number, machineId = 'all') =>
    api.get<Paged<DoseRecord>>(endpoints.records.doses(date, componentName), { query: { page, machineId } }),
  /** Cumulative curve of one dose (dose pop-up) */
  doseSeries: (doseId: number) => api.get<TimePoint[]>(endpoints.records.doseSeries(doseId)),
  /** "View Graph": dosage across molds for a component on a date */
  acrossMolds: (date: string, component: string, machineId: string) =>
    api.get<AcrossMoldsSeries>(endpoints.records.acrossMolds, { query: { date, component, machineId } }),
  alerts: (f: RecordFilters) => api.get<Paged<AlertRecord>>(endpoints.records.alerts, { query: { ...f } }),
  acknowledgeAlert: (id: string) => api.post<AlertRecord>(endpoints.records.acknowledgeAlert(id)),
};
