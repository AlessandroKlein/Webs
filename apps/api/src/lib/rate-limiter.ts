import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import type { Redis } from 'ioredis';
import { RateLimitedError } from '@webs/core';

/**
 * Rate limiting distribuido: usa Redis (`rate-limiter-flexible`) cuando está
 * disponible y cae a memoria en un solo nodo. Sirve para proteger endpoints
 * sensibles (login/registro) con contadores compartidos entre instancias.
 */
export function createRateLimiter(redis: Redis | null, points: number, durationSeconds: number) {
  if (redis) {
    return new RateLimiterRedis({
      storeClient: redis,
      points,
      duration: durationSeconds,
      keyPrefix: 'rl:',
    });
  }
  return new RateLimiterMemory({ points, duration: durationSeconds });
}

/** PreHandler que limita por IP. */
export function ipLimiter(redis: Redis | null, points: number, durationSeconds: number) {
  const limiter = createRateLimiter(redis, points, durationSeconds);
  return async (request: { ip: string }) => {
    try {
      await limiter.consume(request.ip);
    } catch {
      throw new RateLimitedError('Demasiadas peticiones desde esta IP, intentá más tarde');
    }
  };
}
