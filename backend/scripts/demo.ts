/**
 * Offline demo server — for UI development and screenshots only.
 *
 *   npx tsx scripts/demo.ts        (serves on http://localhost:4000)
 *
 * Boots the real API with an in-memory store and a fake upstream that
 * returns fictional artists, albums and lyrics, with generated SVG artwork.
 * No internet access needed. Never use this in production.
 */
import { createServer } from 'node:http';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';

const PORT = Number(process.env.PORT ?? 4000);
const PUBLIC = process.env.DEMO_PUBLIC_URL ?? `http://localhost:${PORT}`;

/* ───────────── deterministic fixtures ───────────── */

const PALETTES = [
  ['#FF5A36', '#2B0F3A'], ['#00C2FF', '#0B1F4B'], ['#3DDC97', '#062B22'], ['#FFB13B', '#4A1A05'],
  ['#FF3D7F', '#1E0A2E'], ['#E9B872', '#3A2412'], ['#5FB7C9', '#0D2730'], ['#F4A261', '#2D1B4E'],
  ['#C1121F', '#14080A'], ['#8E9AAF', '#1B1D27'], ['#D7FF3A', '#18240A'], ['#FF8FB1', '#3B1023'],
];
const SHAPES = ['circle', 'rings', 'stripes', 'grid', 'wave', 'sun'] as const;

function svgCover(seed: number, label: string) {
  const [a, b] = PALETTES[seed % PALETTES.length]!;
  const shape = SHAPES[seed % SHAPES.length];
  const rot = (seed * 37) % 360;
  let art = '';
  if (shape === 'circle') art = `<circle cx="${300 + (seed % 5) * 40}" cy="${260 + (seed % 3) * 50}" r="190" fill="${a}" opacity="0.9"/><circle cx="420" cy="420" r="120" fill="#fff" opacity="0.08"/>`;
  if (shape === 'rings') art = [0, 1, 2, 3, 4].map((i) => `<circle cx="300" cy="300" r="${60 + i * 50}" fill="none" stroke="${a}" stroke-width="18" opacity="${0.9 - i * 0.15}"/>`).join('');
  if (shape === 'stripes') art = Array.from({ length: 9 }, (_, i) => `<rect x="${-200 + i * 110}" y="-100" width="44" height="900" fill="${a}" opacity="${0.25 + (i % 3) * 0.25}" transform="rotate(${rot} 300 300)"/>`).join('');
  if (shape === 'grid') art = Array.from({ length: 16 }, (_, i) => `<rect x="${70 + (i % 4) * 120}" y="${70 + Math.floor(i / 4) * 120}" width="100" height="100" rx="${(i * 7) % 50}" fill="${a}" opacity="${0.2 + ((i * 13) % 10) / 12}"/>`).join('');
  if (shape === 'wave') art = Array.from({ length: 7 }, (_, i) => `<path d="M-20 ${180 + i * 50} Q 150 ${100 + i * 50} 300 ${180 + i * 50} T 620 ${180 + i * 50}" stroke="${a}" stroke-width="14" fill="none" opacity="${1 - i * 0.12}"/>`).join('');
  if (shape === 'sun') art = `<circle cx="300" cy="340" r="150" fill="${a}"/>` + Array.from({ length: 6 }, (_, i) => `<rect x="0" y="${360 + i * 34}" width="600" height="${10 + i * 2}" fill="${b}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="#050507"/></linearGradient>
<radialGradient id="r" cx="0.3" cy="0.2" r="0.9"><stop offset="0" stop-color="${a}" stop-opacity="0.45"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient></defs>
<rect width="600" height="600" fill="url(#g)"/><rect width="600" height="600" fill="url(#r)"/>${art}
<text x="36" y="560" font-family="Helvetica, Arial" font-weight="800" font-size="34" fill="#fff" opacity="0.85">${label.replace(/[<&>]/g, '')}</text></svg>`;
}

const artUrl = (seed: number, label = '') => `${PUBLIC}/demo-art/${seed}.svg?l=${encodeURIComponent(label)}`;
const audiusArt = (seed: number, label: string) => ({ '150x150': artUrl(seed, label), '480x480': artUrl(seed, label), '1000x1000': artUrl(seed, label) });

const ARTISTS = ['Nova Atlas', 'Kairo Vale', 'The Low Tides', 'Mira Sol', 'Echo Harbor', 'Juno Park', 'Velvet Static', 'Ashwin Rao', 'Lumen & Grey', 'Sable Coast'];
const WORDS = ['Glass', 'Hearts', 'Afterglow', 'Night', 'Drive', 'Neon', 'Rain', 'Paper', 'Moons', 'Gold', 'Static', 'Bloom', 'Tidal', 'Ember', 'Echoes', 'Signal', 'Velvet', 'Horizon', 'Satellite', 'Monsoon', 'Midnight', 'Cities', 'Fever', 'Lanterns'];
const title = (i: number) => `${WORDS[i % WORDS.length]} ${WORDS[(i * 7 + 3) % WORDS.length]}`;
const users = ARTISTS.map((name, i) => ({
  id: `u${i}`, name, handle: name.toLowerCase().replace(/\W+/g, ''), is_verified: i % 3 === 0, follower_count: 12000 * (i + 3),
  profile_picture: audiusArt(100 + i, ''), cover_photo: { '640x': artUrl(200 + i, ''), '2000x': artUrl(200 + i, '') },
  bio: `${name} makes late-night music for long drives and slow mornings. Independent since day one.`,
}));
const tracks = Array.from({ length: 48 }, (_, i) => ({
  id: `t${i}`, title: title(i), duration: 150 + ((i * 37) % 140), genre: ['Electronic', 'Lo-Fi', 'Pop', 'Hip-Hop/Rap', 'Alternative'][i % 5],
  play_count: 1000 * (48 - i), artwork: audiusArt(i, ''), user: users[i % users.length]!, is_streamable: true, access: { stream: true },
}));
const playlists = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i}`, playlist_name: ['Late Night Drive', 'Monsoon Mornings', 'Focus Flow', 'Golden Hour', 'Basement Tapes', 'Run Club', 'Slow Bloom', 'City Lights'][i]!,
  description: 'Hand-picked for the moment.', is_album: i >= 5, artwork: audiusArt(300 + i, ''), user: users[i % users.length]!, track_count: 12,
}));

const dzTrack = (i: number) => ({
  id: 1000 + i, title: `${WORDS[(i * 5) % WORDS.length]} ${['Again', 'Tonight', 'Forever', 'Alone', 'Higher'][i % 5]}`, duration: 180 + (i % 60),
  preview: `https://cdn.example/preview/${i}.mp3`, explicit_lyrics: i % 4 === 0, readable: true,
  artist: { id: 500 + (i % 6), name: ARTISTS[(i + 4) % ARTISTS.length], picture_xl: artUrl(400 + (i % 6)) },
  album: { id: 700 + (i % 8), title: title(i + 20), cover_medium: artUrl(600 + (i % 8)), cover_big: artUrl(600 + (i % 8)), cover_xl: artUrl(600 + (i % 8)) },
});
const dzAlbum = (i: number) => ({ id: 700 + i, title: title(i + 20), cover_medium: artUrl(600 + i), cover_big: artUrl(600 + i), cover_xl: artUrl(600 + i), record_type: ['album', 'single', 'ep'][i % 3], release_date: `2026-0${(i % 9) + 1}-1${i % 9}`, artist: { id: 500 + (i % 6), name: ARTISTS[(i + 4) % ARTISTS.length] }, nb_tracks: 10 });

const LYRICS = [
  'Streetlights humming in the rain', 'I keep your number like a flame', 'We were paper boats on neon seas',
  'Folding every promise into me', '', 'Hold on, hold on, the night is young', 'Every echo sounds like your song',
  'Drive until the city ends', 'Turn the static into friends', 'Hold on, hold on, we’re almost home', 'Glass hearts never break alone',
  '', 'And when the morning finds us here', 'I’ll still be singing loud and clear', 'Hold on, hold on', 'Glass hearts never break alone',
];
const lrc = LYRICS.map((l, i) => `[${String(Math.floor((8 + i * 4) / 60)).padStart(2, '0')}:${String((8 + i * 4) % 60).padStart(2, '0')}.00]${l}`).join('\n');

/* ───────────── fake upstream ───────────── */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fakeFetch = (async (input: string | URL | Request) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const p = u.pathname;
  if (u.hostname === 'api.audius.co') {
    if (p === '/v1/tracks/trending') {
      const g = u.searchParams.get('genre');
      return json({ data: g ? tracks.filter((t) => t.genre === g).concat(tracks.slice(0, 10)) : tracks.slice(0, 30) });
    }
    if (p === '/v1/tracks/trending/underground') return json({ data: tracks.slice(30, 48) });
    if (p === '/v1/playlists/trending') return json({ data: playlists });
    if (p === '/v1/tracks/search') return json({ data: tracks.filter((t) => t.title.toLowerCase().includes((u.searchParams.get('query') ?? '').toLowerCase().slice(0, 3))).slice(0, 15) });
    if (p === '/v1/users/search') return json({ data: users.filter((x) => x.name.toLowerCase().includes((u.searchParams.get('query') ?? '').toLowerCase())) });
    if (p === '/v1/playlists/search') return json({ data: playlists.slice(0, 3) });
    let m = /^\/v1\/tracks\/(t\d+)\/stream$/.exec(p);
    if (m) return json({ data: `${PUBLIC}/demo-audio.wav` });
    m = /^\/v1\/tracks\/(t\d+)$/.exec(p);
    if (m) return json({ data: tracks.find((t) => t.id === m![1]) ?? tracks[0] });
    m = /^\/v1\/playlists\/(p\d+)\/tracks$/.exec(p);
    if (m) return json({ data: tracks.slice(Number(m[1]!.slice(1)) * 3, Number(m[1]!.slice(1)) * 3 + 12) });
    m = /^\/v1\/playlists\/(p\d+)$/.exec(p);
    if (m) return json({ data: [playlists.find((x) => x.id === m![1]) ?? playlists[0]] });
    m = /^\/v1\/users\/(u\d+)\/tracks$/.exec(p);
    if (m) return json({ data: tracks.filter((t) => t.user.id === m![1]) });
    m = /^\/v1\/users\/(u\d+)\/albums$/.exec(p);
    if (m) return json({ data: playlists.filter((x) => x.is_album) });
    m = /^\/v1\/users\/(u\d+)$/.exec(p);
    if (m) return json({ data: users.find((x) => x.id === m![1]) ?? users[0] });
  }
  if (u.hostname === 'api.deezer.com') {
    if (p === '/chart/0')
      return json({
        tracks: { data: Array.from({ length: 30 }, (_, i) => dzTrack(i)) },
        albums: { data: Array.from({ length: 8 }, (_, i) => dzAlbum(i)) },
        artists: { data: Array.from({ length: 6 }, (_, i) => ({ id: 500 + i, name: ARTISTS[(i + 4) % ARTISTS.length], picture_medium: artUrl(400 + i), picture_big: artUrl(400 + i), picture_xl: artUrl(400 + i), nb_fan: 90000 * (i + 1) })) },
        playlists: { data: Array.from({ length: 6 }, (_, i) => ({ id: 900 + i, title: ['Fresh Finds', 'Chill Vibes', 'Workout Mode', 'Indie Mix', 'Sunday Slow', 'Top Hits'][i], picture_medium: artUrl(800 + i), picture_big: artUrl(800 + i), picture_xl: artUrl(800 + i), nb_tracks: 50, user: { id: 1, name: 'Aura Editors' } })) },
      });
    if (p === '/editorial/0/releases') return json({ data: Array.from({ length: 8 }, (_, i) => dzAlbum(i + 8)) });
    if (p.startsWith('/search')) return json({ data: p === '/search' ? Array.from({ length: 8 }, (_, i) => dzTrack(i)) : p === '/search/album' ? [dzAlbum(1), dzAlbum(2)] : [] });
    let m = /^\/album\/(\d+)$/.exec(p);
    if (m) return json({ ...dzAlbum(Number(m[1]) - 700), tracks: { data: Array.from({ length: 10 }, (_, i) => ({ ...dzTrack(i + 3), album: undefined })) } });
    m = /^\/playlist\/(\d+)$/.exec(p);
    if (m) return json({ id: Number(m[1]), title: 'Fresh Finds', description: 'New music, every Friday.', picture_xl: artUrl(800 + (Number(m[1]) - 900)), picture_big: artUrl(800), picture_medium: artUrl(800), nb_tracks: 20, user: { id: 1, name: 'Aura Editors' }, tracks: { data: Array.from({ length: 20 }, (_, i) => dzTrack(i + 5)) } });
    m = /^\/track\/(\d+)$/.exec(p);
    if (m) return json(dzTrack(Number(m[1]) - 1000));
    m = /^\/artist\/(\d+)\/top$/.exec(p);
    if (m) return json({ data: Array.from({ length: 10 }, (_, i) => dzTrack(i * 2)) });
    m = /^\/artist\/(\d+)\/albums$/.exec(p);
    if (m) return json({ data: Array.from({ length: 6 }, (_, i) => dzAlbum(i)) });
    m = /^\/artist\/(\d+)$/.exec(p);
    if (m) return json({ id: Number(m[1]), name: ARTISTS[(Number(m[1]) - 500 + 4) % ARTISTS.length], picture_medium: artUrl(Number(m[1]) - 100), picture_big: artUrl(Number(m[1]) - 100), picture_xl: artUrl(Number(m[1]) - 100), nb_fan: 420000 });
  }
  if (u.hostname === 'lrclib.net') {
    if (p === '/api/get') return json({ id: 1, trackName: 'x', artistName: 'y', duration: 200, instrumental: false, plainLyrics: LYRICS.join('\n'), syncedLyrics: lrc });
    if (p === '/api/search') return json([]);
  }
  return json({ error: 'not mocked' }, 404);
}) as typeof fetch;

/* ───────────── a gentle 20s chord so playback can be tested ───────────── */

function makeWav(seconds = 20, rate = 22050) {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  const notes = [220, 277.18, 329.63, 415.3];
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.min(1, t * 2) * Math.min(1, (seconds - t) * 2);
    let v = 0;
    for (const f of notes) v += Math.sin(2 * Math.PI * f * t) * (0.5 + 0.5 * Math.sin(t * 0.7 + f));
    buf.writeInt16LE(Math.round((v / notes.length) * 0.25 * env * 32767), 44 + i * 2);
  }
  return buf;
}
const wav = makeWav();

/* ───────────── boot ───────────── */

const env = loadEnv({
  ...process.env,
  NODE_ENV: 'development',
  STORE: 'memory',
  LOG_LEVEL: 'warn',
  AUDIUS_API_KEY: 'demo',
  ALLOW_INSECURE_STREAMS: 'true',
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? 'http://localhost:8081,http://localhost:8099',
});
const { app } = buildApp({ env, fetchImpl: fakeFetch });

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', PUBLIC);
  if (url.pathname.startsWith('/demo-art/')) {
    const seed = Number(url.pathname.replace(/\D/g, '')) || 0;
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=86400' });
    return res.end(svgCover(seed, url.searchParams.get('l') ?? ''));
  }
  if (url.pathname === '/demo-audio.wav') {
    res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': wav.length, 'access-control-allow-origin': '*', 'accept-ranges': 'none' });
    return res.end(wav);
  }
  app(req as never, res as never);
});
server.listen(PORT, () => console.log(`Aura DEMO API on ${PUBLIC} (fictional data, offline)`));
