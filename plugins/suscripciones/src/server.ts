import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import { createCheckoutPayment } from '../../../apps/api/src/modules/payments/service';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * suscripciones — servidor.
 *
 * UNIFICADO con "Planes/Membresías": usa `MembershipPlan` (planes) y
 * `Membership` (suscripción) — el mismo modelo que el gimnasio multi-sucursal.
 * Una suscripción pertenece a una organización/sucursal (organizationId).
 *
 * Rutas bajo `/api/v1/plugins/suscripciones`:
 *  - GET  /plans                       → planes activos (membershipPlan)
 *  - GET  /subscriptions?userId=&organizationId= → suscripciones (membership)
 *  - GET  /my?userId=                  → suscripción activa del usuario (o null)
 *  - POST /subscribe {userId, planId, organizationId?} (auth) → contrata un plan
 *  - PATCH /subscriptions/:id {status} (auth) → cancela/reactiva
 *  - DELETE /subscriptions/:id         (auth)
 *
 * Pago (ADR-0015): con `requirePayment=true` y plan de precio > 0, `POST
 * /subscribe` crea la Membership en `status:'pending'` y orquesta una intención
 * de pago vía `createCheckoutPayment` (contrato único `POST /payments/checkout`).
 * Al recibir `payment.approved` (webhook o mark-paid), el suscriptor activa la
 * Membership correspondiente.
 */
export default definePlugin(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;
    const events = (
      fastify as unknown as {
        events?: { on?: (event: string, handler: (payload: unknown) => Promise<void> | void) => void };
      }
    ).events;

    // Fix config-freeze (t183): la config se lee FRESCA en cada request vía
    // `fastify.getPluginConfig(id)` (defaults del manifest + overrides de settings),
    // en vez del snapshot capturado al boot. Fallback al snapshot si falta el decorador.
    const getPluginConfig = (fastify as unknown as {
      getPluginConfig?: (pluginId: string) => Promise<Record<string, unknown>>;
    }).getPluginConfig;
    const resolveConfig = async (): Promise<Record<string, unknown>> => {
      if (getPluginConfig) {
        try {
          return await getPluginConfig(manifest.id);
        } catch {
          // fallback al snapshot de boot
        }
      }
      return config;
    };

    // Activa la suscripción (membership) cuando se aprueba su pago.
    // El `metadata.kind === 'subscription'` + `metadata.membershipId` se fijan en
    // `POST /subscribe`; así la activación es idempotente y no depende del formato
    // del `externalReference`.
    events?.on?.('payment.approved', async (payload) => {
      const { payment } = payload as { payment?: { id?: string } };
      if (!payment?.id) return;
      const paid = await db.payment.findUnique({ where: { id: payment.id } });
      const meta = (paid?.metadata ?? {}) as { kind?: string; membershipId?: string };
      if (meta.kind !== 'subscription' || !meta.membershipId) return;
      await db.membership.updateMany({
        where: { id: meta.membershipId, status: 'pending' },
        data: { status: 'active' },
      });
    });

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
    fastify.post('/subscribe', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: { userId?: string; planId?: string; organizationId?: string } };
      const userId = body?.userId ?? '';
      const planId = body?.planId ?? '';
      if (!userId) return { ok: false, error: 'userId es requerido' };
      if (!planId) return { ok: false, error: 'planId es requerido' };

      // Config leída en tiempo de request (requirePayment/currency/provider).
      const cfg = await resolveConfig();
      const currency = String(cfg.currency ?? 'ARS');
      const requirePayment = Boolean(cfg.requirePayment);
      const paymentProvider = String(cfg.paymentProvider ?? 'mercadopago');

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
      const price = Math.max(0, Math.floor(Number(plan.price) || 0));

      if (requirePayment && price > 0) {
        // 1) Membership pendiente (se activa al aprobarse el pago).
        const membership = await db.membership.create({
          data: {
            organizationId,
            userId,
            role: 'member',
            plan: plan.name,
            status: 'pending',
            endDate,
          },
        });

        // 2) Intención de pago (contrato único de checkout, ADR-0015).
        try {
          const payment = await createCheckoutPayment(
            fastify as unknown as Parameters<typeof createCheckoutPayment>[0],
            {
              provider: paymentProvider,
              amount: price,
              currency,
              description: `Suscripción ${plan.name}`,
              externalReference: membership.id,
              metadata: { kind: 'subscription', membershipId: membership.id, planId, userId },
              organizationId,
              userId,
            },
          );
          return { ok: true, subscription: membership, payment, requirePayment: true, currency };
        } catch (err) {
          return {
            ok: false,
            error: 'No se pudo iniciar el pago',
            detail: String((err as Error)?.message ?? err),
            subscription: membership,
          };
        }
      }

      // Sin cobro (plan gratuito o requirePayment=false): suscripción activa.
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

      return { ok: true, subscription: membership, requirePayment: false, currency };
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
