import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

interface StripeConfig {
  publishableKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  primaryColor?: string;
}

/** Lee una variable de entorno sin depender de @types/node. */
const envOf = (key: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];

/** Error con statusCode: el error handler del núcleo lo mapea a ese status. */
const httpError = (message: string, statusCode: number): Error => Object.assign(new Error(message), { statusCode });

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const toStatus = (s: string): 'approved' | 'rejected' | 'pending' =>
  ['succeeded', 'paid'].includes(s) ? 'approved' : ['failed', 'canceled', 'requires_payment_method'].includes(s) ? 'rejected' : 'pending';

const STRIPE_SESSIONS_URL = 'https://api.stripe.com/v1/checkout/sessions';

/**
 * Plugin Stripe: Checkout Session real con modo mock (STRIPE_MODE=mock) y
 * webhook con verificación opcional de firma (stripe-signature).
 */
export default definePlugin(manifest, {
  register: async (fastify, options) => {
    const config = options as StripeConfig;

    fastify.payments?.register({
      id: 'stripe',
      displayName: 'Stripe',
      createTransaction: async (input) => {
        const secretKey = config.secretKey ?? envOf('STRIPE_SECRET_KEY') ?? '';
        const mock = envOf('STRIPE_MODE') === 'mock';
        const transactionId = `cs_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

        if (mock) {
          return {
            transactionId,
            paymentUrl: `https://sandbox.stripe.com/mock/${transactionId}`,
            raw: { sessionId: `cs_mock_${transactionId}`, mock: true },
          };
        }
        if (!secretKey) {
          throw httpError('Stripe no configurado (falta secretKey o STRIPE_SECRET_KEY)', 400);
        }

        const base = envOf('PUBLIC_BASE_URL') ?? '';
        const params = new URLSearchParams();
        params.set('mode', 'payment');
        params.set('client_reference_id', transactionId);
        (input.items ?? []).forEach((it, i) => {
          params.set(`line_items[${i}][quantity]`, String(it.quantity));
          params.set(`line_items[${i}][price_data][currency]`, input.currency);
          params.set(`line_items[${i}][price_data][unit_amount]`, String(it.unitPrice));
          params.set(`line_items[${i}][price_data][product_data][name]`, it.title);
        });
        if (base) {
          params.set('success_url', `${base}/checkout/success`);
          params.set('cancel_url', `${base}/checkout/cancel`);
        }

        const res = await fetch(STRIPE_SESSIONS_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
        if (!res.ok) throw httpError(`Stripe respondió ${res.status}`, 502);
        const data = (await res.json()) as { url?: string; id?: string };
        return { transactionId, paymentUrl: data.url, raw: { sessionId: data.id ?? null } };
      },
      verifyWebhook: async (request) => {
        const { body, headers } = request as { body?: Record<string, unknown>; headers?: Record<string, unknown> };
        const secret = config.webhookSecret ?? envOf('STRIPE_WEBHOOK_SECRET') ?? '';
        if (secret) {
          const signature = String(headers?.['stripe-signature'] ?? '');
          const expected = `sha256=${await hmacSha256Hex(secret, JSON.stringify(body ?? {}))}`;
          if (signature !== expected) throw httpError('Firma inválida', 401);
        }

        const object = (body?.data as Record<string, unknown> | undefined)?.object as Record<string, unknown> | undefined;
        const transactionId = String(object?.client_reference_id ?? object?.id ?? '');
        const status = toStatus(String(object?.payment_status ?? object?.status ?? 'pending'));
        return { transactionId, status, raw: body };
      },
    });

    fastify.get('/public-config', async () => ({ publishableKey: config.publishableKey ?? null, primaryColor: config.primaryColor ?? '#635bff' }));
  },
});
