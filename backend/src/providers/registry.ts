import type { Env } from '../config/env.js';
import type { ProviderId } from '../domain/types.js';
import { createHttpClient } from '../lib/http.js';
import { createAudiusProvider } from './audius.js';
import { createDeezerProvider } from './deezer.js';
import { createJamendoProvider } from './jamendo.js';
import type { CatalogProvider } from './types.js';

const hostOf = (u: string) => new URL(u).hostname;

/** Builds the enabled providers, in the order given by CATALOG_PROVIDERS. */
export function createProviders(env: Env, fetchImpl?: typeof fetch): Map<ProviderId, CatalogProvider> {
  const http = createHttpClient({
    timeoutMs: env.UPSTREAM_TIMEOUT_MS,
    userAgent: `${env.AUDIUS_APP_NAME}/1.0 (+https://github.com/ohsinnerman/music_player)`,
    allowedHosts: [hostOf(env.AUDIUS_API_BASE), hostOf(env.DEEZER_API_BASE), hostOf(env.JAMENDO_API_BASE)],
    fetchImpl,
  });

  const map = new Map<ProviderId, CatalogProvider>();
  for (const id of env.CATALOG_PROVIDERS as ProviderId[]) {
    if (id === 'audius') {
      map.set(id, createAudiusProvider(http, { base: env.AUDIUS_API_BASE, appName: env.AUDIUS_APP_NAME, apiKey: env.AUDIUS_API_KEY }));
    } else if (id === 'deezer') {
      map.set(id, createDeezerProvider(http, env.DEEZER_API_BASE));
    } else if (id === 'jamendo' && env.JAMENDO_CLIENT_ID) {
      map.set(id, createJamendoProvider(http, env.JAMENDO_API_BASE, env.JAMENDO_CLIENT_ID));
    }
  }
  return map;
}
