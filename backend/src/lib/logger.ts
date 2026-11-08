import { pino } from 'pino';

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
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  });
}

export type Logger = ReturnType<typeof createLogger>;
