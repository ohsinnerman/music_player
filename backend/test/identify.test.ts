import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { guessFromFilename, similarity } from '../src/services/identify.js';
import { type Handler, makeTestApp } from './helpers.js';

const KNOWN = { trackName: 'One More Time', artistName: 'Daft Punk', albumName: 'Discovery', duration: 320 };
const record = { id: 7, ...KNOWN, instrumental: false, plainLyrics: 'One more time\nWe gonna celebrate', syncedLyrics: '[00:01.00]One more time\n[00:03.00]We gonna celebrate' };

/** LRCLIB that only knows "Daft Punk – One More Time". */
const lrclib: Handler = (u) => {
  if (u.hostname !== 'lrclib.net') return undefined;
  const p = u.searchParams;
  const isIt = (p.get('track_name') ?? '').toLowerCase() === 'one more time' && (p.get('artist_name') ?? '').toLowerCase() === 'daft punk';
  if (u.pathname === '/api/get') return isIt ? { body: record } : { status: 404, body: { message: 'not found' } };
  if (u.pathname === '/api/search') {
    if (isIt) return { body: [record] };
    if ((p.get('q') ?? '').toLowerCase().includes('one more time')) return { body: [record] };
    return { body: [] };
  }
  return undefined;
};

interface GroqCall {
  path: string;
  auth: string | null;
  json?: { model: string; response_format: { type: string }; messages: { role: string; content: string }[] };
  form?: FormData;
}

function groq(reply: object, transcript = 'one more time we gonna celebrate oh yeah all right dont stop the dancing') {
  const calls: GroqCall[] = [];
  const handler: Handler = (u, init) => {
    if (u.hostname !== 'api.groq.com') return undefined;
    const auth = new Headers(init?.headers).get('authorization');
    if (u.pathname.endsWith('/chat/completions')) {
      calls.push({ path: u.pathname, auth, json: JSON.parse(String(init?.body)) });
      return { body: { choices: [{ message: { content: JSON.stringify(reply) } }] } };
    }
    if (u.pathname.endsWith('/audio/transcriptions')) {
      calls.push({ path: u.pathname, auth, form: init?.body as FormData });
      return { body: { text: transcript, language: 'english' } };
    }
    return undefined;
  };
  return { handler, calls };
}

const AI_HIT = { title: 'One More Time', artist: 'Daft Punk', album: 'Discovery', confidence: 'high', alternatives: [] };
const KEY = { GROQ_API_KEY: 'gsk_test_key' };

describe('filename heuristics', () => {
  it('pulls artist and title out of messy file names', () => {
    expect(guessFromFilename('01 - Daft_Punk - One More Time (Official Video).mp3')).toMatchObject({ artist: 'Daft Punk', title: 'One More Time' });
    expect(guessFromFilename('Music/Albums/07. Clair de Lune [www.example.com].flac')).toMatchObject({ title: 'Clair de Lune' });
    expect(similarity('Daft Punk One More Time', 'daft punk - one more time!')).toBe(1);
    expect(similarity('Beyoncé Halo', 'beyonce halo')).toBe(1);
  });
});

describe('POST /v1/identify', () => {
  it('matches straight from tags without touching AI', async () => {
    const g = groq(AI_HIT);
    const { app, calls } = makeTestApp(KEY, [lrclib, g.handler]);
    const res = await request(app).post('/v1/identify').send({ title: 'One More Time', artist: 'Daft Punk', duration: 321, filename: 'x.flac' });
    expect(res.status).toBe(200);
    expect(res.body.data.match).toMatchObject({ title: 'One More Time', artist: 'Daft Punk', source: 'tags', confidence: 'high' });
    expect(res.body.data.lyrics.synced[0]).toEqual({ timeMs: 1000, text: 'One more time' });
    expect(res.body.data.ai).toEqual({ used: false, available: true });
    expect(g.calls).toHaveLength(0);
    expect(calls.some((c) => c.includes('api.groq.com'))).toBe(false);
  });

  it('falls back to the file name', async () => {
    const { app } = makeTestApp({}, [lrclib]);
    const res = await request(app).post('/v1/identify').send({ filename: '01 - Daft_Punk - One More Time (Official Video).mp3', duration: 320 });
    expect(res.body.data.match).toMatchObject({ title: 'One More Time', artist: 'Daft Punk', source: 'filename' });
    expect(res.body.data.lyrics).not.toBeNull();
  });

  it('asks Groq to clean up hopeless metadata, then fetches lyrics', async () => {
    const g = groq(AI_HIT);
    const { app } = makeTestApp(KEY, [lrclib, g.handler]);
    const res = await request(app).post('/v1/identify').send({ title: 'Track 03', filename: 'AUD-20230101-WA0003.mp3', duration: 320 });
    expect(res.status).toBe(200);
    expect(res.body.data.match).toMatchObject({ title: 'One More Time', artist: 'Daft Punk', source: 'ai' });
    expect(res.body.data.lyrics.plain).toContain('celebrate');
    expect(res.body.data.ai.used).toBe(true);

    expect(g.calls).toHaveLength(1);
    const call = g.calls[0]!;
    expect(call.auth).toBe('Bearer gsk_test_key');
    expect(call.json!.model).toBe('openai/gpt-oss-20b');
    expect(call.json!.response_format.type).toBe('json_schema');
    const user = JSON.parse(call.json!.messages[1]!.content);
    expect(user.filename).toBe('AUD-20230101-WA0003.mp3');
    expect(user.tags.title).toBe('Track 03');
  });

  it('reports the song even when LRCLIB has no lyrics for it', async () => {
    const g = groq({ title: 'Some Rare Song', artist: 'Someone', album: null, confidence: 'high', alternatives: [] });
    const { app } = makeTestApp(KEY, [lrclib, g.handler]);
    const res = await request(app).post('/v1/identify').send({ filename: 'rare.mp3' });
    expect(res.body.data.match).toMatchObject({ title: 'Some Rare Song', artist: 'Someone', source: 'ai', confidence: 'low' });
    expect(res.body.data.lyrics).toBeNull();
    expect(res.body.data.canListen).toBe(true);
  });

  it('works without a Groq key (no AI, no listening)', async () => {
    const { app } = makeTestApp({}, [lrclib]);
    const res = await request(app).post('/v1/identify').send({ filename: 'AUD-20230101-WA0003.mp3' });
    expect(res.status).toBe(200);
    expect(res.body.data.match).toBeNull();
    expect(res.body.data.ai).toEqual({ used: false, available: false });
    expect(res.body.data.canListen).toBe(false);
  });

  it('respects the daily AI budget', async () => {
    const g = groq(AI_HIT);
    const { app } = makeTestApp({ ...KEY, AI_DAILY_LIMIT: '0' }, [lrclib, g.handler]);
    const res = await request(app).post('/v1/identify').send({ filename: 'AUD-20230101-WA0003.mp3' });
    expect(res.status).toBe(200);
    expect(g.calls).toHaveLength(0);
  });

  it('maps a bad Groq key to a clear 503', async () => {
    const bad: Handler = (u) => (u.hostname === 'api.groq.com' ? { status: 401, body: { error: { message: 'Invalid API Key' } } } : undefined);
    const { app } = makeTestApp(KEY, [lrclib, bad]);
    const res = await request(app).post('/v1/identify').send({ filename: 'AUD-20230101-WA0003.mp3' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ai_unavailable');
    expect(JSON.stringify(res.body)).not.toContain('gsk_');
  });

  it('validates input', async () => {
    const { app } = makeTestApp();
    expect((await request(app).post('/v1/identify').send({})).status).toBe(400);
    expect((await request(app).post('/v1/identify').send({ title: 'x'.repeat(500) })).status).toBe(400);
  });

  it('advertises the feature in /config', async () => {
    const { app } = makeTestApp(KEY);
    const res = await request(app).get('/v1/config');
    expect(res.body.data.features).toEqual({ identify: true, ai: true, listen: true });
  });
});

describe('POST /v1/identify/audio', () => {
  const clip = Buffer.alloc(8192, 1);

  it('transcribes a clip, recognises the song, returns lyrics', async () => {
    const g = groq(AI_HIT);
    const { app } = makeTestApp(KEY, [lrclib, g.handler]);
    const res = await request(app)
      .post('/v1/identify/audio')
      .query({ filename: 'AUD-20230101-WA0003.mp3', duration: 320 })
      .set('Content-Type', 'audio/mpeg')
      .send(clip);
    expect(res.status).toBe(200);
    expect(res.body.data.match).toMatchObject({ title: 'One More Time', artist: 'Daft Punk', source: 'audio' });
    expect(res.body.data.lyrics).not.toBeNull();
    expect(res.body.data.transcript).toContain('celebrate');

    expect(g.calls.map((c) => c.path.split('/').pop())).toEqual(['transcriptions', 'completions']);
    const form = g.calls[0]!.form!;
    expect(form.get('model')).toBe('whisper-large-v3-turbo');
    expect((form.get('file') as File).name).toBe('clip.mp3');
    expect((form.get('file') as File).size).toBe(8192);
    expect(JSON.parse(g.calls[1]!.json!.messages[1]!.content).transcript).toContain('one more time');
  });

  it('treats an instrumental clip as "nothing to find"', async () => {
    const g = groq(AI_HIT, '♪ ♪');
    const { app } = makeTestApp(KEY, [lrclib, g.handler]);
    const res = await request(app).post('/v1/identify/audio').set('Content-Type', 'audio/flac').send(clip);
    expect(res.body.data.match).toBeNull();
    expect(g.calls).toHaveLength(1); // no LLM call
  });

  it('rejects non-audio and empty bodies', async () => {
    const { app } = makeTestApp(KEY);
    expect((await request(app).post('/v1/identify/audio').set('Content-Type', 'text/plain').send('hello')).status).toBe(400);
    expect((await request(app).post('/v1/identify/audio').set('Content-Type', 'audio/mpeg').send(Buffer.alloc(10))).status).toBe(400);
  });

  it('rejects clips over 4 MB', async () => {
    const { app } = makeTestApp(KEY);
    const res = await request(app).post('/v1/identify/audio').set('Content-Type', 'audio/mpeg').send(Buffer.alloc(4 * 1024 * 1024 + 10));
    expect(res.status).toBe(413);
  });
});
