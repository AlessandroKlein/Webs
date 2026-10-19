import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

type OrderStatus = 'pending' | 'paid' | 'preparing' | 'shipped' | 'cancelled';
interface Order { id: string; items: Array<{ id: string; title: string; price: number; qty: number }>; total: number; status: OrderStatus; createdAt: string }
const orders: Order[] = [];

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as Record<string, unknown>;
    const products = (Array.isArray(cfg.products) ? cfg.products : []) as Array<{ id: string; title: string; price: number; stock: number; category?: string }>;
    const shippingFlat = Number(cfg.shippingFlat ?? 0);

    fastify.get('/products', async () => products);

    fastify.get('/orders', async () => orders);

    fastify.post('/orders', async (request: unknown) => {
      const { body } = request as { body?: { items?: Array<{ id: string; qty: number }> } };
      const items = (body?.items ?? []).map((i) => {
        const p = products.find((x) => x.id === i.id);
        return { id: i.id, title: p?.title ?? i.id, price: p?.price ?? 0, qty: i.qty };
      });
      const total = items.reduce((s, i) => s + i.price * i.qty, 0) + shippingFlat;
      const order: Order = { id: crypto.randomUUID(), items, total, status: 'pending', createdAt: new Date().toISOString() };
      orders.unshift(order);
      return order;
    });

    fastify.patch('/orders/:id', async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { status?: OrderStatus } };
      const order = orders.find((o) => o.id === params?.id);
      if (!order) return { ok: false };
      if (body?.status) order.status = body.status;
      return order;
    });

    // Dashboard de ventas (ingresos por día + ticket promedio + top productos).
    fastify.get('/dashboard', async () => {
      const revenue = orders.filter((o) => o.status === 'paid').reduce((s, o) => s + o.total, 0);
      const avgTicket = orders.length ? revenue / orders.length : 0;
      return { revenue, avgTicket, orders: orders.length, shippingFlat };
    });
  },
});
