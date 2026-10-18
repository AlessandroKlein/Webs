import { createHash, randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { BadRequestError } from '@webs/core';
import { getFirstNotificationProvider } from '../notifications/registry';

/** OTP por SMS para 2FA: genera, envía vía el proveedor de notificaciones y verifica. */

const OTP_TTL_MS = 5 * 60_000;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export async function sendSmsOtp(fastify: FastifyInstance, userId: string, phone: string, purpose: string): Promise<void> {
  const provider = getFirstNotificationProvider();
  if (!provider) throw new BadRequestError('No hay proveedor de notificaciones configurado (instalá el bloque Twilio)');

  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  await provider.send({ to: phone, message: `Tu código de verificación de Webs es ${code}`, channel: 'sms' });

  await fastify.prisma.otpCode.create({
    data: { userId, purpose, codeHash: hashCode(code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
}

export async function verifySmsOtp(fastify: FastifyInstance, userId: string, code: string, purpose: string): Promise<boolean> {
  const hash = hashCode(code);
  const otp = await fastify.prisma.otpCode.findFirst({
    where: { userId, purpose, codeHash: hash, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.expiresAt < new Date()) return false;
  await fastify.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return true;
}
