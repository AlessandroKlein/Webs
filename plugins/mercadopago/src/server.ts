import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

interface MpConfig {
  publicKey?: string;
  accessToken?: string;
  webhookSecret?: string;
  environment?: string;
  checkoutMode?: string;
  primaryColor?: string;
  storeName?: string;
}

/** Lee una variable de entorno sin depender de @types/node. */
const envOf = (key: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];

/** HMAC-SHA256 (hex) usando Web Crypto, sin dependencias de Node. */
async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Error con statusCode: el error handler del núcleo lo mapea a ese status. */
const httpError = (message: string, statusCode: number): Error => Object.assign(new Error(message), { statusCode });

const MP_PREFERENCES_URL = 'https://api.mercadopago.com/checkout/preferences';

/**
 * Plugin Mercado Pago: checkout real (creación de preferencia) con modo mock
 * (MP_MODE=mock) y webhook con verificación opcional de firma (x-signature).
 */
export default definePlugin(manifest, {
  register: async (fastify, options) => {
    const config = options as MpConfig;

    fastify.payments?.register({
      id: 'mercadopago',
      displayName: 'Mercado Pago',
      createTransaction: async (input) => {
        const accessToken = config.accessToken ?? envOf('MP_ACCESS_TOKEN') ?? '';
        const mock = envOf('MP_MODE') === 'mock';
        const transactionId = `mp_${crypto.randomUUID()}`;

        if (mock) {
          return {
            transactionId,
            paymentUrl: `https://sandbox.mercadopago.com/mock/${transactionId}`,
            raw: { preferenceId: `pref_${transactionId}`, mock: true },
          };
        }
        if (!accessToken) {
          throw httpError('Mercado Pago no configurado (falta accessToken o MP_ACCESS_TOKEN)', 400);
        }

        const base = envOf('PUBLIC_BASE_URL') ?? '';
        const payload: Record<string, unknown> = {
          items: (input.items ?? []).map((it) => ({
            id: it.id,
            title: it.title,
            quantity: it.quantity,
            currency_id: input.currency,
            unit_price: it.unitPrice / 100,
          })),
          external_reference: transactionId,
        };
        if (base) {
          payload.back_urls = { success: `${base}/checkout/success`, failure: `${base}/checkout/failure`, pending: `${base}/checkout/pending` };
          payload.notification_url = `${base}/api/v1/payments/webhook/mercadopago`;
        }

        const res = await fetch(MP_PREFERENCES_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw httpError(`Mercado Pago respondió ${res.status}`, 502);
        const data = (await res.json()) as { init_point?: string; sandbox_init_point?: string; id?: string };
        return { transactionId, paymentUrl: data.init_point ?? data.sandbox_init_point, raw: { preferenceId: data.id ?? null } };
      },
      verifyWebhook: async (request) => {
        const { body, headers } = request as { body?: Record<string, unknown>; headers?: Record<string, unknown> };
        const secret = config.webhookSecret ?? envOf('MP_WEBHOOK_SECRET') ?? '';
        if (secret) {
          const signature = String(headers?.['x-signature'] ?? '');
          const expected = `sha256=${await hmacSha256Hex(secret, JSON.stringify(body ?? {}))}`;
          if (signature !== expected) throw httpError('Firma de webhook inválida', 401);
        }

        const data = body?.data as Record<string, unknown> | undefined;
        const transactionId = String(data?.external_reference ?? data?.id ?? body?.external_reference ?? body?.id ?? '');
        const statusRaw = String(data?.status ?? body?.status ?? 'pending');
        const status = statusRaw === 'approved' || statusRaw === 'accredited' ? 'approved' : statusRaw === 'rejected' || statusRaw === 'cancelled' ? 'rejected' : 'pending';
        return { transactionId, status, raw: body };
      },
    });

    // Config pública para el cliente (sin secretos).
    fastify.get('/public-config', async () => ({
      storeName: config.storeName ?? 'Mi Tienda',
      environment: config.environment ?? 'sandbox',
      checkoutMode: config.checkoutMode ?? 'redirect',
      primaryColor: config.primaryColor ?? '#009ee3',
      publicKey: config.publicKey ?? null,
    }));
  },
  hooks: {
    onInstall: async (ctx) => ctx.logger.info('plugin Mercado Pago instalado'),
    onUninstall: async (ctx) => ctx.logger.info('plugin Mercado Pago desinstalado'),
  },
});
