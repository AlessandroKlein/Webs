import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

type OrderStatus = 'pending' | 'paid' | 'preparing' | 'shipped' | 'cancelled';

/** Proveedores de envío soportados (terceros + local). */
const SHIPPING_PROVIDERS = ['local', 'andreani', 'oca', 'correo', 'dhl'] as const;

/** Tarifas por defecto si `settings.shippingRates` está vacío. */
const DEFAULT_SHIPPING_RATES = [
  { provider: 'local', baseCost: 500, costPerKg: 100, days: 2 },
  { provider: 'andreani', baseCost: 1200, costPerKg: 150, days: 3 },
  { provider: 'oca', baseCost: 1300, costPerKg: 160, days: 4 },
  { provider: 'correo', baseCost: 900, costPerKg: 120, days: 5 },
  { provider: 'dhl', baseCost: 3000, costPerKg: 300, days: 2 },
];

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as Record<string, unknown>;
    const products = (Array.isArray(cfg.products) ? cfg.products : []) as Array<{ id: string; title: string; price: number; stock: number; category?: string }>;
    const shippingFlat = Number(cfg.shippingFlat ?? 0);
    const defaultProvider = typeof cfg.shippingProviders === 'string' && (SHIPPING_PROVIDERS as readonly string[]).includes(cfg.shippingProviders)
      ? cfg.shippingProviders
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

    fastify.post('/products', async (request: unknown) => {
      const { body } = request as { body?: { title?: string; price?: number; stock?: number; category?: string } };
      return db.product.create({
        data: {
          title: body?.title ?? '',
          price: Number(body?.price ?? 0),
          stock: Number(body?.stock ?? 0),
          category: body?.category ?? null,
        },
      });
    });

    fastify.get('/products/persisted', async () => db.product.findMany({ orderBy: { title: 'asc' } }));

    fastify.patch('/products/:id', async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: { title?: string; price?: number; stock?: number; category?: string | null };
      };
      const data: Record<string, unknown> = {};
      if (body?.title !== undefined) data.title = body.title;
      if (body?.price !== undefined) data.price = Number(body.price);
      if (body?.stock !== undefined) data.stock = Number(body.stock);
      if (body?.category !== undefined) data.category = body.category;
      return db.product.update({ where: { id: params?.id }, data });
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
      const { body } = request as { body?: { items?: Array<{ id: string; qty: number }> } };
      const items = (body?.items ?? []).map((i) => {
        const p = products.find((x) => x.id === i.id);
        return { id: i.id, title: p?.title ?? i.id, price: p?.price ?? 0, qty: i.qty };
      });
      const total = items.reduce((s, i) => s + i.price * i.qty, 0) + shippingFlat;
      return db.order.create({ data: { items, total, status: 'pending' } });
    });

    fastify.patch('/orders/:id', async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { status?: OrderStatus } };
      if (!body?.status) return { ok: false };
      return db.order.update({ where: { id: params?.id }, data: { status: body.status } });
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
        body?: { provider?: string; weight?: number; destination?: string };
        query?: { provider?: string; weight?: string; destination?: string };
      };
      const provider = body?.provider ?? query?.provider ?? defaultProvider;
      const weight = Number(body?.weight ?? query?.weight ?? 1);
      const destination = body?.destination ?? query?.destination ?? null;
      if (!(SHIPPING_PROVIDERS as readonly string[]).includes(provider)) {
        return { ok: false, error: 'Proveedor no soportado', providers: SHIPPING_PROVIDERS };
      }
      const rate = shippingRates.find((r) => r.provider === provider);
      const baseCost = Number(rate?.baseCost ?? 0);
      const costPerKg = Number(rate?.costPerKg ?? 0);
      const days = Number(rate?.days ?? 3);
      const cost = Math.round(baseCost + costPerKg * Math.max(weight, 0));
      return { provider, cost, days, destination };
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
