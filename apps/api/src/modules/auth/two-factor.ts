import { authenticator } from 'otplib';
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { UnauthorizedError } from '@webs/core';

/**
 * Autenticación de dos factores (2FA / TOTP) compatible con Google
 * Authenticator, Authy, etc. El secreto se genera una vez, el usuario lo
 * escanea (otpauth://) y confirma con un código de 6 dígitos.
 */

export function generateSecret(): string {
  return authenticator.generateSecret();
}

export function otpauthUrl(email: string, secret: string): string {
  return authenticator.keyuri(email, 'Webs', secret);
}

export function verifyCode(secret: string, code: string): boolean {
  try {
    return authenticator.verify({ token: code, secret });
  } catch {
    return false;
  }
}

/** Inicia el alta de 2FA: genera secreto y lo guarda (pendiente de confirmar). */
export async function setupTwoFactor(
  fastify: FastifyInstance,
  userId: string,
): Promise<{ secret: string; otpauthUrl: string }> {
  const user = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new UnauthorizedError('Usuario no encontrado');
  const secret = generateSecret();
  await fastify.prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: secret, twoFactorEnabled: false },
  });
  return { secret, otpauthUrl: otpauthUrl(user.email, secret) };
}

/** Confirma el código TOTP, activa 2FA y genera códigos de respaldo. */
export async function confirmTwoFactor(
  fastify: FastifyInstance,
  userId: string,
  code: string,
): Promise<{ backupCodes: string[] }> {
  const user = await fastify.prisma.user.findUnique({ where: { id: userId } });
  if (!user?.twoFactorSecret) throw new UnauthorizedError('No hay 2FA pendiente de activación');
  if (!verifyCode(user.twoFactorSecret, code)) throw new UnauthorizedError('Código inválido');

  const { codes, hashes } = generateBackupCodes();
  await fastify.prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true, twoFactorBackupCodes: hashes },
  });
  return { backupCodes: codes };
}

/** Desactiva 2FA (exige un código TOTP válido). */
export async function disableTwoFactor(
  fastify: FastifyInstance,
  userId: string,
  code: string,
): Promise<void> {
  const user = await fastify.prisma.user.findUnique({ where: { id: userId } });
  if (!user?.twoFactorSecret) return;
  if (!verifyCode(user.twoFactorSecret, code)) throw new UnauthorizedError('Código inválido');
  await fastify.prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: Prisma.JsonNull },
  });
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateBackupCodes(count = 8): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: count }, () => randomBytes(4).toString('hex').toUpperCase());
  return { codes, hashes: codes.map(hashCode) };
}

/**
 * Verifica el código 2FA: acepta TOTP o un código de respaldo (que se consume).
 */
export async function verifyTwoFactorCode(
  fastify: FastifyInstance,
  userId: string,
  code: string,
): Promise<boolean> {
  const user = await fastify.prisma.user.findUnique({ where: { id: userId } });
  if (!user?.twoFactorEnabled) return true;
  if (user.twoFactorSecret && verifyCode(user.twoFactorSecret, code)) return true;

  const hashes = (user.twoFactorBackupCodes as string[] | null) ?? [];
  const hash = hashCode(code);
  if (hashes.includes(hash)) {
    await fastify.prisma.user.update({
      where: { id: userId },
      data: { twoFactorBackupCodes: hashes.filter((h) => h !== hash) },
    });
    return true;
  }
  return false;
}
