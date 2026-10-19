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
    // Métricas de negocio
    // ------------------------------------------------------------------
    fastify.get('/summary', async () => {
      const [revenueAgg, totalPayments, totalUsers, totalOrders] = await Promise.all([
        db.payment.aggregate({ where: { status: 'approved' }, _sum: { amount: true } }),
        db.payment.count(),
        db.user.count(),
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
      const { query } = request as { query?: { days?: string } };
      const days = Math.max(1, Number(query?.days ?? 30));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const payments = await db.payment.findMany({
        where: { status: 'approved', createdAt: { gte: since } },
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

    fastify.get('/top-products', async () => {
      return db.product.findMany({ orderBy: [{ stock: 'desc' }, { title: 'asc' }], take: 5 });
    });
  },
});
