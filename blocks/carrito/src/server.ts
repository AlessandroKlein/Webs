import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface CartItem {
  itemId: string;
  productId: string;
  title: string;
  price: number;
  qty: number;
  size: string | null;
}

/** Genera un id único local (el carrito es efímero y vive en memoria). */
function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Carrito simple en memoria, keyeado por usuario. Se persiste como `Order`
 * cuando el cliente confirma la compra vía `POST /api/v1/blocks/ecommerce/orders`.
 */
export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const currency = String((config as Record<string, unknown>).currency ?? 'ARS');

    const carts = new Map<string, CartItem[]>();

    fastify.get('/catalog', async () => (config as Record<string, unknown>).catalog ?? []);

    fastify.get('/cart', async (request: unknown) => {
      const { query } = request as { query?: { userId?: string } };
      const userId = query?.userId ?? 'guest';
      const items = carts.get(userId) ?? [];
      return {
        userId,
        items,
        count: items.reduce((s, i) => s + i.qty, 0),
        total: items.reduce((s, i) => s + i.price * i.qty, 0),
        currency,
      };
    });

    fastify.post('/cart', async (request: unknown) => {
      const { body } = request as {
        body?: { userId?: string; productId?: string; qty?: number; size?: string | null };
      };
      const userId = body?.userId ?? 'guest';
      const productId = body?.productId;
      if (!productId) return { ok: false, error: 'Falta productId' };
      const qty = Math.max(1, Number(body?.qty ?? 1));
      const size = body?.size ?? null;

      let product: { title?: string; price?: number } | null = null;
      try {
        product = (await db.product.findUnique({ where: { id: productId } })) as {
          title?: string;
          price?: number;
        } | null;
      } catch {
        product = null;
      }
      const title = product?.title ?? productId;
      const price = Number(product?.price ?? 0);

      const items = carts.get(userId) ?? [];
      const existing = items.find((i) => i.productId === productId && i.size === size);
      if (existing) {
        existing.qty += qty;
      } else {
        items.push({ itemId: makeId(), productId, title, price, qty, size });
      }
      carts.set(userId, items);

      return {
        ok: true,
        userId,
        items,
        count: items.reduce((s, i) => s + i.qty, 0),
        total: items.reduce((s, i) => s + i.price * i.qty, 0),
        currency,
      };
    });

    fastify.delete('/cart/:itemId', async (request: unknown) => {
      const { params, query } = request as { params?: { itemId?: string }; query?: { userId?: string } };
      const itemId = params?.itemId;
      if (!itemId) return { ok: false, error: 'Falta itemId' };
      const userId = query?.userId;

      for (const [key, items] of carts) {
        if (userId && key !== userId) continue;
        const next = items.filter((i) => i.itemId !== itemId);
        if (next.length !== items.length) {
          carts.set(key, next);
          return {
            ok: true,
            userId: key,
            items: next,
            count: next.reduce((s, i) => s + i.qty, 0),
            total: next.reduce((s, i) => s + i.price * i.qty, 0),
            currency,
          };
        }
      }
      return { ok: false, error: 'Ítem no encontrado' };
    });
  },
});
