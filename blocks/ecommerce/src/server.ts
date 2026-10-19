import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

type OrderStatus = 'pending' | 'paid' | 'preparing' | 'shipped' | 'cancelled';

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as Record<string, unknown>;
    const products = (Array.isArray(cfg.products) ? cfg.products : []) as Array<{ id: string; title: string; price: number; stock: number; category?: string }>;
    const shippingFlat = Number(cfg.shippingFlat ?? 0);
    // Datos persistentes (tabla `orders` del esquema principal).
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    fastify.get('/products', async () => products);

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

    fastify.get('/dashboard', async () => {
      const orders = await db.order.findMany();
      const revenue = orders.filter((o: { status: string }) => o.status === 'paid').reduce((s: number, o: { total: number }) => s + o.total, 0);
      const avgTicket = orders.length ? revenue / orders.length : 0;
      return { revenue, avgTicket, orders: orders.length, shippingFlat };
    });
  },
});
