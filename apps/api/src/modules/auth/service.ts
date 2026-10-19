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
import { verifyTwoFactorCode } from './two-factor';
import { sendSmsOtp, verifySmsOtp } from './sms-otp';

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 15; // 15 minutos
export const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 días
export const REMEMBER_ME_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 días

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
  ttlMs: number = REFRESH_TOKEN_TTL_MS,
): Promise<string> {
  const token = generateRefreshToken();
  await fastify.prisma.session.create({
    data: {
      userId,
      refreshToken: hashRefreshToken(token),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return token;
}

export type LoginResult = UserProfile | { twoFactorRequired: true } | { twoFactorSetupRequired: true; setupToken: string } | { smsRequired: true };

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/**
 * Determina si un usuario sin 2FA/passkey debe activarlo antes de continuar:
 * la política "requerir 2FA a admins" está activa y el usuario tiene un rol
 * privilegiado (super_admin/admin) y no tiene 2FA ni passkey registradas.
 */
async function shouldRequireTwoFactor(fastify: FastifyInstance, userId: string): Promise<boolean> {
  const user = await fastify.prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.twoFactorEnabled) return false;

  const passkeys = await fastify.prisma.passkey.count({ where: { userId } });
  if (passkeys > 0) return false;

  const security = await fastify.prisma.setting.findUnique({ where: { key: 'security' } });
  const value = (security?.value as Record<string, unknown> | null) ?? {};
  if (!value.require2FAForAdmin) return false;

  const roles = await fastify.prisma.userRole.findMany({
    where: { userId },
    include: { role: true },
  });
  return roles.some((r) => r.role.key === 'super_admin' || r.role.key === 'admin');
}

export async function login(
  fastify: FastifyInstance,
  identifier: string,
  password: string,
  totp?: string,
  smsCode?: string,
): Promise<LoginResult> {
  const user = await fastify.prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
  });
  if (!user || !user.active) {
    throw new UnauthorizedError('Correo o contraseña inválidos');
  }

  // Bloqueo por intentos fallidos (fuerza bruta a nivel cuenta).
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new UnauthorizedError('Cuenta bloqueada temporalmente por intentos fallidos');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      await fastify.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) },
      });
    } else {
      await fastify.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: attempts },
      });
    }
    throw new UnauthorizedError('Correo o contraseña inválidos');
  }

  // Credenciales correctas: reinicia el contador de fallos.
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await fastify.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  if (user.twoFactorEnabled) {
    if (!totp) return { twoFactorRequired: true };
    const ok = await verifyTwoFactorCode(fastify, user.id, totp);
    if (!ok) throw new UnauthorizedError('Código de verificación inválido');
  } else if (user.twoFactorSmsEnabled && user.twoFactorPhone) {
    if (!smsCode) {
      await sendSmsOtp(fastify, user.id, user.twoFactorPhone, 'sms_login');
      return { smsRequired: true };
    }
    const ok = await verifySmsOtp(fastify, user.id, smsCode, 'sms_login');
    if (!ok) throw new UnauthorizedError('Código SMS inválido');
  } else if (await shouldRequireTwoFactor(fastify, user.id)) {
    const setupToken = fastify.jwt.sign({ sub: user.id, type: 'setup_2fa' }, { expiresIn: '15m' });
    return { twoFactorSetupRequired: true, setupToken };
  }

  const profile = await findUserWithPermissions(fastify, user.id);
  if (!profile) throw new UnauthorizedError();
  return profile;
}

export async function registerUser(
  fastify: FastifyInstance,
  input: { email: string; password: string; displayName?: string; username?: string },
): Promise<UserProfile> {
  const existing = await fastify.prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError('El correo ya está registrado');

  if (input.username) {
    const byUsername = await fastify.prisma.user.findUnique({ where: { username: input.username } });
    if (byUsername) throw new ConflictError('El nombre de usuario ya está en uso');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await fastify.prisma.user.create({
    data: { email: input.email, username: input.username ?? null, passwordHash, displayName: input.displayName ?? null },
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
