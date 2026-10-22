import fp from 'fastify-plugin';
import { RateLimitedError } from '@webs/core';
import { createRateLimiter } from '../lib/rate-limiter';

/**
 * Límite global de peticiones por IP respaldado en Redis (`rate-limiter-flexible`).
 *
 * F6 (P1): el límite anterior (`@fastify/rate-limit` sin store) vivía EN MEMORIA
 * por instancia, de modo que en multi-instancia/auto-scaling cada réplica tenía su
 * propio contador (eludible repartiendo peticiones entre nodos). Ahora el estado
 * vive en Redis (con fallback a memoria para dev/test en un solo nodo) y el límite
 * es global para todo el clúster.
 */
export default fp(async (fastify) => {
  const limiter = createRateLimiter(fastify.redis, 300, 60);
  fastify.addHook('onRequest', async (request) => {
    try {
      await limiter.consume(request.ip);
    } catch {
      throw new RateLimitedError('Demasiadas peticiones desde esta IP, intentá más tarde');
    }
  });
});
