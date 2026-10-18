import fp from 'fastify-plugin';
import sensible from '@fastify/sensible';

/** Utilidades HTTP (httpErrors, asserts). */
export default fp(async (fastify) => {
  await fastify.register(sensible);
});
