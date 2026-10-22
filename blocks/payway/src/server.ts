import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const toStatus = (s: string): 'approved' | 'rejected' | 'pending' =>
  ['approved', 'authorized', 'paid'].includes(s) ? 'approved' : ['rejected', 'failed', 'cancelled', 'declined'].includes(s) ? 'rejected' : 'pending';

export default definePlugin(manifest, {
  register: async (fastify, options) => {
    const config = options as Record<string, unknown>;
    const env = String(config.environment ?? 'sandbox');

    fastify.payments?.register({
      id: 'payway',
      displayName: 'Payway / Decidir',
      createTransaction: async (input) => {
        const id = `pw_${crypto.randomUUID()}`;
        // (Producción) POST /tokens y /payments con apiKey (Decidir 2.0).
        return { transactionId: id, paymentUrl: `https://checkout.payway.com.ar/redirect?site=${config.siteId}&id=${id}`, raw: { environment: env } };
      },
      verifyWebhook: async (request) => {
        const { body, headers } = request as { body?: Record<string, unknown>; headers?: Record<string, unknown> };
        const secret = String(config.webhookSecret ?? '');
        const signature = String(headers?.['x-signature'] ?? '');
        const expected = `sha256=${await hmacSha256Hex(secret, JSON.stringify(body ?? {}))}`;
        if (!secret || signature !== expected) throw new Error('Firma inválida');
        const data = body?.data as Record<string, unknown> | undefined;
        return { transactionId: String(data?.id ?? body?.id ?? ''), status: toStatus(String(data?.status ?? body?.status ?? 'pending')) };
      },
    });

    fastify.get('/public-config', async () => ({ environment: env, primaryColor: config.primaryColor ?? '#004b93' }));
  },
});
