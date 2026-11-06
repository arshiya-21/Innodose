import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { commonApi } from '@/api';
import type { LiveAlert } from '@/api/types';
import { config } from '@/config';
import { useApi } from '@/hooks/useApi';

interface AlertsValue {
  alerts: LiveAlert[];
  unacknowledged: LiveAlert[];
  /** the alert shown in the header banner (hidden after 60 s, or once acknowledged) */
  headerAlert: LiveAlert | null;
  acknowledge: (id: string) => Promise<void>;
}

const AlertsContext = createContext<AlertsValue | null>(null);
const BANNER_MS = 60_000;

export function AlertsProvider({ children }: { children: ReactNode }) {
  const { data, setData } = useApi(() => commonApi.liveAlerts(), [], { pollMs: config.pollIntervalMs });
  const alerts = useMemo(() => data ?? [], [data]);
  const unacknowledged = useMemo(() => alerts.filter((a) => !a.acknowledged), [alerts]);

  const first = unacknowledged[0] ?? null;
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  useEffect(() => {
    if (!first || first.id === hiddenId) return;
    const t = window.setTimeout(() => setHiddenId(first.id), BANNER_MS);
    return () => window.clearTimeout(t);
  }, [first, hiddenId]);

  const acknowledge = useCallback(
    async (id: string) => {
      setData((list) => list?.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))); // optimistic
      const saved = await commonApi.acknowledgeLiveAlert(id);
      setData((list) => list?.map((a) => (a.id === id ? saved : a)));
    },
    [setData],
  );

  const value = useMemo<AlertsValue>(
    () => ({ alerts, unacknowledged, headerAlert: first && first.id !== hiddenId ? first : null, acknowledge }),
    [alerts, unacknowledged, first, hiddenId, acknowledge],
  );
  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export function useAlerts() {
  const v = useContext(AlertsContext);
  if (!v) throw new Error('useAlerts must be used inside <AlertsProvider>');
  return v;
}
