import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { PaymentProviderInput } from '@webs/plugin-sdk';
import { NotFoundError } from '@webs/core';
import { randomUUID } from 'node:crypto';
import { getPaymentProvider } from './registry';

/**
 * Subconjunto estructural de la instancia Fastify que el núcleo decora
 * (`prisma` y `events`). Se declara localmente (en vez de depender del
 * module-augmentation de `apps/api/src/types/fastify.d.ts`) para que este
 * módulo siga siendo compilable desde los plugins (paquetes separados) que lo
 * importan por ruta relativa.
 */
export type CoreFastify = FastifyInstance & {
  prisma: PrismaClient;
  events?: { emit: (event: string, payload: Record<string, unknown>) => void | Promise<void> };
};

/** Resultado de la creación de una intención de pago (contrato único de checkout). */
export interface CheckoutPaymentResult {
  id: string;
  transactionId: string;
  status: string;
  paymentUrl?: string;
  qr?: string;
}

/** Entrada de un checkout orquestado por el núcleo (proveedor online). */
export interface CheckoutPaymentInput extends PaymentProviderInput {
  /** Identificador del proveedor de pago registrado (p.ej. `mercadopago`, `stripe`). */
  provider: string;
  organizationId: string;
  userId?: string | null;
}

/**
 * Crea un `Payment` pendiente a través de un proveedor registrado
 * (`fastify.payments.register`). Es el contrato único de creación de pago
 * (ADR-0015): lo usan tanto el endpoint `POST /payments/checkout` como los
 * plugins (p.ej. suscripciones) que necesitan iniciar un cobro.
 */
export async function createCheckoutPayment(
  fastify: CoreFastify,
  input: CheckoutPaymentInput,
): Promise<CheckoutPaymentResult> {
  const provider = getPaymentProvider(input.provider);
  if (!provider) throw new NotFoundError(`Proveedor de pago '${input.provider}'`);

  const result = await provider.createTransaction(input);

  const payment = await fastify.prisma.payment.create({
    data: {
      provider: provider.id,
      transactionId: result.transactionId,
      amount: input.amount,
      currency: input.currency,
      status: 'pending',
      userId: input.userId ?? null,
      organizationId: input.organizationId,
      externalReference: input.externalReference ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
    },
  });

  return {
    id: payment.id,
    transactionId: result.transactionId,
    status: payment.status,
    paymentUrl: result.paymentUrl,
    qr: result.qr,
  };
}

/** Entrada de un cobro presencial (caja/POS). */
export interface PosPaymentInput {
  amount: number;
  currency?: string;
  method?: 'cash' | 'terminal';
  description?: string;
  externalReference?: string;
  items?: Array<{ id: string; title: string; quantity: number; unitPrice: number }>;
  metadata?: Record<string, unknown>;
  organizationId: string;
  userId?: string | null;
}

/**
 * Registra un pago presencial (efectivo o terminal) en caja/POS.
 *
 * - `cash`: se aprueba inmediatamente (`status: 'approved'`, `paidAt` ahora) y
 *   emite `payment.approved` para que se confirme la orden, descuente stock y
 *   se genere el comprobante (plugin facturacion).
 * - `terminal`: queda `pending` (`pos_...`) hasta que el webhook del lector
 *   (`POST /payments/webhook/pos`) lo apruebe.
 */
export async function createPosPayment(
  fastify: CoreFastify,
  input: PosPaymentInput,
): Promise<CheckoutPaymentResult> {
  const amount = Math.max(0, Math.floor(Number(input.amount) || 0));
  const currency = String(input.currency ?? 'ARS');
  const method = input.method === 'terminal' ? 'terminal' : 'cash';
  const approved = method === 'cash';
  const transactionId = method === 'terminal' ? `pos_${randomUUID()}` : `cod_${randomUUID()}`;

  const payment = await fastify.prisma.payment.create({
    data: {
      provider: 'pos',
      transactionId,
      amount,
      currency,
      status: approved ? 'approved' : 'pending',
      userId: input.userId ?? null,
      organizationId: input.organizationId,
      externalReference: input.externalReference ?? null,
      paidAt: approved ? new Date() : null,
      metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
    },
  });

  if (approved && fastify.events) {
    await fastify.events.emit('payment.approved', {
      payment: { id: payment.id, transactionId, amount, currency },
    });
  }

  return { id: payment.id, transactionId, status: payment.status };
}
