import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { BadRequestError, NotFoundError } from '@webs/core';
import { DEFAULT_ORG_ID, resolveScope } from '../../lib/tenant';

/**
 * Operaciones de stock (M9 — ADR-0023 §4–§7): movimientos (entrada/salida/
 * ajuste/transferencia) sobre un ledger inmutable `StockMovement`, valoración a
 * costo promedio ponderado (base) + capas FIFO opcionales (`InventoryLot`),
 * alertas por umbral, reportes y CSV. Todo scoped fail-closed por `organizationId`.
 *
 * Registrado bajo `/api/v1/inventory/*` (prefijo en app.ts).
 */

type Tx = Prisma.TransactionClient;
type MovementType = 'entrada' | 'salida' | 'ajuste' | 'transferencia';

const orgIdOf = (request: { tenant?: { organizationId?: string | null } }): string =>
  request.tenant?.organizationId ?? DEFAULT_ORG_ID;

const asInt = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const asStr = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Re-sincroniza el agregado denormalizado `Product.stock = Σ StockLevel` del scope. */
async function recomputeProductStock(tx: Tx, organizationId: string, productId: string): Promise<void> {
  const agg = await tx.stockLevel.aggregate({
    where: { organizationId, productId },
    _sum: { quantity: true },
  });
  await tx.product.updateMany({
    where: { id: productId },
    data: { stock: agg._sum.quantity ?? 0 },
  });
}

/** Consume capas FIFO (más antigua primero) hasta cubrir `qty`. */
async function consumeFifoLots(tx: Tx, stockLevelId: string, qty: number): Promise<void> {
  const lots = await tx.inventoryLot.findMany({
    where: { stockLevelId, quantity: { gt: 0 } },
    orderBy: { receivedAt: 'asc' },
  });
  let remaining = qty;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.quantity, remaining);
    await tx.inventoryLot.update({ where: { id: lot.id }, data: { quantity: lot.quantity - take } });
    remaining -= take;
  }
}

interface MovementInput {
  organizationId: string;
  warehouseId: string;
  productId: string;
  variantId?: string | null;
  type: MovementType;
  delta: number; // con signo: + entrada, - salida
  reason?: string | null;
  userId: string;
  referenceType?: string | null;
  referenceId?: string | null;
  unitCost?: number | null;
  fifo?: boolean;
}

/** Resuelve la variante implícita del producto cuando no se indica variantId (F1). */
async function resolveVariantId(
  tx: Tx,
  organizationId: string,
  productId: string,
  variantId: string | null | undefined,
): Promise<string | null> {
  if (variantId) return variantId;
  const variant = await tx.variant.findFirst({
    where: { organizationId, productId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return variant?.id ?? null;
}

/** Devuelve el nivel de stock existente o lo crea (quantity 0) — usado en transfer. */
async function ensureStockLevel(
  tx: Tx,
  input: { organizationId: string; warehouseId: string; productId: string; variantId: string | null },
) {
  const existing = await tx.stockLevel.findFirst({
    where: {
      organizationId: input.organizationId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId: input.variantId,
    },
  });
  if (existing) return existing;
  return tx.stockLevel.create({
    data: {
      organizationId: input.organizationId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId: input.variantId,
      quantity: 0,
      minQuantity: 0,
      criticalQuantity: 0,
      averageCost: 0,
    },
  });
}

/** Núcleo del movimiento: valida, escribe ledger, actualiza nivel + agregado. */
async function recordMovement(tx: Tx, input: MovementInput) {
  const variantId = await resolveVariantId(tx, input.organizationId, input.productId, input.variantId);
  const stockLevel = await tx.stockLevel.findFirst({
    where: {
      organizationId: input.organizationId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId,
    },
  });
  if (!stockLevel) throw new NotFoundError('Nivel de stock no encontrado');

  const before = stockLevel.quantity;
  const after = before + input.delta;
  if (after < 0) throw new BadRequestError('Stock insuficiente para la operación');

  // Valoración: costo promedio ponderado en cada entrada con costo.
  let averageCost = stockLevel.averageCost;
  if (input.delta > 0 && input.unitCost && input.unitCost > 0) {
    const totalBefore = before * stockLevel.averageCost;
    const totalIn = input.delta * input.unitCost;
    averageCost = Math.round((totalBefore + totalIn) / after);
  }

  await tx.stockMovement.create({
    data: {
      organizationId: input.organizationId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId,
      type: input.type,
      quantity: input.delta,
      quantityBefore: before,
      quantityAfter: after,
      reason: input.reason ?? null,
      userId: input.userId,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      unitCost: input.unitCost ?? null,
    },
  });

  await tx.stockLevel.update({ where: { id: stockLevel.id }, data: { quantity: after, averageCost } });

  if (input.fifo) {
    if (input.delta > 0 && input.unitCost && input.unitCost > 0) {
      await tx.inventoryLot.create({
        data: { stockLevelId: stockLevel.id, quantity: input.delta, unitCost: input.unitCost },
      });
    } else if (input.delta < 0) {
      await consumeFifoLots(tx, stockLevel.id, -input.delta);
    }
  }

  await recomputeProductStock(tx, input.organizationId, input.productId);
  return { quantityBefore: before, quantityAfter: after, averageCost };
}

/** Serializa un array de objetos a CSV (header + filas, escaping RFC-4180 básico). */
function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => esc(row[h])).join(','));
  return lines.join('\n');
}

/** Parseo mínimo de CSV (header + filas), tolera BOM y CRLF. */
function parseCsv(text: string): Array<Record<string, string>> {
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

interface StockOpBody {
  warehouseId?: unknown;
  productId?: unknown;
  variantId?: unknown;
  quantity?: unknown;
  delta?: unknown;
  unitCost?: unknown;
  reason?: unknown;
  referenceType?: unknown;
  fromWarehouseId?: unknown;
  toWarehouseId?: unknown;
  fifo?: unknown;
}

export default async function stockRoutes(fastify: FastifyInstance): Promise<void> {
  const read = [fastify.authenticate, fastify.authorize('inventory.read'), fastify.requireTenant];
  const write = [fastify.authenticate, fastify.authorize('inventory.manage'), fastify.requireTenant];

  // ── Movimientos ─────────────────────────────────────────────────────────
  fastify.post('/inventory/stock/receive', { preHandler: write }, async (request) => {
    const body = (request.body ?? {}) as StockOpBody;
    const organizationId = orgIdOf(request);
    const warehouseId = asStr(body.warehouseId);
    const productId = asStr(body.productId);
    const quantity = asInt(body.quantity);
    if (!warehouseId || !productId) throw new BadRequestError('warehouseId y productId son obligatorios');
    if (quantity <= 0) throw new BadRequestError('La cantidad de entrada debe ser positiva');

    const result = await fastify.prisma.$transaction((tx) =>
      recordMovement(tx, {
        organizationId,
        warehouseId,
        productId,
        variantId: asStr(body.variantId),
        type: 'entrada',
        delta: quantity,
        reason: asStr(body.reason),
        userId: request.user.sub,
        referenceType: asStr(body.referenceType) ?? 'compra',
        referenceId: null,
        unitCost: asInt(body.unitCost),
        fifo: body.fifo === true,
      }),
    );
    return { ok: true, ...result };
  });

  fastify.post('/inventory/stock/issue', { preHandler: write }, async (request) => {
    const body = (request.body ?? {}) as StockOpBody;
    const organizationId = orgIdOf(request);
    const warehouseId = asStr(body.warehouseId);
    const productId = asStr(body.productId);
    const quantity = asInt(body.quantity);
    if (!warehouseId || !productId) throw new BadRequestError('warehouseId y productId son obligatorios');
    if (quantity <= 0) throw new BadRequestError('La cantidad de salida debe ser positiva');

    const result = await fastify.prisma.$transaction((tx) =>
      recordMovement(tx, {
        organizationId,
        warehouseId,
        productId,
        variantId: asStr(body.variantId),
        type: 'salida',
        delta: -quantity,
        reason: asStr(body.reason),
        userId: request.user.sub,
        referenceType: asStr(body.referenceType) ?? 'venta',
        referenceId: null,
        unitCost: null,
        fifo: body.fifo === true,
      }),
    );
    return { ok: true, ...result };
  });

  fastify.post('/inventory/stock/adjust', { preHandler: write }, async (request) => {
    const body = (request.body ?? {}) as StockOpBody;
    const organizationId = orgIdOf(request);
    const warehouseId = asStr(body.warehouseId);
    const productId = asStr(body.productId);
    const variantId = asStr(body.variantId);
    if (!warehouseId || !productId) throw new BadRequestError('warehouseId y productId son obligatorios');
    const reason = asStr(body.reason);
    if (!reason) throw new BadRequestError('El motivo es obligatorio en un ajuste');

    const result = await fastify.prisma.$transaction(async (tx) => {
      const resolvedVariantId = await resolveVariantId(tx, organizationId, productId, variantId);
      const stockLevel = await tx.stockLevel.findFirst({
        where: { organizationId, warehouseId, productId, variantId: resolvedVariantId },
      });
      if (!stockLevel) throw new NotFoundError('Nivel de stock no encontrado');

      // `quantity` = objetivo absoluto; `delta` = ajuste relativo.
      let target: number;
      if (body.delta !== undefined) {
        target = stockLevel.quantity + asInt(body.delta);
      } else if (body.quantity !== undefined) {
        target = asInt(body.quantity);
      } else {
        throw new BadRequestError('Indicá `quantity` (objetivo) o `delta` (relativo)');
      }
      if (target < 0) throw new BadRequestError('El stock no puede quedar negativo');

      return recordMovement(tx, {
        organizationId,
        warehouseId,
        productId,
        variantId: resolvedVariantId,
        type: 'ajuste',
        delta: target - stockLevel.quantity,
        reason,
        userId: request.user.sub,
        referenceType: 'ajuste',
        referenceId: null,
        unitCost: null,
      });
    });
    return { ok: true, ...result };
  });

  fastify.post('/inventory/stock/transfer', { preHandler: write }, async (request) => {
    const body = (request.body ?? {}) as StockOpBody;
    const organizationId = orgIdOf(request);
    const fromWarehouseId = asStr(body.fromWarehouseId);
    const toWarehouseId = asStr(body.toWarehouseId);
    const productId = asStr(body.productId);
    const variantId = asStr(body.variantId);
    const quantity = asInt(body.quantity);
    if (!fromWarehouseId || !toWarehouseId || !productId) throw new BadRequestError('fromWarehouseId, toWarehouseId y productId son obligatorios');
    if (fromWarehouseId === toWarehouseId) throw new BadRequestError('Origen y destino deben ser distintos');
    if (quantity <= 0) throw new BadRequestError('La cantidad de transferencia debe ser positiva');

    const referenceId = `trf-${crypto.randomUUID()}`;
    const result = await fastify.prisma.$transaction(async (tx) => {
      const resolvedVariantId = await resolveVariantId(tx, organizationId, productId, variantId);
      // F2: crea el nivel de stock del almacén destino si no existe.
      await ensureStockLevel(tx, { organizationId, warehouseId: toWarehouseId, productId, variantId: resolvedVariantId });
      await recordMovement(tx, {
        organizationId,
        warehouseId: fromWarehouseId,
        productId,
        variantId: resolvedVariantId,
        type: 'salida',
        delta: -quantity,
        reason: asStr(body.reason),
        userId: request.user.sub,
        referenceType: 'transferencia',
        referenceId,
        unitCost: null,
      });
      return recordMovement(tx, {
        organizationId,
        warehouseId: toWarehouseId,
        productId,
        variantId: resolvedVariantId,
        type: 'entrada',
        delta: quantity,
        reason: asStr(body.reason),
        userId: request.user.sub,
        referenceType: 'transferencia',
        referenceId,
        unitCost: null,
      });
    });
    return { ok: true, referenceId, ...result };
  });

  // ── Ledger (solo lectura) ──────────────────────────────────────────────
  fastify.get('/inventory/movements', { preHandler: read }, async (request) => {
    const scope = await resolveScope(fastify, request.tenant!);
    const query = (request.query ?? {}) as { warehouseId?: string; type?: string; from?: string; to?: string };
    const where: Record<string, unknown> = { ...scope };
    if (query.warehouseId) where.warehouseId = query.warehouseId;
    if (query.type) where.type = query.type;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) (where.createdAt as Record<string, unknown>).gte = new Date(query.from);
      if (query.to) (where.createdAt as Record<string, unknown>).lte = new Date(query.to);
    }
    return fastify.prisma.stockMovement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
  });

  fastify.get('/inventory/movements/:id', { preHandler: read }, async (request) => {
    const id = (request.params as { id?: string }).id ?? '';
    const scope = await resolveScope(fastify, request.tenant!);
    const movement = await fastify.prisma.stockMovement.findFirst({ where: { id, ...scope } });
    if (!movement) throw new NotFoundError('Movimiento no encontrado');
    return movement;
  });

  // ── Alertas de stock bajo ───────────────────────────────────────────────
  fastify.get('/inventory/alerts', { preHandler: read }, async (request) => {
    const scope = await resolveScope(fastify, request.tenant!);
    const levels = await fastify.prisma.stockLevel.findMany({
      where: { ...scope, OR: [{ quantity: { lte: fastify.prisma.stockLevel.fields.criticalQuantity } }, { quantity: { lte: fastify.prisma.stockLevel.fields.minQuantity } }] },
      include: { product: { select: { id: true, title: true } }, variant: { select: { id: true, sku: true, name: true } }, warehouse: { select: { id: true, name: true, code: true } } },
    });
    return levels.map((l) => ({
      id: l.id,
      productId: l.productId,
      variantId: l.variantId,
      warehouseId: l.warehouseId,
      quantity: l.quantity,
      minQuantity: l.minQuantity,
      criticalQuantity: l.criticalQuantity,
      level: l.quantity <= l.criticalQuantity ? 'critico' : 'bajo',
    }));
  });

  // ── Reportes ────────────────────────────────────────────────────────────
  fastify.get('/inventory/reports/stock-levels', { preHandler: read }, async (request) => {
    const scope = await resolveScope(fastify, request.tenant!);
    const query = (request.query ?? {}) as { warehouseId?: string };
    const where: Record<string, unknown> = { ...scope };
    if (query.warehouseId) where.warehouseId = query.warehouseId;
    return fastify.prisma.stockLevel.findMany({
      where,
      include: { product: { select: { id: true, title: true } }, variant: { select: { id: true, sku: true, name: true } }, warehouse: { select: { id: true, name: true, code: true } } },
      orderBy: { productId: 'asc' },
    });
  });

  fastify.get('/inventory/reports/movements', { preHandler: read }, async (request) => {
    const scope = await resolveScope(fastify, request.tenant!);
    const query = (request.query ?? {}) as { from?: string; to?: string };
    const where: Record<string, unknown> = { ...scope };
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) (where.createdAt as Record<string, unknown>).gte = new Date(query.from);
      if (query.to) (where.createdAt as Record<string, unknown>).lte = new Date(query.to);
    }
    return fastify.prisma.stockMovement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 1000 });
  });

  fastify.get('/inventory/reports/valuation', { preHandler: read }, async (request) => {
    const scope = await resolveScope(fastify, request.tenant!);
    const levels = await fastify.prisma.stockLevel.findMany({
      where: { ...scope, quantity: { gt: 0 } },
      include: { product: { select: { id: true, title: true } } },
    });
    const lines = levels.map((l) => ({
      productId: l.productId,
      title: l.product.title,
      warehouseId: l.warehouseId,
      quantity: l.quantity,
      averageCost: l.averageCost,
      value: l.quantity * l.averageCost,
    }));
    const totalValue = lines.reduce((s, l) => s + l.value, 0);
    const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0);
    return { lines, totalValue, totalQuantity };
  });

  // ── CSV ────────────────────────────────────────────────────────────────
  fastify.get('/inventory/export.csv', { preHandler: read }, async (request, reply) => {
    const scope = await resolveScope(fastify, request.tenant!);
    const query = (request.query ?? {}) as { type?: string };
    let csv: string;
    if (query.type === 'movements') {
      const movements = await fastify.prisma.stockMovement.findMany({ where: scope, orderBy: { createdAt: 'desc' }, take: 1000 });
      csv = toCsv(
        movements.map((m) => ({
          id: m.id,
          type: m.type,
          warehouseId: m.warehouseId,
          productId: m.productId,
          variantId: m.variantId ?? '',
          quantity: m.quantity,
          quantityBefore: m.quantityBefore,
          quantityAfter: m.quantityAfter,
          reason: m.reason ?? '',
          referenceType: m.referenceType ?? '',
          referenceId: m.referenceId ?? '',
          unitCost: m.unitCost ?? '',
          createdAt: m.createdAt.toISOString(),
        })),
      );
    } else {
      const levels = await fastify.prisma.stockLevel.findMany({
        where: scope,
        include: { product: { select: { title: true } }, variant: { select: { sku: true } }, warehouse: { select: { code: true } } },
        orderBy: { productId: 'asc' },
      });
      csv = toCsv(
        levels.map((l) => ({
          productId: l.productId,
          title: l.product.title,
          sku: l.variant?.sku ?? '',
          warehouse: l.warehouse.code,
          quantity: l.quantity,
          minQuantity: l.minQuantity,
          criticalQuantity: l.criticalQuantity,
          averageCost: l.averageCost,
        })),
      );
    }
    return reply.type('text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="inventory.csv"').send(csv);
  });

  fastify.post('/inventory/import', { preHandler: write }, async (request) => {
    const body = (request.body ?? {}) as { csv?: unknown; fifo?: unknown };
    const csvText = asStr(body.csv);
    if (!csvText) throw new BadRequestError('Enviá el contenido CSV en el campo `csv`');
    const rows = parseCsv(csvText);
    if (rows.length === 0) throw new BadRequestError('CSV sin filas de datos (header + al menos 1 fila)');

    const organizationId = orgIdOf(request);
    const imported: string[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNumber = i + 2; // 1 = header
      const sku = row.sku;
      const warehouseCode = row.warehouse;
      const quantity = asInt(row.quantity);
      const unitCost = asInt(row.unitCost);
      if (!sku || !warehouseCode || quantity <= 0) {
        errors.push({ row: rowNumber, error: 'sku, warehouse y quantity>0 son obligatorios' });
        continue;
      }
      try {
        await fastify.prisma.$transaction(async (tx) => {
          const variant = await tx.variant.findFirst({ where: { organizationId, sku } });
          if (!variant) throw new BadRequestError(`SKU '${sku}' no encontrado`);
          const warehouse = await tx.warehouse.findFirst({ where: { organizationId, code: warehouseCode } });
          if (!warehouse) throw new BadRequestError(`Almacén '${warehouseCode}' no encontrado`);
          await recordMovement(tx, {
            organizationId,
            warehouseId: warehouse.id,
            productId: variant.productId,
            variantId: variant.id,
            type: 'entrada',
            delta: quantity,
            reason: 'Importación CSV',
            userId: request.user.sub,
            referenceType: 'compra',
            referenceId: null,
            unitCost: unitCost || null,
            fifo: body.fifo === true,
          });
        });
        imported.push(sku);
      } catch (e) {
        errors.push({ row: rowNumber, error: (e as Error).message ?? 'error' });
      }
    }
    return { imported: imported.length, skus: imported, errors };
  });
}
