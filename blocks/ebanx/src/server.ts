import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const toStatus = (s: string): 'approved' | 'rejected' | 'pending' =>
  ['CO', 'paid', 'approved'].includes(s) ? 'approved' : ['CA', 'failed', 'rejected', 'cancelled'].includes(s) ? 'rejected' : 'pending';

export default defineBlock(manifest, {
  register: async (fastify, options) => {
    const config = options as Record<string, unknown>;
    const env = String(config.environment ?? 'sandbox');

    fastify.payments?.register({
      id: 'ebanx',
      displayName: 'EBANX',
      createTransaction: async (input) => {
        const id = `ebanx_${crypto.randomUUID()}`;
        // (Producción) POST /ws/direct con la integration key; devuelve redirect_url.
        return { transactionId: id, paymentUrl: `https://checkout.ebanx.com/redirect?hash=${id}`, raw: { environment: env } };
      },
      verifyWebhook: async (request) => {
        const { body, headers } = request as { body?: Record<string, unknown>; headers?: Record<string, unknown> };
        const secret = String(config.webhookSecret ?? '');
        const signature = String(headers?.['x-signature'] ?? '');
        const expected = `sha256=${await hmacSha256Hex(secret, JSON.stringify(body ?? {}))}`;
        if (!secret || signature !== expected) throw new Error('Firma inválida');
        const payment = body?.payment as Record<string, unknown> | undefined;
        return { transactionId: String(payment?.hash ?? body?.id ?? ''), status: toStatus(String(body?.status ?? 'pending')) };
      },
    });

    fastify.get('/public-config', async () => ({ environment: env, primaryColor: config.primaryColor ?? '#004c97' }));
  },
});
