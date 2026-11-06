import { config } from '@/config';
import { handleMockRequest } from './mock/router';

/**
 * Single HTTP entry point for the whole app.
 *  - Real mode: fetch(`${VITE_API_BASE_URL}${path}`) with JSON + Bearer token.
 *  - Mock mode (VITE_USE_MOCK=true): the same request is answered in the browser
 *    by src/api/mock, so the UI runs with no backend.
 * Page code never calls fetch directly — it uses the services in src/api/*.ts.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const TOKEN_KEY = 'inodose.token';
const TOKEN_STORE_KEY = 'inodose.token.store';

/** Token lives in sessionStorage, or localStorage when "Stay signed in" was ticked. */
export const tokenStore = {
  get(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string, persist: boolean) {
    try {
      this.clear();
      // Always persist to localStorage so the session survives tab closes,
      // page reloads, and dev-time HMR full reloads. `persist` is kept in
      // the signature for API compatibility but no longer downgrades to
      // sessionStorage.
      void persist;
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_STORE_KEY, 'local');
    } catch {
      /* storage unavailable (private mode) — session lives in memory only */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_STORE_KEY);
    } catch {
      /* ignore */
    }
  },
};

let onUnauthorized: (() => void) | null = null;
/** AuthContext registers this so a 401 anywhere signs the user out. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

function buildQuery(query?: RequestOptions['query']) {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${path}${buildQuery(opts.query)}`;
  const token = tokenStore.get();

  if (config.useMock) {
    const res = await handleMockRequest(method, url, opts.body, token, opts.signal, config.mockLatencyMs);
    if (res.status === 401 && onUnauthorized && !path.startsWith('/auth/login')) onUnauthorized();
    if (res.status >= 400) throw new ApiError(res.status, messageOf(res.body) ?? `Request failed (${res.status})`, res.body);
    return res.body as T;
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  // Reads are retried on a network failure or 5xx (e.g. the API restarting, or the dev proxy
  // answering 500 while the backend is down) so a brief blip never reaches the user.
  const attempts = method === 'GET' ? 4 : 1;
  let res!: Response;
  let text = '';
  for (let i = 0; i < attempts; i++) {
    try {
      res = await fetch(`${config.apiBaseUrl}${url}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body),
        signal: opts.signal,
        credentials: 'include',
      });
      text = await res.text();
      if (res.status < 500 || i === attempts - 1) break;
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      if (i === attempts - 1) throw new ApiError(0, 'Cannot reach the Inodose server. Check the network connection.');
    }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  }

  const data = text ? safeJson(text) : null;
  if (res.status === 401 && onUnauthorized && !path.startsWith('/auth/login')) onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, messageOf(data) ?? `Request failed (${res.status})`, data);
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}
function messageOf(b: unknown): string | undefined {
  return b && typeof b === 'object' && 'message' in b ? String((b as { message: unknown }).message) : undefined;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PATCH', path, { ...opts, body }),
  delete: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('DELETE', path, { ...opts, body }),
};
