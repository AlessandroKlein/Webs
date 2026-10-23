import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  createActivationKey,
  verifyActivationKey,
  type LicensePayload,
} from '@licensify/core';
import { BadRequestError, NotFoundError } from '@webs/core';
import { audit } from '../../lib/audit';
import { DEFAULT_ORG_ID } from '../../lib/tenant';

/** Cuerpo de creación de una clave: modo registrar (activationKey) o emitir (privada + fingerprint). */
interface CreateKeyBody {
  productId: string;
  licensee: string;
  fingerprint?: string;
  features?: string[];
  limits?: Record<string, number>;
  expiresAt?: string;
  activationKey?: string;
  saleId?: string;
  organizationId?: string;
}

/** Firma y emite una clave de activación offline (node-locked) con la privada del vendedor. */
export function issueActivationKey(
  payload: LicensePayload,
  privateKeyPem: string,
  fingerprint: string,
): string {
  return createActivationKey(payload, { privateKeyPem, fingerprint });
}

/**
 * Registro local de ventas y claves de licencia (spec `claves-de-venta.md`).
 *
 * - `POST /keys` emite (firma Ed25519 + cifra por fingerprint) si hay
 *   `LICENSE_PRIVATE_KEY`, o registra una clave ya emitida por @licensify/cli.
 * - `POST /keys/validate` valida una clave contra la pública (sin activarla).
 * - `POST /keys/:id/revoke` marca la clave como revocada (nivel 3 de la spec:
 *   registro local; los niveles 1/2 — re-emisión y lista firmada — son de CLI).
 */
export default async function licenseKeysRoutes(fastify: FastifyInstance): Promise<void> {
  const { prisma, config } = fastify;

  const resolveOrg = (organizationId: string | null | undefined): string =>
    organizationId?.trim() || DEFAULT_ORG_ID;

  // --- Ventas ---------------------------------------------------------------

  fastify.get(
    '/sales',
    {
      schema: { tags: ['license'] },
      preHandler: [fastify.authenticate, fastify.authorize('license.read')],
    },
    async (request) => {
      const organizationId = resolveOrg(request.tenant?.organizationId);
      return prisma.licenseSale.findMany({
        where: { organizationId },
        orderBy: { soldAt: 'desc' },
        include: { keys: true },
      });
    },
  );

  fastify.post(
    '/sales',
    {
      schema: {
        tags: ['license'],
        body: {
          type: 'object',
          required: ['customerName', 'productId'],
          properties: {
            organizationId: { type: 'string' },
            customerName: { type: 'string', minLength: 1 },
            customerEmail: { type: 'string' },
            productId: { type: 'string', minLength: 1 },
            features: { type: 'array', items: { type: 'string' } },
            limits: { type: 'object', additionalProperties: { type: 'number' } },
            amount: { type: 'integer', minimum: 0 },
            currency: { type: 'string', default: 'ARS' },
            notes: { type: 'string' },
            soldAt: { type: 'string' },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('license.manage')],
    },
    async (request) => {
      const body = request.body as {
        organizationId?: string;
        customerName: string;
        customerEmail?: string;
        productId: string;
        features?: string[];
        limits?: Record<string, number>;
        amount?: number;
        currency?: string;
        notes?: string;
        soldAt?: string;
      };
      const organizationId = resolveOrg(body.organizationId ?? request.tenant?.organizationId);
      const sale = await prisma.licenseSale.create({
        data: {
          organizationId,
          customerName: body.customerName,
          customerEmail: body.customerEmail,
          productId: body.productId,
          features: body.features ?? [],
          limits: body.limits,
          amount: body.amount,
          currency: body.currency ?? 'ARS',
          notes: body.notes,
          soldAt: body.soldAt ? new Date(body.soldAt) : new Date(),
        },
      });
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'license.sale.create',
        resource: 'license_sale',
        resourceId: sale.id,
      });
      return sale;
    },
  );

  fastify.get(
    '/sales/:id',
    {
      schema: { tags: ['license'] },
      preHandler: [fastify.authenticate, fastify.authorize('license.read')],
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const organizationId = resolveOrg(request.tenant?.organizationId);
      const sale = await prisma.licenseSale.findFirst({ where: { id, organizationId }, include: { keys: true } });
      if (!sale) throw new NotFoundError('Venta no encontrada');
      return sale;
    },
  );

  // --- Claves ---------------------------------------------------------------

  fastify.get(
    '/keys',
    {
      schema: { tags: ['license'] },
      preHandler: [fastify.authenticate, fastify.authorize('license.read')],
    },
    async (request) => {
      const organizationId = resolveOrg(request.tenant?.organizationId);
      return prisma.licenseKey.findMany({
        where: { organizationId },
        orderBy: { issuedAt: 'desc' },
      });
    },
  );

  fastify.post(
    '/keys',
    {
      schema: {
        tags: ['license'],
        body: {
          type: 'object',
          required: ['productId', 'licensee'],
          properties: {
            organizationId: { type: 'string' },
            saleId: { type: 'string' },
            productId: { type: 'string', minLength: 1 },
            licensee: { type: 'string', minLength: 1 },
            fingerprint: { type: 'string' },
            features: { type: 'array', items: { type: 'string' } },
            limits: { type: 'object', additionalProperties: { type: 'number' } },
            expiresAt: { type: 'string' },
            activationKey: { type: 'string' },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('license.manage')],
    },
    async (request) => {
      const body = request.body as CreateKeyBody;
      const organizationId = resolveOrg(body.organizationId ?? request.tenant?.organizationId);

      let activationKey = body.activationKey?.trim();
      const fingerprint = body.fingerprint?.trim();

      if (!activationKey) {
        // Modo emitir: firma Ed25519 + cifrado por fingerprint. Exige la
        // privada del vendedor, que solo se inyecta en su entorno (nunca se
        // embebe en la app del cliente).
        const privateKeyPem = config.LICENSE_PRIVATE_KEY?.trim();
        if (!privateKeyPem) {
          throw new BadRequestError(
            'No hay clave privada para firmar (LICENSE_PRIVATE_KEY). ' +
              'Registrá una clave ya emitida con `activationKey`, o configurá la privada del vendedor.',
          );
        }
        if (!fingerprint) {
          throw new BadRequestError(
            'Falta `fingerprint` (el fingerprint de la máquina del comprador) para emitir una clave node-locked.',
          );
        }
        const payload: LicensePayload = {
          id: randomUUID(),
          productId: body.productId,
          licensee: body.licensee,
          features: body.features ?? [],
          limits: body.limits,
          issuedAt: new Date().toISOString(),
          expiresAt: body.expiresAt?.trim() || undefined,
        };
        activationKey = issueActivationKey(payload, privateKeyPem, fingerprint);
      }

      const key = await prisma.licenseKey.create({
        data: {
          organizationId,
          saleId: body.saleId,
          productId: body.productId,
          licensee: body.licensee,
          features: body.features ?? [],
          limits: body.limits,
          fingerprint,
          activationKey,
          status: 'active',
          issuedAt: new Date(),
          expiresAt: body.expiresAt?.trim() ? new Date(body.expiresAt) : undefined,
        },
      });
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'license.key.issue',
        resource: 'license_key',
        resourceId: key.id,
      });
      return key;
    },
  );

  fastify.post(
    '/keys/validate',
    {
      schema: {
        tags: ['license'],
        body: {
          type: 'object',
          required: ['activationKey', 'fingerprint'],
          properties: {
            activationKey: { type: 'string', minLength: 8 },
            fingerprint: { type: 'string' },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('license.read')],
    },
    async (request) => {
      const { activationKey, fingerprint } = request.body as { activationKey: string; fingerprint: string };
      const publicKeyPem = config.LICENSE_PUBLIC_KEY?.trim();
      if (!publicKeyPem) {
        throw new BadRequestError('Licencias no configuradas: definí LICENSE_PUBLIC_KEY');
      }
      try {
        const result = verifyActivationKey(activationKey, { publicKeyPem, fingerprint });
        return {
          valid: true,
          payload: result.payload,
          fingerprint: result.fingerprint,
          expiresAt: result.expiresAt,
        };
      } catch (err) {
        return { valid: false, error: err instanceof Error ? err.message : 'Clave inválida' };
      }
    },
  );

  fastify.post(
    '/keys/:id/revoke',
    {
      schema: {
        tags: ['license'],
        body: {
          type: 'object',
          properties: { reason: { type: 'string' } },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('license.manage')],
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const { reason } = (request.body ?? {}) as { reason?: string };
      const organizationId = resolveOrg(request.tenant?.organizationId);
      const existing = await prisma.licenseKey.findFirst({ where: { id, organizationId } });
      if (!existing) throw new NotFoundError('Clave no encontrada');

      const key = await prisma.licenseKey.update({
        where: { id },
        data: {
          status: 'revoked',
          revokedAt: new Date(),
          revokedReason: reason?.trim() || undefined,
        },
      });
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'license.key.revoke',
        resource: 'license_key',
        resourceId: key.id,
      });
      return key;
    },
  );
}
