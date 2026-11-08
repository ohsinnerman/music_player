import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createHttpClient } from '../src/lib/http.js';
import { cleanTitle, parseLrc } from '../src/services/lyrics.js';
import { makeTestApp } from './helpers.js';

describe('meta', () => {
  it('reports health with security headers and no fingerprint', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('returns JSON 404s for unknown routes', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('browse', () => {
  it('merges sections from every provider in curated order', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/v1/browse/home');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s: { id: string }) => s.id);
    expect(ids[0]).toBe('deezer-hero');
    expect(ids).toContain('audius-quick');
    expect(ids).toContain('deezer-chart');
    expect(ids).toContain('genres');
    const quick = res.body.data.find((s: { id: string }) => s.id === 'audius-quick');
    expect(quick.items[0]).toMatchObject({ kind: 'track', id: 'audius:T1', streamKind: 'full', durationMs: 200000 });
  });

  it('still serves home when one provider is down', async () => {
    const { app } = makeTestApp({}, [(u) => (u.hostname === 'api.deezer.com' ? { status: 503, body: {} } : undefined)]);
    const res = await request(app).get('/v1/browse/home');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s: { id: string }) => s.id);
    expect(ids).not.toContain('deezer-chart');
    expect(ids).toContain('audius-quick');
  });

  it('fails cleanly with 502 when every provider is down', async () => {
    const { app } = makeTestApp({}, [() => ({ status: 500, body: {} })]);
    const res = await request(app).get('/v1/browse/home');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('upstream_unavailable');
  });

  it('lists genres', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/v1/browse/genres');
    expect(res.body.data.length).toBeGreaterThan(10);
    expect(res.body.data[0]).toHaveProperty('colors');
  });
});

describe('search', () => {
  it('validates the query', async () => {
    const { app } = makeTestApp();
    expect((await request(app).get('/v1/search')).status).toBe(400);
    expect((await request(app).get('/v1/search').query({ q: 'x'.repeat(101) })).status).toBe(400);
  });

  it('interleaves providers and picks an exact artist as top result', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/v1/search').query({ q: 'nova' });
    expect(res.status).toBe(200);
    expect(res.body.data.top).toMatchObject({ kind: 'artist', name: 'Nova' });
    const providers = res.body.data.tracks.map((t: { provider: string }) => t.provider);
    expect(providers.slice(0, 2).sort()).toEqual(['audius', 'deezer']);
  });
});

describe('entities & streaming', () => {
  it('rejects ids that could inject into upstream URLs', async () => {
    const { app, calls } = makeTestApp();
    for (const bad of ['audius:..%2F..%2Fadmin', 'evil:1', 'audius:a%3Fb%3D1', 'audius:a%2Fstream', 'deezer:1%23x']) {
      const res = await request(app).get(`/v1/tracks/${bad}`);
      expect(res.status).toBe(400);
    }
    expect(calls.length).toBe(0);
  });

  it('returns a track and maps provider 404s', async () => {
    const { app } = makeTestApp();
    expect((await request(app).get('/v1/tracks/audius:T7')).body.data.title).toBe('Track T7');
    expect((await request(app).get('/v1/tracks/audius:missing')).status).toBe(404);
    expect((await request(app).get('/v1/tracks/deezer:1')).status).toBe(404);
  });

  it('resolves full streams for Audius and fresh previews for Deezer', async () => {
    const { app } = makeTestApp();
    const a = await request(app).get('/v1/tracks/audius:T1/stream');
    expect(a.status).toBe(200);
    expect(a.headers['cache-control']).toBe('no-store');
    expect(a.body.data).toMatchObject({ kind: 'full' });
    expect(a.body.data.url).toMatch(/^https:\/\/api\.audius\.co\/v1\/tracks\/T1\/stream\?app_name=/);
    const d = await request(app).get('/v1/tracks/deezer:3135556/stream');
    expect(d.body.data).toMatchObject({ kind: 'preview', url: 'https://cdn.deezer.example/preview/3135556.mp3' });
  });

  it('refuses disabled providers', async () => {
    const { app } = makeTestApp({ CATALOG_PROVIDERS: 'audius' });
    expect((await request(app).get('/v1/tracks/deezer:3135556')).status).toBe(404);
  });
});

describe('lyrics', () => {
  it('parses LRC with multi-stamps, offsets and metadata', () => {
    const lines = parseLrc('[ar:Someone]\n[offset:+500]\n[00:10.00][00:20.50]Chorus\n[00:05.5]Intro\nno stamp');
    expect(lines).toEqual([
      { timeMs: 5000, text: 'Intro' },
      { timeMs: 9500, text: 'Chorus' },
      { timeMs: 20000, text: 'Chorus' },
    ]);
  });

  it('cleans titles for matching', () => {
    expect(cleanTitle('Song (feat. Someone) - Remastered 2011')).toBe('Song');
    expect(cleanTitle('Plain')).toBe('Plain');
  });

  it('serves synced lyrics for a track id', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/v1/lyrics').query({ trackId: 'audius:T1' });
    expect(res.status).toBe(200);
    expect(res.body.data.synced).toEqual([
      { timeMs: 1000, text: 'Hello' },
      { timeMs: 2500, text: 'World' },
    ]);
  });
});

describe('http client', () => {
  it('refuses hosts outside the allow-list (SSRF guard)', async () => {
    const http = createHttpClient({ timeoutMs: 1000, userAgent: 't', allowedHosts: ['api.audius.co'], fetchImpl: (async () => new Response('{}')) as typeof fetch });
    await expect(http.json('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/not allowed/);
    await expect(http.json('file:///etc/passwd')).rejects.toThrow();
  });
});
