import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env.js';
import { errorHandler, limiter, notFoundHandler, requestId } from './http/middleware.js';
import { createRoutes } from './http/routes.js';
import { TtlCache } from './lib/cache.js';
import { createHttpClient } from './lib/http.js';
import { createLogger, type Logger } from './lib/logger.js';
import { createProviders } from './providers/registry.js';
import { createTokenService } from './security/tokens.js';
import { createCatalogService } from './services/catalog.js';
import { createGroq } from './services/groq.js';
import { createAutoEqService } from './services/autoeq.js';
import { createEnrichService } from './services/enrich.js';
import { createIdentifyService } from './services/identify.js';
import { createLyricsService } from './services/lyrics.js';
import { createMemoryStore } from './store/memory.js';
import { createMongoStore } from './store/mongo.js';
import type { Store } from './store/types.js';

export interface AppDeps {
  env: Env;
  store?: Store;
  logger?: Logger;
  /** Injected in tests to fake upstream music APIs. */
  fetchImpl?: typeof fetch;
}

export interface BuiltApp {
  app: Express;
  store: Store;
  logger: Logger;
}

export function buildApp({ env, store, logger, fetchImpl }: AppDeps): BuiltApp {
  const log = logger ?? createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
  const db = store ?? (env.storeKind === 'mongo' ? createMongoStore(env.MONGODB_URI!, env.MONGODB_DB) : createMemoryStore());
  const cache = new TtlCache(env.CACHE_MAX_ENTRIES);
  const providers = createProviders(env, fetchImpl);
  const catalog = createCatalogService(providers, cache);
  const lyricsHttp = createHttpClient({
    timeoutMs: env.UPSTREAM_TIMEOUT_MS,
    userAgent: `${env.AUDIUS_APP_NAME}/1.0 (+https://github.com/ohsinnerman/music_player)`,
    allowedHosts: [new URL(env.LRCLIB_API_BASE).hostname],
    fetchImpl,
  });
  const lyrics = createLyricsService(lyricsHttp, env.LRCLIB_API_BASE, cache);
  const tokens = createTokenService(env, db);
  const autoeq = createAutoEqService(
    createHttpClient({ timeoutMs: env.UPSTREAM_TIMEOUT_MS, userAgent: `${env.AUDIUS_APP_NAME}/1.0`, allowedHosts: [new URL(env.AUTOEQ_BASE).hostname], fetchImpl }),
    env.AUTOEQ_BASE,
    cache,
  );

  // Optional AI song identification (Groq). Budgeted per instance per UTC day.
  const groq = env.GROQ_API_KEY
    ? createGroq({ apiKey: env.GROQ_API_KEY, base: env.GROQ_API_BASE, model: env.GROQ_MODEL, whisperModel: env.GROQ_WHISPER_MODEL, fetchImpl })
    : null;
  const budget = { day: '', used: 0 };
  const allowAi = () => {
    const day = new Date().toISOString().slice(0, 10);
    if (budget.day !== day) Object.assign(budget, { day, used: 0 });
    if (budget.used >= env.AI_DAILY_LIMIT) return false;
    budget.used++;
    return true;
  };
  const identify = createIdentifyService({
    lyrics,
    groq,
    allowAi,
  });

  const host = (u: string) => new URL(u).hostname;
  const enrich = createEnrichService({
    http: createHttpClient({
      timeoutMs: env.UPSTREAM_TIMEOUT_MS,
      userAgent: `Aura/1.1 (+https://github.com/ohsinnerman/music_player)`,
      allowedHosts: [host(env.DEEZER_API_BASE), host(env.MUSICBRAINZ_API_BASE), host(env.WIKIPEDIA_BASE)],
      fetchImpl,
    }),
    bases: { deezer: env.DEEZER_API_BASE.replace(/\/$/, ''), musicbrainz: env.MUSICBRAINZ_API_BASE.replace(/\/$/, ''), coverart: env.COVERART_BASE.replace(/\/$/, ''), wikipedia: env.WIKIPEDIA_BASE.replace(/\/$/, '') },
    cache,
    groq,
    allowAi,
  });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.set('etag', 'strong');

  app.use(requestId);
  if (env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger: log,
        genReqId: (req) => (req as express.Request).id,
        customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
        serializers: {
          req: (req: { method: string; url: string; id: string }) => ({ id: req.id, method: req.method, url: req.url?.split('?')[0] }),
        },
      }),
    );
  }

  // A JSON API: lock the CSP down completely.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      strictTransportSecurity: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.CORS_ORIGINS.includes(origin)),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use(limiter(60_000, env.RATE_LIMIT_GLOBAL_PER_MIN, 'global'));

  app.get('/', (_req, res) => {
    res.json({ name: 'Aura Music API', docs: 'https://github.com/ohsinnerman/music_player/tree/main/docs', health: '/v1/health' });
  });
  app.use('/v1', createRoutes({ env, store: db, tokens, catalog, lyrics, identify, autoeq, enrich }));
  app.use(notFoundHandler);
  app.use(errorHandler(log));

  return { app, store: db, logger: log };
}
