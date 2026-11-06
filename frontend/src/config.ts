/** Runtime configuration, read from Vite env variables (see .env files). */
export const config = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, ''),
  useMock: String(import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false',
  mockLatencyMs: Number(import.meta.env.VITE_MOCK_LATENCY_MS ?? 250),
  pollIntervalMs: Number(import.meta.env.VITE_POLL_INTERVAL_MS ?? 5000),
  /** The UI is designed on a 1920px artboard and scaled to the window. */
  designWidth: 1920,
} as const;
