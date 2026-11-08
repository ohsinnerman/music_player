import type { ProviderId } from '../domain/types.js';
import { badRequest } from './errors.js';

/**
 * Public IDs are namespaced by provider: "audius:D7KyD", "deezer:3135556".
 * The raw part is restricted to a safe charset so it can never inject paths
 * or query strings into upstream URLs.
 */
export const ID_PATTERN = /^(audius|deezer|jamendo):([A-Za-z0-9_-]{1,64})$/;

export function makeId(provider: ProviderId, raw: string | number): string {
  return `${provider}:${raw}`;
}

export function parseId(id: string): { provider: ProviderId; raw: string } {
  const m = ID_PATTERN.exec(id);
  if (!m) throw badRequest('Invalid id');
  return { provider: m[1] as ProviderId, raw: m[2]! };
}

export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id);
}
