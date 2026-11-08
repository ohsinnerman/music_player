import { randomUUID } from 'node:crypto';
import express, { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import type { Playlist, Track } from '../domain/types.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';
import { ID_PATTERN } from '../lib/ids.js';
import { burnPasswordCheck, hashPassword, passwordProblem, verifyPassword } from '../security/password.js';
import type { TokenService } from '../security/tokens.js';
import type { CatalogService } from '../services/catalog.js';
import { MIME_EXT, type IdentifyService } from '../services/identify.js';
import type { LyricsService } from '../services/lyrics.js';
import type { Store, UserPlaylistRecord, UserRecord } from '../store/types.js';
import { ah, authMiddleware, limiter, parse } from './middleware.js';

const MAX_PLAYLISTS = 200;
const MAX_PLAYLIST_TRACKS = 1000;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'Enter a valid email' }));
const id = z.string().regex(ID_PATTERN, 'Invalid id');
const uuid = z.uuid();
const limitQ = (max: number, def: number) => z.coerce.number().int().min(1).max(max).default(def);

const publicUser = (u: UserRecord) => ({ id: u.id, email: u.email, displayName: u.displayName, createdAt: u.createdAt.toISOString() });
const toPlaylist = (p: UserPlaylistRecord): Playlist & { createdAt: string; updatedAt: string } => ({
  kind: 'playlist',
  id: p.id,
  title: p.title,
  description: p.description,
  artwork: p.tracks[0]?.artwork ?? {},
  trackCount: p.tracks.length,
  provider: 'user',
  tracks: p.tracks,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});

export interface RouteDeps {
  env: Env;
  store: Store;
  tokens: TokenService;
  catalog: CatalogService;
  lyrics: LyricsService;
  identify: IdentifyService;
}

export function createRoutes({ env, store, tokens, catalog, lyrics, identify }: RouteDeps): Router {
  const r = Router();
  const { requireAuth } = authMiddleware(tokens, store);

  const authLimiter = limiter(15 * 60_000, env.RATE_LIMIT_AUTH_PER_15MIN, 'auth');
  // Per-account limiter so one IP-hopping attacker can't hammer a single email.
  const loginAccountLimiter = limiter(15 * 60_000, 10, 'login-acct', (req) =>
    String((req.body as { email?: unknown })?.email ?? '').toLowerCase().slice(0, 254),
  );
  const refreshLimiter = limiter(15 * 60_000, Math.max(60, env.RATE_LIMIT_AUTH_PER_15MIN * 3), 'refresh');
  const searchLimiter = limiter(60_000, env.RATE_LIMIT_SEARCH_PER_MIN, 'search');
  const identifyLimiter = limiter(60_000, env.RATE_LIMIT_IDENTIFY_PER_MIN, 'identify');
  const listenLimiter = limiter(60 * 60_000, env.RATE_LIMIT_IDENTIFY_AUDIO_PER_HOUR, 'identify-audio');

  const cachePublic = (seconds: number) => ah(async (_req, res, next) => {
    res.setHeader('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 4}`);
    next();
  });

  // ───────────── Meta ─────────────
  r.get('/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: { status: 'ok', time: new Date().toISOString() } });
  });
  r.get('/config', (_req, res) => {
    res.json({
      data: {
        providers: catalog.providers(),
        registration: env.ALLOW_REGISTRATION,
        version: 1,
        features: { identify: true, ai: identify.aiAvailableNoCharge(), listen: identify.aiAvailableNoCharge() },
      },
    });
  });

  // ───────────── Auth ─────────────
  r.post(
    '/auth/register',
    authLimiter,
    ah(async (req, res) => {
      if (!env.ALLOW_REGISTRATION) throw forbidden('Sign-ups are closed on this server');
      const body = parse(
        z.object({
          email,
          password: z.string().max(128),
          displayName: z.string().trim().min(1, 'Tell us your name').max(40).regex(/^[^<>]*$/, 'Name contains invalid characters'),
        }),
        req.body,
      );
      const problem = passwordProblem(body.password, body.email);
      if (problem) throw badRequest(problem, [{ path: 'password', message: problem }]);
      if (await store.findUserByEmail(body.email)) throw conflict('An account with this email already exists');
      const user: UserRecord = {
        id: randomUUID(),
        email: body.email,
        displayName: body.displayName,
        passwordHash: await hashPassword(body.password),
        createdAt: new Date(),
        tokenVersion: 0,
      };
      try {
        await store.createUser(user);
      } catch (e) {
        if ((e as { code?: number }).code === 11000) throw conflict('An account with this email already exists');
        throw e;
      }
      const pair = await tokens.issuePair(user, req.header('user-agent'));
      res.status(201).json({ data: { user: publicUser(user), ...pair } });
    }),
  );

  r.post(
    '/auth/login',
    authLimiter,
    loginAccountLimiter,
    ah(async (req, res) => {
      const body = parse(z.object({ email, password: z.string().min(1).max(128) }), req.body);
      const user = await store.findUserByEmail(body.email);
      if (!user) {
        await burnPasswordCheck(body.password);
        throw unauthorized('Email or password is incorrect');
      }
      if (!(await verifyPassword(user.passwordHash, body.password))) throw unauthorized('Email or password is incorrect');
      const pair = await tokens.issuePair(user, req.header('user-agent'));
      res.json({ data: { user: publicUser(user), ...pair } });
    }),
  );

  r.post(
    '/auth/refresh',
    refreshLimiter,
    ah(async (req, res) => {
      const body = parse(z.object({ refreshToken: z.string().min(10).max(256) }), req.body);
      const { user, tokens: pair } = await tokens.rotate(body.refreshToken, req.header('user-agent'));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ data: { user: publicUser(user), ...pair } });
    }),
  );

  r.post(
    '/auth/logout',
    ah(async (req, res) => {
      const body = parse(z.object({ refreshToken: z.string().max(256).optional() }), req.body ?? {});
      if (body.refreshToken) await tokens.revoke(body.refreshToken);
      res.status(204).end();
    }),
  );

  // ───────────── Catalog (public) ─────────────
  r.get('/browse/home', cachePublic(120), ah(async (_req, res) => res.json({ data: await catalog.home() })));
  r.get('/browse/genres', cachePublic(3600), (_req, res) => {
    res.json({ data: catalog.genres() });
  });
  r.get(
    '/browse/genres/:genreId',
    cachePublic(300),
    ah(async (req, res) => {
      const genreId = parse(z.string().regex(/^[a-z0-9-]{1,40}$/), req.params.genreId);
      res.json({ data: await catalog.genre(genreId) });
    }),
  );

  r.get(
    '/search',
    searchLimiter,
    cachePublic(60),
    ah(async (req, res) => {
      const q = parse(
        z.object({ q: z.string().trim().min(1, 'Type something to search').max(100), limit: limitQ(50, 20) }),
        req.query,
      );
      res.json({ data: await catalog.search(q.q, q.limit) });
    }),
  );

  r.get('/tracks/:id', cachePublic(600), ah(async (req, res) => res.json({ data: await catalog.track(parse(id, req.params.id)) })));
  r.get('/albums/:id', cachePublic(600), ah(async (req, res) => res.json({ data: await catalog.album(parse(id, req.params.id)) })));
  r.get('/artists/:id', cachePublic(600), ah(async (req, res) => res.json({ data: await catalog.artist(parse(id, req.params.id)) })));
  r.get('/playlists/:id', cachePublic(300), ah(async (req, res) => res.json({ data: await catalog.playlist(parse(id, req.params.id)) })));
  r.get('/tracks/:id/radio', cachePublic(300), ah(async (req, res) => res.json({ data: await catalog.radio(parse(id, req.params.id)) })));

  r.get(
    '/tracks/:id/stream',
    ah(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ data: await catalog.stream(parse(id, req.params.id)) });
    }),
  );

  /**
   * Stable playback URL: resolves a fresh stream and 302-redirects to it.
   * The app hands this URL straight to the native player queue, so tracks
   * never play from an expired signed URL. Only provider-resolved https URLs
   * are ever redirected to (the id is validated, nothing comes from the client).
   */
  r.get(
    '/tracks/:id/play',
    ah(async (req, res) => {
      const info = await catalog.stream(parse(id, req.params.id));
      const target = new URL(info.url);
      if (target.protocol !== 'https:' && !(env.ALLOW_INSECURE_STREAMS && target.protocol === 'http:')) throw notFound('Stream not available');
      res.setHeader('Cache-Control', 'no-store');
      res.redirect(302, target.href);
    }),
  );

  r.get(
    '/lyrics',
    cachePublic(3600),
    ah(async (req, res) => {
      const q = parse(
        z.union([
          z.object({ trackId: id }),
          z.object({
            title: z.string().trim().min(1).max(200),
            artist: z.string().trim().min(1).max(200),
            album: z.string().trim().max(200).optional(),
            duration: z.coerce.number().int().min(1).max(7200).optional(),
          }),
        ]),
        req.query,
      );
      if ('trackId' in q) {
        const t = await catalog.track(q.trackId);
        res.json({ data: await lyrics.forTrack(t) });
      } else {
        res.json({ data: await lyrics.lookup({ title: q.title, artist: q.artist, album: q.album, durationSec: q.duration }) });
      }
    }),
  );

  // ───────────── Identify (songs imported from the device) ─────────────
  const hint = {
    title: z.string().trim().max(200).optional(),
    artist: z.string().trim().max(200).optional(),
    album: z.string().trim().max(200).optional(),
    duration: z.coerce.number().min(1).max(7200).optional(),
    filename: z.string().trim().max(255).optional(),
  };
  const toInput = (q: { title?: string; artist?: string; album?: string; duration?: number; filename?: string }) => ({
    title: q.title || undefined,
    artist: q.artist || undefined,
    album: q.album || undefined,
    durationSec: q.duration,
    filename: q.filename || undefined,
  });

  /** Tags + file name → canonical song + lyrics. Uses AI only if the cheap paths fail. */
  r.post(
    '/identify',
    identifyLimiter,
    ah(async (req, res) => {
      const body = parse(
        z.object(hint).refine((b) => b.title || b.filename, { message: 'Send at least a title or a file name' }),
        req.body,
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json({ data: await identify.identify(toInput(body)) });
    }),
  );

  /** A short audio clip (≤ 4 MB) → Whisper → AI → lyrics. Hints go in the query string. */
  r.post(
    '/identify/audio',
    listenLimiter,
    express.raw({ type: Object.keys(MIME_EXT), limit: '4mb' }),
    ah(async (req, res) => {
      const mime = String(req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      if (!MIME_EXT[mime]) throw badRequest('Send audio as audio/mpeg, audio/flac, audio/wav, audio/ogg or audio/mp4');
      const bytes = req.body;
      if (!Buffer.isBuffer(bytes) || bytes.length < 2048) throw badRequest('Audio clip is missing or too short');
      const q = parse(z.object(hint), req.query);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ data: await identify.identifyAudio({ bytes: new Uint8Array(bytes), mime }, toInput(q)) });
    }),
  );

  // ───────────── Me (authenticated) ─────────────
  const me = Router();
  me.use(requireAuth);
  me.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  });

  me.get('/', (req, res) => {
    res.json({ data: publicUser(req.user!) });
  });

  me.patch(
    '/',
    ah(async (req, res) => {
      const body = parse(z.object({ displayName: z.string().trim().min(1).max(40).regex(/^[^<>]*$/) }), req.body);
      await store.updateUser(req.user!.id, { displayName: body.displayName });
      res.json({ data: publicUser({ ...req.user!, displayName: body.displayName }) });
    }),
  );

  me.post(
    '/password',
    authLimiter,
    ah(async (req, res) => {
      const body = parse(z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().max(128) }), req.body);
      if (!(await verifyPassword(req.user!.passwordHash, body.currentPassword))) throw unauthorized('Current password is incorrect');
      const problem = passwordProblem(body.newPassword, req.user!.email);
      if (problem) throw badRequest(problem);
      const nextVersion = req.user!.tokenVersion + 1;
      await store.updateUser(req.user!.id, { passwordHash: await hashPassword(body.newPassword), tokenVersion: nextVersion });
      await store.revokeAllForUser(req.user!.id);
      const pair = await tokens.issuePair({ ...req.user!, tokenVersion: nextVersion }, req.header('user-agent'));
      res.json({ data: pair });
    }),
  );

  me.post(
    '/logout-all',
    ah(async (req, res) => {
      await store.updateUser(req.user!.id, { tokenVersion: req.user!.tokenVersion + 1 });
      await store.revokeAllForUser(req.user!.id);
      res.status(204).end();
    }),
  );

  me.delete(
    '/',
    authLimiter,
    ah(async (req, res) => {
      const body = parse(z.object({ password: z.string().min(1).max(128) }), req.body);
      if (!(await verifyPassword(req.user!.passwordHash, body.password))) throw unauthorized('Password is incorrect');
      await store.deleteUser(req.user!.id);
      res.status(204).end();
    }),
  );

  // Likes
  me.get(
    '/likes',
    ah(async (req, res) => {
      const q = parse(z.object({ limit: limitQ(500, 200), before: z.iso.datetime().optional() }), req.query);
      const likes = await store.listLikes(req.user!.id, q.limit, q.before ? new Date(q.before) : undefined);
      res.json({ data: likes.map((l) => ({ ...l.track, likedAt: l.createdAt.toISOString() })) });
    }),
  );
  me.get(
    '/likes/contains',
    ah(async (req, res) => {
      const q = parse(z.object({ ids: z.string().max(4000) }), req.query);
      const ids = q.ids.split(',').filter((x) => ID_PATTERN.test(x)).slice(0, 100);
      res.json({ data: await store.hasLikes(req.user!.id, ids) });
    }),
  );
  me.put(
    '/likes/:id',
    ah(async (req, res) => {
      // Resolve the track server-side; never trust client-supplied metadata.
      const track = await catalog.track(parse(id, req.params.id));
      await store.addLike({ userId: req.user!.id, trackId: track.id, track, createdAt: new Date() });
      res.status(204).end();
    }),
  );
  me.delete(
    '/likes/:id',
    ah(async (req, res) => {
      await store.removeLike(req.user!.id, parse(id, req.params.id));
      res.status(204).end();
    }),
  );

  // Playlists
  const playlistBody = z.object({
    title: z.string().trim().min(1, 'Give it a name').max(80),
    description: z.string().trim().max(300).optional(),
  });
  const resolveTracks = async (ids: string[]): Promise<Track[]> => {
    const settled = await Promise.allSettled(ids.map((x) => catalog.track(x)));
    return settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
  };
  const ownPlaylist = async (userId: string, pid: string) => {
    const p = await store.getPlaylist(userId, pid);
    if (!p) throw notFound('Playlist not found');
    return p;
  };

  me.get('/playlists', ah(async (req, res) => {
    const list = await store.listPlaylists(req.user!.id);
    // List view omits full track arrays to keep payloads small.
    res.json({ data: list.map((p) => ({ ...toPlaylist(p), tracks: undefined })) });
  }));
  me.post(
    '/playlists',
    ah(async (req, res) => {
      const body = parse(playlistBody.extend({ trackIds: z.array(id).max(100).optional() }), req.body);
      if ((await store.countPlaylists(req.user!.id)) >= MAX_PLAYLISTS) throw badRequest('Playlist limit reached');
      const now = new Date();
      const rec: UserPlaylistRecord = {
        id: randomUUID(),
        userId: req.user!.id,
        title: body.title,
        description: body.description,
        tracks: body.trackIds ? await resolveTracks(body.trackIds) : [],
        createdAt: now,
        updatedAt: now,
      };
      await store.createPlaylist(rec);
      res.status(201).json({ data: toPlaylist(rec) });
    }),
  );
  me.get('/playlists/:pid', ah(async (req, res) => {
    res.json({ data: toPlaylist(await ownPlaylist(req.user!.id, parse(uuid, req.params.pid))) });
  }));
  me.patch(
    '/playlists/:pid',
    ah(async (req, res) => {
      const pid = parse(uuid, req.params.pid);
      const body = parse(playlistBody.partial().extend({ trackIds: z.array(id).max(MAX_PLAYLIST_TRACKS).optional() }), req.body);
      const current = await ownPlaylist(req.user!.id, pid);
      let tracks: Track[] | undefined;
      if (body.trackIds) {
        // Reorder/remove: keep known tracks, resolve any new ones.
        const known = new Map(current.tracks.map((t) => [t.id, t]));
        const missing = body.trackIds.filter((x) => !known.has(x));
        for (const t of await resolveTracks(missing)) known.set(t.id, t);
        tracks = body.trackIds.flatMap((x) => (known.has(x) ? [known.get(x)!] : []));
      }
      const updated = await store.updatePlaylist(req.user!.id, pid, {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(tracks ? { tracks } : {}),
      });
      res.json({ data: toPlaylist(updated!) });
    }),
  );
  me.post(
    '/playlists/:pid/tracks',
    ah(async (req, res) => {
      const pid = parse(uuid, req.params.pid);
      const body = parse(z.object({ trackIds: z.array(id).min(1).max(100) }), req.body);
      const current = await ownPlaylist(req.user!.id, pid);
      const existing = new Set(current.tracks.map((t) => t.id));
      const fresh = await resolveTracks(body.trackIds.filter((x) => !existing.has(x)));
      const tracks = [...current.tracks, ...fresh];
      if (tracks.length > MAX_PLAYLIST_TRACKS) throw badRequest('Playlist is full');
      res.json({ data: toPlaylist((await store.updatePlaylist(req.user!.id, pid, { tracks }))!) });
    }),
  );
  me.delete(
    '/playlists/:pid/tracks/:id',
    ah(async (req, res) => {
      const pid = parse(uuid, req.params.pid);
      const tid = parse(id, req.params.id);
      const current = await ownPlaylist(req.user!.id, pid);
      const tracks = current.tracks.filter((t) => t.id !== tid);
      res.json({ data: toPlaylist((await store.updatePlaylist(req.user!.id, pid, { tracks }))!) });
    }),
  );
  me.delete(
    '/playlists/:pid',
    ah(async (req, res) => {
      if (!(await store.deletePlaylist(req.user!.id, parse(uuid, req.params.pid)))) throw notFound('Playlist not found');
      res.status(204).end();
    }),
  );

  // History
  me.get('/history', ah(async (req, res) => {
    const q = parse(z.object({ limit: limitQ(200, 50) }), req.query);
    const h = await store.listHistory(req.user!.id, q.limit);
    res.json({ data: h.map((x) => ({ ...x.track, playedAt: x.playedAt.toISOString() })) });
  }));
  me.post(
    '/history',
    ah(async (req, res) => {
      const body = parse(z.object({ trackId: id }), req.body);
      const track = await catalog.track(body.trackId);
      await store.addHistory({ userId: req.user!.id, track, playedAt: new Date() });
      res.status(204).end();
    }),
  );

  r.use('/me', me);
  return r;
}
