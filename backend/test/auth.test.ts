import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import { makeTestApp } from './helpers.js';

const creds = { email: 'Akki@Example.com', password: 'correct horse battery', displayName: 'Akki' };

async function register(app: Parameters<typeof request>[0], body = creds) {
  return request(app).post('/v1/auth/register').send(body);
}

describe('config hardening', () => {
  it('refuses to boot production without a secret or persistent store', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => loadEnv({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) })).toThrow(/persistent storage/);
    expect(() => loadEnv({ NODE_ENV: 'test', JWT_SECRET: 'short' })).toThrow(/32/);
    expect(() => loadEnv({ NODE_ENV: 'test', CATALOG_PROVIDERS: 'spotify' })).toThrow(/Unknown catalog provider/);
  });
});

describe('auth', () => {
  it('registers, normalises email, never leaks the hash', async () => {
    const { app } = makeTestApp();
    const res = await register(app);
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('akki@example.com');
    expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash/);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/);
  });

  it('enforces password policy and unique emails', async () => {
    const { app } = makeTestApp();
    expect((await register(app, { ...creds, password: 'short' })).status).toBe(400);
    expect((await register(app, { ...creds, password: 'password123' })).status).toBe(400);
    expect((await register(app, { ...creds, email: 'not-an-email' })).status).toBe(400);
    expect((await register(app, { ...creds, displayName: '<script>' })).status).toBe(400);
    expect((await register(app)).status).toBe(201);
    expect((await register(app, { ...creds, email: 'akki@example.com' })).status).toBe(409);
  });

  it('can close registration', async () => {
    const { app } = makeTestApp({ ALLOW_REGISTRATION: 'false' });
    expect((await register(app)).status).toBe(403);
  });

  it('logs in with the same generic error for bad email and bad password', async () => {
    const { app } = makeTestApp();
    await register(app);
    const badPw = await request(app).post('/v1/auth/login').send({ email: creds.email, password: 'nope-nope-nope' });
    const badEmail = await request(app).post('/v1/auth/login').send({ email: 'ghost@example.com', password: 'nope-nope-nope' });
    expect(badPw.status).toBe(401);
    expect(badEmail.status).toBe(401);
    expect(badPw.body.error.message).toBe(badEmail.body.error.message);
    const ok = await request(app).post('/v1/auth/login').send({ email: 'AKKI@example.com', password: creds.password });
    expect(ok.status).toBe(200);
  });

  it('protects /me and rejects tampered tokens', async () => {
    const { app } = makeTestApp();
    const { body } = await register(app);
    expect((await request(app).get('/v1/me')).status).toBe(401);
    const token: string = body.data.accessToken;
    const tampered = token.slice(0, -3) + (token.endsWith('aaa') ? 'bbb' : 'aaa');
    expect((await request(app).get('/v1/me').set('Authorization', `Bearer ${tampered}`)).status).toBe(401);
    expect((await request(app).get('/v1/me').set('Authorization', `Basic ${token}`)).status).toBe(401);
    // alg=none forgery
    const [, payload] = token.split('.');
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.`;
    expect((await request(app).get('/v1/me').set('Authorization', `Bearer ${none}`)).status).toBe(401);
    const me = await request(app).get('/v1/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.headers['cache-control']).toContain('no-store');
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const { app } = makeTestApp();
    const { body } = await register(app);
    const first: string = body.data.refreshToken;

    const r1 = await request(app).post('/v1/auth/refresh').send({ refreshToken: first });
    expect(r1.status).toBe(200);
    const second: string = r1.body.data.refreshToken;
    expect(second).not.toBe(first);

    // Replaying the old token = theft signal → whole family revoked.
    expect((await request(app).post('/v1/auth/refresh').send({ refreshToken: first })).status).toBe(401);
    expect((await request(app).post('/v1/auth/refresh').send({ refreshToken: second })).status).toBe(401);
  });

  it('rejects forged refresh secrets', async () => {
    const { app } = makeTestApp();
    const { body } = await register(app);
    const [jti] = (body.data.refreshToken as string).split('.');
    expect((await request(app).post('/v1/auth/refresh').send({ refreshToken: `${jti}.forgedsecretforgedsecret` })).status).toBe(401);
    // The real token still works (forgery didn't revoke it).
    expect((await request(app).post('/v1/auth/refresh').send({ refreshToken: body.data.refreshToken })).status).toBe(200);
  });

  it('logout revokes the session', async () => {
    const { app } = makeTestApp();
    const { body } = await register(app);
    expect((await request(app).post('/v1/auth/logout').send({ refreshToken: body.data.refreshToken })).status).toBe(204);
    expect((await request(app).post('/v1/auth/refresh').send({ refreshToken: body.data.refreshToken })).status).toBe(401);
  });

  it('password change invalidates existing access tokens', async () => {
    const { app } = makeTestApp();
    const { body } = await register(app);
    const auth = { Authorization: `Bearer ${body.data.accessToken}` };
    const res = await request(app).post('/v1/me/password').set(auth).send({ currentPassword: creds.password, newPassword: 'a whole new phrase' });
    expect(res.status).toBe(200);
    expect((await request(app).get('/v1/me').set(auth)).status).toBe(401);
    expect((await request(app).get('/v1/me').set({ Authorization: `Bearer ${res.body.data.accessToken}` })).status).toBe(200);
  });

  it('rate-limits brute force login per account', async () => {
    const { app } = makeTestApp({ RATE_LIMIT_AUTH_PER_15MIN: '1000' });
    await register(app);
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await request(app).post('/v1/auth/login').send({ email: creds.email, password: `wrong-${i}-xxxx` })).status;
    }
    expect(last).toBe(429);
  });

  it('rejects oversized and malformed bodies', async () => {
    const { app } = makeTestApp();
    const big = await request(app).post('/v1/auth/login').set('Content-Type', 'application/json').send(JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(40_000) }));
    expect(big.status).toBe(413);
    const bad = await request(app).post('/v1/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(bad.status).toBe(400);
  });
});

describe('library', () => {
  async function session(app: Parameters<typeof request>[0], email = creds.email) {
    const { body } = await register(app, { ...creds, email });
    return { Authorization: `Bearer ${body.data.accessToken}` };
  }

  it('likes tracks using server-resolved metadata', async () => {
    const { app } = makeTestApp();
    const auth = await session(app);
    expect((await request(app).put('/v1/me/likes/audius:T1').set(auth)).status).toBe(204);
    expect((await request(app).put('/v1/me/likes/audius:T1').set(auth)).status).toBe(204); // idempotent
    const list = await request(app).get('/v1/me/likes').set(auth);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ id: 'audius:T1', title: 'Track T1' });
    const contains = await request(app).get('/v1/me/likes/contains').query({ ids: 'audius:T1,audius:T2' }).set(auth);
    expect(contains.body.data).toEqual(['audius:T1']);
    expect((await request(app).delete('/v1/me/likes/audius:T1').set(auth)).status).toBe(204);
    expect((await request(app).get('/v1/me/likes').set(auth)).body.data).toHaveLength(0);
  });

  it('manages playlists and isolates users from each other', async () => {
    const { app } = makeTestApp();
    const alice = await session(app, 'alice@example.com');
    const bob = await session(app, 'bob@example.com');

    const created = await request(app).post('/v1/me/playlists').set(alice).send({ title: 'Late night', trackIds: ['audius:T1'] });
    expect(created.status).toBe(201);
    const pid = created.body.data.id;

    const added = await request(app).post(`/v1/me/playlists/${pid}/tracks`).set(alice).send({ trackIds: ['audius:T2', 'audius:T1'] });
    expect(added.body.data.tracks.map((t: { id: string }) => t.id)).toEqual(['audius:T1', 'audius:T2']);

    const reordered = await request(app).patch(`/v1/me/playlists/${pid}`).set(alice).send({ title: 'Late nights', trackIds: ['audius:T2', 'audius:T1'] });
    expect(reordered.body.data.title).toBe('Late nights');
    expect(reordered.body.data.tracks[0].id).toBe('audius:T2');

    // Bob can neither read, edit nor delete Alice's playlist.
    expect((await request(app).get(`/v1/me/playlists/${pid}`).set(bob)).status).toBe(404);
    expect((await request(app).patch(`/v1/me/playlists/${pid}`).set(bob).send({ title: 'pwned' })).status).toBe(404);
    expect((await request(app).delete(`/v1/me/playlists/${pid}`).set(bob)).status).toBe(404);
    expect((await request(app).get('/v1/me/playlists').set(bob)).body.data).toHaveLength(0);

    expect((await request(app).delete(`/v1/me/playlists/${pid}/tracks/audius:T2`).set(alice)).body.data.tracks).toHaveLength(1);
    expect((await request(app).delete(`/v1/me/playlists/${pid}`).set(alice)).status).toBe(204);
  });

  it('records history, collapsing repeats', async () => {
    const { app } = makeTestApp();
    const auth = await session(app);
    for (const id of ['audius:T1', 'audius:T1', 'audius:T2']) {
      expect((await request(app).post('/v1/me/history').set(auth).send({ trackId: id })).status).toBe(204);
    }
    const h = await request(app).get('/v1/me/history').set(auth);
    expect(h.body.data.map((t: { id: string }) => t.id)).toEqual(['audius:T2', 'audius:T1']);
  });

  it('deletes the account (password confirmed) and everything with it', async () => {
    const { app } = makeTestApp();
    const auth = await session(app);
    expect((await request(app).delete('/v1/me').set(auth).send({ password: 'wrong-wrong' })).status).toBe(401);
    expect((await request(app).delete('/v1/me').set(auth).send({ password: creds.password })).status).toBe(204);
    expect((await request(app).get('/v1/me').set(auth)).status).toBe(401);
    expect((await request(app).post('/v1/auth/login').send({ email: creds.email, password: creds.password })).status).toBe(401);
  });
});
