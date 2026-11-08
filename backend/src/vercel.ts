import type { IncomingMessage, ServerResponse } from 'node:http';
import { type BuiltApp, buildApp } from './app.js';
import { loadEnv } from './config/env.js';

/**
 * Serverless entry (Vercel). The app is built once per cold start and the
 * Mongo connection is reused across invocations.
 *
 * Startup problems (missing env vars, database unreachable) never crash the
 * function: they're logged and returned as a clear JSON error, and the
 * database connection is retried on the next request.
 */
// Deployed on Vercel = production, unless explicitly overridden.
process.env.NODE_ENV ??= 'production';

let built: BuiltApp | null = null;
let configError: string | null = null;
let ready: Promise<void> | null = null;

try {
  built = buildApp({ env: loadEnv() });
} catch (e) {
  configError = e instanceof Error ? e.message : String(e);
  console.error('[aura] configuration error:', configError);
}

function send(res: ServerResponse, status: number, code: string, message: string) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error: { code, message } }));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!built) {
    return send(res, 500, 'server_misconfigured', `Server configuration error: ${configError} Fix the environment variables in Vercel and redeploy.`);
  }
  try {
    ready ??= built.store.init();
    await ready;
  } catch (e) {
    ready = null; // retry on the next request
    console.error('[aura] database connection failed:', e);
    return send(
      res,
      503,
      'database_unavailable',
      'Could not connect to MongoDB. Check MONGODB_URI (user, password, cluster) and that Atlas Network Access allows 0.0.0.0/0.',
    );
  }
  built.app(req as never, res as never);
}
