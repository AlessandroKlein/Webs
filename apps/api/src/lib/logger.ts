import { pino } from 'pino';

/**
 * Configuración del logger estructurado (pino). Fastify 5 recibe estas
 * opciones y crea la instancia internamente (no se pasa una instancia pino,
 * porque Fastify 5 la rechaza con FST_ERR_LOG_INVALID_LOGGER_CONFIG).
 */
export function createLogger(level = 'info') {
  return {
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
  };
}
