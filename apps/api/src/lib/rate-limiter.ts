import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import type { Redis } from 'ioredis';
import { RateLimitedError } from '@webs/core';

/**
 * Rate limiting distribuido: usa Redis (`rate-limiter-flexible`) cuando está
 * disponible y cae a memoria en un solo nodo. Sirve para proteger endpoints
 * sensibles (login/registro) con contadores compartidos entre instancias.
 */
/**
 * `rate-limiter-flexible` arma la clave final como `${keyPrefix}:${key}` (ver
 * `RateLimiterAbstract.getKey`), así que el prefix NO debe llevar `:` al final.
 * Cada limitador debe usar un prefix propio para no compartir contador en Redis:
 * el límite global y los limitadores por-IP (login/registro/etc.) operan sobre
 * la misma IP, y con el mismo prefix colisionaban en una única clave Redis.
 */
export function createRateLimiter(
  redis: Redis | null,
  points: number,
  durationSeconds: number,
  keyPrefix = 'rl',
) {
  if (redis) {
    return new RateLimiterRedis({
      storeClient: redis,
      points,
      duration: durationSeconds,
      keyPrefix,
    });
  }
  return new RateLimiterMemory({ points, duration: durationSeconds });
}

/** PreHandler que limita por IP. */
export function ipLimiter(
  redis: Redis | null,
  points: number,
  durationSeconds: number,
  keyPrefix = 'rl:ip',
) {
  const limiter = createRateLimiter(redis, points, durationSeconds, keyPrefix);
  return async (request: { ip: string }) => {
    try {
      await limiter.consume(request.ip);
    } catch {
      throw new RateLimitedError('Demasiadas peticiones desde esta IP, intentá más tarde');
    }
  };
}
