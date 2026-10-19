import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from '@simplewebauthn/types';
import { REFRESH_TOKEN_COOKIE, UnauthorizedError } from '@webs/core';
import { findUserWithPermissions, toPublicUser } from '../../lib/user';
import { createSession, signAccessToken, REFRESH_TOKEN_TTL_MS } from './service';

/**
 * FIDO2 / Passkeys (WebAuthn): autenticación con llaves de seguridad o biometría
 * del dispositivo, sin contraseña. Complementa (no reemplaza) la contraseña/2FA.
 */

// Desafíos WebAuthn: Redis (compartido en clúster) con fallback a memoria.
const CHALLENGES = new Map<string, { value: string; expiresAt: number }>();

function rpId(): string {
  return process.env.WEBAUTHN_RP_ID ?? 'localhost';
}

function origin(fastify: FastifyInstance): string {
  return (fastify.config.CORS_ORIGIN.split(',')[0] ?? 'http://localhost:5173').trim();
}

async function storeChallenge(redis: Redis | null, value: string): Promise<string> {
  const id = randomBytes(16).toString('hex');
  if (redis) {
    await redis.set(`webauthn:challenge:${id}`, value, 'EX', 300);
    return id;
  }
  CHALLENGES.set(id, { value, expiresAt: Date.now() + 5 * 60_000 });
  return id;
}

async function takeChallenge(redis: Redis | null, id: string): Promise<string | null> {
  if (redis) {
    const value = await redis.get(`webauthn:challenge:${id}`);
    if (value) await redis.del(`webauthn:challenge:${id}`);
    return value;
  }
  const c = CHALLENGES.get(id);
  if (!c) return null;
  CHALLENGES.delete(id);
  if (c.expiresAt < Date.now()) return null;
  return c.value;
}

const toB64 = (u: Uint8Array): string => Buffer.from(u).toString('base64url');
const fromB64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64url'));

function setRefreshCookie(fastify: FastifyInstance, reply: import('fastify').FastifyReply, token: string) {
  const secure = fastify.securitySettings?.secureCookies ?? reply.request.protocol === 'https';
  reply.setCookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
  });
}

export default async function passkeyRoutes(fastify: FastifyInstance): Promise<void> {
  // -------- Registro de passkey --------
  fastify.post(
    '/auth/passkey/register/options',
    { schema: { tags: ['auth'] }, preHandler: [fastify.authenticate] },
    async (request) => {
      const user = await fastify.prisma.user.findUnique({ where: { id: request.user.sub } });
      if (!user) throw new UnauthorizedError();

      const existing = await fastify.prisma.passkey.findMany({ where: { userId: user.id } });
      const options = await generateRegistrationOptions({
        rpName: 'Webs',
        rpID: rpId(),
        userID: new TextEncoder().encode(user.id),
        userName: user.email,
        attestationType: 'none',
        excludeCredentials: existing.map((p) => ({
          id: p.credentialId,
          transports: (p.transports as AuthenticatorTransportFuture[]) ?? [],
        })),
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      });

      const challengeId = await storeChallenge(fastify.redis, options.challenge);
      return { challengeId, options };
    },
  );

  fastify.post(
    '/auth/passkey/register/verify',
    { schema: { tags: ['auth'] }, preHandler: [fastify.authenticate] },
    async (request) => {
      const { challengeId, credential } = request.body as {
        challengeId: string;
        credential: RegistrationResponseJSON;
      };
      const expectedChallenge = await takeChallenge(fastify.redis, challengeId);
      if (!expectedChallenge) throw new UnauthorizedError('Desafío expirado o inválido');

      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge,
        expectedOrigin: origin(fastify),
        expectedRPID: rpId(),
      });

      if (!verification.verified || !verification.registrationInfo) {
        throw new UnauthorizedError('Verificación de passkey fallida');
      }

      const info = verification.registrationInfo;
      await fastify.prisma.passkey.create({
        data: {
          userId: request.user.sub,
          credentialId: info.credentialID,
          publicKey: toB64(info.credentialPublicKey),
          counter: info.counter,
          transports: credential.response?.transports ?? [],
          deviceName: request.headers['user-agent']?.slice(0, 120) ?? null,
        },
      });

      return { ok: true };
    },
  );

  // -------- Login con passkey (sin contraseña) --------
  fastify.post(
    '/auth/passkey/login/options',
    { schema: { tags: ['auth'] } },
    async () => {
      const options = await generateAuthenticationOptions({
        rpID: rpId(),
        userVerification: 'preferred',
      });
      const challengeId = await storeChallenge(fastify.redis, options.challenge);
      return { challengeId, options };
    },
  );

  fastify.post(
    '/auth/passkey/login/verify',
    { schema: { tags: ['auth'] } },
    async (request, reply) => {
      const { challengeId, credential } = request.body as {
        challengeId: string;
        credential: AuthenticationResponseJSON;
      };
      const expectedChallenge = await takeChallenge(fastify.redis, challengeId);
      if (!expectedChallenge) throw new UnauthorizedError('Desafío expirado o inválido');

      const passkey = await fastify.prisma.passkey.findUnique({
        where: { credentialId: credential.id },
      });
      if (!passkey) throw new UnauthorizedError('Passkey no registrada');

      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge,
        expectedOrigin: origin(fastify),
        expectedRPID: rpId(),
        authenticator: {
          credentialID: passkey.credentialId,
          credentialPublicKey: fromB64(passkey.publicKey),
          counter: passkey.counter,
          transports: (passkey.transports as AuthenticatorTransportFuture[]) ?? [],
        },
      });

      if (!verification.verified) throw new UnauthorizedError('Verificación de passkey fallida');

      await fastify.prisma.passkey.update({
        where: { id: passkey.id },
        data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
      });

      const profile = await findUserWithPermissions(fastify, passkey.userId);
      if (!profile || !profile.active) throw new UnauthorizedError();

      const accessToken = signAccessToken(fastify, profile);
      const refreshToken = await createSession(fastify, profile.id, {
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });
      setRefreshCookie(fastify, reply, refreshToken);

      return { accessToken, refreshToken, user: toPublicUser(profile) };
    },
  );

  // -------- Gestión de passkeys --------
  fastify.get(
    '/auth/passkeys',
    { schema: { tags: ['auth'] }, preHandler: [fastify.authenticate] },
    async (request) =>
      fastify.prisma.passkey.findMany({
        where: { userId: request.user.sub },
        orderBy: { createdAt: 'desc' },
        select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
      }),
  );

  fastify.delete(
    '/auth/passkeys/:id',
    {
      schema: { tags: ['auth'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const passkey = await fastify.prisma.passkey.findFirst({
        where: { id: (request.params as { id: string }).id, userId: request.user.sub },
      });
      if (passkey) await fastify.prisma.passkey.delete({ where: { id: passkey.id } });
      return reply.status(204).send();
    },
  );

  // Renombrar una passkey (gestión de dispositivos).
  fastify.patch(
    '/auth/passkeys/:id',
    {
      schema: {
        tags: ['auth'],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: { type: 'object', required: ['deviceName'], properties: { deviceName: { type: 'string', minLength: 1 } } },
      },
      preHandler: [fastify.authenticate],
    },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const { deviceName } = request.body as { deviceName: string };
      const passkey = await fastify.prisma.passkey.findFirst({ where: { id, userId: request.user.sub } });
      if (!passkey) throw new UnauthorizedError('Passkey no encontrada');
      return fastify.prisma.passkey.update({ where: { id }, data: { deviceName } });
    },
  );
}
