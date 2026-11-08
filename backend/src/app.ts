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
  app.use('/v1', createRoutes({ env, store: db, tokens, catalog, lyrics }));
  app.use(notFoundHandler);
  app.use(errorHandler(log));

  return { app, store: db, logger: log };
}
