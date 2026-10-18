import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { ConflictError, UnauthorizedError } from '@webs/core';
import { findUserWithPermissions, type UserProfile } from '../../lib/user';
import {
  resetEmailHtml,
  sendMail,
  verificationEmailHtml,
} from '../mail/service';
import type { AccessTokenPayload } from '../../types/auth';
import { emitEvent } from '../email/events';
import { verifyCode } from './two-factor';

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 15; // 15 minutos
export const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 días

export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(fastify: FastifyInstance, profile: UserProfile): string {
  return fastify.jwt.sign(
    {
      sub: profile.id,
      email: profile.email,
      permissions: profile.permissions,
      type: 'access' as const,
    },
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  );
}

export async function createSession(
  fastify: FastifyInstance,
  userId: string,
  meta: { userAgent?: string; ip?: string },
): Promise<string> {
  const token = generateRefreshToken();
  await fastify.prisma.session.create({
    data: {
      userId,
      refreshToken: hashRefreshToken(token),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return token;
}

export type LoginResult = UserProfile | { twoFactorRequired: true };

export async function login(
  fastify: FastifyInstance,
  email: string,
  password: string,
  totp?: string,
): Promise<LoginResult> {
  const user = await fastify.prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    throw new UnauthorizedError('Correo o contraseña inválidos');
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Correo o contraseña inválidos');
  }

  if (user.twoFactorEnabled) {
    if (!totp) return { twoFactorRequired: true };
    if (!user.twoFactorSecret || !verifyCode(user.twoFactorSecret, totp)) {
      throw new UnauthorizedError('Código de verificación inválido');
    }
  }

  const profile = await findUserWithPermissions(fastify, user.id);
  if (!profile) throw new UnauthorizedError();
  return profile;
}

export async function registerUser(
  fastify: FastifyInstance,
  input: { email: string; password: string; displayName?: string },
): Promise<UserProfile> {
  const existing = await fastify.prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError('El correo ya está registrado');

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await fastify.prisma.user.create({
    data: { email: input.email, passwordHash, displayName: input.displayName ?? null },
  });

  const userRole = await fastify.prisma.role.findUnique({ where: { key: 'user' } });
  if (userRole) {
    await fastify.prisma.userRole.create({ data: { userId: user.id, roleId: userRole.id } });
  }

  const profile = await findUserWithPermissions(fastify, user.id);
  if (!profile) throw new UnauthorizedError();
  return profile;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export async function refreshSession(
  fastify: FastifyInstance,
  rawToken: string,
): Promise<RefreshResult> {
  const session = await fastify.prisma.session.findUnique({
    where: { refreshToken: hashRefreshToken(rawToken) },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new UnauthorizedError('Sesión inválida o expirada');
  }

  const profile = await findUserWithPermissions(fastify, session.userId);
  if (!profile || !profile.active) throw new UnauthorizedError();

  // Rotación: revoca la sesión actual y emite una nueva.
  await fastify.prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  const newToken = await createSession(fastify, session.userId, {
    userAgent: session.userAgent ?? undefined,
    ip: session.ip ?? undefined,
  });

  return {
    accessToken: signAccessToken(fastify, profile),
    refreshToken: newToken,
    user: profile,
  };
}

export async function revokeSession(fastify: FastifyInstance, rawToken: string): Promise<void> {
  if (!rawToken) return;
  await fastify.prisma.session.updateMany({
    where: { refreshToken: hashRefreshToken(rawToken) },
    data: { revokedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Verificación de correo y recuperación de contraseña (vía SMTP)
// ---------------------------------------------------------------------------

type EmailTokenPurpose = 'verify' | 'reset';

function signEmailToken(fastify: FastifyInstance, userId: string, purpose: EmailTokenPurpose): string {
  return fastify.jwt.sign(
    { sub: userId, purpose } as unknown as AccessTokenPayload,
    { expiresIn: purpose === 'verify' ? '24h' : '1h' },
  );
}

function verifyEmailToken(fastify: FastifyInstance, token: string, expected: EmailTokenPurpose): string {
  try {
    const payload = fastify.jwt.verify<{ sub: string; purpose: string }>(token);
    if (payload.purpose !== expected) throw new Error('propósito inválido');
    return payload.sub;
  } catch {
    throw new UnauthorizedError('Token inválido o expirado');
  }
}

async function getSiteName(fastify: FastifyInstance): Promise<string> {
  const site = await fastify.prisma.setting.findUnique({ where: { key: 'site' } });
  const value = site?.value as { name?: string } | undefined;
  return value?.name ?? 'Webs';
}

function webOrigin(fastify: FastifyInstance): string {
  const first = fastify.config.CORS_ORIGIN.split(',')[0];
  return (first ?? 'http://localhost:5173').trim();
}

/** Envía el correo de verificación (no bloquea). */
export async function sendVerificationEmail(
  fastify: FastifyInstance,
  user: { id: string; email: string },
): Promise<void> {
  const token = signEmailToken(fastify, user.id, 'verify');
  const link = `${webOrigin(fastify)}/verify-email?token=${token}`;
  const siteName = await getSiteName(fastify);
  void sendMail(fastify, {
    to: user.email,
    subject: 'Verificá tu correo electrónico',
    html: verificationEmailHtml(siteName, link),
  }).catch((err) => fastify.log.warn({ err }, 'no se pudo enviar correo de verificación'));
}

/** Marca el correo como verificado. */
export async function verifyEmail(fastify: FastifyInstance, token: string): Promise<void> {
  const userId = verifyEmailToken(fastify, token, 'verify');
  await fastify.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  const user = await fastify.prisma.user.findUnique({ where: { id: userId } });
  if (user) {
    void emitEvent(fastify, 'user.email_verified', {
      user: { id: user.id, email: user.email, name: user.displayName ?? undefined },
    });
  }
}

/** Envía el enlace de recuperación (no revela si el correo existe). */
export async function forgotPassword(fastify: FastifyInstance, email: string): Promise<void> {
  const user = await fastify.prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const token = signEmailToken(fastify, user.id, 'reset');
  const link = `${webOrigin(fastify)}/reset-password?token=${token}`;
  const siteName = await getSiteName(fastify);
  void sendMail(fastify, {
    to: user.email,
    subject: 'Restablecer contraseña',
    html: resetEmailHtml(siteName, link),
  }).catch((err) => fastify.log.warn({ err }, 'no se pudo enviar correo de recuperación'));
}

/** Restablece la contraseña y revoca todas las sesiones del usuario. */
export async function resetPassword(
  fastify: FastifyInstance,
  token: string,
  newPassword: string,
): Promise<void> {
  const userId = verifyEmailToken(fastify, token, 'reset');
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await fastify.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await fastify.prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const user = await fastify.prisma.user.findUnique({ where: { id: userId } });
  if (user) {
    void emitEvent(fastify, 'user.password_changed', {
      user: { id: user.id, email: user.email, name: user.displayName ?? undefined },
    });
  }
}
