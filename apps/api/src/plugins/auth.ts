import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { ForbiddenError, RateLimitedError, UnauthorizedError } from '@webs/core';
import type { AccessTokenPayload } from '../types/auth';
import { checkTokenRateLimit } from '../lib/token-rate-limit';

/**
 * Autenticación y autorización:
 *  - `fastify.authenticate`: preHandler que acepta un token de acceso (JWT) o un
 *    token de API (JWT con `type: 'api_token'`, verificado contra la BD).
 *  - `fastify.authorize(permission)`: preHandler que exige un permiso concreto.
 */
export default fp<{ jwtSecret: string }>(async (fastify, opts) => {
  await fastify.register(jwt, { secret: opts.jwtSecret });
  await fastify.register(cookie);

  fastify.decorate('authenticate', async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError('Token inválido o expirado');
    }

    const payload = request.user;

    // Token de configuración de 2FA: sin permisos, solo para activar 2FA/passkey.
    if (payload.type === 'setup_2fa') {
      request.user = { sub: payload.sub, permissions: [] } as AccessTokenPayload;
      return;
    }

    // Token de API: valida que siga vigente en BD y aplica sus scopes.
    if (payload.type === 'api_token') {
      if (!payload.tokenId) throw new UnauthorizedError('Token inválido');
      const token = await fastify.prisma.apiToken.findUnique({ where: { id: payload.tokenId } });
      if (!token || token.revokedAt || (token.expiresAt && token.expiresAt < new Date())) {
        throw new UnauthorizedError('API token inválido o revocado');
      }
      if (token.rateLimit && !checkTokenRateLimit(token.id, token.rateLimit)) {
        throw new RateLimitedError('Límite de peticiones del API token excedido');
      }
      void fastify.prisma.apiToken
        .update({
          where: { id: token.id },
          data: { lastUsedAt: new Date(), requestCount: { increment: 1 } },
        })
        .catch(() => {});
      request.user = {
        sub: token.userId,
        permissions: (token.scopes as string[]) ?? [],
      } as AccessTokenPayload;
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

