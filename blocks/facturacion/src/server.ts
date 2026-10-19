import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as Record<string, unknown>;

    fastify.get('/config', async () => ({ businessName: cfg.businessName, taxId: cfg.taxId, taxRate: cfg.taxRate }));

    // Genera una factura (referencia) para un pago aprobado.
    fastify.post('/invoice', async (request: unknown) => {
      const { body } = request as { body?: { paymentId?: string; amount?: number; description?: string } };
      const number = `${cfg.invoicePrefix ?? 'A'}-${Date.now().toString().slice(-8)}`;
      const tax = Math.round((body?.amount ?? 0) * Number(cfg.taxRate ?? 0)) / 100;
      return {
        number,
        businessName: cfg.businessName ?? 'Webs',
        taxId: cfg.taxId ?? null,
        amount: body?.amount ?? 0,
        tax,
        total: (body?.amount ?? 0) + tax,
        description: body?.description ?? '',
        status: 'issued',
      };
    });
  },
});
