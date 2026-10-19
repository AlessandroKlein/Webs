import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
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

    // Simula la emisión fiscal: setea "issued" y un CAE ficticio.
    fastify.post('/invoices/:id/issue', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      const invoice = await db.invoice.findUnique({ where: { id: params?.id } });
      if (!invoice) return { ok: false, error: 'Factura no encontrada' };

      // TODO(emisión fiscal real): reemplazar este CAE ficticio por la emisión
      // contra AFIP/ARCA o el proveedor fiscal configurado en `settings.taxProvider`
      // ("local" | "afip" | "facturante" | "tsd"). Aquí solo se simula el flujo.
      const cae = crypto.randomUUID();
      const updated = await db.invoice.update({ where: { id: invoice.id }, data: { status: 'issued', cae } });
      return { ok: true, cae, provider: cfg.taxProvider ?? 'local', invoice: updated };
    });

    fastify.delete('/invoices/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.invoice.delete({ where: { id: params?.id } });
    });
  },
});
