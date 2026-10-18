import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default defineBlock(manifest, {
  register: async (fastify, options) => {
    const config = options as Record<string, unknown>;
    const mode = String(config.mode ?? 'cash');

    fastify.payments?.register({
      id: 'pos',
      displayName: 'Contra entrega / POS',
      createTransaction: async (input) => {
        if (mode === 'cash') {
          // Contra entrega: queda pendiente; se aprueba manualmente vía
          // POST /payments/:id/mark-paid cuando se cobra el efectivo.
          return { transactionId: `cod_${crypto.randomUUID()}`, raw: { mode: 'cash' } };
        }
        // Terminal físico (Point de Mercado Pago, Payway): se inicia el cobro en
        // el lector y la aprobación llega por webhook.
        const id = `pos_${crypto.randomUUID()}`;
        // (Producción) POST a la API del terminal con apiKey + terminalId.
        return { transactionId: id, raw: { mode: 'terminal', terminalId: config.terminalId ?? null } };
      },
      verifyWebhook: async (request) => {
        const { body, headers } = request as { body?: Record<string, unknown>; headers?: Record<string, unknown> };
        const secret = String(config.webhookSecret ?? '');
        const signature = String(headers?.['x-signature'] ?? '');
        const expected = `sha256=${await hmacSha256Hex(secret, JSON.stringify(body ?? {}))}`;
        if (!secret || signature !== expected) throw new Error('Firma inválida');
        const statusRaw = String(body?.status ?? 'approved');
        const status = statusRaw === 'approved' || statusRaw === 'approved' ? 'approved' : statusRaw === 'rejected' ? 'rejected' : 'pending';
        return { transactionId: String(body?.id ?? ''), status };
      },
    });

    fastify.get('/public-config', async () => ({ mode, primaryColor: config.primaryColor ?? '#16a34a' }));
  },
});
