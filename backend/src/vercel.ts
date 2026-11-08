import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

/**
 * Serverless entry (Vercel). The app is built once per cold start and the
 * Mongo connection is reused across invocations.
 */
const env = loadEnv();
const { app, store } = buildApp({ env });
const ready = store.init();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await ready;
  app(req as never, res as never);
}
