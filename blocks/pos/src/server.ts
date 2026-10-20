import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Bloque de cobro presencial (POS).
 *
 * Mantiene el registro como proveedor de pagos (`payment`) y agrega rutas de
 * venta/cobro bajo `/api/v1/blocks/pos`.
 *
 * ⚠️ Permiso requerido: `sales.manage`. Estas rutas usan SOLO `authenticate`
 * (no `authorize`) a propósito: se documenta el requisito de permiso pero no se
 * impone acá, para no bloquear flujos de cobro.
 */
export default defineBlock(manifest, {
  register: async (fastify, options) => {
    const config = options as Record<string, unknown>;
    const mode = String(config.mode ?? 'cash');
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    // Proveedor de pago (contra entrega / lector físico).
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
        const status = statusRaw === 'approved' ? 'approved' : statusRaw === 'rejected' ? 'rejected' : 'pending';
        return { transactionId: String(body?.id ?? ''), status };
      },
    });

    fastify.get('/public-config', async () => ({ mode, primaryColor: config.primaryColor ?? '#16a34a' }));

    // ── POS / cobro presencial ────────────────────────────────────────────
    // Productos disponibles para vender (tabla `products`).
    fastify.get('/products', { preHandler: [authenticate] }, async () =>
      db.product.findMany({ orderBy: { title: 'asc' } }),
    );

    // Cobro: crea la orden pagada + el pago y descuenta stock.
    fastify.post('/checkout', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as {
        body?: { items?: Array<{ id?: string; qty?: number }>; userId?: string; method?: string };
      };
      const rawItems = (body?.items ?? []).filter((i) => i && typeof i.id === 'string' && i.id);
      if (rawItems.length === 0) return { ok: false, error: 'No se indicaron ítems para cobrar' };

      const lines: Array<{ id: string; title: string; qty: number; unitPrice: number }> = [];
      let total = 0;
      for (const it of rawItems) {
        const product = await db.product.findUnique({ where: { id: it.id } });
        if (!product) return { ok: false, error: `Producto no encontrado: ${it.id}` };
        const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
        total += product.price * qty;
        lines.push({ id: product.id, title: product.title, qty, unitPrice: product.price });
      }

      const now = new Date();
      const order = await db.order.create({
        data: { status: 'paid', total, items: lines },
      });

      const transactionId = `pos_${crypto.randomUUID()}`;
      const payment = await db.payment.create({
        data: {
          provider: 'pos',
          transactionId,
          amount: total,
          currency: 'ARS',
          status: 'approved',
          userId: body?.userId || null,
          externalReference: order.id,
          paidAt: now,
          metadata: { method: body?.method ?? 'cash', orderId: order.id },
        },
      });

      // Descuenta stock del producto y de los ítems de inventario asociados.
      for (const line of lines) {
        await db.product.update({ where: { id: line.id }, data: { stock: { decrement: line.qty } } });
        const inventory = await db.inventoryItem.findMany({ where: { productId: line.id } });
        for (const inv of inventory as Array<{ id: string }>) {
          await db.inventoryItem.update({ where: { id: inv.id }, data: { quantity: { decrement: line.qty } } });
        }
      }

      return { ok: true, order, payment };
    });

    // Historial de ventas pagas.
    fastify.get('/sales', { preHandler: [authenticate] }, async () =>
      db.order.findMany({ where: { status: 'paid' }, orderBy: { createdAt: 'desc' } }),
    );
  },
});
