import fp from 'fastify-plugin';
import { RateLimitedError } from '@webs/core';
import { createRateLimiter } from '../lib/rate-limiter';

/**
 * Límite global de peticiones por IP respaldado en Redis (`rate-limiter-flexible`).
 *
 * F6 (P1) + t49: el estado vive en Redis (con fallback a memoria para dev/test en
 * un solo nodo) y el límite es global para todo el clúster. El limitador se crea
 * de forma LAZY en el primer request porque este plugin se registra ANTES que
 * `redisPlugin` (que decora `fastify.redis`): en modo instalación `fastify.redis`
 * ya está disponible al llegar la primera petición, y en modo setup (sin redis)
 * cae a memoria.
 */
export default fp(async (fastify) => {
  let limiter: ReturnType<typeof createRateLimiter> | null = null;
  fastify.addHook('onRequest', async (request) => {
    if (!limiter) limiter = createRateLimiter(fastify.redis, 300, 60, 'rl:global');
    try {
      await limiter.consume(request.ip);
    } catch {
      throw new RateLimitedError('Demasiadas peticiones desde esta IP, intentá más tarde');
    }
  });
});
