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
  ['approved', 'paid', 'accredited', 'completed'].includes(s)
    ? 'approved'
    : ['rejected', 'failed', 'cancelled', 'canceled', 'declined'].includes(s)
      ? 'rejected'
      : 'pending';

export default definePlugin(manifest, {
  register: async (fastify, options) => {
    const config = options as Record<string, unknown>;
    const env = String(config.environment ?? 'sandbox');

    fastify.payments?.register({
      id: 'modo',
      displayName: 'MODO',
      createTransaction: async (input) => {
        const id = `modo_${crypto.randomUUID()}`;
        // (Producción) POST /api/v2/intentions con clientId/clientSecret para
        // obtener el QR/deep-link.
        return { transactionId: id, qr: `https://modo.example/qr/${id}?amount=${input.amount}`, raw: { environment: env } };
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

    fastify.get('/public-config', async () => ({ environment: env, primaryColor: config.primaryColor ?? '#171717' }));
  },
});
