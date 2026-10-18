import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

/**
 * Límite de peticiones por IP. En un despliegue en cluster, conectar un store
 * Redis (`@fastify/rate-limit` acepta `redis` como store) para que el límite
 * sea global y no por instancia.
 */
export default fp(async (fastify) => {
  await fastify.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  });
});
