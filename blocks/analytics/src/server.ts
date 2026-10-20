import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import * as analytics from '../../../apps/api/src/integrations/analytics';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

// Referencia: contador en memoria. En producción usar una tabla persistente.
const pages = new Map<string, number>();
let total = 0;

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as Record<string, unknown>;
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    // ------------------------------------------------------------------
    // Tracking de visitas (referencia, en memoria)
    // ------------------------------------------------------------------
    fastify.post('/track', async (request: unknown) => {
      const { body } = request as { body?: { path?: string } };
      const path = body?.path ?? '/';
      pages.set(path, (pages.get(path) ?? 0) + 1);
      total += 1;
      // Fire-and-forget al proveedor configurado (GA4 / Plausible / Matomo).
      // Con `internal` (default) o sin credenciales es un no-op.
      const provider = String(cfg.provider ?? 'internal');
      void analytics.track(provider, cfg, { name: 'page_view', url: path, params: { path } });
      return { ok: true };
    });

    fastify.get('/stats', async () => ({
      total,
      pages: [...pages.entries()].map(([path, views]) => ({ path, views })),
    }));

    // ------------------------------------------------------------------
    // Métricas de negocio (multi-sucursal)
    // ------------------------------------------------------------------
    // Soporte multi-sucursal: el parámetro opcional `organizationId` filtra las
    // métricas por sucursal (Organization). Sin `organizationId` se devuelve el
    // agregado global (lo que corresponde a la sede central / super_admin).
    //
    // Heurística de pertenencia de un pago a una organización:
    //   1. `payment.metadata.organizationId` === organizationId, cuando el
    //      bloque de pagos persiste la sucursal en el JSON de metadatos; o
    //   2. el `userId` del pago tiene una `membership` en esa organización.
    //
    // Nota (límites del modelo actual):
    //   - `Order` no tiene `organizationId` ni `userId`, por lo que `totalOrders`
    //     permanece global (no se puede filtrar por sucursal hoy).
    //   - `Product` tampoco tiene organización; se filtra indirectamente vía
    //     `InventoryItem.productId` (productos que esa sucursal tiene en inventario).
    interface OrgScope {
      userIds: string[];
      paymentFilter?: Record<string, unknown>;
    }

    const resolveOrgScope = async (organizationId?: string): Promise<OrgScope | null> => {
      if (!organizationId) return null;
      const memberships = await db.membership.findMany({
        where: { organizationId },
        select: { userId: true },
      });
      const userIds = [
        ...new Set((memberships as Array<{ userId: string }>).map((m) => m.userId)),
      ];
      const or: Record<string, unknown>[] = [
        { metadata: { path: ['organizationId'], equals: organizationId } },
      ];
      if (userIds.length > 0) or.push({ userId: { in: userIds } });
      return { userIds, paymentFilter: { OR: or } };
    };

    fastify.get('/summary', async (request: unknown) => {
      const { query } = request as { query?: { organizationId?: string } };
      const scope = await resolveOrgScope(query?.organizationId);
      const paymentWhere: Record<string, unknown> = {
        status: 'approved',
        ...(scope?.paymentFilter ?? {}),
      };
      const [revenueAgg, totalPayments, totalUsers, totalOrders] = await Promise.all([
        db.payment.aggregate({ where: paymentWhere, _sum: { amount: true } }),
        db.payment.count({ where: scope?.paymentFilter ?? {} }),
        // Usuarios de la sucursal: miembros con `membership` en esa organización.
        scope ? scope.userIds.length : db.user.count(),
        // Órdenes: sin vínculo con organización en el modelo, queda global.
        db.order.count(),
      ]);
      return {
        approvedRevenue: revenueAgg._sum?.amount ?? 0,
        totalPayments,
        totalUsers,
        totalOrders,
      };
    });

    fastify.get('/revenue', async (request: unknown) => {
      const { query } = request as { query?: { days?: string; organizationId?: string } };
      const days = Math.max(1, Number(query?.days ?? 30));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const scope = await resolveOrgScope(query?.organizationId);
      const payments = await db.payment.findMany({
        where: {
          status: 'approved',
          createdAt: { gte: since },
          ...(scope?.paymentFilter ?? {}),
        },
        orderBy: { createdAt: 'asc' },
      });
      const byDay = new Map<string, number>();
      for (const p of payments as Array<{ amount: number; createdAt: Date }>) {
        const key = new Date(p.createdAt).toISOString().slice(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + Number(p.amount));
      }
      const series = [...byDay.entries()]
        .map(([day, amount]) => ({ day, amount }))
        .sort((a, b) => a.day.localeCompare(b.day));
      return { days, series };
    });

    fastify.get('/top-products', async (request: unknown) => {
      const { query } = request as { query?: { organizationId?: string } };
      const organizationId = query?.organizationId;
      if (!organizationId) {
        return db.product.findMany({ orderBy: [{ stock: 'desc' }, { title: 'asc' }], take: 5 });
      }
      // Productos asociados a la sucursal vía InventoryItem.productId.
      const items = await db.inventoryItem.findMany({
        where: { organizationId, productId: { not: null } },
        select: { productId: true },
      });
      const productIds = [
        ...new Set(
          (items as Array<{ productId: string | null }>)
            .map((i) => i.productId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (productIds.length === 0) return [];
      return db.product.findMany({
        where: { id: { in: productIds } },
        orderBy: [{ stock: 'desc' }, { title: 'asc' }],
        take: 5,
      });
    });
  },
});
