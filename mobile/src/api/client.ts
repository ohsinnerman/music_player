import { tokenStorage } from '@/auth/tokenStorage';
import { checkServerUrl, getServerUrl } from '@/settings/store';
import type { AuthPayload } from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetwork() {
    return this.status === 0;
  }
}

const TIMEOUT_MS = 15_000;

export function apiBase(): string {
  const { url, problem } = checkServerUrl(getServerUrl());
  if (problem === 'empty') throw new ApiError(0, 'no_server', 'Add your server address in Settings to start listening');
  if (problem === 'insecure') throw new ApiError(0, 'insecure_server', 'This build only connects to https servers');
  if (problem) throw new ApiError(0, 'bad_server', 'The server address in Settings looks wrong');
  return `${url}/v1`;
}

type Listener = () => void;
const sessionExpiredListeners = new Set<Listener>();
/** Fired when the refresh token is rejected; the auth store signs out. */
export const onSessionExpired = (fn: Listener) => {
  sessionExpiredListeners.add(fn);
  return () => sessionExpiredListeners.delete(fn);
};

let refreshing: Promise<boolean> | null = null;

/** Single-flight refresh: concurrent 401s share one refresh call. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const rt = await tokenStorage.getRefresh();
    if (!rt) return false;
    try {
      const data = await raw<AuthPayload>('POST', '/auth/refresh', { refreshToken: rt }, false);
      tokenStorage.setAccess(data.accessToken);
      await tokenStorage.setRefresh(data.refreshToken);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await tokenStorage.clear();
        sessionExpiredListeners.forEach((l) => l());
      }
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function raw<T>(method: string, path: string, body?: unknown, withAuth = true, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = withAuth ? tokenStorage.getAccess() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const aborted = controller.signal.aborted && !signal?.aborted;
    throw new ApiError(0, aborted ? 'timeout' : 'network', aborted ? 'The server took too long to answer' : 'Can’t reach the server. Check your connection.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  if (res.status === 204) return undefined as T;
  let json: { data?: T; error?: { code: string; message: string; details?: { path: string; message: string }[] } } | undefined;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const err = json?.error;
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return json?.data as T;
}

/** Authenticated request with transparent token refresh on 401. */
export async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  try {
    return await raw<T>(method, path, body, true, signal);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      if (await refreshSession()) return raw<T>(method, path, body, true, signal);
    }
    throw e;
  }
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  /** Unauthenticated (login/register). */
  public: <T>(method: string, path: string, body?: unknown) => raw<T>(method, path, body, false),
};

/** Stable playback URL; the server redirects to a fresh signed stream. */
export const playUrl = (trackId: string) => `${apiBase()}/tracks/${encodeURIComponent(trackId)}/play`;

export const qs = (params: Record<string, string | number | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};
