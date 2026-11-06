import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseApiResult<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  /** re-run the request now */
  reload: () => Promise<void>;
  /** replace the cached data (e.g. with a mutation response) */
  setData: React.Dispatch<React.SetStateAction<T | undefined>>;
}

/**
 * Load data from an API service and keep it fresh.
 *   const { data, loading, error } = useApi((s) => dashboardApi.snapshot(id), [id], { pollMs: 5000 });
 * Requests are aborted when deps change or the component unmounts.
 */
export function useApi<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList,
  opts: { pollMs?: number; enabled?: boolean } = {},
): UseApiResult<T> {
  const { pollMs, enabled = true } = opts;
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const ctrlRef = useRef<AbortController | null>(null);
  const inflightRef = useRef(false);

  const run = useCallback(async (silent = false) => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    inflightRef.current = true;
    if (!silent) setLoading(true);
    try {
      const d = await fnRef.current(ctrl.signal);
      if (!ctrl.signal.aborted) {
        // Keep the previous object when a silent poll returns identical data, so
        // consumers (and memoised charts) don't re-render for nothing.
        setData((prev) => (silent && prev !== undefined && JSON.stringify(prev) === JSON.stringify(d) ? prev : d));
        setError(null);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError' && !ctrl.signal.aborted) setError(e as Error);
    } finally {
      if (ctrlRef.current === ctrl) inflightRef.current = false;
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    run();
    return () => ctrlRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  useEffect(() => {
    if (!enabled || !pollMs) return;
    const t = window.setInterval(() => {
      // Skip the tick if the previous poll is still running — aborting it would starve slow endpoints.
      if (document.visibilityState === 'visible' && !inflightRef.current) run(true);
    }, pollMs);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs, enabled, ...deps]);

  // Coming back to the tab: refresh at once instead of waiting for the next tick (timers are throttled while hidden).
  useEffect(() => {
    if (!enabled || !pollMs) return;
    const onVisible = () => { if (document.visibilityState === 'visible' && !inflightRef.current) run(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs, enabled, ...deps]);

  // Self-heal: while there is no data yet and the request failed, keep retrying quietly.
  const failed = !!error && data === undefined;
  useEffect(() => {
    if (!enabled || !failed) return;
    const t = window.setInterval(() => {
      if (!inflightRef.current) run(true);
    }, 3000);
    return () => window.clearInterval(t);
  }, [enabled, failed, run]);

  const reload = useCallback(() => run(true), [run]);
  return { data, error, loading, reload, setData };
}
