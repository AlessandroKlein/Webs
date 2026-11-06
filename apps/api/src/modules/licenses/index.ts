import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { LicensePayload } from '@licensify/core';
import { DEFAULT_ORG_ID } from '../../lib/tenant';
import licenseRoutes from './routes';
import licenseKeysRoutes, { issueActivationKey } from './keys';

/** Módulo de licencias: endpoints de activación/estado/features bajo `/api/v1/license`. */
export default async function licenseModule(fastify: FastifyInstance): Promise<void> {
  await fastify.register(licenseRoutes, { prefix: '/license' });
  // Registro local de ventas y claves (spec `claves-de-venta.md`):
  // `/license/sales`, `/license/keys`, `/license/activate-key`.
  await fastify.register(licenseKeysRoutes, { prefix: '/license' });

  // Venta de licencia por pago aprobado: si el pago trae metadata.kind ===
  // 'license', se emite una clave node-locked de forma idempotente (una clave
  // por paymentId, patrón Invoice.paymentId).
  const events = (fastify as unknown as {
    events?: { on?: (event: string, handler: (payload: Record<string, unknown>) => Promise<void>) => void };
  }).events;
  events?.on?.('payment.approved', async (payload) => {
    const payment = (payload?.payment ?? {}) as {
      id?: string;
      organizationId?: string;
      metadata?: unknown;
    };
    const meta = (payment.metadata ?? {}) as {
      kind?: string;
      licensePlanId?: string;
      fingerprint?: string;
      productId?: string;
      licensee?: string;
      features?: string[];
      limits?: Record<string, number>;
    };
    const isLicense = meta.kind === 'license' || typeof meta.licensePlanId === 'string';
    if (!payment.id || !isLicense) return;

    const { prisma, config } = fastify;
    const existing = await prisma.licenseSale.findUnique({ where: { paymentId: payment.id } });
    if (existing) return;

    const privateKeyPem = config.LICENSE_PRIVATE_KEY?.trim();
    const fingerprint = meta.fingerprint?.trim();
    if (!privateKeyPem || !fingerprint) {
      fastify.log.warn('Venta de licencia ignorada: falta LICENSE_PRIVATE_KEY o metadata.fingerprint');
      return;
    }

    const productId = meta.productId ?? meta.licensePlanId ?? 'license';
    const licensee = meta.licensee ?? 'Cliente';
    const payload2: LicensePayload = {
      id: randomUUID(),
      productId,
      licensee,
      features: meta.features ?? [],
      limits: meta.limits,
      issuedAt: new Date().toISOString(),
    };
    const activationKey = issueActivationKey(payload2, privateKeyPem, fingerprint);

    const sale = await prisma.licenseSale.create({
      data: {
        organizationId: payment.organizationId ?? DEFAULT_ORG_ID,
        customerName: licensee,
        productId,
        features: meta.features ?? [],
        limits: meta.limits,
        paymentId: payment.id,
      },
    });
    await prisma.licenseKey.create({
      data: {
        organizationId: sale.organizationId,
        saleId: sale.id,
        productId,
        licensee,
        features: meta.features ?? [],
        limits: meta.limits,
        fingerprint,
        activationKey,
        status: 'active',
        issuedAt: new Date(),
      },
    });
  });
}
