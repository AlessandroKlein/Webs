import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '@webs/core';
import { DEFAULT_ORG_ID, resolveScope } from '../../lib/tenant';

/**
 * Inventario completo (M9 — ADR-0023): catálogo (productos/variantes/categorías/
 * marcas/proveedores), almacenes por sucursal y niveles de stock. Rutas bajo
 * `/api/v1/inventory/*` (prefijo aplicado en app.ts).
 *
 * Scoping multi-tenant fail-closed (ADR-0006): toda lectura/escritura se filtra
 * por `organizationId` (vía `resolveScope` + `requireTenant`). Los importes se
 * expresan en centavos (`Int`), igual que `Product.price`.
 */

const isP2002 = (e: unknown): boolean => (e as { code?: string })?.code === 'P2002';

const orgIdOf = (request: { tenant?: { organizationId?: string | null } }): string =>
  request.tenant?.organizationId ?? DEFAULT_ORG_ID;

/** Almacén por defecto de una organización (se crea `MAIN` si no existe). */
async function ensureDefaultWarehouse(tx: Prisma.TransactionClient, organizationId: string) {
  const existing = await tx.warehouse.findFirst({
    where: { organizationId, isDefault: true },
  });
  if (existing) return existing;
  return tx.warehouse.create({
    data: { organizationId, name: 'Almacén principal', code: 'MAIN', isDefault: true, active: true },
  });
}

/** Crea la variante implícita + el nivel de stock en el almacén por defecto. */
async function createImplicitVariant(
  tx: Prisma.TransactionClient,
  organizationId: string,
  product: { id: string; title: string },
  input: { sku?: string; barcode?: string; attributes?: Record<string, unknown> },
  stock: { quantity: number; minQuantity: number; criticalQuantity: number },
) {
  const sku = input.sku?.trim() || `SKU-${product.id}`;
  const warehouse = await ensureDefaultWarehouse(tx, organizationId);
  try {
    const variant = await tx.variant.create({
      data: {
        organizationId,
        productId: product.id,
        sku,
        barcode: input.barcode?.trim() || null,
        name: product.title,
        attributes: (input.attributes as object) ?? {},
      },
    });
    await tx.stockLevel.create({
      data: {
        organizationId,
        warehouseId: warehouse.id,
        productId: product.id,
        variantId: variant.id,
        quantity: stock.quantity,
        minQuantity: stock.minQuantity,
        criticalQuantity: stock.criticalQuantity,
      },
    });
    return variant;
  } catch (e) {
    if (isP2002(e)) throw new ConflictError('El SKU/código de barras ya existe en esta organización');
    throw e;
  }
}

interface ProductBody {
  title?: unknown;
  description?: unknown;
  price?: unknown;
  stock?: unknown;
  categoryId?: unknown;
  brandId?: unknown;
  supplierId?: unknown;
  sku?: unknown;
  barcode?: unknown;
  attributes?: unknown;
  minQuantity?: unknown;
  criticalQuantity?: unknown;
}

interface VariantBody {
  sku?: unknown;
  barcode?: unknown;
  name?: unknown;
  attributes?: unknown;
  active?: unknown;
}

interface CatalogBody {
  name?: unknown;
  parentId?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  active?: unknown;
}

interface WarehouseBody {
  name?: unknown;
  code?: unknown;
  address?: unknown;
  isDefault?: unknown;
  active?: unknown;
}

type Params = { id?: string };

const asStr = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const asInt = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

export default async function inventoryRoutes(fastify: FastifyInstance): Promise<void> {
  const read = [fastify.authenticate, fastify.authorize('inventory.read'), fastify.requireTenant];
  const write = [fastify.authenticate, fastify.authorize('inventory.manage'), fastify.requireTenant];

  // ── Productos ────────────────────────────────────────────────────────────
  fastify.get('/inventory/products', { preHandler: read }, async (request) => {
    const { categoryId, brandId, supplierId, search } = (request.query ?? {}) as {
      categoryId?: string;
      brandId?: string;
      supplierId?: string;
      search?: string;
    };
    const where: Record<string, unknown> = { ...(await resolveScope(fastify, request.tenant!)) };
    if (categoryId) where.categoryId = categoryId;
    if (brandId) where.brandId = brandId;
    if (supplierId) where.supplierId = supplierId;
    if (search?.trim()) {
      where.OR = [{ title: { contains: search.trim(), mode: 'insensitive' } }];
    }
    return fastify.prisma.product.findMany({
      where,
      include: { variants: true },
      orderBy: { title: 'asc' },
    });
  });

  fastify.post('/inventory/products', { preHandler: write }, async (request) => {
    const body = (request.body ?? {}) as ProductBody;
    const title = asStr(body.title);
    if (!title) throw new BadRequestError('El título es obligatorio');
    const price = asInt(body.price);
    if (!body.price || price < 0) throw new BadRequestError('El precio es obligatorio y no puede ser negativo');

    const organizationId = orgIdOf(request);
    const stock = asInt(body.stock);
    return fastify.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          organizationId,
          title,
          description: asStr(body.description),
          price,
          stock,
          categoryId: asStr(body.categoryId),
          brandId: asStr(body.brandId),
          supplierId: asStr(body.supplierId),
        },
      });
      const variant = await createImplicitVariant(
        tx,
        organizationId,
        product,
        { sku: asStr(body.sku) ?? undefined, barcode: asStr(body.barcode) ?? undefined, attributes: (body.attributes as Record<string, unknown>) ?? undefined },
        { quantity: stock, minQuantity: asInt(body.minQuantity), criticalQuantity: asInt(body.criticalQuantity) },
      );
      return { ...product, variants: [variant] };
    });
  });

  fastify.get('/inventory/products/:id', { preHandler: read }, async (request) => {
    const id = (request.params as Params).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const product = await fastify.prisma.product.findFirst({
      where: { id, ...scope },
      include: { variants: true },
    });
    if (!product) throw new NotFoundError('Producto no encontrado');
    return product;
  });

  fastify.patch('/inventory/products/:id', { preHandler: write }, async (request) => {
    const id = (request.params as Params).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const existing = await fastify.prisma.product.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundError('Producto no encontrado');

    const body = (request.body ?? {}) as ProductBody;
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const title = asStr(body.title);
      if (!title) throw new BadRequestError('El título es obligatorio');
      data.title = title;
    }
    if (body.description !== undefined) data.description = asStr(body.description);
    if (body.price !== undefined) data.price = asInt(body.price);
    if (body.stock !== undefined) data.stock = asInt(body.stock);
    if (body.categoryId !== undefined) data.categoryId = asStr(body.categoryId);
    if (body.brandId !== undefined) data.brandId = asStr(body.brandId);
    if (body.supplierId !== undefined) data.supplierId = asStr(body.supplierId);

    return fastify.prisma.product.update({ where: { id }, data, include: { variants: true } });
  });

  fastify.delete('/inventory/products/:id', { preHandler: write }, async (request) => {
    const id = (request.params as Params).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const existing = await fastify.prisma.product.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundError('Producto no encontrado');
    await fastify.prisma.product.delete({ where: { id } });
    return { ok: true };
  });

  // ── Variantes ────────────────────────────────────────────────────────────
  fastify.get('/inventory/products/:id/variants', { preHandler: read }, async (request) => {
    const id = (request.params as Params).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const product = await fastify.prisma.product.findFirst({ where: { id, ...scope } });
    if (!product) throw new NotFoundError('Producto no encontrado');
    return fastify.prisma.variant.findMany({ where: { productId: id, ...scope }, orderBy: { name: 'asc' } });
  });

  fastify.post('/inventory/products/:id/variants', { preHandler: write }, async (request) => {
    const productId = (request.params as Params).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const product = await fastify.prisma.product.findFirst({ where: { id: productId, ...scope } });
    if (!product) throw new NotFoundError('Producto no encontrado');

    const body = (request.body ?? {}) as VariantBody;
    const name = asStr(body.name) || product.title;
    const sku = asStr(body.sku);
    if (!sku) throw new BadRequestError('El SKU es obligatorio');
    const organizationId = orgIdOf(request);
    return fastify.prisma.$transaction(async (tx) => {
      const warehouse = await ensureDefaultWarehouse(tx, organizationId);
      try {
        const variant = await tx.variant.create({
          data: {
            organizationId,
            productId,
            sku,
            barcode: asStr(body.barcode),
            name,
            attributes: (body.attributes as object) ?? {},
          },
        });
        await tx.stockLevel.create({
          data: { organizationId, warehouseId: warehouse.id, productId, variantId: variant.id },
        });
        return variant;
      } catch (e) {
        if (isP2002(e)) throw new ConflictError('El SKU/código de barras ya existe en esta organización');
        throw e;
      }
    });
  });

  fastify.patch('/inventory/variants/:id', { preHandler: write }, async (request) => {
    const id = (request.params as Params).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const existing = await fastify.prisma.variant.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundError('Variante no encontrada');

    const body = (request.body ?? {}) as VariantBody;
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = asStr(body.name) ?? existing.name;
    if (body.sku !== undefined) data.sku = asStr(body.sku) ?? existing.sku;
    if (body.barcode !== undefined) data.barcode = asStr(body.barcode);
    if (body.attributes !== undefined) data.attributes = body.attributes as object;
    if (body.active !== undefined) data.active = Boolean(body.active);

    try {
      return await fastify.prisma.variant.update({ where: { id }, data });
    } catch (e) {
      if (isP2002(e)) throw new ConflictError('El SKU/código de barras ya existe en esta organización');
      throw e;
    }
  });

  fastify.delete('/inventory/variants/:id', { preHandler: write }, async (request) => {
    const id = (request.params as Params).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const existing = await fastify.prisma.variant.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundError('Variante no encontrada');
    await fastify.prisma.variant.delete({ where: { id } });
    return { ok: true };
  });

  // ── Categorías ───────────────────────────────────────────────────────────
  fastify.get('/inventory/categories', { preHandler: read }, async (request) => {
    const scope = await resolveScope(fastify, request.tenant!);
    return fastify.prisma.category.findMany({ where: scope, orderBy: { name: 'asc' } });
  });

  fastify.post('/inventory/categories', { preHandler: write }, async (request) => {
    const body = (request.body ?? {}) as CatalogBody;
    const name = asStr(body.name);
    if (!name) throw new BadRequestError('El nombre es obligatorio');
    return fastify.prisma.category.create({
      data: {
        organizationId: orgIdOf(request),
        name,
        parentId: asStr(body.parentId),
        active: body.active === false ? false : true,
      },
    });
  });

  fastify.patch('/inventory/categories/:id', { preHandler: write }, async (request) => {
    const id = (request.params as Params).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const existing = await fastify.prisma.category.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundError('Categoría no encontrada');
    const body = (request.body ?? {}) as CatalogBody;
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = asStr(body.name) ?? existing.name;
    if (body.parentId !== undefined) data.parentId = asStr(body.parentId);
    if (body.active !== undefined) data.active = Boolean(body.active);
    return fastify.prisma.category.update({ where: { id }, data });
  });

  fastify.delete('/inventory/categories/:id', { preHandler: write }, async (request) => {
    const id = (request.params as Params).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const existing = await fastify.prisma.category.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundError('Categoría no encontrada');
    await fastify.prisma.category.delete({ where: { id } });
    return { ok: true };
  });

  // ── Marcas ───────────────────────────────────────────────────────────────
  fastify.get('/inventory/brands', { preHandler: read }, async (request) => {
    const scope = await resolveScope(fastify, request.tenant!);
    return fastify.prisma.brand.findMany({ where: scope, orderBy: { name: 'asc' } });
  });

  fastify.post('/inventory/brands', { preHandler: write }, async (request) => {
    const body = (request.body ?? {}) as CatalogBody;
    const name = asStr(body.name);
    if (!name) throw new BadRequestError('El nombre es obligatorio');
    return fastify.prisma.brand.create({
      data: { organizationId: orgIdOf(request), name, active: body.active === false ? false : true },
    });
  });

  fastify.patch('/inventory/brands/:id', { preHandler: write }, async (request) => {
    const id = (request.params as Params).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const existing = await fastify.prisma.brand.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundError('Marca no encontrada');
    const body = (request.body ?? {}) as CatalogBody;
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = asStr(body.name) ?? existing.name;
    if (body.active !== undefined) data.active = Boolean(body.active);
    return fastify.prisma.brand.update({ where: { id }, data });
  });

  fastify.delete('/inventory/brands/:id', { preHandler: write }, async (request) => {
    const id = (request.params as Params).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const existing = await fastify.prisma.brand.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundError('Marca no encontrada');
    await fastify.prisma.brand.delete({ where: { id } });
    return { ok: true };
  });

  // ── Proveedores ──────────────────────────────────────────────────────────
  fastify.get('/inventory/suppliers', { preHandler: read }, async (request) => {
    const scope = await resolveScope(fastify, request.tenant!);
    return fastify.prisma.supplier.findMany({ where: scope, orderBy: { name: 'asc' } });
  });

  fastify.post('/inventory/suppliers', { preHandler: write }, async (request) => {
    const body = (request.body ?? {}) as CatalogBody;
    const name = asStr(body.name);
    if (!name) throw new BadRequestError('El nombre es obligatorio');
    return fastify.prisma.supplier.create({
      data: {
        organizationId: orgIdOf(request),
        name,
        contactName: asStr(body.contactName),
        email: asStr(body.email),
        phone: asStr(body.phone),
        active: body.active === false ? false : true,
      },
    });
  });

  fastify.patch('/inventory/suppliers/:id', { preHandler: write }, async (request) => {
    const id = (request.params as Params).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const existing = await fastify.prisma.supplier.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundError('Proveedor no encontrado');
    const body = (request.body ?? {}) as CatalogBody;
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = asStr(body.name) ?? existing.name;
    if (body.contactName !== undefined) data.contactName = asStr(body.contactName);
    if (body.email !== undefined) data.email = asStr(body.email);
    if (body.phone !== undefined) data.phone = asStr(body.phone);
    if (body.active !== undefined) data.active = Boolean(body.active);
    return fastify.prisma.supplier.update({ where: { id }, data });
  });

  fastify.delete('/inventory/suppliers/:id', { preHandler: write }, async (request) => {
    const id = (request.params as Params).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const existing = await fastify.prisma.supplier.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundError('Proveedor no encontrado');
    await fastify.prisma.supplier.delete({ where: { id } });
    return { ok: true };
  });

  // ── Almacenes ────────────────────────────────────────────────────────────
  fastify.get('/inventory/warehouses', { preHandler: read }, async (request) => {
    const scope = await resolveScope(fastify, request.tenant!);
    return fastify.prisma.warehouse.findMany({ where: scope, orderBy: { name: 'asc' } });
  });

  fastify.post('/inventory/warehouses', { preHandler: write }, async (request) => {
    const body = (request.body ?? {}) as WarehouseBody;
    const name = asStr(body.name);
    if (!name) throw new BadRequestError('El nombre es obligatorio');
    const code = asStr(body.code);
    if (!code) throw new BadRequestError('El código es obligatorio');
    return fastify.prisma.warehouse.create({
      data: {
        organizationId: orgIdOf(request),
        name,
        code,
        address: asStr(body.address),
        isDefault: body.isDefault === true,
        active: body.active === false ? false : true,
      },
    });
  });

  fastify.patch('/inventory/warehouses/:id', { preHandler: write }, async (request) => {
    const id = (request.params as Params).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const existing = await fastify.prisma.warehouse.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundError('Almacén no encontrado');
    const body = (request.body ?? {}) as WarehouseBody;
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = asStr(body.name) ?? existing.name;
    if (body.code !== undefined) data.code = asStr(body.code) ?? existing.code;
    if (body.address !== undefined) data.address = asStr(body.address);
    if (body.isDefault !== undefined) data.isDefault = Boolean(body.isDefault);
    if (body.active !== undefined) data.active = Boolean(body.active);
    return fastify.prisma.warehouse.update({ where: { id }, data });
  });

  fastify.delete('/inventory/warehouses/:id', { preHandler: write }, async (request) => {
    const id = (request.params as Params).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const existing = await fastify.prisma.warehouse.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundError('Almacén no encontrado');
    await fastify.prisma.warehouse.delete({ where: { id } });
    return { ok: true };
  });

  // ── Niveles de stock ─────────────────────────────────────────────────────
  fastify.get('/inventory/stock', { preHandler: read }, async (request) => {
    const { warehouseId, productId } = (request.query ?? {}) as { warehouseId?: string; productId?: string };
    const where: Record<string, unknown> = { ...(await resolveScope(fastify, request.tenant!)) };
    if (warehouseId) where.warehouseId = warehouseId;
    if (productId) where.productId = productId;
    return fastify.prisma.stockLevel.findMany({
      where,
      include: { product: { select: { id: true, title: true } }, variant: { select: { id: true, name: true, sku: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  });
}
