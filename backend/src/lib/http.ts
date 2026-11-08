import { AppError, notFound, upstreamError } from './errors.js';

export interface HttpClientOptions {
  timeoutMs: number;
  userAgent: string;
  /** Hosts this client may contact. Anything else is refused (SSRF guard). */
  allowedHosts: string[];
  fetchImpl?: typeof fetch;
}

export type HttpClient = ReturnType<typeof createHttpClient>;

export function createHttpClient(opts: HttpClientOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  const allowed = new Set(opts.allowedHosts.map((h) => h.toLowerCase()));

  function assertAllowed(url: URL) {
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw upstreamError('Blocked upstream protocol');
    if (!allowed.has(url.hostname.toLowerCase())) {
      throw new AppError(500, 'blocked_upstream', `Upstream host not allowed: ${url.hostname}`);
    }
  }

  async function request(
    url: string,
    init: { method?: string; headers?: Record<string, string>; redirect?: 'follow' | 'manual' | 'error' } = {},
    attempt = 0,
  ): Promise<Response> {
    const u = new URL(url);
    assertAllowed(u);
    try {
      const res = await doFetch(u, {
        method: init.method ?? 'GET',
        redirect: init.redirect ?? 'follow',
        headers: { 'User-Agent': opts.userAgent, Accept: 'application/json', ...init.headers },
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
      // One retry on transient upstream failure.
      if ((res.status >= 500 || res.status === 429) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 250));
        return request(url, init, 1);
      }
      return res;
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (attempt === 0) return request(url, init, 1);
      throw upstreamError();
    }
  }

  async function json<T>(url: string, headers?: Record<string, string>): Promise<T> {
    const res = await request(url, { headers });
    if (res.status === 404) throw notFound();
    if (!res.ok) throw upstreamError();
    try {
      return (await res.json()) as T;
    } catch {
      throw upstreamError();
    }
  }

  return { request, json };
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
