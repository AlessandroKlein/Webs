import type { FastifyInstance } from 'fastify';
import { REFRESH_TOKEN_COOKIE } from '@webs/core';
import { findUserWithPermissions, toPublicUser } from '../../lib/user';
import { audit } from '../../lib/audit';
import { emitEvent } from '../email/events';
import {
  createSession,
  forgotPassword,
  login,
  refreshSession,
  registerUser,
  resetPassword,
  revokeSession,
  sendVerificationEmail,
  signAccessToken,
  verifyEmail,
  REFRESH_TOKEN_TTL_MS,
} from './service';
import { loginSchema, registerSchema, type LoginBody, type RegisterBody } from './schema';
import { confirmTwoFactor, disableTwoFactor, setupTwoFactor } from './two-factor';

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const setRefreshCookie = (reply: import('fastify').FastifyReply, token: string) => {
    const secureCookies =
      fastify.securitySettings?.secureCookies ?? fastify.config.NODE_ENV === 'production';
    reply.setCookie(REFRESH_TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
      path: '/',
      maxAge: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
    });
  };

  fastify.post(
    '/auth/login',
    {
      schema: { tags: ['auth'], body: loginSchema },
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const { email, password, totp } = request.body as LoginBody;
      const result = await login(fastify, email, password, totp);

      if ('twoFactorRequired' in result) {
        return reply.status(401).send({
          error: { code: 'TWO_FACTOR_REQUIRED', message: 'Se requiere código de verificación (2FA)' },
        });
      }

      const profile = result;
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
    {
      schema: { tags: ['auth'], body: registerSchema },
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
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
      void sendVerificationEmail(fastify, profile);
      void emitEvent(fastify, 'user.registered', {
        user: { id: profile.id, email: profile.email, name: profile.displayName ?? undefined },
      });
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

  // -------- Verificación de correo y recuperación de contraseña --------

  fastify.post(
    '/auth/verify-email',
    { schema: { tags: ['auth'] } },
    async (request) => {
      const { token } = request.body as { token: string };
      if (!token) return fastify.httpErrors.badRequest('Falta el token');
      await verifyEmail(fastify, token);
      return { ok: true };
    },
  );

  fastify.post(
    '/auth/forgot-password',
    { schema: { tags: ['auth'] }, config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request) => {
      const { email } = request.body as { email: string };
      if (email) await forgotPassword(fastify, email);
      // Siempre 200 para no revelar si el correo existe.
      return { ok: true };
    },
  );

  fastify.post(
    '/auth/reset-password',
    { schema: { tags: ['auth'] }, config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request) => {
      const { token, password } = request.body as { token: string; password: string };
      if (!token || !password) return fastify.httpErrors.badRequest('Faltan token o contraseña');
      await resetPassword(fastify, token, password);
      return { ok: true };
    },
  );

  // -------- Autenticación de dos factores (TOTP) --------

  fastify.post(
    '/auth/2fa/setup',
    { schema: { tags: ['auth'] }, preHandler: [fastify.authenticate] },
    async (request) => setupTwoFactor(fastify, request.user.sub),
  );

  fastify.post(
    '/auth/2fa/confirm',
    { schema: { tags: ['auth'] }, preHandler: [fastify.authenticate] },
    async (request) => {
      const { code } = request.body as { code: string };
      if (!code) return fastify.httpErrors.badRequest('Falta el código');
      await confirmTwoFactor(fastify, request.user.sub, code);
      return { ok: true };
    },
  );

  fastify.post(
    '/auth/2fa/disable',
    { schema: { tags: ['auth'] }, preHandler: [fastify.authenticate] },
    async (request) => {
      const { code } = request.body as { code: string };
      if (!code) return fastify.httpErrors.badRequest('Falta el código');
      await disableTwoFactor(fastify, request.user.sub, code);
      return { ok: true };
    },
  );
}
