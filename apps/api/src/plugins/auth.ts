import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { ForbiddenError, UnauthorizedError } from '@webs/core';

/**
 * Autenticación y autorización:
 *  - `fastify.authenticate`: preHandler que exige token de acceso válido.
 *  - `fastify.authorize(permission)`: preHandler que exige un permiso concreto.
 */
export default fp<{ jwtSecret: string }>(async (fastify, opts) => {
  await fastify.register(jwt, { secret: opts.jwtSecret });
  await fastify.register(cookie);

  fastify.decorate('authenticate', async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError('Token de acceso inválido o expirado');
    }
  });

  fastify.decorate('authorize', (permission: string) => {
    return async (request) => {
      const perms = request.user?.permissions ?? [];
      if (!perms.includes(permission)) {
        throw new ForbiddenError(`Se requiere el permiso '${permission}'`);
      }
    };
  });
});
