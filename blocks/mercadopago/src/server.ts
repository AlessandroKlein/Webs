import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface MpConfig {
  publicKey?: string;
  accessToken?: string;
  webhookSecret?: string;
  environment?: string;
  checkoutMode?: string;
  primaryColor?: string;
  storeName?: string;
}

/** HMAC-SHA256 (hex) usando Web Crypto, sin dependencias de Node. */
async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Bloque Mercado Pago: se registra como proveedor en el núcleo de pagos
 * (checkout y webhook genéricos) y expone su config pública al cliente.
 */
export default defineBlock(manifest, {
  register: async (fastify, options) => {
    const config = options as MpConfig;

    fastify.payments?.register({
      id: 'mercadopago',
      displayName: 'Mercado Pago',
      createTransaction: async (input) => {
        const paymentId = `mp_${crypto.randomUUID()}`;
        // (Producción) POST https://api.mercadopago.com/checkout/preferences con
        // config.accessToken; la respuesta trae init_point / sandbox_init_point.
        const initPoint =
          (config.checkoutMode ?? 'redirect') === 'redirect'
            ? `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${paymentId}`
            : undefined;
        return { transactionId: paymentId, paymentUrl: initPoint, raw: { environment: config.environment } };
      },
      verifyWebhook: async (request) => {
        const { body, headers } = request as { body?: Record<string, unknown>; headers?: Record<string, unknown> };
        const signature = String(headers?.['x-signature'] ?? '');
        const secret = config.webhookSecret ?? '';
        const expected = `sha256=${await hmacSha256Hex(secret, JSON.stringify(body ?? {}))}`;
        if (!secret || signature !== expected) throw new Error('Firma de webhook inválida');

        const data = body?.data as Record<string, unknown> | undefined;
        const transactionId = String(data?.id ?? body?.id ?? '');
        const statusRaw = String(data?.status ?? body?.status ?? 'pending');
        const status =
          statusRaw === 'approved' || statusRaw === 'accredited' ? 'approved' : statusRaw === 'rejected' ? 'rejected' : 'pending';
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
    onInstall: async (ctx) => ctx.logger.info('bloque Mercado Pago instalado'),
    onUninstall: async (ctx) => ctx.logger.info('bloque Mercado Pago desinstalado'),
  },
});
