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
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Bloque Mercado Pago (referencia).
 *
 * Muestra el patrón completo de un bloque de pago seguro:
 *  - Secretos (`accessToken`, `webhookSecret`) cifrados en reposo vía
 *    `x-ui.secret` (AES-256-GCM con ENCRYPTION_KEY).
 *  - Un endpoint público (`/public-config`) que NUNCA expone secretos.
 *  - Idempotencia con un token único de pago.
 *  - Verificación de la firma del webhook (HMAC-SHA256).
 *  - Eventos de negocio (`mercadopago.payment.*`) para automatizaciones.
 *
 * En producción, el `accessToken` se usa para llamar a la API de Mercado Pago
 * (POST /checkout/preferences) y la tarjeta se tokeniza con el SDK (publicKey);
 * nunca se guardan datos de tarjeta (PCI-DSS).
 */
export default defineBlock(manifest, {
  register: async (fastify, options) => {
    const config = options as MpConfig;

    // Config pública para el cliente (sin secretos).
    fastify.get('/public-config', async () => ({
      storeName: config.storeName ?? 'Mi Tienda',
      environment: config.environment ?? 'sandbox',
      checkoutMode: config.checkoutMode ?? 'redirect',
      primaryColor: config.primaryColor ?? '#009ee3',
      publicKey: config.publicKey ?? null,
    }));

    // Crear pago (preferencia) con idempotencia y token único.
    fastify.post('/payment', async (request: unknown) => {
      const { body } = request as {
        body?: { amount?: number; description?: string; externalReference?: string; idempotencyKey?: string };
      };
      const amount = body?.amount ?? 0;
      const description = body?.description ?? '';
      const externalReference = body?.externalReference ?? '';
      const idempotencyKey = body?.idempotencyKey ?? crypto.randomUUID(); // token único de pago
      const paymentId = `mp_${crypto.randomUUID()}`;

      // (Producción) POST https://api.mercadopago.com/checkout/preferences con el
      // access token; la respuesta trae `init_point` / `sandbox_init_point`.
      const initPoint =
        (config.checkoutMode ?? 'redirect') === 'redirect'
          ? `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${paymentId}`
          : null;

      if (fastify.events) {
        await fastify.events.emit('mercadopago.payment.created', {
          payment: { id: paymentId, amount, description, externalReference, idempotencyKey },
        });
      }

      return {
        id: paymentId,
        status: 'pending',
        amount,
        description,
        idempotencyKey,
        initPoint,
        publicKey: config.publicKey ?? null,
      };
    });

    // Estado del pago (simulado para la referencia).
    fastify.get('/payment/:id/status', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return { id: params?.id ?? null, status: 'pending' };
    });

    // Webhook: verificación de firma HMAC-SHA256.
    fastify.post('/webhook', async (request: unknown, reply: unknown) => {
      const { body, headers } = request as {
        body?: Record<string, unknown>;
        headers?: Record<string, unknown>;
      };
      const signature = String(headers?.['x-signature'] ?? '');
      const secret = config.webhookSecret ?? '';

      // En producción se firma el body crudo (raw) y se compara contra la cabecera.
      const expected = `sha256=${await hmacSha256Hex(secret, JSON.stringify(body ?? {}))}`;
      if (!secret || signature !== expected) {
        const r = reply as { status: (n: number) => { send: (v: unknown) => unknown } };
        return r.status(401).send({ error: 'Firma inválida' });
      }

      const topic = String(body?.type ?? body?.topic ?? '');
      const data = body?.data as Record<string, unknown> | undefined;
      const paymentId = String(data?.id ?? body?.id ?? '');

      if (fastify.events) {
        await fastify.events.emit('mercadopago.payment.approved', { payment: { id: paymentId, topic } });
      }
      return { ok: true };
    });
  },
  hooks: {
    onInstall: async (ctx) => ctx.logger.info('bloque Mercado Pago instalado'),
    onUninstall: async (ctx) => ctx.logger.info('bloque Mercado Pago desinstalado'),
  },
});
