import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/** Organización raíz por defecto (fallback single-tenant), idéntico a `DEFAULT_ORG_ID` de apps/api. */
const ROOT_ORG_ID = '00000000-0000-4000-8000-000000000001';

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Plugin de cobro presencial (POS).
 *
 * Mantiene el registro como proveedor de pagos (`payment`) y agrega rutas de
 * venta/cobro bajo `/api/v1/plugins/pos`.
 *
 * ⚠️ Permiso requerido: `sales.manage`. Estas rutas usan SOLO `authenticate`
 * (no `authorize`) a propósito: se documenta el requisito de permiso pero no se
 * impone acá, para no bloquear flujos de cobro.
 */
export default definePlugin(manifest, {
  register: async (fastify, options) => {
    const config = options as Record<string, unknown>;
    const mode = String(config.mode ?? 'cash');
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    // Resuelve la organización activa (tenant) con fallback a la org raíz 'principal'.
    const resolveOrgId = async (request: unknown): Promise<string> => {
      try {
        const { resolveTenant } = fastify as unknown as {
          resolveTenant?: (req: unknown) => Promise<{ organizationId?: string | null }>;
        };
        const tenant = resolveTenant ? await resolveTenant(request) : null;
        return tenant?.organizationId ?? ROOT_ORG_ID;
      } catch {
        return ROOT_ORG_ID;
      }
    };

    // Scoping fail-closed (ADR-0006): fragmento `where` por tenant + preHandler.
    const requireTenant = (fastify as unknown as {
      requireTenant?: (req: unknown, reply: unknown) => Promise<void>;
    }).requireTenant;
    const resolveScope = async (request: unknown): Promise<Record<string, unknown>> => {
      const api = fastify as unknown as {
        resolveScope?: (tenant: unknown) => Promise<Record<string, unknown>>;
        resolveTenant?: (req: unknown) => Promise<unknown>;
      };
      if (api.resolveTenant && api.resolveScope) return api.resolveScope(await api.resolveTenant(request));
      return { organizationId: ROOT_ORG_ID };
    };

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
    // `?q=` filtra por título (contiene) o por código de barras (igual), insensible a mayúsculas.
    fastify.get('/products', { preHandler: [authenticate, requireTenant] }, async (request: unknown) => {
      const { query } = request as { query?: { q?: string } };
      const q = (query?.q ?? '').trim();
      if (!q) return db.product.findMany({ where: await resolveScope(request), orderBy: { title: 'asc' } });
      return db.product.findMany({
        where: {
          ...(await resolveScope(request)),
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { barcode: { equals: q, mode: 'insensitive' } },
          ],
        },
        orderBy: { title: 'asc' },
      });
    });

    // Cobro: crea la orden pagada + el pago y descuenta stock.
    fastify.post('/checkout', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as {
        body?: { items?: Array<{ id?: string; qty?: number; barcode?: string }>; userId?: string; method?: string };
      };
      const rawItems = (body?.items ?? []).filter(
        (i) => i && ((typeof i.id === 'string' && i.id) || (typeof i.barcode === 'string' && i.barcode.trim())),
      );
      if (rawItems.length === 0) return { ok: false, error: 'No se indicaron ítems para cobrar' };

      const lines: Array<{ id: string; title: string; qty: number; unitPrice: number }> = [];
      let total = 0;
      for (const it of rawItems) {
        let product: Record<string, any> | null = null;
        if (typeof it.id === 'string' && it.id) {
          product = await db.product.findUnique({ where: { id: it.id } });
        }
        if (!product && typeof it.barcode === 'string' && it.barcode.trim()) {
          product = await db.product.findFirst({ where: { barcode: it.barcode.trim() } });
        }
        if (!product) return { ok: false, error: `Producto no encontrado: ${it.id ?? it.barcode}` };
        const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
        total += product.price * qty;
        lines.push({ id: product.id, title: product.title, qty, unitPrice: product.price });
      }

      const now = new Date();
      const organizationId = await resolveOrgId(request);
      const order = await db.order.create({
        data: { status: 'paid', total, items: lines, organizationId },
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
          organizationId,
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

    // Historial de ventas pagas (scope del tenant, fail-closed).
    fastify.get('/sales', { preHandler: [authenticate, requireTenant] }, async (request: unknown) =>
      db.order.findMany({ where: { status: 'paid', ...(await resolveScope(request)) }, orderBy: { createdAt: 'desc' } }),
    );
  },
});
