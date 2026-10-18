import { pino, type Logger } from 'pino';

/**
 * Logger estructurado (pino). Fastify lo reutiliza internamente, por lo que
 * todas las peticiones y logs de negocio comparten el mismo formato JSON.
 */
export function createLogger(level = 'info'): Logger {
  return pino({
    level,
    base: { service: 'webs-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'passwordHash',
        'refreshToken',
      ],
      censor: '[REDACTED]',
    },
  });
}
