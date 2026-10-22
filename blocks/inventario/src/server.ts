import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/**
 * Mantiene `Product.stock` como fuente de verdad única cuando la organización
 * dueña del ítem tiene `shareInventory` habilitado: el stock del producto pasa
 * a ser la suma de las cantidades de sus ítems vinculados (`InventoryItem.productId`).
 * Con `shareInventory=false` (o sin organización) no hay efectos cruzados: el
 * inventario y la tienda siguen siendo fuentes independientes.
 */
const syncProductStock = async (
  db: Record<string, any>,
  item: { productId?: string | null; organizationId?: string | null },
): Promise<void> => {
  if (!item?.productId) return;
  let shared = false;
  if (item.organizationId) {
    const org = await db.organization.findUnique({
      where: { id: item.organizationId },
      select: { shareInventory: true },
    });
    shared = Boolean(org?.shareInventory);
  }
  if (!shared) return;
  const linked = (await db.inventoryItem.findMany({
    where: { productId: item.productId },
    select: { quantity: true },
  })) as Array<{ quantity: number }>;
  const stock = linked.reduce((sum, i) => sum + Number(i.quantity ?? 0), 0);
  // `updateMany` (no `update`) evita fallar si el producto ya no existe.
  await db.product.updateMany({ where: { id: item.productId }, data: { stock } });
};

/**
 * Plugin de control de inventario. Rutas bajo `/api/v1/plugins/inventario`.
 * Se vincula al stock de la tienda (`Product.stock`) vía `productId`.
 */
export default definePlugin(manifest, {
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

    // Consulta de stock por SKU (o código de barras) en TODAS las sucursales:
    // devuelve el ítem con ese SKU/barcode en cada organización (para saber
    // dónde hay stock disponible).
    fastify.get('/inventory/search', { preHandler: [authenticate] }, async (request: unknown) => {
      const { query } = request as { query?: { sku?: string; barcode?: string } };
      const sku = (query?.sku ?? '').trim();
      const barcode = (query?.barcode ?? '').trim();
      if (!sku && !barcode) return [];
      const or: Array<Record<string, unknown>> = [];
      if (sku) or.push({ sku });
      if (barcode) or.push({ barcode });
      const items = await db.inventoryItem.findMany({
        where: { OR: or },
        orderBy: [{ organizationId: 'asc' }, { name: 'asc' }],
      });
      // Enriquece cada ítem con el nombre de su sucursal.
      const orgIds = [
        ...new Set(
          (items as Array<{ organizationId: string | null }>)
            .map((i) => i.organizationId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const orgs = orgIds.length
        ? await db.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true },
          })
        : [];
      const orgMap = new Map((orgs as Array<{ id: string; name: string }>).map((o) => [o.id, o.name]));
      return (items as Array<{ organizationId: string | null }>).map((i) => ({
        ...i,
        organizationName: i.organizationId ? (orgMap.get(i.organizationId) ?? i.organizationId) : null,
      }));
    });

    fastify.post('/inventory', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as {
        body?: { sku?: string; name?: string; quantity?: number; minQuantity?: number; unitPrice?: number; category?: string; organizationId?: string | null; productId?: string | null; barcode?: string | null };
      };
      const created = await db.inventoryItem.create({
        data: {
          sku: body?.sku ?? '',
          name: body?.name ?? '',
          quantity: Number(body?.quantity ?? 0),
          minQuantity: Number(body?.minQuantity ?? 0),
          unitPrice: Number(body?.unitPrice ?? 0),
          category: body?.category || null,
          organizationId: body?.organizationId || null,
          productId: body?.productId || null,
          barcode: body?.barcode || null,
        },
      });
      await syncProductStock(db, created);
      return created;
    });

    fastify.patch('/inventory/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: { sku?: string; name?: string; quantity?: number; minQuantity?: number; unitPrice?: number; category?: string | null; organizationId?: string | null; productId?: string | null; barcode?: string | null };
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
      if (body?.barcode !== undefined) data.barcode = body.barcode;
      const existing = await db.inventoryItem.findUnique({ where: { id: params?.id } });
      const updated = await db.inventoryItem.update({ where: { id: params?.id }, data });
      // Si el ítem cambió de producto, re-sincroniza también el producto anterior.
      if (existing?.productId && existing.productId !== updated.productId) {
        await syncProductStock(db, existing);
      }
      await syncProductStock(db, updated);
      return updated;
    });

    fastify.delete('/inventory/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      const existing = await db.inventoryItem.findUnique({ where: { id: params?.id } });
      if (!existing) return { ok: false, error: 'Ítem no encontrado' };
      await db.inventoryItem.delete({ where: { id: params?.id } });
      await syncProductStock(db, existing);
      return existing;
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
      await syncProductStock(db, item);
      return { ok: true, item: updated, reason: body?.reason ?? null };
    });

    fastify.get('/inventory/low', { preHandler: [authenticate] }, async () => {
      const items = await db.inventoryItem.findMany({ orderBy: { name: 'asc' } });
      return items.filter((i: { quantity: number; minQuantity: number }) => i.quantity <= Math.max(i.minQuantity, lowThreshold));
    });
  },
});
