import { createRequire } from 'node:module';
import { pino } from 'pino';

/** Pretty logs only for a human at a terminal, and only if pino-pretty is installed (it's a dev dependency). */
function canPrettyPrint(): boolean {
  if (!process.stdout.isTTY) return false;
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

export function createLogger(level: string, pretty: boolean) {
  return pino({
    level,
    // Never let credentials or tokens reach the logs.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.refreshToken',
        '*.accessToken',
        '*.token',
      ],
      censor: '[redacted]',
    },
    ...(pretty && canPrettyPrint() ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  });
}

export type Logger = ReturnType<typeof createLogger>;
