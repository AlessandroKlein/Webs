import type { FastifyInstance } from 'fastify';
import { REFRESH_TOKEN_COOKIE } from '@webs/core';
import { findUserWithPermissions, toPublicUser } from '../../lib/user';
import { audit } from '../../lib/audit';
import {
  createSession,
  login,
  refreshSession,
  registerUser,
  revokeSession,
  signAccessToken,
  REFRESH_TOKEN_TTL_MS,
} from './service';
import { loginSchema, registerSchema, type LoginBody, type RegisterBody } from './schema';

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const setRefreshCookie = (reply: import('fastify').FastifyReply, token: string) => {
    reply.setCookie(REFRESH_TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: fastify.config.NODE_ENV === 'production',
      path: '/',
      maxAge: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
    });
  };

  fastify.post(
    '/auth/login',
    { schema: { tags: ['auth'], body: loginSchema } },
    async (request, reply) => {
      const { email, password } = request.body as LoginBody;
      const profile = await login(fastify, email, password);

      const accessToken = signAccessToken(fastify, profile);
      const refreshToken = await createSession(fastify, profile.id, {
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });
      setRefreshCookie(reply, refreshToken);

      audit(fastify, request, { actorId: profile.id, action: 'auth.login' });
      return { accessToken, refreshToken, user: toPublicUser(profile) };
    },
  );

  fastify.post(
    '/auth/register',
    { schema: { tags: ['auth'], body: registerSchema } },
    async (request, reply) => {
      const { email, password, displayName } = request.body as RegisterBody;
      const profile = await registerUser(fastify, { email, password, displayName });

      const accessToken = signAccessToken(fastify, profile);
      const refreshToken = await createSession(fastify, profile.id, {
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });
      setRefreshCookie(reply, refreshToken);

      audit(fastify, request, { actorId: profile.id, action: 'auth.register' });
      return reply.status(201).send({
        accessToken,
        refreshToken,
        user: toPublicUser(profile),
      });
    },
  );

  fastify.post('/auth/refresh', { schema: { tags: ['auth'] } }, async (request, reply) => {
    const token =
      (request.body as { refreshToken?: string })?.refreshToken ??
      request.cookies[REFRESH_TOKEN_COOKIE];
    if (!token) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Sin sesión' } });
    }
    const result = await refreshSession(fastify, token);
    setRefreshCookie(reply, result.refreshToken);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken, user: toPublicUser(result.user) };
  });

  fastify.post('/auth/logout', { schema: { tags: ['auth'] } }, async (request, reply) => {
    const token =
      (request.body as { refreshToken?: string })?.refreshToken ??
      request.cookies[REFRESH_TOKEN_COOKIE];
    await revokeSession(fastify, token ?? '');
    reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
    return { ok: true };
  });

  fastify.get(
    '/auth/me',
    { schema: { tags: ['auth'] }, preHandler: [fastify.authenticate] },
    async (request) => {
      const profile = await findUserWithPermissions(fastify, request.user.sub);
      if (!profile) {
        return { user: null };
      }
      return { user: toPublicUser(profile), permissions: profile.permissions };
    },
  );
}
