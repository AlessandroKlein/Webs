import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

/**
 * Bloque de control de inventario. Rutas bajo `/api/v1/blocks/inventario`.
 * Se vincula al stock de la tienda (`Product.stock`) vía `productId`.
 */
export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as Record<string, unknown>;
    const lowThreshold = Number(cfg.lowStockThreshold ?? 5);
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    fastify.get('/inventory', { preHandler: [authenticate] }, async (request: unknown) => {
      const { query } = request as { query?: { organizationId?: string } };
      const where: Record<string, unknown> = {};
      if (query?.organizationId) where.organizationId = query.organizationId;
      return db.inventoryItem.findMany({ where, orderBy: { name: 'asc' } });
    });

    fastify.post('/inventory', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as {
        body?: { sku?: string; name?: string; quantity?: number; minQuantity?: number; unitPrice?: number; category?: string; organizationId?: string | null; productId?: string | null };
      };
      return db.inventoryItem.create({
        data: {
          sku: body?.sku ?? '',
          name: body?.name ?? '',
          quantity: Number(body?.quantity ?? 0),
          minQuantity: Number(body?.minQuantity ?? 0),
          unitPrice: Number(body?.unitPrice ?? 0),
          category: body?.category || null,
          organizationId: body?.organizationId || null,
          productId: body?.productId || null,
        },
      });
    });

    fastify.patch('/inventory/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: { sku?: string; name?: string; quantity?: number; minQuantity?: number; unitPrice?: number; category?: string | null; organizationId?: string | null; productId?: string | null };
      };
      const data: Record<string, unknown> = {};
      if (body?.sku !== undefined) data.sku = body.sku;
      if (body?.name !== undefined) data.name = body.name;
      if (body?.quantity !== undefined) data.quantity = Number(body.quantity);
      if (body?.minQuantity !== undefined) data.minQuantity = Number(body.minQuantity);
      if (body?.unitPrice !== undefined) data.unitPrice = Number(body.unitPrice);
      if (body?.category !== undefined) data.category = body.category;
      if (body?.organizationId !== undefined) data.organizationId = body.organizationId;
      if (body?.productId !== undefined) data.productId = body.productId;
      return db.inventoryItem.update({ where: { id: params?.id }, data });
    });

    fastify.delete('/inventory/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.inventoryItem.delete({ where: { id: params?.id } });
    });

    // Ajuste de stock (entrada/salida) con validación de no quedar en negativo.
    fastify.post('/inventory/:id/adjust', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { delta?: number; reason?: string } };
      const item = await db.inventoryItem.findUnique({ where: { id: params?.id } });
      if (!item) return { ok: false, error: 'Ítem no encontrado' };
      const delta = Number(body?.delta ?? 0);
      const next = item.quantity + delta;
      if (next < 0) return { ok: false, error: 'Stock insuficiente' };
      const updated = await db.inventoryItem.update({ where: { id: item.id }, data: { quantity: next } });
      return { ok: true, item: updated, reason: body?.reason ?? null };
    });

    fastify.get('/inventory/low', { preHandler: [authenticate] }, async () => {
      const items = await db.inventoryItem.findMany({ orderBy: { name: 'asc' } });
      return items.filter((i: { quantity: number; minQuantity: number }) => i.quantity <= Math.max(i.minQuantity, lowThreshold));
    });
  },
});
