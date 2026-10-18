import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@webs/core';
import { getPaymentProvider, listPaymentProviders } from './registry';

/** Validación anti-manipulación de precios: montos enteros (centavos) y positivos. */
const checkoutSchema = z.object({
  provider: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.string().length(3).default('ARS'),
  description: z.string().optional(),
  externalReference: z.string().optional(),
  idempotencyKey: z.string().optional(),
  items: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

export default async function paymentsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/payments/providers',
    { schema: { tags: ['payments'] }, preHandler: [fastify.authenticate] },
    async () => listPaymentProviders(),
  );

  fastify.post(
    '/payments/checkout',
    { schema: { tags: ['payments'] }, preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = checkoutSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Datos de pago inválidos',
          parsed.error.issues.map((i) => ({ field: i.path.join('.') || undefined, message: i.message })),
        );
      }
      const input = parsed.data;
      const provider = getPaymentProvider(input.provider);
      if (!provider) throw new NotFoundError(`Proveedor de pago '${input.provider}'`);

      const result = await provider.createTransaction({
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        externalReference: input.externalReference,
        idempotencyKey: input.idempotencyKey,
        items: input.items,
        metadata: input.metadata,
      });

      const payment = await fastify.prisma.payment.create({
        data: {
          provider: provider.id,
          transactionId: result.transactionId,
          amount: input.amount,
          currency: input.currency,
          status: 'pending',
          userId: request.user?.sub ?? null,
          externalReference: input.externalReference ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });

      return reply.status(201).send({
        id: payment.id,
        transactionId: result.transactionId,
        status: payment.status,
        paymentUrl: result.paymentUrl,
        qr: result.qr,
      });
    },
  );

  // Webhook público: la pasarela lo llama sin autenticación; la firma la valida
  // el adaptador del proveedor. La idempotencia evita reprocesar notificaciones.
  fastify.post(
    '/payments/webhook/:provider',
    { schema: { tags: ['payments'], params: { type: 'object', properties: { provider: { type: 'string' } } } } },
    async (request, reply) => {
      const providerId = (request.params as { provider: string }).provider;
      const provider = getPaymentProvider(providerId);
      if (!provider) throw new NotFoundError(`Proveedor de pago '${providerId}'`);

      let webhook;
      try {
        webhook = await provider.verifyWebhook(request);
      } catch {
        return reply.status(401).send({ ok: false, error: 'Firma inválida o webhook rechazado' });
      }

      const existing = await fastify.prisma.payment.findUnique({ where: { transactionId: webhook.transactionId } });
      if (existing && existing.status !== 'pending') {
        return { ok: true, alreadyProcessed: true, status: existing.status };
      }

      const payment = existing
        ? await fastify.prisma.payment.update({
            where: { id: existing.id },
            data: { status: webhook.status, paidAt: webhook.status === 'approved' ? new Date() : existing.paidAt },
          })
        : await fastify.prisma.payment.create({
            data: {
              provider: providerId,
              transactionId: webhook.transactionId,
              amount: 0,
              currency: 'ARS',
              status: webhook.status,
              paidAt: webhook.status === 'approved' ? new Date() : null,
              metadata: webhook.raw ? (webhook.raw as Prisma.InputJsonValue) : Prisma.JsonNull,
            },
          });

      if (webhook.status === 'approved' && fastify.events) {
        await fastify.events.emit('payment.approved', {
          payment: { id: payment.id, transactionId: webhook.transactionId, amount: payment.amount, currency: payment.currency },
        });
      }

      return { ok: true, id: payment.id, status: payment.status };
    },
  );

  fastify.get(
    '/payments',
    { schema: { tags: ['payments'] }, preHandler: [fastify.authenticate] },
    async (request) => {
      const isAdmin = request.user?.permissions?.includes('user.read') ?? false;
      const where = isAdmin ? {} : { userId: request.user?.sub };
      return fastify.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    },
  );

  fastify.get(
    '/payments/:id',
    {
      schema: { tags: ['payments'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate],
    },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const payment = await fastify.prisma.payment.findFirst({
        where: { id, OR: [{ userId: request.user?.sub }, { userId: null }] },
      });
      if (!payment) throw new NotFoundError('Pago');
      return payment;
    },
  );

  // Pago contra entrega / cobro manual: marca una transacción pendiente como aprobada.
  fastify.post(
    '/payments/:id/mark-paid',
    {
      schema: { tags: ['payments'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('user.read')],
    },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const payment = await fastify.prisma.payment.findUnique({ where: { id } });
      if (!payment) throw new NotFoundError('Pago');
      if (payment.status === 'approved') return { ok: true, alreadyApproved: true };

      await fastify.prisma.payment.update({ where: { id }, data: { status: 'approved', paidAt: new Date() } });
      if (fastify.events) {
        await fastify.events.emit('payment.approved', {
          payment: { id: payment.id, transactionId: payment.transactionId, amount: payment.amount, currency: payment.currency },
        });
      }
      return { ok: true, id: payment.id, status: 'approved' };
    },
  );
}
