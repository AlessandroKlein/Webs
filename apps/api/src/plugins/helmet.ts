import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';

/** Cabeceras de seguridad estándar. */
export default fp(async (fastify) => {
  await fastify.register(helmet, {
    // En producción, ajustar según el hosting (CSP con el dominio real).
    contentSecurityPolicy: false,
  });
});
