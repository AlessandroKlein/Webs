import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import { issueInvoice } from '../../../apps/api/src/integrations/tax';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

/** Número de factura autoincremental simulado: `F-<timestamp>-<4 dígitos>`. */
function buildInvoiceNumber(): string {
  const random = Math.floor(1000 + Math.random() * 9000);
  return `F-${Date.now()}-${random}`;
}

/** Orden del ciclo de vida de una factura: draft → issued → paid. */
const INVOICE_STATUS_ORDER: Record<string, number> = { draft: 0, issued: 1, paid: 2 };

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as Record<string, unknown>;
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    // Credenciales del proveedor fiscal (claves genéricas para el adaptador).
    const taxConfig: Record<string, unknown> = {
      cuit: cfg.taxId,
      taxId: cfg.taxId,
      token: cfg.fiscalToken,
      sign: cfg.fiscalSign,
      username: cfg.fiscalUsername,
      password: cfg.fiscalPassword,
      reseller: cfg.fiscalReseller,
      serviceUrl: cfg.fiscalServiceUrl,
      baseUrl: cfg.fiscalServiceUrl,
      arcaCert: cfg.arcaCert,
    };

    // ------------------------------------------------------------------
    // Facturas
    // ------------------------------------------------------------------
    fastify.get('/invoices', async (request: unknown) => {
      const { query } = request as { query?: { status?: string } };
      const where = query?.status ? { status: query.status } : {};
      return db.invoice.findMany({ where, orderBy: { createdAt: 'desc' } });
    });

    fastify.post('/invoices', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as {
        body?: { customerName?: string; customerTaxId?: string; vatCondition?: string; amount?: number; type?: string };
      };
      return db.invoice.create({
        data: {
          number: buildInvoiceNumber(),
          type: body?.type ?? 'invoice',
          amount: Number(body?.amount ?? 0),
          currency: 'ARS',
          status: 'draft',
          customerName: body?.customerName ?? null,
          customerTaxId: body?.customerTaxId ?? null,
          vatCondition: body?.vatCondition ?? null,
        },
      });
    });

    fastify.patch('/invoices/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { status?: string } };
      const status = body?.status;
      if (!status || !(status in INVOICE_STATUS_ORDER)) return { ok: false, error: 'Estado inválido (draft | issued | paid)' };

      const invoice = await db.invoice.findUnique({ where: { id: params?.id } });
      if (!invoice) return { ok: false, error: 'Factura no encontrada' };

      const current = INVOICE_STATUS_ORDER[invoice.status] ?? 0;
      const next = INVOICE_STATUS_ORDER[status] ?? 0;
      if (next < current) return { ok: false, error: `Transición inválida: ${invoice.status} → ${status}` };

      return db.invoice.update({ where: { id: invoice.id }, data: { status } });
    });

    // Emite la factura ante el proveedor fiscal configurado; si no hay
    // credenciales o falla el webservice, cae a un CAE simulado.
    fastify.post('/invoices/:id/issue', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      const invoice = await db.invoice.findUnique({ where: { id: params?.id } });
      if (!invoice) return { ok: false, error: 'Factura no encontrada' };

      const provider = String(cfg.taxProvider ?? 'local');
      const result = await issueInvoice(provider, taxConfig, {
        id: invoice.id,
        number: invoice.number,
        amount: Number(invoice.amount),
        currency: invoice.currency,
        customerName: invoice.customerName,
        customerTaxId: invoice.customerTaxId,
        vatCondition: invoice.vatCondition,
        type: invoice.type,
      });

      const updated = await db.invoice.update({
        where: { id: invoice.id },
        data: { status: 'issued', cae: result.cae },
      });
      return {
        ok: true,
        cae: result.cae,
        provider,
        simulated: result.simulated,
        caeExpiresAt: result.caeExpiresAt ?? null,
        invoice: updated,
      };
    });

    fastify.delete('/invoices/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.invoice.delete({ where: { id: params?.id } });
    });
  },
});
