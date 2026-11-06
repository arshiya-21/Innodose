/**
 * Every REST endpoint the frontend calls, in one place.
 * Paths are relative to VITE_API_BASE_URL (default /api/v1). Documented in docs/API.md.
 */
export const endpoints = {
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
    me: '/auth/me',
    changePassword: '/auth/password',
  },
  shift: '/shift',
  shifts: '/shifts',
  branding: '/branding',
  auditLog: '/audit-log',
  alerts: {
    live: '/alerts/live',
    acknowledge: (id: string) => `/alerts/live/${encodeURIComponent(id)}/acknowledge`,
  },
  dashboard: {
    snapshot: '/dashboard',
    cumulative: '/dashboard/cumulative',
    acrossMolds: '/dashboard/across-molds',
    box: (boxId: string) => `/dashboard/boxes/${encodeURIComponent(boxId)}`,
  },
  controlPanel: {
    state: (machineId: string) => `/machines/${encodeURIComponent(machineId)}/control-panel`,
    apply: (machineId: string) => `/machines/${encodeURIComponent(machineId)}/settings`,
    manualOp: (machineId: string, key: string) =>
      `/machines/${encodeURIComponent(machineId)}/manual-operations/${encodeURIComponent(key)}`,
  },
  records: {
    dosage: '/records/dosage',
    doses: (date: string, componentName: string) =>
      `/records/dosage/${encodeURIComponent(date)}/components/${encodeURIComponent(componentName)}/doses`,
    doseSeries: (doseId: number) => `/records/doses/${doseId}/series`,
    acrossMolds: '/records/across-molds',
    alerts: '/records/alerts',
    acknowledgeAlert: (id: string) => `/records/alerts/${encodeURIComponent(id)}/acknowledge`,
  },
  components: {
    list: '/components',
    one: (id: string) => `/components/${encodeURIComponent(id)}`,
  },
  machines: {
    list: '/machines',
    one: (id: string) => `/machines/${encodeURIComponent(id)}`,
  },
  inoculantTypes: '/inoculant-types',
  inoculants: {
    list: '/inoculants',
    one: (id: string) => `/inoculants/${encodeURIComponent(id)}`,
  },
  alertConfigs: '/alert-configs',
  alertSource: '/alert-source',
} as const;
