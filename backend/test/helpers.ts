import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';

export const audiusUser = (id: string, name: string) => ({
  id,
  name,
  handle: name.toLowerCase(),
  is_verified: true,
  follower_count: 1200,
  profile_picture: { '150x150': `https://img.example/${id}-150.jpg`, '480x480': `https://img.example/${id}-480.jpg`, '1000x1000': `https://img.example/${id}-1000.jpg` },
});

export const audiusTrack = (id: string, title: string, userId = 'u1', userName = 'Nova') => ({
  id,
  title,
  duration: 200,
  genre: 'Electronic',
  play_count: 5000,
  artwork: { '150x150': `https://img.example/${id}-150.jpg`, '480x480': `https://img.example/${id}-480.jpg`, '1000x1000': `https://img.example/${id}-1000.jpg` },
  user: audiusUser(userId, userName),
  is_streamable: true,
  access: { stream: true },
});

const dzTrack = (id: number, title: string) => ({
  id,
  title,
  duration: 210,
  preview: `https://cdn.deezer.example/preview/${id}.mp3`,
  explicit_lyrics: false,
  readable: true,
  artist: { id: 27, name: 'Daft Punk', picture_xl: 'https://img.example/dp.jpg' },
  album: { id: 302127, title: 'Discovery', cover_medium: 'm.jpg', cover_big: 'b.jpg', cover_xl: 'xl.jpg' },
});

export type Handler = (url: URL, init?: RequestInit) => { status?: number; body: unknown } | undefined;

export function fakeFetch(overrides: Handler[] = []) {
  const calls: string[] = [];
  const handlers: Handler[] = [
    ...overrides,
    (u) => (u.hostname === 'api.audius.co' && u.pathname === '/v1/tracks/trending'
      ? { body: { data: [audiusTrack('T1', 'Glass Hearts'), audiusTrack('T2', 'Afterglow', 'u2', 'Kairo'), audiusTrack('T3', 'Night Drive')] } }
      : undefined),
    (u) => (u.hostname === 'api.audius.co' && u.pathname === '/v1/tracks/trending/underground' ? { body: { data: [audiusTrack('T9', 'Basement Tapes')] } } : undefined),
    (u) => (u.hostname === 'api.audius.co' && u.pathname === '/v1/playlists/trending' ? { body: { data: [] } } : undefined),
    (u) => (u.hostname === 'api.audius.co' && u.pathname === '/v1/tracks/search' ? { body: { data: [audiusTrack('T1', 'Glass Hearts')] } } : undefined),
    (u) => (u.hostname === 'api.audius.co' && u.pathname === '/v1/users/search' ? { body: { data: [audiusUser('u1', 'Nova')] } } : undefined),
    (u) => (u.hostname === 'api.audius.co' && u.pathname === '/v1/playlists/search' ? { body: { data: [] } } : undefined),
    (u) => {
      const m = /^\/v1\/tracks\/([A-Za-z0-9]+)$/.exec(u.pathname);
      if (u.hostname === 'api.audius.co' && m) return m[1] === 'missing' ? { status: 404, body: {} } : { body: { data: audiusTrack(m[1]!, `Track ${m[1]}`) } };
      return undefined;
    },
    (u) => (u.hostname === 'api.deezer.com' && u.pathname === '/chart/0'
      ? { body: { tracks: { data: [dzTrack(3135556, 'Harder, Better, Faster, Stronger')] }, albums: { data: [{ id: 302127, title: 'Discovery', cover_xl: 'xl.jpg', artist: { id: 27, name: 'Daft Punk' } }] }, artists: { data: [{ id: 27, name: 'Daft Punk' }] }, playlists: { data: [] } } }
      : undefined),
    (u) => (u.hostname === 'api.deezer.com' && u.pathname === '/editorial/0/releases' ? { body: { data: [] } } : undefined),
    (u) => (u.hostname === 'api.deezer.com' && u.pathname.startsWith('/search') ? { body: { data: u.pathname === '/search' ? [dzTrack(3135556, 'Harder, Better, Faster, Stronger')] : [] } } : undefined),
    (u) => {
      const m = /^\/track\/(\d+)$/.exec(u.pathname);
      if (u.hostname === 'api.deezer.com' && m) return m[1] === '1' ? { body: { error: { type: 'DataException', message: 'no data', code: 800 } } } : { body: dzTrack(Number(m[1]), 'One More Time') };
      return undefined;
    },
    (u) => (u.hostname === 'lrclib.net' && u.pathname === '/api/get'
      ? { body: { id: 1, trackName: 'x', artistName: 'y', duration: 200, instrumental: false, plainLyrics: 'Hello\nWorld', syncedLyrics: '[00:01.00]Hello\n[00:02.50]World' } }
      : undefined),
  ];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.href);
    for (const h of handlers) {
      const r = h(url, init);
      if (r && typeof r.body === 'string') return new Response(r.body, { status: r.status ?? 200, headers: { 'content-type': 'text/plain' } });
      if (r) return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ message: 'unmocked' }), { status: 404 });
  }) as typeof fetch;
  return { impl, calls };
}

export function makeTestApp(extraEnv: Record<string, string> = {}, overrides: Handler[] = []) {
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', STORE: 'memory', ...extraEnv });
  const fake = fakeFetch(overrides);
  const built = buildApp({ env, fetchImpl: fake.impl });
  return { ...built, env, calls: fake.calls };
}
