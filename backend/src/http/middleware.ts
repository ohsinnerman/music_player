import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { AppError, unauthorized } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { TokenService } from '../security/tokens.js';
import type { Store, UserRecord } from '../store/types.js';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
    user?: UserRecord;
  }
}

/** Wrap async handlers so rejections reach the error handler. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  req.id = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};

export function authMiddleware(tokens: TokenService, store: Store) {
  async function resolve(req: Request): Promise<UserRecord | undefined> {
    const h = req.header('authorization');
    if (!h) return undefined;
    const [scheme, token] = h.split(' ');
    if (scheme !== 'Bearer' || !token || token.length > 4096) throw unauthorized('Malformed authorization header');
    const claims = await tokens.verifyAccess(token);
    const user = await store.findUserById(claims.sub);
    // tokenVersion lets us invalidate every outstanding access token at once.
    if (!user || user.tokenVersion !== claims.ver) throw unauthorized('Session expired');
    return user;
  }
  return {
    requireAuth: ah(async (req, _res, next) => {
      const user = await resolve(req);
      if (!user) throw unauthorized();
      req.user = user;
      next();
    }),
    optionalAuth: ah(async (req, _res, next) => {
      try {
        req.user = await resolve(req);
      } catch {
        req.user = undefined;
      }
      next();
    }),
  };
}

/** Parse and validate request parts with zod; throws a 400 with field details. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new AppError(
      400,
      'validation_failed',
      r.error.issues[0]?.message ?? 'Invalid request',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}

export function limiter(windowMs: number, limit: number, keyPrefix: string, keyFn?: (req: Request) => string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: keyFn ? (req) => `${keyPrefix}:${keyFn(req)}` : undefined,
    handler: (req, res) => {
      res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests, slow down a little', requestId: req.id } });
    },
  });
}

export function errorHandler(log: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    void _next;
    if (err instanceof AppError) {
      if (err.status >= 500) log.warn({ err, reqId: req.id }, err.message);
      res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details, requestId: req.id } });
      return;
    }
    // Body-parser errors (bad JSON, too large).
    const status = typeof err?.status === 'number' ? err.status : typeof err?.statusCode === 'number' ? err.statusCode : 500;
    if (status === 400 || status === 413 || status === 415) {
      res.status(status).json({ error: { code: status === 413 ? 'payload_too_large' : 'bad_request', message: status === 413 ? 'Request body too large' : 'Malformed request', requestId: req.id } });
      return;
    }
    log.error({ err, reqId: req.id }, 'unhandled error');
    res.status(500).json({ error: { code: 'internal', message: 'Something went wrong', requestId: req.id } });
  };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found', requestId: req.id } });
};
