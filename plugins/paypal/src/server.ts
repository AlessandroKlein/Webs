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
  ['approved', 'completed'].includes(s) ? 'approved' : ['rejected', 'failed', 'cancelled', 'denied'].includes(s) ? 'rejected' : 'pending';

export default definePlugin(manifest, {
  register: async (fastify, options) => {
    const config = options as Record<string, unknown>;
    const env = String(config.environment ?? 'sandbox');

    fastify.payments?.register({
      id: 'paypal',
      displayName: 'PayPal',
      createTransaction: async (input) => {
        const id = `pp_${crypto.randomUUID()}`;
        // (Producción) POST /v2/checkout/orders con clientId/clientSecret; devuelve
        // links[rel=approve].href para redirigir al comprador.
        return { transactionId: id, paymentUrl: `https://www.paypal.com/checkoutnow?token=${id}`, raw: { environment: env } };
      },
      verifyWebhook: async (request) => {
        const { body, headers } = request as { body?: Record<string, unknown>; headers?: Record<string, unknown> };
        const secret = String(config.webhookSecret ?? '');
        // (Producción) verificar la cabecera PAYPAL-TRANSMISSION-SIG con el webhook ID.
        const signature = String(headers?.['paypal-transmission-sig'] ?? '');
        const expected = `sha256=${await hmacSha256Hex(secret, JSON.stringify(body ?? {}))}`;
        if (!secret || signature !== expected) throw new Error('Firma inválida');

        const resource = body?.resource as Record<string, unknown> | undefined;
        return { transactionId: String(resource?.id ?? ''), status: toStatus(String(resource?.status ?? 'pending')) };
      },
    });

    fastify.get('/public-config', async () => ({ clientId: config.clientId ?? null, environment: env, primaryColor: config.primaryColor ?? '#ffc439' }));
  },
});
