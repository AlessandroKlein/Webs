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
  ['succeeded', 'paid'].includes(s) ? 'approved' : ['failed', 'canceled', 'requires_payment_method'].includes(s) ? 'rejected' : 'pending';

export default definePlugin(manifest, {
  register: async (fastify, options) => {
    const config = options as Record<string, unknown>;

    fastify.payments?.register({
      id: 'stripe',
      displayName: 'Stripe',
      createTransaction: async (input) => {
        const id = `pi_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
        // (Producción) POST /v1/payment_intents con la secret key; devuelve
        // client_secret para Stripe.js (tokenización en el cliente).
        return { transactionId: id, raw: { clientSecret: `pi_${id}_secret_placeholder` } };
      },
      verifyWebhook: async (request) => {
        const { body, headers } = request as { body?: Record<string, unknown>; headers?: Record<string, unknown> };
        const secret = String(config.webhookSecret ?? '');
        // (Producción) verificar la firma de Stripe con stripe.webhooks.constructEvent.
        const signature = String(headers?.['stripe-signature'] ?? '');
        const expected = `sha256=${await hmacSha256Hex(secret, JSON.stringify(body ?? {}))}`;
        if (!secret || signature !== expected) throw new Error('Firma inválida');

        const object = (body?.data as Record<string, unknown> | undefined)?.object as Record<string, unknown> | undefined;
        return { transactionId: String(object?.id ?? ''), status: toStatus(String(object?.status ?? 'pending')) };
      },
    });

    fastify.get('/public-config', async () => ({ publishableKey: config.publishableKey ?? null, primaryColor: config.primaryColor ?? '#635bff' }));
  },
});
