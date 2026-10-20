import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * suscripciones — servidor.
 *
 * UNIFICADO con "Planes/Membresías": usa `MembershipPlan` (planes) y
 * `Membership` (suscripción) — el mismo modelo que el gimnasio multi-sucursal.
 * Así, una suscripción pertenece a una organización/sucursal (organizationId).
 *
 * Rutas bajo `/api/v1/blocks/suscripciones`:
 *  - GET  /plans                       → planes activos (membershipPlan)
 *  - GET  /subscriptions?userId=&organizationId= → suscripciones (membership)
 *  - GET  /my?userId=                  → suscripción activa del usuario (o null)
 *  - POST /subscribe {userId, planId, organizationId?} (auth) → contrata un plan
 *  - PATCH /subscriptions/:id {status} (auth) → cancela/reactiva
 *  - DELETE /subscriptions/:id         (auth)
 */
export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    const currency = String(config.currency ?? 'ARS');
    const requirePayment = Boolean(config.requirePayment);

    // Planes activos (los define el admin, compartidos por todas las sucursales).
    fastify.get('/plans', async () => db.membershipPlan.findMany({ where: { active: true } }));

    // Suscripciones (membership) de un usuario, opcionalmente filtradas por sucursal.
    fastify.get('/subscriptions', async (request: unknown) => {
      const { query } = request as { query?: { userId?: string; organizationId?: string } };
      const where: Record<string, unknown> = {};
      if (query?.userId) where.userId = query.userId;
      if (query?.organizationId) where.organizationId = query.organizationId;
      return db.membership.findMany({ where, orderBy: { createdAt: 'desc' } });
    });

    // Suscripción activa de un usuario (o null).
    fastify.get('/my', async (request: unknown) => {
      const { query } = request as { query?: { userId?: string } };
      const userId = query?.userId ?? '';
      if (!userId) return null;
      return db.membership.findFirst({
        where: { userId, status: 'active' },
        orderBy: { createdAt: 'desc' },
      });
    });

    // Contratar un plan (crea una Membership en una sucursal).
    //
    // TODO(pagos): cuando `config.requirePayment` es true, el cobro todavía NO se
    // integra. Flujo pendiente de implementar:
    //   1) Llamar `POST /api/v1/payments/checkout` con `{ provider, amount:
    //      plan.price, currency, description, externalReference:
    //      'suscripcion-<planId>-<userId>' }` para crear el `Payment`.
    //   2) Crear la Membership con `status: 'pending'` (no 'active') y guardar el
    //      `payment.id` devuelto para reconciliar.
    //   3) Al recibir el webhook `payment.approved`, activar la Membership.
    // Por ahora se crea la suscripción activa y se devuelve `requirePayment: true`
    // para que el frontend muestre "Este plan requiere pago".
    fastify.post('/subscribe', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: { userId?: string; planId?: string; organizationId?: string } };
      const userId = body?.userId ?? '';
      const planId = body?.planId ?? '';
      if (!userId) return { ok: false, error: 'userId es requerido' };
      if (!planId) return { ok: false, error: 'planId es requerido' };

      const plan = await db.membershipPlan.findUnique({ where: { id: planId } });
      if (!plan) return { ok: false, error: 'Plan no encontrado' };

      // Sucursal: la indicada o la primera disponible (por defecto).
      let organizationId = body?.organizationId ?? '';
      if (!organizationId) {
        const first = await db.organization.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } });
        organizationId = (first as { id?: string } | null)?.id ?? '';
      }
      if (!organizationId) return { ok: false, error: 'No hay una sucursal disponible' };

      const durationDays = Number(plan.durationDays) || 0;
      const endDate = durationDays > 0 ? new Date(Date.now() + durationDays * DAY_MS) : null;

      const membership = await db.membership.create({
        data: {
          organizationId,
          userId,
          role: 'member',
          plan: plan.name,
          status: 'active',
          endDate,
        },
      });

      return { ok: true, subscription: membership, requirePayment, currency };
    });

    // Cancelar / reactivar una suscripción.
    fastify.patch('/subscriptions/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { status?: string } };
      if (!params?.id) return { ok: false, error: 'id es requerido' };
      const membership = await db.membership.update({
        where: { id: params.id },
        data: { status: body?.status ?? 'active' },
      });
      return { ok: true, subscription: membership };
    });

    // Eliminar una suscripción.
    fastify.delete('/subscriptions/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      if (!params?.id) return { ok: false, error: 'id es requerido' };
      await db.membership.delete({ where: { id: params.id } });
      return { ok: true };
    });
  },
});
