import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const { app, store, logger } = buildApp({ env });

await store.init();
const server = app.listen(env.PORT, env.HOST, () => {
  logger.info(
    { port: env.PORT, store: env.storeKind, providers: env.CATALOG_PROVIDERS },
    `Aura API listening on http://${env.HOST}:${env.PORT}`,
  );
});
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;

const shutdown = (signal: string) => {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await store.close().catch(() => undefined);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
