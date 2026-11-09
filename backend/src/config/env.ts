import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * All configuration comes from environment variables and is validated once at
 * boot. The process refuses to start in production with unsafe settings.
 */
const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const csv = z
  .string()
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Number of reverse proxies in front of the app (Render/Vercel/Nginx = 1). */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),

  /** HS256 signing secret for access tokens. >= 32 chars. */
  JWT_SECRET: z.string().optional(),
  JWT_ISSUER: z.string().default('aura-api'),
  JWT_AUDIENCE: z.string().default('aura-mobile'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(180).default(30),

  /** 'mongo' (persistent) or 'memory' (dev / tests only). Auto: mongo when MONGODB_URI is set. */
  STORE: z.enum(['mongo', 'memory', 'auto']).default('auto'),
  MONGODB_URI: z.string().optional(),
  MONGODB_DB: z.string().default('aura'),

  /** Browser origins allowed by CORS. Native apps don't send Origin, so this can stay empty. */
  CORS_ORIGINS: csv.default([]),

  /** Catalog providers, in priority order. */
  CATALOG_PROVIDERS: csv.default(['audius', 'deezer']),
  AUDIUS_API_BASE: z.url().default('https://api.audius.co/v1'),
  AUDIUS_APP_NAME: z.string().min(1).max(64).default('aura-music-player'),
  AUDIUS_API_KEY: z.string().optional(),
  DEEZER_API_BASE: z.url().default('https://api.deezer.com'),
  JAMENDO_API_BASE: z.url().default('https://api.jamendo.com/v3.0'),
  JAMENDO_CLIENT_ID: z.string().optional(),
  LRCLIB_API_BASE: z.url().default('https://lrclib.net/api'),
  /** AutoEq headphone presets (raw GitHub of jaakkopasanen/AutoEq). */
  AUTOEQ_BASE: z.url().default('https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master'),

  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
  CACHE_MAX_ENTRIES: z.coerce.number().int().min(100).max(100000).default(5000),

  RATE_LIMIT_GLOBAL_PER_MIN: z.coerce.number().int().min(10).default(300),
  RATE_LIMIT_AUTH_PER_15MIN: z.coerce.number().int().min(3).default(20),
  RATE_LIMIT_SEARCH_PER_MIN: z.coerce.number().int().min(5).default(90),

  /**
   * Groq (https://console.groq.com) powers "identify this song" for files a
   * user imports from their phone: an LLM cleans up messy tags / file names,
   * and Whisper can listen to a short clip when there are no usable tags.
   * Leave empty to disable the AI steps (tag + LRCLIB matching still works).
   */
  GROQ_API_KEY: z.string().trim().optional(),
  GROQ_API_BASE: z.url().default('https://api.groq.com/openai/v1'),
  GROQ_MODEL: z.string().min(1).default('openai/gpt-oss-20b'),
  GROQ_WHISPER_MODEL: z.string().min(1).default('whisper-large-v3-turbo'),
  /** Per-IP limits for /v1/identify (cheap) and /v1/identify/audio (Whisper). */
  RATE_LIMIT_IDENTIFY_PER_MIN: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_IDENTIFY_AUDIO_PER_HOUR: z.coerce.number().int().min(1).default(40),
  /** Hard cap on Groq calls per server instance per UTC day, to protect your key. */
  AI_DAILY_LIMIT: z.coerce.number().int().min(0).default(2000),

  /** Allow open sign-ups. Set to false to lock the server to existing accounts. */
  ALLOW_REGISTRATION: bool.default(true),

  /** Dev/demo only: let /play redirect to plain-http streams. Refused in production. */
  ALLOW_INSECURE_STREAMS: bool.default(false),
});

export type Env = z.infer<typeof schema> & { JWT_SECRET: string; storeKind: 'mongo' | 'memory' };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === 'production';

  let secret = env.JWT_SECRET;
  if (!secret) {
    if (isProd) throw new Error('JWT_SECRET is required in production (use 32+ random characters).');
    secret = randomBytes(48).toString('base64url');
    if (env.NODE_ENV !== 'test') {
      console.warn('[config] JWT_SECRET not set: using an ephemeral secret. Sessions reset on restart.');
    }
  }
  if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');

  const storeKind: 'mongo' | 'memory' =
    env.STORE === 'auto' ? (env.MONGODB_URI ? 'mongo' : 'memory') : env.STORE;
  if (storeKind === 'mongo' && !env.MONGODB_URI) throw new Error('STORE=mongo requires MONGODB_URI.');
  if (isProd && storeKind === 'memory' && env.STORE !== 'memory') {
    throw new Error(
      'Production needs persistent storage: set MONGODB_URI, or explicitly STORE=memory if data loss on restart is acceptable.',
    );
  }

  if (isProd && env.ALLOW_INSECURE_STREAMS) throw new Error('ALLOW_INSECURE_STREAMS must not be enabled in production.');

  const known = new Set(['audius', 'deezer', 'jamendo']);
  for (const p of env.CATALOG_PROVIDERS) {
    if (!known.has(p)) throw new Error(`Unknown catalog provider "${p}". Known: ${[...known].join(', ')}`);
  }
  if (env.CATALOG_PROVIDERS.includes('jamendo') && !env.JAMENDO_CLIENT_ID) {
    throw new Error('Provider "jamendo" needs JAMENDO_CLIENT_ID (free at devportal.jamendo.com).');
  }

  return { ...env, JWT_SECRET: secret, storeKind };
}
