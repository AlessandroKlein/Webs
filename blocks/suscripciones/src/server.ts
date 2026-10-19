import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * suscripciones — servidor.
 *
 * Planes de suscripción (con vencimiento y pago) bajo
 * `/api/v1/blocks/suscripciones`:
 *  - GET    /plans                    → planes activos (membershipPlan)
 *  - GET    /subscriptions?userId=    → suscripciones del usuario
 *  - GET    /my?userId=               → suscripción activa del usuario (o null)
 *  - POST   /subscribe {userId,planId} (auth) → contrata un plan
 *  - PATCH  /subscriptions/:id {status} (auth) → cancela/reactiva
 *  - DELETE /subscriptions/:id        (auth)
 */
export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    const currency = String(config.currency ?? 'ARS');
    const requirePayment = Boolean(config.requirePayment);

    // Planes activos.
    fastify.get('/plans', async () => db.membershipPlan.findMany({ where: { active: true } }));

    // Suscripciones de un usuario.
    fastify.get('/subscriptions', async (request: unknown) => {
      const { query } = request as { query?: { userId?: string } };
      const where: Record<string, unknown> = {};
      if (query?.userId) where.userId = query.userId;
      return db.subscription.findMany({ where, orderBy: { createdAt: 'desc' } });
    });

    // Suscripción activa de un usuario (o null).
    fastify.get('/my', async (request: unknown) => {
      const { query } = request as { query?: { userId?: string } };
      const userId = query?.userId ?? '';
      if (!userId) return null;
      return db.subscription.findFirst({
        where: { userId, status: 'active' },
        orderBy: { createdAt: 'desc' },
      });
    });

    // Contratar un plan.
    fastify.post('/subscribe', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: { userId?: string; planId?: string } };
      const userId = body?.userId ?? '';
      const planId = body?.planId ?? '';
      if (!userId) return { ok: false, error: 'userId es requerido' };
      if (!planId) return { ok: false, error: 'planId es requerido' };

      const plan = await db.membershipPlan.findUnique({ where: { id: planId } });
      if (!plan) return { ok: false, error: 'Plan no encontrado' };

      const durationDays = Number(plan.durationDays) || 0;
      const endDate = durationDays > 0 ? new Date(Date.now() + durationDays * DAY_MS) : null;

      const subscription = await db.subscription.create({
        data: {
          userId,
          planId: plan.id,
          planName: plan.name,
          status: 'active',
          endDate,
        },
      });

      return { ok: true, subscription, requirePayment, currency };
    });

    // Cancelar / reactivar una suscripción.
    fastify.patch('/subscriptions/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: { status?: string };
      };
      if (!params?.id) return { ok: false, error: 'id es requerido' };
      const subscription = await db.subscription.update({
        where: { id: params.id },
        data: { status: body?.status ?? 'active' },
      });
      return { ok: true, subscription };
    });

    // Eliminar una suscripción.
    fastify.delete('/subscriptions/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      if (!params?.id) return { ok: false, error: 'id es requerido' };
      await db.subscription.delete({ where: { id: params.id } });
      return { ok: true };
    });
  },
});
