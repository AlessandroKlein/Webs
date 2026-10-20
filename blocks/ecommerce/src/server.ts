import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

type OrderStatus = 'pending' | 'paid' | 'preparing' | 'shipped' | 'cancelled';

/** Proveedores de envío soportados (terceros + local). */
const SHIPPING_PROVIDERS = ['local', 'andreani', 'oca', 'correo', 'mercadolibre', 'dhl'] as const;

/** Tarifas por defecto si `settings.shippingRates` está vacío. */
const DEFAULT_SHIPPING_RATES = [
  { provider: 'local', baseCost: 500, costPerKg: 100, days: 2 },
  { provider: 'andreani', baseCost: 1200, costPerKg: 150, days: 3 },
  { provider: 'oca', baseCost: 1300, costPerKg: 160, days: 4 },
  { provider: 'correo', baseCost: 900, costPerKg: 120, days: 5 },
  { provider: 'mercadolibre', baseCost: 1100, costPerKg: 140, days: 3 },
  { provider: 'dhl', baseCost: 3000, costPerKg: 300, days: 2 },
];

/** Normaliza un campo JSON (`images`/`sizes`) a un array de strings. */
const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

/** Convierte texto a slug (minúsculas, sin tildes, guiones) para el SKU. */
const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

/** Normaliza `stockBySize` a un mapa talle → cantidad. */
const stockBySize = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
};

/**
 * Crea/actualiza un `InventoryItem` por cada talle del producto, de modo que el
 * stock por talle se comparte con el bloque de inventario (`/admin/inventory`).
 * - sku: `slug(title)-slug(size)`
 * - name: `"title (size)"`
 * - quantity: stock de ese talle
 * - unitPrice: precio del producto
 * - productId: id del producto
 */
const syncInventoryBySize = async (
  db: Record<string, any>,
  product: { id: string; title: string; price: number; category?: string | null },
  sizes: string[],
  bySize: Record<string, number>,
): Promise<void> => {
  for (const size of sizes) {
    const sku = slugify(`${product.title}-${size}`);
    const name = `${product.title} (${size})`;
    const quantity = bySize[size] ?? 0;
    const existing = await db.inventoryItem.findFirst({ where: { productId: product.id, sku } });
    if (existing) {
      await db.inventoryItem.update({
        where: { id: existing.id },
        data: {
          sku,
          name,
          quantity,
          unitPrice: product.price,
          category: product.category ?? null,
          productId: product.id,
        },
      });
    } else {
      await db.inventoryItem.create({
        data: {
          sku,
          name,
          quantity,
          minQuantity: 0,
          unitPrice: product.price,
          category: product.category ?? null,
          organizationId: null,
          productId: product.id,
        },
      });
    }
  }
};

/**
 * Repone el stock al cancelar un pedido: incrementa `Product.stock` por cada
 * ítem y, si hay `InventoryItem` vinculado (por `productId`, y por talle cuando
 * corresponde), también su `quantity`.
 */
const restockOrder = async (
  db: Record<string, any>,
  items: unknown,
): Promise<void> => {
  const list = (Array.isArray(items) ? items : []) as Array<{
    id?: string;
    title?: string;
    qty?: number;
    size?: string | null;
  }>;
  for (const item of list) {
    if (typeof item?.id !== 'string') continue;
    const qty = Math.max(1, Number(item.qty ?? 1));

    // 1) Stock simple del producto.
    try {
      await db.product.update({
        where: { id: item.id },
        data: { stock: { increment: qty } },
      });
    } catch {
      // Producto inexistente: se omite.
    }

    // 2) Ítem(s) de inventario vinculados al producto.
    try {
      const matches: Array<{ id: string; name: string; sku: string }> = await db.inventoryItem.findMany({
        where: { productId: item.id },
      });
      let target = matches[0];
      if (matches.length > 1 && item.size) {
        const sizeSlug = slugify(item.size);
        target =
          matches.find((m) => m.sku.endsWith(`-${sizeSlug}`) || m.name === `${item.title ?? ''} (${item.size})`) ??
          matches[0];
      }
      if (target) {
        await db.inventoryItem.update({
          where: { id: target.id },
          data: { quantity: { increment: qty } },
        });
      }
    } catch {
      // Sin inventario vinculado: se omite.
    }
  }
};

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as Record<string, unknown>;
    const products = (Array.isArray(cfg.products) ? cfg.products : []) as Array<{ id: string; title: string; price: number; stock: number; category?: string }>;
    const shippingFlat = Number(cfg.shippingFlat ?? 0);
    const configuredProvider =
      (typeof cfg.shippingProvider === 'string' ? cfg.shippingProvider : undefined) ??
      (typeof cfg.shippingProviders === 'string' ? cfg.shippingProviders : undefined);
    const defaultProvider = configuredProvider && (SHIPPING_PROVIDERS as readonly string[]).includes(configuredProvider)
      ? configuredProvider
      : 'local';
    const configuredRates = (Array.isArray(cfg.shippingRates) ? cfg.shippingRates : []) as Array<{ provider?: string; baseCost?: number; costPerKg?: number; days?: number }>;
    const shippingRates = configuredRates.length
      ? configuredRates.map((r) => ({
          provider: r.provider ?? 'local',
          baseCost: Number(r.baseCost ?? 0),
          costPerKg: Number(r.costPerKg ?? 0),
          days: Number(r.days ?? 3),
        }))
      : DEFAULT_SHIPPING_RATES;

    // Datos persistentes (tablas `orders`/`shipments`/`coupons` del esquema principal).
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    // ------------------------------------------------------------------
    // Productos (CRUD)
    // ------------------------------------------------------------------
    fastify.get('/products', async () => products);

    fastify.post('/products', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as {
        body?: {
          title?: string;
          description?: string | null;
          price?: number;
          stock?: number;
          category?: string | null;
          imageUrl?: string | null;
          images?: unknown;
          sizes?: unknown;
          stockBySize?: unknown;
        };
      };
      const title = body?.title ?? '';
      const price = Number(body?.price ?? 0);
      const sizes = stringArray(body?.sizes);
      const product = await db.product.create({
        data: {
          title,
          description: body?.description ?? null,
          price,
          stock: Number(body?.stock ?? 0),
          category: body?.category ?? null,
          imageUrl: body?.imageUrl ?? null,
          images: stringArray(body?.images),
          sizes,
        },
      });
      // Stock por talle: crea un ítem de inventario por cada talle del producto.
      if (sizes.length > 0) {
        await syncInventoryBySize(db, product, sizes, stockBySize(body?.stockBySize));
      }
      return product;
    });

    fastify.get('/products/persisted', async () => db.product.findMany({ orderBy: { title: 'asc' } }));

    fastify.patch('/products/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: {
          title?: string;
          description?: string | null;
          price?: number;
          stock?: number;
          category?: string | null;
          imageUrl?: string | null;
          images?: unknown;
          sizes?: unknown;
          stockBySize?: unknown;
        };
      };
      const data: Record<string, unknown> = {};
      if (body?.title !== undefined) data.title = body.title;
      if (body?.description !== undefined) data.description = body.description;
      if (body?.price !== undefined) data.price = Number(body.price);
      if (body?.stock !== undefined) data.stock = Number(body.stock);
      if (body?.category !== undefined) data.category = body.category;
      if (body?.imageUrl !== undefined) data.imageUrl = body.imageUrl;
      if (body?.images !== undefined) data.images = stringArray(body.images);
      if (body?.sizes !== undefined) data.sizes = stringArray(body.sizes);
      const product = await db.product.update({ where: { id: params?.id }, data });
      // Stock por talle: actualiza los ítems de inventario si cambiaron los talles.
      if (body?.sizes !== undefined) {
        const sizes = stringArray(body.sizes);
        if (sizes.length > 0) {
          await syncInventoryBySize(db, product, sizes, stockBySize(body?.stockBySize));
        }
      }
      return product;
    });

    fastify.delete('/products/:id', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.product.delete({ where: { id: params?.id } });
    });

    // ------------------------------------------------------------------
    // Pedidos
    // ------------------------------------------------------------------
    fastify.get('/orders', async () => db.order.findMany({ orderBy: { createdAt: 'desc' } }));

    fastify.post('/orders', async (request: unknown) => {
      const { body } = request as {
        body?: {
          items?: Array<{ id: string; qty?: number; size?: string | null }>;
          shippingAddress?: { street?: string; number?: string; city?: string; province?: string; postalCode?: string; country?: string };
          shippingMethod?: string | null;
          shippingCost?: number;
        };
      };
      const requested = (Array.isArray(body?.items) ? body.items : []).filter((i) => typeof i?.id === 'string');
      const persisted = await db.product.findMany({ where: { id: { in: requested.map((i) => i.id) } } });
      const byId = new Map<string, { title: string; price: number }>(
        persisted.map((p: { id: string; title: string; price: number }) => [p.id, p]),
      );
      const items = requested.map((i) => {
        const p = byId.get(i.id);
        const qty = Math.max(1, Number(i.qty ?? 1));
        return { id: i.id, title: p?.title ?? i.id, price: p?.price ?? 0, qty, size: i.size ?? null };
      });
      const shippingCost = Math.max(0, Number(body?.shippingCost ?? shippingFlat));
      const total = items.reduce((s, i) => s + i.price * i.qty, 0) + shippingCost;

      // Dirección de envío y método guardados como un objeto extra `_shipping`
      // dentro del array `items` (el modelo `Order` solo tiene `items` Json).
      const address = body?.shippingAddress;
      const shippingMeta = {
        _shipping: {
          address: address
            ? {
                street: address.street ?? '',
                number: address.number ?? '',
                city: address.city ?? '',
                province: address.province ?? '',
                postalCode: address.postalCode ?? '',
                country: address.country ?? '',
              }
            : null,
          method: body?.shippingMethod ?? null,
          cost: shippingCost,
        },
      };
      return db.order.create({ data: { items: [...items, shippingMeta], total, status: 'pending' } });
    });

    fastify.patch('/orders/:id', async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { status?: OrderStatus } };
      if (!body?.status) return { ok: false };
      const existing = await db.order.findUnique({ where: { id: params?.id } });
      if (!existing) return { ok: false, error: 'Pedido no encontrado' };
      const updated = await db.order.update({ where: { id: params?.id }, data: { status: body.status } });
      // Cancelar repone el stock (solo la primera vez, no al re-cancelar).
      if (body.status === 'cancelled' && existing.status !== 'cancelled') {
        await restockOrder(db, existing.items);
      }
      return updated;
    });

    // Aplica un cupón activo/vigente y descuenta el % del total del pedido.
    fastify.post('/orders/:id/apply-coupon', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { code?: string } };
      const order = await db.order.findUnique({ where: { id: params?.id } });
      if (!order) return { ok: false, error: 'Pedido no encontrado' };

      const coupon = await db.coupon.findUnique({ where: { code: body?.code } });
      if (!coupon) return { ok: false, error: 'Cupón no encontrado' };
      if (!coupon.active) return { ok: false, error: 'Cupón inactivo' };
      if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) return { ok: false, error: 'Cupón vencido' };

      const discountPercent = Number(coupon.discountPercent ?? 0);
      const discount = Math.round((Number(order.total) * discountPercent) / 100);
      const total = Number(order.total) - discount;
      const updated = await db.order.update({ where: { id: order.id }, data: { total } });
      return { ok: true, code: coupon.code, discountPercent, discount, total, order: updated };
    });

    // ------------------------------------------------------------------
    // Envíos (terceros) — cotización y despachos
    // ------------------------------------------------------------------
    fastify.get('/shipping/quotes', async (request: unknown) => {
      const { body, query } = request as {
        body?: { provider?: string; weight?: number; destination?: string; postalCode?: string; province?: string; city?: string };
        query?: { provider?: string; weight?: string; destination?: string; postalCode?: string; province?: string; city?: string };
      };
      const weight = Number(body?.weight ?? query?.weight ?? 1);
      const destination = body?.postalCode ?? query?.postalCode ?? body?.destination ?? query?.destination ?? '';
      const province = body?.province ?? query?.province ?? '';
      const city = body?.city ?? query?.city ?? '';

      const requested = body?.provider ?? query?.provider;
      // Sin `provider`, o con `provider=all`/`list`, se devuelven todas las
      // opciones: local + los proveedores registrados en el registro de envíos.
      const listMode = !requested || requested === 'all' || requested === 'list';

      const input = {
        weight,
        postalCode: destination || null,
        destination: destination || null,
        province: province || null,
        city: city || null,
      };

      // Tarifa local calculada a partir de `shippingRates`.
      const localQuote = (provider: string) => {
        const rate = shippingRates.find((r) => r.provider === provider);
        const baseCost = Number(rate?.baseCost ?? 0);
        const costPerKg = Number(rate?.costPerKg ?? 0);
        const days = Number(rate?.days ?? 3);
        return {
          provider,
          cost: Math.round(baseCost + costPerKg * Math.max(weight, 0)),
          days,
          currency: 'ARS',
          source: 'local' as const,
        };
      };

      const quoteOne = async (provider: string) => {
        if (provider === 'local') return localQuote('local');
        const adapter = fastify.shipping?.get(provider);
        if (!adapter) return null;
        try {
          const quote = await adapter.quote(cfg, input);
          // Sin credenciales o sin tarifa real el proveedor devuelve cost 0.
          if (quote.cost <= 0) return null;
          return {
            provider,
            cost: quote.cost,
            days: quote.days,
            currency: quote.currency ?? 'ARS',
            source: 'provider' as const,
          };
        } catch {
          return null;
        }
      };

      if (listMode) {
        const registered = (fastify.shipping?.list() ?? []).map((p) => p.id);
        const providers = ['local', ...registered.filter((id) => id !== 'local')];
        const quotes = (await Promise.all(providers.map(quoteOne))).filter(
          (q): q is NonNullable<typeof q> => q !== null,
        );
        return { ok: true, quotes };
      }

      const provider = requested;
      if (!provider) return { ok: false, error: 'Proveedor no especificado' };
      if (provider === 'local') return localQuote('local');

      const adapter = fastify.shipping?.get(provider);
      if (!adapter) {
        return {
          ok: false,
          error: 'Proveedor no soportado',
          providers: ['local', ...(fastify.shipping?.list() ?? []).map((p) => p.id)],
        };
      }

      try {
        const quote = await adapter.quote(cfg, input);
        if (quote.cost <= 0) return localQuote(provider); // sin credenciales → tarifa local
        return {
          provider,
          cost: quote.cost,
          days: quote.days,
          destination,
          currency: quote.currency ?? 'ARS',
          source: 'provider' as const,
        };
      } catch {
        return localQuote(provider);
      }
    });

    fastify.post('/shipments', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: { orderId?: string; provider?: string; trackingNumber?: string } };
      const order = await db.order.findUnique({ where: { id: body?.orderId } });
      if (!order) return { ok: false, error: 'Pedido no encontrado' };
      const provider = body?.provider ?? defaultProvider;
      if (!(SHIPPING_PROVIDERS as readonly string[]).includes(provider)) {
        return { ok: false, error: 'Proveedor no soportado', providers: SHIPPING_PROVIDERS };
      }
      return db.shipment.create({
        data: {
          orderId: body?.orderId,
          provider,
          trackingNumber: body?.trackingNumber ?? null,
          status: 'pending',
          cost: 0,
        },
      });
    });

    fastify.get('/shipments', async (request: unknown) => {
      const { query } = request as { query?: { orderId?: string } };
      const where = query?.orderId ? { orderId: query.orderId } : {};
      return db.shipment.findMany({ where, orderBy: { createdAt: 'desc' } });
    });

    fastify.patch('/shipments/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { status?: string } };
      if (!body?.status) return { ok: false };
      return db.shipment.update({ where: { id: params?.id }, data: { status: body.status } });
    });

    // ------------------------------------------------------------------
    // Cupones
    // ------------------------------------------------------------------
    fastify.get('/coupons', async () => db.coupon.findMany({ orderBy: { createdAt: 'desc' } }));

    fastify.post('/coupons', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: { code?: string; discountPercent?: number; validUntil?: string } };
      return db.coupon.create({
        data: {
          code: body?.code ?? '',
          discountPercent: Number(body?.discountPercent ?? 0),
          validUntil: body?.validUntil ? new Date(body.validUntil) : null,
          active: true,
        },
      });
    });

    fastify.delete('/coupons/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.coupon.delete({ where: { id: params?.id } });
    });

    fastify.get('/dashboard', async () => {
      const orders = await db.order.findMany();
      const revenue = orders.filter((o: { status: string }) => o.status === 'paid').reduce((s: number, o: { total: number }) => s + o.total, 0);
      const avgTicket = orders.length ? revenue / orders.length : 0;
      return { revenue, avgTicket, orders: orders.length, shippingFlat };
    });
  },
});
